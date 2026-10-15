// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

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
let authType: 'local' | 'oidc' = 'local';
let availableOrgs: string[] = []; // partner: orgs granted by SSO groups
let email = '';

export function saveSession(data: {
  username: string;
  role: 'platform' | 'partner';
  org: string | null;
  orgId: string;
  version: string;
  csrfToken: string;
  authType?: 'local' | 'oidc';
  availableOrgs?: string[];
  email?: string | null;
}) {
  username = data.username;
  role = data.role;
  userOrg = data.org || '';
  orgId = data.orgId || '';
  version = data.version || '';
  csrfToken = data.csrfToken || '';
  authType = data.authType || 'local';
  availableOrgs = data.availableOrgs || (data.orgId ? [data.orgId] : []);
  email = data.email || '';
}

// Platform users can switch the effective org; a partner can only switch
// between orgs granted by its SSO groups (the backend re-checks on switch).
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
  authType = 'local';
  availableOrgs = [];
  email = '';
}

export function isAuthenticated() {
  return !!username;
}

export function getConfig() {
  return { orgId, version, username, role, userOrg, csrfToken, authType, availableOrgs, email };
}

export function setCsrfToken(token: string) {
  csrfToken = token;
}
