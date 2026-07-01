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
**NereidAI** - BFF proxy for Open Horizon Exchange API with React 18 + TypeScript + Vite + Ant Design frontend, Express.js 5 backend.

## Completed Work
- Full-stack scaffolding: all API modules, pages (Services, Patterns, Agbots, Nodes, Policies, MgmtPolicies, Catalog, Dashboard, Login, HA Groups, Users, Organizations), AppLayout, i18n (zh/en)
- Backend `server/index.cjs`: all CRUD endpoints, session auth, RSA-PSS SHA-256 auto-signing, body whitelists (`serviceBody`, `patternBody`, `sanitizeBody`), cross-org via `?org=` + `x-agbot-auth`, root auth via `X-Root-Auth`
- Signing utils: `sign-utils.cjs` - RSA-PSS SHA-256 with PKCS#1 private / SPKI public keys
- Service form: 8 collapsible panels covering all deployment fields (command, cap_add, devices, entrypoint, secrets, sysctls, logDriver, environment, user, pid, ipc, maxMemoryMb, maxCpus, ephemeralPorts, tmpfs)
- Pattern form: Checkbox.Group service picker, `services` field (not `patternServices`), `upgradePolicy`, top-level `agreementProtocols`, no `public: true` for non-IBM orgs
- Agbot detail: loads patterns/policies via sub-endpoints (`/patterns`, `/businesspols`)
- URL encoding: ID org prefix stripped, passed as `?org=` to avoid Express 5 `%2F` route issues
- Agbot merge: IBM org agbots auto-merged into list for cross-org visibility
- Node policy: `lastUpdated` stripped on PUT; PATCH prepends org prefix to pattern
- OVMS service deployment bug fixed: `command` array now proper separate args

## Key Fixes in This Session
1. **Service auto-re-sign on edit**: Changed `server/index.cjs:348,379` from `if (body.deployment && (!body.deploymentSignature || body.deploymentSignature.startsWith('ui-sig-')))` to `if (body.deployment)` - now every PUT/POST with deployment re-generates RSA-PSS signature and uploads new public key
2. **OpenAPI spec**: Generated `docs/openapi.yaml` (English, 33 endpoints, 6 tags, full schemas)

## Current State
- Backend running on :3001, frontend on :8080/8081 (Vite proxy `/api` → :3001)
- Exchange at `http://192.168.123.175:3090` (v2.154.0)
- Test creds: `myorg/admin`, `root/root`, `IBM/agbot`
- Two anax processes on NUC (192.168.123.175): root's `myorg/node1` (port 8510, owns `/var/horizon/anax.db`), ubuntu's `myorg/NUC` (pattern `myorg/h-n`, cannot bind 8510, no docker group)
- **Blocker**: `/var/horizon/anax.db` owned by root (600) - ubuntu anax cannot persist agreement state; NUC receives proposals but fails to store them, never replies to agbot (timeout reason 201)

## Relevant Files
- `server/index.cjs` - all endpoints, auth, signing, whitelists
- `server/sign-utils.cjs` - RSA-PSS signing
- `src/pages/Services.tsx` - service CRUD, 8-panel deployment form, `buildDeployment()`
- `src/pages/Patterns.tsx` - pattern CRUD, Checkbox.Group service picker
- `src/pages/Agbots.tsx` - agbot CRUD, sub-endpoint pattern/policy loading
- `src/api/*.ts` - API clients with `agbotUrl()`, `stripOrg()`, etc.
- `docs/openapi.yaml` - OpenAPI 3.0 spec
- `/var/horizon/anax.db` - root's anax DB (600, blocks ubuntu anax)

## Next Steps
- Fix DB permissions: `chown ubuntu:ubuntu /var/horizon/anax.db` (or 660 + group)
- Or run ubuntu anax with separate DB path
- Then agbot proposals should be processed and containers deployed on NUC