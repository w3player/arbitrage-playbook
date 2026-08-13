# Arbitrage Playbook Web

React + strict TypeScript client-side SPA for all arbitrage practices in this workspace.

The root page is a scenario hub. Each arbitrage practice owns its route namespace, backend API namespace, data-loading boundary, monitoring pages, and execution permissions. The LayerZero practice currently lives under `/layerzero/*`.

Route-level pages are isolated by ownership:

```text
src/pages/
├── hub/                       # Global scenario entry and planning pages
└── scenarios/
    └── layerzero/             # LayerZero-only route pages
```

New practices add a sibling under `src/pages/scenarios/<scenario>/` and expose their route pages through that directory's `index.ts`.

## Commands

Run from the workspace root:

```sh
pnpm web dev
pnpm web check
pnpm web build
```

Or run from this directory:

```sh
pnpm dev
pnpm check
pnpm build
```

During development, Vite proxies `/api/layerzero/*` to the LayerZero NestJS backend at `http://localhost:1234` and strips the `/api/layerzero` prefix. New practices must use their own `/api/<scenario>/*` namespace.

Production hosting must proxy each `/api/<scenario>` namespace to its backend and serve `index.html` as the fallback for unknown client routes.
