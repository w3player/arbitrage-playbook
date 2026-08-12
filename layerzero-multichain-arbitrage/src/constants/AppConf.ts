export const AppConf = {
  layerZero: {
    oftMetadataUrl:
      'https://metadata.layerzero-api.com/v1/metadata/experiment/ofts/list',
    scanApiUrl: 'https://scan.layerzero-api.com/v1',
    messageDiscoveryLookbackMs: 3 * 24 * 60 * 60 * 1000,
    messageDiscoveryOverlapMs: 10 * 60 * 1000,
    messageDiscoveryPageSize: 150,
    messageDiscoveryMaxPagesPerScan: 100,
    contractRefreshMs: 24 * 60 * 60 * 1000,
    metadataMissingThreshold: 3,
    chains: {
      ethereum: {
        chainId: 1,
        endpointId: 30101,
        rpcUrl: 'https://ethereum-rpc.publicnode.com',
      },
      bsc: {
        chainId: 56,
        endpointId: 30102,
        rpcUrl: 'https://bsc-rpc.publicnode.com',
      },
      base: {
        chainId: 8453,
        endpointId: 30184,
        rpcUrl: 'https://base-rpc.publicnode.com',
      },
    },
  },
  prices: {
    targetSettlementAmount: '500',
    quoteValidityMs: 90_000,
    scanConcurrency: 4,
    anonymousScanConcurrency: 1,
    anonymousAssetBatchSize: 6,
    lifi: {
      integrator: 'l0-arbitrage',
      fromAddress: '0x000000000000000000000000000000000000dEaD',
      requestTimeoutMs: 20_000,
      slippage: 0.003,
      chains: {
        ethereum: {
          chainId: 1,
          settlementSymbol: 'USDC',
          settlementAddress: '0xA0b86991c6218b36c1d19d4a2e9eb0cE3606eB48',
          settlementDecimals: 6,
        },
        bsc: {
          chainId: 56,
          settlementSymbol: 'USDC',
          settlementAddress: '0x8AC76a51cc950d9822D68b83Fe1Ad97B32Cd580d',
          settlementDecimals: 18,
        },
        base: {
          chainId: 8453,
          settlementSymbol: 'USDC',
          settlementAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          settlementDecimals: 6,
        },
      },
    },
  },
} as const;
