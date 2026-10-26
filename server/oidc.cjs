// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

// Generic OpenID Connect (authorization code + PKCE) support.
//
// Configuration is entirely environment-driven (OIDC_*); OIDC is disabled when
// OIDC_ISSUER is unset. Discovery is best-effort: a failing/unreachable IdP at
// boot must not stop the BFF, so discovery runs in the background, retries on
// demand, and is cached for one hour. The BFF never stores IdP refresh tokens;
// an ID token is kept only inside the encrypted server session so RP-initiated
// logout can present it as id_token_hint, and it is destroyed on logout.

const { Issuer, generators, custom } = require('openid-client');

const cfg = {
  enabled: !!process.env.OIDC_ISSUER,
  issuerUrl: process.env.OIDC_ISSUER || '',
  clientId: process.env.OIDC_CLIENT_ID || '',
  clientSecret: process.env.OIDC_CLIENT_SECRET || '',
  redirectUri: process.env.OIDC_REDIRECT_URI || '',
  scopes: (process.env.OIDC_SCOPES || 'openid profile email').split(/\s+/).filter(Boolean),
  roleClaim: process.env.OIDC_ROLE_CLAIM || 'groups',
  platformGroup: process.env.OIDC_PLATFORM_GROUP || 'nereidhorizon-platform',
  partnerPrefix: process.env.OIDC_PARTNER_GROUP_PREFIX || 'nereidhorizon-partner-',
  insecure: process.env.OIDC_INSECURE_SKIP_VERIFY === 'true',
};

let client = null;
let discoveredAt = 0;
let inflight = null;

custom.setHttpOptionsDefaults({ timeout: 10000 });

// Discover the issuer and build the confidential client. Concurrent callers
// share one in-flight discovery. Returns null when OIDC is disabled or the
// provider is temporarily unreachable (callers surface a user-facing error).
async function getClient({ force = false } = {}) {
  if (!cfg.enabled) return null;
  const fresh = client && Date.now() - discoveredAt < 3600_000;
  if (fresh && !force) return client;
  if (!inflight) {
    inflight = (async () => {
      try {
        const issuer = await Issuer.discover(cfg.issuerUrl);
        client = new issuer.Client({
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          redirect_uris: [cfg.redirectUri],
          response_types: ['code'],
        });
        discoveredAt = Date.now();
        console.log(`[oidc] discovered ${issuer.metadata.issuer}`);
        return client;
      } catch (e) {
        console.warn(`[oidc] discovery failed: ${e.message}`);
        return null;
      } finally {
        inflight = null;
      }
    })();
  }
  return inflight;
}

function status() {
  return {
    enabled: cfg.enabled,
    configured: !!(cfg.issuerUrl && cfg.clientId && cfg.clientSecret && cfg.redirectUri),
    ready: !!client,
  };
}

// Begin a login: mint state/nonce/PKCE values and return the authorization URL
// plus the state bundle the caller must persist in a short-lived cookie.
async function beginLogin() {
  const c = await getClient();
  if (!c) return null;
  const state = generators.state();
  const nonce = generators.nonce();
  const verifier = generators.codeVerifier();
  const challenge = generators.codeChallenge(verifier);
  const url = c.authorizationUrl({
    redirect_uri: cfg.redirectUri,
    scope: cfg.scopes.join(' '),
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return { url, state, nonce, verifier };
}

// Exchange the authorization code and validate the returned ID token.
// params are the parsed callback query parameters; savedState comes from cookie.
// Decode the payload of a JWT without verifying its signature. Only used on a
// token that came straight from the IdP token endpoint over TLS, so the code
// exchange — not the signature — is what authenticates it.
function decodeJwtPayload(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

async function completeLogin(params, savedState) {
  const c = await getClient();
  if (!c) throw new Error('oidc_unavailable');
  const checks = { state: savedState.state, nonce: savedState.nonce, code_verifier: savedState.verifier };
  const tokenSet = await c.callback(cfg.redirectUri, params, checks);
  const claims = tokenSet.claims();
  // Some IdPs emit the configured role claim only on the access token; merge
  // its payload as a fallback so resolveRole still finds it.
  const atClaims = decodeJwtPayload(tokenSet.access_token);
  if (atClaims) {
    for (const [k, v] of Object.entries(atClaims)) {
      if (claims[k] === undefined) claims[k] = v;
    }
  }
  return { claims, idToken: tokenSet.id_token };
}

// Build the RP-initiated logout URL when the provider publishes an
// end_session_endpoint; null means the caller should do local logout only.
async function endSessionUrl(idToken, postLogoutRedirectUri) {
  const c = await getClient();
  if (!c || !c.issuer.metadata.end_session_endpoint) return null;
  return c.endSessionUrl({
    id_token_hint: idToken,
    post_logout_redirect_uri: postLogoutRedirectUri || undefined,
  });
}

const ORG_RE = /^[a-z0-9][a-z0-9-]*$/;

// Read a claim by exact key first (e.g. "groups"), then by dotted path
// (e.g. "realm_access.roles"), because Keycloak nests mapper claims such as
// realm_access/roles rather than flattening them.
function readClaim(claims, key) {
  if (!claims || !key) return undefined;
  if (Object.prototype.hasOwnProperty.call(claims, key)) return claims[key];
  if (!key.includes('.')) return undefined;
  let cur = claims;
  for (const part of key.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = cur[part];
  }
  return cur;
}

// Map IdP group claims to a BFF role and (for partners) bound Exchange orgs.
// Fail-closed: ambiguous, malformed, or unmapped identities are rejected with
// a stable error code the UI localizes.
function resolveRole(claims) {
  const raw = readClaim(claims, cfg.roleClaim);
  const groups = Array.isArray(raw) ? raw : (raw ? [raw] : []);
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

module.exports = {
  cfg,
  getClient,
  status,
  beginLogin,
  completeLogin,
  endSessionUrl,
  resolveRole,
};
