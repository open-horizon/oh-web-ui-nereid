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
app.use(express.json());

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

// Express middleware: time and log every incoming /api request
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) return next();
  const start = Date.now();
  const origEnd = res.end.bind(res);
    res.end = function (...args) {
      const s = session(req);
      const ms = Date.now() - start;
      const userLabel = s?.orgId ? sessionUser(s) : '-';
      logApi(req, res.statusCode, ms, userLabel, s?.orgId || '-');
      return origEnd(...args);
    };
  next();
});

// Public health endpoint (no auth) used by the container healthcheck
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

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
const SESSION_TTL = parseInt(process.env.SESSION_TTL || '1800', 10); // 30 min idle
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

// --- Redis client (lazy, with in-memory fallback) ---
let redis = null;
let redisReady = false;
try {
  const Redis = require('ioredis');
  redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: 2, enableOfflineQueue: true });
  redis.on('ready', () => { redisReady = true; console.log('[redis] session store connected'); });
  redis.on('error', (e) => { console.warn('[redis] unavailable, using in-memory session store:', e.message); redisReady = false; });
} catch (e) {
  console.warn('[redis] client init failed, using in-memory session store');
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
// Auth Routes
// ==============================================

// User authentication - verifies Exchange credentials, then stores them
// ENCRYPTED in Redis (AES-256-GCM) and issues an HttpOnly+Secure+SameSite cookie.
app.post('/api/login', async (req, res) => {
  try {
    const { baseURL, user, password } = req.body;
    if (!baseURL || !user || !password) return res.status(400).json({ msg: '缺少必要参数' });
    const auth = `${user}:${password}`;
    const b64 = Buffer.from(auth).toString('base64');
    const url = `${baseURL.replace(/\/+$/, '')}/v1/admin/version`;
    const r = await fetch(url, { headers: { Authorization: `Basic ${b64}` } });
    if (!r.ok && r.status !== 404) return res.status(401).json({ msg: 'Exchange 连接失败' });
    const version = (await r.text()).replace(/"/g, '');
    const orgId = user.includes('/') ? user.split('/')[0] : user;
    const id = sid();
    const data = { baseURL: baseURL.replace(/\/+$/, ''), auth: b64, orgId };
    sessions[id] = data;
    sessionBorn.set(id, Date.now());
    persistSession(id, data); // encrypted durable backup with TTL
    logEvent('login', { orgId, user }, orgId);
    res.setHeader('Set-Cookie',
      `nereid_sid=${id}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL}`);
    res.json({ orgId, version });
  } catch (e) {
    res.status(502).json({ msg: `Exchange 不可达: ${e.message}` });
  }
});

// Returns current session context if the cookie is valid (used for page-refresh
// re-authentication without re-entering credentials).
app.get('/api/me', (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  res.json({ orgId: s.orgId, version: s.version || '' });
});

app.post('/api/logout', (req, res) => {
  const id = sessionIdFromReq(req);
  if (id) {
    const org = sessions[id]?.orgId;
    delete sessions[id];
    sessionBorn.delete(id);
    dropSession(id);
    logEvent('logout', { orgId: org || '?' }, '');
  }
  res.setHeader('Set-Cookie', 'nereid_sid=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
  res.json({ ok: true });
});

// ==============================================
// System Info Routes
// ==============================================

// Get organization statistics (nodes, users, services, agbots)
app.get('/api/status', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const { status, data } = await exch(s, 'GET', `/orgs/${s.orgId}/status`);
    if (![200, 404].includes(status)) return res.status(status).json(data);
    const base = data && typeof data === 'object' ? data : {};
    let serviceCount = 0, agbotCount = 0, patternCount = 0, policyCount = 0, mgmtPolicyCount = 0;
    try {
      const svcRes = await exch(s, 'GET', `/orgs/${s.orgId}/services`);
      if (svcRes.status === 200 && svcRes.data?.services) {
        serviceCount = Object.keys(svcRes.data.services).length;
      }
    } catch {}
    try {
      const abRes = await exch(s, 'GET', `/orgs/${s.orgId}/agbots`);
      if (abRes.status === 200 && abRes.data?.agbots) {
        agbotCount = Object.keys(abRes.data.agbots).length;
      }
    } catch {}
    try {
      const patRes = await exch(s, 'GET', `/orgs/${s.orgId}/patterns`);
      if (patRes.status === 200 && patRes.data?.patterns) {
        patternCount = Object.keys(patRes.data.patterns).length;
      }
    } catch {}
    try {
      const polRes = await exch(s, 'GET', `/orgs/${s.orgId}/business/policies`);
      if (polRes.status === 200 && polRes.data?.businessPolicys) {
        policyCount = Object.keys(polRes.data.businessPolicys).length;
      }
    } catch {}
    try {
      const mgRes = await exch(s, 'GET', `/orgs/${s.orgId}/managementpolicies`);
      if (mgRes.status === 200 && mgRes.data?.managementPolicies) {
        mgmtPolicyCount = Object.keys(mgRes.data.managementPolicies).length;
      }
    } catch {}
    res.json({
      nodes: base.numberOfNodes ?? 0,
      users: base.numberOfUsers ?? 0,
      services: serviceCount,
      agbots: agbotCount,
      patterns: patternCount,
      policies: policyCount,
      mgmtPolicies: mgmtPolicyCount,
    });
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// Richer dashboard payload: counts + server uptime + node heartbeat stats + recent activity
app.get('/api/dashboard', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const { status, data } = await exch(s, 'GET', `/orgs/${s.orgId}/status`);
    if (![200, 404].includes(status)) return res.status(status).json(data);
    const base = data && typeof data === 'object' ? data : {};

    let serviceCount = 0, agbotCount = 0, patternCount = 0, policyCount = 0, mgmtPolicyCount = 0;
    let nodes = {}, nodeList = [];
    try {
      const nRes = await exch(s, 'GET', `/orgs/${s.orgId}/nodes`);
      if (nRes.status === 200 && nRes.data?.nodes) {
        nodes = nRes.data.nodes;
        nodeList = Object.entries(nodes).map(([id, n]) => ({ id, lastHeartbeat: n.lastHeartbeat, pattern: n.pattern, registered: Array.isArray(n.registeredServices) ? n.registeredServices.length : 0 }));
      }
    } catch {}
    try {
      const svcRes = await exch(s, 'GET', `/orgs/${s.orgId}/services`);
      if (svcRes.status === 200 && svcRes.data?.services) serviceCount = Object.keys(svcRes.data.services).length;
    } catch {}
    try {
      const abRes = await exch(s, 'GET', `/orgs/${s.orgId}/agbots`);
      if (abRes.status === 200 && abRes.data?.agbots) agbotCount = Object.keys(abRes.data.agbots).length;
    } catch {}
    try {
      const patRes = await exch(s, 'GET', `/orgs/${s.orgId}/patterns`);
      if (patRes.status === 200 && patRes.data?.patterns) patternCount = Object.keys(patRes.data.patterns).length;
    } catch {}
    try {
      const polRes = await exch(s, 'GET', `/orgs/${s.orgId}/business/policies`);
      if (polRes.status === 200 && polRes.data?.businessPolicys) policyCount = Object.keys(polRes.data.businessPolicys).length;
    } catch {}
    try {
      const mgRes = await exch(s, 'GET', `/orgs/${s.orgId}/managementpolicies`);
      if (mgRes.status === 200 && mgRes.data?.managementPolicies) mgmtPolicyCount = Object.keys(mgRes.data.managementPolicies).length;
    } catch {}

    const now = Date.now();
    const online = nodeList.filter((n) => n.lastHeartbeat && now - new Date(n.lastHeartbeat).getTime() < 300000).length;
    const recent = nodeList
      .filter((n) => n.lastHeartbeat)
      .sort((a, b) => new Date(b.lastHeartbeat).getTime() - new Date(a.lastHeartbeat).getTime())
      .slice(0, 8)
      .map((n) => ({ id: n.id, lastHeartbeat: n.lastHeartbeat, pattern: n.pattern, registered: n.registered }));

    res.json({
      orgId: s.orgId,
      orgType: s.orgType,
      nodes: base.numberOfNodes ?? 0,
      users: base.numberOfUsers ?? 0,
      services: serviceCount,
      agbots: agbotCount,
      patterns: patternCount,
      policies: policyCount,
      mgmtPolicies: mgmtPolicyCount,
      onlineNodes: online,
      serverUptimeMs: now - SERVER_START,
      serverStartedAt: new Date(SERVER_START).toISOString(),
      recentNodes: recent,
    });
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.get('/api/version', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const { data } = await exch(s, 'GET', '/admin/version');
    res.json({ version: typeof data === 'string' ? data.replace(/"/g, '') : '' });
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.get('/api/org-type', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
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
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const { status, data } = await exch(s, 'GET', '/orgs');
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.put('/api/organizations/:orgid', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const { status, data } = await exch(s, 'PUT', `/orgs/${req.params.orgid}`, req.body);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.delete('/api/organizations/:orgid', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const { status, data } = await exch(s, 'DELETE', `/orgs/${req.params.orgid}`);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// ==============================================
// Users Routes
// ==============================================

app.get('/api/users', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const { status, data } = await exch(s, 'GET', `/orgs/${s.orgId}/users`);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.get('/api/users/:username', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const { status, data } = await exch(s, 'GET', `/orgs/${s.orgId}/users/${req.params.username}`);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.put('/api/users/:username', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const { status, data } = await exch(s, 'PUT', `/orgs/${s.orgId}/users/${req.params.username}`, req.body);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.delete('/api/users/:username', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const { status, data } = await exch(s, 'DELETE', `/orgs/${s.orgId}/users/${req.params.username}`);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.post('/api/users/:username/apikeys', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const { status, data } = await exch(s, 'POST', `/orgs/${s.orgId}/users/${req.params.username}/apikeys`, req.body);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.delete('/api/users/:username/apikeys/:keyid', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const { status, data } = await exch(s, 'DELETE', `/orgs/${s.orgId}/users/${req.params.username}/apikeys/${req.params.keyid}`);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// ==============================================
// Nodes Routes
// ==============================================

app.get('/api/nodes', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const { status, data } = await exch(s, 'GET', `/orgs/${s.orgId}/nodes`);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.patch('/api/nodes/:id', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const nodeId = stripOrg(s.orgId, req.params.id);
    const body = { ...req.body };
    if (body.pattern && !body.pattern.includes('/')) {
      body.pattern = `${s.orgId}/${body.pattern}`;  // Prepend org if missing
    }
    const auth = req.headers['x-root-auth'] || s.auth;
    const { status, data } = await exch({ ...s, auth }, 'PATCH', `/orgs/${s.orgId}/nodes/${nodeId}`, body);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.delete('/api/nodes/:id', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const nodeId = stripOrg(s.orgId, req.params.id);
    const { status, data } = await exch(s, 'DELETE', `/orgs/${s.orgId}/nodes/${nodeId}`);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.get('/api/nodes/:id/services', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const nodeId = stripOrg(s.orgId, req.params.id);
    const { status, data } = await exch(s, 'GET', `/orgs/${s.orgId}/nodes/${nodeId}/status`);
    const services = data?.services ?? [];
    res.json({ services: Array.isArray(services) ? services : [] });
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.get('/api/nodes/:id/policy', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const nodeId = stripOrg(s.orgId, req.params.id);
    const { status, data } = await exch(s, 'GET', `/orgs/${s.orgId}/nodes/${nodeId}/policy`);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.put('/api/nodes/:id/policy', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const nodeId = stripOrg(s.orgId, req.params.id);
    const body = { ...req.body };
    delete body.lastUpdated;  // Exchange rejects lastUpdated field
    const { status, data } = await exch(s, 'PUT', `/orgs/${s.orgId}/nodes/${nodeId}/policy`, body);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.get('/api/nodes/:id/agreements', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const nodeId = stripOrg(s.orgId, req.params.id);
    const { status, data } = await exch(s, 'GET', `/orgs/${s.orgId}/nodes/${nodeId}/agreements`);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.get('/api/nodes/:id/errors', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const nodeId = stripOrg(s.orgId, req.params.id);
    const { status, data } = await exch(s, 'GET', `/orgs/${s.orgId}/nodes/${nodeId}/errors`);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.get('/api/nodes/:id/managementStatus', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const nodeId = stripOrg(s.orgId, req.params.id);
    const { status, data } = await exch(s, 'GET', `/orgs/${s.orgId}/nodes/${nodeId}/managementStatus`);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// ==============================================
// Services Routes
// ==============================================

app.get('/api/services', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  // agbot auth header allows cross-org service listing when browsing from non-IBM org
  const auth = req.headers['x-agbot-auth'] || s.auth;
  try {
    const org = req.query.org || s.orgId;
    const { status, data } = await exch({ ...s, auth }, 'GET', `/orgs/${org}/services`);
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
  if (!s) return res.status(401).json({ msg: '未登录' });
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
      const { status, data } = await exch(s, 'POST', `/orgs/${s.orgId}/services`, body);
      // Step 3: if creation succeeded, upload the public key so agents can verify signatures
      if (status === 201 && data && data.code === 'ok') {
        const svcId = `${s.orgId}/${body.url}_${body.version}_${body.arch}`;
        await exchRaw(s, 'PUT', `/orgs/${s.orgId}/services/${encodeURIComponent(svcId)}/keys/default.public.key`, publicKey, 'text/plain');
      }
      res.status(status).json(data);
      return;
    }

    const { status, data } = await exch(s, 'POST', `/orgs/${s.orgId}/services`, body);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.put('/api/services/:id', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
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
  if (!s) return res.status(401).json({ msg: '未登录' });
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
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const svcName = decodeURIComponent(req.params.id);
    const org = req.query.org || s.orgId;
    const { status, data } = await exch(s, 'GET', `/orgs/${org}/services/${svcName}/keys`);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.post('/api/services/:id/keys', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
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
  if (!s) return res.status(401).json({ msg: '未登录' });
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
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const svcName = decodeURIComponent(req.params.id);
    const org = req.query.org || s.orgId;
    const { status, data } = await exch(s, 'GET', `/orgs/${org}/services/${svcName}/dockauths`);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.post('/api/services/:id/dockauths', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
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
  if (!s) return res.status(401).json({ msg: '未登录' });
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
  if (!s) return res.status(401).json({ msg: '未登录' });
  const auth = req.headers['x-agbot-auth'] || s.auth;
  try {
    const org = req.query.org || s.orgId;
    const { status, data } = await exch({ ...s, auth }, 'GET', `/orgs/${org}/deployment/patterns`);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.post('/api/patterns', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const { name, ...rest } = req.body;
    const body = patternBody(rest);
    const { status, data } = await exch(s, 'POST', `/orgs/${s.orgId}/deployment/patterns/${name}`, body);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.put('/api/patterns/:id', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const patId = stripOrg(s.orgId, req.params.id);
    const body = patternBody(req.body);
    const { status, data } = await exch(s, 'PUT', `/orgs/${s.orgId}/deployment/patterns/${patId}`, body);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.delete('/api/patterns/:id', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const patId = stripOrg(s.orgId, req.params.id);
    const { status, data } = await exch(s, 'DELETE', `/orgs/${s.orgId}/deployment/patterns/${patId}`);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.get('/api/patterns/:id/nodehealth', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const patId = stripOrg(s.orgId, req.params.id);
    const { status, data } = await exch(s, 'GET', `/orgs/${s.orgId}/deployment/patterns/${patId}/nodehealth`);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// ==============================================
// Deployment Policies Routes
// ==============================================

app.get('/api/policies', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  const auth = req.headers['x-agbot-auth'] || s.auth;
  try {
    const org = req.query.org || s.orgId;
    const { status, data } = await exch({ ...s, auth }, 'GET', `/orgs/${org}/deployment/policies`);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.post('/api/policies', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const { name, ...rest } = req.body;
    const body = sanitizeBody(rest);
    const { status, data } = await exch(s, 'POST', `/orgs/${s.orgId}/deployment/policies/${name}`, body);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.put('/api/policies/:id', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const polId = stripOrg(s.orgId, req.params.id);
    const body = sanitizeBody(req.body);
    const { status, data } = await exch(s, 'PUT', `/orgs/${s.orgId}/deployment/policies/${polId}`, body);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.delete('/api/policies/:id', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const polId = stripOrg(s.orgId, req.params.id);
    const { status, data } = await exch(s, 'DELETE', `/orgs/${s.orgId}/deployment/policies/${polId}`);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// ==============================================
// Management Policies Routes
// ==============================================

app.get('/api/mgmtpolicies', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const { status, data } = await exch(s, 'GET', `/orgs/${s.orgId}/managementpolicies`);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.post('/api/mgmtpolicies', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const { name, ...rest } = req.body;
    const body = sanitizeBody(rest);
    const { status, data } = await exch(s, 'POST', `/orgs/${s.orgId}/managementpolicies/${name}`, body);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.put('/api/mgmtpolicies/:id', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const mgmtId = stripOrg(s.orgId, req.params.id);
    const body = sanitizeBody(req.body);
    const { status, data } = await exch(s, 'PUT', `/orgs/${s.orgId}/managementpolicies/${mgmtId}`, body);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.delete('/api/mgmtpolicies/:id', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const mgmtId = stripOrg(s.orgId, req.params.id);
    const { status, data } = await exch(s, 'DELETE', `/orgs/${s.orgId}/managementpolicies/${mgmtId}`);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// ==============================================
// Catalog Routes
// ==============================================

app.get('/api/catalog-services', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const { status, data } = await exch(s, 'GET', '/catalog/services');
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.get('/api/catalog-patterns', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
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
  if (!s) { res.status(401).json({ msg: '未登录' }); return null; }
  // If the request carries root-level agbot auth, override the session
  const agbotAuth = req.headers['x-agbot-auth'];
  if (agbotAuth) {
    return { ...s, auth: agbotAuth };
  }
  return s;
}

function agbotOrg(req, s) {
  return req.query.org || s.orgId;
}

app.post('/api/agbots/admin-login', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
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
    const org = agbotOrg(req, s);
    const { status, data } = await exch(s, 'GET', `/orgs/${org}/agbots`);
    let merged = data;
    // If session org is not IBM, also try to fetch IBM agbots for cross-org visibility
    if (org !== 'IBM') {
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
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// ==============================================
// Audit Log Route — read-only, returns last N entries from audit.log
// ==============================================

app.get('/api/audit', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100000, 200000);
    const search = (req.query.search || '').toLowerCase();
    const source = req.query.source === 'system' ? SYS_LOG : (req.query.source === 'audit' ? AUDIT_LOG : SYS_LOG);
    if (!fs.existsSync(source)) return res.json({ entries: [] });
    const raw = fs.readFileSync(source, 'utf8').trim().split('\n').filter(Boolean);
    let entries = raw.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    if (search) entries = entries.filter((e) => JSON.stringify(e).toLowerCase().includes(search));
    entries.reverse();
    res.json({ entries: entries.slice(0, limit) });
  } catch (e) { res.status(500).json({ msg: e.message }); }
});

// ==============================================
// Agent File Version Routes
// ==============================================

app.get('/api/agentfileversion', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const { status, data } = await exch(s, 'GET', `/orgs/${s.orgId}/AgentFileVersion`);
    // Exchange may reject this org (400); return empty data gracefully in that case
    if (status === 400) return res.json({});
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.put('/api/agentfileversion', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const { status, data } = await exch(s, 'PUT', `/orgs/${s.orgId}/AgentFileVersion`, sanitizeBody(req.body));
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.delete('/api/agentfileversion', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
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
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const { status, data } = await exch(s, 'GET', `/orgs/${s.orgId}/hagroups`);
    const arr = data?.nodeGroups ?? [];
    const groups = Array.isArray(arr) ? Object.fromEntries(arr.map((g) => [g.name, g])) : (arr || {});
    res.status(ok(status, data)).json({ hagroups: groups });
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.get('/api/hagroups/:id', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const hgId = stripOrg(s.orgId, req.params.id);
    const { status, data } = await exch(s, 'GET', `/orgs/${s.orgId}/hagroups/${hgId}`);
    res.status(ok(status, data)).json({ hagroup: data });
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.post('/api/hagroups/:id', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const hgId = stripOrg(s.orgId, req.params.id);
    const body = { ...req.body };
    delete body.name;
    const { status, data } = await exch(s, 'POST', `/orgs/${s.orgId}/hagroups/${hgId}`, body);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.delete('/api/hagroups/:id', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const hgId = stripOrg(s.orgId, req.params.id);
    const { status, data } = await exch(s, 'DELETE', `/orgs/${s.orgId}/hagroups/${hgId}`);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.put('/api/hagroups/:id/nodes/:nodeId', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const hgId = stripOrg(s.orgId, req.params.id);
    const nodeId = stripOrg(s.orgId, req.params.nodeId);
    const { status, data } = await exch(s, 'PUT', `/orgs/${s.orgId}/hagroups/${hgId}/nodes/${nodeId}`);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

app.delete('/api/hagroups/:id/nodes/:nodeId', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const hgId = stripOrg(s.orgId, req.params.id);
    const nodeId = stripOrg(s.orgId, req.params.nodeId);
    const { status, data } = await exch(s, 'DELETE', `/orgs/${s.orgId}/hagroups/${hgId}/nodes/${nodeId}`);
    res.status(status).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

// Change password
app.post('/api/users/:username/changepw', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const user = stripOrg(s.orgId, req.params.username);
    const { newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ msg: 'newPassword is required' });
    const { status, data } = await exch(s, 'POST', `/orgs/${s.orgId}/users/${user}/changepw`, { newPassword });
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

const PORT = process.env.PORT || 3001;
logEvent('server_start', { port: PORT }, '');

app.listen(PORT, () => {
  console.log(`Backend server running on http://0.0.0.0:${PORT}`);
});
