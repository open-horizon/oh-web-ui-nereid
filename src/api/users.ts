// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { get, post, put, patch, del } from './client';

export interface ExchangeUser {
  email?: string;
  admin?: boolean;
  hubAdmin?: boolean;
  owner?: string;
  lastUpdated?: string;
  [key: string]: any;
}

export const UserAPI = {
  list() {
    return get<{ users: Record<string, ExchangeUser> }>('/users');
  },
  create(username: string, data: Partial<ExchangeUser>) {
    return put(`/users/${username}`, data);
  },
  update(username: string, data: Partial<ExchangeUser>) {
    return put(`/users/${username}`, data);
  },
  delete(username: string) {
    return del(`/users/${username}`);
  },
  get(username: string) {
    return get<{ users: Record<string, ExchangeUser> }>(`/users/${username}`);
  },
  listApiKeys(username: string) {
    return this.get(username).then(res => {
      const user = res?.users?.[username];
      return { apiKeys: user?.apikeys || [] };
    });
  },
  createApiKey(username: string, data: { label: string }) {
    return post(`/users/${username}/apikeys`, data);
  },
  deleteApiKey(username: string, keyId: string) {
    return del(`/users/${username}/apikeys/${keyId}`);
  },
  changePassword(username: string, newPassword: string) {
    return post(`/users/${username}/changepw`, { newPassword });
  },
};
