# V2 Pool Monitor

只读的同链 Uniswap V2 类资金池监控器。它不会签名或发送交易。

## 当前能力

- WebSocket 同时订阅新区块和白名单池的 `Sync` 事件；
- HTTP RPC 按确定区块读取 `Sync` 日志，避免依赖 WS 消息顺序；
- 断线后从本地游标补齐区块；
- 校验父哈希，检测重组后重新读取全部池状态；
- 根据 `Sync` 更新本地储备，只重算受影响的市场；
- 枚举两池双方向和多个输入金额；
- 扣除配置的闪电贷费、固定执行成本和最低利润门槛；
- JSON Lines 输出候选，便于后续接数据库或模拟器。

当前只支持带有标准 `token0()`、`token1()`、`getReserves()` 和 `Sync` 事件的 V2 类池。V3 集中流动性池、动态手续费池和稳定曲线池不能使用此定价公式。

## 配置

复制示例，并换成同一条链上的真实池地址：

```bash
cp v2-pool-monitor/config.example.json v2-pool-monitor/config.json
```

池配置里的 `token0`、`token1` 顺序必须和链上合约一致。程序启动时会读取合约并校验，地址或顺序错误会直接退出。`feeBps` 也必须按目标 DEX 的真实费率填写。

成本字段以市场的 `baseToken` 计价：

- `flashLoanPremiumBps`：闪电贷费率，只用于筛选；上线前应从借贷池动态读取；
- `fixedCostBase`：Gas、builder tip 和安全缓冲的合计估值；
- `minNetProfitBase`：输出机会所需的最低净利润；
- `logAllEvaluations`：为 `true` 时输出负利润结果，适合调试。

## 启动

需要一个 HTTP RPC 和一个支持 `eth_subscribe` 的 WebSocket RPC：

```bash
export POOL_MONITOR_HTTP_RPC_URL='https://...'
export POOL_MONITOR_WS_RPC_URL='wss://...'
pnpm --filter @arbitrage-playbook/v2-pool-monitor dev -- config.json
```

`pnpm --filter` 会在 `v2-pool-monitor/` 包目录中运行脚本，因此这里传入相对于包目录的 `config.json`。也可以直接进入包目录运行：

```bash
cd v2-pool-monitor
pnpm dev -- config.json
```

发现超过门槛的候选时输出：

```json
{"type":"opportunity","market":"USDC-WETH","blockNumber":"123","route":"pool-a->pool-b","amountIn":"10000","finalOut":"10024","grossProfit":"24","flashLoanFee":"5","fixedCost":"8","netProfit":"11","baseToken":"USDC"}
```

这是数学候选，不是可执行保证。下一步仍需用同一区块状态构造完整套利合约调用，执行 `eth_call`、估算 Gas，并确认真实闪电贷费率和私有提交成本。

## 检查

```bash
pnpm --filter @arbitrage-playbook/v2-pool-monitor check
pnpm --filter @arbitrage-playbook/v2-pool-monitor test
pnpm --filter @arbitrage-playbook/v2-pool-monitor build
```
