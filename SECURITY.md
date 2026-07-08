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
  AES-256-GCM using a server-side master key before being written to Redis. Redis
  never stores plaintext credentials. The master key file (`.session.key`) is
  created with `0600` permissions and must not be committed.
- **Browser attack surface** — The session identifier is an opaque random token in
  an `HttpOnly; Secure; SameSite=Strict` cookie. It is unreadable by JavaScript
  (XSS-resistant) and not attached to cross-site requests (CSRF-resistant).
- **Transport security** — All browser traffic is served over HTTPS (TLS 1.2/1.3).
  HTTP is redirected to HTTPS. HSTS is enabled.
- **Session lifetime** — 30-minute idle timeout enforced by Redis TTL plus an
  in-memory sweeper. Logout immediately invalidates the session and clears the cookie.
- **Input safety** — Request bodies are filtered through strict field whitelists
  (`serviceBody`, `patternBody`, `sanitizeBody`) to prevent payload pollution.
- **Auditability** — Every API call, Exchange call, and auth event
  (login / logout / node_register) is recorded in `system.log` / `audit.log`.

## Hardening Checklist (Production)

- Set `SESSION_ENC_KEY` (64 hex chars) via environment/secret so the master key
  persists across restarts and is not auto-generated per host.
- Mount a CA-signed TLS certificate at `/etc/nginx/ssl/fullchain.pem` and
  `/etc/nginx/ssl/privkey.pem` instead of the bundled self-signed certificate.
- Keep the `redis-data` volume persistent.
- Never commit `.session.key`, `.env`, or any credentials.
