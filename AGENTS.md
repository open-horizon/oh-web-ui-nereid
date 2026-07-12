# Agent Instructions (Compaction Prompt)

## Tone and Style
- Be concise, direct, and to the point
- Answer with fewer than 4 lines of text unless user asks for detail
- No unnecessary preamble or postamble
- No emojis unless explicitly requested
- One word answers are best when appropriate
- Answer the user's question directly without elaboration

## Proactiveness
- Only be proactive when the user asks you to do something
- Balance: doing the right thing when asked vs not surprising the user
- Don't add code explanation summary unless requested
- After working on a file, just stop

## Following Conventions
- Understand file's code conventions before making changes
- Mimic code style, use existing libraries/utilities, follow existing patterns
- NEVER assume a library is available - check the codebase first
- Look at neighboring files, package.json, cargo.toml, etc.
- When creating new components, look at existing ones first
- Follow security best practices - never expose/log secrets

## Comments Policy
- For complex code, add inline comments to explain logic
- Add docstrings/comments for function implementations
- Comments should be concise and helpful for other developers
- Add comments to explain "why" not "what" (code is self-explanatory)
- Add translation comments for i18n keys
- Add TODO comments for refactoring needs

## Doing Tasks
1. Use search tools extensively to understand codebase and query
2. Implement solution using all available tools
3. Verify with tests if possible - check README or search for test approach
4. **MUST run lint and typecheck commands** (npm run lint, npm run typecheck, ruff, etc.) after completing task
5. NEVER commit changes unless explicitly asked

## Tool Usage Policy
- File search: Use Glob (not find/ls)
- Content search: Use Grep (not grep/rg)
- Read files: Use Read (not cat/head/tail)
- Edit files: Use Edit (not sed/awk)
- Write files: Use Write (not echo/cat)
- Communication: Output text directly (not echo/printf)
- Batch independent tool calls in single message
- Use '&&' for sequential dependent commands

## Code References
Reference specific functions/code with `file_path:line_number` pattern

## Skill Usage
- Load specialized skills when task matches description
- Use `skill` tool to inject instructions

## Task Delegation
- Use `task` tool for complex, multi-step tasks
- Specify subagent_type: "explore" (codebase search) or "general" (research/execution)
- Launch multiple agents concurrently when possible

---

# Session Summary (Compacted)

## Project
**NereidAI** — BFF proxy for Open Horizon Exchange API with React 18 + TypeScript + Vite + Ant Design frontend, Express.js 5 backend.

## Objective (current session: auth redesign)
- Revamped auth system: local BFF user accounts (platform/partner roles), persisted system-level Exchange config, PostgreSQL storage (mandatory), org-scoped Partner API with API keys (read-only), CSRF-hardened console sessions, append-only audit log.

## Exchange
- URL: `http://192.168.123.133:3090` (v2.154.0)
- Hub admin: `root/hubadmin:L0khyyssUKkao4EEImScY64AAnhrfD`
- System admin (IBM org): `IBM/admin:lTfYrT4zwMx6jmnMdTLHBAOAE9w9Y3`
- Org admin (myorg): `myorg/admin:WmgHbLbxWjxQifijLxMpIUNhZaPjgf`
- Agbot (IBM org): `IBM/agbot:nIg9lnurlFwDcchIAf5AeOf9BQ5Y3`
- Root: `root/KAAqPww59j57tGiqcrNtK6jNrIlLkL`
- **Platform init (`/api/setup`) uses a hub-level account — use `root/root` or `root/hubadmin`** so the BFF holds cross-org Exchange authority (required for agbot binding, since agbots live in the IBM org). `myorg/admin` is a partner-level org admin and cannot operate on IBM agbots. Partner orgs/accounts are created by the platform afterward.

## Auth Model (Implemented)
- **BFF roles**: `platform` (cross-org, manage everything) and `partner` (bound to one org, full read/write within org, self-service API keys, cannot manage BFF users/Exchange config).
- **Exchange config**: persisted in `exchange_config` table (single row), set once via first-time setup; propagated to all live sessions.
- **Console session**: `nereid_sid` HttpOnly cookie + CSRF double-submit (`nereid_csrf` cookie + `X-Csrf-Token` header), idle TTL (24h), absolute TTL (8h), secure-only over HTTPS (auto-detected via `req.secure`/`X-Forwarded-Proto`).
- **Partner API**: `GET /api/v1/{org}/...` with `X-Api-Key` header. Org forced from key binding, allowlist enforced (`/services`, `/patterns`, `/business/policies`, `/managementpolicies`, `/nodes`, `/users`, `/hagroups`, `/AgentFileVersion` and sub-paths). Read-only enforced (all mutations return 403).
- **API keys**: format `nk_{live|test}_<base64url>`, DB stores `sha256(plain)`, revocable, optional expiry.
- **Audit log**: append-only `audit_log` table. Logs every `/api` call (actor, org, method, path, status, IP, ms, `proxiedTo` Exchange endpoint, detail JSON). Platform sees all; partner sees own org only.

