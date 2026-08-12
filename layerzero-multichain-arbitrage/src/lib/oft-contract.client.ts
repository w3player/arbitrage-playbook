import {
  Address,
  Hex,
  createPublicClient,
  getAddress,
  http,
  isAddress,
  keccak256,
  pad,
  parseAbi,
} from 'viem';

const OFT_ABI = parseAbi([
  'function oftVersion() view returns (bytes4 interfaceId, uint64 version)',
  'function token() view returns (address)',
  'function approvalRequired() view returns (bool)',
  'function sharedDecimals() view returns (uint8)',
  'function endpoint() view returns (address)',
  'function peers(uint32 eid) view returns (bytes32)',
  'function quoteOFT((uint32 dstEid, bytes32 to, uint256 amountLD, uint256 minAmountLD, bytes extraOptions, bytes composeMsg, bytes oftCmd) sendParam) view returns ((uint256 minAmountLD, uint256 maxAmountLD) oftLimit, (int256 feeAmountLD, string description)[] oftFeeDetails, (uint256 amountSentLD, uint256 amountReceivedLD) oftReceipt)',
  'function quoteSend((uint32 dstEid, bytes32 to, uint256 amountLD, uint256 minAmountLD, bytes extraOptions, bytes composeMsg, bytes oftCmd) sendParam, bool payInLzToken) view returns ((uint256 nativeFee, uint256 lzTokenFee) fee)',
]);

const ERC20_ABI = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
]);

const OWNABLE_ABI = parseAbi(['function owner() view returns (address)']);
const PAUSABLE_ABI = parseAbi(['function paused() view returns (bool)']);
const ZERO_BYTES32 = `0x${'0'.repeat(64)}`;
const IMPLEMENTATION_SLOT =
  '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const ADMIN_SLOT =
  '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103';

export const OFT_INTERFACE_ID = '0x02e49c2c';

export interface OftChainConfig {
  chainId: number;
  endpointId: number;
  rpcUrl: string;
}

export interface OftPeerResult {
  endpointId: number;
  peer: string;
  reversePeer: null;
  status: 'unknown';
}

export interface OftContractProbe {
  blockNumber: string;
  bytecodeHash: string;
  oftVersion: { interfaceId: string; version: string };
  tokenAddress: string;
  approvalRequired: boolean;
  sharedDecimals: number;
  endpointAddress: string;
  name: string;
  symbol: string;
  localDecimals: number;
  owner: string | null;
  paused: boolean | null;
  implementationAddress: string | null;
  adminAddress: string | null;
  peers: Record<string, OftPeerResult>;
  quote: Record<string, unknown>;
}

export class OftContractClient {
  private readonly client: ReturnType<typeof createPublicClient>;

  constructor(
    private readonly chain: OftChainConfig,
    private readonly targetEndpointIds: readonly number[],
  ) {
    this.client = createPublicClient({ transport: http(chain.rpcUrl) });
  }

