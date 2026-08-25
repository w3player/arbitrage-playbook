import { createHash } from 'node:crypto';

import {
  createPublicClient,
  defineChain,
  formatUnits,
  http,
  parseUnits,
  webSocket,
  type Block,
  type Hash,
  type PublicClient,
} from 'viem';

import { syncEvent, v2PairAbi } from './abi.js';
import { evaluateDirection } from './math.js';
import { loadState, saveState } from './state-store.js';
import type { Evaluation, MarketConfig, MonitorConfig, PoolConfig, PoolState, TokenConfig } from './types.js';

interface Cursor {
  blockNumber: bigint;
  blockHash: Hash;
}

export class V2PoolMonitor {
  private readonly httpClient: PublicClient;
  private readonly wsClient: PublicClient;
  private readonly tokens: Map<string, TokenConfig>;
  private readonly pools: Map<string, PoolConfig>;
  private readonly poolsByAddress: Map<string, PoolConfig>;
  private readonly marketsByPool: Map<string, MarketConfig[]>;
  private readonly states = new Map<string, PoolState>();
  private readonly poolFingerprint: string;
  private cursor: Cursor | null = null;
  private requestedHead = 0n;
  private pendingResync: Block | null = null;
  private draining: Promise<void> | null = null;
  private stopped = false;
  private stopWatchBlocks: (() => void) | null = null;
  private stopWatchSync: (() => void) | null = null;

  constructor(
    private readonly config: MonitorConfig,
    rpc: { httpUrl: string; wsUrl: string },
  ) {
    const chain = defineChain({
      id: config.chain.id,
      name: config.chain.name,
      nativeCurrency: { name: 'Native', symbol: 'NATIVE', decimals: 18 },
      rpcUrls: { default: { http: [rpc.httpUrl], webSocket: [rpc.wsUrl] } },
    });
    this.httpClient = createPublicClient({ chain, transport: http(rpc.httpUrl) });
    this.wsClient = createPublicClient({
      chain,
      transport: webSocket(rpc.wsUrl, { reconnect: true }),
    });
    this.tokens = new Map(config.tokens.map((token) => [token.symbol, token]));
    this.pools = new Map(config.pools.map((pool) => [pool.id, pool]));
    this.poolsByAddress = new Map(config.pools.map((pool) => [pool.address.toLowerCase(), pool]));
    this.marketsByPool = this.indexMarkets(config.markets);
    this.poolFingerprint = createHash('sha256')
      .update(
        config.pools
          .map((pool) => `${pool.id}:${pool.address.toLowerCase()}`)
          .sort()
          .join('|'),
      )
      .digest('hex');
  }

  async start(): Promise<void> {
    await this.restoreOrBootstrap();
    const addresses = this.config.pools.map((pool) => pool.address);

    this.stopWatchSync = this.wsClient.watchContractEvent({
      address: addresses,
      abi: v2PairAbi,
      eventName: 'Sync',
      batch: true,
      onLogs: (logs) => {
        for (const log of logs) {
          if (log.blockNumber !== null) this.request(log.blockNumber);
        }
      },
      onError: (error) => this.logError('sync subscription', error),
    });
    this.stopWatchBlocks = this.wsClient.watchBlocks({
      emitOnBegin: true,
      includeTransactions: false,
      onBlock: (block) => {
        if (block.number !== null) this.request(block.number, block);
      },
      onError: (error) => this.logError('head subscription', error),
    });

    console.log(
      `[monitor] started chain=${this.config.chain.name} pools=${this.config.pools.length} cursor=${this.cursor!.blockNumber}`,
    );
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.stopWatchBlocks?.();
    this.stopWatchSync?.();
    if (this.draining) await this.draining;
  }

  private indexMarkets(markets: MarketConfig[]): Map<string, MarketConfig[]> {
    const index = new Map<string, MarketConfig[]>();
    for (const market of markets) {
      for (const poolId of market.poolIds) {
        const entries = index.get(poolId) ?? [];
        entries.push(market);
        index.set(poolId, entries);
      }
    }
    return index;
  }

