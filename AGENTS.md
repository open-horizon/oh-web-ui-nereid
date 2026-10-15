# AGENTS.md — NereidAI Open-Horizon Exchange UI

> **Read the root treaty first — it is mandatory.** This repository is governed by the
> NereidAI root treaty at [`../AGENTS.md`](../AGENTS.md) (workspace root): license headers,
> comments, change principles, verification policy, process/runtime safety, repository
> boundaries, working style, commits, generic i18n/docs rules, architecture invariants,
> and the English coaching protocol. This file contains **project-specific rules only**;
> it may tighten the treaty but never weaken it, and it never repeats it.

Compact project memory. Every line is something an agent would likely miss without help.
Trust executable source (scripts, config, code) over prose docs; the README is partly stale
(e.g. it says Redis is required — it is not).

## Working Style (project-specific tightening)

- **Before any time-consuming investigation or complex reasoning, ask the user first**
  where the problem is; do not spend resources on autonomous research without permission.

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
- **Restarting `:3001` wipes sessions.** A second `node server/index.cjs` while `:3001` is
  bound fails silently on EADDRINUSE and the OLD code keeps serving (generic one-server-per-
  port rule: treaty §5) — kill the existing PID first, then expect users to re-login unless
  `SESSION_ENC_KEY` is set.
- **Platform create flows require an org.** Service/Pattern/Policy/Agbot creation in the
  UI defaults to the current page-org filter and errors if none is chosen; the backend
  rejects `?org=root` for platform. Never assume a default org.
- **"All Organizations" view:** when platform selects it (no `?org=`), the backend
  aggregates all non-`root` orgs server-side. `root` is excluded from org dropdowns.

### EdgeX Container DNS Resolution Issue (CRITICAL)
- **Problem**: EdgeX services (e.g., `edgex-app-gateway`) fail to start in Open Horizon because they try to resolve hostnames via Docker DNS, but OH prefixes container names with `{agreementId}-`, so the DNS name doesn't match.
- **Error**: `listen tcp: lookup edgex-app-service-gateway on 127.0.0.11:53: no such host`
- **Root cause**: EdgeX services are designed for Docker Compose where service names are used as hostnames. In OH, container names are `{agreementId}-{serviceName}`, breaking DNS resolution.
- **Symptoms**: Container exits with code 255 → Docker restarts (policy=always) → GovernanceWorker detects restarting container → terminates agreement (reason 103) → all containers deleted → agbot creates new agreement → cycle repeats.
- **Solution**: Modify service definition to use correct hostname or add DNS alias. This must be fixed in the EdgeX service definition, not in the UI.
- **Workaround**: SSH to node and check `docker logs <container>` to identify which service is failing.

## Conventions
- **Version is `v0.0.1` — never bump it.** `VERSION`, `deploy/helm/nereidhorizon/Chart.yaml`
  and any image tag stay at `0.0.1`/`v0.0.1`; do not raise them on your own. Only the user
  changes the version, and only on explicit request.
- New UI strings go in `src/i18n/zh.ts` with the translation-comment convention wired in
  `src/i18n/context.tsx` (generic i18n rules: treaty §9).
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
