# AGENTS.md — NereidAI Open-Horizon Exchange UI

Compact guidance for OpenCode sessions. Every line is something an agent would likely
miss without help. Trust executable source (scripts, config, code) over prose docs;
the README is partly stale (e.g. it says Redis is required — it is not).

## Behavior
- Be concise and direct; answer with as few lines as possible; no preamble/postamble; no emojis unless asked.
- Do not commit or push unless explicitly requested.
- Don't surprise the user — confirm before risky/irreversible operations.
- Reference code as `file_path:line_number`.
- **CRITICAL: Never speculate or make up technical claims.** Only state what is directly confirmed by documentation, source code, or the user. When unsure about a technical mechanism, ask the user for direction instead of fabricating an explanation. If you cannot find clear evidence in docs/code, say so rather than inventing.
- **CRITICAL: Before doing any time-consuming reasoning, investigation, or complex logical operations, ALWAYS ask the user first.** Do not waste time and resources on autonomous research without permission. Ask for clarification on where the problem is, then proceed.

## Stack & Layout
- Frontend: React 18 + Vite + TypeScript + Ant Design 5, React Router v6 (`src/`).
- Backend BFF: a single Express 5 file, `server/index.cjs` — all `/api/*` routes, auth,
  Exchange proxying, RSA-PSS signing, audit log, partner API. `server/db.cjs` is the pg
  layer (schema + CRUD). `server/sign-utils.cjs` does deployment signing.
- The BFF proxies the Open Horizon Exchange REST API; the Exchange base URL is set once
  via `POST /api/setup` and persisted in the `exchange_config` table.

## Dev commands (verified)
- Frontend: `npm run dev` → Vite on `:5173`, proxies `/api/*` → `http://localhost:3001`.
- Backend: `npm run dev:backend` (== `node server/index.cjs`) → `:3001`.
- Typecheck: `npm run typecheck` (`tsc --noEmit`). Build: `npm run build` (`tsc -b && vite build`).
- There is **no lint script and no test framework** — do not run `npm run lint` / `npm test`.
- Start scripts: `start-backend.sh`, `start-frontend.sh` (both handle port cleanup).

## Backend env (verified)
- `DATABASE_URL` — **REQUIRED** (PostgreSQL). Server exits at startup if unset; schema
  auto-inits via `db.initSchema()` before `app.listen`. Example: `postgresql://user:pass@host:5432/dbname`.
- `PORT` — default `3001`.
- `REDIS_URL` — OPTIONAL. If unset, the backend uses an in-memory session store and
  **all sessions are lost on restart**. The README's "Redis required" claim is stale.
- `SESSION_TTL` (seconds, default 86400); `SESSION_ENC_KEY` (optional 64-hex; if set,
  encrypted sessions survive restarts).

## Infrastructure (verified)
- PostgreSQL: Docker container `pg-nereid` on `127.0.0.1:5432`, credentials in start scripts.
- Exchange API: `http://192.168.123.133:3090/v1`, credentials `root/root:KAAqPww59j57tGiqcrNtK6jNrIlLkL`.
- Agbot: Container `agbot` on Exchange server, ExchangeId `yiqisoft/agbot`.
- Edge nodes: `192.168.123.218` (node1, root, no password), `192.168.123.219` (NUC, root, no password).

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

## Open Horizon Architecture & Agent Container Lifecycle

### OH Components (from `open-horizon.github.io/docs/getting_started/components/`)
| Component | Role |
|---|---|
| **Exchange API** | REST catalog for all resources (services, patterns, policies, nodes, agbots). Source of truth. |
| **Agbot** (Agreement Bot) | Central deployment engine — matches node policy/service policy/deployment policy → forms Agreements with Agents. Runs on the Mgmt Hub. |
| **Agent (anax)** | Runs on each edge node. Manages container lifecycle via workers: `Container`, `Governance` (subworkers: `ContainerGovernor`, `MicroserviceGovernor`), `Agreement`, `ImageFetch`, etc. |
| **CSS** (Cloud Sync Service) | Distributes model objects and agent upgrade files to edge nodes. |

### Agreement-Driven Lifecycle (CRITICAL)
- "The lifecycle of a service never exceeds the lifecycle of an active agreement." (`docs/anax/docs/managed_workloads.md`)
- **Agreement** = contract between Agbot and Agent. Top-level services (referenced by pattern or deployment policy) get their own `agreementId`.
- **Agreement-less services**: Dependent services of a top-level service are started WITHOUT their own agreement — they piggyback on the parent's agreement. The agent labels them `agreement_less: true` internally.
- **Without an agreementId, the agent's ContainerGovernor will NOT manage the container's lifecycle.** Any manually deleted container will NOT be restarted unless it's:
  - A top-level service with an active agreement, OR
  - A dependent (agreement-less) service of a top-level service that has an active agreement.

### `configState` vs `agreementId` (Common Confusion)
| Field | Meaning |
|---|---|
| `configState: "active"` | The service's definition/config was received by the agent and applied. **Does NOT imply the container is running.** |
| `configState: "suspended"` | The service's config was received but marked as suspended (not active). Agent will not run it. |
| `agreementId` (non-empty) | An active agreement exists — the agent will **restart** this container if deleted/crashed. |
| `agreementId` (empty) | No agreement — the agent **will NOT** manage container lifecycle. Manual deletion = permanent stop. |

### How the Agent Reports Container State (Node `/status`)
The Exchange's `GET /orgs/{org}/nodes/{node}/status` response includes an array of services with:
- `containerStatus[0].state` — Docker container state (`"running"`, `"not started"`, `"starting"`, `"exited"`, etc.). Raw from `docker inspect`.
- `agreementId` — empty string if no agreement governs this service.
- `configState` — `"active"` or `"suspended"`.

### Pattern vs Policy Deployment
- **Pattern** (`hzn register -p <pattern>`): Static list of top-level services. Agent resolves the dependency tree automatically. Dependent services are marked `agreement_less`.
- **Policy** (node policy + deployment policy): Dynamic bi-directional matching via properties & constraints. Agbot computes compatibility, then forms individual agreements per service.
- Both ultimately produce the same result: top-level services get agreementIds, dependents run agreement-less.

### Container Naming Convention
- **With agreement**: `/{agreementId}-{serviceName}` (e.g., `/00a9be79-edgex-ui-go`)
- **Without agreement** (infra/dependent): `/{org}_{serviceUrl}_{version}_{uuid}-{serviceName}` (e.g., `/yiqisoft_edgex-core-consul_1.0_42ddec86-edgex-core-consul`)
- The `created: 0` + `state: "not started"` pattern means the agent knows about the service definition but never successfully started the container.

### Key takeaway for the UI
- If a service shows `agreementId: ""` with `containerStatus.state: "not started"`, it means **no agreement was ever formed and the container will NOT be automatically restarted**. The solution is either:
  1. Form a new agreement (via pattern re-registration or policy reconciliation)
  2. Restart the agent (`systemctl restart horizon.service` on device) to re-trigger agreement formation
  3. Manually start the container (not recommended — no lifecycle management)<!-- End of OH Architecture Reference -->