  private async restoreOrBootstrap(): Promise<void> {
    const persisted = await loadState(this.config.statePath);
    if (
      persisted?.schemaVersion === 1 &&
      persisted.chainId === this.config.chain.id &&
      persisted.poolFingerprint === this.poolFingerprint &&
      persisted.pools.length === this.config.pools.length
    ) {
      const blockNumber = BigInt(persisted.cursor.blockNumber);
      const canonical = await this.httpClient.getBlock({ blockNumber });
      if (canonical.hash === persisted.cursor.blockHash) {
        this.cursor = { blockNumber, blockHash: canonical.hash };
        for (const state of persisted.pools) {
          this.states.set(state.poolId, {
            poolId: state.poolId,
            reserve0: BigInt(state.reserve0),
            reserve1: BigInt(state.reserve1),
            blockNumber: BigInt(state.blockNumber),
            blockHash: state.blockHash,
          });
        }
        console.log(`[monitor] restored state at block ${blockNumber}`);
        return;
      }
      console.warn('[monitor] persisted cursor is no longer canonical; resyncing');
    }
    const latest = await this.httpClient.getBlock({ blockTag: 'latest' });
    await this.bootstrap(latest);
  }

  private async bootstrap(block: Block): Promise<void> {
    if (block.number === null || block.hash === null) {
      throw new Error('cannot bootstrap from a pending block');
    }
    const states = await Promise.all(
      this.config.pools.map(async (pool) => {
        const [token0, token1, reserves] = await Promise.all([
          this.httpClient.readContract({
            address: pool.address,
            abi: v2PairAbi,
            functionName: 'token0',
            blockNumber: block.number!,
          }),
          this.httpClient.readContract({
            address: pool.address,
            abi: v2PairAbi,
            functionName: 'token1',
            blockNumber: block.number!,
          }),
          this.httpClient.readContract({
            address: pool.address,
            abi: v2PairAbi,
            functionName: 'getReserves',
            blockNumber: block.number!,
          }),
        ]);
        const configured0 = this.tokens.get(pool.token0)!;
        const configured1 = this.tokens.get(pool.token1)!;
        if (
          token0.toLowerCase() !== configured0.address.toLowerCase() ||
          token1.toLowerCase() !== configured1.address.toLowerCase()
        ) {
          throw new Error(`on-chain tokens do not match pool ${pool.id}`);
        }
        return {
          poolId: pool.id,
          reserve0: reserves[0],
          reserve1: reserves[1],
          blockNumber: block.number!,
          blockHash: block.hash!,
        } satisfies PoolState;
      }),
    );
    this.states.clear();
    for (const state of states) this.states.set(state.poolId, state);
    this.cursor = { blockNumber: block.number, blockHash: block.hash };
    this.requestedHead = block.number;
    await this.persist();
    console.log(`[monitor] synchronized ${states.length} pools at block ${block.number}`);
  }

  private request(blockNumber: bigint, observedBlock?: Block): void {
    if (this.stopped) return;
    const cursor = this.cursor;
    if (
      observedBlock &&
      cursor &&
      observedBlock.number === cursor.blockNumber &&
      observedBlock.hash &&
      observedBlock.hash !== cursor.blockHash
    ) {
      this.pendingResync = observedBlock;
    }
    if (blockNumber > this.requestedHead) this.requestedHead = blockNumber;
    if (!this.draining) {
      this.draining = this.drain()
        .catch((error: unknown) => {
          this.logError('block processing', error);
          // Wait for the next WS notification instead of retrying a failed
          // provider request in a tight loop.
          this.requestedHead = this.cursor!.blockNumber;
        })
        .finally(() => {
          this.draining = null;
          if (!this.stopped && (this.pendingResync || this.cursor!.blockNumber < this.requestedHead)) {
            this.request(this.requestedHead);
          }
        });
    }
  }

  private async drain(): Promise<void> {
    while (!this.stopped && (this.pendingResync || this.cursor!.blockNumber < this.requestedHead)) {
      if (this.pendingResync) {
        const block = this.pendingResync;
        this.pendingResync = null;
        console.warn(`[monitor] canonical hash changed at block ${block.number}; resyncing`);
        await this.resync(block);
        continue;
      }
      const nextNumber = this.cursor!.blockNumber + 1n;
      const block = await this.httpClient.getBlock({ blockNumber: nextNumber });
      if (block.hash === null) throw new Error(`block ${nextNumber} has no hash`);
      if (block.parentHash !== this.cursor!.blockHash) {
        console.warn(`[monitor] reorg detected before block ${nextNumber}; resyncing`);
        const latest = await this.httpClient.getBlock({ blockTag: 'latest' });
        await this.resync(latest);
        continue;
      }
      await this.processBlock(block);
    }
  }

  private async resync(block: Block): Promise<void> {
    try {
      await this.bootstrap(block);
    } catch (error) {
      this.logError('resync', error);
      throw error;
    }
  }