## Key Changes (server/index.cjs ~1919 lines up from ~1500)
- Added `db.cjs`: PG pool, schema init (5 tables: users, api_keys, exchange_config, audit_log, settings), CRUD helpers.
- Removed file-based user/exchange stores → all PG-backed.
- Added `AsyncLocalStorage` req-store for audit proxy tagging.
- Added CSRF helpers (`csrfToken()`, `requireCsrf`), `sessionCreated` map for absolute timeout.
- Updated global guard: also allows `X-Api-Key` requests through to `partnerAuth`.
- Updated logging middleware: writes every `/api` call to `audit_log` (actor, org, method, path, status, ip, ms, `proxiedTo`, detail JSON).
- Replaced all auth routes (setup, login, me, logout, users, exchange-config) to use new role/CSRF model.
- Added partner API key middleware + generic proxy forwarder at `/api/v1/:org` (read-only).
- Added `settings` table + `GET/PUT /api/settings` for session/audit runtime parameters (platform only).
- Added `loadSettingsFromDB()` to override `SESSION_TTL`/`SESSION_ABS_TTL` on startup.
- `/api/audit` now reads the `audit_log` table with role gating (platform: all; partner: own org only) + search + org filter; replaced old file-based log endpoint.
- Agbot routes confined to platform: partner cannot target other orgs (IBM merge only for platform).
- Redis made truly optional: only connects when `REDIS_URL` is set; silent fallback to in-memory store (no ECONNREFUSED spam).
- Added hourly audit-retention purge job based on `audit_retention_days` (0 = keep forever).
- Changed `app.listen` bootstrap: `(async () => { await db.initSchema(); await loadExchangeConfigFromDB(); await loadSettingsFromDB(); ... })()`.

## Tested (via curl, PG-backed dev container)
- Setup with `root/root` → login (CSRF issued) → me (csrfToken returned) → exchange-config: all ok
- Platform user CRUD: create partner user (org=myorg), list users: all ok
- API key create → services via partner key: 200, returns real Exchange data
- Partner cross-org: 403, blocked path: 404, mutation: 403
- Audit log: entries recorded with correct actor/org/status/proxiedTo; `/api/audit` table-backed with role gating (platform sees all, partner sees own org only)
- Console session: cookie+CSRF validated, exchange-config requires auth, mutations require X-Csrf-Token
- Settings GET/PUT (platform ok, partner 403), persisted across restarts
- Agbots: platform lists/binds/unbinds IBM agbot cross-org (myorg pattern → IBM/agbot); partner sees no IBM agbots (RBAC enforced)

## Relevant Files
- `server/index.cjs` — all endpoints, auth, signing, whitelists (~1919 lines)
- `server/db.cjs` — PG pool, schema (users/api_keys/exchange_config/audit_log/settings), CRUD
- `docker-compose.yaml` — postgres:16-alpine service, DATABASE_URL env
- `server/sign-utils.cjs` — RSA-PSS signing (legacy, still used for service deployment signing)
- `docs/DESIGN-auth-multitenancy.md` — full design decisions (zh)
- `docs/openapi-console.yaml` — Console API spec (session + CSRF auth)
- `docs/openapi-partner.yaml` — Partner API spec (X-Api-Key auth, read-only)
- `src/api/config.ts` — in-memory session state (username, role, orgId, csrfToken, setOrgId)
- `src/api/client.ts` — fetch wrapper; sends `X-Csrf-Token` on mutations
- `src/components/AppLayout.tsx` — role-based sidebar (platform/partner), org switcher (platform), Settings nav
- `src/pages/Login.tsx` — setup vs login auto-detect + CSRF storage, auto-login after setup
- `src/pages/Settings.tsx` — left-tab page: 连接配置 + 会话审计
- `src/pages/AuditLog.tsx` — table + detail drawer, role-gated (platform all / partner own org)
- `src/pages/Agbots.tsx` — pattern/business-policy binding (platform-only; cross-org IBM agbot)
- `src/pages/ApiKeys.tsx` — API key management: platform sees all orgs (`/api/apikeys`); partner self-service for own org (`/api/my-apikeys`). New key plaintext shown once via modal; revoke (partner) / delete (platform).
- `src/help/index.ts` — `apikeys` help entry

## Next Steps
1. Frontend: Login (setup/login + CSRF) ✓, Settings (connection + session/audit tabs) ✓, role-gating via menu ✓, audit detail drawer ✓, org switcher for platform ✓, CSRF header on all mutations ✓
2. Redis made truly optional ✓
3. Partner read-only agbot view ✓ — partner menu shows Agbots; backend serves IBM agbots read-only, filters pattern/businesspol/agreement bindings to partner's own org, blocks all agbot mutations (403); FE hides bind/unbind/delete for partner.
4. Auto-create partner org ✓ — `POST /api/users` for role=partner ensures the Exchange org exists (creates via `POST /orgs/{org}` using hub creds if missing); returns `orgCreated`. Also fixed `PUT /api/organizations/:orgid` to upsert (POST-create fallback), fixing the Organizations create page.

## Agbot Binding Design (finalized)
- Agbots live in the hub org (IBM). Platform (init'd with `root/root`) binds cross-org: `myorg/pattern` or `myorg/business-policy` → `IBM/agbot`.
- Pattern binding + business-policy binding are symmetric in the FE Agbots page (picker with org selector, detail drawer tabs, remove). mgmt policies are node-level, not agbot-bound.
- Partner: read-only agbot visibility scoped to own-org bindings; cannot bind/unbind (RBAC enforced FE + BE).
- Verified end-to-end via curl: auto-create org, partner read-only + own-org filtering (myorg visible, IBM hidden), partner mutation 403, platform cross-org bind 201, vite dev proxy (8080→3001).