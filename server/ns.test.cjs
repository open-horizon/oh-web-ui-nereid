// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

// Tests for the NS ticket group-path -> BFF role/org mapping. Run with:
//   node --test server/ns.test.cjs

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { parseHorizonGroups, resolveRole, safeRedirectPath } = require('./ns.cjs');

test('platform group maps to platform role', () => {
  assert.deepEqual(parseHorizonGroups(['/nereidhorizon/root/platform']), { role: 'platform' });
});

test('single partner group binds one org', () => {
  assert.deepEqual(parseHorizonGroups(['/nereidhorizon/myorg/partner']),
    { role: 'partner', orgs: ['myorg'] });
});

test('multiple partner groups bind all orgs, sorted and de-duplicated', () => {
  assert.deepEqual(
    parseHorizonGroups([
      '/nereidhorizon/zeta/partner',
      '/nereidhorizon/acme-labs/partner',
      '/nereidhorizon/acme-labs/partner',
    ]),
    { role: 'partner', orgs: ['acme-labs', 'zeta'] },
  );
});

test('other-product groups are ignored', () => {
  assert.deepEqual(
    parseHorizonGroups([
      '/nereidlink/6f1e2b7c/admins',
      '/nereidforge/acme/user',
      '/nereidhorizon/myorg/partner',
    ]),
    { role: 'partner', orgs: ['myorg'] },
  );
});

test('only other-product groups -> no_group', () => {
  assert.deepEqual(
    parseHorizonGroups(['/nereidlink/6f1e2b7c/admins', '/nereidforge/acme/user']),
    { error: 'no_group' },
  );
});

test('empty or missing groups -> no_group', () => {
  assert.deepEqual(parseHorizonGroups([]), { error: 'no_group' });
  assert.deepEqual(resolveRole({}), { error: 'no_group' });
  assert.deepEqual(resolveRole({ groups: undefined }), { error: 'no_group' });
});

test('platform plus partner -> ambiguous_groups', () => {
  assert.deepEqual(
    parseHorizonGroups(['/nereidhorizon/root/platform', '/nereidhorizon/myorg/partner']),
    { error: 'ambiguous_groups' },
  );
});

test('malformed path / bad org / unknown role -> invalid_org_claim', () => {
  assert.deepEqual(parseHorizonGroups(['/nereidhorizon/partner']), { error: 'invalid_org_claim' });
  assert.deepEqual(parseHorizonGroups(['/nereidhorizon/MyOrg/partner']), { error: 'invalid_org_claim' });
  assert.deepEqual(parseHorizonGroups(['/nereidhorizon/org/owner']), { error: 'invalid_org_claim' });
  assert.deepEqual(parseHorizonGroups(['/nereidhorizon//partner']), { error: 'invalid_org_claim' });
});

test('resolveRole reads identity.groups and ignores identity.roles', () => {
  assert.deepEqual(
    resolveRole({ roles: ['admin', 'user'], groups: ['/nereidhorizon/myorg/partner'] }),
    { role: 'partner', orgs: ['myorg'] },
  );
  // Suite roles alone must never grant access.
  assert.deepEqual(resolveRole({ roles: ['admin'] }), { error: 'no_group' });
});

test('safeRedirectPath only accepts relative in-app paths', () => {
  assert.equal(safeRedirectPath('/dashboard'), '/dashboard');
  assert.equal(safeRedirectPath(''), '/');
  assert.equal(safeRedirectPath('https://evil.example/'), '/');
  assert.equal(safeRedirectPath('//evil.example/'), '/');
});
