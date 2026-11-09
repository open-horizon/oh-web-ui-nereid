# Copilot instructions

## Build, test, and lint

- Install dependencies with `npm ci`.
- Type-check the frontend with `npm run typecheck`.
- Build the frontend with `npm run build` (`tsc -b && vite build`).
- Run the backend unit tests with `node --test server/ns.test.cjs`. To run one test, use `node --test --test-name-pattern="<test name>" server/ns.test.cjs`.
- Check backend syntax with `node --check server/index.cjs && node --check server/sign-utils.cjs && node --check server/ns.cjs && node --check server/oidc.cjs`.
- There is no dedicated linter. `make lint` is an alias for TypeScript type-checking. `make test` is a placeholder and does not run tests.
- CI also builds the backend and frontend Docker targets: `docker build --target backend -t nereid-backend:ci .` and `docker build --target frontend -t nereid-frontend:ci .`.

## Architecture

- The browser app is a React/TypeScript SPA. `src/App.tsx` owns route setup, authentication gating, and session bootstrap; `src/pages/` contains feature screens and `src/components/` shared UI.
- Frontend resource modules in `src/api/` call the shared `src/api/client.ts`, which prefixes paths with `/api`, relies on the browser session cookie, and adds `X-Csrf-Token` to mutations. Keep resource-specific request construction in the matching API module rather than pages.
- `server/index.cjs` is the Express BFF: it implements `/api/*`, authentication and authorization, Exchange proxying, request/audit logging, and deployment signing. `server/db.cjs` owns PostgreSQL schema and persistence; `server/oidc.cjs` and `server/ns.cjs` handle federated login; `server/sign-utils.cjs` handles signing.
- PostgreSQL is required by the backend. The BFF persists local users, encrypted sessions, Exchange configuration, API keys, settings, and audit records. Optional OIDC login is configured through backend environment variables.
- In production, Nginx serves the built SPA, terminates TLS, and proxies `/api` to the BFF. Vite proxies `/api` to the local backend during development.
- Open Horizon resources are org-scoped. Preserve the org boundary in both UI request parameters and BFF authorization; do not treat a missing org as a safe default.

## Repository conventions

- Follow `AGENTS.md` and `CONTRIBUTING.md`. New source files require the repository SPDX header (`Copyright (C) 2026 YIQISOFT`, `SPDX-License-Identifier: Apache-2.0`); code comments are in English.
- Use `t()` from `src/i18n/context.tsx` for user-facing UI text, with matching entries in `src/i18n/en.ts` and `src/i18n/zh.ts`.
- Keep frontend API calls in `src/api/*.ts`, following the existing per-resource modules and shared client; keep backend route behavior in `server/index.cjs` and persistence in `server/db.cjs`.
- The API uses a cookie-backed session and CSRF double-submit protection. Authenticated state-changing requests must go through the shared client so it sends the CSRF header; never put Exchange credentials in browser storage or logs.
- Do not bump the project version (`VERSION`, Helm chart, or image tags) unless explicitly requested.
- When repository prose conflicts with executable source or CI configuration, trust the source/configuration; some documentation may lag implementation.
