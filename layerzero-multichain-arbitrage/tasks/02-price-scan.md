# 第二阶段：可执行价格抓取与价差扫描

## 1. 目标

第一阶段已经得到经过验证的 LayerZero Direct OFT / OFTAdapter 资产和双向跨链路径。第二阶段只消费这份白名单，持续回答三个问题：

1. 同一个资产在两条链上，买入和卖出完全相同数量时，各自真实可成交多少；
2. 扣除买卖保护价、DEX Gas 等直接成本后，是否仍存在价差；
3. 这个价差能够支持多大的成交规模，报价是否足够新鲜、可靠和可复现。

本阶段输出“观察机会”和“已确认机会”，不签名、不广播交易，也不因为发现价差立即跨链。第一版套利模型仍是多链预置库存：低价链买入、高价链卖出已有库存，LayerZero 只在事后承担补库存。

这里的“价格”必须是指定数量的可执行报价，不是池中间价、K 线价格、Token 页面显示价或按小额价格线性放大的估算价。

## 2. 范围

### 2.1 纳入

- assets.status 为 verified；
- deployment.scan_status 为 verified；
- 两端部署未暂停；
- 两端 peer 互相指向，路径状态为 active；
- Direct OFT 或标准 OFTAdapter；
- EVM 链上的 ERC-20 交易；
- 链上 DEX Quoter 的 exact input / exact output 只读报价；
- Ethereum、BSC、Base 中已经被第一阶段验证为 LayerZero 路径的链对。

### 2.2 不纳入

- pending、rejected 或扫描失败的资产；
- 只有单向 peer 的路径；
- 仅因为名称、symbol 相同而推断出的多链资产；
- Base Standard Bridge 等非 LayerZero 路径；
- CEX、Stargate 池资产、跨链 Compose；
- fee-on-transfer、rebase、黑名单或无法稳定预估到账的 Token；
- 自动授权、签名、交易广播和真实资金操作。

例如 TOWNS 的 Base 部署如果只属于 Base Standard Bridge，而没有通过第一阶段的 LayerZero 双向 peer 验证，本阶段不会把它与其他链组成套利路径。这是明确的范围约束，不是漏扫。

## 3. 实施结论：先用隔壁 LI.FI SDK 抓价

隔壁 `../lifi` 已经完成以下能力：

- 使用官方 `@lifi/sdk` 4.2.0；
- 同链 exact output 买入调用 `getQuote(..., { toAmount })`；
- 同链 exact input 卖出调用 `getQuote(..., { fromAmount })`；
- 统一保存 `fromAmount`、`toAmount`、`toAmountMin`、Gas、额外费用、使用的工具和 `transactionRequest`；
- 已有请求超时、错误归一化、并发限制和原始响应保存方式。

因此第一版不再先实现 Uniswap V3 / PancakeSwap V3 的 Factory、池和路径发现。直接在当前 NestJS 项目中增加一个通用 `LifiQuoteClient`，复用隔壁项目已经验证过的 SDK 调用和归一化思路。

不直接 import `../lifi/src`，原因是隔壁项目的 `AssetSymbol`、链和任务生成器目前写死为 WETH/USDC，而且它是独立命令行应用。跨项目源码引用也会让构建边界和依赖变得混乱。当前项目直接安装相同版本的 `@lifi/sdk` / `@lifi/types`，把不足 200 行的通用报价边界按 NestJS 结构实现；以后两个项目都需要继续演进时，再抽成 workspace 共享 package。

LI.FI 的作用是聚合“同一条链上的 DEX swap 报价”，不是使用 LI.FI 跨链桥完成套利。传入相同的 `fromChain` 和 `toChain`，只允许 swap 工具；LayerZero 仍然只是当前资产身份和未来补库存路径。

### 3.1 第一里程碑：严格跨链价差抓取和展示

本轮只实现：

1. 从 verified 资产读取 active 双向 LayerZero 链对；
2. 在一条可报价链用约 500 USDC 探测 Token 数量；
3. 将数量截断到 shared decimals，再转换成各链的本地精度；
4. 所有部署使用这个相同 Token 数量请求 exact output 买价和 exact input 卖价；
5. 对每个 LayerZero 链对计算 A 买 B 卖和 B 买 A 卖；
6. 保存报价、费用、工具、时间和错误；
7. 提供手动异步抓取、定时抓取、状态和跨链价差 API；
8. 前端直接展示跨链方向、相同数量、毛价差、直接成本、直接净价差和新鲜度。

