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
// both are just login front doors over the same BFF session/role model, so
// the Keycloak group->role mapping is shared (OIDC_PLATFORM_GROUP /
// OIDC_PARTNER_GROUP_PREFIX) — a single realm-role assignment governs both.

const ORG_RE = /^[a-z0-9][a-z0-9-]*$/;

const cfg = {
  enabled: !!process.env.NS_BASE_URL,
  baseUrl: (process.env.NS_BASE_URL || '').replace(/\/+$/, ''),
  productId: process.env.NS_PRODUCT_ID || '',
  clientSecret: process.env.NS_CLIENT_SECRET || '',
  callbackPath: process.env.NS_CALLBACK_PATH || '/auth/ns-callback',
  // Same realm-role names as direct OIDC, so authorization is identical
  // regardless of which login front door was used.
  platformGroup: process.env.OIDC_PLATFORM_GROUP || 'nereidhorizon-platform',
  partnerPrefix: process.env.OIDC_PARTNER_GROUP_PREFIX || 'nereidhorizon-partner-',
};

function status() {
  return {
    enabled: cfg.enabled,
    configured: !!(cfg.baseUrl && cfg.productId && cfg.clientSecret),
  };
}

// Exchange a single-use ticket for the verified identity.
// NS responds 200 { identity: {sub,email,name,preferred_username,roles}, to }
// or 401 (bad product credentials) / 4xx (TICKET_*). Throws an Error whose
// message is a stable, UI-localizable code.
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
    // Final in-product destination requested at login (relative path, may be '').
    to: typeof data.to === 'string' ? data.to : '',
    issuer: cfg.baseUrl,
  };
}

// Map the realm roles carried by the ticket to a BFF role and (for partners)
// bound Exchange orgs. Identical rules to direct OIDC: fail closed on
// ambiguity, malformed org ids, or no recognizable group.
function resolveRole(identity) {
  const groups = identity.roles || [];
  const isPlatform = groups.includes(cfg.platformGroup);
  const orgs = [...new Set(
    groups
      .filter((g) => typeof g === 'string' && g.startsWith(cfg.partnerPrefix))
      .map((g) => g.slice(cfg.partnerPrefix.length))
      .filter((o) => ORG_RE.test(o)),
  )].sort();
  const malformed = groups.some(
    (g) => typeof g === 'string' && g.startsWith(cfg.partnerPrefix) && !ORG_RE.test(g.slice(cfg.partnerPrefix.length)),
  );
  if (isPlatform && orgs.length > 0) return { error: 'ambiguous_groups' };
  if (malformed) return { error: 'invalid_org_claim' };
  if (isPlatform) return { role: 'platform' };
  if (orgs.length > 0) return { role: 'partner', orgs };
  return { error: 'no_group' };
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
  resolveRole,
  safeRedirectPath,
};