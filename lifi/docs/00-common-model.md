# 公共模型与统一风险口径

本篇定义六种模型共用的盈亏、库存、状态和回测口径。各模型只补充自身特有风险。

## 1. 标准库存模型

以 WETH/USDC 为例：

```text
便宜链：USDC -> +Q WETH
贵链：  -Q WETH -> USDC
```

两条腿均成功时，全局 WETH 近似不变，只是库存换了链；稳定币增量才是毛套利收益。手续费以 ETH/WETH 支付、成交量不一致或部分成交时，仍会残留 WETH 变化。

## 2. 统一盈亏公式

### 单次机会

```text
grossSpreadUsd = sellProceedsUsd - buyCostUsd

netArbitragePnlUsd
= grossSpreadUsd
- buyGasUsd - sellGasUsd - tradingFeesUsd
- expectedRebalanceCostUsd
- hedgeCostUsd
- failureLossReserveUsd
```

发现机会时必须使用可执行数量和 `toAmountMin`；展示价格或 `toAmount` 只能用于观察。

### 整体组合

```text
totalPnlUsd
= netArbitragePnlUsd
+ inventoryMarkToMarketUsd
+ hedgePnlUsd
- fundingOrBorrowCostUsd
- liquidationLossUsd
- operationalLossUsd
```

“价差赚钱”不等于组合美元净值上涨。未对冲 ETH 库存的市值变化，常常大于单次套利收益。

## 3. 统一风险表

| 风险 | 典型触发 | 直接损失 |
|---|---|---|
| 市场方向 | ETH/WETH 涨跌 | 库存减值、债务升值或相对 HODL 落后 |
| 单腿执行 | 一边成功，另一边 revert/超时 | 意外 Delta、补腿滑点与额外 Gas |
| 报价失效 | 报价、模拟、签名到上链期间状态变化 | revert Gas 或成交恶化 |
| 流动性 | 池深下降、大额冲击 | 价格影响扩大、无法补腿 |
| MEV | 公开 mempool、宽滑点 | sandwich、抢跑、back-run |
| Gas | 拥堵、估算错误、nonce 阻塞 | 毛利被吞噬或交易卡住 |
| 再平衡 | 桥接延迟、失败、部分完成 | 资本闲置、库存未恢复、收到中间 Token |
| 协议 | DEX、桥、借贷、永续或合约漏洞 | 部分至全部本金损失 |
| 链与基础设施 | sequencer/RPC/共识/重组/暂停 | 无法交易、提取或正确判断状态 |
| 资产 | 假 Token、包装资产、冻结、脱锚 | 无法兑换或价值跳跌 |
| 运维 | 私钥、nonce、精度、地址或配置错误 | 错链、错金额、重复发送、错误授权 |
| 模型 | 数据缺失、前视或幸存者偏差 | 回测盈利、实盘亏损 |

## 4. 单腿失败

不同链上的两笔交易不是一个原子事务：

| 情况 | 结果 | 主要损失 |
|---|---|---|
| 买入成功、卖出失败 | WETH 增加，意外做多 | 补卖时下跌、滑点、额外 Gas |
| 卖出成功、买入失败 | WETH 减少，相对做空 | 补买时上涨、滑点、额外 Gas |

```text
executionMismatchLoss
= abs(unmatchedAssetAmount) * adversePriceMove
+ emergencyTradeSlippage
+ emergencyGas
```

执行器必须定义：最大未匹配数量、最大暴露时间、紧急滑点上限，以及第一次补腿仍失败后的备用路径。

## 5. 跨链状态

不能只检查交易是否 `DONE`：

| 状态 | 含义 | 库存处理 |
|---|---|---|
| `DONE + COMPLETED` | 收到预期资产 | 核对地址、数量和确认数后转为可用 |
| `DONE + PARTIAL` | 收到中间资产，而非目标 Token | 隔离并进入恢复流程 |
| `DONE + REFUNDED` | 未完成，资产已退款 | 按真实退款链、Token、数量入账 |
| `FAILED` | 失败，可能需要人工或桥侧退款 | 保持在途，直至资产去向确认 |

`PARTIAL` 可能保持账面价值，却没有恢复下一轮所需库存。回测与实盘都必须按真实链和 Token 统计可用资本。

## 6. 资本与库存

```ts
interface ChainInventory {
  chainId: number
  tokenAddress: string
  availableAmount: bigint
  reservedAmount: bigint
  pendingBridgeAmount: bigint
  pendingTxAmount: bigint
}
```

只有最终确认、Token 地址匹配且未被其他订单预占的资产，才能计入 `availableAmount`。至少设置以下限额：

- 单链、单资产和单笔交易的 NAV 上限；
- 单桥在途、单地址 allowance 上限；
- 单日 Gas、失败损失上限；
- 停机后的最低应急余额。

## 7. 回测最低要求

### 数据

保存时间、区块、链、Token 地址、输入量、`toAmount`、`toAmountMin`、Gas、费用、工具、路线步骤、响应延迟和原始响应。

### 执行仿真

至少模拟：报价到发送延迟、两腿确认时间差、单腿失败、P50/P95 Gas、P50/P95 再平衡成本与耗时、`PARTIAL/REFUNDED/FAILED`、库存不足，以及 RPC/API 限流。

### 报告

- 总 PnL、相对基准超额 PnL、毛/净/最低输出价差；
- 最大回撤、单腿失败率与损失分布、价差半衰期；
- 不同金额容量曲线、资金利用率、跨链在途占比；
- 再平衡成本占毛利比例，以及各链/工具失败率。

## 8. 研究转小额实盘检查

- [ ] 按链 ID + Token 地址匹配资产，并正确处理 decimals。
- [ ] 已实现 fresh quote、报价过期与重新模拟。
- [ ] 已实现单腿失败后的补腿或临时对冲。
- [ ] 已实现 `PARTIAL/REFUNDED/FAILED` 状态机。
- [ ] 已设置链、桥、Token、交易和日损失限额。
- [ ] 回测使用 P95 成本，并覆盖库存不足和基础设施异常。
- [ ] 已完成至少一个完整波动周期的 paper trading。
- [ ] 已用小额实盘校准报价与实际成交偏差。
- [ ] 已定义日亏损、连续失败和基础设施异常的停机条件。
