# Database

The BFF (`server/index.cjs`) requires PostgreSQL. It is mandatory in both development
and production — `server/db.cjs` calls `process.exit(1)` at startup if `DATABASE_URL`
is unset, and again if it cannot connect after 10 retries at 3s intervals.

---

## ⛔ The BFF must have its own database

**`DATABASE_URL` must never point at the Open Horizon Exchange's own database.**

The BFF owns and migrates its schema on every startup. The Exchange owns and migrates
its schema independently. They both define a table named `users`, with completely
different shapes:

| | BFF `users` | Exchange `users` |
|---|---|---|
| Identity column | `username TEXT` | `"user" UUID` |
| Primary key | none (composite unique indexes) | `users_pkey` on `("user")` |
| Other columns | `hash`, `salt`, `role`, `org`, `created_at` | `organization`, `email`, `password`, `is_org_admin`, `is_hub_admin`, `modified_by`, … |

Because the BFF's bootstrap uses `CREATE TABLE IF NOT EXISTS users`, pointing it at the
Exchange database does **not** produce a clean error. The create silently no-ops against
the Exchange's table, and startup proceeds to the migrations in `server/db.cjs`:

```js
await c.query('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_pkey');
await c.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_platform_unique ON users(username) WHERE org IS NULL');
await c.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_partner_unique ON users(username, org) WHERE org IS NOT NULL');
```

That first statement then targets the **Exchange's** primary key. In the Exchange schema,
`users_pkey` is referenced by eight foreign keys — from `nodes`, `agbots`, `services`,
`patterns`, `businesspolicies`, `managementpolicies`, `apikeys`, and `users` itself
(`modified_by` → `user`). PostgreSQL refuses the drop:

```
cannot drop constraint users_pkey on table users because other objects depend on it
```

**That refusal is the only thing standing between this migration and a broken Exchange.**
It is a safety net, not a design. Do not rely on it, and do not "fix" the error by adding
`CASCADE`.

