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
  DiscoveryEvidence,
  DeploymentEntity,
  DeploymentEvidence,
} from '../database/entities/deployment.entity';
import { ScanStateEntity } from '../database/entities/scan-state.entity';
import type { ScanStatusResponseDto, ScanSummaryDto } from '../dto/scan.dto';
import {
  LayerZeroScanClient,
  OFT_INTERFACE_ID,
  OftContractClient,
  addressFromBytes32,
  normalizeEvmAddress,
} from '../lib';
import type {
  LayerZeroScanMessage,
  OftChainConfig,
  OftContractProbe,
} from '../lib';

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

interface DiscoveredOft {
  asset: AssetEntity;
  deployment: DeploymentEntity;
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
  private readonly scanApiClient: LayerZeroScanClient;
  private readonly chainNamesByEndpointId: ReadonlyMap<number, string>;
  private activeScan: Promise<ScanSummaryDto> | null = null;
  private scanStatus: ScanStatusResponseDto = {
    state: 'idle',
    startedAt: null,
    completedAt: null,
    summary: null,
    error: null,
  };

  constructor(
    @InjectRepository(AssetEntity)
    private readonly assetRepository: Repository<AssetEntity>,
    @InjectRepository(DeploymentEntity)
    private readonly deploymentRepository: Repository<DeploymentEntity>,
    @InjectRepository(ScanStateEntity)
    private readonly scanStateRepository: Repository<ScanStateEntity>,
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
    this.scanApiClient = new LayerZeroScanClient(AppConf.layerZero.scanApiUrl);
    this.chainNamesByEndpointId = new Map(
      Object.entries(this.scanChains).map(([chainName, chain]) => [
        chain.endpointId,
        chainName,
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

  getStatus(): ScanStatusResponseDto {
    return {
      ...this.scanStatus,
      summary: this.scanStatus.summary ? { ...this.scanStatus.summary } : null,
    };
  }

  scan(): Promise<ScanSummaryDto> {
    if (this.activeScan) {
      this.logger.log('OFT scan request joined the active scan');
      return this.activeScan;
    }

    const startedAt = Date.now();
    this.logger.log(
      `OFT scan started: chains=${Object.keys(this.scanChains).join(',')}`,
    );
    this.scanStatus = {
      state: 'running',
      startedAt: new Date(startedAt).toISOString(),
      completedAt: null,
      summary: this.scanStatus.summary,
      error: null,
    };
    this.activeScan = this.executeScan(startedAt)
      .then((summary) => {
        this.scanStatus = {
          state: 'idle',
          startedAt: this.scanStatus.startedAt,
          completedAt: new Date().toISOString(),
          summary,
          error: null,
        };
        return summary;
      })
      .catch((error: unknown) => {
        const message = this.errorMessage(error);
        this.scanStatus = {
          state: 'failed',
          startedAt: this.scanStatus.startedAt,
          completedAt: new Date().toISOString(),
          summary: this.scanStatus.summary,
          error: message,
        };
        this.logger.error(
          `OFT scan aborted after ${Date.now() - startedAt}ms: ${message}`,
        );
        throw error;
      })
      .finally(() => {
        this.activeScan = null;
      });

    return this.activeScan;
  }

  private async executeScan(startedAt: number): Promise<ScanSummaryDto> {
    const metadataStartedAt = Date.now();
    let metadata: OftMetadataResponse = {};
    let metadataLoaded = false;
    try {
      metadata = await this.fetchMetadata();
      metadataLoaded = true;
    } catch (error) {
      this.logger.warn(
        `LayerZero metadata unavailable; continuing with message discovery: ${this.errorMessage(error)}`,
      );
    }
    const targetDeploymentCount = this.countTargetDeployments(metadata);
    this.logger.log(
      `LayerZero metadata loaded: symbols=${Object.keys(metadata).length}, targetDeployments=${targetDeploymentCount}, durationMs=${Date.now() - metadataStartedAt}`,
    );
    const summary: ScanSummaryDto = {
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

    this.logger.log('Discovering OFTs from LayerZero cross-chain messages');
    await this.discoverFromLayerZeroMessages(summary);

    this.logger.log('Reconciling deployments missing from metadata');
    if (metadataLoaded && seenDeployments.size > 0) {
      await this.markMissingDeployments(seenDeployments);
    } else if (metadataLoaded) {
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

  private async discoverFromLayerZeroMessages(
    summary: ScanSummaryDto,
  ): Promise<void> {
    const stateKey = 'layerzero_message_discovery';
    const storedState = await this.scanStateRepository.findOne({
      where: { key: stateKey },
    });
    const state =
      storedState ??
      this.scanStateRepository.create({ key: stateKey, value: {} });
    const previous = state.value ?? {};
    const now = new Date();
    const hasOpenWindow = !!previous.windowStart && !!previous.windowEnd;
    const lastCompletedAt = previous.lastCompletedAt
      ? new Date(previous.lastCompletedAt)
      : null;
    const fallbackStart = new Date(
      now.getTime() - AppConf.layerZero.messageDiscoveryLookbackMs,
    );
    const incrementalStart =
      lastCompletedAt && !Number.isNaN(lastCompletedAt.getTime())
        ? new Date(
            lastCompletedAt.getTime() -
              AppConf.layerZero.messageDiscoveryOverlapMs,
          )
        : fallbackStart;
    const windowStart = hasOpenWindow
      ? previous.windowStart!
      : incrementalStart.toISOString();
    const windowEnd = hasOpenWindow ? previous.windowEnd! : now.toISOString();
    let nextToken = hasOpenWindow ? previous.nextToken : undefined;
    const processed = new Map<string, DiscoveredOft | null>();
    let pages = 0;
    let messages = 0;

    this.logger.log(
      `LayerZero message discovery window: start=${windowStart}, end=${windowEnd}, resume=${!!nextToken}`,
    );

    while (pages < AppConf.layerZero.messageDiscoveryMaxPagesPerScan) {
      const page = await this.scanApiClient.fetchMessagesPage({
        endpointIds: [...this.chainNamesByEndpointId.keys()],
        start: windowStart,
        end: windowEnd,
        limit: AppConf.layerZero.messageDiscoveryPageSize,
        nextToken,
      });
      pages += 1;
      messages += page.messages.length;

      const likelyMessages = this.uniqueMessagePathways(
        page.messages.filter((message) => this.isLikelyOftMessage(message)),
      );
      const verifiedBeforePage = summary.verified;
      const prefetchedProbes =
        await this.prefetchMessageCandidates(likelyMessages);
      for (const message of likelyMessages) {
        await this.discoverMessageTopology(
          message,
          processed,
          prefetchedProbes,
          summary,
        );
      }
      if (summary.verified > verifiedBeforePage) {
        await this.verifyReversePeers();
        await this.refreshAssets();
      }

      nextToken = page.nextToken ?? undefined;
      state.value = nextToken
        ? {
            ...previous,
            windowStart,
            windowEnd,
            nextToken,
          }
        : { lastCompletedAt: windowEnd };
      await this.scanStateRepository.save(state);

      this.logger.log(
        `LayerZero message discovery progress: pages=${pages}, messages=${messages}, uniqueContracts=${processed.size}, hasNextPage=${!!nextToken}`,
      );
      if (!nextToken) {
        this.logger.log(
          `LayerZero message discovery completed: pages=${pages}, messages=${messages}, uniqueContracts=${processed.size}`,
        );
        return;
      }
    }

    this.logger.warn(
      `LayerZero message discovery paused at page limit ${AppConf.layerZero.messageDiscoveryMaxPagesPerScan}; the next scan will resume the same window`,
    );
  }

  private async discoverMessageTopology(
    message: LayerZeroScanMessage,
    processed: Map<string, DiscoveredOft | null>,
    prefetchedProbes: ReadonlyMap<string, OftContractProbe | null>,
    summary: ScanSummaryDto,
  ): Promise<void> {
    const sourceChain = this.chainNamesByEndpointId.get(
      message.sourceEndpointId,
    );
    const destinationChain = this.chainNamesByEndpointId.get(
      message.destinationEndpointId,
    );
    const senderAddress = normalizeEvmAddress(message.senderAddress);
    const receiverAddress = normalizeEvmAddress(message.receiverAddress);
    if (
      !sourceChain ||
      !destinationChain ||
      !senderAddress ||
      !receiverAddress
    ) {
      return;
    }

    const evidence: DiscoveryEvidence = {
      source: 'layerzero_scan_message',
      url: this.scanApiClient.messageUrl(message),
      observedAt: message.created ?? new Date().toISOString(),
      guid: message.guid ?? undefined,
      transactionHash: message.sourceTransactionHash ?? undefined,
      sourceEndpointId: message.sourceEndpointId,
      destinationEndpointId: message.destinationEndpointId,
    };
    const queue: Array<{ chainName: string; oftAddress: string }> = [
      { chainName: sourceChain, oftAddress: senderAddress },
      { chainName: destinationChain, oftAddress: receiverAddress },
    ];
    const visited = new Set<string>();
    let topologyAsset = await this.findExistingAssetForCandidates(queue);

    while (queue.length > 0) {
      const candidate = queue.shift()!;
      const key = this.deploymentKey(candidate.chainName, candidate.oftAddress);
      if (visited.has(key)) {
        continue;
      }
      visited.add(key);

      const discovered = await this.discoverMessageCandidate(
        candidate.chainName,
        candidate.oftAddress,
        evidence,
        topologyAsset,
        processed,
        prefetchedProbes,
        summary,
      );
      if (!discovered) {
        continue;
      }

      if (topologyAsset && topologyAsset.id !== discovered.asset.id) {
        discovered.deployment.assetId = topologyAsset.id;
        await this.deploymentRepository.save(discovered.deployment);
        discovered.asset = topologyAsset;
      } else {
        topologyAsset = discovered.asset;
      }

      for (const peer of Object.values(discovered.deployment.peers ?? {})) {
        const peerChain = this.chainNamesByEndpointId.get(peer.endpointId);
        const peerAddress = addressFromBytes32(peer.peer);
        if (peerChain && peerAddress) {
          queue.push({ chainName: peerChain, oftAddress: peerAddress });
        }
      }
    }
  }

  private isLikelyOftMessage(message: LayerZeroScanMessage): boolean {
    const payload = message.sourcePayload;
    if (!payload || !/^0x[0-9a-fA-F]+$/.test(payload)) {
      return false;
    }
    const byteLength = (payload.length - 2) / 2;
    return byteLength === 40 || byteLength >= 72;
  }

  private uniqueMessagePathways(
    messages: readonly LayerZeroScanMessage[],
  ): LayerZeroScanMessage[] {
    const unique = new Map<string, LayerZeroScanMessage>();
    for (const message of messages) {
      const key = [
        message.sourceEndpointId,
        message.senderAddress.toLowerCase(),
        message.destinationEndpointId,
        message.receiverAddress.toLowerCase(),
      ].join(':');
      if (!unique.has(key)) {
        unique.set(key, message);
      }
    }
    return [...unique.values()];
  }

  private async prefetchMessageCandidates(
    messages: readonly LayerZeroScanMessage[],
  ): Promise<Map<string, OftContractProbe | null>> {
    const candidates = new Map<
      string,
      { chainName: string; oftAddress: string }
    >();
    for (const message of messages) {
      const pairs = [
        [message.sourceEndpointId, message.senderAddress],
        [message.destinationEndpointId, message.receiverAddress],
      ] as const;
      for (const [endpointId, rawAddress] of pairs) {
        const chainName = this.chainNamesByEndpointId.get(endpointId);
        const oftAddress = normalizeEvmAddress(rawAddress);
        if (chainName && oftAddress) {
          candidates.set(this.deploymentKey(chainName, oftAddress), {
            chainName,
            oftAddress,
          });
        }
      }
    }

    const results = new Map<string, OftContractProbe | null>();
    await this.mapWithConcurrency(
      [...candidates.entries()],
      8,
      async ([key, candidate]) => {
        const existing = await this.deploymentRepository.findOne({
          where: candidate,
        });
        if (existing?.scanStatus === DeploymentScanStatus.VERIFIED) {
          return;
        }
        try {
          const probe = await this.contractClients[candidate.chainName].probe(
            candidate.oftAddress,
          );
          results.set(key, probe);
        } catch {
          results.set(key, null);
        }
      },
    );
    return results;
  }

  private async mapWithConcurrency<T>(
    items: readonly T[],
    concurrency: number,
    operation: (item: T) => Promise<void>,
  ): Promise<void> {
    let index = 0;
    const workers = Array.from(
      { length: Math.min(concurrency, items.length) },
      async () => {
        while (index < items.length) {
          const item = items[index];
          index += 1;
          await operation(item);
        }
      },
    );
    await Promise.all(workers);
  }

  private async discoverMessageCandidate(
    chainName: string,
    oftAddress: string,
    source: DiscoveryEvidence,
    preferredAsset: AssetEntity | null,
    processed: Map<string, DiscoveredOft | null>,
    prefetchedProbes: ReadonlyMap<string, OftContractProbe | null>,
    summary: ScanSummaryDto,
  ): Promise<DiscoveredOft | null> {
    const key = this.deploymentKey(chainName, oftAddress);
    if (processed.has(key)) {
      const cached = processed.get(key) ?? null;
      if (cached && preferredAsset && cached.asset.id !== preferredAsset.id) {
        cached.deployment.assetId = preferredAsset.id;
        await this.deploymentRepository.save(cached.deployment);
        cached.asset = preferredAsset;
      }
      return cached;
    }

    const existing = await this.deploymentRepository.findOne({
      where: { chainName, oftAddress },
    });
    let asset = existing
      ? await this.assetRepository.findOne({ where: { id: existing.assetId } })
      : null;
    if (
      existing &&
      asset &&
      existing.scanStatus === DeploymentScanStatus.VERIFIED
    ) {
      existing.evidence = this.appendDiscoveryEvidence(
        existing.evidence,
        source,
      );
      if (preferredAsset && preferredAsset.id !== asset.id) {
        existing.assetId = preferredAsset.id;
        asset = preferredAsset;
      }
      await this.deploymentRepository.save(existing);
      const result = { asset, deployment: existing };
      processed.set(key, result);
      summary.unchanged += 1;
      return result;
    }

    const chainConf = this.scanChains[chainName];
    if (!chainConf) {
      processed.set(key, null);
      summary.skipped += 1;
      return null;
    }

    const deployment = this.deploymentRepository.create({
      ...existing,
      chainName,
      oftAddress,
      evidence: this.appendDiscoveryEvidence(existing?.evidence ?? {}, source),
      peers: existing?.peers ?? {},
      quote: existing?.quote ?? {},
      scanStatus: DeploymentScanStatus.DISCOVERED,
      errorReason: null,
      lastScannedAt: new Date(),
    });

    try {
      const prefetchedProbe = prefetchedProbes.get(key);
      if (prefetchedProbes.has(key) && !prefetchedProbe) {
        processed.set(key, null);
        summary.skipped += 1;
        return null;
      }
      await this.probeDeployment(
        deployment,
        chainConf,
        prefetchedProbe ?? undefined,
      );
    } catch {
      processed.set(key, null);
      summary.skipped += 1;
      return null;
    }
    if (deployment.scanStatus !== DeploymentScanStatus.VERIFIED) {
      processed.set(key, null);
      summary.rejected += 1;
      return null;
    }

    asset =
      asset ?? preferredAsset ?? (await this.findAssetFromPeers(deployment));
    let createdAsset = false;
    if (!asset) {
      const sourceKey = `onchain:${chainName}:${oftAddress}`;
      asset = await this.assetRepository.findOne({ where: { sourceKey } });
      if (!asset) {
        asset = await this.assetRepository.save(
          this.assetRepository.create({
            sourceKey,
            name: deployment.name ?? deployment.symbol ?? 'Unknown OFT',
            symbol: deployment.symbol ?? 'UNKNOWN',
            status: AssetStatus.PENDING,
            trustGrade: TrustGrade.C,
          }),
        );
        createdAsset = true;
      }
    }

    deployment.assetId = asset.id;
    await this.deploymentRepository.save(deployment);
    if (
      (deployment.name && asset.name !== deployment.name) ||
      (deployment.symbol && asset.symbol !== deployment.symbol)
    ) {
      asset.name = deployment.name ?? asset.name;
      asset.symbol = deployment.symbol ?? asset.symbol;
      asset = await this.assetRepository.save(asset);
    }

    const result = { asset, deployment };
    processed.set(key, result);
    summary.deployments += 1;
    summary.verified += 1;
    if (createdAsset) {
      summary.assets += 1;
    }
    this.logger.log(
      `Discovered active OFT from LayerZero messages: symbol=${deployment.symbol}, chain=${chainName}, address=${oftAddress}, type=${deployment.assetType}`,
    );
    return result;
  }

  private async findExistingAssetForCandidates(
    candidates: ReadonlyArray<{ chainName: string; oftAddress: string }>,
  ): Promise<AssetEntity | null> {
    for (const candidate of candidates) {
      const deployment = await this.deploymentRepository.findOne({
        where: {
          chainName: candidate.chainName,
          oftAddress: candidate.oftAddress,
        },
      });
      if (deployment) {
        const asset = await this.assetRepository.findOne({
          where: { id: deployment.assetId },
        });
        if (asset) {
          return asset;
        }
      }
    }
    return null;
  }

  private async findAssetFromPeers(
    deployment: DeploymentEntity,
  ): Promise<AssetEntity | null> {
    for (const peer of Object.values(deployment.peers ?? {})) {
      const chainName = this.chainNamesByEndpointId.get(peer.endpointId);
      const oftAddress = addressFromBytes32(peer.peer);
      if (!chainName || !oftAddress) {
        continue;
      }
      const remote = await this.deploymentRepository.findOne({
        where: { chainName, oftAddress },
      });
      if (remote) {
        return this.assetRepository.findOne({ where: { id: remote.assetId } });
      }
    }
    return null;
  }

  private appendDiscoveryEvidence(
    evidence: DeploymentEvidence,
    source: DiscoveryEvidence,
  ): DeploymentEvidence {
    const sources = [...(evidence.discoverySources ?? [])];
    const duplicate = sources.some(
      (item) =>
        (source.guid && item.guid === source.guid) ||
        (source.transactionHash &&
          item.transactionHash === source.transactionHash),
    );
    if (!duplicate) {
      sources.push(source);
    }
    return {
      ...evidence,
      discoverySources: sources.slice(-10),
    };
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
    for (const [rawChainName, deployment] of Object.entries(
      entry.deployments,
    )) {
      if (!this.isMetadataDeployment(deployment)) {
        continue;
      }
      const chainName = rawChainName.toLowerCase();
      const oftAddress = normalizeEvmAddress(deployment.address);
      if (!this.scanChains[chainName] || !oftAddress) {
        continue;
      }
      const existingDeployment = await this.deploymentRepository.findOne({
        where: { chainName, oftAddress },
      });
      if (existingDeployment) {
        const discoveredAsset = await this.assetRepository.findOne({
          where: { id: existingDeployment.assetId },
        });
        if (discoveredAsset) {
          discoveredAsset.name = entry.name;
          discoveredAsset.symbol = symbol;
          return this.assetRepository.save(discoveredAsset);
        }
      }
    }

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
    prefetchedProbe?: OftContractProbe,
  ): Promise<void> {
    const client = this.contractClients[deployment.chainName];
    if (!client) {
      throw new Error(`RPC_NOT_CONFIGURED:${deployment.chainName}`);
    }
    const probe =
      prefetchedProbe ?? (await client.probe(deployment.oftAddress));
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
        !deployment.evidence?.metadataHash ||
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
