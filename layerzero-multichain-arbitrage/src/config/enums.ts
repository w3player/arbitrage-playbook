export enum CrosschainAssetType {
  DIRECT_OFT = 'direct_oft',
  OFT_ADAPTER = 'oft_adapter',
}

export enum AssetStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
}

export enum TrustGrade {
  A = 'A',
  B = 'B',
  C = 'C',
  D = 'D',
}

export enum DeploymentScanStatus {
  DISCOVERED = 'discovered',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
  FAILED = 'failed',
}

export enum MarketQuoteSide {
  PROBE = 'probe',
  BUY = 'buy',
  SELL = 'sell',
}

export enum MarketQuoteStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
}
