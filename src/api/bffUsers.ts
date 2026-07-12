// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { get, post, put, del } from './client';

export interface BffUser {
  username: string;
  role: string;
  org: string | null;
  createdAt: string;
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
  delete(username: string, org?: string, deleteExchangeUser?: boolean) {
    let qs = org ? `?org=${encodeURIComponent(org)}` : '?';
    if (deleteExchangeUser) qs += (qs.includes('=') ? '&' : '') + 'deleteExchangeUser=true';
    return del(`/bff-users/${username}${qs}`);
  },
};
