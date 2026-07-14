# NereidAI Overall System Design

> Last updated: 2026-07-11

---

## 1. Project Overview

NereidAI is a BFF (Backend-For-Frontend) proxy console that provides a graphical management interface for the Open Horizon Exchange REST API.

**Core Goals:**

- Provide a user-friendly Web management UI for the Open Horizon edge computing platform
- Act as a BFF layer proxying all Exchange calls, handling authentication, audit, and signing
- Expose a controlled read-only Partner API for third-party systems
- Maintain a complete append-only audit trail for compliance

---

## 2. Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend Framework | React | 19 |
| Language | TypeScript | 7 |
| Build Tool | Vite | 5 |
| UI Library | Ant Design | 6 |
| Routing | react-router-dom | 7 |
| Backend Framework | Express.js | 5 |
| Runtime | Node.js | 20+ |
| Database | PostgreSQL | 16 |
| Cache (optional) | Redis | 6.2 |
| Reverse Proxy | nginx | |
| Containerization | Docker / docker-compose | |

---

## 3. Architecture Overview

```
[Browser SPA] -- HTTPS --> [nginx] -- /api --> [Express BFF] --> [Open Horizon Exchange]
                                                          |
                                                     [PostgreSQL]
                                                          |
                                                     [Redis (optional)]
```

**Layer Description:**

- **Frontend (SPA)**: React + Ant Design + TypeScript, built with Vite, runs in the browser
- **Reverse Proxy (nginx)**: TLS termination, static asset serving, API proxy, security headers
- **BFF Backend (Express.js 5)**: All business logic — authentication, session management, Exchange proxy, service deployment signing, audit
- **Database (PostgreSQL)**: Required component, stores BFF users, API keys, Exchange config, audit log
- **Redis (optional)**: Encrypted session persistence, degrades gracefully to in-memory when unavailable

---

## 4. Module Breakdown

### 4.1 Backend (server/)

| File | Responsibility | Lines |
|---|---|---|
| `server/index.cjs` | Express app: middleware, routes, auth, Exchange proxy, signing | ~2053 |
| `server/db.cjs` | PG pool, schema init (5 tables), CRUD helpers | 268 |
| `server/sign-utils.cjs` | RSA-PSS SHA-256 key generation and deployment signing | 46 |

**Backend middleware chain (in order):**

1. Request timing + audit wrapper (intercepts `res.end`)
2. Health check endpoint (public)
3. Global guard (session / API Key check)
4. CSRF validation (mutating requests)
5. Route handlers

### 4.2 Frontend (src/)

| Category | File(s) | Responsibility |
|---|---|---|
| Entry | `main.tsx` | React 19 mount point |
| Root | `App.tsx` | Routing, RequireAuth, SessionBootstrap |
| Layout | `components/AppLayout.tsx` | Sidebar nav, header, logout |
| API Client | `api/client.ts` | Unified HTTP request layer |
| API Modules | `api/*.ts` (12 files) | Per-resource API call wrappers |
| Pages | `pages/*.tsx` (15 files) | Feature pages |
| i18n | `i18n/context.tsx` + `zh.ts` | Chinese/English switching |
| Hooks | `hooks/usePolling.ts`, `useIsMobile.ts` | Polling, responsive detection |

**Page list:**

| Page | Route | Description |
|---|---|---|
| Dashboard | `/` | Organization status overview |
| Services | `/services` | Service CRUD with 8-panel deployment form |
| Patterns | `/patterns` | Deployment pattern CRUD |
| Policies | `/policies` | Deployment policy CRUD |
| MgmtPolicies | `/mgmtpolicies` | Management policy CRUD |
| Nodes | `/nodes` | Edge node management |
| Agbots | `/agbots` | Agreement bot management |
| Organizations | `/organizations` | Organization management |
| Users | `/users` | Exchange user management |
| HaGroups | `/hagroups` | HA group management |
| Catalog | `/catalog` | Public catalog browsing |
| AgentFileVersion | `/agentfileversion` | Agent file version info |
| AuditLog | `/audit` | Audit log viewer |
| Login | `/login` | Login / first-time setup |
| Help | `/help` | User documentation |

---

## 5. Authentication & Authorization

### 5.1 Two-Layer Authentication

