// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

// Session configuration for Exchange API calls.
// SECURITY: credentials are NEVER persisted in the browser. The backend stores
// the Exchange Basic auth encrypted in Redis and issues an HttpOnly+Secure+
// SameSite cookie, which the browser sends automatically. This module only keeps
// non-sensitive UI state (org id, version, role) in memory for the current tab.
let orgId = '';
let version = '';
let orgType: 'hubadmin' | 'system' | 'user' = 'user';
let agbotAuth = '';  // Base64 auth string for agbot-privileged cross-org operations
let rootAuth = '';  // Base64 auth string for root-privileged operations

export function saveSession(oid: string, ver: string) {
  orgId = oid;
  version = ver;
}

export function saveOrgType(t: 'hubadmin' | 'system' | 'user') {
  orgType = t;
}

export function clearSession() {
  orgId = '';
  version = '';
  orgType = 'user';
  agbotAuth = '';
  rootAuth = '';
}

// Returns true if the user has an active in-memory session for this tab.
export function isAuthenticated() {
  return !!orgId;
}

export function getConfig() {
  return { orgId, version, orgType, agbotAuth, rootAuth };
}

export function setAgbotAuth(auth: string) {
  agbotAuth = auth;
}

export function setRootAuth(auth: string) {
  rootAuth = auth;
}
