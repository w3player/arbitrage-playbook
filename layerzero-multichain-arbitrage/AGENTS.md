# Project conventions

## Backend

- NestJS uses one application module: `AppModule`.
- Register controllers and services through their `index.ts` barrel arrays.
- Keep transport mapping in controllers and business logic in services.
- Read environment values through `ConfigService`; fixed LayerZero metadata and chain constants belong in `AppConf`.
- Run database changes through TypeORM migrations. Do not enable `synchronize`.
- Generated contract/client code belongs in `src/lib`; do not add unit tests under `src/services`.

## Web integration

- The shared frontend lives at the workspace root in `../web` and owns its own `AGENTS.md`.
- This backend is exposed to the browser through the frontend's `/api/layerzero/*` development proxy. Keep NestJS controller routes scenario-local and do not add the browser prefix to backend controllers.
