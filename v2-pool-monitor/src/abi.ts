export const v2PairAbi = [
  {
    type: 'function',
    name: 'token0',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'token1',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'getReserves',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'reserve0', type: 'uint112' },
      { name: 'reserve1', type: 'uint112' },
      { name: 'blockTimestampLast', type: 'uint32' },
    ],
  },
  {
    type: 'event',
    name: 'Sync',
    anonymous: false,
    inputs: [
      { indexed: false, name: 'reserve0', type: 'uint112' },
      { indexed: false, name: 'reserve1', type: 'uint112' },
    ],
  },
] as const;

export const syncEvent = v2PairAbi[3];
