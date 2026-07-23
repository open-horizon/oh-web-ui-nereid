// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

// Server implementation with inline comments explaining key logic
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { generateKeyPair, signDeployment, genAndSign } = require('./sign-utils.cjs');

// ==============================================
// System Logging — append-only JSON-lines log file
// Captures: incoming API requests, outgoing Exchange calls, node events
// ==============================================
const LOG_DIR = path.join(__dirname, '..');
const SYS_LOG = path.join(LOG_DIR, 'system.log');
const AUDIT_LOG = path.join(LOG_DIR, 'audit.log');

// type: 'api' (incoming request) | 'exchange' (outgoing to Exchange) | 'event' (node/system)
function writeLog(type, data) {
  const entry = { t: new Date().toISOString(), type, ...data };
  try {
    if (type === 'api' && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(data.m)) {
      fs.appendFileSync(AUDIT_LOG, JSON.stringify(entry) + '\n');
    }
    fs.appendFileSync(SYS_LOG, JSON.stringify(entry) + '\n');
  } catch (_) {}
}

// Map an API path to a human-readable operation name (what the user actually did)
function opName(method, p) {
  const segs = p.split('/').filter(Boolean); // ['api','services','myorg/x']
  const resource = segs[1] || '';
  const actionMap = {
    POST: 'create', PUT: 'update', PATCH: 'patch', DELETE: 'delete', GET: 'read',
  };
  const action = actionMap[method] || method;
  const resourceMap = {
    services: '服务', patterns: '模式', 'business/policies': '部署策略',
    managementpolicies: '管理策略', nodes: '节点', agbots: '协议机器人',
    users: '用户', orgs: '组织', hagroups: 'HA组',
    'agentfileversion': 'Agent版本',
  };
  let resName = resourceMap[resource] || resource;
  // Handle sub-resources (keys, dockauths, patterns, businesspols on agbots)
  if (resource === 'agbots') {
    if (segs.includes('patterns')) resName = 'Agbot关联模式';
    else if (segs.includes('businesspols')) resName = 'Agbot关联策略';
    else if (segs.includes('agreements')) resName = 'Agbot协议';
  }
  if (resource === 'services') {
    if (segs.includes('keys')) resName = '服务密钥';
    else if (segs.includes('dockauths')) resName = '服务Docker认证';
  }
  if (resource === 'users' && segs.includes('changepw')) resName = '用户密码';
  if (resource === 'hagroups' && segs.includes('nodes')) resName = 'HA组成员';
  // Extract target id from path (last segment for delete/update)
  let target = '';
  if (['PUT', 'PATCH', 'DELETE'].includes(method) && segs.length >= 3) {
    target = decodeURIComponent(segs[segs.length - 1]);
  } else if (resource === 'services' && segs[2]) {
    target = decodeURIComponent(segs[2]);
  }
  const opZh = { create: '创建', update: '修改', patch: '局部修改', delete: '删除', read: '查询' }[action] || action;
  return target ? `${opZh}${resName}: ${target}` : `${opZh}${resName}`;
}

// Log an incoming API request with timing and payload summary
function logApi(req, statusCode, ms, user, org) {
  const op = opName(req.method, req.path);
  // Capture request body (sanitized: strip passwords/tokens) for audit trail
  let body = null;
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
    const clone = JSON.parse(JSON.stringify(req.body));
    // Redact sensitive fields
    for (const k of ['password', 'newPassword', 'token', 'apikey', 'apiKey', 'imageRegistryToken', 'key', 'auth']) {
      if (clone[k]) clone[k] = '***';
    }
    if (clone.user?.password) clone.user.password = '***';
    body = clone;
  }
  writeLog('api', {
    m: req.method,
    p: req.path,
    s: statusCode,
    ms,
    u: user || '-',
    o: org || '-',
    op,
    body,
  });
}

// Log an outgoing Exchange call with timing
function logExchange(method, url, statusCode, ms, org) {
  writeLog('exchange', {
    m: method,
    url,
    s: statusCode,
    ms,
    o: org || '-',
  });
}

// Log a node/system event
function logEvent(name, detail, org) {
  writeLog('event', { name, detail, o: org || '-' });
}

const app = express();
app.set('trust proxy', true); // honor X-Forwarded-* so req.secure works behind nginx/proxy
app.use(express.json());

// Build the session Set-Cookie header. The Secure flag is only added when the
// request reached us over HTTPS — over plain HTTP (e.g. Vite dev proxy) browsers
// reject Secure cookies, which would silently break login in dev.
function sessionCookie(id, req) {
  const secure = req && (req.secure || req.headers['x-forwarded-proto'] === 'https');
  const flags = `HttpOnly; ${secure ? 'Secure; ' : ''}SameSite=Lax; Path=/; Max-Age=${SESSION_TTL}`;
  return id
    ? `nereid_sid=${id}; ${flags}`
    : `nereid_sid=; ${flags.replace(`Max-Age=${SESSION_TTL}`, 'Max-Age=0')}`;
}

// ==============================================
// Local User Store (BFF accounts) + Exchange config + Partner keys
// All persisted in PostgreSQL (see server/db.cjs).
// ==============================================
const db = require('./db.cjs');
const { AsyncLocalStorage } = require('async_hooks');

// request-scoped store: lets exch() tag the actual proxied Exchange endpoint
// for the audit log without threading `req` through every call site.
const reqStore = new AsyncLocalStorage();

const ROLES = ['platform', 'partner'];

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return { hash, salt };
}
function verifyPassword(pw, hash, salt) {
  const h = crypto.scryptSync(pw, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(hash, 'hex'));
}

// System-level Exchange connection (singleton). Loaded from PG at startup into
// this in-memory cache; sessions copy from it so a change propagates immediately.
let exchangeConfig = { configured: false };
async function loadExchangeConfigFromDB() {
  exchangeConfig = await db.loadExchangeConfig();
}
async function saveExchangeConfig(cfg, updatedBy) {
  await db.saveExchangeConfig(cfg, updatedBy);
  exchangeConfig = cfg;
  propagateExchangeConfig();
}
// Push a config change to every live session so it takes effect immediately.
function propagateExchangeConfig() {
  for (const id of Object.keys(sessions)) {
    const s = sessions[id];
    if (!s) continue;
    s.baseURL = exchangeConfig.baseURL;
    s.auth = exchangeConfig.auth;
    s.orgId = exchangeConfig.orgId;
  }
}

// ---- Runtime settings loader ----
async function loadSettingsFromDB() {
  const map = await db.loadSettings();
  if (map.session_ttl) SESSION_TTL = parseInt(map.session_ttl, 10);
  if (map.session_abs_ttl) SESSION_ABS_TTL = parseInt(map.session_abs_ttl, 10);
}
// ---- Session hardening ----
let SESSION_ABS_TTL = parseInt(process.env.SESSION_ABS_TTL || '28800', 10); // 8h absolute
const sessionCreated = new Map(); // id -> createdAt (for absolute timeout)
// CSRF: double-submit. Login issues a token (returned to client + Set-Cookie).
function csrfToken() { return crypto.randomBytes(24).toString('hex'); }

// Auth middleware for logged-in BFF users. Enforces absolute session timeout.
function requireAuth(req, res, next) {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const id = sessionIdFromReq(req);
  const born = sessionCreated.get(id) || 0;
  if (born && Date.now() - born > SESSION_ABS_TTL * 1000) {
    delete sessions[id]; sessionBorn.delete(id); sessionCreated.delete(id); dropSession(id);
    return res.status(401).json({ msg: 'Session expired, please log in again' });
  }
  req.sessionUser = s;
  next();
}
// Role-gated. platform = full; partner = org-scoped read-only (+ own key mgmt).
function requireRole(...roles) {
  return (req, res, next) => {
    const s = session(req);
    if (!s) return res.status(401).json({ msg: 'Not logged in' });
    if (!roles.includes(s.role)) return res.status(403).json({ msg: 'Permission denied' });
    req.sessionUser = s;
    next();
  };
}
// CSRF validation for mutating console requests (cookie-backed double submit).
function requireCsrf(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)nereid_csrf=([a-f0-9]+)/);
  const headerTok = req.headers['x-csrf-token'];
  if (!m || !headerTok || m[1] !== headerTok) {
    return res.status(403).json({ msg: 'CSRF validation failed' });
  }
  next();
}

// Decode the username portion from a session's base64 auth (user:password)
function sessionUser(s) {
  if (!s || !s.auth) return '?';
  try {
    const decoded = Buffer.from(s.auth, 'base64').toString('utf8');
    return decoded.split(':')[0] || '?';
  } catch {
    return '?';
  }
}

// Express middleware: time and log every incoming /api request, and write an
// append-only audit record (console users + partner API keys), including the
// actual Exchange endpoint that was proxied.
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  const start = Date.now();
  const origEnd = res.end.bind(res);
    res.end = function (...args) {
      const ms = Date.now() - start;
      const s = session(req);
      const partner = req.partner;
      const userLabel = s ? sessionUser(s) : (partner ? `apikey:${partner.label}` : '-');
      // system log
      logApi(req, res.statusCode, ms, userLabel, (s?.orgId) || (partner?.org) || '-');
      // audit log (best-effort, fire-and-forget)
      const store = reqStore.getStore();
      const actorType = s ? 'user' : (partner ? 'apikey' : 'system');
      const actor = s ? s.username : (partner ? partner.label : '-');
      const org = s?.orgId || (partner?.org) || null;
      db.insertAudit({
        actorType,
        actor,
        org,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.socket?.remoteAddress || '',
        ms,
        proxiedTo: store?._proxiedTo || null,
        detail: { query: req.query, params: req.params },
      }).catch(() => {});
      return origEnd(...args);
    };
  reqStore.run(req, () => next());
});

// Public health endpoint (no auth) used by the container healthcheck
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Global guard: everything under /api/ requires a BFF session except the
// public bootstrap endpoints (health, setup status, first-time setup, login).
// Partner users are org-scoped: they can read/write within their bound org
// but cannot access BFF management routes (users, exchange-config, apikeys).
const PUBLIC_PATHS = new Set(['/api/health', '/api/setup-status', '/api/setup', '/api/login']);
const PARTNER_BLOCKED = ['/api/bff-users', '/api/exchange-config', '/api/apikeys', '/api/settings', '/api/catalog-services', '/api/catalog-patterns'];
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  if (PUBLIC_PATHS.has(req.path)) return next();
  // Requests bearing an X-Api-Key header are authenticated by the
  // partnerAuth middleware mounted at /api/v1/:org, not by session cookie.
  if (req.headers['x-api-key'] && req.path.startsWith('/api/v1/')) return next();
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  if (s.role === 'partner') {
    if (PARTNER_BLOCKED.some((p) => req.path === p || req.path.startsWith(p + '/'))) {
      return res.status(403).json({ msg: 'Access denied' });
    }
    // Agbots are org-level resources; partner manages their own org's agbots.
    if (req.path.startsWith('/api/agbots')) {
      req.query.org = s.orgId; // force org to partner's own org
    } else {
      req.query.org = s.orgId; // force org for all requests (ignore any override)
    }
  }
  next();
});
// CSRF double-submit validation on authenticated mutating requests (skips public paths + API-key-authenticated requests).
app.use((req, res, next) => {
  if (PUBLIC_PATHS.has(req.path)) return next();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  if (req.headers['x-api-key'] && req.path.startsWith('/api/v1/')) return next();
  requireCsrf(req, res, next);
});

// BFF server start time, used to report uptime on the dashboard
const SERVER_START = Date.now();

// ==============================================
// Secure Session Store (in-memory working set + Redis encrypted persistence)
// ==============================================
// Security model (for audit):
//  - Exchange credentials are NEVER returned to the browser and NEVER stored in
//    plaintext. They are encrypted with AES-256-GCM using a server-side master
//    key (SESSION_ENC_KEY) and persisted in Redis with a short idle TTL.
//  - The browser only holds an opaque session id in an HttpOnly + Secure +
//    SameSite=Strict cookie, so it is inaccessible to JavaScript (XSS-safe) and
//    not sent cross-site (CSRF-safe).
//  - `sessions` is the decrypted in-memory working set (synchronous lookup for
//    the request handlers); Redis is the durable, encrypted backing store that
//    enforces the idle TTL. A background sweeper evicts expired in-memory
//    entries so idle sessions are terminated even within a single instance.
let SESSION_TTL = parseInt(process.env.SESSION_TTL || '86400', 10); // 24h idle
const SESSION_PREFIX = 'nereid:session:';

