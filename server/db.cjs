// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

// PostgreSQL data layer for NereidAI console.
// Stores: local BFF users, partner API keys (org-scoped, revocable),
// the singleton Exchange connection config, and the append-only audit log.
// Database is mandatory (dev and prod) — the app fails fast if it cannot connect.

const { Pool } = require('pg');
const crypto = require('crypto');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[db] FATAL: DATABASE_URL is not set. PostgreSQL is required.');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 10, idleTimeoutMillis: 30000 });

pool.on('error', (e) => console.error('[db] pool error:', e.message));

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  username   TEXT NOT NULL,
  hash       TEXT NOT NULL,
  salt       TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('platform','partner')),
  org        TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id         TEXT PRIMARY KEY,
  key_hash   TEXT NOT NULL UNIQUE,
  key_plain  TEXT NOT NULL,
  org        TEXT NOT NULL,
  label      TEXT NOT NULL,
  revoked    BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys(org);
CREATE INDEX IF NOT EXISTS idx_api_keys_revoked ON api_keys(revoked);

CREATE TABLE IF NOT EXISTS exchange_config (
  id         INT PRIMARY KEY DEFAULT 1,
  base_url   TEXT NOT NULL,
  auth       TEXT NOT NULL,
  org_id     TEXT NOT NULL,
  version    TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGSERIAL PRIMARY KEY,
  ts         TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_type TEXT NOT NULL,
  actor      TEXT NOT NULL,
  org        TEXT,
  method     TEXT NOT NULL,
  path       TEXT NOT NULL,
  status     INT,
  ip         TEXT,
  ms         INT,
  proxied_to TEXT,
  detail     JSONB
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor);
CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_log(org);

CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

