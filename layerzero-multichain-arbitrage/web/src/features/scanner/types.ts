export type AssetStatus = 'pending' | 'verified' | 'rejected';
export type DeploymentStatus = 'discovered' | 'verified' | 'rejected' | 'failed';
export type CrosschainAssetType = 'direct_oft' | 'oft_adapter';

export interface Peer {
  endpointId: number;
  peer: string;
  reversePeer: boolean | null;
  status: 'active' | 'one_way' | 'unknown';
}

export interface Deployment {
  id: number;
  chainName: string;
  chainId: number | null;
  endpointId: number | null;
  oftAddress: string;
  tokenAddress: string | null;
  assetType: CrosschainAssetType | null;
  approvalRequired: boolean | null;
  paused: boolean | null;
  scanStatus: DeploymentStatus;
  errorReason: string | null;
  lastScannedBlock: string | null;
  lastScannedAt: string | null;
  peers: Peer[];
}

export interface Asset {
  id: number;
  sourceKey: string;
  name: string;
  symbol: string;
  crosschainType: CrosschainAssetType | null;
  trustGrade: 'A' | 'B' | 'C' | 'D';
  status: AssetStatus;
  firstDiscoveredAt: string;
  lastVerifiedAt: string | null;
  updatedAt: string;
  deployments: Deployment[];
}

export interface AssetsSummary {
  totalAssets: number;
  verifiedAssets: number;
  pendingAssets: number;
  rejectedAssets: number;
  totalDeployments: number;
  verifiedDeployments: number;
  failedDeployments: number;
  activePeerPaths: number;
}

export interface AssetsResponse {
  summary: AssetsSummary;
  assets: Asset[];
}

export interface ScanSummary {
  assets: number;
  deployments: number;
  verified: number;
  rejected: number;
  failed: number;
  unchanged: number;
  skipped: number;
}

export interface ScanStatus {
  state: 'idle' | 'running' | 'failed';
  startedAt: string | null;
  completedAt: string | null;
  summary: ScanSummary | null;
  error: string | null;
}

export interface ScanTriggerResponse {
  status: 'started' | 'already_running';
}
