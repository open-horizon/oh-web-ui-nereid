# INSTALL — Open-Horizon Exchange UI

This document covers installing and configuring the Open-Horizon Exchange UI: the
backend BFF, the frontend, its own PostgreSQL database, and the first-time connection
to the Open Horizon Exchange REST API.

- [1. Requirements](#1-requirements)
- [2. Environment variables](#2-environment-variables)
- [3. Local development (npm)](#3-local-development-npm)
- [4. First-time Exchange configuration (Setup form)](#4-first-time-exchange-configuration-setup-form)
- [5. Docker deployment](#5-docker-deployment)
- [6. Sessions and security](#6-sessions-and-security)
- [Troubleshooting](#troubleshooting)

---

## 1. Requirements

- **Node.js 20+** and `npm`.
- **PostgreSQL** for the BFF's own database (`DATABASE_URL`). This is a database
  dedicated to the BFF — never the Open Horizon Exchange's own database (both define
  a `users` table with incompatible shapes, and the BFF's startup migration would
  attempt to drop the Exchange's primary key). See [docs/DATABASE.md](docs/DATABASE.md).
  PostgreSQL also stores sessions, so **sessions survive backend restarts**.
- **An optional OpenID Connect provider** for SSO. Set the `OIDC_*` variables to enable
  it; leave `OIDC_ISSUER` unset to use only local password login.
- **An Open Horizon Exchange** the BFF can reach over HTTP, with a **hub-level
  superuser** account (e.g. `root/root`) for first-time setup.

---

## 2. Environment variables

Copy `.env.example` to `.env` and adjust. The backend reads `.env` via
`--env-file-if-exists=.env` when started with `npm run dev:backend` (or the `make dev-*`
targets).

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | BFF listen port |
| `DATABASE_URL` | — (required) | BFF's own PostgreSQL connection string |
| `SESSION_TTL` | `86400` | Session idle lifetime in seconds (24 h) |
| `SESSION_ABS_TTL` | `28800` | Absolute session lifetime in seconds (8 h) |
| `SESSION_ENC_KEY` | _(generated per boot)_ | 32-byte master key as 64 hex chars for AES-256-GCM. **Set it** so sessions survive restarts. |
| `OIDC_ISSUER` | _(unset)_ | OIDC issuer URL; unset disables SSO |
| `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | — | OIDC client credentials |
| `OIDC_REDIRECT_URI` | — | Public callback URL, e.g. `https://host/api/oidc/callback` |
| `OIDC_SCOPES` | `openid profile email` | Requested scopes |
| `OIDC_ROLE_CLAIM` | `groups` | Claim holding group membership |
| `OIDC_PLATFORM_GROUP` | `nereidhorizon-platform` | Group granting the platform role |
| `OIDC_PARTNER_GROUP_PREFIX` | `nereidhorizon-partner-` | Group prefix mapping to an Exchange org |
| `OIDC_LOCAL_LOGIN_ENABLED` | `true` | Set `false` to disable local password login |
| `OIDC_INSECURE_SKIP_VERIFY` | `false` | Skip TLS verification of the IdP (dev only) |

Example `.env` (matching the local `make dev-pg` database):

```env
PORT=3001
DATABASE_URL=postgres://nereid:nereidpass@127.0.0.1:5433/nereid
SESSION_TTL=86400
SESSION_ENC_KEY=
# OIDC (optional)
# OIDC_ISSUER=https://sso.example.com/auth/realms/nereidai
# OIDC_CLIENT_ID=nereidhorizon
# OIDC_CLIENT_SECRET=...
# OIDC_REDIRECT_URI=https://nereidhorizon.example.com/api/oidc/callback
```

> `SESSION_ENC_KEY` is optional in dev. When empty, the server generates and persists a
> key in `logs/.session.key` (mode `0600`). In production always set it via a secret so
> the key survives restarts and is not auto-generated per host.

### 2.1 Single sign-on (OIDC)

When `OIDC_ISSUER` is set, the login page shows a **Sign in with SSO** button. Roles are
mapped from the `OIDC_ROLE_CLAIM` group claim:

- Membership in `OIDC_PLATFORM_GROUP` → `platform` role.
- Each `OIDC_PARTNER_GROUP_PREFIX<org>` group → a partner binding to Exchange org `<org>`
  (org must match `^[a-z0-9][a-z0-9-]*$` and exist in the Exchange).

OIDC logins are **fail-closed**: no matching group, conflicting platform+partner groups,
a malformed org, an org that does not exist, an unverified email, or a disabled account
all reject the login with a localized error. Federated users are JIT-provisioned and
keyed by `(issuer, subject)` — never merged by username or email. Disabling a federated
user in the BFF takes precedence over a later SSO login (disabling is preferred over
deletion, which JIT provisioning would silently undo).

Set `OIDC_LOCAL_LOGIN_ENABLED=false` to hide the password form for regular users. The
bootstrap admin can always reach the password form at `/login?local=1` (break-glass).

`OIDC_ROLE_CLAIM` may be a dotted path for nested claims; against Keycloak without a
groups mapper use `realm_access.roles` and name the realm roles
`nereidhorizon-platform` / `nereidhorizon-partner-<org>`.

When the issuer's certificate comes from an internal CA, keep TLS verification on and
point the backend at that CA with `NODE_EXTRA_CA_CERTS=/path/to/ca.pem` (compose/npm) or
`oidc.caBundleSecret` in the Helm chart. `OIDC_INSECURE_SKIP_VERIFY=true` is for local
development only.

---

## 3. Local development (npm)

### 3.1 Start PostgreSQL

```bash
make dev-pg
```

This starts (idempotently) a dedicated PostgreSQL container `nereid-dev-pg`
(`postgres:16-alpine`) listening on `127.0.0.1:5433`, and writes
`DATABASE_URL=postgres://nereid:nereidpass@127.0.0.1:5433/nereid` into `.env`.

### 3.2 Start the backend and frontend

The easiest path is one command:

```bash
make dev-all
```

This (re)starts `dev-pg`, then the backend, then the frontend, **killing any already
running dev servers first** so re-running it is safe.

- **Backend BFF**: `make dev-backend` → `http://localhost:3001`
- **Frontend (Vite)**: `make dev-frontend` → `http://localhost:8080` (proxies `/api/*`
  to the BFF at `http://localhost:3001`)

Stop with `make dev-stop` (keeps the dev database) or `make dev-clean` (also removes
build artifacts in `dist/` and the dev database container).

---

## 4. First-time Exchange configuration (Setup form)

On first launch (when the BFF has no local users yet) the UI shows a **Setup** form
instead of the login form. It creates the initial platform account and connects the
BFF to the Open Horizon Exchange. The admin password field includes a **random
strong-password generator** (a redescribe button next to the field) and a
**confirm-password** field that must match.

The form requires (verified against the backend `POST /api/setup` logic in
`server/index.cjs`):

| Field | Value |
|---|---|
| **Admin Username** | The BFF's first local `platform` account (e.g. `admin`) |
| **Admin Password** | The admin account's password (min 8 chars); confirm it in the second field |
| **Exchange URL** | Base URL of the Exchange API, e.g. `http://192.168.123.133:3090` — **without** a `/v1` suffix (the backend appends `/v1`) |
| **Exchange Account** | A hub-level superuser that can list all organizations, e.g. `root` |
| **Exchange Password** | The Exchange account's password, e.g. `root` |

Validation performed by the backend during setup:

1. The Exchange must be reachable at `{baseURL}/v1/admin/version`;
2. The account must have hub-level admin privileges — it must be able to list all
   organizations (`GET {baseURL}/v1/orgs`). Regular org-scoped accounts are rejected;
   use `root/root` or an equivalent superuser.

After a successful setup the admin is logged in automatically. The Exchange base URL
and its encrypted credentials are persisted in the `exchange_config` database table.

> The Setup form only appears while no local users exist. To reset it, remove all
> users from the BFF database (and the saved `exchange_config`) and restart.

---

## 5. Docker deployment

The project ships a multi-stage `Dockerfile` and two Compose files.

- **Production** (pull from GHCR): `make docker-up`
- **Local build** (from source): `make docker-dev-up`

The `docker-dev-*` stack is fully isolated from production: it runs under a separate
Compose project (`nereid-dev`), uses its own `*-dev` containers and volumes, and its
own postgres on `127.0.0.1:5434` — so dev and prod can run side by side.

| Command | Description |
|---|---|
| `make docker-up` | Pull GHCR images & start production containers |
| `make docker-down` | Stop and remove production containers (keeps data volumes) |
| `make docker-clean` | Stop and remove containers **and** their data volumes |
| `make docker-dev-up` | Build (if needed) & start the local dev stack |
| `make docker-dev-down` | Stop the local dev stack (keeps data volumes) |
| `make docker-dev-clean` | Stop the local dev stack **and** remove data volumes |

- Production frontend: **https://&lt;host&gt;:8443/** (HTTP on `8090` redirects to HTTPS).
- Local `docker-dev-*` frontend: **http://&lt;host&gt;:8091/** (plain HTTP).

The first launch auto-generates a self-signed certificate at `/etc/nginx/ssl`. For
production, mount real certificates there instead.

---

## 6. Sessions and security

- The session id is an opaque random token in an `HttpOnly; Secure; SameSite=Lax` cookie.
- Mutations require a CSRF double-submit token (`X-Csrf-Token` header + matching
  cookie) set during login.
- Exchange `Basic` credentials are encrypted with AES-256-GCM before storage.
- Sessions live in PostgreSQL, so **restarting the backend does not invalidate them**
  (provided `SESSION_ENC_KEY` is stable). Idle (`SESSION_TTL`) and absolute
  (`SESSION_ABS_TTL`) timeouts still apply.
- Local login is rate-limited: five failed attempts per (IP, username) within five
  minutes lock further attempts.
- OIDC sessions perform RP-initiated logout when the provider publishes an
  `end_session_endpoint`.

---

## 7. Verifying the Exchange connection

After setup, the Exchange version string is stored in `exchange_config.version` and
returned in the login response. You can also verify directly:

```bash
curl -u root/root http://<exchange-host>:3090/v1/admin/version
```

---

## Quick reference: local lab credentials

| Item | Value |
|---|---|
| Exchange URL | `http://192.168.123.133:3090` |
| Exchange credentials | `root/root:KAAqPww59j57tGiqcrNtK6jNrIlLkL` |
| PostgreSQL | `127.0.0.1:5432` (container `pg-nereid`) |
| Agbot | `yiqisoft/agbot` on Exchange server |

> These are lab-only defaults. Replace with real credentials in any non-development environment.

---

## Troubleshooting

- **`/api/me` returns `401 {"msg":"Not logged in"}` after login** — the browser did
  not send a valid session cookie. Try a private/incognito window, or clear cookies
  for the host and port you are using, especially if the same IP is shared across
  multiple UI instances (HTTP vs HTTPS, or multiple ports) that reuse the same
  `nereid_sid` cookie name.
- **`node_modules` corrupt (`ENOTEMPTY`)** — remove `node_modules` and run
  `npm install` again (e.g. `rm -rf node_modules && make install`).
- **Backend won't start** — confirm `DATABASE_URL` is set and PostgreSQL is reachable;
  the server exits at startup if `DATABASE_URL` is unset.
