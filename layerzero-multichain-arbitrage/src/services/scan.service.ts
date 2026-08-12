import { createHash } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AppConf } from '../constants';
import {
  AssetStatus,
  CrosschainAssetType,
  DeploymentScanStatus,
  TrustGrade,
} from '../config/enums';
import { AssetEntity } from '../database/entities/asset.entity';
import {
  DeploymentEntity,
  DeploymentEvidence,
} from '../database/entities/deployment.entity';
import {
  OFT_INTERFACE_ID,
  OftContractClient,
  addressFromBytes32,
  normalizeEvmAddress,
} from '../lib';
import type { OftChainConfig } from '../lib';

type ScanChainsConf = Record<string, OftChainConfig>;

interface OftMetadataDeployment {
  address: string;
  localDecimals?: number;
  type: string;
  [key: string]: unknown;
}

interface OftMetadataEntry {
  name: string;
  endpointVersion: string;
  sharedDecimals?: number;
  deployments: Record<string, OftMetadataDeployment>;
  [key: string]: unknown;
}

type OftMetadataResponse = Record<string, OftMetadataEntry[]>;

export interface ScanSummary {
  assets: number;
  deployments: number;
  verified: number;
  rejected: number;
  failed: number;
  unchanged: number;
  skipped: number;
}

export function classifyStandardOft(
  oftAddress: string,
  tokenAddress: string,
  approvalRequired: boolean,
): CrosschainAssetType | null {
  if (oftAddress.toLowerCase() === tokenAddress.toLowerCase()) {
    return approvalRequired ? null : CrosschainAssetType.DIRECT_OFT;
  }

  return approvalRequired ? CrosschainAssetType.OFT_ADAPTER : null;
}

@Injectable()
export class ScanService {
  private readonly logger = new Logger(ScanService.name);
  private readonly metadataUrl: string;
  private readonly scanChains: ScanChainsConf;
  private readonly contractClients: Record<string, OftContractClient>;
  private activeScan: Promise<ScanSummary> | null = null;

  constructor(
    @InjectRepository(AssetEntity)
    private readonly assetRepository: Repository<AssetEntity>,
    @InjectRepository(DeploymentEntity)
    private readonly deploymentRepository: Repository<DeploymentEntity>,
  ) {
    this.metadataUrl = AppConf.layerZero.oftMetadataUrl;
    this.scanChains = Object.fromEntries(
      Object.entries(AppConf.layerZero.chains).map(([chainName, chain]) => [
        chainName,
        { ...chain } satisfies OftChainConfig,
      ]),
    );
    const endpointIds = Object.values(this.scanChains).map(
      (chain) => chain.endpointId,
    );
    this.contractClients = Object.fromEntries(
      Object.entries(this.scanChains).map(([chainName, chain]) => [
        chainName,
        new OftContractClient(chain, endpointIds),
      ]),
    );
  }

  triggerScan(): boolean {
    if (this.activeScan) {
      this.logger.log(
        'OFT scan trigger ignored because a scan is already active',
      );
      return false;
    }

    void this.scan().catch(() => undefined);
    return true;
  }

  scan(): Promise<ScanSummary> {
    if (this.activeScan) {
      this.logger.log('OFT scan request joined the active scan');
      return this.activeScan;
    }

    const startedAt = Date.now();
    this.logger.log(
      `OFT scan started: chains=${Object.keys(this.scanChains).join(',')}`,
    );
    this.activeScan = this.executeScan(startedAt)
      .catch((error: unknown) => {
        this.logger.error(
          `OFT scan aborted after ${Date.now() - startedAt}ms: ${this.errorMessage(error)}`,
        );
        throw error;
      })
      .finally(() => {
        this.activeScan = null;
      });

    return this.activeScan;
  }