// --- Master key for AES-256-GCM (32 bytes). Persist a generated key to a file
//     so restarts don't invalidate existing sessions; override via SESSION_ENC_KEY. ---
const KEY_FILE = path.join(LOG_DIR, '.session.key');
let MASTER_KEY;
try {
  if (process.env.SESSION_ENC_KEY) {
    MASTER_KEY = Buffer.from(process.env.SESSION_ENC_KEY, 'hex');
    if (MASTER_KEY.length !== 32) throw new Error('SESSION_ENC_KEY must be 32 bytes (64 hex chars)');
  } else if (fs.existsSync(KEY_FILE)) {
    MASTER_KEY = fs.readFileSync(KEY_FILE);
  } else {
    MASTER_KEY = crypto.randomBytes(32);
    fs.writeFileSync(KEY_FILE, MASTER_KEY, { mode: 0o600 });
  }
} catch (e) {
  console.error('Session key init failed:', e.message);
  process.exit(1);
}

function encryptJSON(obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', MASTER_KEY, iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + tag.toString('hex') + ':' + enc.toString('hex');
}

function decryptJSON(blob) {
  const [ivHex, tagHex, encHex] = blob.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', MASTER_KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const dec = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]);
  return JSON.parse(dec.toString('utf8'));
}

// --- Redis client (optional; in-memory fallback when REDIS_URL is unset) ---
let redis = null;
let redisReady = false;
let redisWarned = false;
if (process.env.REDIS_URL) {
  try {
    const Redis = require('ioredis');
    redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2, enableOfflineQueue: false });
    redis.on('ready', () => { redisReady = true; console.log('[redis] session store connected'); });
    redis.on('error', () => {
      if (!redisWarned) { console.warn('[redis] unavailable, using in-memory session store'); redisWarned = true; }
      redisReady = false;
    });
  } catch (e) {
    console.warn('[redis] client init failed, using in-memory session store');
  }
} else {
  console.log('[redis] REDIS_URL not set — using in-memory session store (sessions lost on restart)');
}

// Encrypted durable persistence (fire-and-forget; never blocks request path)
function persistSession(id, data) {
  if (!redisReady || !redis) return;
  redis.set(SESSION_PREFIX + id, encryptJSON(data), 'EX', SESSION_TTL).catch(() => {});
}
function touchSession(id) {
  if (!redisReady || !redis) return;
  redis.expire(SESSION_PREFIX + id, SESSION_TTL).catch(() => {});
}
function dropSession(id) {
  if (redisReady && redis) redis.del(SESSION_PREFIX + id).catch(() => {});
}

// Decrypted in-memory working set (synchronous access for handlers)
const sessions = {};

// Background sweeper: enforce idle TTL by removing in-memory entries whose
// Redis key has expired (or, without Redis, entries older than SESSION_TTL).
const sessionBorn = new Map();
setInterval(() => {
  const now = Date.now();
  for (const id of Object.keys(sessions)) {
    let expired = false;
    if (redisReady && redis) {
      // presence in Redis implies not expired (TTL); absence means expired
      // (best-effort check; ignore errors)
      // We use the in-memory born time as a fallback guard.
      const born = sessionBorn.get(id) || 0;
      if (now - born > SESSION_TTL * 1000) expired = true;
    } else {
      const born = sessionBorn.get(id) || 0;
      if (now - born > SESSION_TTL * 1000) expired = true;
    }
    if (expired) {
      delete sessions[id];
      sessionBorn.delete(id);
    }
  }
}, 60000);

// Generate unique session ID for authentication tracking
function sid() {
  return crypto.randomBytes(24).toString('hex');
}

