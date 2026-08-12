export const AppConf = {
  layerZero: {
    oftMetadataUrl:
      'https://metadata.layerzero-api.com/v1/metadata/experiment/ofts/list',
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
} as const;