  private async executeScan(startedAt: number): Promise<ScanSummary> {
    const metadataStartedAt = Date.now();
    const metadata = await this.fetchMetadata();
    const targetDeploymentCount = this.countTargetDeployments(metadata);
    this.logger.log(
      `LayerZero metadata loaded: symbols=${Object.keys(metadata).length}, targetDeployments=${targetDeploymentCount}, durationMs=${Date.now() - metadataStartedAt}`,
    );
    const summary: ScanSummary = {
      assets: 0,
      deployments: 0,
      verified: 0,
      rejected: 0,
      failed: 0,
      unchanged: 0,
      skipped: 0,
    };
    const seenDeployments = new Set<string>();

    for (const [symbol, entries] of Object.entries(metadata)) {
      if (!Array.isArray(entries)) {
        this.logger.warn(`Skipping invalid metadata entry list for ${symbol}`);
        continue;
      }

      for (const entry of entries) {
        if (!this.isMetadataEntry(entry)) {
          this.logger.warn(`Skipping invalid metadata entry for ${symbol}`);
          continue;
        }
        if (entry.endpointVersion.toLowerCase() !== 'v2') {
          summary.skipped += Object.keys(entry.deployments).length;
          continue;
        }

        const targetDeployments = Object.entries(entry.deployments).filter(
          (deployment): deployment is [string, OftMetadataDeployment] => {
            const [chainName, value] = deployment;
            return (
              !!this.scanChains[chainName.toLowerCase()] &&
              this.isMetadataDeployment(value)
            );
          },
        );
        if (targetDeployments.length === 0) {
          continue;
        }

        const asset = await this.upsertAsset(symbol, entry);
        summary.assets += 1;

        for (const [chainName, deployment] of targetDeployments) {
          summary.deployments += 1;
          seenDeployments.add(
            this.deploymentKey(chainName, deployment.address),
          );
          const result = await this.scanDeployment(
            asset,
            symbol,
            chainName,
            entry,
            deployment,
          );
          summary[result] += 1;
          if (
            summary.deployments % 10 === 0 ||
            summary.deployments === targetDeploymentCount
          ) {
            this.logger.log(
              `OFT scan progress: ${summary.deployments}/${targetDeploymentCount}, verified=${summary.verified}, rejected=${summary.rejected}, failed=${summary.failed}, unchanged=${summary.unchanged}`,
            );
          }
        }
      }
    }

    this.logger.log('Reconciling deployments missing from metadata');
    if (seenDeployments.size > 0) {
      await this.markMissingDeployments(seenDeployments);
    } else {
      this.logger.warn(
        'LayerZero metadata contains no supported OFT deployments; skipping missing-deployment reconciliation',
      );
    }
    this.logger.log('Verifying reverse LayerZero peers');
    await this.verifyReversePeers();
    this.logger.log('Refreshing cross-chain asset states');
    await this.refreshAssets();

    this.logger.log(
      `OFT scan completed in ${Date.now() - startedAt}ms: ${JSON.stringify(summary)}`,
    );
    return summary;
  }

  private countTargetDeployments(metadata: OftMetadataResponse): number {
    let count = 0;
    for (const entries of Object.values(metadata)) {
      if (!Array.isArray(entries)) {
        continue;
      }
      for (const entry of entries) {
        if (
          !this.isMetadataEntry(entry) ||
          entry.endpointVersion.toLowerCase() !== 'v2'
        ) {
          continue;
        }
        count += Object.entries(entry.deployments).filter(
          ([chainName, deployment]) =>
            !!this.scanChains[chainName.toLowerCase()] &&
            this.isMetadataDeployment(deployment),
        ).length;
      }
    }
    return count;
  }

  private async fetchMetadata(): Promise<OftMetadataResponse> {
    const response = await fetch(this.metadataUrl, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(
        `LayerZero metadata request failed: HTTP ${response.status}`,
      );
    }

    const data: unknown = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('LayerZero metadata response must be an object');
    }

