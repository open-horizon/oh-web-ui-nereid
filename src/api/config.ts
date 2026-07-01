// In-memory session configuration for Exchange API calls
// Credentials are NOT persisted (no localStorage) — lost on page refresh
let sessionId = '';
let orgId = '';
let version = '';
let orgType: 'hubadmin' | 'system' | 'user' = 'user';
let agbotAuth = '';  // Base64 auth string for agbot-privileged cross-org operations
let rootAuth = '';   // Base64 auth string for root-privileged operations

export function saveSession(sid: string, oid: string, ver: string) {
  sessionId = sid;
  orgId = oid;
  version = ver;
}

export function saveOrgType(t: 'hubadmin' | 'system' | 'user') {
  orgType = t;
}

export function clearSession() {
  sessionId = '';
  orgId = '';
  version = '';
  orgType = 'user';
  agbotAuth = '';
  rootAuth = '';
}

export function isAuthenticated() {
  return !!sessionId;
}

export function getConfig() {
  return { sessionId, orgId, version, orgType, agbotAuth, rootAuth };
}

export function setAgbotAuth(auth: string) {
  agbotAuth = auth;
}

export function setRootAuth(auth: string) {
  rootAuth = auth;
}
