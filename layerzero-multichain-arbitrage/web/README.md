# LayerZero Arbitrage Web

React + strict TypeScript client-side SPA for the LayerZero multichain arbitrage scanner.

## Commands

Run from `layerzero-multichain-arbitrage`:

```sh
vp -C web dev
vp -C web check
vp -C web build
```

During development, Vite proxies `/api/*` to the NestJS backend at `http://localhost:1234` and strips the `/api` prefix.

Production hosting must proxy `/api` to the backend and serve `index.html` as the fallback for unknown client routes.