第一版不创建 `price_opportunities`，不做连续两轮机会确认，不计算 LayerZero 补库存成本，也不提供执行按钮。跨链价差来自可执行同链报价，但尚未通过库存、补库存、二次确认和交易模拟，所以不得标记为可执行机会。

### 3.2 第二里程碑：机会确认

完成稳定抓价后再增加：

- 五个数量档位；
- 两腿时间差和报价过期检查；
- Gas、授权和补库存成本；
- 二次报价确认；
- `price_opportunities` 表和机会 API；
- 直接 DEX Quoter 作为独立复核或 LI.FI 无路由时的兜底。

## 4. P2A 价格抓取设计

### 4.1 报价来源

第一版使用 LI.FI SDK：

| 报价 | SDK 参数 | 含义 |
|---|---|---|
| 卖出 | `fromChain = toChain`、`fromAmount` | 卖出固定 Token，得到 `toAmountMin` 结算币 |
| 买入 | `fromChain = toChain`、`toAmount` | 买到固定 Token，需要支付 `fromAmount` 结算币 |

要求：

- `skipSimulation` 为 false；
- 设置短超时和有限并发；
- 配置 `fromAddress` 为固定研究地址；
- 请求限制为同链 swap，不能返回跨链步骤；
- 保存 LI.FI 返回的 `tool`、内部 step、approvalAddress 和 transactionRequest；
- LI.FI 报价无需 API Key；匿名 `/quote` 额度很低，因此无 Key 时使用单并发、每批最多 6 个资产、最久未报价优先的增量扫描，并每 3 小时推进一批；配置 Key 后使用全量并发扫描。

### 4.2 交易 Token 和结算币

- Direct OFT：优先使用 `deployment.tokenAddress`，没有时使用 `deployment.oftAddress`；
- OFTAdapter：必须使用 Adapter 绑定的底层 `deployment.tokenAddress`；
- 第一版每条链只配置一个主结算币，优先 USDC；
- BSC 若实际路由以 USDT 更完整，可将 USDT 设为该链主结算币，但跨链展示必须标明结算币不同，不能直接当美元价差；
- Token 或结算币地址缺失时记录错误，不请求 SDK。

### 4.3 第一版数量生成

第一版采用一个基准档，默认约 500 美元：

1. 依次尝试可用部署，对首条成功链发起 `500 USDC -> Token` exact input 探测；
2. 将返回 Token 数量按该资产 shared decimals 向下截断；
3. 将同一个 shared amount 转换成每条链的 local amount；
4. 每条链都使用对应 local amount 请求正式 exact output 买价与 exact input 卖价；
5. 对 active 链对双向组合，买入保存 `fromAmount`，卖出使用 `toAmountMin`；
6. 任何组合只有 shared amount 完全相同才允许输出。

探测报价只负责生成研究规模，不参与最终利润。最终页面不展示由不同数量单位价格推算的“参考 spread”，只展示相同 shared amount 组成的跨链价差。

### 4.4 单次抓取流程

1. API 或定时器创建 runId 后立即进入后台任务；
2. 读取 verified 资产及 verified、未暂停的部署；
3. 为每个部署解析交易 Token、结算币和 decimals；
4. 按链分组，使用有限并发请求 500 美元探测报价；
5. 对探测成功的部署请求正式买价与卖价；
6. 归一化整数金额、最低到账、Gas、费用、工具和耗时；
7. 保存成功或失败记录；
8. 按 active peer 生成两个跨链方向；
9. 使用买入 `fromAmount` 与卖出 `toAmountMin` 计算毛价差；
10. 扣除两链 Gas 和未包含费用，计算直接净价差；
11. 更新运行进度并结束任务。

### 4.5 P2A 最小数据表

P2A 只新增一张 `market_quotes`，不创建路由表和机会表：

- `id`、`run_id`；
- `asset_id`、`deployment_id`；
- `chain_name`、`chain_id`；
- `side`：probe、buy、sell；
- `trade_token_address`、`settlement_token_address`；
- `token_amount_raw`、`token_decimals`；
- `from_amount_raw`、`to_amount_raw`、`to_amount_min_raw`；
- `settlement_decimals`；
- `gas_cost_usd_raw`、`included_fee_usd_raw`、`extra_fee_usd_raw`；
- `tool`；
- `requested_at`、`received_at`、`duration_ms`、`valid_until`；
- `status`、`error_code`、`error_message`；
- `raw_json`；
- `created_at`。

