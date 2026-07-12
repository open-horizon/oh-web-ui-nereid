// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { get, put, del, post } from './client';

// Split an org-prefixed key ("yiqisoft/admin") into name + org
function splitOrg(raw: string): { name: string; org?: string } {
  const i = raw.indexOf('/');
  return i >= 0 ? { name: raw.slice(i + 1), org: raw.slice(0, i) } : { name: raw };
}
function qs(org?: string): string {
  return org ? `?org=${encodeURIComponent(org)}` : '';
}

export interface ExchangeUser {
  email?: string;
  admin?: boolean;
  hubAdmin?: boolean;
  owner?: string;
  lastUpdated?: string;
  [key: string]: any;
}

export const ExchangeUserAPI = {
  list() {
    return get<{ users: Record<string, ExchangeUser> }>('/exchange-users');
  },
  // For platform users, `username` may be "org/name" format; pass `org` explicitly
  // or it will be extracted from the prefix.
  create(username: string, data: Partial<ExchangeUser>, org?: string) {
    const s = splitOrg(username);
    const q = qs(s.org || org);
    return put(`/exchange-users/${encodeURIComponent(s.name)}${q}`, data);
  },
  update(username: string, data: Partial<ExchangeUser>, org?: string) {
    const s = splitOrg(username);
    const q = qs(s.org || org);
    return put(`/exchange-users/${encodeURIComponent(s.name)}${q}`, data);
  },
  delete(username: string, org?: string) {
    const s = splitOrg(username);
    const q = qs(s.org || org);
    return del(`/exchange-users/${encodeURIComponent(s.name)}${q}`);
  },
  get(username: string, org?: string) {
    const s = splitOrg(username);
    const q = qs(s.org || org);
    return get<{ users: Record<string, ExchangeUser> }>(`/exchange-users/${encodeURIComponent(s.name)}${q}`);
  },
  listApiKeys(username: string, org?: string) {
    return this.get(username, org).then(res => {
      const s = splitOrg(username);
      const key = s.org ? s.name : username;
      const user = res?.users?.[key];
      return { apiKeys: user?.apikeys || [] };
    });
  },
  createApiKey(username: string, data: { label: string }, org?: string) {
    const s = splitOrg(username);
    const q = qs(s.org || org);
    return post(`/exchange-users/${encodeURIComponent(s.name)}/apikeys${q}`, data);
  },
  deleteApiKey(username: string, keyId: string, org?: string) {
    const s = splitOrg(username);
    const q = qs(s.org || org);
    return del(`/exchange-users/${encodeURIComponent(s.name)}/apikeys/${keyId}${q}`);
  },
  changePassword(username: string, newPassword: string, org?: string) {
    const s = splitOrg(username);
    const q = qs(s.org || org);
    return post(`/exchange-users/${encodeURIComponent(s.name)}/changepw${q}`, { newPassword });
  },
};
