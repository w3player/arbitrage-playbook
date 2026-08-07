# 模型四：Solver 与 DEX 报价差套利

## 一句话结论

比较 LI.FI Intents Solver 与普通 DEX/桥路由的同一经济交易。选择更优报价只是 best execution；只有一边价格可锁定，且另一边能近同时建立反向头寸，报价差才可能成为套利。

## 1. 模型与三种形态

```text
普通路由：li.quest /v1/quote
Intent：  order.li.fi /quote/request
```

Solver 可用自有库存、CEX、DEX 或私有流动性履约，报价可能优于或劣于公开 AMM。

| 形态 | 做法 | 本质 |
|---|---|---|
| Best execution | 比较 Solver 与普通 Route，选择净输出更高者 | 降低交易成本，不是独立套利 |
| Firm quote + 对冲 | 锁定 Solver 报价，同时在 DEX/CEX 反向交易 | `报价差 - 对冲与结算成本` |
| 作为 Solver | 发布 standing quote，收到订单后交付，再结算源链资产 | 专业做市；需要注册、库存、订单流、结算与信誉管理 |

## 2. 推荐前提

| 维度 | 必须具备 |
|---|---|
| 报价可比 | 输入/输出资产、链、数量、receiver、deadline 和 exact-input/output 语义一致；统一扣除 Gas、服务费、solver fee、桥费、对冲费和资金占用 |
| 报价状态 | 能区分指示性、可提交、已签名和已锁定；比较最低输出与订单约束，不只看展示价格 |
| 对冲 | 有足够深度的反向场所；可在订单暴露风险前或近同时成交；能处理未填、部分交付、过期和退款，并快速解除多余对冲 |
| 生命周期 | 同时接入普通 Quote、Intent Quote 和订单状态；维护 `Signed → Delivered → Settled`；区分 `fillDeadline` 与最终 `expires` |
| 结算 | 核验链上交付、oracle/settler 验证与资金释放；对 Solver、链、资产和路线设限 |
| Solver 模式 | 有多链目标资产库存、快速交付、standing quote、WebSocket/order flow 与信誉管理能力 |

## 3. 执行流程

### Integrator / 对冲模式

1. 构造统一经济请求，同时获取普通和 Intent 报价。
2. 标准化金额、费用、Gas、时效和成功条件。
3. 若只是用户交易，选择 best execution。
4. 若要套利，先确认一边价格可锁定，再执行反向对冲。
5. 跟踪 Intent 与对冲，直至交付、结算或退款。

### Solver 模式

1. 按金额区间发布 standing quotes。
2. 接收匹配订单，复核最新对冲价格和库存。
3. 在目标链交付资产，等待 oracle 验证。
4. 从 input settler 结算锁定资金。
5. 更新库存、PnL、延迟和信誉指标。

## 4. 盈亏

```text
netPnl
= lockedSolverPriceEdge
- hedgeSlippage - hedgeFees
- sourceAndDestinationGas
- settlementCost
- inventoryFundingCost
- timeoutOrUnwindLoss
- failureReserve
```

未锁定的报价只能记录为观察价差，不能计入可实现 PnL。

## 5. 损失与控制

| 风险 | 如何亏损 | 关键控制 |
|---|---|---|
| 指示性报价误当 firm | Solver 价格在提交/签名前变化；先做的对冲成为裸仓 | 显式标记观察、可提交、已签名、已锁定等状态 |
| 未按时交付 | `fillDeadline` 前未成交，可能到更晚的 `expires` 才能退款；资金与对冲持续占用 | 设置最大等待时间；计入 Funding、波动和资本成本 |
| 对冲成交、订单失败 | Solver 未填、拒绝或过期，解除对冲时承担反转、费率和滑点 | 限制对冲先行时间；预设撤销/反向成交路径 |
| 订单成交、对冲失败 | 交付已经发生，但外部流动性、API 或价格跳变阻止对冲 | 多对冲场所；优先控制净 Delta；设置仓位硬限额 |
| 延迟/免费期权 | 对手在有利时成交、不利时放弃，报价者承受负选择 | standing quote 纳入最坏延迟、波动和对冲成本 |
| 基差不一致 | 链、Token 版本、CEX 指数、赎回或桥接权利不同 | 用合约地址和真实结算权利判断经济等价 |
| Settlement/oracle | 已交付但证明/索引延迟；oracle/settler 异常；编码错误导致交付不被认可 | 本地校验订单 ID、链、地址和签名；跟踪至资金释放 |
| Solver 集中 | 单一 Solver 的报价质量、填单率或可用性恶化 | 按 Solver 统计并设信用、金额和路线限额 |
| 库存/资本 | 多链预置资产，源链资金结算前锁定，名义额收益率高估效率 | 按全部占用资本与真实时间计算收益率 |
| 签名/API | nonce、deadline、interoperable address、签名域或重试错误 | 严格本地校验、幂等提交和重放防护 |

## 6. 回测

同步保存普通 Quote、Intent Quote/有效期/类型、订单状态时间线、对冲盘口与可成交价、Funding/手续费/延迟，以及未填、退款、交付和结算结果。

不能假设观察到的 Solver Quote 必然成交；应按真实填单率、延迟和对冲失败率做概率回放。

报告：可锁定价差比例、填单率、对冲错配损失、平均/P95/P99 交付与结算时间、退款资本占用、各 Solver 的 PnL，以及相对普通 Route 的执行改善。

## 7. Go / No-Go

### Go

- [ ] 能区分 best execution 与可锁定套利。
- [ ] 对冲和订单生命周期可实时核验。
- [ ] 已计入未填订单的解除对冲损失。
- [ ] P95 交付/结算时延后仍有正期望。
- [ ] 单一 Solver 或对冲平台故障不危及全部资本。
- [ ] 签名、deadline、地址和重试逻辑经过测试。

### No-Go

- 直接相减两个同时看到的报价作为利润；
- 无法判断 Solver Quote 是否可锁定；
- 没有反向对冲和订单失败处置；
- 无法承受退款或结算期间的资金占用；
- 依赖单一 Solver 或单一对冲平台。

## 8. LI.FI 官方参考

- [LI.FI Intents 概览](https://docs.li.fi/lifi-intents/introduction)
- [LI.FI Intents API](https://docs.li.fi/lifi-intents/intents-api/api-overview)
- [LI.FI Solver 指南](https://docs.li.fi/lifi-intents/for-solvers/intro)