The BFF will also scatter four of its own tables into the Exchange database on the way
past (`api_keys`, `audit_log`, `exchange_config`, `settings`). These do not collide by
name — note the Exchange's own table is `apikeys`, without the underscore — so they are
easy to miss. See [Cleaning up a misconfigured run](#cleaning-up-a-misconfigured-run).

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | — | **Required.** PostgreSQL connection string for the BFF's own database. |

`server/db.cjs` opens a pool with `max: 10` and `idleTimeoutMillis: 30000`.

Nothing in the codebase loads a `.env` file implicitly — there is no `dotenv` dependency.
The `dev:backend` script passes `--env-file-if-exists=.env` to Node (requires Node 20.12+),
so a local `.env` is picked up:

```json
"dev:backend": "node --env-file-if-exists=.env server/index.cjs"
```

If you run `node server/index.cjs` directly, you must export `DATABASE_URL` yourself.

### Docker Compose

`docker-compose.yaml` provisions a dedicated `postgres:16-alpine` service for the BFF —
database `nereid`, user `nereid` — and wires it up:

```yaml
DATABASE_URL=postgres://nereid:${POSTGRES_PASSWORD:-nereidpass}@postgres:5432/nereid
```

The backend `depends_on` postgres with `condition: service_healthy`, so the retry loop is
mostly belt-and-braces there. Set `POSTGRES_PASSWORD` in production rather than taking the
default.

### Local development

Create a database that belongs to the BFF alone. Against a PostgreSQL you already have
running, that means a new database — not a new schema inside the Exchange's:

```sql
CREATE ROLE nereid LOGIN PASSWORD '<pick-one>';
CREATE DATABASE nereid OWNER nereid;
```

```bash
# .env
DATABASE_URL=postgresql://nereid:<pick-one>@localhost:5432/nereid
```

Then `npm run dev:backend`. On success the log reads:

```
[db] schema ready
```

The BFF connects to the Exchange over **HTTP**, via `EXCHANGE_URL` and the Exchange
connection config stored in `exchange_config`. It never needs Exchange database
credentials.

---

## Schema

Created idempotently on every startup by `initSchema()` in `server/db.cjs`.

### `users`

BFF accounts (distinct from Exchange users). Local accounts store a password
hash + per-user salt; OIDC accounts store no password and are identified by
`(issuer, subject)`.

```sql
username   TEXT NOT NULL
hash       TEXT
salt       TEXT
role       TEXT NOT NULL CHECK (role IN ('platform','partner'))
org        TEXT
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
email      TEXT
issuer     TEXT
subject    TEXT
disabled   BOOLEAN NOT NULL DEFAULT false
bootstrap  BOOLEAN NOT NULL DEFAULT false
```

`hash`/`salt` are nullable (OIDC users have no password); `bootstrap` marks the
initial break-glass platform admin, which can never be deleted or disabled.

There is deliberately **no primary key**. Uniqueness is enforced by three partial
indexes:

- `idx_users_local_platform_unique` — unique on `(username)` where `issuer IS NULL AND org IS NULL`
  (local platform users are globally unique)
- `idx_users_local_partner_unique` — unique on `(username, org)` where `issuer IS NULL AND org IS NOT NULL`
  (local partner users are unique per org)
- `idx_users_oidc_identity` — unique on `(issuer, subject)` where `issuer IS NOT NULL`
  (federated users are keyed by their IdP identity and may reuse any username)

Local lookups must disambiguate on `org`; `getUser()`, `deleteUser()`, `updatePassword()`,
and `updateUser()` each branch on whether `org` was supplied, matching `org IS NULL`
when it was not. OIDC users are read/written with `getOidcUser()` / `updateOidcUser()` /
`deleteOidcUser()`.

### `sessions`

Server-side sessions. The payload (including the shared Exchange `Basic` auth and, for
OIDC logins, the ID token used for RP-initiated logout) is encrypted with AES-256-GCM
under `SESSION_ENC_KEY`; only the opaque session id is exposed to the browser.

```sql
id         TEXT PRIMARY KEY
user_id    TEXT
ciphertext TEXT NOT NULL
born_at    BIGINT NOT NULL
seen_at    BIGINT NOT NULL
expire_at  TIMESTAMPTZ NOT NULL
```

Indexed on `expire_at`. Expired rows are deleted by a background sweeper
(`deleteExpiredSessions()`). Because sessions live here, a backend restart or a
second replica preserves logins.

### `api_keys`

Org-scoped, revocable partner API keys.

```sql
id         TEXT PRIMARY KEY
key_hash   TEXT NOT NULL UNIQUE
key_plain  TEXT NOT NULL
org        TEXT NOT NULL
label      TEXT NOT NULL
revoked    BOOLEAN NOT NULL DEFAULT false
expires_at TIMESTAMPTZ
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
created_by TEXT
```

Indexed on `org` and `revoked`. `key_plain` is added by migration
(`ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS key_plain TEXT`) for tables predating it.

### `exchange_config`

Singleton row (`id = 1`) holding the Exchange connection. `auth` is encrypted at rest with
AES-256-GCM under `SESSION_ENC_KEY`.

```sql
id         INT PRIMARY KEY DEFAULT 1
base_url   TEXT NOT NULL
auth       TEXT NOT NULL
org_id     TEXT NOT NULL
version    TEXT
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
updated_by TEXT
```

`loadExchangeConfig()` returns `{ configured: false }` when the row is absent — the
first-run setup state.

### `audit_log`

Append-only request log. Indexed on `ts DESC`, `actor`, and `org`.

```sql
id         BIGSERIAL PRIMARY KEY
ts         TIMESTAMPTZ NOT NULL DEFAULT now()
actor_type TEXT NOT NULL
actor      TEXT NOT NULL
org        TEXT
method     TEXT NOT NULL
path       TEXT NOT NULL
status     INT
ip         TEXT
ms         INT
proxied_to TEXT
detail     JSONB
```

### `settings`

Key/value overrides, read at runtime ahead of the corresponding environment variables —
e.g. `session_ttl` and `session_abs_ttl` fall back to `SESSION_TTL` / `SESSION_ABS_TTL`.

```sql
key        TEXT PRIMARY KEY
value      TEXT NOT NULL
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
```

---

## Sessions are stored in PostgreSQL

There is no Redis dependency. Sessions (and the encrypted Exchange credentials they
carry) are persisted in the `sessions` table, so restarts and multi-replica deployments
keep users logged in. Only `SESSION_ENC_KEY` must be stable for the stored sessions to
remain decryptable. Losing or rotating `SESSION_ENC_KEY` simply forces re-login (the rows
become undecryptable and are discarded).

---

## Troubleshooting

### `[db] FATAL: DATABASE_URL is not set. PostgreSQL is required.`

Nothing loaded your `.env`. Either use `npm run dev:backend` (which passes
`--env-file-if-exists=.env`) or export the variable before invoking `node` directly.

### `[db] connect failed (n/10): password authentication failed for user "..."`

Credentials in `DATABASE_URL` don't match the server. Compare against the running
container's configured user/password before editing anything:

```bash
docker inspect <pg-container> --format '{{range .Config.Env}}{{println .}}{{end}}' | grep POSTGRES_
```

### `[db] connect failed (n/10): cannot drop constraint users_pkey on table users because other objects depend on it`

`DATABASE_URL` is pointing at the Exchange database. Repoint it at the BFF's own database —
see [The BFF must have its own database](#-the-bff-must-have-its-own-database) — then clean
up below. **Do not** add `CASCADE` to the migration.

### Cleaning up a misconfigured run

A BFF startup against the Exchange database leaves four empty tables behind. Confirm they
are empty, then drop them:

```sql
SELECT 'api_keys', count(*) FROM api_keys
UNION ALL SELECT 'audit_log', count(*) FROM audit_log
UNION ALL SELECT 'exchange_config', count(*) FROM exchange_config
UNION ALL SELECT 'settings', count(*) FROM settings;

DROP TABLE api_keys;
DROP TABLE audit_log;
DROP TABLE exchange_config;
DROP TABLE settings;
```

Take care not to drop the Exchange's own `apikeys` (no underscore). Then verify the
Exchange's primary key survived:

```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint WHERE conrelid = 'users'::regclass AND contype = 'p';
--  users_pkey | PRIMARY KEY ("user")
```

If the migration ever *succeeded* in dropping it, restore from backup — the Exchange's
foreign keys should have prevented this, but verify rather than assume.
