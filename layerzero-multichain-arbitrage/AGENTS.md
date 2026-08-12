# Project conventions

## Backend

- NestJS uses one application module: `AppModule`.
- Register controllers and services through their `index.ts` barrel arrays.
- Keep transport mapping in controllers and business logic in services.
- Read environment values through `ConfigService`; fixed LayerZero metadata and chain constants belong in `AppConf`.
- Run database changes through TypeORM migrations. Do not enable `synchronize`.
- Generated contract/client code belongs in `src/lib`; do not add unit tests under `src/services`.

## Web

- `web` is a React + strict TypeScript Vite+ client-side SPA.
- Use React Router Declarative Mode only. Router owns URL matching, layout, navigation, and active-link state; it does not own remote data.
- `src/app` composes providers and routes, `src/pages` contains route-level pages, and real user capabilities belong in `src/features`.
- shadcn owns `web/src/components/ui`; add or update primitives with its CLI instead of hand-copying registry code.
- Treat shadcn-generated source under `web/src/components/ui` as read-only. Do not hand-edit or reformat it; customize behavior and appearance through composition, wrappers, props, and `className` in application-owned files.
- Browser code calls the backend only through relative `/api` URLs. In development, Vite proxies `/api` to `http://localhost:1234` and removes the prefix; do not embed the backend origin in feature or page code.
- Use `@/*` for imports from `web/src/*`. Low-level utilities in `src/lib` must not import from components, features, or app.
- Keep browser environment access at the Vite boundary. Only expose explicitly public `VITE_*` values and never place secrets in frontend environment files.
- Production hosting must return `web/index.html` for unknown client routes so BrowserRouter deep links work.
- From this package, validate with `vp -C web check` and `vp -C web build`. No test command is recorded until real frontend tests exist.
