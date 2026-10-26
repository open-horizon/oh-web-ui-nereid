// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { get, post, put, del } from './client';

export interface BffUser {
  username: string;
  role: string;
  org: string | null;
  createdAt: string;
  email?: string | null;
  issuer?: string | null;
  subject?: string | null;
  disabled?: boolean;
  bootstrap?: boolean;
  authType?: 'local' | 'oidc';
}

export const BffUserAPI = {
  list() {
    return get<{ users: BffUser[] }>('/bff-users');
  },
  create(data: { username: string; password: string; role: string; org?: string }) {
    return post<{ ok: boolean; orgCreated?: boolean }>('/bff-users', data);
  },
  update(username: string, data: { role?: string; org?: string; newPassword?: string }, org?: string) {
    const qs = org ? `?org=${encodeURIComponent(org)}` : '';
    return put<{ ok: boolean }>(`/bff-users/${username}${qs}`, data);
  },
  setDisabled(user: BffUser, disabled: boolean) {
    const qs = new URLSearchParams();
    if (user.issuer) {
      qs.set('issuer', user.issuer);
      qs.set('subject', user.subject || '');
    } else if (user.org) {
      qs.set('org', user.org);
    }
    return put<{ ok: boolean }>(`/bff-users/${encodeURIComponent(user.username)}/disabled?${qs.toString()}`, { disabled });
  },
  delete(user: BffUser, deleteExchangeUser?: boolean) {
    const qs = new URLSearchParams();
    if (user.issuer) {
      qs.set('issuer', user.issuer);
      qs.set('subject', user.subject || '');
    } else if (user.org) {
      qs.set('org', user.org);
    }
    if (deleteExchangeUser) qs.set('deleteExchangeUser', 'true');
    return del(`/bff-users/${encodeURIComponent(user.username)}?${qs.toString()}`);
  },
};