| Layer | Identity | Purpose | Storage |
|---|---|---|---|
| BFF Local Account | Console user (platform / partner) | Who can use the console UI | `users` table (PG) |
| System Exchange Credential | Shared credential set | BFF proxies Exchange calls | `exchange_config` table (singleton) |
| Partner API Key | Third-party system | Calls BFF Partner API | `api_keys` table |

### 5.2 BFF Roles

| Role | Capabilities |
|---|---|
| **platform** | Cross-org full access: manage BFF users, Exchange config, all API keys, read/write Exchange resources |
| **partner** | Bound to one org, full read/write on Exchange resources within org (services, patterns, nodes, users, etc.), self-service API key management, cannot manage BFF users or Exchange config |

### 5.3 Console Session

- Cookie: `nereid_sid` (HttpOnly + SameSite=Strict + auto Secure detection)
- CSRF: Double-submit pattern — `nereid_csrf` cookie + `X-Csrf-Token` header
- Dual timeout: Idle TTL (`SESSION_TTL`, default 24h) + Absolute TTL (`SESSION_ABS_TTL`, default 8h)
- Session encryption: AES-256-GCM (`SESSION_ENC_KEY`), persisted to Redis (optional)

### 5.4 Partner API

- Authentication: `X-Api-Key` header
- Org isolation: org forced from key binding; path `{org}` mismatch returns 403
- Read-only: GET only (mutations return 403)
- Allowlist: `/services`, `/patterns`, `/business/policies`, `/managementpolicies`, `/nodes`, `/users`, `/hagroups`, `/AgentFileVersion` (and sub-paths)

### 5.5 API Keys

- Format: `nk_{live|test}_<36 bytes base64url>`
- Storage: DB stores only `sha256(plaintext)`; plaintext returned once at creation
- Revocation: `revoked = true` (soft delete)
- Expiry: Optional `expires_at` field

---

## 6. Data Flow

### 6.1 Console Login

```
User -> POST /api/login (username + password)
   -> DB lookup, scrypt password verification
   -> Create nereid_sid + nereid_csrf cookies
   -> Return session info (orgId, role, csrfToken)
```

### 6.2 Exchange Resource Operation

```
User -> API request (cookie + CSRF header)
   -> Global guard validates session
   -> CSRF middleware validates mutating requests
   -> Route handler calls exch()
   -> exch() proxies to Exchange with shared credentials
   -> Return response + write audit log
```

### 6.3 Partner API Request

```
Third party -> GET /api/v1/{org}/services (X-Api-Key)
   -> Global guard passes through (recognizes X-Api-Key)
   -> partnerAuth middleware finds & validates key (sha256)
   -> Route handler checks org, allowlist, read-only
   -> exch() proxies request with shared Exchange credentials
   -> Return response + write audit log
```

---

## 7. Database Schema

All tables auto-created by `db.initSchema()` on PostgreSQL.

### 7.1 users (BFF Local Accounts)

```sql
CREATE TABLE users (
  username    TEXT PRIMARY KEY,
  hash        TEXT NOT NULL,       -- scrypt hash (64 bytes hex)
  salt        TEXT NOT NULL,       -- random salt (16 bytes hex)
  role        TEXT NOT NULL CHECK (role IN ('platform','partner')),
  org         TEXT,                -- NULL for platform, required for partner
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

### 7.2 api_keys (Partner API Keys)

```sql
CREATE TABLE api_keys (
  id          UUID PRIMARY KEY,
  key_hash    TEXT NOT NULL UNIQUE, -- sha256(plaintext)
  key_plain   TEXT NOT NULL,        -- stored for later retrieval via GET /api/apikeys/:id/key
  org         TEXT NOT NULL,
  label       TEXT NOT NULL,
  revoked     BOOLEAN DEFAULT false,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now(),
  created_by  TEXT
);
```

### 7.3 exchange_config (Exchange Connection, Singleton)

```sql
CREATE TABLE exchange_config (
  id          INTEGER PRIMARY KEY DEFAULT 1,  -- fixed at 1
  base_url    TEXT NOT NULL,
  auth        TEXT NOT NULL,       -- base64(username:password)
  org_id      TEXT NOT NULL,
  version     TEXT,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  updated_by  TEXT
);
```

### 7.4 audit_log (Audit Trail, Append-Only)

```sql
CREATE TABLE audit_log (
  id          BIGSERIAL PRIMARY KEY,
  ts          TIMESTAMPTZ DEFAULT now(),
  actor_type  TEXT NOT NULL,       -- 'user' | 'apikey' | 'system'
  actor       TEXT NOT NULL,       -- username or apikey:{label}
  org         TEXT,
  method      TEXT NOT NULL,
  path        TEXT NOT NULL,
  status      INTEGER,
  ip          TEXT,
  ms          INTEGER,
  proxied_to  TEXT,                -- actual Exchange endpoint proxied to
  detail      JSONB
);
```

### 7.5 settings (System Settings, Key-Value)

```sql
CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Stores runtime parameters such as `session_ttl`, `session_abs_ttl`, `audit_retention_days`. Read/written via `GET/PUT /api/settings`.

