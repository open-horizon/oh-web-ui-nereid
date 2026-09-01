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
- **Redis** (optional). Used for session storage. If unset, the backend falls back to
  an in-memory session store; all sessions are lost on restart. The BFF talks to the
  Exchange over HTTP and never needs Exchange database credentials.
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
| `REDIS_URL` | `redis://redis:6379` | Redis connection string (optional; unset = in-memory sessions) |
| `SESSION_TTL` | `1800` | Session idle lifetime in seconds (30 min) |
| `SESSION_ENC_KEY` | _(auto-generated)_ | 32-byte master key as 64 hex chars for AES-256-GCM. Override in production to persist across restarts. |

Example `.env` (matching the local `make dev-pg` database):

```env
PORT=3001
DATABASE_URL=postgres://nereid:nereidpass@127.0.0.1:5433/nereid
REDIS_URL=redis://redis:6379
SESSION_TTL=1800
SESSION_ENC_KEY=
```

> `SESSION_ENC_KEY` is optional. When empty, the server generates and persists a key in
> `.session.key` (mode `0600`). In production, always set it via a secret so the key
> survives restarts and is not auto-generated per host.

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

- The session id is an opaque random token in an `HttpOnly; Secure; SameSite` cookie.
- Mutations require a CSRF double-submit token (`X-Csrf-Token` header + matching
  cookie) set during login.
- Exchange `Basic` credentials are encrypted with AES-256-GCM before storage.
- Without Redis, sessions are in-memory: **restarting the backend invalidates all
  sessions and users must re-login.** Set `REDIS_URL` for persistent sessions.

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