常用查询索引：

- `deployment_id + side + received_at`；
- `asset_id + received_at`；
- `run_id + status`。

最新报价直接按索引查询，不额外创建 latest_price 表。成功报价保留 30 天，失败原文保留 7 天；后续回测需求明确后再增加降采样。

### 4.6 NestJS 文件职责

- `src/lib/lifi-quote.client.ts`：封装 SDK、超时、错误和响应归一化；
- `src/services/price-scan.service.ts`：读取资产、生成任务、并发抓价、保存进度；
- `src/services/price-query.service.ts`：查询最新报价并生成页面 DTO；
- `src/controllers/price-scan.controller.ts`：异步主动触发和状态；
- `src/controllers/prices.controller.ts`：报价列表；
- `src/database/entities/market-quote.entity.ts`：唯一新增 Entity；
- `src/dto/price-scan.dto.ts`、`src/dto/prices.dto.ts`：请求和响应 DTO；
- `ScheduleService`：增加价格抓取注解调度；
- controller/service barrel：同一变更内注册。

仍然只使用 AppModule，不创建 PriceModule。

### 4.7 API

`POST /price-scans`

- 可选 `assetId`；不传时抓取全部 verified 资产；
- 立即返回 HTTP 202、runId、queued；
- 同一范围正在运行时返回 existing runId。

`GET /price-scans/status`

- runId、status、total、completed、succeeded、failed；
- currentAsset、startedAt、lastProgressAt、lastError；
- 下一次定时抓取时间。

`GET /prices`

- 默认每个资产、每条链返回最新一组买卖报价；
- 支持 assetId、chainId、status、maxAgeMs；
- 返回分页结果和抓取时间。

`GET /prices/:assetId/history`

- 返回指定时间范围的报价历史；
- 第一版限制最大时间跨度和条数，避免直接读取全部 SQLite 历史。

### 4.8 前端第一版

价格页只需要一个紧凑的跨链价差表格：

| 列 | 内容 |
|---|---|
| 资产 | symbol、名称 |
| 数量 | 两条链完全相同的 Token 数量及约 500 美元档 |
| 跨链方向 | 买入链 → 卖出链 |
| 买入 | 最大支付、单位买价、LI.FI tool |
| 卖出 | 最小到账、单位卖价、LI.FI tool |
| 毛价差 | USD 和 bps |
| 直接成本 | 两链 Gas 和未包含费用 |
| 直接净价差 | USD 和 bps |
| 同步状态 | 两腿时间差、新鲜度和过期状态 |

每个 LayerZero 链对同时展示两个方向。直接净价差只代表预置库存下两笔同链 Swap 的报价结果，不包含补库存成本，页面不显示执行操作。

页面提供：

- “抓取价格”按钮，调用异步 API；
- 后台任务进度；
- 自动刷新最新报价；
- 失败原因；
- 地址复制；
- 不提供套利执行入口。

### 4.9 P2A 验收标准

- 只读取 verified 资产和部署；
- Adapter 使用底层 Token，不使用 Adapter 地址报价；
- Ethereum、BSC、Base 支持的资产可请求同链 LI.FI swap；
- 每个部署都能看到买价、卖价或明确失败原因；
- 买价使用 exact output，卖价使用 exact input；
- 卖价展示 `toAmountMin`，不把乐观 `toAmount` 当成交结果；
- 保存 Gas、费用、tool、transactionRequest 和完整原始响应；
- 金额全程 bigint / 字符串，不用浮点保存；
- 手动触发立即返回 202，不等待批量抓取；
- 定时和手动抓取互斥；
- 单个资产失败不终止整个批次；
- 页面能按资产输出严格同数量的双向跨链价差，并清楚标明尚未计入补库存；
- 本阶段不创建虚假的 confirmed / executable 机会。

## 5. P2B 后续详细设计

以下章节是抓价稳定后的机会计算方案，P2A 暂不实现。

### 5.1 直接 DEX Quoter 作为复核

P2B 增加主流 DEX 的链上 Quoter：

| 链 | 第一批 Venue | 用途 |
|---|---|---|
| Ethereum | Uniswap V3 | exact input、exact output、Gas 估算 |
| Base | Uniswap V3 | exact input、exact output、Gas 估算 |
| BSC | PancakeSwap V3 | exact input、exact output、Gas 估算 |

直接 Quoter 用于独立复核 LI.FI 结果、定位聚合器费用，并在特定资产没有聚合路由时提供受控兜底。

