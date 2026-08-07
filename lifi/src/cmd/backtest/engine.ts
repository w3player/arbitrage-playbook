import type {
  AssetSymbol,
  BacktestResult,
  EquityPoint,
  InventoryBalance,
  NormalizedQuote,
  OpportunityFrame,
  RebalanceOutcome,
  RebalanceRecord,
  TradeOutcome,
  TradeRecord,
} from '../../types/types.js';
import type { AppConfig } from '../../config.js';
import { mulDiv, parseUsd, pow10, tokenAmountToUsdMicros, usdMicrosToTokenAmount } from '../../utils/index.js';
import { SeededRandom } from '../../lib/seeded-random.js';
import { QuoteIndex } from '../../biz/quote-index.js';

interface ScheduledTrade {
  type: 'trade';
  atMs: number;
  frame: OpportunityFrame;
}

interface ScheduledRebalance {
  type: 'rebalance';
  atMs: number;
  id: string;
  quote: NormalizedQuote;
  startedAtMs: number;
}

type ScheduledEvent = ScheduledTrade | ScheduledRebalance;

function emptyBalance(): InventoryBalance {
  return {
    wethAvailable: 0n,
    usdcAvailable: 0n,
    wethReserved: 0n,
    usdcReserved: 0n,
    wethPending: 0n,
    usdcPending: 0n,
    wethStranded: 0n,
    usdcStranded: 0n,
  };
}

function cloneBalance(balance: InventoryBalance): InventoryBalance {
  return { ...balance };
}

function costOf(quote: NormalizedQuote): bigint {
  return quote.gasUsdMicros + quote.nonIncludedFeeUsdMicros;
}

function addReason(reasons: Record<string, number>, reason: string): void {
  reasons[reason] = (reasons[reason] ?? 0) + 1;
}

function assetField(asset: AssetSymbol, suffix: 'Available' | 'Pending' | 'Stranded'): keyof InventoryBalance {
  return `${asset.toLowerCase()}${suffix}` as keyof InventoryBalance;
}

export class BacktestEngine {
  private readonly inventory = new Map<number, InventoryBalance>();
  private readonly initialInventory = new Map<number, InventoryBalance>();
  private readonly events: ScheduledEvent[] = [];
  private readonly trades: TradeRecord[] = [];
  private readonly rebalances: RebalanceRecord[] = [];
  private readonly equity: EquityPoint[] = [];
  private readonly rejected: Record<string, number> = {};
  private readonly cooldowns = new Map<string, number>();
  private readonly pendingRebalances = new Set<string>();
  private readonly random: SeededRandom;
  private readonly quoteIndex: QuoteIndex;
  private externalCostUsdMicros = 0n;
  private currentMarkUsdMicros: bigint;
  private opportunitiesSeen = 0;
  private tradeSequence = 0;
  private rebalanceSequence = 0;
  private startedAtMs = 0;
  private endedAtMs = 0;

  constructor(
    private readonly config: AppConfig,
    quotes: NormalizedQuote[],
  ) {
    this.random = new SeededRandom(config.backtest.randomSeed);
    this.quoteIndex = new QuoteIndex(quotes);
    this.currentMarkUsdMicros = parseUsd(config.backtest.initialWethPriceUsd);
    this.initializeInventory();
  }

