// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { get, put, post, del } from './client';

export interface HaGroup {
  name?: string;
  owner?: string;
  members?: string[];
  lastUpdated?: string;
  [key: string]: any;
}

export const HaGroupAPI = {
  list() {
    return get<{ hagroups: Record<string, HaGroup> }>('/hagroups');
  },
  get(id: string) {
    return get<{ hagroup: HaGroup }>(`/hagroups/${encodeURIComponent(id)}`);
  },
  create(id: string, data: Partial<HaGroup>) {
    return post(`/hagroups/${encodeURIComponent(id)}`, data);
  },
  update(id: string, data: Partial<HaGroup>) {
    return put(`/hagroups/${encodeURIComponent(id)}`, data);
  },
  delete(id: string) {
    return del(`/hagroups/${encodeURIComponent(id)}`);
  },
  addNode(hgId: string, nodeId: string) {
    return put(`/hagroups/${encodeURIComponent(hgId)}/nodes/${encodeURIComponent(nodeId)}`);
  },
  removeNode(hgId: string, nodeId: string) {
    return del(`/hagroups/${encodeURIComponent(hgId)}/nodes/${encodeURIComponent(nodeId)}`);
  },
};
