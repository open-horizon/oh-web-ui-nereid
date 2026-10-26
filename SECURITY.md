# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in NereidAI, **please do not open a
public GitHub issue**. Instead, report it privately so we can triage and release
a fix before public disclosure.

- **Email**: jiekechoo@gmail.com
- **Encryption**: PGP is preferred; request the public key by email if needed.
- **Response time**: We aim to acknowledge reports within 72 hours.

Please include:
- A description of the vulnerability and its impact.
- Steps to reproduce (proof-of-concept is helpful).
- Affected version(s) and deployment context (e.g., reverse proxy, offline).

## Security Model (for Reviewers / Auditors)

NereidAI is a BFF (Backend-For-Frontend) proxy for the Open Horizon Exchange API.
Key security properties:

- **Credential confidentiality** — Exchange `Basic` credentials are encrypted with
  AES-256-GCM using a server-side master key before being written to PostgreSQL.
  PostgreSQL never stores plaintext credentials. The master key file (`.session.key`)
  is created with `0600` permissions and must not be committed.
- **Browser attack surface** — The session identifier is an opaque random token in
  an `HttpOnly; Secure; SameSite=Lax` cookie. It is unreadable by JavaScript
  (XSS-resistant) and every mutation is gated by a CSRF double-submit token.
- **Transport security** — All browser traffic is served over HTTPS (TLS 1.2/1.3).
  HTTP is redirected to HTTPS. HSTS is enabled.
- **Session lifetime** — Idle (`SESSION_TTL`) and absolute (`SESSION_ABS_TTL`)
  timeouts, enforced by an in-memory sweeper and expired-row cleanup in PostgreSQL.
  Logout immediately invalidates the session and clears the cookie.
- **SSO** — Optional OpenID Connect (authorization code + PKCE). Logins are
  fail-closed on missing/ambiguous group claims, unknown orgs, unverified email, or
  disabled accounts. Federated identities are keyed by `(issuer, subject)` and are
  never merged by username/email. The BFF stores no IdP refresh/access tokens; an ID
  token is retained only inside the encrypted session to support RP-initiated logout.
- **Input safety** — Request bodies are filtered through strict field whitelists
  (`serviceBody`, `patternBody`, `sanitizeBody`) to prevent payload pollution.
- **Auditability** — Every API call, Exchange call, and auth event
  (login / logout / node_register) is recorded in `system.log` / `audit.log`.

## Hardening Checklist (Production)

- Set `SESSION_ENC_KEY` (64 hex chars) via environment/secret so the master key
  persists across restarts and is not auto-generated per host.
- Mount a CA-signed TLS certificate at `/etc/nginx/ssl/fullchain.pem` and
  `/etc/nginx/ssl/privkey.pem` instead of the bundled self-signed certificate.
- Keep the `postgres-data` volume persistent.
- Set `OIDC_LOCAL_LOGIN_ENABLED=false` when using SSO, keeping `/login?local=1`
  only as the bootstrap break-glass entry.
- Never commit `.session.key`, `.env`, or any credentials.