DEX 聚合器放在下一步作为第二报价源。聚合器接入后仍实现统一 QuoteClient 接口，不改变扫描和机会计算逻辑。聚合器报价只有同时提供明确 Router、calldata、有效期和可模拟结果时，才能成为执行报价；否则只作为参考价。

### 5.2 正确选择交易 Token 地址

- Direct OFT：交易地址优先使用 deployment.token_address，没有时使用 deployment.oft_address；
- OFTAdapter：必须交易 Adapter 绑定的 deployment.token_address，不能把 Adapter 合约地址当 ERC-20；
- 每个地址在首次报价前重新读取 decimals，并与第一阶段保存值核对；
- 地址或 decimals 冲突时停止该部署报价，并把资产退回待验证。

### 5.3 只比较相同数量

一个方向的完整比较为：

1. 在候选买入链使用一档稳定币金额做 exact input 探测，得到初始 Token 数量；
2. 将 Token 数量向下截断到两条链共同支持的 shared decimals；
3. 在买入链重新做 exact output，得到买到该固定 Token 数量最多需要支付的稳定币；
4. 在卖出链做 exact input，得到卖出同一 Token 数量最少能收到的稳定币；
5. 再反向计算另一条链买入、当前链卖出。

探测报价只用于生成数量，不能参与最终利润计算。最终买卖两侧的 Token 原始数量在共享精度下必须完全一致。

### 5.4 结算币

第一版每条链配置 USDC、USDT 等允许的结算币地址和 decimals。为避免把稳定币差价误认为 Token 套利：

- 优先比较同名结算币，例如 USDC 买入对 USDC 卖出；
- 不自动把 USDC、USDT、DAI 都按绝对 1 美元混算；
- 不同稳定币组合要先经过稳定币兑换报价和脱锚检查，第一版可以直接跳过；
- 结算币自身异常或脱锚时，相关报价标记为 rejected。

## 4. 路由发现

### 4.1 路由范围

第一版只搜索最多两跳的白名单路径：

- Token → 结算币；
- Token → Wrapped Native → 结算币；
- Token → 另一白名单稳定币 → 结算币。

每个 Venue 配置允许的 Factory、Quoter、Router、手续费档位、Wrapped Native 和结算币。不允许从链上发现任意 Router 后直接信任。

### 4.2 发现方法

1. 根据 Token、结算币、中间币和手续费档位生成有限候选路径；
2. 调用 Factory 查询池是否存在；
3. 对存在的池执行小额 Quoter 探测；
4. 保存成功路径，以及是否支持 exact input / exact output；
5. 同一方向保留若干条成功路径，正式报价时选择结果最好的路径；
6. 连续失败的路径进入冷却，避免每轮重复请求；
7. 定时重新发现，防止新池、新费率或流动性迁移长期不被看到。

不依赖 symbol 猜池，不扫描所有 PoolCreated 历史，也不在第一版引入 Subgraph。这样可以把发现范围控制在经过验证的资产和允许的结算路径内。

### 4.3 路由状态

| 状态 | 含义 |
|---|---|
| active | 最近探测成功，可以进入报价 |
| illiquid | 池存在，但目标金额无法报价或价格影响过大 |
| unsupported | Venue 不支持该 Token 或 exact output |
| cooling | 连续 RPC / Quoter 失败，暂时跳过 |
| disabled | 人工禁用或 Router 不再可信 |

“没有报价”必须落为明确状态和原因，不能只让资产从页面消失。

## 5. 报价档位和扫描策略

### 5.1 数量档位

深度扫描采用约 100、500、1,000、2,500、5,000 美元五档。每个方向先用对应稳定币金额生成 Token 数量，再按第 3.3 节重新执行固定 Token 数量的买卖报价。

每一档独立请求，不允许用 100 美元报价乘以 50 推算 5,000 美元报价。

### 5.2 三层扫描

为了避免所有资产、所有路径、所有档位持续压垮公开 RPC，使用分层扫描：

| 层级 | 周期 | 内容 |
|---|---:|---|
| 路由刷新 | 30 分钟 | 检查新池、失效池和 exact input/output 能力 |
| 基线扫描 | 60 秒 | 轮转所有可用路径，只扫描 500 美元一档和两个方向 |
| 热点扫描 | 5 秒 | 对接近阈值或刚出现机会的路径，扫描全部五档，持续 2 分钟 |

触发热点扫描的初始条件：

