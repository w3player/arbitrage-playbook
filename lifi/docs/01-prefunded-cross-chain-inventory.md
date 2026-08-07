# 模型一：多链预置库存套利

## 一句话结论

在便宜链买入、贵链卖出等量资产，桥接只负责事后补库存。它把桥接移出价格敏感路径，是六种模型中最值得优先研究的；代价是长期占用多链库存，并承担单腿失败和库存偏移。

## 1. 模型与 LI.FI 的作用

```text
便宜链：USDC -> 买入 Q WETH
贵链：  卖出 Q WETH -> USDC
```

两腿成功后，全局 WETH 近似不变，WETH 与 USDC 只是在链间迁移；全局 USDC 增量是毛利。优先等待反向机会自然恢复库存，越界时再跨链。

LI.FI 用于获取各链可执行 Quote、控制 exchange 来源、提供 `toAmountMin`/Gas/费用/approval/calldata、生成再平衡 Route，并通过 `/status` 核对实际到账。它不能让不同链的两笔交易原子化，也不承担单腿失败的敞口。

## 2. 推荐前提

| 维度 | 必须具备 |
|---|---|
| 市场 | 两链都有持续流动性；价差寿命覆盖报价、模拟、签名和上链；多金额档位仍有净利；Token 无异常税费/限制；P95 再平衡成本可接受 |
| 资金 | 各链有买入资产、卖出资产和 gas；有补腿用应急稳定币；在途资产不算可用；收益率按闲置与在途资本计算 |
| 系统 | 监控 RPC、余额、nonce、gas、allowance；超时重报与重模拟；按目标资产数量匹配并处理 decimals；两腿尽量同时发送；具备补腿/减仓/对冲和跨链异常恢复 |
| MEV | 有私有提交或明确量化公开 mempool 的 sandwich、抢跑与失败 Gas |

研究起始值可设为：

```text
单链 NAV：总策略 NAV 的 25%–35%
单笔用量：该链对应资产可用库存的 5%–10%
单腿敞口：总 NAV 的 1%–2%
Gas 储备：至少 20 笔交易
应急稳定币：至少 2 个最大批次
```

这些只是待回测参数，不是通用安全线。

## 3. 库存融资方式

| 方式 | 适用前提 | 新增风险 | 推荐 |
|---|---|---|---|
| 长期持币增强 | 本来就长期持有 ETH/WETH | 承担完整价格回撤；需与同等 HODL 比较超额收益 | 首选 |
| 永续对冲 | 有低杠杆保证金、Funding/清算监控和备用对冲场所 | Funding、基差、平台、清算和数量错配 | 次选 |
| 借入 WETH | 有超额抵押、保守 Health Factor、应急还款与利率监控 | 利率跳升、抵押品下跌、清算、跨链无法还款 | 最复杂，不建议首版 |

永续版本的净 Delta：

```text
netDeltaEth = totalSpotEth - shortPerpEth
```

因此，“适合长期持有时才做”只适用于未对冲版本；对冲和借币版本不要求长期看多，但会引入更复杂、可能更致命的风险。

## 4. 执行流程

1. 获取各链相同金额档位的双向 Quote，计算有效买卖价。
2. 发现候选后重新询价，并按实际 WETH 数量对齐两腿。
3. 以 `toAmountMin` 扣除两边 Gas、费用、预期再平衡和失败准备金。
4. 检查库存、nonce、RPC、allowance 和报价年龄。
5. 尽量同时提交买卖；用各自最低输出和 deadline 保护。
6. 读取 receipt 与真实余额，核对两边成交数量。
7. 更新 `available/reserved/pending` 库存。
8. 先等待反向成交；达到软/硬阈值后才净额再平衡。

## 5. 盈亏

```text
netArbitragePnlUsd
= sellProceedsUsd - buyCostUsd
- buyGasUsd - sellGasUsd - tradingFeesUsd
- expectedRebalanceCostUsd
- hedgeOrBorrowCostUsd
- expectedFailureLossUsd

totalPnl
= netArbitragePnl
+ inventoryMarkToMarket
+ hedgePnl
- fundingOrBorrowInterest
- liquidationLoss
- operationalLoss
```

## 6. 损失与控制

| 风险 | 如何亏损 | 关键控制 |
|---|---|---|
| 资产方向 | 未对冲 WETH 下跌；上涨时卖出成功、买入失败会落后 HODL | 单独报告库存市值与相对 HODL；设净 Delta 阈值 |
| 单腿失败 | 意外做多/做空；补腿遭遇反转、滑点、MEV 和额外 Gas | 限制提交时间差、未匹配量与暴露时间；预设补腿和备用对冲 |
| 数量不匹配 | 相同美元金额不等于相同 WETH；费用、冲击、decimals 留下残余 Delta | 按目标资产数量匹配；成交后按余额校准 |
| 报价过期 | 池状态改变、排队、第三方响应慢；严格滑点导致 revert，宽滑点被 MEV 抽取 | 报价最大年龄、重报、重模拟、`toAmountMin` 与私有提交 |
| 再平衡 | 桥费和双链 Gas；在途闲置；目标 swap 失败；`PARTIAL` 收到中间 Token；单向价差迫使昂贵补库 | 优先自然反向；设置在途上限；按实际 Token 入账；准备替代桥和恢复路径 |
| 流动性/容量 | 小额利润无法外推；紧急补腿时深度更差 | 多金额容量曲线和危机深度压力测试 |
| 链/协议/基础设施 | sequencer、RPC、桥、DEX Router 或 LI.FI 合约异常 | 链、Token、桥、DEX、RPC 分散与限额；异常自动停机 |
| 对冲/借款 | Funding、基差、平台信用、清算；借款利率、抵押品、Health Factor 与还款失败 | 低杠杆、独立风控、备用场所和应急还款资金 |
| 运维 | 错地址、decimals、chain ID、无限授权、nonce、重复重试、私钥泄露 | 严格白名单、最小授权、幂等重试、密钥隔离与对账 |

单腿错配损失沿用[公共模型](./00-common-model.md)：

```text
mismatchLoss
= unmatchedWeth * adversePriceMove
+ emergencySlippage
+ emergencyGas
```

连续失败、Gas 异常、RPC 分叉、余额不一致或桥暂停时应自动停机；先控制总方向敞口，再恢复链级库存。

## 7. 回测

至少采集每链双向 Quote、`toAmountMin`、Gas、费用、响应延迟、区块号、真实池状态、多金额容量、两腿确认时间/失败率、桥接耗时/状态/到账 Token，以及永续 Funding 或借款 APR。

必须报告：净价差、价差半衰期、资本利用率、相对 HODL 超额收益、最大净 Delta、单腿失败损失、再平衡成本占毛利比例和最大回撤。

## 8. Go / No-Go

### Go

- [ ] P95 全成本后仍有稳定正边际。
- [ ] 单腿失败压力损失不超过预算。
- [ ] 再平衡不系统性吞噬毛利。
- [ ] 任一链停机不危及全部资金。
- [ ] 方向、Funding、借款与清算风险已独立计价。
- [ ] paper trading 与小额实盘偏差在模型允许范围内。

### No-Go

- 无法承担多链闲置库存或自动处理单腿失败；
- 只看展示价格，不获取可执行 Quote；
- 需要等待桥接后才能完成卖出；
- 只有使用高杠杆时收益才有吸引力。
