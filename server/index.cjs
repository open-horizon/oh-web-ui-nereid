// Server implementation with inline comments explaining key logic
const express = require('express');
const crypto = require('crypto');
const { generateKeyPair, signDeployment, genAndSign } = require('./sign-utils.cjs');

const app = express();
app.use(express.json());

// Public health endpoint (no auth) used by the container healthcheck
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// BFF server start time, used to report uptime on the dashboard
const SERVER_START = Date.now();

const sessions = {};

// Generate unique session ID for authentication tracking
function sid() {
  return crypto.randomBytes(16).toString('hex');
}

// Core Exchange API client - abstracts HTTP calls with session auth
async function exch(session, method, path, body) {
  // Construct full Exchange API endpoint
  const url = `${session.baseURL}/v1${path}`;
  // Prepare authentication headers
  const headers = {
    Authorization: `Basic ${session.auth}`,  // Exchange basic auth
    Accept: 'application/json',
  };
  // Set content-type for requests with body
  if (body && method !== 'GET') headers['Content-Type'] = 'application/json';
  
  // Make API call to Exchange
  const r = await fetch(url, {
    method,
    headers,
    body: body && method !== 'GET' ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  try { return { status: r.status, data: JSON.parse(text) }; }
  catch { return { status: r.status, data: text }; }
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

// Session middleware - validates incoming session IDs
function session(req) {
  const s = sessions[req.headers['x-session-id']];
  if (!s) return null;
  return s;
}

// ==============================================
// Auth Routes
// ==============================================

// User authentication - creates session and stores credentials
app.post('/api/login', async (req, res) => {
  try {
    const { baseURL, user, password } = req.body;
    const auth = `${user}:${password}`;
    const b64 = Buffer.from(auth).toString('base64');
    const url = `${baseURL.replace(/\/+$/, '')}/v1/admin/version`;
    const r = await fetch(url, { headers: { Authorization: `Basic ${b64}` } });
    if (!r.ok && r.status !== 404) return res.status(401).json({ msg: 'Exchange 连接失败' });
    const version = (await r.text()).replace(/"/g, '');
    const orgId = user.includes('/') ? user.split('/')[0] : user;
    const id = sid();
    sessions[id] = { baseURL: baseURL.replace(/\/+$/, ''), auth: b64, orgId };
    res.json({ sessionId: id, orgId, version });
  } catch (e) {
    res.status(502).json({ msg: `Exchange 不可达: ${e.message}` });
  }
});

app.post('/api/logout', (req, res) => {
  delete sessions[req.headers['x-session-id']];
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

// ==============================================
// HA Groups Routes
// ==============================================

app.get('/api/hagroups', async (req, res) => {
  const s = session(req);
  if (!s) return res.status(401).json({ msg: '未登录' });
  try {
    const { status, data } = await exch(s, 'GET', `/orgs/${s.orgId}/hagroups`);
    res.status(ok(status, data)).json(data);
  } catch (e) { res.status(502).json({ msg: e.message }); }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend server running on http://0.0.0.0:${PORT}`);
});
