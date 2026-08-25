export interface RpcSnapshotRequestDto {
  assetId: number;
  buyChainName: string;
  sellChainName: string;
}

export interface RpcSnapshotSwapLegDto {
  chainName: string;
  settlementSymbol: string;
  settlementAmountUsd: string;
  tokenAmount: string;
  tokenAmountRaw: string;
  gasUsd: string;
  extraFeeUsd: string;
  tool: string;
  quotedAt: string;
}

export interface RpcSnapshotBridgeDto {
  sourceChainName: string;
  destinationChainName: string;
  destinationEndpointId: number;
  requestedAmount: string;
  sentAmount: string;
  receivedAmount: string;
  dustAmount: string;
  tokenFeeAmount: string;
  tokenLossBps: number;
  nativeFeeRaw: string;
  nativeFeeUsd: string;
  lzTokenFeeRaw: string;
  sourceGasUnits: string;
  sourceGasUsd: string;
  sourceGasEstimated: true;
  sourceBlockNumber: string;
  feeDetails: Array<{ amount: string; description: string }>;
  quotedAt: string;
}

export interface RpcSnapshotResponseDto {
  mode: 'rpc_snapshot';
  observedAt: string;
  assetId: number;
  name: string;
  symbol: string;
  buy: RpcSnapshotSwapLegDto;
  bridge: RpcSnapshotBridgeDto;
  sell: RpcSnapshotSwapLegDto;
  summary: {
    inputUsd: string;
    outputUsd: string;
    grossProfitUsd: string;
    explicitCostUsd: string;
    netProfitUsd: string;
    netProfitBps: number;
    status: 'positive' | 'negative';
  };
  limitations: string[];
}