  run(frames: OpportunityFrame[], range?: { fromMs?: number; toMs?: number }): BacktestResult {
    const selectedFrames = frames.filter(
      (frame) =>
        (range?.fromMs === undefined || frame.timestampMs >= range.fromMs) &&
        (range?.toMs === undefined || frame.timestampMs <= range.toMs),
    );
    this.startedAtMs = range?.fromMs ?? selectedFrames[0]?.timestampMs ?? Date.now();
    this.endedAtMs = range?.toMs ?? selectedFrames.at(-1)?.timestampMs ?? this.startedAtMs;
    this.recordEquity(this.startedAtMs);

    for (const frame of selectedFrames) {
      this.processEventsThrough(frame.timestampMs);
      if (frame.markWethPriceUsdMicros > 0n) this.currentMarkUsdMicros = frame.markWethPriceUsdMicros;
      this.recordEquity(frame.timestampMs);
      this.consider(frame);
      this.maybeScheduleRebalances(frame.timestampMs);
    }
    this.processEventsThrough(Number.POSITIVE_INFINITY);
    const finalTimestamp = Math.max(this.endedAtMs, this.equity.at(-1)?.timestampMs ?? this.endedAtMs);
    this.endedAtMs = finalTimestamp;
    this.recordEquity(finalTimestamp);

    const finalPoint = this.equity.at(-1) ?? this.makeEquityPoint(finalTimestamp);
    const drawdown = this.calculateDrawdown();
    return {
      startedAtMs: this.startedAtMs,
      endedAtMs: this.endedAtMs,
      initialCapitalUsdMicros: parseUsd(this.config.backtest.initialCapitalUsd),
      finalStrategyValueUsdMicros: finalPoint.strategyValueUsdMicros,
      finalHoldValueUsdMicros: finalPoint.holdValueUsdMicros,
      excessValueUsdMicros: finalPoint.excessValueUsdMicros,
      externalCostUsdMicros: this.externalCostUsdMicros,
      maxDrawdownUsdMicros: drawdown.amount,
      maxDrawdownBps: drawdown.bps,
      opportunitiesSeen: this.opportunitiesSeen,
      opportunitiesRejected: { ...this.rejected },
      trades: [...this.trades],
      rebalances: [...this.rebalances],
      equity: [...this.equity],
      finalInventory: Object.fromEntries(
        [...this.inventory.entries()].map(([chainId, balance]) => [chainId, cloneBalance(balance)]),
      ),
    };
  }

  private initializeInventory(): void {
    const capital = parseUsd(this.config.backtest.initialCapitalUsd);
    const wethPrice = parseUsd(this.config.backtest.initialWethPriceUsd);
    for (const chain of this.config.chains) {
      const chainCapital = mulDiv(capital, BigInt(chain.weightBps), 10_000n);
      const wethValue = mulDiv(chainCapital, BigInt(this.config.backtest.initialWethWeightBps), 10_000n);
      const usdcValue = chainCapital - wethValue;
      const balance = emptyBalance();
      balance.wethAvailable = mulDiv(wethValue, pow10(chain.wethDecimals), wethPrice);
      balance.usdcAvailable = usdMicrosToTokenAmount(usdcValue, chain.usdcDecimals);
      this.inventory.set(chain.chainId, balance);
      this.initialInventory.set(chain.chainId, cloneBalance(balance));
    }
  }

  private balance(chainId: number): InventoryBalance {
    const balance = this.inventory.get(chainId);
    if (!balance) throw new Error(`Unknown chain ${chainId}`);
    return balance;
  }

  private consider(frame: OpportunityFrame): void {
    this.opportunitiesSeen += 1;
    if (frame.expectedNetUsdMicros < parseUsd(this.config.backtest.minProfitUsd)) {
      addReason(this.rejected, 'profit-below-usd-threshold');
      return;
    }
    if (frame.expectedProfitBps < this.config.backtest.minProfitBps) {
      addReason(this.rejected, 'profit-below-bps-threshold');
      return;
    }
    const direction = `${frame.buyChainId}->${frame.sellChainId}`;
    if ((this.cooldowns.get(direction) ?? 0) > frame.timestampMs) {
      addReason(this.rejected, 'direction-cooldown');
      return;
    }
    const openTrades = this.events.filter((event) => event.type === 'trade').length;
    if (openTrades >= this.config.backtest.maxConcurrentTrades) {
      addReason(this.rejected, 'too-many-open-trades');
      return;
    }
    const buyBalance = this.balance(frame.buyChainId);
    const sellBalance = this.balance(frame.sellChainId);
    if (buyBalance.usdcAvailable < frame.buyCostUsdc) {
      addReason(this.rejected, 'not-enough-usdc-on-buy-chain');
      return;
    }
    if (sellBalance.wethAvailable < frame.targetWeth) {
      addReason(this.rejected, 'not-enough-weth-on-sell-chain');
      return;
    }
    const totalInitialWeth = [...this.initialInventory.values()].reduce(
      (sum, balance) => sum + balance.wethAvailable,
      0n,
    );
    const maximumTrade = mulDiv(totalInitialWeth, BigInt(this.config.backtest.maxTradeInventoryBps), 10_000n);
    if (frame.targetWeth > maximumTrade) {
      addReason(this.rejected, 'trade-size-above-inventory-limit');
      return;
    }

    buyBalance.usdcAvailable -= frame.buyCostUsdc;
    buyBalance.usdcReserved += frame.buyCostUsdc;
    sellBalance.wethAvailable -= frame.targetWeth;
    sellBalance.wethReserved += frame.targetWeth;
    this.events.push({ type: 'trade', atMs: frame.timestampMs + this.config.backtest.executionDelayMs, frame });
    this.cooldowns.set(direction, frame.timestampMs + this.config.backtest.cooldownMs);
  }

