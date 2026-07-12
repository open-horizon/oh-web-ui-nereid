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

function splitOrg(raw: string): { name: string; org?: string } {
  const i = raw.indexOf('/');
  return i >= 0 ? { name: raw.slice(i + 1), org: raw.slice(0, i) } : { name: raw };
}
function nodeUrl(nodeId: string): string {
  const s = splitOrg(nodeId);
  const qs = s.org ? `?org=${encodeURIComponent(s.org)}` : '';
  return `/hagroups/${encodeURIComponent(s.name)}${qs}`;
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
    const s = splitOrg(nodeId);
    const qs = s.org ? `?org=${encodeURIComponent(s.org)}` : '';
    return put(`/hagroups/${encodeURIComponent(hgId)}/nodes/${encodeURIComponent(s.name)}${qs}`);
  },
  removeNode(hgId: string, nodeId: string) {
    const s = splitOrg(nodeId);
    const qs = s.org ? `?org=${encodeURIComponent(s.org)}` : '';
    return del(`/hagroups/${encodeURIComponent(hgId)}/nodes/${encodeURIComponent(s.name)}${qs}`);
  },
};