- 基线毛价差达到 20 bps；
- 最近 10 分钟出现过正直接净利；
- 用户主动触发指定资产；
- 路由或流动性刚发生明显变化。

热点结束后没有继续满足条件，就自动回到基线队列。初始数值属于研究默认值，积累历史数据后再调整。

### 5.3 任务互斥

- 同一资产同一时刻最多存在一个价格扫描任务；
- 路由刷新、定时扫描和手动扫描共享同一把任务锁；
- 手动 API 只入队并返回 202，不等待完整扫描；
- 进程重启后根据数据库中的运行状态和最后更新时间恢复，过期 running 状态自动转为 interrupted；
- RPC 失败不影响其他链或其他资产继续扫描。

## 6. 单次扫描流程

数据流如下：

已验证资产路径 → 生成链对和两个方向 → 读取可用路由 → 生成共享 Token 数量 → 同时请求买卖报价 → 标准化保护价和 Gas → 检查新鲜度 → 计算机会 → 保存并发布 API 结果

详细步骤：

1. 读取 verified 资产、verified 部署和 active 双向 peer；
2. 对链对去重，例如 Ethereum–BSC 只生成一次链对；
3. 为链对生成 A 买 B 卖、B 买 A 卖两个方向；
4. 找到两端相同结算币的 active 路由；
5. 使用稳定币名义金额生成共享精度 Token 数量；
6. 买入端请求 exact output，卖出端请求 exact input；
7. 在允许的路由中分别选择买入成本最低、卖出收入最高的结果；
8. 应用最大支付、最小到账和滑点保护；
9. 读取两链 Gas Price，将 Gas 换算为相同结算币；
10. 校验时间差、区块、Token 数量和报价完整性；
11. 计算毛价差、直接净利和价格影响；
12. 达到热点条件时补齐其余数量档位；
13. 对可能机会立即重新报价一次；两轮方向一致才标记 confirmed；
14. 保存报价证据、机会或拒绝原因；
15. 更新扫描状态、统计和前端查询结果。

## 7. 报价标准化

### 7.1 买入腿

买入腿使用 exact output：

- amountOut：固定 Token 数量；
- quotedAmountIn：当前区块的理论输入；
- maxAmountIn：quotedAmountIn 加买入滑点保护；
- gasCost：Router 执行 Gas 的保守估计；
- 有 exact output 能力才可进入 confirmed。

### 7.2 卖出腿

卖出腿使用 exact input：

- amountIn：与买入腿完全相同的 Token 数量；
- quotedAmountOut：当前区块的理论输出；
- minAmountOut：quotedAmountOut 减卖出滑点保护；
- gasCost：Router 执行 Gas 的保守估计。

### 7.3 金额精度

- Token、稳定币、Gas 全部以 bigint 最小单位计算；
- 不使用 JavaScript number 保存链上金额；
- 数据库同时保存原始整数和 decimals；
- 展示层最后才格式化；
- USD 计算使用固定精度整数，例如 1e8；
- Token 数量按 shared decimals 向下截断；
- 因截断产生的 dust 不计为利润。

### 7.4 报价新鲜度

第一版研究阈值：

- 单腿报价有效期：8 秒；
- 两腿响应时间差：最多 3 秒；
- 机会确认：重新抓取一轮，连续两轮均为正；
- 任意一腿超时、RPC 失败或区块状态变化过大，整组机会失效；
- 数据库保留 observed_at、block_number、latency_ms 和 valid_until。

不同链的区块号没有可比性，因此跨链同步主要使用各自区块时间和本地请求时间，不能直接比较两个 block number 的差值。

## 8. 成本与机会计算

### 8.1 第一版必须计算

- 买入最大支付；
- 卖出最小到账；
- 买入链 Gas；
- 卖出链 Gas；
- 需要首次授权时的授权 Gas；
- DEX 手续费和价格影响，已经体现在 Quoter 结果中，不重复扣除；
- 滑点保护；
- 报价时间差和新鲜度。

### 8.2 两种利润

毛利润：

卖出最小到账 - 买入最大支付

直接净利润：

毛利润 - 买入 Gas - 卖出 Gas - 必要授权 Gas

补库存调整后净利润：

直接净利润 - 分摊后的 LayerZero 补库存费用 - 补库存精度损耗 - 风险准备金

当前阶段可以先完整产出毛利润和直接净利润。补库存费用没有新鲜报价时，机会只能标记 watch_only，不能标记 executable。后续使用第一阶段保存的 quoteSend 能力增加独立的补库存报价任务。

