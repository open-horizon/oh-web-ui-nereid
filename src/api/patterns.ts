// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { get, post, put, del } from './client';

export interface ExchangePattern {
  label?: string;
  description?: string;
  public?: boolean;
  owner?: string;
  lastUpdated?: string;
  services?: any[];        // Key field — named "services" not "patternServices"
  servicesRef?: any[];
  [key: string]: any;
}

// Split an Exchange key (org/name) — org goes to ?org= to avoid Express 5 %2F decoding issue
function splitOrg(raw: string): { name: string; org?: string } {
  const i = raw.indexOf('/');
  return i >= 0 ? { name: raw.slice(i + 1), org: raw.slice(0, i) } : { name: raw };
}
function patUrl(id: string): string {
  const s = splitOrg(id);
  const qs = s.org ? `?org=${encodeURIComponent(s.org)}` : '';
  return `/patterns/${encodeURIComponent(s.name)}${qs}`;
}

export const PatternAPI = {
  list(org?: string) {
    const qs = org ? `?org=${encodeURIComponent(org)}` : '';
    return get<{ patterns: Record<string, ExchangePattern> }>(`/patterns${qs}`);
  },
  create(name: string, data: Partial<ExchangePattern>, org?: string) {
    const qs = org ? `?org=${encodeURIComponent(org)}` : '';
    return post(`/patterns${qs}`, { name, ...data });
  },
  update(patternId: string, data: Partial<ExchangePattern>) {
    return put(patUrl(patternId), data);
  },
  delete(patternId: string) {
    return del(patUrl(patternId));
  },
  nodehealth(patternId: string) {
    const s = splitOrg(patternId);
    const qs = s.org ? `?org=${encodeURIComponent(s.org)}` : '';
    return get<{ nodeHealth: any[] }>(`/patterns/${encodeURIComponent(s.name)}/nodehealth${qs}`);
  },
  search(patternId: string, org?: string) {
    const qs = org ? `?org=${encodeURIComponent(org)}` : '';
    const s = splitOrg(patternId);
    return post<any>(`/patterns/${encodeURIComponent(s.name)}/search${qs}`, {});
  },
};