    return data as OftMetadataResponse;
  }

  private isMetadataEntry(value: unknown): value is OftMetadataEntry {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }

    const candidate = value as Record<string, unknown>;
    return (
      typeof candidate.name === 'string' &&
      typeof candidate.endpointVersion === 'string' &&
      !!candidate.deployments &&
      typeof candidate.deployments === 'object' &&
      !Array.isArray(candidate.deployments)
    );
  }

  private isTargetMetadataType(type: unknown): boolean {
    if (typeof type !== 'string') {
      return false;
    }
    const normalized = type.replaceAll(/[^a-z]/gi, '').toLowerCase();
    return normalized === 'oft' || normalized === 'oftadapter';
  }

  private isMetadataDeployment(value: unknown): value is OftMetadataDeployment {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }

    const candidate = value as Record<string, unknown>;
    return (
      typeof candidate.address === 'string' &&
      this.isTargetMetadataType(candidate.type)
    );
  }

  private async upsertAsset(
    symbol: string,
    entry: OftMetadataEntry,
  ): Promise<AssetEntity> {
    const sourceKey = [
      symbol.toLowerCase(),
      entry.name.toLowerCase(),
      entry.sharedDecimals ?? 'unknown',
      entry.endpointVersion.toLowerCase(),
    ].join(':');
    const existing = await this.assetRepository.findOne({
      where: { sourceKey },
    });

    if (
      existing &&
      existing.name === entry.name &&
      existing.symbol === symbol
    ) {
      return existing;
    }

    return this.assetRepository.save(
      this.assetRepository.create({
        ...existing,
        sourceKey,
        name: entry.name,
        symbol,
        status: existing?.status ?? AssetStatus.PENDING,
        trustGrade: existing?.trustGrade ?? TrustGrade.C,
      }),
    );
  }

  private async scanDeployment(
    asset: AssetEntity,
    symbol: string,
    rawChainName: string,
    entry: OftMetadataEntry,
    metadataDeployment: OftMetadataDeployment,
  ): Promise<'verified' | 'rejected' | 'failed' | 'unchanged' | 'skipped'> {
    const chainName = rawChainName.toLowerCase();
    const oftAddress = normalizeEvmAddress(metadataDeployment.address);
    if (!oftAddress) {
      await this.saveRejectedDeployment(
        asset,
        chainName,
        metadataDeployment.address,
        entry,
        metadataDeployment,
        'INVALID_OFT_ADDRESS',
      );
      return 'rejected';
    }

    const existing = await this.deploymentRepository.findOne({
      where: { chainName, oftAddress },
    });
    const metadataHash = this.hashMetadata({
      chainName,
      deployment: metadataDeployment,
      endpointVersion: entry.endpointVersion,
      name: entry.name,
      sharedDecimals: entry.sharedDecimals ?? null,
      symbol,
    });
    const evidence: DeploymentEvidence = {
      ...existing?.evidence,
      metadataUrl: this.metadataUrl,
      metadataType: metadataDeployment.type,
      metadata: metadataDeployment,
      metadataHash,
      metadataMissingCount: 0,
      lastMetadataSeenAt: new Date().toISOString(),
    };

    const probeReason = existing
      ? this.contractProbeReason(existing, metadataHash)
      : 'new_deployment';
    if (existing && !probeReason) {
      if ((existing.evidence?.metadataMissingCount ?? 0) > 0) {
        existing.evidence = evidence;
        await this.deploymentRepository.save(existing);
      }
      return 'unchanged';
    }

    this.logger.log(
      `Probing OFT contract: symbol=${symbol}, chain=${chainName}, address=${oftAddress}, reason=${probeReason}`,
    );

    const deployment = this.deploymentRepository.create({
      ...existing,
      assetId: asset.id,
      chainName,
      oftAddress,
      name: entry.name,
      symbol,
      localDecimals: metadataDeployment.localDecimals ?? null,
      sharedDecimals: entry.sharedDecimals ?? null,
      evidence,
      scanStatus: DeploymentScanStatus.DISCOVERED,
      errorReason: null,
      lastScannedAt: new Date(),
    });

    const chainConf = this.scanChains[chainName];
    if (!chainConf) {
      deployment.errorReason = 'RPC_NOT_CONFIGURED';
      await this.deploymentRepository.save(deployment);
      return 'skipped';
    }

    try {
      await this.probeDeployment(deployment, chainConf);
      await this.deploymentRepository.save(deployment);
      return deployment.scanStatus === DeploymentScanStatus.VERIFIED
        ? 'verified'
        : 'rejected';
    } catch (error) {
      deployment.scanStatus = DeploymentScanStatus.FAILED;
      deployment.errorReason = this.errorMessage(error);
      deployment.lastScannedAt = new Date();
      await this.deploymentRepository.save(deployment);
      this.logger.warn(
        `Failed to scan ${chainName}:${oftAddress}: ${deployment.errorReason}`,
      );
      return 'failed';
    }
  }

  private async probeDeployment(
    deployment: DeploymentEntity,
    chainConf: OftChainConfig,
  ): Promise<void> {
    const client = this.contractClients[deployment.chainName];
    if (!client) {
      throw new Error(`RPC_NOT_CONFIGURED:${deployment.chainName}`);
    }
    const probe = await client.probe(deployment.oftAddress);
    if (probe.oftVersion.interfaceId.toLowerCase() !== OFT_INTERFACE_ID) {
      throw new Error(
        `UNSUPPORTED_OFT_INTERFACE:${probe.oftVersion.interfaceId}`,
      );
    }

    const assetType = classifyStandardOft(
      deployment.oftAddress,
      probe.tokenAddress,
      probe.approvalRequired,
    );
    const tokenAddress = normalizeEvmAddress(probe.tokenAddress);
    if (!assetType || !tokenAddress) {
      deployment.scanStatus = DeploymentScanStatus.REJECTED;
      deployment.errorReason = 'NOT_STANDARD_DIRECT_OFT_OR_OFT_ADAPTER';
      return;
    }

    deployment.chainId = chainConf.chainId;
    deployment.endpointId = chainConf.endpointId;
    deployment.tokenAddress = tokenAddress;
    deployment.implementationAddress = probe.implementationAddress;
    deployment.adminAddress = probe.adminAddress;
    deployment.endpointAddress = probe.endpointAddress;
    deployment.name = probe.name;
    deployment.symbol = probe.symbol;
    deployment.localDecimals = probe.localDecimals;
    deployment.sharedDecimals = probe.sharedDecimals;
    deployment.assetType = assetType;
    deployment.approvalRequired = probe.approvalRequired;
    deployment.owner = probe.owner;
    deployment.paused = probe.paused;
    deployment.bytecodeHash = probe.bytecodeHash;
    deployment.peers = probe.peers;
    deployment.quote = probe.quote;
    deployment.lastScannedBlock = probe.blockNumber;
    deployment.lastScannedAt = new Date();
    deployment.evidence = {
      ...deployment.evidence,
      blockNumber: probe.blockNumber,
      oftVersion: probe.oftVersion,
    };
    deployment.configHash = this.hashConfiguration({
      endpoint: deployment.endpointAddress,
      implementation: deployment.implementationAddress,
      admin: deployment.adminAddress,
      owner: deployment.owner,
      paused: probe.paused,
      peers: probe.peers,
    });
    deployment.scanStatus = probe.paused
      ? DeploymentScanStatus.REJECTED
      : DeploymentScanStatus.VERIFIED;
    deployment.errorReason = probe.paused ? 'CONTRACT_PAUSED' : null;
  }

  private async verifyReversePeers(): Promise<void> {
    const deployments = (await this.deploymentRepository.find()).filter(
      (deployment) => !!this.scanChains[deployment.chainName],
    );
    const byEndpointAndAddress = new Map<string, DeploymentEntity>();
    for (const deployment of deployments) {
      if (deployment.endpointId) {
        byEndpointAndAddress.set(
          `${deployment.endpointId}:${deployment.oftAddress.toLowerCase()}`,
          deployment,
        );
      }
    }

    for (const deployment of deployments) {
      if (!deployment.endpointId) {
        continue;
      }

      let changed = false;
      for (const peer of Object.values(deployment.peers ?? {})) {
        const peerAddress = addressFromBytes32(peer.peer);
        if (!peerAddress) {
          if (peer.reversePeer !== false || peer.status !== 'one_way') {
            peer.reversePeer = false;
            peer.status = 'one_way';
            changed = true;
          }
          continue;
        }

        const remote = byEndpointAndAddress.get(
          `${peer.endpointId}:${peerAddress}`,
        );
        const reverse = remote?.peers?.[String(deployment.endpointId)];
        const reversePeer =
          addressFromBytes32(reverse?.peer) ===
          deployment.oftAddress.toLowerCase();
        const status = reversePeer ? 'active' : 'one_way';
        if (peer.reversePeer !== reversePeer || peer.status !== status) {
          peer.reversePeer = reversePeer;
          peer.status = status;
          changed = true;
        }
      }

      if (changed) {
        deployment.configHash = this.hashConfiguration({
          endpoint: deployment.endpointAddress,
          implementation: deployment.implementationAddress,
          admin: deployment.adminAddress,
          owner: deployment.owner,
          paused: deployment.paused,
          peers: deployment.peers,
        });
        await this.deploymentRepository.save(deployment);
      }
    }
  }

  private contractProbeReason(
    deployment: DeploymentEntity,
    metadataHash: string,
  ): string | null {
    if (deployment.evidence?.metadataHash !== metadataHash) {
      return 'metadata_changed';
    }
    if (deployment.scanStatus === DeploymentScanStatus.DISCOVERED) {
      return 'not_scanned';
    }
    if (deployment.scanStatus === DeploymentScanStatus.FAILED) {
      return 'retry_failed';
    }
    if (deployment.errorReason === 'METADATA_REMOVED') {
      return 'metadata_restored';
    }
    if (!deployment.lastScannedAt) {
      return 'missing_scan_time';
    }

    return Date.now() - new Date(deployment.lastScannedAt).getTime() >=
      AppConf.layerZero.contractRefreshMs
      ? 'periodic_refresh'
      : null;
  }

  private async markMissingDeployments(
    seenDeployments: ReadonlySet<string>,
  ): Promise<void> {
    const threshold = AppConf.layerZero.metadataMissingThreshold;
    const deployments = await this.deploymentRepository.find();

    for (const deployment of deployments) {
      if (
        !this.scanChains[deployment.chainName] ||
        seenDeployments.has(
          this.deploymentKey(deployment.chainName, deployment.oftAddress),
        )
      ) {
        continue;
      }

      const previousCount = deployment.evidence?.metadataMissingCount ?? 0;
      const metadataMissingCount = Math.min(previousCount + 1, threshold);
      const alreadyRejected =
        deployment.scanStatus === DeploymentScanStatus.REJECTED &&
        deployment.errorReason === 'METADATA_REMOVED';
      if (previousCount === metadataMissingCount && alreadyRejected) {
        continue;
      }

      deployment.evidence = {
        ...deployment.evidence,
        metadataMissingCount,
      };
      if (metadataMissingCount >= threshold) {
        deployment.scanStatus = DeploymentScanStatus.REJECTED;
        deployment.errorReason = 'METADATA_REMOVED';
      }
      await this.deploymentRepository.save(deployment);
    }
  }

  private async refreshAssets(): Promise<void> {
    const assets = await this.assetRepository.find({
      relations: { deployments: true },
    });
    for (const asset of assets) {
      const scopedDeployments = asset.deployments.filter(
        (deployment) => !!this.scanChains[deployment.chainName],
      );
      const verified = scopedDeployments.filter(
        (deployment) => deployment.scanStatus === DeploymentScanStatus.VERIFIED,
      );
      const hasActivePath = verified.some((deployment) =>
        Object.values(deployment.peers ?? {}).some(
          (peer) => peer.status === 'active',
        ),
      );

      let status = AssetStatus.PENDING;
      let trustGrade = TrustGrade.C;
      let crosschainType: CrosschainAssetType | null = null;
      let lastVerifiedAt = asset.lastVerifiedAt;

      if (verified.length >= 2 && hasActivePath) {
        status = AssetStatus.VERIFIED;
        trustGrade = TrustGrade.A;
        crosschainType = verified.some(
          (deployment) =>
            deployment.assetType === CrosschainAssetType.OFT_ADAPTER,
        )
          ? CrosschainAssetType.OFT_ADAPTER
          : CrosschainAssetType.DIRECT_OFT;
        lastVerifiedAt = verified.reduce<Date | null>((latest, deployment) => {
          if (!deployment.lastScannedAt) {
            return latest;
          }
          return !latest || deployment.lastScannedAt > latest
            ? deployment.lastScannedAt
            : latest;
        }, null);
      } else if (
        scopedDeployments.length > 0 &&
        scopedDeployments.every(
          (deployment) =>
            deployment.scanStatus === DeploymentScanStatus.REJECTED,
        )
      ) {
        status = AssetStatus.REJECTED;
        trustGrade = TrustGrade.D;
      }

      if (
        asset.status !== status ||
        asset.trustGrade !== trustGrade ||
        asset.crosschainType !== crosschainType ||
        asset.lastVerifiedAt?.getTime() !== lastVerifiedAt?.getTime()
      ) {
        asset.status = status;
        asset.trustGrade = trustGrade;
        asset.crosschainType = crosschainType;
        asset.lastVerifiedAt = lastVerifiedAt;
        await this.assetRepository.save(asset);
      }
    }
  }

  private async saveRejectedDeployment(
    asset: AssetEntity,
    chainName: string,
    rawAddress: string,
    entry: OftMetadataEntry,
    metadata: OftMetadataDeployment,
    reason: string,
  ): Promise<void> {
    const fallbackAddress = rawAddress.toLowerCase();
    const existing = await this.deploymentRepository.findOne({
      where: { chainName, oftAddress: fallbackAddress },
    });
    await this.deploymentRepository.save(
      this.deploymentRepository.create({
        ...existing,
        assetId: asset.id,
        chainName,
        oftAddress: fallbackAddress,
        name: entry.name,
        symbol: asset.symbol,
        localDecimals: metadata.localDecimals ?? null,
        sharedDecimals: entry.sharedDecimals ?? null,
        evidence: {
          ...existing?.evidence,
          metadataUrl: this.metadataUrl,
          metadataType: metadata.type,
          metadata,
          metadataHash: this.hashMetadata({
            chainName,
            deployment: metadata,
            endpointVersion: entry.endpointVersion,
            name: entry.name,
            sharedDecimals: entry.sharedDecimals ?? null,
            symbol: asset.symbol,
          }),
          metadataMissingCount: 0,
          lastMetadataSeenAt: new Date().toISOString(),
        },
        peers: {},
        quote: {},
        scanStatus: DeploymentScanStatus.REJECTED,
        errorReason: reason,
        lastScannedAt: new Date(),
      }),
    );
  }

  private hashConfiguration(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private hashMetadata(value: unknown): string {
    return createHash('sha256')
      .update(this.stableStringify(value))
      .digest('hex');
  }

  private stableStringify(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(
          ([key, item]) =>
            `${JSON.stringify(key)}:${this.stableStringify(item)}`,
        );
      return `{${entries.join(',')}}`;
    }
    return JSON.stringify(value) ?? 'null';
  }

  private deploymentKey(chainName: string, oftAddress: string): string {
    return `${chainName.toLowerCase()}:${oftAddress.toLowerCase()}`;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error
      ? error.message.slice(0, 1000)
      : String(error);
  }
}
