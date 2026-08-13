# Web project conventions

- This package is the shared React + strict TypeScript Vite client for every arbitrage practice in the workspace.
- The root route is the scenario hub. Each practice owns a route prefix such as `/layerzero/*` and an API prefix such as `/api/layerzero/*`.
- Keep scenario registration and homepage metadata in `src/app/scenarios.ts`. Do not mix scenario-specific navigation into the global homepage.
- Load scenario providers only inside that scenario's route boundary; opening `/` must not call every backend.
- Use React Router Declarative Mode only. Router owns URL matching, layouts, navigation, and active-link state; it does not own remote data.
- `src/app` composes providers and routes, `src/pages/hub` contains workspace-level entry pages, and each arbitrage practice owns `src/pages/scenarios/<scenario>/`. Do not place scenario pages directly under `src/pages` or import pages across scenario directories.
- Give each page group an `index.ts` public boundary. Route composition imports from the group boundary; scenario-internal implementation files may use direct imports when needed.
- Real user capabilities belong in `src/features`; keep a feature scenario-local unless it is genuinely shared by multiple practices.
- Browser code calls backends only through relative `/api/<scenario>` URLs. Never embed a backend origin in feature or page code.
- Use `@/*` for imports from `src/*`. Low-level utilities in `src/lib` must not import from components, features, or app.
- Treat shadcn-generated source under `src/components/ui` as read-only. Never hand-edit, reformat, or patch those files; use the shadcn CLI for generated primitives and customize through composition, wrappers, props, and `className` in application-owned files.
- Browser environment access belongs at the Vite boundary. Only expose explicitly public `VITE_*` values and never put secrets in frontend environment files.
- This is a desktop operations tool. Keep the supported layout at a minimum width of 1100px unless the product requirement changes.
- Production hosting must return `index.html` for unknown client routes so BrowserRouter deep links work.
- Validate with `pnpm check` and `pnpm build` from this directory, or `pnpm web check` and `pnpm web build` from the workspace root.