  private processEventsThrough(timestampMs: number): void {
    this.events.sort((left, right) => left.atMs - right.atMs);
    while (this.events.length > 0) {
      const event = this.events[0];
      if (event === undefined || event.atMs > timestampMs) break;
      this.events.shift();
      if (event.type === 'trade') this.settleTrade(event);
      else this.settleRebalance(event);
      this.endedAtMs = Math.max(this.endedAtMs, event.atMs);
      this.recordEquity(event.atMs);
    }
  }

  private settleTrade(event: ScheduledTrade): void {
    const { frame } = event;
    const futureUntil = event.atMs + this.config.backtest.futureQuoteToleranceMs;
    const futureBuy = this.quoteIndex.findFirstSameChain(
      'buy-exact-output',
      frame.buyChainId,
      frame.targetWeth,
      event.atMs,
      futureUntil,
    );
    const futureSell = this.quoteIndex.findFirstSameChain(
      'sell-exact-input',
      frame.sellChainId,
      frame.targetWeth,
      event.atMs,
      futureUntil,
    );
    const correlatedFailure = this.random.hitBps(this.config.backtest.failure.correlatedFailureBps);
    const buyQuoteValid = futureBuy !== undefined && futureBuy.fromAmount <= frame.buyCostUsdc;
    const sellQuoteValid = futureSell !== undefined && futureSell.toAmountMin >= frame.sellMinUsdc;
    const missingAllowed = !this.config.backtest.missingFutureQuoteIsFailure;
    const buySucceeded =
      !correlatedFailure &&
      (buyQuoteValid || (futureBuy === undefined && missingAllowed)) &&
      !this.random.hitBps(this.config.backtest.failure.buyFailureBps);
    const sellSucceeded =
      !correlatedFailure &&
      (sellQuoteValid || (futureSell === undefined && missingAllowed)) &&
      !this.random.hitBps(this.config.backtest.failure.sellFailureBps);
    const executedBuy = futureBuy ?? frame.buy;
    const executedSell = futureSell ?? frame.sell;
    const buyBalance = this.balance(frame.buyChainId);
    const sellBalance = this.balance(frame.sellChainId);
    const cashBefore = this.totalUsdcUsdMicros();

    buyBalance.usdcReserved -= frame.buyCostUsdc;
    if (buySucceeded) {
      buyBalance.usdcAvailable += frame.buyCostUsdc - executedBuy.fromAmount;
      buyBalance.wethAvailable += frame.targetWeth;
    } else {
      buyBalance.usdcAvailable += frame.buyCostUsdc;
    }
    sellBalance.wethReserved -= frame.targetWeth;
    if (sellSucceeded) sellBalance.usdcAvailable += executedSell.toAmountMin;
    else sellBalance.wethAvailable += frame.targetWeth;

    let cost = costOf(executedBuy) + costOf(executedSell);
    this.externalCostUsdMicros += cost;
    let outcome: TradeOutcome;
    let recoveryAtMs: number | undefined;
    if (buySucceeded && sellSucceeded) {
      outcome = 'both-succeeded';
    } else if (!buySucceeded && !sellSucceeded) {
      outcome = 'both-failed';
    } else if (buySucceeded) {
      const recovery = this.recoverBySelling(frame.buyChainId, frame.targetWeth, event.atMs);
      cost += recovery.cost;
      if (recovery.succeeded) {
        outcome = 'buy-succeeded-sell-failed-recovered';
        recoveryAtMs = recovery.atMs;
      } else outcome = 'buy-succeeded-sell-failed-unresolved';
    } else {
      const recovery = this.recoverByBuying(frame.sellChainId, frame.targetWeth, event.atMs);
      cost += recovery.cost;
      if (recovery.succeeded) {
        outcome = 'buy-failed-sell-succeeded-recovered';
        recoveryAtMs = recovery.atMs;
      } else outcome = 'buy-failed-sell-succeeded-unresolved';
    }

    const settledAtMs = recoveryAtMs ?? event.atMs;
    const cashAfter = this.totalUsdcUsdMicros();
    this.tradeSequence += 1;
    this.trades.push({
      id: `trade-${this.tradeSequence}`,
      decisionAtMs: frame.timestampMs,
      settledAtMs,
      buyChainId: frame.buyChainId,
      sellChainId: frame.sellChainId,
      targetWeth: frame.targetWeth,
      expectedNetUsdMicros: frame.expectedNetUsdMicros,
      ...(!outcome.endsWith('unresolved') ? { realizedCashPnlUsdMicros: cashAfter - cashBefore - cost } : {}),
      costUsdMicros: cost,
      outcome,
      ...(recoveryAtMs === undefined ? {} : { recoveryAtMs }),
    });
  }

