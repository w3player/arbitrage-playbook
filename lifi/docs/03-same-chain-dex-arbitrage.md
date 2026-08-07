# 模型三：同链 DEX 间套利

## 一句话结论

在同链的独立流动性场所完成 `起始资产 → 中间资产 → 起始资产`。生产可行性的核心不是看到两个不同报价，而是用自有合约在一笔交易中执行完整循环，并在链上验证最低利润。

## 1. 模型与 LI.FI 的作用

```text
USDC -> WETH（便宜场所）
WETH -> USDC（贵场所）
最终 USDC > 初始 USDC + 全部成本
```

LI.FI 可提供同链 Swap Quote、按 `allowExchanges` 限制来源，以及 `toAmountMin`、Gas、approval 和 calldata；也可用不同金额测试价格影响。

边界：1inch、0x、Odos 等聚合器可能访问同一个底层池；聚合器报价不同不等于可套利。两份普通 `transactionRequest` 分开发送不具备原子性；LI.FI Contract Calls 处于 Beta，不能未经审计就直接承担高频原子执行。

## 2. 推荐前提

| 维度 | 必须具备 |
|---|---|
| 原子执行 | 经测试/审计的合约在一笔交易执行两腿，并以最终余额验证 `minProfit`；否则只适合研究 |
| 安全 | Token、Router、spender、function selector 严格白名单；不接受任意 calldata；长期资产与执行资金隔离 |
| 仿真与提交 | 用目标区块状态模拟完整序列；模拟与提交节点同步；具备私有 relay/可信 builder 或已量化公开 mempool 损失 |
| 路由与资产 | 识别真实底层池，排除路线重叠；Token 无未知 transfer tax、rebase、callback、黑名单等行为 |
| 经济性 | 完整循环在目标金额下仍盈利；机会寿命覆盖报价、模拟和上链；可承担 revert Gas 并设日上限 |
| 资金 | 使用自有本金或已验证的 flash loan；执行地址有充足 gas；allowance 最小化或使用受控 Permit2 |

## 3. 两种执行方式

| 方式 | 流程 | 权衡 |
|---|---|---|
| 自有本金 | 合约用 USDC 买 WETH、再卖回 USDC，最后检查余额 | 占用本金较多，路径较简单 |
| Flash loan | 借 USDC、完成循环、归还本息，剩余为利润 | 减少本金，但增加 fee、Gas、回调与重入风险 |

## 4. 机会与执行流程

1. 对同一输入量分别限制 exchange 获取报价。
2. 解析 `includedSteps`，识别底层池、路由拆分和重叠。
3. 构造 `A → B → A` 完整循环。
4. 用第一腿最低或模拟输出作为第二腿输入，并顺序更新池状态。
5. 扣除两腿 Gas、协议费、flash fee、builder tip 和失败准备金。
6. 在同一区块状态模拟完整原子调用。
7. 仅在链上 `minProfit` 断言通过时提交。

不能相加两个独立 Quote 的展示输出：第二腿输入取决于第一腿真实输出，而且第一腿本身会改变池状态。

## 5. 盈亏

```text
netProfit
= finalBaseToken - initialBaseToken
- gasCost
- flashLoanFee
- builderTip
- protocolFees

链上断言：endingBalance >= startingBalance + minProfit
```

断言不满足时整体 revert，但 Gas 仍会损失。

## 6. 损失与控制

| 风险 | 如何亏损 | 关键控制 |
|---|---|---|
| 非原子两笔交易 | 第一腿后第二腿失败或价差消失，留下中间资产 | 生产只用单交易原子合约；否则限于 paper trading |
| 路线重叠 | 两个聚合器实际使用同一池，第一腿消灭第二腿价格 | 解析到底层池，不按聚合器名称判断独立性 |
| 自身价格影响 | 第一腿改变储备/tick，旧的第二腿 Quote 高估输出 | 顺序模拟，或在历史 fork 执行完整循环 |
| MEV | 被复制、抢跑、sandwich、不被 builder 包含；高 tip 导致赢家诅咒 | 私有提交；分别回测公开/私有模式；限制 tip |
| Revert Gas | 原子性保护本金，但竞争下多数失败交易仍消耗 Gas | 设置单笔最大 Gas、每日失败 Gas 和暂停阈值 |
| 状态过期 | Quote、calldata、模拟到打包之间池状态改变 | 缩短报价年龄；提交前模拟；链上 `minProfit` 兜底 |
| 异常 Token | fee-on-transfer、rebase、回调、sell tax、黑名单破坏余额模型 | Token 白名单，以真实余额差结算 |
| Router/calldata | 任意目标或调用可能转走合约余额；Router/approval 变化造成错误 | 目标、spender、selector 白名单；最小授权；升级复核 |
| Flash loan | fee 变化、流动性不足、回调重入、还款不足或 Gas 过高 | 验证来源和费率；重入保护；完整 fork 测试 |
| 基础设施 | RPC 旧状态、节点不同步、nonce 或 relay 故障 | 同步状态源、幂等 nonce 管理、备用 RPC/relay |

## 7. 回测

LI.FI 不提供完整历史 Quote 库，需要持续保存快照或在历史区块重建池状态。严格回放应：

1. 读取历史区块的真实池状态；
2. 执行第一腿并更新状态；
3. 用真实输出执行第二腿；
4. 计入当时 Gas、base/priority fee、flash fee 和 tip；
5. 模拟竞争者先成交与失败概率；
6. 记录成功率和 revert Gas。

报告成功利润、失败 Gas、机会半衰期、竞争后成交率、金额容量曲线、builder tip 占比和每个底层池的收益贡献。

## 8. Go / No-Go

### Go

- [ ] 原子执行合约经过测试与审计。
- [ ] 历史 fork 中，完整循环而非独立报价盈利。
- [ ] 扣除失败 Gas 和 tip 后期望值为正。
- [ ] 已排除底层路线重叠假象。
- [ ] 私有提交可用，故障时能安全降级。
- [ ] Token、Router、spender 和 calldata 白名单完整。

### No-Go

- 计划用两笔钱包交易顺序执行高频套利；
- 没有链上最低利润检查；
- 只比较聚合器名称；
- 无法承担高失败率 Gas；
- 使用未知长尾 Token 或任意 calldata。
