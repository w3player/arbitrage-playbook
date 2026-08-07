# 基于 LI.FI 的六种套利模型

> 更新日期：2026-08-07
> 本目录用于策略研究、回测设计和风险评审，不构成收益承诺或个性化投资建议。

## 文档范围

LI.FI 是报价、路由和执行基础设施，不是历史行情库，也不能让跨链交易获得全局原子性。本目录研究如何利用 LI.FI 的同链报价、跨链路由、Intents、Earn、Composer 和状态跟踪能力构造六种策略模型。

## 阅读顺序

1. [公共模型与统一风险口径](./00-common-model.md)
2. [模型一：多链预置库存套利](./01-prefunded-cross-chain-inventory.md)
3. [模型二：稳定币跨链价差套利](./02-stablecoin-cross-chain-basis.md)
4. [模型三：同链 DEX 间套利](./03-same-chain-dex-arbitrage.md)
5. [模型四：Solver 与 DEX 报价差套利](./04-solver-vs-dex-arbitrage.md)
6. [模型五：跨链循环套利](./05-cross-chain-cycle-arbitrage.md)
7. [模型六：Earn 收益金库轮动](./06-earn-vault-rotation.md)

## 六种模型对比

| 模型 | 收益来源 | 是否要求预置库存 | 原子性 | 主要损失来源 | 推荐度 |
|---|---|---:|---|---|---:|
| 多链预置库存 | 不同链现货价差 | 是 | 每条链内部原子，整体非原子 | 方向敞口、单腿失败、再平衡 | 高 |
| 稳定币跨链价差 | 稳定币链间/版本基差 | 是 | 整体非原子 | 脱锚、桥包装资产、流动性枯竭 | 中高 |
| 同链 DEX 间套利 | 同链不同流动性场所价差 | 可选 | 需自有合约实现原子性 | MEV、Gas、两腿非原子、路线重叠 | 中 |
| Solver vs DEX | Solver 库存报价与 AMM 路由差 | 视执行方式 | 取决于订单与对冲结构 | 报价失效、填单/结算、对冲失败 | 中 |
| 跨链循环 | 跨链闭环后回到原资产的净增量 | 否或部分 | 非原子 | 桥接时延、价差消失、PARTIAL | 低 |
| Earn 金库轮动 | APY 差减迁移成本 | 是 | 同链阶段可原子，跨链整体非原子 | APY 衰减、本金损失、退出受限 | 中 |

## 先给结论

- 第一优先：多链预置库存套利。它把桥接移出对时延敏感的关键路径，最接近可持续执行模型。
- 第二优先：高质量稳定币跨链价差。方向波动较低，但必须把脱锚和桥接版本视为信用风险。
- 第三优先：同链 DEX 和 Solver vs DEX。适合做报价研究，生产执行需要更强的原子合约、对冲和 MEV 能力。
- 研究用途：跨链循环。可以发现结构性价差，但不能把当前两段报价当作可锁定利润。
- 配置用途：Earn 轮动。它更接近收益 carry，而不是瞬时无风险套利。

## 所有模型共同的前提

- 使用链 ID + Token 合约地址识别资产，不能只使用 symbol。
- 使用 `toAmountMin` 而非 `toAmount` 计算保守收益。
- 将 Gas、协议费、价格影响、失败准备金和资金机会成本全部计入。
- 建立报价年龄、链上模拟、nonce、RPC、余额和 allowance 检查。
- 对 `COMPLETED`、`PARTIAL`、`REFUNDED`、`FAILED` 建立状态机。
- 回测必须模拟一条腿失败、桥接延迟、流动性收缩和极端 Gas。
- 上线顺序应为：历史/快照回放 → paper trading → 小额实盘校准 → 限额自动执行。

## 主要官方参考

- [LI.FI Quote API](https://docs.li.fi/api-reference/get-a-quote-for-a-token-transfer)
- [LI.FI Advanced Routes](https://docs.li.fi/api-reference/advanced/get-a-set-of-routes-for-a-request-that-describes-a-transfer-of-tokens)
- [LI.FI API 延迟与路由等待策略](https://docs.li.fi/guides/latency)
- [LI.FI Status 与恢复](https://docs.li.fi/agents/workflows/status-recovery)
- [LI.FI Partial Completion](https://docs.li.fi/agents/workflows/partial-completion)
- [LI.FI Intents](https://docs.li.fi/lifi-intents/introduction)
- [LI.FI Earn](https://docs.li.fi/earn/overview)
- [LI.FI Composer 限制](https://docs.li.fi/composer/lifi-api/reference/limitations)
