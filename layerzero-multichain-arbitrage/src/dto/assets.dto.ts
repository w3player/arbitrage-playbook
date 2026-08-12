import {
  AssetStatus,
  CrosschainAssetType,
  DeploymentScanStatus,
  TrustGrade,
} from '../config/enums';

export interface PeerDto {
  endpointId: number;
  peer: string;
  reversePeer: boolean | null;
  status: 'active' | 'one_way' | 'unknown';
}

export interface DeploymentDto {
  id: number;
  chainName: string;
  chainId: number | null;
  endpointId: number | null;
  oftAddress: string;
  tokenAddress: string | null;
  assetType: CrosschainAssetType | null;
  approvalRequired: boolean | null;
  paused: boolean | null;
  scanStatus: DeploymentScanStatus;
  errorReason: string | null;
  lastScannedBlock: string | null;
  lastScannedAt: Date | null;
  peers: PeerDto[];
}

export interface AssetDto {
  id: number;
  sourceKey: string;
  name: string;
  symbol: string;
  crosschainType: CrosschainAssetType | null;
  trustGrade: TrustGrade;
  status: AssetStatus;
  firstDiscoveredAt: Date;
  lastVerifiedAt: Date | null;
  updatedAt: Date;
  deployments: DeploymentDto[];
}

export interface AssetsSummaryDto {
  totalAssets: number;
  verifiedAssets: number;
  pendingAssets: number;
  rejectedAssets: number;
  totalDeployments: number;
  verifiedDeployments: number;
  failedDeployments: number;
  activePeerPaths: number;
}

export interface AssetsResponseDto {
  summary: AssetsSummaryDto;
  assets: AssetDto[];
}
