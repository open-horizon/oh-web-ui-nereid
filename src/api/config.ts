// Session configuration for Exchange API calls.
// SECURITY: credentials are NEVER persisted in the browser. The backend stores
// the Exchange Basic auth encrypted and issues an HttpOnly+Secure+SameSite cookie.
// This module only keeps non-sensitive UI state in memory for the current tab.
let orgId = '';          // effective org used for resource operations (?org=)
let version = '';
let username = '';
let role: 'platform' | 'partner' = 'partner';
let userOrg = '';        // user's bound org (for partner)
let csrfToken = '';

export function saveSession(data: {
  username: string;
  role: 'platform' | 'partner';
  org: string;
  orgId: string;
  version: string;
  csrfToken: string;
}) {
  username = data.username;
  role = data.role;
  userOrg = data.org || '';
  orgId = data.orgId || '';
  version = data.version || '';
  csrfToken = data.csrfToken || '';
}

// Platform users can switch the effective org; partner is locked to its own org.
export function setOrgId(org: string) {
  orgId = org;
}

export function clearSession() {
  username = '';
  role = 'partner';
  userOrg = '';
  orgId = '';
  version = '';
  csrfToken = '';
}

export function isAuthenticated() {
  return !!username;
}

export function getConfig() {
  return { orgId, version, username, role, userOrg, csrfToken };
}

export function setCsrfToken(token: string) {
  csrfToken = token;
}