  private recoverBySelling(
    chainId: number,
    amount: bigint,
    fromMs: number,
  ): { succeeded: boolean; atMs?: number; cost: bigint } {
    const quote = this.quoteIndex.findFirstSameChain(
      'sell-exact-input',
      chainId,
      amount,
      fromMs,
      fromMs + this.config.backtest.emergencyMaxDelayMs,
    );
    const balance = this.balance(chainId);
    if (!quote || balance.wethAvailable < amount) return { succeeded: false, cost: 0n };
    balance.wethAvailable -= amount;
    balance.usdcAvailable += quote.toAmountMin;
    const cost = costOf(quote);
    this.externalCostUsdMicros += cost;
    return { succeeded: true, atMs: quote.receivedAtMs, cost };
  }

  private recoverByBuying(
    chainId: number,
    amount: bigint,
    fromMs: number,
  ): { succeeded: boolean; atMs?: number; cost: bigint } {
    const quote = this.quoteIndex.findFirstSameChain(
      'buy-exact-output',
      chainId,
      amount,
      fromMs,
      fromMs + this.config.backtest.emergencyMaxDelayMs,
    );
    const balance = this.balance(chainId);
    if (!quote || balance.usdcAvailable < quote.fromAmount) return { succeeded: false, cost: 0n };
    balance.usdcAvailable -= quote.fromAmount;
    balance.wethAvailable += amount;
    const cost = costOf(quote);
    this.externalCostUsdMicros += cost;
    return { succeeded: true, atMs: quote.receivedAtMs, cost };
  }

  private maybeScheduleRebalances(timestampMs: number): void {
    const config = this.config.backtest.rebalance;
    if (!config.enabled) return;
    for (const asset of ['WETH', 'USDC'] as const) {
      for (const destination of this.config.chains) {
        const targetBalance = this.initialInventory.get(destination.chainId);
        if (!targetBalance) continue;
        const target = asset === 'WETH' ? targetBalance.wethAvailable : targetBalance.usdcAvailable;
        const availableField = assetField(asset, 'Available');
        const available = this.balance(destination.chainId)[availableField];
        const hardLimit = mulDiv(target, BigInt(config.hardLimitBps), 10_000n);
        if (available >= hardLimit) continue;
        const pendingKey = `${asset}:${destination.chainId}`;
        if (this.pendingRebalances.has(pendingKey)) continue;
        if ((this.cooldowns.get(`rebalance:${pendingKey}`) ?? 0) > timestampMs) continue;

        const source = this.config.chains
          .filter((chain) => chain.chainId !== destination.chainId)
          .map((chain) => ({ chain, balance: this.balance(chain.chainId)[availableField] }))
          .sort((left, right) => (left.balance === right.balance ? 0 : left.balance > right.balance ? -1 : 1))[0];
        if (!source) continue;
        const sourceTargetBalance = this.initialInventory.get(source.chain.chainId);
        if (!sourceTargetBalance) continue;
        const sourceTarget = asset === 'WETH' ? sourceTargetBalance.wethAvailable : sourceTargetBalance.usdcAvailable;
        const sourceFloor = mulDiv(sourceTarget, BigInt(config.hardLimitBps), 10_000n);
        const movable = source.balance > sourceFloor ? source.balance - sourceFloor : 0n;
        const needed = target - available;
        const maximum = movable < needed ? movable : needed;
        if (maximum <= 0n) continue;
        const quote = this.quoteIndex.findBridge(
          source.chain.chainId,
          destination.chainId,
          asset,
          maximum,
          timestampMs,
          config.quoteMaxAgeMs,
        );
        if (!quote) continue;
        this.balance(source.chain.chainId)[availableField] -= quote.fromAmount;
        this.balance(destination.chainId)[assetField(asset, 'Pending')] += quote.toAmountMin;
        this.pendingRebalances.add(pendingKey);
        this.cooldowns.set(`rebalance:${pendingKey}`, timestampMs + config.cooldownMs);
        this.rebalanceSequence += 1;
        this.events.push({
          type: 'rebalance',
          id: `rebalance-${this.rebalanceSequence}`,
          startedAtMs: timestampMs,
          atMs: timestampMs + (quote.executionDurationMs || config.defaultDurationMs),
          quote,
        });
      }
    }
  }

