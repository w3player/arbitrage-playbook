# arbitrage-playbook

套利共学持续记录

## Workspace

该仓库使用 pnpm workspace 管理子项目：

- `lifi/`：LI.FI 套利研究与回测；
- `layerzero-multichain-arbitrage/`：LayerZero 多链资产发现与价差套利研究。

```bash
pnpm install
pnpm --filter @arbitrage-playbook/lifi dev
pnpm --filter @arbitrage-playbook/layerzero-multichain-arbitrage info
pnpm check
pnpm build
```