  async probe(rawAddress: string): Promise<OftContractProbe> {
    const address = getAddress(rawAddress);
    const [rpcChainId, blockNumber, bytecode] = await Promise.all([
      this.client.getChainId(),
      this.client.getBlockNumber(),
      this.client.getBytecode({ address }),
    ]);

    if (rpcChainId !== this.chain.chainId) {
      throw new Error(
        `RPC_CHAIN_ID_MISMATCH: expected ${this.chain.chainId}, received ${rpcChainId}`,
      );
    }
    if (!bytecode || bytecode === '0x') {
      throw new Error('OFT_ADDRESS_HAS_NO_CODE');
    }

    const [oftVersion, token, approvalRequired, sharedDecimals, endpoint] =
      await Promise.all([
        this.client.readContract({
          address,
          abi: OFT_ABI,
          functionName: 'oftVersion',
        }),
        this.client.readContract({
          address,
          abi: OFT_ABI,
          functionName: 'token',
        }),
        this.client.readContract({
          address,
          abi: OFT_ABI,
          functionName: 'approvalRequired',
        }),
        this.client.readContract({
          address,
          abi: OFT_ABI,
          functionName: 'sharedDecimals',
        }),
        this.client.readContract({
          address,
          abi: OFT_ABI,
          functionName: 'endpoint',
        }),
      ]);

    const endpointCode = await this.client.getBytecode({ address: endpoint });
    if (!endpointCode || endpointCode === '0x') {
      throw new Error('ENDPOINT_ADDRESS_HAS_NO_CODE');
    }

    const [name, symbol, localDecimals] = await Promise.all([
      this.client.readContract({
        address: token,
        abi: ERC20_ABI,
        functionName: 'name',
      }),
      this.client.readContract({
        address: token,
        abi: ERC20_ABI,
        functionName: 'symbol',
      }),
      this.client.readContract({
        address: token,
        abi: ERC20_ABI,
        functionName: 'decimals',
      }),
    ]);

    const [owner, paused, implementationSlot, adminSlot] = await Promise.all([
      this.safeRead(() =>
        this.client.readContract({
          address,
          abi: OWNABLE_ABI,
          functionName: 'owner',
        }),
      ),
      this.safeRead(() =>
        this.client.readContract({
          address,
          abi: PAUSABLE_ABI,
          functionName: 'paused',
        }),
      ),
      this.client.getStorageAt({ address, slot: IMPLEMENTATION_SLOT }),
      this.client.getStorageAt({ address, slot: ADMIN_SLOT }),
    ]);

    const peers = await this.readPeers(address);
    const quote = await this.readQuote(address, localDecimals, peers);

    return {
      blockNumber: blockNumber.toString(),
      bytecodeHash: keccak256(bytecode),
      oftVersion: {
        interfaceId: oftVersion[0],
        version: oftVersion[1].toString(),
      },
      tokenAddress: token.toLowerCase(),
      approvalRequired,
      sharedDecimals,
      endpointAddress: endpoint.toLowerCase(),
      name,
      symbol,
      localDecimals,
      owner: owner?.toLowerCase() ?? null,
      paused,
      implementationAddress: addressFromBytes32(implementationSlot),
      adminAddress: addressFromBytes32(adminSlot),
      peers,
      quote,
    };
  }

  private async readPeers(
    address: Address,
  ): Promise<Record<string, OftPeerResult>> {
    const peers: Record<string, OftPeerResult> = {};
    for (const endpointId of this.targetEndpointIds) {
      const peer = await this.safeRead(() =>
        this.client.readContract({
          address,
          abi: OFT_ABI,
          functionName: 'peers',
          args: [endpointId],
        }),
      );
      if (!peer || peer.toLowerCase() === ZERO_BYTES32) {
        continue;
      }

      peers[String(endpointId)] = {
        endpointId,
        peer,
        reversePeer: null,
        status: 'unknown',
      };
    }
    return peers;
  }

  private async readQuote(
    address: Address,
    localDecimals: number,
    peers: Record<string, OftPeerResult>,
  ): Promise<Record<string, unknown>> {
    const target = Object.values(peers)[0];
    if (!target) {
      return {};
    }

    const amountLD = 10n ** BigInt(Math.min(localDecimals, 18));
    const sendParam = {
      dstEid: target.endpointId,
      to: pad(address, { size: 32 }),
      amountLD,
      minAmountLD: 0n,
      extraOptions: '0x' as Hex,
      composeMsg: '0x' as Hex,
      oftCmd: '0x' as Hex,
    };

    try {
      const [oftQuote, messagingFee] = await Promise.all([
        this.client.readContract({
          address,
          abi: OFT_ABI,
          functionName: 'quoteOFT',
          args: [sendParam],
        }),
        this.client.readContract({
          address,
          abi: OFT_ABI,
          functionName: 'quoteSend',
          args: [sendParam, false],
        }),
      ]);

      return toJsonSafe({
        destinationEndpointId: target.endpointId,
        amountLD,
        oftQuote,
        messagingFee,
      }) as Record<string, unknown>;
    } catch (error) {
      return {
        destinationEndpointId: target.endpointId,
        amountLD: amountLD.toString(),
        error: errorMessage(error),
      };
    }
  }

  private async safeRead<T>(operation: () => Promise<T>): Promise<T | null> {
    try {
      return await operation();
    } catch {
      return null;
    }
  }
}

export function normalizeEvmAddress(address: string): string | null {
  return isAddress(address) ? address.toLowerCase() : null;
}

export function addressFromBytes32(value: string | undefined): string | null {
  if (!value || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    return null;
  }
  const address = `0x${value.slice(-40)}`;
  return isAddress(address) ? address.toLowerCase() : null;
}

function toJsonSafe(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, item: unknown) =>
      typeof item === 'bigint' ? item.toString() : item,
    ),
  ) as unknown;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 1000) : String(error);
}
