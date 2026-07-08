// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { get, post, put, del } from './client';

export interface ExchangeAgbot {
  name?: string;
  owner?: string;
  lastUpdated?: string;
  lastHeartbeat?: string;
  publicKey?: string;
  msgEndPoint?: string;       // Agbot messaging endpoint URL
  token?: string;
  agreements?: Record<string, any>;
  [key: string]: any;
}

export interface AgbotPattern {
  patternOrgid: string;
  pattern: string;
  nodeOrgid: string;
  lastUpdated: string;
}

export interface AgbotBusinessPol {
  businessPolOrgid: string;
  businessPol: string;
  nodeOrgid: string;
  lastUpdated: string;
}

// Split Exchange key (org/name) into org and name components
function splitId(id: string): { name: string; org?: string } {
  const i = id.indexOf('/');
  return i >= 0 ? { name: id.slice(i + 1), org: id.slice(0, i) } : { name: id };
}

// Build agbot URL with org as query param and name URL-encoded
// This keeps the org out of the path to avoid Express 5 %2F issues
function agbotUrl(id: string, suffix: string, org?: string): string {
  const s = splitId(id);
  const params = new URLSearchParams();
  if (org) params.set('org', org);
  else if (s.org) params.set('org', s.org);
  const qs = params.toString();
  return `/agbots/${encodeURIComponent(s.name)}${suffix}${qs ? '?' + qs : ''}`;
}

export const AgbotAPI = {
  list(org?: string) {
    return get<{ agbots: Record<string, ExchangeAgbot> }>(`/agbots${org ? `?org=${encodeURIComponent(org)}` : ''}`);
  },

  get(id: string, org?: string) {
    return get<{ agbots: Record<string, ExchangeAgbot> }>(agbotUrl(id, '', org));
  },

  create(id: string, body: { token: string; name?: string; msgEndPoint?: string; publicKey?: string }, org?: string) {
    return put<{ code: string; msg: string }>(agbotUrl(id, '', org), body);
  },

  update(id: string, body: Partial<ExchangeAgbot>, org?: string) {
    return put<{ code: string; msg: string }>(agbotUrl(id, '', org), body);
  },

  remove(id: string, org?: string) {
    return del<{ code: string; msg: string }>(agbotUrl(id, '', org));
  },

  // Patterns associated with this agbot (fetched via sub-endpoint, not from main agbot body)
  listPatterns(id: string, org?: string) {
    return get<{ patterns: Record<string, AgbotPattern> }>(agbotUrl(id, '/patterns', org));
  },

  addPattern(agbotId: string, patternOrgid: string, pattern: string, org?: string) {
    return post<{ code: string; msg: string }>(agbotUrl(agbotId, '/patterns', org), { patternOrgid, pattern });
  },

  removePattern(agbotId: string, patternId: string, org?: string) {
    const p = splitId(patternId);
    return del<{ code: string; msg: string }>(agbotUrl(agbotId, `/patterns/${encodeURIComponent(p.name)}`, org));
  },

  // Business policies associated with this agbot
  listBusinessPols(id: string, org?: string) {
    return get<{ businessPols: Record<string, AgbotBusinessPol> }>(agbotUrl(id, '/businesspols', org));
  },

  addBusinessPol(agbotId: string, businessPolOrgid: string, businessPol: string, org?: string) {
    return post<{ code: string; msg: string }>(agbotUrl(agbotId, '/businesspols', org), { businessPolOrgid, businessPol });
  },

  removeBusinessPol(agbotId: string, polId: string, org?: string) {
    const p = splitId(polId);
    return del<{ code: string; msg: string }>(agbotUrl(agbotId, `/businesspols/${encodeURIComponent(p.name)}`, org));
  },
  listAgreements(id: string, org?: string) {
    return get<{ agreements: Record<string, any> }>(agbotUrl(id, '/agreements', org));
  },
};
