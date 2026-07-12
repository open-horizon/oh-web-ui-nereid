# AGENTS.md — NereidAI Open-Horizon Exchange UI

Compact guidance for OpenCode sessions. Every line is something an agent would likely
miss without help. Trust executable source (scripts, config, code) over prose docs;
the README is partly stale (e.g. it says Redis is required — it is not).

## Behavior
- Be concise and direct; answer with as few lines as possible; no preamble/postamble; no emojis unless asked.
- Do not commit or push unless explicitly requested.
- Don't surprise the user — confirm before risky/irreversible operations.
- Reference code as `file_path:line_number`.

## Stack & Layout
- Frontend: React 18 + Vite + TypeScript + Ant Design 5, React Router v6 (`src/`).
- Backend BFF: a single Express 5 file, `server/index.cjs` — all `/api/*` routes, auth,
  Exchange proxying, RSA-PSS signing, audit log, partner API. `server/db.cjs` is the pg
  layer (schema + CRUD). `server/sign-utils.cjs` does deployment signing.
- The BFF proxies the Open Horizon Exchange REST API; the Exchange base URL is set once
  via `POST /api/setup` and persisted in the `exchange_config` table.

## Dev commands (verified)
- Frontend: `npm run dev` → Vite on `:8080`, proxies `/api/*` → `http://localhost:3001`.
- Backend: `npm run dev:backend` (== `node server/index.cjs`) → `:3001`.
- Typecheck: `npm run typecheck` (`tsc --noEmit`). Build: `npm run build` (`tsc -b && vite build`).
- There is **no lint script and no test framework** — do not run `npm run lint` / `npm test`.

## Backend env (verified)
- `DATABASE_URL` — **REQUIRED** (PostgreSQL). Server exits at startup if unset; schema
  auto-inits via `db.initSchema()` before `app.listen`.
- `PORT` — default `3001`.
- `REDIS_URL` — OPTIONAL. If unset, the backend uses an in-memory session store and
  **all sessions are lost on restart**. The README's "Redis required" claim is stale.
- `SESSION_TTL` (seconds, default 86400); `SESSION_ENC_KEY` (optional 64-hex; if set,
  encrypted sessions survive restarts).

## Auth & CSRF (verified)
- Roles: `platform` (cross-org) and `partner` (single bound org). First run requires
  `POST /api/setup` with a **hub-level** Exchange account (e.g. `root/root`) before any
  login works.
- Session = `nereid_sid` HttpOnly cookie + CSRF double-submit (`nereid_csrf` cookie +
  `X-Csrf-Token` header). `src/api/client.ts` auto-attaches `X-Csrf-Token` from
  `cfg.csrfToken` (set by `Login.tsx` from the login response). Any mutation without it
  returns 403.
- Partner API: `GET /api/v1/{org}/...` with `X-Api-Key`; read-only; org is forced from
  the key binding (caller cannot choose org).

## Operational gotchas (learned the hard way)
- **One backend per port.** Starting a second `node server/index.cjs` while `:3001` is
  bound fails silently (EADDRINUSE) and you keep serving the OLD code. Kill the existing
  PID before restarting. After any restart, in-memory sessions are wiped → users must
  re-login.
- **Platform create flows require an org.** Service/Pattern/Policy/Agbot creation in the
  UI defaults to the current page-org filter and errors if none is chosen; the backend
  rejects `?org=root` for platform. Never assume a default org.
- **"All Organizations" view:** when platform selects it (no `?org=`), the backend
  aggregates all non-`root` orgs server-side. `root` is excluded from org dropdowns.

## Conventions
- Comments explain *why*; add i18n translation comments for new UI text (strings live in
  `src/i18n/zh.ts` + `src/i18n/context.tsx`).
- New API clients go in `src/api/*.ts` mirroring the existing per-resource modules.