### 8.3 核心指标

- buyUnitPrice；
- sellUnitPrice；
- grossSpreadBps；
- grossProfitUsd；
- directNetProfitUsd；
- directNetBps；
- rebalanceAdjustedProfitUsd；
- priceImpactBps；
- quoteAgeMs；
- legSkewMs；
- maxProfitableNotionalUsd；
- confidence；
- rejectReason。

### 8.4 第一版机会状态

| 状态 | 含义 |
|---|---|
| observed | 单轮发现毛价差，仅观察 |
| confirmed | 连续两轮直接净利为正且报价有效 |
| watch_only | 有价差，但补库存或独立参考数据未完整 |
| rejected | 成本、流动性、精度或风险检查不通过 |
| stale | 报价已经过期 |

本阶段不产生 executable 状态。执行阶段完成库存、交易模拟、限额和补库存检查后，才允许升级为可执行机会。

## 9. 最小数据模型

第一版新增三张表即可，不提前拆出大量细表。扫描运行状态复用现有 scan_state，以 price_scan:* 作为 key。

### 9.1 market_routes

缓存经过探测的 DEX 路由，减少重复池发现。

主要字段：

- id、route_key；
- asset_id、deployment_id、chain_name；
- venue、factory_address、quoter_address、router_address；
- trade_token_address、settlement_token_address；
- path_json：池、Token 顺序、手续费档位和 encoded path；
- supports_exact_input、supports_exact_output；
- status、failure_count、last_error；
- last_checked_at、last_success_at、cooldown_until；
- created_at、updated_at。

route_key 唯一，内容由链、Venue、交易 Token、结算币和路径生成。

### 9.2 market_quotes

保存每一腿真实报价。成功和失败都保存，便于统计报价源质量。

主要字段：

- id、run_id、route_id；
- asset_id、deployment_id、chain_name；
- side：probe、buy 或 sell；
- token_amount_raw、token_decimals；
- quote_amount_raw、quote_decimals；
- limit_amount_raw：买入最大支付或卖出最小到账；
- settlement_symbol、settlement_address；
- gas_units、gas_price_raw、gas_cost_quote_raw；
- block_number、block_timestamp；
- requested_at、observed_at、latency_ms、valid_until；
- request_json、response_json；
- status、error_code、error_message；
- created_at。

request_json / response_json 用于保存协议原始证据；常用查询字段仍单独建列和索引，不能全部塞进 JSON。

### 9.3 price_opportunities

保存由一对买卖报价组成的结果。

主要字段：

- id、opportunity_key、run_id；
- asset_id；
- buy_deployment_id、sell_deployment_id；
- buy_quote_id、sell_quote_id；
- notional_usd_raw、token_amount_raw、shared_decimals；
- gross_spread_bps、gross_profit_usd_raw；
- gas_cost_usd_raw、direct_net_profit_usd_raw、direct_net_bps；
- rebalance_cost_usd_raw、adjusted_net_profit_usd_raw；
- max_profitable_notional_usd_raw；
- status、reject_reason、confidence；
- strategy_version；
- observed_at、confirmed_at、valid_until、created_at、updated_at。

opportunity_key 由资产、买入链、卖出链、数量档位和时间窗口生成，用于去重。历史机会追加保存，不覆盖成只剩最新一条。

### 9.4 索引和保留策略

必要索引：

- market_routes：asset_id + chain_name + status；
- market_quotes：asset_id + observed_at、run_id、status；
- price_opportunities：asset_id + observed_at、status + valid_until；
- opportunity_key 唯一。

SQLite 初始保留策略：

- confirmed、watch_only 及其关联报价保留 90 天；
- rejected 原始报价保留 7 天；
- 7 天后只保留每 5 分钟聚合统计；
- 定时清理必须使用事务，不能删掉仍被 opportunity 引用的 quote。

## 10. 服务与文件职责

遵循单一 AppModule，不创建 PriceModule。

### 10.1 src/lib

- dex-quote.client.ts：统一报价接口和返回类型；
- uniswap-v3-quote.client.ts：Ethereum / Base Quoter、Factory 和路径编码；
- pancakeswap-v3-quote.client.ts：BSC Quoter、Factory 和路径编码；
- market-route.client.ts：候选路径生成、池存在性检查和路由探测；
- rpc-client.ts：复用现有 viem PublicClient、批处理、超时和 RPC 错误分类。

