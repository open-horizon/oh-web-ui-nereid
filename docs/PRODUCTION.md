# Production Deployment Guide (NereidAI)

This guide covers hardening and offline deployment of NereidAI for production
and air-gapped environments.

## 1. Architecture

| Service | Image | Purpose | Port |
|---|---|---|---|
| `redis` | `redis:6.2.2-alpine` | Encrypted session store (TTL) | internal |
| `open-horizon-exchangeui-backend` | local build | BFF API proxy | `3001` (internal) |
| `open-horizon-exchangeui-frontend` | local build | Nginx + static assets + TLS | `8090` (HTTP→HTTPS), `8443` (HTTPS) |

The Nginx front end terminates TLS and reverse-proxies `/api` to the backend.

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
- **Redis** (provided automatically as the `redis` service in Compose; not
  required for local `npm run dev:backend` unless session persistence is needed).
- **Network access** to the Open Horizon Exchange API endpoint.

> Note: The Docker images are built `FROM node:20-alpine`, so the runtime
> environment is independent of the local Node version used for builds.

## 2. Required Environment (backend)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | BFF listen port |
| `REDIS_URL` | `redis://redis:6379` | Redis connection string |
| `SESSION_TTL` | `1800` | Session idle lifetime (seconds) |
| `SESSION_ENC_KEY` | _(auto-generated)_ | 32-byte master key as **64 hex chars** for AES-256-GCM |

Create a `.env` from `.env.example` and set at least `SESSION_ENC_KEY` in
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

- **Redis data**: the `redis-data` named volume is declared in
  `docker-compose.yaml`. Keep it to retain the session store across restarts.
- **Session key**: prefer `SESSION_ENC_KEY` (env/secret) over the auto-generated
  `.session.key` file so it survives volume changes.

## 7. Reverse Proxy (optional)

You may place the stack behind an existing TLS-terminating ingress. In that case
you can expose only `open-horizon-exchangeui-frontend:80` and let the ingress handle HTTPS; the
built-in Nginx TLS is sufficient for direct exposure.

## 8. Security Checklist

- [ ] `SESSION_ENC_KEY` set via secret (not auto-generated per host)
- [ ] Real TLS certificate mounted
- [ ] `.session.key`, `.env` never committed (git-ignored)
- [ ] Redis volume persistent
- [ ] Audit logs (`system.log` / `audit.log`) rotated/collected
- [ ] Firewall limits exposure to `8443` (and `8090` if HTTP redirect desired)