// Core Exchange API client - abstracts HTTP calls with session auth
async function exch(session, method, path, body) {
  // Construct full Exchange API endpoint
  const url = `${session.baseURL}/v1${path}`;
  const store = reqStore.getStore();
  if (store) store._proxiedTo = url; // tag for audit log
  const start = Date.now();
  // Prepare authentication headers
  const headers = {
    Authorization: `Basic ${session.auth}`,  // Exchange basic auth
    Accept: 'application/json',
  };
  // Set content-type for requests with body
  if (body && method !== 'GET') headers['Content-Type'] = 'application/json';

  try {
    // Make API call to Exchange
    const r = await fetch(url, {
      method,
      headers,
      body: body && method !== 'GET' ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    const ms = Date.now() - start;
    logExchange(method, url, r.status, ms, session.orgId);
    try { return { status: r.status, data: JSON.parse(text) }; }
    catch { return { status: r.status, data: text }; }
  } catch (e) {
    const ms = Date.now() - start;
    logExchange(method, url, 0, ms, session.orgId);
    throw e;
  }
}

// Unified success response helper - masks 404s as success for get operations
function ok(status, data) {
  // Exchange sometimes returns 404 for GETs that should be treated as "not found" not error
  if (status === 404 && data && typeof data === 'object' && !data.msg && !data.message && !data.error) return 200;
  return status;
}

// Remove org prefix from full ID (e.g., myorg/node1 -> node1)
function stripOrg(orgId, fullId) {
  return fullId.startsWith(orgId + '/') ? fullId.slice(orgId.length + 1) : fullId;
}

// Parse agbot ID to extract org and agbot name from format org/id
function agbotIdAndOrg(org, raw) {
  if (raw.includes('/')) {
    const parts = raw.split('/');
    return { org: parts[0], id: parts.slice(1).join('/') };  // First part is org, rest is ID
  }
  return { org, id: raw };  // No org in ID, use provided org
}

// Remove sensitive fields from request bodies before forwarding to Exchange
function sanitizeBody(body) {
  const b = { ...body };  // Create copy to avoid mutating original
  delete b.lastUpdated;  // Exchange rejects this field
  delete b.owner;        // Exchange rejects this field
  delete b.name;         // Exchange rejects this field
  delete b.organization; // Exchange rejects this field
  delete b.org;          // Exchange rejects this field
  return b;
}

// Parse Exchange service ID (url_version_arch) into its components.
// Underscores in the url are escaped as __ (double underscore) by the Exchange.
function parseServiceId(svcName) {
  // Find positions of unescaped underscores (ignore underscores in __ pairs)
  const positions = [];
  for (let i = 0; i < svcName.length; i++) {
    if (svcName[i] === '_' && (i === 0 || svcName[i - 1] !== '_')) {
      positions.push(i);
    }
  }
  if (positions.length < 2) return { url: '', version: '', arch: '' };
  const last = positions[positions.length - 1];
  const second = positions[positions.length - 2];
  return {
    url: svcName.substring(0, second).replace(/__/g, '_'),
    version: svcName.substring(second + 1, last),
    arch: svcName.substring(last + 1),
  };
}

// Whitelist of allowed fields for service creation/update - prevents unknown field rejections
const SERVICE_ALLOWED = new Set([
  'sharable','deployment','imageStore','public','matchHardware','url',
  'deploymentSignature','label','arch','version','clusterDeploymentSignature',
  'documentation','description','requiredServices','userInput','jsonFormats','clusterDeployment',
]);

function serviceBody(body) {
  const b = {};
  for (const k of SERVICE_ALLOWED) {
    if (body[k] !== undefined) b[k] = body[k];  // Only include allowed fields
  }
  return b;
}

// Whitelist of allowed fields for pattern creation/update
const PATTERN_ALLOWED = new Set([
  'label','description','public','services','userInput','agreementProtocols',
  'secretBinding','clusterNamespace','jsonFormats',
]);

function patternBody(body) {
  const b = {};
  for (const k of PATTERN_ALLOWED) {
    if (body[k] !== undefined) b[k] = body[k];
  }
  return b;
}

// Session resolver - reads the opaque session id from the HttpOnly cookie.
// Falls back to the X-Session-Id header only for non-browser/admin tooling.
function sessionIdFromReq(req) {
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/(?:^|;\s*)nereid_sid=([a-f0-9]+)/);
  if (m) return m[1];
  return req.headers['x-session-id'] || '';
}

// Session resolver (synchronous). Reads the opaque session id from the HttpOnly
// cookie (or X-Session-Id header for non-browser tooling), looks it up in the
// decrypted in-memory working set, and refreshes the Redis idle TTL.
function session(req) {
  const id = sessionIdFromReq(req);
  if (!id) return null;
  const s = sessions[id];
  if (s) touchSession(id); // idle TTL refresh on activity
  return s || null;
}

// Synchronous session lookup for logging middleware (best-effort, no await)
function sessionSync(req) {
  const id = sessionIdFromReq(req);
  return id ? { orgId: sessions[id]?.orgId || '?' } : null;
}

// ==============================================
// Auth Routes (local BFF accounts + system Exchange config + API keys)
// ==============================================

function apiKeyRow(r) {
  return { id: r.id, org: r.org, label: r.label, revoked: r.revoked, expiresAt: r.expires_at, createdAt: r.created_at, createdBy: r.created_by };
}

// Reports whether the instance still needs first-time setup (no local users yet).
app.get('/api/setup-status', async (req, res) => {
  const users = await db.loadUsers();
  res.json({ needsSetup: users.length === 0, exchangeConfigured: !!exchangeConfig.configured });
});

// First-time setup: create the initial platform account and persist the shared
// Exchange connection. Only allowed when no local users exist yet.
// The Exchange account MUST be a hub-level superuser (e.g. root/root) that can
// list all organizations. Regular org accounts cannot manage the hub.
app.post('/api/setup', async (req, res) => {
  try {
    if ((await db.loadUsers()).length > 0) return res.status(400).json({ msg: 'Already initialized, cannot re-setup' });
    const { adminUser, adminPassword, baseURL, user, password } = req.body;
    if (!adminUser || !adminPassword || !baseURL || !user || !password) {
      return res.status(400).json({ msg: 'Missing required parameters' });
    }
    const auth = `${user}:${password}`;
    const b64 = Buffer.from(auth).toString('base64');
    const headers = { Authorization: `Basic ${b64}` };
    const base = baseURL.replace(/\/+$/, '');
    // 1) Verify the Exchange is reachable
    const vr = await fetch(`${base}/v1/admin/version`, { headers });
    if (!vr.ok) return res.status(401).json({ msg: 'Exchange connection failed — check URL and credentials' });
    // 2) Verify the account has hub-level admin access (can list all orgs)
    const or = await fetch(`${base}/v1/orgs`, { headers });
    if (!or.ok) return res.status(403).json({ msg: 'Exchange account lacks hub-level admin privileges — use root/root or equivalent superuser' });
    let orgData;
    try { orgData = await or.json(); } catch { orgData = {}; }
    if (!orgData.orgs || typeof orgData.orgs !== 'object' || Object.keys(orgData.orgs).length === 0) {
      return res.status(403).json({ msg: 'Exchange account cannot list organizations — not a hub-level superuser' });
    }
    const version = (await vr.text()).replace(/"/g, '');
    const orgId = user.includes('/') ? user.split('/')[0] : user;
    const cfg = { configured: true, baseURL: base, auth: b64, orgId, version };
    await db.saveExchangeConfig(cfg, adminUser);
    exchangeConfig = cfg;
    const { hash, salt } = hashPassword(adminPassword);
    await db.createUser({ username: adminUser, hash, salt, role: 'platform', createdAt: new Date().toISOString() });
    logEvent('setup', { adminUser, orgId }, orgId);
    res.json({ ok: true });
  } catch (e) {
    res.status(502).json({ msg: `Exchange unreachable: ${e.message}` });
  }
});

// Local login: validates the BFF account and issues a hardened session.
app.post('/api/login', async (req, res) => {
  try {
    const { username, password, org } = req.body;
    if (!username || !password) return res.status(400).json({ msg: 'Missing username or password' });
    if (!exchangeConfig.configured) return res.status(400).json({ msg: 'Exchange not configured' });
    // When `org` is provided, look up a partner user scoped to that org.
    // When omitted, only match platform users (org IS NULL).
    const u = org ? await db.getUser(username, org) : await db.getUser(username);
    if (!u || !verifyPassword(password, u.hash, u.salt)) {
      return res.status(401).json({ msg: 'Invalid username or password' });
    }
    const id = sid();
    const orgId = u.role === 'partner' ? u.org : exchangeConfig.orgId;
    const csrf = csrfToken();
    const data = {
      userId: u.username,
      username: u.username,
      role: u.role,
      baseURL: exchangeConfig.baseURL,
      auth: exchangeConfig.auth,
      orgId,
      version: exchangeConfig.version || '',
      csrfToken: csrf,
    };
    sessions[id] = data;
    sessionBorn.set(id, Date.now());
    sessionCreated.set(id, Date.now());
    persistSession(id, data);
    logEvent('login', { username: u.username, role: u.role, orgId, org: u.org || null }, orgId);
    res.setHeader('Set-Cookie', [
      sessionCookie(id, req),
      `nereid_csrf=${csrf}; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL}`,
    ]);
    res.json({ orgId, version: data.version, role: u.role, username: u.username, org: u.org || null, csrfToken: csrf });
  } catch (e) {
    res.status(502).json({ msg: `Login failed: ${e.message}` });
  }
});

// Returns current session context (used for page-refresh re-auth).
app.get('/api/me', (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const csrf = s.csrfToken || csrfToken();
  if (!s.csrfToken) s.csrfToken = csrf;
  res.setHeader('Set-Cookie', `nereid_csrf=${csrf}; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL}`);
  res.json({ orgId: s.orgId, version: s.version || '', role: s.role, username: s.username, org: s.org, csrfToken: csrf });
});

app.post('/api/logout', (req, res) => {
  const id = sessionIdFromReq(req);
  if (id) {
    const u = sessions[id]?.username;
    delete sessions[id];
    sessionBorn.delete(id);
    sessionCreated.delete(id);
    dropSession(id);
    logEvent('logout', { username: u || '?' }, '');
  }
  res.setHeader('Set-Cookie', sessionCookie('', req));
  res.json({ ok: true });
});

// ---- Local BFF user management (platform only) ----
app.get('/api/bff-users', requireRole('platform'), async (req, res) => {
  const users = await db.loadUsers();
  res.json({ users });
});

app.post('/api/bff-users', requireRole('platform'), async (req, res) => {
  try {
    const { username, password, role, org } = req.body;
    if (!username || !password) return res.status(400).json({ msg: 'Missing username or password' });
    if (!ROLES.includes(role)) return res.status(400).json({ msg: 'Invalid role' });
    if (role === 'partner' && !org) return res.status(400).json({ msg: 'Partner must have an org' });
    // For partner users, only check uniqueness within their org.
    // Platform users are globally unique.
    if (role === 'partner') {
      if (await db.getUser(username, org)) return res.status(409).json({ msg: 'User already exists in this org' });
    } else {
      if (await db.getUser(username)) return res.status(409).json({ msg: 'User already exists' });
    }
    // For partner accounts, ensure the bound Exchange org exists (auto-create if
    // missing) using the platform's hub-level Exchange credentials.
    let orgCreated = false;
    if (role === 'partner' && org && exchangeConfig.configured) {
      const adminSess = { baseURL: exchangeConfig.baseURL, auth: exchangeConfig.auth, orgId: 'root' };
      const check = await exch(adminSess, 'GET', `/orgs/${org}`);
      const exists = check.status === 200 && check.data && check.data.orgs && Object.keys(check.data.orgs).length > 0;
      if (!exists) {
        const created = await exch(adminSess, 'POST', `/orgs/${org}`, {
          label: org,
          description: `Auto-created for partner ${username}`,
        });
        if (created.status >= 200 && created.status < 300) {
          orgCreated = true;
        } else {
          return res.status(502).json({ msg: `Failed to create org ${org}: ${created.data?.msg || created.status}` });
        }
      }
    }
    // Optionally create/update the corresponding Exchange user so edge devices
    // can authenticate directly against the Exchange (default: off).
    let exchangeUserCreated = false;
    if (req.body.createExchangeUser && exchangeConfig.configured) {
      const exchangeUserOrg = role === 'partner' ? org : exchangeConfig.orgId;
      const adminSess = { baseURL: exchangeConfig.baseURL, auth: exchangeConfig.auth, orgId: 'root' };
      const checkResp = await exch(adminSess, 'GET', `/orgs/${exchangeUserOrg}/users/${username}`);
      const exists = checkResp.status === 200 && checkResp.data && checkResp.data.users &&
        Object.keys(checkResp.data.users).length > 0;
      if (exists) {
        await exch(adminSess, 'PATCH', `/orgs/${exchangeUserOrg}/users/${username}`, { password });
      } else {
        await exch(adminSess, 'POST', `/orgs/${exchangeUserOrg}/users/${username}`, {
          password,
          email: `${username}@nereid.local`,
          admin: true,
        });
      }
      exchangeUserCreated = true;
    }
    const { hash, salt } = hashPassword(password);
    await db.createUser({ username, hash, salt, role, org, createdAt: new Date().toISOString() });
    logEvent('user.create', { username, role, org, orgCreated, exchangeUserCreated }, exchangeConfig.orgId);
    res.json({ ok: true, orgCreated, exchangeUserCreated });
  } catch (e) { res.status(500).json({ msg: e.message }); }
});

app.delete('/api/bff-users/:username', requireRole('platform'), async (req, res) => {
  const target = req.params.username;
  const org = req.query.org; // org query param disambiguates cross-org duplicate usernames
  if (target === req.sessionUser.username && (!org || org === (req.sessionUser.org || ''))) {
    return res.status(400).json({ msg: 'Cannot delete yourself' });
  }
  const u = org ? await db.getUser(target, org) : await db.getUser(target);
  if (!u) return res.status(404).json({ msg: 'User not found' });
  const exchangeUserOrg = u.org;
  // Optionally delete the corresponding Exchange user
  let exchangeUserDeleted = false;
  if (req.query.deleteExchangeUser === 'true' && exchangeConfig.configured && exchangeUserOrg) {
    const adminSess = { baseURL: exchangeConfig.baseURL, auth: exchangeConfig.auth, orgId: 'root' };
    const delResp = await exch(adminSess, 'DELETE', `/orgs/${exchangeUserOrg}/users/${target}`);
    if (delResp.status >= 200 && delResp.status < 300) {
      exchangeUserDeleted = true;
    }
  }
  await db.deleteUser(target, org || null);
  logEvent('user.delete', { username: target, org: org || null, exchangeUserDeleted }, exchangeConfig.orgId);
  res.json({ ok: true, exchangeUserDeleted });
});

// Password change: platform may change any user; others only their own.
app.put('/api/bff-users/:username/password', requireAuth, async (req, res) => {
  const org = req.query.org;
  const u = org ? await db.getUser(req.params.username, org) : await db.getUser(req.params.username);
  if (!u) return res.status(404).json({ msg: 'User not found' });
  const isOwn = req.sessionUser.username === req.params.username;
  if (req.sessionUser.role !== 'platform' && !isOwn) {
    return res.status(403).json({ msg: 'Permission denied' });
  }
  const { oldPassword, newPassword } = req.body;
  if (!newPassword) return res.status(400).json({ msg: 'Missing new password' });
  // Verify old password when user changes their own password.
  if (isOwn) {
    if (!oldPassword) return res.status(400).json({ msg: 'Missing old password' });
    if (!verifyPassword(oldPassword, u.hash, u.salt)) return res.status(403).json({ msg: 'Old password is incorrect' });
  }
  const { hash, salt } = hashPassword(newPassword);
  await db.updatePassword(req.params.username, hash, salt, u.org);
  logEvent('user.password', { username: req.params.username, org: u.org }, exchangeConfig.orgId);
  res.json({ ok: true });
});

// Update BFF user role/org (platform only). Also optionally resets password.
app.put('/api/bff-users/:username', requireRole('platform'), async (req, res) => {
  const { role, org: newOrg, newPassword } = req.body;
  const org = req.query.org; // org query param to identify the target
  const target = req.params.username;
  const u = org ? await db.getUser(target, org) : await db.getUser(target);
  if (!u) return res.status(404).json({ msg: 'User not found' });
  const isSelf = target === req.sessionUser.username && (!org || org === (req.sessionUser.org || ''));
  if (isSelf) {
    if (role !== undefined && role !== u.role) return res.status(400).json({ msg: 'Cannot change your own role' });
    if (newOrg !== undefined && newOrg !== (u.org || '')) return res.status(400).json({ msg: 'Cannot change your own org' });
  }
  const updates = {};
  if (role !== undefined && ROLES.includes(role)) updates.role = role;
  if (newOrg !== undefined) updates.newOrg = newOrg || null;
  if (newPassword) {
    const { hash, salt } = hashPassword(newPassword);
    updates.hash = hash;
    updates.salt = salt;
  }
  await db.updateUser(target, org || null, updates);
  logEvent('user.update', { username: target, org: org || null, updates: Object.keys(updates) }, exchangeConfig.orgId);
  res.json({ ok: true });
});

// ---- Exchange connection config (platform only) ----
app.get('/api/exchange-config', requireRole('platform'), (req, res) => {
  if (!exchangeConfig.configured) return res.json({ configured: false });
  res.json({
    configured: true,
    baseURL: exchangeConfig.baseURL,
    orgId: exchangeConfig.orgId,
    user: Buffer.from(exchangeConfig.auth, 'base64').toString('utf8'),
  });
});

app.put('/api/exchange-config', requireRole('platform'), async (req, res) => {
  try {
    const { baseURL, user, password } = req.body;
    if (!baseURL || !user || !password) return res.status(400).json({ msg: 'Missing required parameters' });
    const auth = `${user}:${password}`;
    const b64 = Buffer.from(auth).toString('base64');
    const url = `${baseURL.replace(/\/+$/, '')}/v1/admin/version`;
    const r = await fetch(url, { headers: { Authorization: `Basic ${b64}` } });
    if (!r.ok && r.status !== 404) return res.status(401).json({ msg: 'Exchange connection failed' });
    const version = (await r.text()).replace(/"/g, '');
    const orgId = user.includes('/') ? user.split('/')[0] : user;
    const cfg = { configured: true, baseURL: baseURL.replace(/\/+$/, ''), auth: b64, orgId, version };
    await db.saveExchangeConfig(cfg, req.sessionUser.username);
    exchangeConfig = cfg;
    propagateExchangeConfig(); // apply immediately to live sessions
    logEvent('exchange.config', { orgId }, orgId);
    res.json({ ok: true, orgId, version });
  } catch (e) {
    res.status(502).json({ msg: `Exchange unreachable: ${e.message}` });
  }
});

// ---- System settings (session / audit) ----
app.get('/api/settings', requireRole('platform'), async (req, res) => {
  const map = await db.loadSettings();
  res.json({
    session_ttl: parseInt(map.session_ttl || process.env.SESSION_TTL || '86400', 10),
    session_abs_ttl: parseInt(map.session_abs_ttl || process.env.SESSION_ABS_TTL || '28800', 10),
    audit_retention_days: parseInt(map.audit_retention_days || '0', 10),
  });
});
app.put('/api/settings', requireRole('platform'), async (req, res) => {
  const { session_ttl, session_abs_ttl, audit_retention_days } = req.body;
  const allowed = ['session_ttl', 'session_abs_ttl', 'audit_retention_days'];
  for (const [k, v] of Object.entries(req.body)) {
    if (!allowed.includes(k)) continue;
    const n = parseInt(v, 10);
    if (isNaN(n) || n < 0) return res.status(400).json({ msg: `参数 ${k} 无效` });
    await db.saveSetting(k, String(n));
  }
  logEvent('settings.update', { ...req.body }, exchangeConfig.orgId || '');
  res.json({ ok: true });
});

// ---- Partner API key management ----
// Platform-managed: all orgs.
app.get('/api/apikeys', requireRole('platform'), async (req, res) => {
  const rows = await db.listApiKeys();
  res.json({ keys: rows.map(apiKeyRow) });
});
app.post('/api/apikeys', requireRole('platform'), async (req, res) => {
  try {
    const { org, label, expiresInDays } = req.body;
    if (!org || !label) return res.status(400).json({ msg: 'Missing org or label' });
    const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 86400000).toISOString() : null;
    const { id, key } = await db.createApiKey({ org, label, expiresAt, createdBy: req.sessionUser.username });
    res.json({ id, key, org });
  } catch (e) { res.status(500).json({ msg: e.message }); }
});
app.delete('/api/apikeys/:id', requireRole('platform'), async (req, res) => {
  await db.deleteApiKey(req.params.id);
  res.json({ ok: true });
});
// Renew first, so Express matches /renew before :id
app.post('/api/apikeys/:id/renew', requireRole('platform'), async (req, res) => {
  const result = await db.renewApiKey(req.params.id);
  res.json({ id: req.params.id, key: result.key });
});
app.post('/api/apikeys/:id/revoke', requireRole('platform'), async (req, res) => {
  await db.revokeApiKey(req.params.id);
  res.json({ ok: true });
});
app.get('/api/apikeys/:id/key', requireRole('platform'), async (req, res) => {
  const key = await db.getApiKeyPlain(req.params.id);
  if (key === null) return res.status(404).json({ msg: 'Key plaintext not available (created before feature was added)' });
  if (key === undefined) return res.status(404).json({ msg: 'Key not found' });
  res.json({ key });
});

// Partner self-service: only their own org's keys.
app.get('/api/my-apikeys', requireAuth, async (req, res) => {
  const s = req.sessionUser;
  if (s.role !== 'partner') return res.status(403).json({ msg: 'Permission denied' });
  const rows = await db.listApiKeys(s.orgId);
  res.json({ keys: rows.map(apiKeyRow) });
});
app.post('/api/my-apikeys', requireAuth, async (req, res) => {
  const s = req.sessionUser;
  if (s.role !== 'partner') return res.status(403).json({ msg: 'Permission denied' });
  const { label, expiresInDays } = req.body;
  if (!label) return res.status(400).json({ msg: 'Missing label' });
  const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 86400000).toISOString() : null;
  const { id, key } = await db.createApiKey({ org: s.orgId, label, expiresAt, createdBy: s.username });
  res.json({ id, key, org: s.orgId });
});
app.post('/api/my-apikeys/:id/revoke', requireAuth, async (req, res) => {
  const s = req.sessionUser;
  if (s.role !== 'partner') return res.status(403).json({ msg: 'Permission denied' });
  const rows = await db.listApiKeys(s.orgId);
  if (!rows.find((r) => r.id === req.params.id)) return res.status(404).json({ msg: 'Key not found' });
  await db.revokeApiKey(req.params.id);
  res.json({ ok: true });
});
app.delete('/api/my-apikeys/:id', requireAuth, async (req, res) => {
  const s = req.sessionUser;
  if (s.role !== 'partner') return res.status(403).json({ msg: 'Permission denied' });
  const rows = await db.listApiKeys(s.orgId);
  if (!rows.find((r) => r.id === req.params.id)) return res.status(404).json({ msg: 'Key not found' });
  await db.deleteApiKey(req.params.id);
  res.json({ ok: true });
});
app.get('/api/my-apikeys/:id/key', requireAuth, async (req, res) => {
  const s = req.sessionUser;
  if (s.role !== 'partner') return res.status(403).json({ msg: 'Permission denied' });
  const rows = await db.listApiKeys(s.orgId);
  if (!rows.find((r) => r.id === req.params.id)) return res.status(404).json({ msg: 'Key not found' });
  const key = await db.getApiKeyPlain(req.params.id);
  if (key === undefined) return res.status(404).json({ msg: 'Key not found' });
  if (key === null) return res.status(404).json({ msg: 'Key plaintext not available (created before feature was added)' });
  res.json({ key });
});
app.post('/api/my-apikeys/:id/renew', requireAuth, async (req, res) => {
  const s = req.sessionUser;
  if (s.role !== 'partner') return res.status(403).json({ msg: 'Permission denied' });
  const rows = await db.listApiKeys(s.orgId);
  if (!rows.find((r) => r.id === req.params.id)) return res.status(404).json({ msg: 'Key not found' });
  const result = await db.renewApiKey(req.params.id);
  res.json({ id: req.params.id, key: result.key });
});

// ==============================================
// System Info Routes
// ==============================================

// Get organization statistics (nodes, users, services, agbots)
// Aggregate resource counts across orgs. Platform: all orgs (excl. root). Partner: own org only.
app.get('/api/status', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  try {
    let orgs = [s.orgId];
    if (s.role === 'platform') {
      try {
        const orgRes = await exch(s, 'GET', '/orgs');
        if (orgRes.status === 200) {
          const allOrgs = Object.keys(orgRes.data?.orgs ?? {}).filter((o) => o !== 'root');
          if (allOrgs.length > 0) orgs = allOrgs;
        }
      } catch {}
    }
    let totalNodes = 0, totalUsers = 0, totalServices = 0, totalAgbots = 0;
    let totalPatterns = 0, totalPolicies = 0, totalMgmtPolicies = 0;
    await Promise.all(orgs.map(async (org) => {
      try {
        const [staRes, svcRes, abRes, patRes, polRes, mgRes] = await Promise.all([
          exch(s, 'GET', `/orgs/${org}/status`),
          exch(s, 'GET', `/orgs/${org}/services`),
          exch(s, 'GET', `/orgs/${org}/agbots`),
          exch(s, 'GET', `/orgs/${org}/patterns`),
          exch(s, 'GET', `/orgs/${org}/business/policies`),
          exch(s, 'GET', `/orgs/${org}/managementpolicies`),
        ]);
        if (staRes.status === 200 && staRes.data) {
          totalNodes += staRes.data.numberOfNodes ?? 0;
          totalUsers += staRes.data.numberOfUsers ?? 0;
        }
        if (svcRes.status === 200 && svcRes.data?.services) totalServices += Object.keys(svcRes.data.services).length;
        if (abRes.status === 200 && abRes.data?.agbots) totalAgbots += Object.keys(abRes.data.agbots).length;
        if (patRes.status === 200 && patRes.data?.patterns) totalPatterns += Object.keys(patRes.data.patterns).length;
        if (polRes.status === 200 && polRes.data?.businessPolicy) totalPolicies += Object.keys(polRes.data.businessPolicy).length;
        if (mgRes.status === 200 && mgRes.data?.managementPolicies) totalMgmtPolicies += Object.keys(mgRes.data.managementPolicies).length;
      } catch {}
    }));
    res.json({
      nodes: totalNodes,
      users: totalUsers,
      services: totalServices,
      agbots: totalAgbots,
      patterns: totalPatterns,
      policies: totalPolicies,
      mgmtPolicies: totalMgmtPolicies,
    });
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// Richer dashboard payload: counts + server uptime + node heartbeat stats + recent activity
// Platform: aggregates across all Exchange orgs. Partner: own org only.
app.get('/api/dashboard', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  try {
    const now = Date.now();
    // Determine which orgs to aggregate
    let orgs = [s.orgId];
    if (s.role === 'platform') {
      try {
        const orgRes = await exch(s, 'GET', '/orgs');
        if (orgRes.status === 200) {
          const allOrgs = Object.keys(orgRes.data?.orgs ?? {}).filter((o) => o !== 'root');
          if (allOrgs.length > 0) orgs = allOrgs;
        }
      } catch {}
    }
    // Aggregate counts across all target orgs in parallel
    let totalNodes = 0, totalUsers = 0, totalServices = 0, totalAgbots = 0;
    let totalPatterns = 0, totalPolicies = 0, totalMgmtPolicies = 0;
    let allNodeList = [];
    let totalAgreements = 0, activeAgreements = 0;
    let totalErrors = 0, recentErrors = [];
    let nodeHealth = { healthy: 0, unhealthy: 0, unknown: 0 };
    let serviceInstances = 0;
    let exchangeConnected = false;
    let exchangeLatency = 0;
    let nodeVersions = {};
    let unhealthyNodes = [];
    let orgResources = {};
    
    await Promise.all(orgs.map(async (org) => {
      try {
        const startTime = Date.now();
        const [staRes, nRes, svcRes, abRes, patRes, polRes, mgRes, errRes] = await Promise.all([
          exch(s, 'GET', `/orgs/${org}/status`),
          exch(s, 'GET', `/orgs/${org}/nodes`),
          exch(s, 'GET', `/orgs/${org}/services`),
          exch(s, 'GET', `/orgs/${org}/agbots`),
          exch(s, 'GET', `/orgs/${org}/patterns`),
          exch(s, 'GET', `/orgs/${org}/business/policies`),
          exch(s, 'GET', `/orgs/${org}/managementpolicies`),
          exch(s, 'GET', `/orgs/${org}/nodes/errors`).catch(() => ({ status: 500, data: null })),
        ]);
        exchangeLatency += Date.now() - startTime;
        
        if (staRes.status === 200 && staRes.data) {
          totalNodes += staRes.data.numberOfNodes ?? 0;
          totalUsers += staRes.data.numberOfUsers ?? 0;
        }
        if (nRes.status === 200 && nRes.data?.nodes) {
          const nodes = nRes.data.nodes;
          Object.entries(nodes).forEach(([id, n]) => {
            allNodeList.push({ id, lastHeartbeat: n.lastHeartbeat, pattern: n.pattern, registered: Array.isArray(n.registeredServices) ? n.registeredServices.length : 0, org });
            // Node health check
            const heartbeatAge = n.lastHeartbeat ? now - new Date(n.lastHeartbeat).getTime() : Infinity;
            if (heartbeatAge < 300000) nodeHealth.healthy++;
            else if (heartbeatAge < 600000) nodeHealth.unknown++;
            else {
              nodeHealth.unhealthy++;
              unhealthyNodes.push({ id, lastHeartbeat: n.lastHeartbeat, org });
            }
            // Version distribution
            const version = n.version || n.agent_version || 'unknown';
            nodeVersions[version] = (nodeVersions[version] || 0) + 1;
          });
        }
        if (svcRes.status === 200 && svcRes.data?.services) totalServices += Object.keys(svcRes.data.services).length;
        if (abRes.status === 200 && abRes.data?.agbots) totalAgbots += Object.keys(abRes.data.agbots).length;
        if (patRes.status === 200 && patRes.data?.patterns) totalPatterns += Object.keys(patRes.data.patterns).length;
        if (polRes.status === 200 && polRes.data?.businessPolicy) totalPolicies += Object.keys(polRes.data.businessPolicy).length;
        if (mgRes.status === 200 && mgRes.data?.managementPolicies) totalMgmtPolicies += Object.keys(mgRes.data.managementPolicies).length;
        
        // Agreements - aggregate from agbots
        if (abRes.status === 200 && abRes.data?.agbots) {
          const agbotIds = Object.keys(abRes.data.agbots);
          await Promise.all(agbotIds.map(async (agbotId) => {
            try {
              const agRes = await exch(s, 'GET', `/orgs/${org}/agbots/${encodeURIComponent(agbotId)}/agreements`);
              if (agRes.status === 200 && agRes.data?.agreements) {
                const agreements = Object.values(agRes.data.agreements);
                totalAgreements += agreements.length;
                activeAgreements += agreements.filter((a) => a.state === 'negotiated' || a.state === 'agreed' || a.active).length;
              }
            } catch {}
          }));
        }
        
        // Errors
        if (errRes.status === 200 && errRes.data?.errors) {
          const errors = Object.values(errRes.data.errors);
          totalErrors += errors.length;
          recentErrors.push(...errors.slice(0, 5));
        }
        
        // Organization resources
        orgResources[org] = {
          nodes: staRes.data?.numberOfNodes ?? 0,
          users: staRes.data?.numberOfUsers ?? 0,
          services: svcRes.status === 200 ? Object.keys(svcRes.data?.services ?? {}).length : 0,
          agbots: abRes.status === 200 ? Object.keys(abRes.data?.agbots ?? {}).length : 0,
        };
      } catch {}
    }));
    
    exchangeConnected = exchangeLatency > 0;
    exchangeLatency = Math.round(exchangeLatency / orgs.length);
    const online = allNodeList.filter((n) => n.lastHeartbeat && now - new Date(n.lastHeartbeat).getTime() < 300000).length;
    const recent = allNodeList
      .filter((n) => n.lastHeartbeat)
      .sort((a, b) => new Date(b.lastHeartbeat).getTime() - new Date(a.lastHeartbeat).getTime())
      .slice(0, 8)
      .map((n) => ({ id: n.id, lastHeartbeat: n.lastHeartbeat, pattern: n.pattern, registered: n.registered }));
    
    // Sort recent errors by timestamp
    recentErrors.sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
    recentErrors = recentErrors.slice(0, 10);
    
    // Unhealthy nodes (limit to 10)
    unhealthyNodes = unhealthyNodes.slice(0, 10);
    
    // Node version distribution (top 5)
    const nodeVersionList = Object.entries(nodeVersions)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([version, count]) => ({ version, count }));
    
    // Recent changes (try to get from Exchange)
    let recentChanges = [];
    try {
      const changesRes = await exch(s, 'GET', '/changes?max=10');
      if (changesRes.status === 200 && changesRes.data?.changes) {
        recentChanges = Object.values(changesRes.data.changes).slice(0, 10);
      }
    } catch {}
    
    res.json({
      orgId: s.orgId,
      orgType: s.orgType,
      nodes: totalNodes,
      users: totalUsers,
      services: totalServices,
      agbots: totalAgbots,
      patterns: totalPatterns,
      policies: totalPolicies,
      mgmtPolicies: totalMgmtPolicies,
      onlineNodes: online,
      serverUptimeMs: now - SERVER_START,
      serverStartedAt: new Date(SERVER_START).toISOString(),
      recentNodes: recent,
      // Existing fields
      nodeHealth,
      totalAgreements,
      activeAgreements,
      totalErrors,
      recentErrors,
      serviceInstances: totalNodes,
      exchangeConnected,
      exchangeLatency,
      notifications: [
        ...(nodeHealth.unhealthy > 0 ? [{ type: 'warning', message: `${nodeHealth.unhealthy} nodes unhealthy` }] : []),
        ...(totalErrors > 0 ? [{ type: 'error', message: `${totalErrors} errors detected` }] : []),
        ...(activeAgreements < totalAgreements ? [{ type: 'info', message: `${totalAgreements - activeAgreements} agreements inactive` }] : []),
      ],
      // New fields
      nodeVersionList,
      unhealthyNodes,
      orgResources,
      recentChanges,
    });
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.get('/api/version', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  try {
    const { data } = await exch(s, 'GET', '/admin/version');
    res.json({ version: typeof data === 'string' ? data.replace(/"/g, '') : '' });
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.get('/api/org-type', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  try {
    if (s.orgId === 'root') return res.json({ orgType: 'hubadmin' });
    const { status, data } = await exch(s, 'GET', `/orgs/${s.orgId}/agbots`);
    const hasAgbots = status === 200 && data && data.agbots && Object.keys(data.agbots).length > 0;
    res.json({ orgType: hasAgbots ? 'system' : 'user' });
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// ==============================================
// Organizations Routes
// ==============================================

app.get('/api/organizations', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  try {
    const { status, data } = await exch(s, 'GET', '/orgs');
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.put('/api/organizations/:orgid', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  try {
    // Upsert: Exchange uses POST to create and PUT to update. Try PUT first;
    // if the org doesn't exist yet, create it with POST.
    let { status, data } = await exch(s, 'PUT', `/orgs/${req.params.orgid}`, req.body);
    if (status === 404 || (data && typeof data === 'object' && /not found/i.test(data.msg || ''))) {
      ({ status, data } = await exch(s, 'POST', `/orgs/${req.params.orgid}`, req.body));
    }
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.delete('/api/organizations/:orgid', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  try {
    const orgid = req.params.orgid;
    // Before deleting the org from Exchange, also remove BFF users bound to this org.
    const bffUsers = await db.loadUsers();
    const affectedBffUsers = bffUsers.filter((u) => u.org === orgid);
    for (const u of affectedBffUsers) {
      await db.deleteUser(u.username, orgid);
    }
    const { status, data } = await exch(s, 'DELETE', `/orgs/${orgid}`);
    logEvent('org.delete', { orgid, deletedBffUsers: affectedBffUsers.length }, s.orgId);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// ==============================================
// Exchange Users Routes (proxy to Exchange org)
// ==============================================

app.get('/api/exchange-users', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  try {
    // Platform users see users across all non-root orgs; partner sees own org only.
    if (s.role === 'platform' && s.orgId === 'root') {
      const all = await exch(s, 'GET', '/orgs');
      const orgList = all.data?.orgs ? Object.keys(all.data.orgs).filter((o) => o !== 'root' && o !== 'IBM') : [];
      const merged = { users: {} };
      await Promise.all(orgList.map(async (org) => {
        const r = await exch(s, 'GET', `/orgs/${org}/users`);
        const users = r.data?.users || {};
        // Exchange already prefixes keys with the org name (e.g. "yiqisoft/testbff"),
        // so no additional prefix needed.
        Object.assign(merged.users, users);
      }));
      return res.json(merged);
    }
    const { status, data } = await exch(s, 'GET', `/orgs/${s.orgId}/users`);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.get('/api/exchange-users/:username', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const { status, data } = await exch(s, 'GET', `/orgs/${org}/users/${req.params.username}`);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.put('/api/exchange-users/:username', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const { status, data } = await exch(s, 'PUT', `/orgs/${org}/users/${req.params.username}`, req.body);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.delete('/api/exchange-users/:username', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const { status, data } = await exch(s, 'DELETE', `/orgs/${org}/users/${req.params.username}`);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.post('/api/exchange-users/:username/apikeys', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const { status, data } = await exch(s, 'POST', `/orgs/${org}/users/${req.params.username}/apikeys`, req.body);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.delete('/api/exchange-users/:username/apikeys/:keyid', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const { status, data } = await exch(s, 'DELETE', `/orgs/${org}/users/${req.params.username}/apikeys/${req.params.keyid}`);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// ==============================================
// Nodes Routes
// ==============================================

app.get('/api/nodes', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const requestedOrg = req.query.org;
  try {
    // Platform with no org specified: aggregate from all non-root orgs
    if (s.role === 'platform' && !requestedOrg) {
      let allNodes = {};
      try {
        const orgRes = await exch(s, 'GET', '/orgs');
        if (orgRes.status === 200) {
          const orgs = Object.keys(orgRes.data?.orgs ?? {}).filter((o) => o !== 'root');
          await Promise.all(orgs.map(async (org) => {
            try {
              const r = await exch(s, 'GET', `/orgs/${org}/nodes`);
              if (r.status === 200 && r.data?.nodes) {
                Object.entries(r.data.nodes).forEach(([id, n]) => {
                  n._org = org;
                  allNodes[id] = n;
                });
              }
            } catch (_) {}
          }));
        }
      } catch (_) {}
      // Augment each node with _svcRunning / _svcTotal from node status
      await Promise.allSettled(Object.keys(allNodes).map(async (id) => {
        const org = allNodes[id]._org || s.orgId;
        try {
          const sr = await exch(s, 'GET', `/orgs/${org}/nodes/${encodeURIComponent(id)}/status`);
          if (sr.status === 200 && sr.data?.services) {
            const services = Array.isArray(sr.data.services) ? sr.data.services : [];
            allNodes[id]._svcTotal = services.length;
            allNodes[id]._svcRunning = services.filter(s => s.containerStatus?.[0]?.state === 'running').length;
          }
        } catch (_) {}
      }));
      return res.json({ nodes: allNodes, lastIndex: 0 });
    }
    const org = requestedOrg || s.orgId;
    const { status, data } = await exch(s, 'GET', `/orgs/${org}/nodes`);
    if (status === 200 && data?.nodes) {
      await Promise.allSettled(Object.keys(data.nodes).map(async (id) => {
        try {
          const sr = await exch(s, 'GET', `/orgs/${org}/nodes/${encodeURIComponent(id)}/status`);
          if (sr.status === 200 && sr.data?.services) {
            const services = Array.isArray(sr.data.services) ? sr.data.services : [];
            data.nodes[id]._svcTotal = services.length;
            data.nodes[id]._svcRunning = services.filter(s => s.containerStatus?.[0]?.state === 'running').length;
          }
        } catch (_) {}
      }));
    }
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// Upsert node (create or update). Exchange uses PUT for node creation.
// Frontend sends bare nodeId in path + org via ?org= query param.
app.put('/api/nodes/:id', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const nodeId = decodeURIComponent(req.params.id);
    const { status, data } = await exch(s, 'PUT', `/orgs/${org}/nodes/${nodeId}`, req.body);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.patch('/api/nodes/:id', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const nodeId = decodeURIComponent(req.params.id);
    const cleanId = stripOrg(org, nodeId);
    const body = { ...req.body };
    if (body.pattern && !body.pattern.includes('/')) {
      body.pattern = `${org}/${body.pattern}`;
    }
    const auth = req.headers['x-root-auth'] || s.auth;
    const { status, data } = await exch({ ...s, auth }, 'PATCH', `/orgs/${org}/nodes/${cleanId}`, body);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.delete('/api/nodes/:id', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const nodeId = decodeURIComponent(req.params.id);
    const cleanId = stripOrg(org, nodeId);
    const { status, data } = await exch(s, 'DELETE', `/orgs/${org}/nodes/${cleanId}`);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.get('/api/nodes/:id/services', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const nodeId = stripOrg(org, decodeURIComponent(req.params.id));
    const { status, data } = await exch(s, 'GET', `/orgs/${org}/nodes/${nodeId}/status`);
    const services = data?.services ?? [];
    res.json({ services: Array.isArray(services) ? services : [] });
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.get('/api/nodes/:id/policy', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const nodeId = stripOrg(org, decodeURIComponent(req.params.id));
    const { status, data } = await exch(s, 'GET', `/orgs/${org}/nodes/${nodeId}/policy`);
    if (status === 404) return res.json({ properties: [], constraints: [] });
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.put('/api/nodes/:id/policy', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const nodeId = stripOrg(org, decodeURIComponent(req.params.id));
    const body = { ...req.body };
    delete body.lastUpdated;
    const { status, data } = await exch(s, 'PUT', `/orgs/${org}/nodes/${nodeId}/policy`, body);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.get('/api/nodes/:id/agreements', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const nodeId = stripOrg(org, decodeURIComponent(req.params.id));
    const { status, data } = await exch(s, 'GET', `/orgs/${org}/nodes/${nodeId}/agreements`);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.get('/api/nodes/:id/errors', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const nodeId = stripOrg(org, decodeURIComponent(req.params.id));
    const { status, data } = await exch(s, 'GET', `/orgs/${org}/nodes/${nodeId}/errors`);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.get('/api/nodes/:id/managementStatus', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const nodeId = stripOrg(org, decodeURIComponent(req.params.id));
    const { status, data } = await exch(s, 'GET', `/orgs/${org}/nodes/${nodeId}/managementStatus`);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// ==============================================
// Node Search Routes
// ==============================================

// Search nodes by service
app.post('/api/search/nodes/service', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const { status, data } = await exch(s, 'POST', `/orgs/${org}/search/nodes/service`, req.body);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// Search nodes by error
app.post('/api/search/nodes/error', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const { status, data } = await exch(s, 'POST', `/orgs/${org}/search/nodes/error`, req.body);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// Get all node errors
app.get('/api/search/nodes/error/all', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const { status, data } = await exch(s, 'GET', `/orgs/${org}/search/nodes/error/all`);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// Search node health
app.post('/api/search/nodehealth', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    console.log('[SEARCH-HEALTH] org:', org, 'body:', JSON.stringify(req.body));
    const { status, data } = await exch(s, 'POST', `/orgs/${org}/search/nodehealth`, req.body);
    console.log('[SEARCH-HEALTH] result:', status, JSON.stringify(data).substring(0, 300));
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// Node status CRUD
app.get('/api/nodes/:id/status', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const nodeId = stripOrg(org, decodeURIComponent(req.params.id));
    const { status, data } = await exch(s, 'GET', `/orgs/${org}/nodes/${nodeId}/status`);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.put('/api/nodes/:id/status', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const nodeId = stripOrg(org, decodeURIComponent(req.params.id));
    const { status, data } = await exch(s, 'PUT', `/orgs/${org}/nodes/${nodeId}/status`, req.body);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.delete('/api/nodes/:id/status', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const nodeId = stripOrg(org, decodeURIComponent(req.params.id));
    const { status, data } = await exch(s, 'DELETE', `/orgs/${org}/nodes/${nodeId}/status`);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// Node error management
app.put('/api/nodes/:id/errors', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const nodeId = stripOrg(org, decodeURIComponent(req.params.id));
    const { status, data } = await exch(s, 'PUT', `/orgs/${org}/nodes/${nodeId}/errors`, req.body);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.delete('/api/nodes/:id/errors', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const nodeId = stripOrg(org, decodeURIComponent(req.params.id));
    const { status, data } = await exch(s, 'DELETE', `/orgs/${org}/nodes/${nodeId}/errors`);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// Node services config state
app.post('/api/nodes/:id/services_configstate', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const nodeId = stripOrg(org, decodeURIComponent(req.params.id));
    const { status, data } = await exch(s, 'POST', `/orgs/${org}/nodes/${nodeId}/services_configstate`, req.body);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// Node heartbeat
app.post('/api/nodes/:id/heartbeat', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const nodeId = stripOrg(org, decodeURIComponent(req.params.id));
    const { status, data } = await exch(s, 'POST', `/orgs/${org}/nodes/${nodeId}/heartbeat`);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// ==============================================
// Deployment Policy Search
// ==============================================

app.post('/api/policies/:id/search', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const policyId = stripOrg(org, decodeURIComponent(req.params.id));
    const { status, data } = await exch(s, 'POST', `/orgs/${org}/business/policies/${policyId}/search`, req.body);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// ==============================================
// Pattern Search
// ==============================================

app.post('/api/patterns/:id/search', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const patternId = stripOrg(org, decodeURIComponent(req.params.id));
    const { status, data } = await exch(s, 'POST', `/orgs/${org}/patterns/${patternId}/search`, req.body);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// ==============================================
// Agbot Routes
// ==============================================

app.post('/api/agbots/:id/heartbeat', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const agbotId = stripOrg(org, decodeURIComponent(req.params.id));
    const { status, data } = await exch(s, 'POST', `/orgs/${org}/agbots/${agbotId}/heartbeat`);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.get('/api/agbots/:id/msgs', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const agbotId = stripOrg(org, decodeURIComponent(req.params.id));
    const { status, data } = await exch(s, 'GET', `/orgs/${org}/agbots/${agbotId}/msgs`);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.post('/api/agbots/:id/msgs', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const agbotId = stripOrg(org, decodeURIComponent(req.params.id));
    const { status, data } = await exch(s, 'POST', `/orgs/${org}/agbots/${agbotId}/msgs`, req.body);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// ==============================================
// Changes / Notification Framework
// ==============================================

app.post('/api/changes', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const { status, data } = await exch(s, 'POST', `/orgs/${org}/changes`, req.body);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.get('/api/changes/maxchangeid', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  try {
    const { status, data } = await exch(s, 'GET', '/changes/maxchangeid');
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// ==============================================
// My Orgs
// ==============================================

app.post('/api/myorgs', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  try {
    const { status, data } = await exch(s, 'POST', '/myorgs');
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// ==============================================
// Services Routes
// ==============================================

app.get('/api/services', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const requestedOrg = req.query.org;
  const auth = req.headers['x-agbot-auth'] || s.auth;
  try {
    const sess = { ...s, auth };
    // Platform with no org specified: aggregate from all non-root orgs
    if (s.role === 'platform' && !requestedOrg) {
      let allServices = {};
      try {
        const orgRes = await exch(sess, 'GET', '/orgs');
        if (orgRes.status === 200) {
          const orgs = Object.keys(orgRes.data?.orgs ?? {}).filter((o) => o !== 'root');
          await Promise.all(orgs.map(async (org) => {
            try {
              const r = await exch(sess, 'GET', `/orgs/${org}/services`);
              if (r.status === 200 && r.data?.services) {
                Object.assign(allServices, r.data.services);
              }
            } catch (_) {}
          }));
        }
      } catch (_) {}
      return res.json({ services: allServices });
    }
    const org = requestedOrg || s.orgId;
    const { status, data } = await exch(sess, 'GET', `/orgs/${org}/services`);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// exchRaw — sends body as-is (no JSON.stringify), used for binary/text public key upload to Exchange
async function exchRaw(session, method, path, body, contentType) {
  const url = `${session.baseURL}/v1${path}`;
  const r = await fetch(url, {
    method,
    headers: {
      Authorization: `Basic ${session.auth}`,
      'Content-Type': contentType || 'application/json',
    },
    body,
  });
  const text = await r.text();
  try { return { status: r.status, data: JSON.parse(text) }; }
  catch { return { status: r.status, data: text }; }
}

app.post('/api/services', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  // Partner is locked to its own org. Platform may target any non-root org via ?org=,
  // otherwise it falls back to the login org (root) to avoid silently writing to root.
  const targetOrg = s.role === 'partner'
    ? s.orgId
    : (req.query.org && req.query.org !== 'root' ? req.query.org : s.orgId);
  try {
    const body = serviceBody(req.body);

    if (body.deployment && typeof body.deployment !== 'string') {
      body.deployment = JSON.stringify(body.deployment);
    }

    // Step 1: sign the deployment JSON with RSA-PSS SHA-256, producing signature + public key
    if (body.deployment) {
      const { deploymentSignature, publicKey } = genAndSign(body.deployment);
      body.deploymentSignature = deploymentSignature;

      // Step 2: create service in Exchange
      const { status, data } = await exch(s, 'POST', `/orgs/${targetOrg}/services`, body);
      // Step 3: if creation succeeded, upload the public key so agents can verify signatures
      if (status === 201 && data && data.code === 'ok') {
        const svcId = `${targetOrg}/${body.url}_${body.version}_${body.arch}`;
        await exchRaw(s, 'PUT', `/orgs/${targetOrg}/services/${encodeURIComponent(svcId)}/keys/default.public.key`, publicKey, 'text/plain');
      }
      res.status(status).json(data);
      return;
    }

    const { status, data } = await exch(s, 'POST', `/orgs/${targetOrg}/services`, body);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.put('/api/services/:id', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  try {
    const svcName = decodeURIComponent(req.params.id);
    const org = req.query.org || s.orgId;
    const svcId = `${org}/${svcName}`;
    const body = serviceBody(req.body);

    // Inject url/version/arch from the URL path to avoid Exchange validation mismatch.
    // The Exchange derives these from the service ID in the PUT path and requires them to
    // match the body fields. Take them from the path so they always agree.
    const parsed = parseServiceId(svcName);
    if (parsed.url) body.url = parsed.url;
    if (parsed.version) body.version = parsed.version;
    if (parsed.arch) body.arch = parsed.arch;

    if (body.deployment && typeof body.deployment !== 'string') {
      body.deployment = JSON.stringify(body.deployment);
    }

    // Re-sign deployment on every PUT — Exchange requires a valid signature matching the uploaded public key
    if (body.deployment) {
      const { deploymentSignature, publicKey } = genAndSign(body.deployment);
      body.deploymentSignature = deploymentSignature;

      const { status, data } = await exch(s, 'PUT', `/orgs/${org}/services/${svcName}`, body);
      // Exchange returns varied success messages; check for 'ok' or 'updated' heuristically
      if (data && typeof data === 'object' && data.msg && (data.msg === 'ok' || String(data.msg).includes('updated'))) {
        await exchRaw(s, 'PUT', `/orgs/${org}/services/${encodeURIComponent(svcId)}/keys/default.public.key`, publicKey, 'text/plain');
      }
      res.status(status).json(data);
      return;
    }

    const { status, data } = await exch(s, 'PUT', `/orgs/${org}/services/${svcName}`, body);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.delete('/api/services/:id', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  try {
    const svcName = decodeURIComponent(req.params.id);
    const org = req.query.org || s.orgId;
    const { status, data } = await exch(s, 'DELETE', `/orgs/${org}/services/${svcName}`);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// -- Service keys --
app.get('/api/services/:id/keys', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  try {
    const svcName = decodeURIComponent(req.params.id);
    const org = req.query.org || s.orgId;
    const { status, data } = await exch(s, 'GET', `/orgs/${org}/services/${svcName}/keys`);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.post('/api/services/:id/keys', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  try {
    const svcName = decodeURIComponent(req.params.id);
    const org = req.query.org || s.orgId;
    const { keyId, key } = req.body;
    const { status, data } = await exchRaw(s, 'PUT', `/orgs/${org}/services/${svcName}/keys/${keyId}`, key, 'text/plain');
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.delete('/api/services/:id/keys/:keyId', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  try {
    const svcName = decodeURIComponent(req.params.id);
    const org = req.query.org || s.orgId;
    const { status, data } = await exch(s, 'DELETE', `/orgs/${org}/services/${svcName}/keys/${req.params.keyId}`);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// -- Service docker auths --
app.get('/api/services/:id/dockauths', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  try {
    const svcName = decodeURIComponent(req.params.id);
    const org = req.query.org || s.orgId;
    const { status, data } = await exch(s, 'GET', `/orgs/${org}/services/${svcName}/dockauths`);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.post('/api/services/:id/dockauths', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  try {
    const svcName = decodeURIComponent(req.params.id);
    const org = req.query.org || s.orgId;
    const body = sanitizeBody(req.body);
    const { status, data } = await exch(s, 'POST', `/orgs/${org}/services/${svcName}/dockauths`, body);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.delete('/api/services/:id/dockauths/:authId', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  try {
    const svcName = decodeURIComponent(req.params.id);
    const org = req.query.org || s.orgId;
    const { status, data } = await exch(s, 'DELETE', `/orgs/${org}/services/${svcName}/dockauths/${req.params.authId}`);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// ==============================================
// Patterns Routes
// ==============================================

app.get('/api/patterns', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const requestedOrg = req.query.org;
  const auth = req.headers['x-agbot-auth'] || s.auth;
  try {
    const sess = { ...s, auth };
    if (s.role === 'platform' && !requestedOrg) {
      let allPatterns = {};
      try {
        const orgRes = await exch(sess, 'GET', '/orgs');
        if (orgRes.status === 200) {
          const orgs = Object.keys(orgRes.data?.orgs ?? {}).filter((o) => o !== 'root');
          await Promise.all(orgs.map(async (org) => {
            try {
              const r = await exch(sess, 'GET', `/orgs/${org}/deployment/patterns`);
              if (r.status === 200 && r.data?.patterns) {
                Object.assign(allPatterns, r.data.patterns);
              }
            } catch (_) {}
          }));
        }
      } catch (_) {}
      return res.json({ patterns: allPatterns });
    }
    const org = requestedOrg || s.orgId;
    const { status, data } = await exch(sess, 'GET', `/orgs/${org}/deployment/patterns`);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.post('/api/patterns', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const targetOrg = s.role === 'partner'
    ? s.orgId
    : (req.query.org && req.query.org !== 'root' ? req.query.org : s.orgId);
  try {
    const { name, ...rest } = req.body;
    const body = patternBody(rest);
    const { status, data } = await exch(s, 'POST', `/orgs/${targetOrg}/deployment/patterns/${name}`, body);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.put('/api/patterns/:id', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const patId = stripOrg(org, decodeURIComponent(req.params.id));
    const body = patternBody(req.body);
    const { status, data } = await exch(s, 'PUT', `/orgs/${org}/deployment/patterns/${patId}`, body);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.delete('/api/patterns/:id', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const patId = stripOrg(org, decodeURIComponent(req.params.id));
    const { status, data } = await exch(s, 'DELETE', `/orgs/${org}/deployment/patterns/${patId}`);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.post('/api/patterns/:id/nodehealth', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const patId = stripOrg(org, decodeURIComponent(req.params.id));
    const { status, data } = await exch(s, 'POST', `/orgs/${org}/patterns/${patId}/nodehealth`, req.body);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// ==============================================
// Deployment Policies Routes
// ==============================================

app.get('/api/policies', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const requestedOrg = req.query.org;
  const auth = req.headers['x-agbot-auth'] || s.auth;
  try {
    const sess = { ...s, auth };
    if (s.role === 'platform' && !requestedOrg) {
      let allPolicies = {};
      try {
        const orgRes = await exch(sess, 'GET', '/orgs');
        if (orgRes.status === 200) {
          const orgs = Object.keys(orgRes.data?.orgs ?? {}).filter((o) => o !== 'root');
          await Promise.all(orgs.map(async (org) => {
            try {
              const r = await exch(sess, 'GET', `/orgs/${org}/deployment/policies`);
              if (r.status === 200 && r.data?.businessPolicy) {
                Object.assign(allPolicies, r.data.businessPolicy);
              }
            } catch (_) {}
          }));
        }
      } catch (_) {}
      return res.json({ businessPolicy: allPolicies });
    }
    const org = requestedOrg || s.orgId;
    const { status, data } = await exch(sess, 'GET', `/orgs/${org}/deployment/policies`);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.post('/api/policies', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const targetOrg = s.role === 'partner'
    ? s.orgId
    : (req.query.org && req.query.org !== 'root' ? req.query.org : s.orgId);
  try {
    const { name, ...rest } = req.body;
    const body = sanitizeBody(rest);
    const { status, data } = await exch(s, 'POST', `/orgs/${targetOrg}/deployment/policies/${name}`, body);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.put('/api/policies/:id', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const polId = stripOrg(org, decodeURIComponent(req.params.id));
    const body = sanitizeBody(req.body);
    const { status, data } = await exch(s, 'PUT', `/orgs/${org}/deployment/policies/${polId}`, body);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.delete('/api/policies/:id', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const polId = stripOrg(org, decodeURIComponent(req.params.id));
    const { status, data } = await exch(s, 'DELETE', `/orgs/${org}/deployment/policies/${polId}`);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// ==============================================
// Management Policies Routes
// ==============================================

app.get('/api/mgmtpolicies', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const { status, data } = await exch(s, 'GET', `/orgs/${org}/managementpolicies`);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.post('/api/mgmtpolicies', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const { name, ...rest } = req.body;
    const body = sanitizeBody(rest);
    const { status, data } = await exch(s, 'POST', `/orgs/${org}/managementpolicies/${name}`, body);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.put('/api/mgmtpolicies/:id', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const mgmtId = stripOrg(org, decodeURIComponent(req.params.id));
    const body = sanitizeBody(req.body);
    const { status, data } = await exch(s, 'PUT', `/orgs/${org}/managementpolicies/${mgmtId}`, body);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.delete('/api/mgmtpolicies/:id', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const mgmtId = stripOrg(org, decodeURIComponent(req.params.id));
    const { status, data } = await exch(s, 'DELETE', `/orgs/${org}/managementpolicies/${mgmtId}`);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// ==============================================
// Catalog Routes
// ==============================================

app.get('/api/catalog-services', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  try {
    const { status, data } = await exch(s, 'GET', '/catalog/services');
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.get('/api/catalog-patterns', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  try {
    const { status, data } = await exch(s, 'GET', '/catalog/patterns');
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// ==============================================
// Agbots Routes
// ==============================================

function agbotSess(req, res) {
  const s = session(req);
  if (!s) { res.status(401).json({ msg: 'Not logged in' }); return null; }
  // If the request carries root-level agbot auth, override the session
  const agbotAuth = req.headers['x-agbot-auth'];
  if (agbotAuth) {
    return { ...s, auth: agbotAuth };
  }
  return s;
}

function agbotOrg(req, s) {
  // Platform may target any org via ?org= query param; partner uses their own org.
  if (s.role === 'platform') return req.query.org || s.orgId;
  return s.orgId;
}

app.post('/api/agbots/admin-login', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  try {
    const { user, password } = req.body;
    const auth = Buffer.from(`${user}:${password}`).toString('base64');
    const r = await fetch(`${s.baseURL}/v1/orgs/${user.split('/')[0]}/agbots`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!r.ok && r.status !== 404) return res.status(403).json({ msg: '认证失败' });
    res.json({ auth });
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.get('/api/agbots', async (req, res) => {
  const s = agbotSess(req, res);
  if (!s) return;
  try {
    const requestedOrg = req.query.org;
    // Platform with no org specified: aggregate from all non-root orgs
    if (s.role === 'platform' && !requestedOrg) {
      let allAgbots = {};
      let maxIndex = 0;
      try {
        const orgRes = await exch(s, 'GET', '/orgs');
        if (orgRes.status === 200) {
          const orgs = Object.keys(orgRes.data?.orgs ?? {}).filter((o) => o !== 'root');
          await Promise.all(orgs.map(async (org) => {
            try {
              const r = await exch(s, 'GET', `/orgs/${org}/agbots`);
              if (r.status === 200 && r.data?.agbots) {
                Object.assign(allAgbots, r.data.agbots);
                maxIndex = Math.max(maxIndex, r.data.lastIndex || 0);
              }
            } catch (_) {}
          }));
        }
      } catch (_) {}
      return res.json({ agbots: allAgbots, lastIndex: maxIndex });
    }
    const org = requestedOrg || s.orgId;
    const { status, data } = await exch(s, 'GET', `/orgs/${org}/agbots`);
    let merged = data;
    // Cross-org IBM agbot visibility is a platform-only capability.
    if (s.role === 'platform' && org !== 'IBM') {
      try {
        const ibmRes = await exch(s, 'GET', '/orgs/IBM/agbots');
        if (ibmRes.status === 200) {
          const ibmAgbots = ibmRes.data?.agbots || {};
          merged = {
            ...merged,
            agbots: { ...(merged?.agbots || {}), ...ibmAgbots },
            lastIndex: Math.max(merged?.lastIndex || 0, ibmRes.data?.lastIndex || 0),
          };
        }
      } catch (_) { /* ignore cross-org errors */ }
    }
    res.status(ok(status, data)).json(merged);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.put('/api/agbots/:id', async (req, res) => {
  const s = agbotSess(req, res);
  if (!s) return;
  try {
    const org = agbotOrg(req, s);
    const { org: realOrg, id: agbotId } = agbotIdAndOrg(org, decodeURIComponent(req.params.id));
    const { status, data } = await exch(s, 'PUT', `/orgs/${realOrg}/agbots/${agbotId}`, req.body);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.patch('/api/agbots/:id', async (req, res) => {
  const s = agbotSess(req, res);
  if (!s) return;
  try {
    const org = agbotOrg(req, s);
    const { org: realOrg, id: agbotId } = agbotIdAndOrg(org, decodeURIComponent(req.params.id));
    const { status, data } = await exch(s, 'PATCH', `/orgs/${realOrg}/agbots/${agbotId}`, req.body);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.delete('/api/agbots/:id', async (req, res) => {
  const s = agbotSess(req, res);
  if (!s) return;
  try {
    const org = agbotOrg(req, s);
    const { org: realOrg, id: agbotId } = agbotIdAndOrg(org, decodeURIComponent(req.params.id));
    const { status, data } = await exch(s, 'DELETE', `/orgs/${realOrg}/agbots/${agbotId}`);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// -- Agbot Patterns --
app.get('/api/agbots/:id/patterns', async (req, res) => {
  const s = agbotSess(req, res);
  if (!s) return;
  try {
    const org = agbotOrg(req, s);
    const { org: realOrg, id: agbotId } = agbotIdAndOrg(org, decodeURIComponent(req.params.id));
    const { status, data } = await exch(s, 'GET', `/orgs/${realOrg}/agbots/${agbotId}/patterns`);
    // Partners only see bindings that reference their own org.
    if (s.role !== 'platform' && data && data.patterns) {
      data.patterns = Object.fromEntries(
        Object.entries(data.patterns).filter(([, v]) => v && v.patternOrgid === s.orgId),
      );
    }
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.post('/api/agbots/:id/patterns', async (req, res) => {
  const s = agbotSess(req, res);
  if (!s) return;
  try {
    const org = agbotOrg(req, s);
    const { org: realOrg, id: agbotId } = agbotIdAndOrg(org, decodeURIComponent(req.params.id));
    // nodeOrgid tells the agbot which org's nodes to target; fall back to patternOrgid then session org
    const body = { ...req.body, nodeOrgid: req.body.nodeOrgid || req.body.patternOrgid || s.orgId };
    const { status, data } = await exch(s, 'POST', `/orgs/${realOrg}/agbots/${agbotId}/patterns`, body);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.delete('/api/agbots/:id/patterns/:patternId', async (req, res) => {
  const s = agbotSess(req, res);
  if (!s) return;
  try {
    const org = agbotOrg(req, s);
    const { org: realOrg, id: agbotId } = agbotIdAndOrg(org, decodeURIComponent(req.params.id));
    const { status, data } = await exch(s, 'DELETE', `/orgs/${realOrg}/agbots/${agbotId}/patterns/${req.params.patternId}`);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// -- Agbot Business Policies --
app.get('/api/agbots/:id/businesspols', async (req, res) => {
  const s = agbotSess(req, res);
  if (!s) return;
  try {
    const org = agbotOrg(req, s);
    const { org: realOrg, id: agbotId } = agbotIdAndOrg(org, decodeURIComponent(req.params.id));
    const { status, data } = await exch(s, 'GET', `/orgs/${realOrg}/agbots/${agbotId}/businesspols`);
    // Partners only see bindings that reference their own org.
    if (s.role !== 'platform' && data && data.businessPols) {
      data.businessPols = Object.fromEntries(
        Object.entries(data.businessPols).filter(([, v]) => v && v.businessPolOrgid === s.orgId),
      );
    }
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.post('/api/agbots/:id/businesspols', async (req, res) => {
  const s = agbotSess(req, res);
  if (!s) return;
  try {
    const org = agbotOrg(req, s);
    const { org: realOrg, id: agbotId } = agbotIdAndOrg(org, decodeURIComponent(req.params.id));
    // nodeOrgid tells the agbot which org's nodes to target; fall back to businessPolOrgid then session org
    const body = { ...req.body, nodeOrgid: req.body.nodeOrgid || req.body.businessPolOrgid || s.orgId };
    const { status, data } = await exch(s, 'POST', `/orgs/${realOrg}/agbots/${agbotId}/businesspols`, body);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.delete('/api/agbots/:id/businesspols/:polId', async (req, res) => {
  const s = agbotSess(req, res);
  if (!s) return;
  try {
    const org = agbotOrg(req, s);
    const { org: realOrg, id: agbotId } = agbotIdAndOrg(org, decodeURIComponent(req.params.id));
    const { status, data } = await exch(s, 'DELETE', `/orgs/${realOrg}/agbots/${agbotId}/businesspols/${req.params.polId}`);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.get('/api/agbots/:id/agreements', async (req, res) => {
  const s = agbotSess(req, res);
  if (!s) return;
  try {
    const org = agbotOrg(req, s);
    const { org: realOrg, id: agbotId } = agbotIdAndOrg(org, decodeURIComponent(req.params.id));
    const { status, data } = await exch(s, 'GET', `/orgs/${realOrg}/agbots/${agbotId}/agreements`);
    // Partners only see agreements targeting nodes in their own org.
    if (s.role !== 'platform' && data && data.agreements) {
      data.agreements = Object.fromEntries(
        Object.entries(data.agreements).filter(([, v]) => !v?.nodeOrgid || v.nodeOrgid === s.orgId),
      );
    }
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// ==============================================
// Audit Log Route — read-only, returns last N entries from audit.log
// ==============================================

app.get('/api/audit', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
    const offset = parseInt(req.query.offset) || 0;
    const search = (req.query.search || '').trim();
    let sql = 'SELECT id, ts, actor_type, actor, org, method, path, status, ip, ms, proxied_to, detail FROM audit_log WHERE 1=1';
    const params = [];
    let pi = 1;
    // Partners see only their own org's records; platform may filter by org.
    if (s.role !== 'platform') {
      sql += ` AND (org = $${pi} OR actor = $${pi})`;
      params.push(s.orgId);
      pi++;
    } else if (req.query.org) {
      sql += ` AND org = $${pi}`;
      params.push(req.query.org);
      pi++;
    }
    if (search) {
      sql += ` AND (actor ILIKE $${pi} OR path ILIKE $${pi} OR proxied_to ILIKE $${pi} OR method ILIKE $${pi})`;
      params.push(`%${search}%`);
      pi++;
    }
    sql += ` ORDER BY ts DESC LIMIT $${pi} OFFSET $${pi + 1}`;
    params.push(limit, offset);
    const { rows } = await db.query(sql, params);
    res.json({ entries: rows });
  } catch (e) { res.status(500).json({ msg: e.message }); }
});

// ==============================================
// Agent File Version Routes
// ==============================================

app.get('/api/agentfileversion', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  try {
    const { status, data } = await exch(s, 'GET', `/orgs/${s.orgId}/AgentFileVersion`);
    // Exchange may reject this org (400); return empty data gracefully in that case
    if (status === 400) return res.json({});
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.put('/api/agentfileversion', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  try {
    const { status, data } = await exch(s, 'PUT', `/orgs/${s.orgId}/AgentFileVersion`, sanitizeBody(req.body));
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.delete('/api/agentfileversion', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  try {
    const { status, data } = await exch(s, 'DELETE', `/orgs/${s.orgId}/AgentFileVersion`);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// ==============================================
// HA Groups Routes
// ==============================================

app.get('/api/hagroups', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const { status, data } = await exch(s, 'GET', `/orgs/${org}/hagroups`);
    const arr = data?.nodeGroups ?? [];
    const groups = Array.isArray(arr) ? Object.fromEntries(arr.map((g) => [g.name, g])) : (arr || {});
    res.status(ok(status, data)).json({ hagroups: groups });
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.get('/api/hagroups/:id', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const hgId = stripOrg(org, decodeURIComponent(req.params.id));
    const { status, data } = await exch(s, 'GET', `/orgs/${org}/hagroups/${hgId}`);
    res.status(ok(status, data)).json({ hagroup: data });
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.post('/api/hagroups/:id', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const hgId = stripOrg(org, decodeURIComponent(req.params.id));
    const body = { ...req.body };
    delete body.name;
    const { status, data } = await exch(s, 'POST', `/orgs/${org}/hagroups/${hgId}`, body);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.delete('/api/hagroups/:id', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const hgId = stripOrg(org, decodeURIComponent(req.params.id));
    const { status, data } = await exch(s, 'DELETE', `/orgs/${org}/hagroups/${hgId}`);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.put('/api/hagroups/:id/nodes/:nodeId', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const hgId = stripOrg(org, decodeURIComponent(req.params.id));
    const nodeId = stripOrg(org, decodeURIComponent(req.params.nodeId));
    const { status, data } = await exch(s, 'PUT', `/orgs/${org}/hagroups/${hgId}/nodes/${nodeId}`);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.delete('/api/hagroups/:id/nodes/:nodeId', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const hgId = stripOrg(org, decodeURIComponent(req.params.id));
    const nodeId = stripOrg(org, decodeURIComponent(req.params.nodeId));
    const { status, data } = await exch(s, 'DELETE', `/orgs/${org}/hagroups/${hgId}/nodes/${nodeId}`);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// ==============================================
// Secrets Management Routes
// ==============================================

app.get('/api/secrets', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  // Secrets are managed by the Secrets Manager (Vault/OpenBao), not the Exchange API.
  // Return empty list since Exchange does not have a secrets endpoint.
  res.json({ secrets: {} });
});

app.post('/api/secrets', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  res.status(400).json({ msg: 'Secrets must be managed via the Secrets Manager (hzn secretsmanager), not the Exchange API' });
});

app.delete('/api/secrets/:name', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  res.status(400).json({ msg: 'Secrets must be managed via the Secrets Manager (hzn secretsmanager), not the Exchange API' });
});

// ==============================================
// Service Instances Routes
// Service instances in Open Horizon are node-level, retrieved via /nodes/:id/services
// The Exchange API does not have a standalone /service-instances endpoint.
// ==============================================

app.get('/api/service-instances', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  try {
    // Determine orgs to query
    let orgs = [s.orgId];
    if (s.role === 'platform') {
      try {
        const orgRes = await exch(s, 'GET', '/orgs');
        if (orgRes.status === 200) {
          orgs = Object.keys(orgRes.data?.orgs ?? {}).filter((o) => o !== 'root');
        }
      } catch {}
    }
    
    // Get all nodes from all orgs, then fetch services for each node
    const instances = {};
    
    await Promise.all(orgs.map(async (org) => {
      try {
        const nodesRes = await exch(s, 'GET', `/orgs/${org}/nodes`);
        if (nodesRes.status !== 200 || !nodesRes.data?.nodes) return;
        
        const nodeIds = Object.keys(nodesRes.data.nodes);
        await Promise.all(nodeIds.map(async (nodeId) => {
          try {
            const svcRes = await exch(s, 'GET', `/orgs/${org}/nodes/${encodeURIComponent(nodeId)}/status`);
            if (svcRes.status === 200 && svcRes.data?.services) {
              const services = svcRes.data.services;
              // Services can be an array or an object keyed by service URL
              let serviceEntries = [];
              if (Array.isArray(services)) {
                serviceEntries = services.map((s, i) => {
                  const key = s.url || s.serviceUrl || s.name || `service-${i}`;
                  return [key, s];
                });
              } else if (typeof services === 'object') {
                serviceEntries = Object.entries(services);
              }
              
              serviceEntries.forEach(([svcKey, svcData]) => {
                const instanceId = `${nodeId}/${svcKey}`;
                const containerState = Array.isArray(svcData.containerStatus) && svcData.containerStatus.length > 0
                  ? svcData.containerStatus[0].state
                  : '';
                instances[instanceId] = {
                  id: instanceId,
                  node_id: nodeId,
                  orgid: org,
                  service_url: svcData.serviceUrl || svcData.url || svcKey,
                  service_version: svcData.version || '',
                  service_arch: svcData.arch || '',
                  agreement_id: svcData.agreementId || svcData.agreement_id || '',
                  state: containerState,
                  containerStatus: svcData.containerStatus || [],
                  ...svcData,
                };
              });
            }
          } catch {}
        }));
      } catch {}
    }));
    
    res.json(instances);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.get('/api/service-instances/:id', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  try {
    const instanceId = decodeURIComponent(req.params.id);
    const parts = instanceId.split('/');
    if (parts.length < 2) {
      return res.status(400).json({ msg: 'Invalid instance ID format. Expected: nodeId/serviceKey' });
    }
    const nodeId = parts[0];
    const svcKey = parts.slice(1).join('/');
    const org = req.query.org || s.orgId;
    
    const { status, data } = await exch(s, 'GET', `/orgs/${org}/nodes/${encodeURIComponent(nodeId)}/services/${encodeURIComponent(svcKey)}`);
    if (status === 200 && data) {
      res.json({ id: instanceId, node_id: nodeId, orgid: org, service_url: svcKey, ...data });
    } else {
      res.status(status).json(data);
    }
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.delete('/api/service-instances/:id', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  try {
    const instanceId = decodeURIComponent(req.params.id);
    const parts = instanceId.split('/');
    if (parts.length < 2) {
      return res.status(400).json({ msg: 'Invalid instance ID format' });
    }
    const nodeId = parts[0];
    const svcKey = parts.slice(1).join('/');
    const org = req.query.org || s.orgId;
    
    const { status, data } = await exch(s, 'DELETE', `/orgs/${org}/nodes/${encodeURIComponent(nodeId)}/services/${encodeURIComponent(svcKey)}`);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// ==============================================
// Bulk Node Operations
// ==============================================

app.post('/api/nodes/bulk/delete', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const { nodeIds } = req.body;
    if (!Array.isArray(nodeIds) || nodeIds.length === 0) return res.status(400).json({ msg: 'No node IDs provided' });
    const results = await Promise.all(nodeIds.map(async (rawId) => {
      const nodeId = stripOrg(org, rawId);
      try {
        const { status, data } = await exch(s, 'DELETE', `/orgs/${org}/nodes/${nodeId}`);
        return { id: nodeId, ok: status >= 200 && status < 300, status, msg: data?.msg };
      } catch (e) { return { id: nodeId, ok: false, msg: e.message }; }
    }));
    res.json({ results });
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.post('/api/nodes/bulk/set-pattern', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const { nodeIds, pattern } = req.body;
    if (!Array.isArray(nodeIds) || nodeIds.length === 0) return res.status(400).json({ msg: 'No node IDs provided' });
    if (!pattern) return res.status(400).json({ msg: 'No pattern specified' });
    const auth = req.headers['x-root-auth'] || s.auth;
    const sess = { ...s, auth };
    const fullPattern = pattern.includes('/') ? pattern : `${org}/${pattern}`;
    const results = await Promise.all(nodeIds.map(async (rawId) => {
      const nodeId = stripOrg(org, rawId);
      try {
        const { status, data } = await exch(sess, 'PATCH', `/orgs/${org}/nodes/${nodeId}`, { pattern: fullPattern });
        return { id: nodeId, ok: status >= 200 && status < 300, status, msg: data?.msg };
      } catch (e) { return { id: nodeId, ok: false, msg: e.message }; }
    }));
    res.json({ results });
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// ==============================================
// Node Owner Transfer
// ==============================================

app.post('/api/nodes/:id/transfer', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const nodeId = stripOrg(org, decodeURIComponent(req.params.id));
    const { targetOrg } = req.body;
    if (!targetOrg) return res.status(400).json({ msg: 'Target organization is required' });
    // Step 1: get current node data
    const getRes = await exch(s, 'GET', `/orgs/${org}/nodes/${nodeId}`);
    if (getRes.status !== 200 || !getRes.data?.nodes?.[nodeId]) {
      return res.status(404).json({ msg: 'Node not found' });
    }
    const nodeData = getRes.data.nodes[nodeId];
    // Step 2: create node in target org
    const createBody = { name: nodeData.name, nodeType: nodeData.nodeType, arch: nodeData.arch, pattern: nodeData.pattern };
    const createRes = await exch(s, 'PUT', `/orgs/${targetOrg}/nodes/${nodeId}`, createBody);
    if (createRes.status < 200 || createRes.status >= 300) {
      return res.status(createRes.status).json({ msg: `Failed to create node in target org: ${createRes.data?.msg || createRes.status}` });
    }
    // Step 3: delete from source org
    await exch(s, 'DELETE', `/orgs/${org}/nodes/${nodeId}`);
    logEvent('node.transfer', { nodeId, from: org, to: targetOrg }, org);
    res.json({ ok: true, msg: `Node ${nodeId} transferred from ${org} to ${targetOrg}` });
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// ==============================================
// Service Archiving
// ==============================================

app.post('/api/services/:id/archive', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const svcName = decodeURIComponent(req.params.id);
    const { status, data } = await exch(s, 'PUT', `/orgs/${org}/services/${svcName}`, { archived: true });
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.post('/api/services/:id/unarchive', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const svcName = decodeURIComponent(req.params.id);
    const { status, data } = await exch(s, 'PUT', `/orgs/${org}/services/${svcName}`, { archived: false });
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// ==============================================
// Organization Configuration (heartbeat, limits)
// ==============================================

app.put('/api/organizations/:orgid/config', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  try {
    const orgid = req.params.orgid;
    const body = {};
    if (req.body.description !== undefined) body.description = req.body.description;
    if (req.body.label !== undefined) body.label = req.body.label;
    if (req.body.heartbeatIntervals) body.heartbeatIntervals = req.body.heartbeatIntervals;
    if (req.body.limits) body.limits = req.body.limits;
    const { status, data } = await exch(s, 'PUT', `/orgs/${orgid}`, body);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// ==============================================
// NMP Status Detail
// ==============================================

app.get('/api/mgmtpolicies/:id/status', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const nmpId = stripOrg(org, decodeURIComponent(req.params.id));
    const { status, data } = await exch(s, 'GET', `/orgs/${org}/managementpolicies/${nmpId}/status`);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// ==============================================
// Service Upgrade Management
// ==============================================

app.post('/api/services/:id/upgrade', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const svcName = decodeURIComponent(req.params.id);
    const { auto_upgrade, active_upgrade } = req.body;
    const body = {};
    if (auto_upgrade !== undefined) body.auto_upgrade = auto_upgrade;
    if (active_upgrade !== undefined) body.active_upgrade = active_upgrade;
    const { status, data } = await exch(s, 'PUT', `/orgs/${org}/services/${svcName}`, body);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// Change password
app.post('/api/exchange-users/:username/changepw', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: 'Not logged in' });
  const org = req.query.org || s.orgId;
  try {
    const user = stripOrg(org, decodeURIComponent(req.params.username));
    const { newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ msg: 'newPassword is required' });
    const { status, data } = await exch(s, 'POST', `/orgs/${org}/users/${user}/changepw`, { newPassword });
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// ==============================================
// Node Registration Detector
// Periodically polls Exchange for node list of active sessions and logs
// newly-registered nodes to system.log
// ==============================================
const knownNodes = new Map(); // org -> Set of node ids

async function detectNodeRegistrations() {
  for (const sid in sessions) {
    const s = sessions[sid];
    if (!s || !s.orgId) continue;
    try {
      const { status, data } = await exch(s, 'GET', `/orgs/${s.orgId}/nodes`);
      if (status !== 200 || !data || !data.nodes) continue;
      const ids = Object.keys(data.nodes);
      const prev = knownNodes.get(s.orgId) || new Set();
      for (const id of ids) {
        if (!prev.has(id)) {
          // New node detected — log registration event
          const node = data.nodes[id];
          logEvent('node_register', {
            nodeId: id,
            name: node.name || '',
            arch: node.arch || '',
            nodeType: node.nodeType || '',
            pattern: node.pattern || '',
          }, s.orgId);
        }
      }
      knownNodes.set(s.orgId, new Set(ids));
    } catch (_) { /* ignore polling errors */ }
  }
}

// Run detector every 30 seconds
setInterval(detectNodeRegistrations, 30000);
detectNodeRegistrations();

// ==============================================
// Partner API (third-party, API-key auth, org-isolated)
// ==============================================
// Third parties call /api/v1/{org}/... with header X-Api-Key. The org is ALWAYS
// taken from the key binding; any ?org= or path override is ignored. Only a
// curated allowlist of per-org resources is proxied to Exchange.
const PARTNER_ALLOW = [
  '/status',
  '/services', '/patterns', '/business/policies', '/managementpolicies',
  '/nodes', '/users', '/hagroups', '/AgentFileVersion',
];
// Check if a request path is within the partner allowlist (exact match or first-segment prefix)
function partnerPathAllowed(p) {
  if (PARTNER_ALLOW.includes(p)) return true;
  return PARTNER_ALLOW.some((base) => p === base || p.startsWith(base + '/'));
}

// Partner API auth middleware: extract X-Api-Key, verify against stored keys (SHA-256),
// reject revoked/expired keys, inject req.partner with key binding info (org, keyId, label)
async function partnerAuth(req, res, next) {
  const key = req.headers['x-api-key'];
  if (!key) return res.status(401).json({ msg: 'Missing X-Api-Key header' });
  const rec = await db.findApiKeyByPlain(key);
  if (!rec) return res.status(401).json({ msg: 'Invalid API Key' });
  if (rec.revoked) return res.status(403).json({ msg: 'API Key revoked' });
  if (rec.expires_at && new Date(rec.expires_at) < new Date()) return res.status(403).json({ msg: 'API Key expired' });
  req.partner = { keyId: rec.id, org: rec.org, label: rec.label };
  next();
}

app.use('/api/v1/:org', partnerAuth, async (req, res) => {
  // Partner API is read-only (GET only).
  if (req.method !== 'GET') return res.status(403).json({ msg: 'Partner API only supports GET' });
  // Enforce key-bound org; reject any attempt to target a different org.
  if (req.params.org !== req.partner.org) {
    return res.status(403).json({ msg: 'Access denied' });
  }
  if (!partnerPathAllowed(req.path)) {
    return res.status(404).json({ msg: 'Path not found' });
  }
  if (!exchangeConfig.configured) return res.status(503).json({ msg: 'Exchange not configured' });
  try {
    const fakeSession = { baseURL: exchangeConfig.baseURL, auth: exchangeConfig.auth, orgId: req.partner.org };
    const exchPath = `/orgs/${req.partner.org}${req.path}`;
    const { status, data } = await exch(fakeSession, 'GET', exchPath);
    res.status(ok(status, data)).json(data);
  } catch (e) {
    res.status(502).json({ msg: e.message });
  }
});

const PORT = process.env.PORT || 3001;
logEvent('server_start', { port: PORT }, '');

// Periodic audit-log retention purge based on `audit_retention_days` (0 = keep forever).
// Runs hourly; reads the live setting from the DB so runtime changes take effect.
async function purgeAuditIfNeeded() {
  try {
    const map = await db.loadSettings();
    const days = parseInt(map.audit_retention_days || '0', 10);
    if (!days || days <= 0) return;
    const { rowCount } = await db.query(
      "DELETE FROM audit_log WHERE ts < now() - ($1 || ' days')::interval",
      [String(days)],
    );
    if (rowCount) console.log(`[audit] purged ${rowCount} entries older than ${days}d`);
  } catch (e) {
    console.error('[audit] purge failed:', e.message);
  }
}
setInterval(purgeAuditIfNeeded, 60 * 60 * 1000);

(async () => {
  await db.initSchema();
  await loadExchangeConfigFromDB();
  await loadSettingsFromDB();
  app.listen(PORT, () => {
    console.log(`Backend server running on http://0.0.0.0:${PORT}`);
  });
})();