---

## 8. Security Design

| Item | Approach |
|---|---|
| Password Storage | `crypto.scryptSync` + 16-byte random salt, `timingSafeEqual` comparison |
| Session Cookie | HttpOnly + SameSite=Strict + auto Secure (HTTPS detection) |
| CSRF | Double-submit: nereid_csrf cookie + X-Csrf-Token header |
| API Key Storage | Only `sha256(plaintext)` stored; plaintext never persisted |
| Session Encryption | AES-256-GCM (`SESSION_ENC_KEY`) for Redis persistence |
| Session Timeout | Idle 24h + Absolute 8h |
| Partner API | Read-only (GET) + org isolation + endpoint allowlist |
| Audit | Append-only, immutable, includes actual proxied endpoint |
| Request Body Filtering | Allowlist pattern (`serviceBody`, `patternBody`, `sanitizeBody`) |
| Deployment Signing | RSA-PSS SHA-256, auto-sign on service create/update |

---

## 9. Service Deployment Signing

Open Horizon requires the service `deployment` field to carry an RSA-PSS SHA-256 signature.

- Key generation: `server/sign-utils.cjs` — 2048-bit RSA, PKCS#1 private / SPKI public key
- Auto-signing: On service creation (POST) or update (PUT), if `deployment` is present it is automatically signed
- Public key upload: After signing, the public key is uploaded to Exchange (`/orgs/{org}/services/{id}/keys/{id}.public.pem`)

---

## 10. Audit System

- Scope: All `/api` requests (console + Partner API) are recorded
- Storage: `audit_log` table, append-only (no UPDATE/DELETE in application code)
- Content: actor, org, method, path, status, IP, response time ms, actual proxied endpoint, request body summary
- Query: Newest-first order; platform sees all orgs, partner sees only own org
- Retention: Unlimited (configurable via `audit_retention_days`, 0=forever, >0 hourly purge)

---

## 11. Deployment

### 11.1 docker-compose

```yaml
services:
  postgres:      # PostgreSQL 16-alpine, required
  redis:         # Redis 6.2-alpine, optional (degrades to in-memory)
  backend:       # Express BFF (node:20-alpine)
  frontend:      # nginx + static assets + TLS
```

### 11.2 Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `PORT` | No | 3001 | Backend listen port |
| `SESSION_TTL` | No | 86400 | Session idle timeout (seconds) |
| `SESSION_ABS_TTL` | No | 28800 | Session absolute timeout (seconds) |
| `SESSION_ENC_KEY` | No | auto-generated | AES-256-GCM key (64 hex chars) |
| `REDIS_URL` | No | — | Redis connection string (optional) |
| `NODE_ENV` | No | development | production enables API Key `live` prefix |

## 12. UI/UX Design

### 12.1 Login / Setup

- Single route `/login`, auto-detects `/api/setup-status`:
  - `needsSetup=true`: renders **Setup form** (create admin + configure Exchange)
  - `needsSetup=false`: renders **Login form** (BFF user sign-in)
- Setup form: one vertical form, two sections — top (admin account), bottom (Exchange connection URL/credentials)
- On setup success: auto-login, redirect to Dashboard
- On login success: redirect to Dashboard
- Login response includes `csrfToken`; store in `api/config.ts` for subsequent mutating requests

### 12.2 Roles & Menus

| Role | Menu visibility |
|---|---|
| **platform** | Full menu |
| **partner** | All except BFF User Management and Exchange Settings |

Role gating on every page:
- Partner pages are fully functional (CRUD enabled) but org is locked
- Platform users can operate across orgs

### 12.3 Dashboard Layout

