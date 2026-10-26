// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

// NereidSphere (NS) ticket SSO support.
//
// NS is the suite portal: the browser logs in once against the identity
// provider at NS, which mints a single-use ticket and redirects back here.
// This module exchanges that ticket server-to-server for an identity snapshot
// (POST {NS}/api/v1/auth/ticket/verify, authenticated with the per-product
// X-NS-Client-Id / X-NS-Client-Secret headers).
//
// Configuration is environment-driven (NS_*); NS mode is disabled when
// NS_BASE_URL is unset. It coexists with the direct-OIDC module in oidc.cjs:
// both are login front doors over the same BFF session/role model. The NS
// admin console grants one product tenant + role per account as Keycloak
// realm groups named /nereidhorizon/{exchange-org}/{platform|partner}; the
// ticket identity carries those full group paths (see resolveRole below).

const ORG_RE = /^[a-z0-9][a-z0-9-]*$/;
const HORIZON_PREFIX = '/nereidhorizon/';

const cfg = {
  enabled: !!process.env.NS_BASE_URL,
  baseUrl: (process.env.NS_BASE_URL || '').replace(/\/+$/, ''),
  productId: process.env.NS_PRODUCT_ID || '',
  clientSecret: process.env.NS_CLIENT_SECRET || '',
  callbackPath: process.env.NS_CALLBACK_PATH || '/auth/ns-callback',
};

function status() {
  return {
    enabled: cfg.enabled,
    configured: !!(cfg.baseUrl && cfg.productId && cfg.clientSecret),
  };
}

// Exchange a single-use ticket for the verified identity.
// NS responds 200 { identity: {sub,email,name,preferred_username,roles,
// groups}, to } or 401 (bad product credentials) / 4xx (TICKET_*). Throws an
// Error whose message is a stable, UI-localizable code. `groups` is omitempty
// at NS: absent (never null) when the user has no suite assignments.
async function verifyTicket(ticket) {
  if (!cfg.enabled) throw new Error('ns_disabled');
  if (!ticket || typeof ticket !== 'string') throw new Error('ticket_missing');

  const verifyUrl = `${cfg.baseUrl}/api/v1/auth/ticket/verify`;
  let res;
  try {
    res = await fetch(verifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-NS-Client-Id': cfg.productId,
        'X-NS-Client-Secret': cfg.clientSecret,
      },
      body: JSON.stringify({ ticket }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) {
    throw new Error('ns_unreachable');
  }

  let data = null;
  const text = await res.text();
  try { data = JSON.parse(text); } catch { /* non-JSON body */ }

  if (res.status === 401) throw new Error('ns_unauthorized');
  if (res.status !== 200) {
    // Surface the specific NS ticket error code (TICKET_EXPIRED, TICKET_AUDIENCE,
    // TICKET_NOT_FOUND, TICKET_INVALID, TICKET_UNSUPPORTED, ...).
    const code = data?.error?.code;
    if (code === 'TICKET_INVALID' || code === 'TICKET_NOT_FOUND' ||
        code === 'TICKET_EXPIRED' || code === 'TICKET_AUDIENCE') {
      throw new Error('ticket_invalid');
    }
    if (code === 'TICKET_UNSUPPORTED') throw new Error('ns_mode_mismatch');
    if (res.status === 503) throw new Error('ns_unavailable');
    throw new Error('ticket_invalid');
  }

  const id = data?.identity;
  if (!id || !id.sub) throw new Error('ns_invalid_response');

  return {
    subject: String(id.sub),
    username: String(id.preferred_username || id.name || id.sub),
    name: id.name || null,
    email: id.email || null,
    roles: Array.isArray(id.roles) ? id.roles.map(String) : [],
    // NS suite product assignments as full realm-group paths
    // (/nereidhorizon/{org}/{role}); absent when the user has none.
    groups: Array.isArray(id.groups) ? id.groups.map(String) : [],
    // Final in-product destination requested at login (relative path, may be '').
    to: typeof data.to === 'string' ? data.to : '',
    issuer: cfg.baseUrl,
  };
}

// parseHorizonGroups maps the NS product-assignment group paths
// (/nereidhorizon/{org}/{platform|partner}) to a BFF role and (for partners)
// bound Exchange orgs. Entries of other suite products are ignored. Fail
// closed on a malformed path/org/role or on a simultaneous platform+partner
// assignment, so an IdP misconfiguration is an explicit signal rather than a
// silent privilege escalation.
function parseHorizonGroups(groups) {
  let isPlatform = false;
  const orgs = [];
  let malformed = false;

  for (const g of groups) {
    if (typeof g !== 'string' || !g.startsWith(HORIZON_PREFIX)) continue; // other products
    const parts = g.slice(HORIZON_PREFIX.length).split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) { malformed = true; continue; }
    const [org, role] = parts;
    if (role === 'platform') {
      isPlatform = true;
    } else if (role === 'partner') {
      if (!ORG_RE.test(org)) { malformed = true; continue; }
      if (!orgs.includes(org)) orgs.push(org);
    } else {
      malformed = true; // unknown role key
    }
  }

  if (malformed) return { error: 'invalid_org_claim' };
  if (isPlatform && orgs.length > 0) return { error: 'ambiguous_groups' };
  if (isPlatform) return { role: 'platform' };
  if (orgs.length > 0) return { role: 'partner', orgs: orgs.sort() };
  return { error: 'no_group' };
}

// Map the ticket identity to a BFF role and orgs. Only identity.groups (the
// /nereidhorizon/... paths) is authoritative; identity.roles holds suite-level
// roles (user/operator/admin) and is intentionally not consulted.
function resolveRole(identity) {
  return parseHorizonGroups(identity?.groups || []);
}

// Validate a post-login destination: NS only ever returns a relative in-app
// path, never an absolute URL, but re-check defensively before redirecting.
function safeRedirectPath(to) {
  if (!to || !to.startsWith('/') || to.startsWith('//') || to.includes('\\')) return '/';
  return to;
}

module.exports = {
  cfg,
  status,
  verifyTicket,
  parseHorizonGroups,
  resolveRole,
  safeRedirectPath,
};