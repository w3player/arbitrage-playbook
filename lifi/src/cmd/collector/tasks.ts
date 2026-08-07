import type { AppConfig } from '../../config.js';
import type { QuoteTask } from '../../types/types.js';
import { parseUnits } from '../../utils/index.js';

export function buildSameChainTasks(config: AppConfig): QuoteTask[] {
  return config.chains.flatMap((chain) =>
    config.tradeSizesWeth.flatMap((size) => {
      const amount = parseUnits(size, chain.wethDecimals).toString();
      return [
        {
          stream: 'same-chain' as const,
          kind: 'buy-exact-output' as const,
          amountMode: 'exact-output' as const,
          assetSymbol: 'WETH' as const,
          fromChainId: chain.chainId,
          toChainId: chain.chainId,
          fromTokenAddress: chain.usdcAddress,
          toTokenAddress: chain.wethAddress,
          amount,
          amountDecimals: chain.wethDecimals,
        },
        {
          stream: 'same-chain' as const,
          kind: 'sell-exact-input' as const,
          amountMode: 'exact-input' as const,
          assetSymbol: 'WETH' as const,
          fromChainId: chain.chainId,
          toChainId: chain.chainId,
          fromTokenAddress: chain.wethAddress,
          toTokenAddress: chain.usdcAddress,
          amount,
          amountDecimals: chain.wethDecimals,
        },
      ];
    }),
  );
}

export function buildRebalanceTasks(config: AppConfig): QuoteTask[] {
  const tasks: QuoteTask[] = [];
  for (const fromChain of config.chains) {
    for (const toChain of config.chains) {
      if (fromChain.chainId === toChain.chainId) continue;
      for (const size of config.rebalanceSizes.WETH) {
        tasks.push({
          stream: 'rebalance',
          kind: 'bridge-exact-input',
          amountMode: 'exact-input',
          assetSymbol: 'WETH',
          fromChainId: fromChain.chainId,
          toChainId: toChain.chainId,
          fromTokenAddress: fromChain.wethAddress,
          toTokenAddress: toChain.wethAddress,
          amount: parseUnits(size, fromChain.wethDecimals).toString(),
          amountDecimals: fromChain.wethDecimals,
        });
      }
      for (const size of config.rebalanceSizes.USDC) {
        tasks.push({
          stream: 'rebalance',
          kind: 'bridge-exact-input',
          amountMode: 'exact-input',
          assetSymbol: 'USDC',
          fromChainId: fromChain.chainId,
          toChainId: toChain.chainId,
          fromTokenAddress: fromChain.usdcAddress,
          toTokenAddress: toChain.usdcAddress,
          amount: parseUnits(size, fromChain.usdcDecimals).toString(),
          amountDecimals: fromChain.usdcDecimals,
        });
      }
    }
  }
  return tasks;
}