```
┌─────────────────────────────────────────────┐
│  Platform only: global summary cards        │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐       │
│  │Nodes │ │Services│ │Pattern│ │Agbot │       │
│  │Total │ │Total  │ │Total  │ │Total  │       │
│  └──────┘ └──────┘ └──────┘ └──────┘       │
│  Partner: single-org stats (own org only)    │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐       │
│  │Nodes │ │Services│ │Pattern│ │Agbot │       │
│  │  3   │ │  2    │ │  1    │ │  0   │       │
│  └──────┘ └──────┘ └──────┘ └──────┘       │
└─────────────────────────────────────────────┘
```

- Partner: bottom section only, org locked to own org
- Platform: top section shows cross-org aggregate stats; bottom section shows current org details

### 12.4 Org Switcher

- Platform users see an org dropdown on **resource pages** (Nodes, Services, Patterns, Policies), placed in the toolbar row left of the search input
- Selection scoped to the current page, passed via `?org=` query parameter
- Partner users have no org switcher — always locked to their bound org

### 12.5 API Key Management

- **Platform**: manages keys for all orgs via `/api/apikeys` (create / list / view-key / delete)
- **Partner**: self-service in "My API Keys" page via `/api/my-apikeys`
- Plaintext key shown once at creation; retrievable later via `GET /api/apikeys/:id/key`
- List shows label, status (active/revoked), expiry
- Revoked keys can be renewed (`POST /api/apikeys/:id/renew`)

### 12.6 Audit Log

- `/audit` page, newest-first list
- Click to open detail drawer (shows proxied_to, detail JSON, etc.)
- Platform sees all orgs, can filter by org dropdown
- Partner sees own org only

### 12.7 Settings Page (platform only)

Left-side menu with two tabs:

**Connection** — Exchange configuration: view / update (URL, credentials). Changes take effect immediately.

**Session & Audit** — Runtime parameters persisted in PG:
- `session_ttl`: idle timeout (default 86400s)
- `session_abs_ttl`: absolute timeout (default 28800s)
- `audit_retention_days`: audit log retention (0 = unlimited)

Read/written via `GET/PUT /api/settings`.

### 12.8 Edge Nodes — User Input Management

The node detail drawer includes a **User Input** tab for managing environment variables passed to edge service containers via `userInput`.

- On first drawer open, the available Exchange services are loaded for the service selector
- Each service entry has a `<Select>` dropdown listing known services; selecting one auto-fills `serviceOrgid`, `serviceUrl`, `serviceArch`
- `inputs` are displayed as editable key:value rows (add / modify / delete)
- Multiple service entries can be added, each with its own set of variables
- **Save** calls `PATCH /api/nodes/{id}` to update only the `userInput` field, leaving other node attributes (pattern, registeredServices, etc.) untouched
- Under the hood, the BFF proxies `PATCH /orgs/{org}/nodes/{nodeId}` to the Exchange API for in-place partial updates

Frontend API: `NodeAPI.updateUserInput(nodeId, userInput, org?)` defined in `src/api/nodes.ts`.

---

## 13. Code Structure

```
NereidOpenHorizon/
├── server/
│   ├── index.cjs           # Express application entry point
│   ├── db.cjs              # PostgreSQL data layer
│   └── sign-utils.cjs      # RSA-PSS signing utilities
├── src/
│   ├── main.tsx            # React entry point
│   ├── App.tsx             # Routing + session bootstrap
│   ├── api/                # API client modules
│   ├── pages/              # 15 feature pages
│   ├── components/         # Shared components
│   ├── hooks/              # Custom hooks
│   └── i18n/               # Internationalization (zh/en)
├── docs/
│   ├── DESIGN-overall-en.md          # This file (English overall design)
│   ├── DESIGN-overall-zh.md          # Overall design (Chinese)
│   ├── DESIGN-auth-multitenancy.md   # Auth & multi-tenancy design (Chinese)
│   ├── openapi-console.yaml          # Console API spec
│   ├── openapi-partner.yaml          # Partner API spec
│   ├── openapi.yaml.deprecated       # Legacy spec (deprecated)
│   └── PRODUCTION.md                 # Production deployment guide
├── docker-compose.yaml   # Container orchestration
├── Dockerfile             # Build image
├── nginx.conf             # nginx configuration
└── vite.config.ts         # Vite configuration
```
