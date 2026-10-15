# Production Deployment Guide (NereidAI)

This guide covers hardening and offline deployment of NereidAI for production
and air-gapped environments.

## 1. Architecture

| Service | Image | Purpose | Port |
|---|---|---|---|
| `postgres` | `postgres:16-alpine` | BFF users/API keys/Exchange config/audit/sessions storage | internal (5432) |
| `open-horizon-exchangeui-backend` | local build | BFF API proxy | `3001` (internal) |
| `open-horizon-exchangeui-frontend` | local build | Nginx + static assets + TLS | `8090` (HTTP→HTTPS), `8443` (HTTPS) |

The Nginx front end terminates TLS and reverse-proxies `/api` to the backend. PostgreSQL
is required and also stores sessions, so logins survive backend restarts.

## 1.1 Prerequisites (local build / development)

- **Node.js >= 20** (the project uses TypeScript 7 and Vite 5, which require
  Node 20+). Older Node (e.g. 18) will emit `EBADENGINE` warnings and may fail
  to install or build.
  - Recommended: install via [nvm](https://github.com/nvm-sh/nvm):
    ```bash
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    nvm install 20
    nvm alias default 20
    ```
- **Docker >= 20.10** and **Docker Compose v2** (for container deployment).
- **PostgreSQL** (included as the `postgres` service in Compose; a running PG instance
  is required even for local `npm run dev:backend`). It stores both the BFF data and
  the sessions.
- **Network access** to the Open Horizon Exchange API endpoint.
- **Optional**: an OpenID Connect provider (Keycloak, etc.) if SSO is desired.

> Note: The Docker images are built `FROM node:20-alpine`, so the runtime
> environment is independent of the local Node version used for builds.

## 2. Required Environment (backend)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | BFF listen port |
| `DATABASE_URL` | — | **Required.** PostgreSQL connection string for the BFF's **own** database (e.g. `postgres://nereid:nereidpass@postgres:5432/nereid`). Never point this at the Exchange's database — see [DATABASE.md](DATABASE.md) |
| `SESSION_TTL` | `86400` | Session idle lifetime (seconds, default 24h) |
| `SESSION_ABS_TTL` | `28800` | Session absolute timeout (seconds, default 8h) |
| `SESSION_ENC_KEY` | _(auto-generated)_ | 32-byte master key as **64 hex chars** for AES-256-GCM. Set it in production. |
| `OIDC_ISSUER` | _(unset)_ | OIDC issuer URL; unset disables SSO |
| `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | — | OIDC client credentials |
| `OIDC_REDIRECT_URI` | — | Public callback URL (`https://host/api/oidc/callback`) |
| `OIDC_PLATFORM_GROUP` | `nereidhorizon-platform` | Group granting the platform role |
| `OIDC_PARTNER_GROUP_PREFIX` | `nereidhorizon-partner-` | Group prefix mapping to an Exchange org |
| `OIDC_LOCAL_LOGIN_ENABLED` | `true` | Set `false` to disable local password login |

Create a `.env` from `.env.example` and set at least `DATABASE_URL` and `SESSION_ENC_KEY` in
production.

## 3. Generate the Session Master Key

```bash
# 32 random bytes -> 64 hex chars
SESSION_ENC_KEY=$(openssl rand -hex 32)
echo "SESSION_ENC_KEY=${SESSION_ENC_KEY}" >> .env
```

Persist this value in your secret manager. If unset, the server generates
`.session.key` (mode `0600`), but the key will rotate on container recreation
unless `SESSION_ENC_KEY` is provided.

## 4. TLS Certificate

The container auto-generates a self-signed certificate at first start.
For production, mount a CA-signed certificate instead:

```bash
mkdir -p /opt/nereid/ssl
cp fullchain.pem /opt/nereid/ssl/fullchain.pem
cp privkey.pem   /opt/nereid/ssl/privkey.pem
```

Then add a bind mount to `open-horizon-exchangeui-frontend` in `docker-compose.yaml`:

```yaml
  frontend:
    volumes:
      - /opt/nereid/ssl:/etc/nginx/ssl:ro
```

The entrypoint skips generation when the cert already exists.

## 5. Offline / Air-Gapped Deployment

The images contain all dependencies (offline `Dockerfile` copies local
`node_modules`); no `npm install` or image pull occurs at runtime.

On a connected machine:

```bash
./scripts/export-images.sh latest nereid-images.tar
```

Transfer `nereid-images.tar` to the production host, then:

```bash
./scripts/load-images.sh nereid-images.tar
docker compose up -d
```

### Alternative: pull from GHCR

Images are also published to GitHub Container Registry on each release:

```bash
docker pull ghcr.io/nereidai/open-horizon-exchangeui-backend:latest
docker pull ghcr.io/nereidai/open-horizon-exchangeui-frontend:latest
```

To use them, either retag to the Compose service image names
(`open-horizon-exchangeui-backend`, `open-horizon-exchangeui-frontend`) or
override the image in `docker-compose.yaml`.

## 6. Persistence

- **PostgreSQL data**: the `postgres-data` named volume is declared in
  `docker-compose.yaml`. Keep it to retain BFF users, sessions, API keys,
  Exchange config, and audit log.
- **Session master key**: set `SESSION_ENC_KEY` (64 hex chars) via a secret so the key
  is stable across restarts and container recreation.

## 6.1 Single sign-on (OIDC)

Set the `OIDC_*` variables to enable SSO. On the IdP:

- Create a confidential client with the authorization-code flow and PKCE, using
  `https://<host>/api/oidc/callback` as the redirect URI.
- Create a `nereidhorizon-platform` group for platform admins.
- Create one `nereidhorizon-partner-<org>` group per Exchange org, where `<org>`
  must exist in the Exchange (org regex `^[a-z0-9][a-z0-9-]*$`).

OIDC logins are fail-closed: unmapped/ambiguous groups, unknown orgs, unverified
email, or disabled accounts are rejected. Set `OIDC_LOCAL_LOGIN_ENABLED=false` to
force SSO for regular users; the bootstrap admin keeps `/login?local=1` as a
break-glass entry.

`OIDC_ROLE_CLAIM` accepts a dotted path, so nested claims work too. With Keycloak
that has no dedicated groups mapper, use the built-in realm-roles claim
`realm_access.roles` and name the realm roles `nereidhorizon-platform` /
`nereidhorizon-partner-<org>`.

If the issuer is served with a certificate from an internal CA, keep TLS
verification on and make the backend trust that CA: set `NODE_EXTRA_CA_CERTS` to a
PEM file (native/compose installs), or set `oidc.caBundleSecret` in the chart to a
Secret in the release namespace whose `ca.crt` key holds the CA
(`kubectl -n cert-manager get secret nereid-internal-ca-tls -o yaml | sed
's/namespace: cert-manager/namespace: <release-ns>/' | kubectl apply -f -`).
`OIDC_INSECURE_SKIP_VERIFY=true` disables verification and is for local
development only.

## 7. Reverse Proxy (optional)

You may place the stack behind an existing TLS-terminating ingress. In that case
you can expose only `open-horizon-exchangeui-frontend:80` and let the ingress handle HTTPS; the
built-in Nginx TLS is sufficient for direct exposure.

## 8. Security Checklist

- [ ] `DATABASE_URL` set via secret (connection string with strong password)
- [ ] `SESSION_ENC_KEY` set via secret (not auto-generated per host)
- [ ] Real TLS certificate mounted
- [ ] `.session.key`, `.env` never committed (git-ignored)
- [ ] PostgreSQL volume persistent
- [ ] `OIDC_LOCAL_LOGIN_ENABLED=false` when using SSO (break-glass via `/login?local=1`)
- [ ] Audit logs (`audit_log` table) retention configured via `/api/settings` or `audit_retention_days` env
- [ ] Firewall limits exposure to `8443` (and `8090` if HTTP redirect desired)
