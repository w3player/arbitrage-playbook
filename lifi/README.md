# LI.FI 套利研究与回测

本项目研究并逐步实现六种基于 LI.FI 的套利与资产配置模型。完整模型目录见 [`docs/index.md`](./docs/index.md)。

## 当前开发重点

当前优先实现模型一“多链预置库存套利”。现有的 `collect`、`backtest` 和 `stress` 命令都服务于这个模型，不代表项目最终只支持该模型。

当前实现不会发送链上交易，只会：

1. 向 LI.FI 请求并保存当前报价；
2. 用已经保存的报价寻找两条链之间的 WETH/USDC 价差；
3. 模拟库存冻结、稍后成交、买卖只有一笔成功、紧急反向平仓和跨链补库存；
4. 与“什么都不交易、原样持有初始 WETH/USDC”比较。

## 环境

- Node.js 22.14 或更高版本；
- pnpm 11；
- 持续采集需要 LI.FI API key；
- 本项目使用 Node 自带的 SQLite，不增加数据库依赖。

通用功能直接使用成熟库：LI.FI 官方 `@lifi/sdk` 和 `@lifi/types` 负责报价与类型，`ky` 提供可对照的 REST 客户端，`p-limit` 控制并发，`zod` 校验配置，`commander` 解析命令，`csv-stringify` 生成 CSV。Ky 是默认实现；SDK 实现同样支持固定投入的 `/quote` 和固定到账的 `/quote/toAmount`。

依赖由你在仓库根目录安装：

```bash
pnpm i
```

## 1. 检查配置

默认配置是 [`config/backtest.example.json`](./config/backtest.example.json)，预置 Arbitrum 与 Base。先根据自己的研究资金修改：

- `tradeSizesWeth`：每次测试多少 WETH；
- `initialCapitalUsd`：模拟初始总资金；
- `initialWethWeightBps`：初始资金有多少比例是 WETH，`5000` 表示 50%；
- `minProfitUsd` 和 `minProfitBps`：至少看到多少净利润才模拟下单；
- `failure`：买入、卖出和共同故障的模拟概率；
- `rebalance`：跨链补库存触发线和不同结果的概率。

示例里的 `fromAddress` 只是固定研究地址。报价不动用该地址资金；真实使用前仍应换成你的执行地址，因为地址可能影响可用路径。

## 2. 采集报价

先做一次同链报价连通性检查：

```bash
pnpm --filter @arbitrage-playbook/lifi collect --once --stream same-chain
```

做一次全部报价检查：

```bash
pnpm --filter @arbitrage-playbook/lifi collect --once
```

改用 LI.FI SDK 采集同一批报价：

```bash
pnpm --filter @arbitrage-playbook/lifi collect --once --client sdk
```

两个客户端写入相同的数据结构。Ky 版使用项目配置的 429/5xx 重试策略；SDK 版使用 SDK 自带的请求与错误处理，并额外传入项目配置的超时信号。

连续采集：

```bash
LIFI_API_KEY=你的密钥 pnpm --filter @arbitrage-playbook/lifi collect
```

按 `Ctrl+C` 安全停止。成功与失败请求的完整原文都保存在 `lifi/data/quotes.sqlite` 的 `raw_json` 字段中；回测默认只读取成功报价。SQLite 开启 WAL，建议定期备份这个数据库文件。

LI.FI 不提供这些报价的完整历史重建能力，因此要先向前采集一段时间，再回测。短时间样本只能验证程序，不能证明策略能赚钱。

## 3. 运行回测

对数据库中的全部时间运行：

```bash
pnpm --filter @arbitrage-playbook/lifi backtest
```

限制时间并指定输出目录：

```bash
pnpm --filter @arbitrage-playbook/lifi backtest --from 2026-08-01T00:00:00Z --to 2026-08-07T00:00:00Z --output week-1
```

所有报告都写入 `lifi/data/reports/`。`--output` 只接收该目录下的相对名称；上例输出到 `lifi/data/reports/week-1/`。

结果目录包含：

- `summary.md`：适合人阅读的结论；
- `result.json`：完整机器可读结果；
- `trades.csv`：每笔模拟交易及失败恢复结果；
- `rebalances.csv`：跨链补库存记录；
- `equity.csv`：策略、原样持有基准和两者差值。

## 4. 批量压力测试

```bash
pnpm --filter @arbitrage-playbook/lifi stress
```

该命令自动运行 15 组情景，包括正常参数、手续费 2/5/10 倍、执行延迟 2/5 倍、流动性下降、漏报价、单链中断、买卖失败率上升、桥接变慢或异常、长期单向价差，以及 WETH 上下波动 30%。先看 `stress-summary.md`，再进入各情景子目录检查明细。

## 5. 检查代码

```bash
pnpm format
pnpm format:check
pnpm --filter @arbitrage-playbook/lifi check
pnpm --filter @arbitrage-playbook/lifi test
```

同一份报价、同一配置和同一 `randomSeed` 会得到相同结果。修改失败概率或随机种子后，应把它视为另一组实验，不要把多次实验里最好的一次当成结论。