合约调用、ABI、路径编码和 RPC 重试都留在 lib，service 不直接拼 calldata。

### 10.2 src/services

- market-route.service.ts：发现、缓存和刷新路由；
- price-scan.service.ts：组织基线、热点和手动扫描；
- opportunity.service.ts：纯计算、校验、确认和持久化；
- schedule.service.ts：用注解直接声明固定周期，调用上述 service；
- services/index.ts：注册全部 service。

OpportunityService 不访问 process.env，不调用 RPC；给定相同报价和策略版本，必须得到完全相同结果。

### 10.3 src/controllers

- prices.controller.ts：查询最新报价、机会、扫描状态；
- price-scan.controller.ts：异步触发全量或指定资产扫描；
- controllers/index.ts：注册全部 controller。

Controller 只做参数验证和 response shaping，不承载扫描逻辑。

### 10.4 src/database

- 三个 Entity；
- 一条显式 migration；
- data-source-for-migrations.ts 注册 Entity；
- AppModule 的 TypeOrmModule.forFeature 注册 Entity。

不依赖 synchronize 代替 migration。

## 11. 并发、RPC 与容错

- 每条链独立并发队列，初始并发上限 4；
- 资产批次并发上限 3；
- Quoter/Factory 只读调用尽量通过 viem multicall 合并，并允许单个调用失败；
- 禁止对全部资产直接使用无上限 Promise.all；
- 429、超时和临时 RPC 错误使用指数退避并加入随机抖动；
- 单条链连续失败后触发短暂熔断，其他链继续运行；
- 连续失败路径增加 failure_count 并进入 cooldown；
- RPC 恢复后先做健康检查，再逐步恢复热点扫描；
- 同一次机会的两腿尽量并发请求，以缩短时间差；
- 每条报价都记录实际使用的 RPC 链、区块和耗时，但不记录含密钥的完整 RPC URL。

公开 RPC 可以用于开发和低频基线扫描，但全量持续扫描可能受到限流。实现时保留每链多个 RPC transport 的降级能力；是否换成专用 RPC 不影响上层接口。

## 12. API 设计

### 12.1 主动扫描

POST /price-scans

可选参数：

- assetId：只扫描一个资产；
- deploymentIds：限制链对；
- mode：baseline 或 deep。

立即返回 HTTP 202：

- runId；
- accepted；
- status：queued；
- requestedAt。

如果同一范围已经运行，返回现有 runId 和 already_running，不创建重复任务。

### 12.2 状态

GET /price-scans/status

返回：

- 当前 runId、状态和模式；
- 总资产、已完成、成功、失败数量；
- 当前资产和当前链对；
- 开始时间、最后进度时间；
- 各链 RPC 健康状态；
- 最近错误；
- 下一次定时扫描时间。

### 12.3 机会列表

GET /price-opportunities

筛选参数：

- assetId、status；
- buyChain、sellChain；
- minNetBps、minNetUsd；
- maxAgeMs；
- limit、cursor。

默认只返回尚未过期的最新结果，并按 directNetProfitUsd、directNetBps 排序。

### 12.4 机会详情

GET /price-opportunities/:id

返回两腿报价、Token 数量、保护金额、DEX 路径、区块、耗时、Gas、所有成本、拒绝原因和策略版本，使页面上的每一个数字都可以追溯。

## 13. 前端展示重点

价格扫描页保持紧凑，主表只展示：

| 列 | 内容 |
|---|---|
| 资产 | symbol 和名称 |
| 路径 | 买入链 → 卖出链 |
| 规模 | 固定 Token 数量和约等值 USD |
| 买入 | 最大支付、Venue |
| 卖出 | 最小到账、Venue |
| 毛价差 | USD 和 bps |
| 直接净利 | 扣除两链 Gas 后的 USD 和 bps |
| 容量 | 最大仍为正的档位 |
| 新鲜度 | 最慢一腿距现在的时间 |
| 状态 | confirmed、watch_only、rejected、stale |

点击一行再显示：

- 两条路由和池；
- 每腿 block、请求耗时、报价保护；
- Gas 与价格影响；
- 五档利润曲线；
- 确认轮次；
- 拒绝原因。

页面不要把 route 配置、Factory 地址、原始 JSON 放在主表。地址详情中继续提供复制功能。

## 14. 日志与监控

过程日志至少包括：