  private settleRebalance(event: ScheduledRebalance): void {
    const { quote } = event;
    const destination = this.balance(quote.toChainId);
    const source = this.balance(quote.fromChainId);
    const pendingField = assetField(quote.assetSymbol, 'Pending');
    const availableField = assetField(quote.assetSymbol, 'Available');
    const strandedField = assetField(quote.assetSymbol, 'Stranded');
    destination[pendingField] -= quote.toAmountMin;
    const roll = this.random.nextInt(10_000);
    const config = this.config.backtest.rebalance;
    let outcome: RebalanceOutcome;
    if (roll < config.completedBps) {
      outcome = 'completed';
      destination[availableField] += quote.toAmountMin;
    } else if (roll < config.completedBps + config.refundedBps) {
      outcome = 'refunded';
      source[availableField] += quote.fromAmount;
    } else if (roll < config.completedBps + config.refundedBps + config.partialBps) {
      outcome = 'partial';
      destination[strandedField] += quote.toAmountMin / 2n;
    } else {
      outcome = 'failed';
      source[availableField] += mulDiv(quote.fromAmount, BigInt(config.failedRecoveryBps), 10_000n);
    }
    const cost = costOf(quote);
    this.externalCostUsdMicros += cost;
    this.pendingRebalances.delete(`${quote.assetSymbol}:${quote.toChainId}`);
    this.rebalances.push({
      id: event.id,
      startedAtMs: event.startedAtMs,
      completedAtMs: event.atMs,
      fromChainId: quote.fromChainId,
      toChainId: quote.toChainId,
      assetSymbol: quote.assetSymbol,
      fromAmount: quote.fromAmount,
      toAmountMin: quote.toAmountMin,
      costUsdMicros: cost,
      outcome,
    });
  }

  private totalUsdcUsdMicros(): bigint {
    let total = 0n;
    for (const chain of this.config.chains) {
      const balance = this.balance(chain.chainId);
      total += tokenAmountToUsdMicros(
        balance.usdcAvailable + balance.usdcReserved + balance.usdcPending + balance.usdcStranded,
        chain.usdcDecimals,
      );
    }
    return total;
  }

  private makeEquityPoint(timestampMs: number): EquityPoint {
    let strategy = -this.externalCostUsdMicros;
    let hold = 0n;
    for (const chain of this.config.chains) {
      const balance = this.balance(chain.chainId);
      const initial = this.initialInventory.get(chain.chainId);
      if (!initial) continue;
      const weth = balance.wethAvailable + balance.wethReserved + balance.wethPending + balance.wethStranded;
      const usdc = balance.usdcAvailable + balance.usdcReserved + balance.usdcPending + balance.usdcStranded;
      strategy += tokenAmountToUsdMicros(usdc, chain.usdcDecimals);
      strategy += mulDiv(weth, this.currentMarkUsdMicros, pow10(chain.wethDecimals));
      hold += tokenAmountToUsdMicros(initial.usdcAvailable, chain.usdcDecimals);
      hold += mulDiv(initial.wethAvailable, this.currentMarkUsdMicros, pow10(chain.wethDecimals));
    }
    return {
      timestampMs,
      strategyValueUsdMicros: strategy,
      holdValueUsdMicros: hold,
      excessValueUsdMicros: strategy - hold,
      externalCostUsdMicros: this.externalCostUsdMicros,
    };
  }

  private recordEquity(timestampMs: number): void {
    const point = this.makeEquityPoint(timestampMs);
    const previous = this.equity.at(-1);
    if (previous?.timestampMs === timestampMs) this.equity[this.equity.length - 1] = point;
    else this.equity.push(point);
  }

  private calculateDrawdown(): { amount: bigint; bps: number } {
    let peak = this.equity[0]?.strategyValueUsdMicros ?? 0n;
    let maximum = 0n;
    let maximumBps = 0;
    for (const point of this.equity) {
      if (point.strategyValueUsdMicros > peak) peak = point.strategyValueUsdMicros;
      const drawdown = peak - point.strategyValueUsdMicros;
      if (drawdown > maximum) maximum = drawdown;
      if (peak > 0n) maximumBps = Math.max(maximumBps, Number(mulDiv(drawdown, 10_000n, peak)));
    }
    return { amount: maximum, bps: maximumBps };
  }
}