  private async processBlock(block: Block): Promise<void> {
    if (block.number === null || block.hash === null) return;
    const logs = await this.httpClient.getLogs({
      address: this.config.pools.map((pool) => pool.address),
      event: syncEvent,
      strict: true,
      fromBlock: block.number,
      toBlock: block.number,
    });
    const dirtyPools = new Set<string>();
    for (const log of logs) {
      const pool = this.poolsByAddress.get(log.address.toLowerCase());
      if (!pool) continue;
      this.states.set(pool.id, {
        poolId: pool.id,
        reserve0: log.args.reserve0,
        reserve1: log.args.reserve1,
        blockNumber: block.number,
        blockHash: block.hash,
      });
      dirtyPools.add(pool.id);
    }
    this.cursor = { blockNumber: block.number, blockHash: block.hash };
    if (dirtyPools.size > 0) this.evaluateDirty(dirtyPools, this.cursor);
    await this.persist();
    if (dirtyPools.size > 0) {
      console.log(`[block] number=${block.number} syncEvents=${logs.length} dirtyPools=${dirtyPools.size}`);
    }
  }

  private evaluateDirty(dirtyPools: Set<string>, cursor: Cursor): void {
    const markets = new Map<string, MarketConfig>();
    for (const poolId of dirtyPools) {
      for (const market of this.marketsByPool.get(poolId) ?? []) {
        markets.set(market.id, market);
      }
    }
    for (const market of markets.values()) {
      for (const evaluation of this.evaluateMarket(market, cursor)) {
        const base = this.tokens.get(market.baseToken)!;
        const minProfit = parseUnits(this.config.minNetProfitBase, base.decimals);
        if (this.config.logAllEvaluations || evaluation.netProfit >= minProfit) {
          this.printEvaluation(evaluation, base, evaluation.netProfit >= minProfit);
        }
      }
    }
  }

  private evaluateMarket(market: MarketConfig, cursor: Cursor): Evaluation[] {
    const base = this.tokens.get(market.baseToken)!;
    const fixedCost = parseUnits(this.config.fixedCostBase, base.decimals);
    const evaluations: Evaluation[] = [];
    for (let leftIndex = 0; leftIndex < market.poolIds.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < market.poolIds.length; rightIndex += 1) {
        const left = this.pools.get(market.poolIds[leftIndex]!)!;
        const right = this.pools.get(market.poolIds[rightIndex]!)!;
        const leftState = this.states.get(left.id)!;
        const rightState = this.states.get(right.id)!;
        for (const amount of market.amounts) {
          const amountIn = parseUnits(amount, base.decimals);
          evaluations.push(
            evaluateDirection({
              market,
              buyPool: left,
              sellPool: right,
              buyState: leftState,
              sellState: rightState,
              amountIn,
              flashLoanPremiumBps: this.config.flashLoanPremiumBps,
              fixedCost,
              blockNumber: cursor.blockNumber,
              blockHash: cursor.blockHash,
            }),
            evaluateDirection({
              market,
              buyPool: right,
              sellPool: left,
              buyState: rightState,
              sellState: leftState,
              amountIn,
              flashLoanPremiumBps: this.config.flashLoanPremiumBps,
              fixedCost,
              blockNumber: cursor.blockNumber,
              blockHash: cursor.blockHash,
            }),
          );
        }
      }
    }
    return evaluations;
  }

  private printEvaluation(evaluation: Evaluation, base: TokenConfig, opportunity: boolean): void {
    console.log(
      JSON.stringify({
        type: opportunity ? 'opportunity' : 'evaluation',
        market: evaluation.marketId,
        blockNumber: evaluation.blockNumber.toString(),
        blockHash: evaluation.blockHash,
        route: `${evaluation.buyPoolId}->${evaluation.sellPoolId}`,
        amountIn: formatUnits(evaluation.amountIn, base.decimals),
        finalOut: formatUnits(evaluation.finalOut, base.decimals),
        grossProfit: formatUnits(evaluation.grossProfit, base.decimals),
        flashLoanFee: formatUnits(evaluation.flashLoanFee, base.decimals),
        fixedCost: formatUnits(evaluation.fixedCost, base.decimals),
        netProfit: formatUnits(evaluation.netProfit, base.decimals),
        baseToken: base.symbol,
      }),
    );
  }

  private persist(): Promise<void> {
    return saveState(this.config.statePath, {
      chainId: this.config.chain.id,
      poolFingerprint: this.poolFingerprint,
      cursor: this.cursor!,
      pools: this.states.values(),
    });
  }

  private logError(scope: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[monitor] ${scope} error: ${message}`);
  }
}