- price scan queued / started / completed；
- runId、模式、资产数、链对数；
- 每批完成进度和耗时；
- 路由新增、失效和冷却；
- 每条链的报价成功率、P50/P95 延迟；
- RPC 限流、超时和熔断；
- 机会发现、二次确认、失效；
- 最终 confirmed、watch_only、rejected 数量；
- 主要 rejectReason 分布。

正常情况下不逐条打印完整原始响应，避免日志过量。完整证据写数据库；日志只保留定位问题所需的 ID、链、资产、错误码和耗时。

## 15. 错误码

第一版统一错误码：

- ASSET_NOT_VERIFIED；
- PATH_NOT_ACTIVE；
- TOKEN_ADDRESS_MISSING；
- DECIMALS_MISMATCH；
- NO_MARKET_ROUTE；
- EXACT_OUTPUT_UNSUPPORTED；
- INSUFFICIENT_LIQUIDITY；
- PRICE_IMPACT_TOO_HIGH；
- RPC_TIMEOUT；
- RPC_RATE_LIMITED；
- QUOTER_REVERTED；
- QUOTE_STALE；
- LEG_TIME_SKEW；
- AMOUNT_MISMATCH；
- STABLECOIN_MISMATCH；
- STABLECOIN_DEPEG；
- GAS_PRICE_UNAVAILABLE；
- REBALANCE_COST_UNAVAILABLE；
- TOKEN_BEHAVIOR_UNSUPPORTED。

拒绝原因要进入 price_opportunities，而不只是写日志。

## 16. 实施顺序

### P2.1 数据与资产输入

- 新增三张表和 migration；
- 从现有 assets / deployments 构造 active LayerZero 链对；
- 正确解析 Direct OFT 与 OFTAdapter 的交易地址；
- 增加价格扫描状态 key。

### P2.2 DEX 路由与报价 Client

- 实现统一 QuoteClient；
- 实现 Uniswap V3、PancakeSwap V3；
- 实现最多两跳路径发现和缓存；
- 支持 exact input、exact output、Gas、超时和错误分类。

### P2.3 价格扫描与机会计算

- 实现两个方向和共享数量；
- 实现 500 美元基线档；
- 实现五档深度扫描；
- 实现保护价、Gas、价差、直接净利和拒绝原因；
- 实现连续两轮确认。

### P2.4 调度和 API

- 增加固定周期注解；
- 增加互斥、队列、进度和重启恢复；
- 增加异步主动触发和状态查询；
- 增加机会列表和详情 API。

### P2.5 前端

- 对接机会列表、扫描状态和主动触发；
- 主表使用紧凑展示；
- 增加五档利润详情和错误原因；
- 不增加执行按钮。

## 17. 验收标准

- 只扫描 verified + active LayerZero 路径；
- OFTAdapter 使用底层 Token 地址报价；
- SIGN、DOS 等已验证资产在存在 DEX 路由时能进入价格扫描；
- 没有流动性的部署明确显示 NO_MARKET_ROUTE 或 INSUFFICIENT_LIQUIDITY；
- 每个方向买卖的 Token 数量在共享精度下完全一致；
- 买入使用 exact output，卖出使用 exact input；
- 100、500、1,000、2,500、5,000 美元档位各自独立报价；
- A 买 B 卖和 B 买 A 卖都被计算；
- 超时或两腿时间差过大的报价不会成为 confirmed；
- 毛价差、直接净利、补库存调整后净利明确分开；
- 所有链上金额使用 bigint，不出现浮点精度损失；
- 每个机会能还原到两腿路由、输入、输出、区块、Gas 和原始响应；
- 定时扫描与手动扫描不会重叠；
- 主动 API 在任务入队后立即返回 202；
- 单链 RPC 失败不会中断整个扫描；
- 重启后不会遗留永久 running 状态；
- 页面可以看出哪些币、哪些链对、哪个方向、哪个规模存在真实可成交价差。

## 18. 本阶段完成定义

完成 P2 后，系统应能稳定输出“某资产在链 A 买入固定数量、在链 B 卖出相同数量”的可复现价差报告，并明确展示：

- 在哪里买、在哪里卖；
- 使用哪个 DEX 和路由；
- 买卖多少 Token；
- 最多支付和最少收到多少；
- 报价对应哪个区块、多久前产生；
- 扣除直接成本后还剩多少；
- 价差能够支持到哪个数量档位；
- 为什么一个候选被确认、仅观察、拒绝或判为过期。

只有达到这个完成定义，才进入库存检查和执行模拟阶段。