async function initSchema() {
  // Retry loop: PG may not be ready when app starts (Docker race), so retry 10x with 3s backoff
  let retries = 10;
  while (retries > 0) {
    try {
      const c = await pool.connect();
      try {
        await c.query(SCHEMA);
        // Migration: add key_plain column for existing tables
        await c.query('ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS key_plain TEXT');
        // Migration: change username PK → composite unique (org,username) to allow same
        // username across different orgs. Platform users (org=NULL) are globally unique;
        // partner users (org=xxx) are unique per org.
        await c.query('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_pkey');
        await c.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_platform_unique ON users(username) WHERE org IS NULL');
        await c.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_partner_unique ON users(username, org) WHERE org IS NOT NULL');
        console.log('[db] schema ready');
        return;
      } finally {
        c.release();
      }
    } catch (e) {
      retries -= 1;
      console.warn(`[db] connect failed (${10 - retries}/10): ${e.message}`);
      if (retries === 0) {
        console.error('[db] FATAL: cannot reach PostgreSQL after retries.');
        process.exit(1);
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

// Wrapper around pool.query for consistency and easier testing
function query(text, params) {
  return pool.query(text, params);
}

// ---------------- Users ----------------
// Returns all BFF user accounts (without passwords)
async function loadUsers() {
  const { rows } = await query('SELECT username, role, org, created_at FROM users ORDER BY created_at');
  return rows.map((r) => ({ username: r.username, role: r.role, org: r.org, createdAt: r.created_at }));
}
// Lookup a single user by username and optional org.
// When org is provided (partner), scopes the lookup to that org.
// When omitted, only matches platform users (org IS NULL).
async function getUser(username, org) {
  const { rows } = org
    ? await query('SELECT * FROM users WHERE username = $1 AND org = $2', [username, org])
    : await query('SELECT * FROM users WHERE username = $1 AND org IS NULL', [username]);
  return rows[0] || null;
}
// Create a new BFF user with pre-computed password hash+salt
async function createUser({ username, hash, salt, role, org, createdAt }) {
  await query(
    'INSERT INTO users(username, hash, salt, role, org, created_at) VALUES($1,$2,$3,$4,$5,$6)',
    [username, hash, salt, role, org || null, createdAt || new Date().toISOString()],
  );
}
// Delete a BFF user account by username and optional org.
// Partner users must provide org to disambiguate cross-org duplicates.
async function deleteUser(username, org) {
  if (org) {
    await query('DELETE FROM users WHERE username = $1 AND org = $2', [username, org]);
  } else {
    await query('DELETE FROM users WHERE username = $1 AND org IS NULL', [username]);
  }
}
// Update a user's password hash+salt (used for password changes)
async function updatePassword(username, hash, salt, org) {
  if (org) {
    await query('UPDATE users SET hash=$2, salt=$3 WHERE username=$1 AND org=$4', [username, hash, salt, org]);
  } else {
    await query('UPDATE users SET hash=$2, salt=$3 WHERE username=$1 AND org IS NULL', [username, hash, salt]);
  }
}
// Update a user's role/org (platform only, for edit modal)
async function updateUser(username, org, updates) {
  const sets = [];
  const params = [username];
  let idx = 2;
  if (updates.role !== undefined) { sets.push(`role=$${idx++}`); params.push(updates.role); }
  if (updates.newOrg !== undefined) { sets.push(`org=$${idx++}`); params.push(updates.newOrg || null); }
  if (updates.hash !== undefined) { sets.push(`hash=$${idx++}`); params.push(updates.hash); }
  if (updates.salt !== undefined) { sets.push(`salt=$${idx++}`); params.push(updates.salt); }
  if (sets.length === 0) return;
  let whereClause;
  if (org) { whereClause = `org=$${idx++}`; params.push(org); }
  else { whereClause = 'org IS NULL'; }
  await query(`UPDATE users SET ${sets.join(', ')} WHERE username=$1 AND ${whereClause}`, params);
}

// ---------------- Exchange config (singleton) ----------------
// Load the persisted Exchange connection config. Returns {configured: false} if no row exists (first-time setup)
async function loadExchangeConfig() {
  const { rows } = await query('SELECT base_url, auth, org_id, version FROM exchange_config WHERE id=1');
  if (!rows[0]) return { configured: false };
  return {
    configured: true,
    baseURL: rows[0].base_url,
    auth: rows[0].auth,
    orgId: rows[0].org_id,
    version: rows[0].version || '',
  };
}
// Upsert the Exchange config (single row, id=1). updatedBy is the BFF username
async function saveExchangeConfig(cfg, updatedBy) {
  await query(
    `INSERT INTO exchange_config(id, base_url, auth, org_id, version, updated_at, updated_by)
     VALUES(1,$1,$2,$3,$4,now(),$5)
     ON CONFLICT (id) DO UPDATE SET base_url=$1, auth=$2, org_id=$3, version=$4, updated_at=now(), updated_by=$5`,
    [cfg.baseURL, cfg.auth, cfg.orgId, cfg.version, updatedBy || null],
  );
}

// ---------------- Partner API keys ----------------
function sha256Hex(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}
// Generate a secure key: nk_<env>_<~48 random url-safe base64 chars>
function generateApiKey() {
  const env = process.env.NODE_ENV === 'production' ? 'live' : 'test';
  const rand = crypto.randomBytes(36).toString('base64url');
  return `nk_${env}_${rand}`;
}
// Create a new API key: returns {id, key} with plaintext visible ONCE
// The plaintext is stored so it can be retrieved later via getApiKeyPlain()
async function createApiKey({ org, label, expiresAt, createdBy }) {
  const plain = generateApiKey();
  const id = crypto.randomUUID();
  const keyHash = sha256Hex(plain);
  await query(
    'INSERT INTO api_keys(id, key_hash, key_plain, org, label, expires_at, created_by) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [id, keyHash, plain, org, label, expiresAt || null, createdBy || null],
  );
  return { id, key: plain }; // plaintext returned ONCE
}
// List keys; if org is specified, filter to that org, otherwise return all keys (platform)
async function listApiKeys(org) {
  const { rows } = org
    ? await query('SELECT id, org, label, revoked, expires_at, created_at, created_by FROM api_keys WHERE org=$1 ORDER BY created_at DESC', [org])
    : await query('SELECT id, org, label, revoked, expires_at, created_at, created_by FROM api_keys ORDER BY created_at DESC');
  return rows;
}
// Retrieve the plaintext of a key by id. Returns undefined (not found), null (no plaintext stored), or the key string
async function getApiKeyPlain(id) {
  const { rows } = await query('SELECT key_plain FROM api_keys WHERE id=$1', [id]);
  if (rows.length === 0) return undefined; // key not found
  if (rows[0].key_plain === null) return null; // found but no plaintext stored
  return rows[0].key_plain;
}
// Look up a key by its plaintext value (used during partner API auth). Returns full row or null
async function findApiKeyByPlain(plain) {
  const keyHash = sha256Hex(plain);
  const { rows } = await query('SELECT * FROM api_keys WHERE key_hash=$1', [keyHash]);
  return rows[0] || null;
}
// Mark a key as revoked (soft-delete). The record remains in DB for audit trail
async function revokeApiKey(id) {
  await query('UPDATE api_keys SET revoked=true WHERE id=$1', [id]);
}
// Hard-delete a key from the database
async function deleteApiKey(id) {
  await query('DELETE FROM api_keys WHERE id=$1', [id]);
}
// Regenerate a key: new hash+plain, unset revoked+expiry. Returns {key: newPlain}
async function renewApiKey(id) {
  const plain = generateApiKey();
  const keyHash = sha256Hex(plain);
  await query('UPDATE api_keys SET key_hash=$1, key_plain=$2, revoked=false, expires_at=NULL WHERE id=$3', [keyHash, plain, id]);
  return { key: plain };
}

// ---------------- Audit log (append-only) ----------------
// Insert a new audit record. Best-effort: silently catches errors to avoid disrupting the request
async function insertAudit(rec) {
  try {
    await query(
      `INSERT INTO audit_log(actor_type, actor, org, method, path, status, ip, ms, proxied_to, detail)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        rec.actorType, rec.actor, rec.org || null, rec.method, rec.path,
        rec.status ?? null, rec.ip || null, rec.ms ?? null, rec.proxiedTo || null,
        rec.detail ? JSON.stringify(rec.detail) : null,
      ],
    );
  } catch (e) {
    console.error('[audit] insert failed:', e.message);
  }
}

// Query audit log ordered by newest first. limit/offset for pagination
async function listAudit(limit, offset) {
  const { rows } = await query(
    'SELECT id, ts, actor_type, actor, org, method, path, status, ip, ms, proxied_to, detail FROM audit_log ORDER BY ts DESC LIMIT $1 OFFSET $2',
    [limit || 100, offset || 0],
  );
  return rows;
}

// ---------------- System settings (key-value) ----------------
// Load all settings into a {key: value} map. Used on startup to override default TTL/retention
async function loadSettings() {
  const { rows } = await query('SELECT key, value FROM settings');
  const map = {};
  for (const r of rows) map[r.key] = r.value;
  return map;
}
// Upsert a single setting key-value pair
async function saveSetting(key, value) {
  await query(
    'INSERT INTO settings(key, value, updated_at) VALUES($1,$2,now()) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=now()',
    [key, value],
  );
}

module.exports = {
  pool,
  initSchema,
  query,
  loadUsers,
  getUser,
  createUser,
  deleteUser,
  updatePassword,
  updateUser,
  loadExchangeConfig,
  saveExchangeConfig,
  sha256Hex,
  generateApiKey,
  createApiKey,
  listApiKeys,
  findApiKeyByPlain,
  getApiKeyPlain,
  revokeApiKey,
  deleteApiKey,
  renewApiKey,
  insertAudit,
  listAudit,
  loadSettings,
  saveSetting,
};
