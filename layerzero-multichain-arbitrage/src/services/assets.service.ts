import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AssetStatus, DeploymentScanStatus } from '../config/enums';
import { AssetEntity } from '../database/entities/asset.entity';
import type {
  AssetDto,
  AssetsResponseDto,
  AssetsSummaryDto,
} from '../dto/assets.dto';

@Injectable()
export class AssetsService {
  constructor(
    @InjectRepository(AssetEntity)
    private readonly assetRepository: Repository<AssetEntity>,
  ) {}

  async list(): Promise<AssetsResponseDto> {
    const entities = await this.assetRepository.find({
      relations: { deployments: true },
      order: { updatedAt: 'DESC' },
    });
    const assets = entities.map<AssetDto>((asset) => ({
      id: asset.id,
      sourceKey: asset.sourceKey,
      name: asset.name,
      symbol: asset.symbol,
      crosschainType: asset.crosschainType,
      trustGrade: asset.trustGrade,
      status: asset.status,
      firstDiscoveredAt: asset.firstDiscoveredAt,
      lastVerifiedAt: asset.lastVerifiedAt,
      updatedAt: asset.updatedAt,
      deployments: [...asset.deployments]
        .sort((left, right) => left.chainName.localeCompare(right.chainName))
        .map((deployment) => ({
          id: deployment.id,
          chainName: deployment.chainName,
          chainId: deployment.chainId,
          endpointId: deployment.endpointId,
          oftAddress: deployment.oftAddress,
          tokenAddress: deployment.tokenAddress,
          assetType: deployment.assetType,
          approvalRequired: deployment.approvalRequired,
          paused: deployment.paused,
          scanStatus: deployment.scanStatus,
          errorReason: deployment.errorReason,
          lastScannedBlock: deployment.lastScannedBlock,
          lastScannedAt: deployment.lastScannedAt,
          peers: Object.values(deployment.peers ?? {}),
        })),
    }));

    return { summary: this.summarize(assets), assets };
  }

  private summarize(assets: AssetDto[]): AssetsSummaryDto {
    const deployments = assets.flatMap((asset) => asset.deployments);
    return {
      totalAssets: assets.length,
      verifiedAssets: assets.filter(
        (asset) => asset.status === AssetStatus.VERIFIED,
      ).length,
      pendingAssets: assets.filter(
        (asset) => asset.status === AssetStatus.PENDING,
      ).length,
      rejectedAssets: assets.filter(
        (asset) => asset.status === AssetStatus.REJECTED,
      ).length,
      totalDeployments: deployments.length,
      verifiedDeployments: deployments.filter(
        (deployment) => deployment.scanStatus === DeploymentScanStatus.VERIFIED,
      ).length,
      failedDeployments: deployments.filter(
        (deployment) => deployment.scanStatus === DeploymentScanStatus.FAILED,
      ).length,
      activePeerPaths: deployments.reduce(
        (total, deployment) =>
          total +
          deployment.peers.filter((peer) => peer.status === 'active').length,
        0,
      ),
    };
  }
}
