# arbitrage-playbook

套利共学持续记录。仓库包含统一场景入口，以及按套利模型隔离的数据、监控和执行实践。

## Workspace

该仓库使用 pnpm workspace 管理子项目：

- `lifi/`：LI.FI 套利研究与回测；
- `layerzero-multichain-arbitrage/`：LayerZero 多链资产发现与价差套利后端；
- `web/`：覆盖全部套利实践的统一前端和场景首页。

```bash
pnpm install
pnpm web dev
pnpm --filter @arbitrage-playbook/lifi dev
pnpm --filter @arbitrage-playbook/layerzero-multichain-arbitrage info
pnpm check
pnpm build
```
