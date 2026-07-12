// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { get, post, put, del } from './client';

export interface ExchangeService {
  url?: string;
  version?: string;
  arch?: string;
  sharable?: string;
  public?: boolean;
  label?: string;
  description?: string;
  documentation?: string;
  owner?: string;
  lastUpdated?: string;
  deployment?: any;           // JSON string from Exchange, parsed by frontend
  deploymentSignature?: string;
  requiredServices?: any[];
  userInput?: any[];
  [key: string]: any;         // Additional Exchange fields (clusterDeployment, etc.)
}

// Split an Exchange key (org/name) into its components
function splitOrg(raw: string): { name: string; org?: string } {
  const i = raw.indexOf('/');
  return i >= 0 ? { name: raw.slice(i + 1), org: raw.slice(0, i) } : { name: raw };
}

// Build service URL with org prefix stripped and passed as query param
// This avoids Express 5 %2F issues in route matching
function svcUrl(id: string): string {
  const s = splitOrg(id);
  const qs = s.org ? `?org=${encodeURIComponent(s.org)}` : '';
  return `/services/${encodeURIComponent(s.name)}${qs}`;
}

export const ServiceAPI = {
  list(org?: string) {
    const params = org ? `?org=${encodeURIComponent(org)}` : '';
    return get<{ services: Record<string, ExchangeService> }>(`/services${params}`);
  },
  create(data: Record<string, any>, org?: string) {
    const qs = org ? `?org=${encodeURIComponent(org)}` : '';
    return post(`/services${qs}`, data);
  },
  update(serviceId: string, data: Record<string, any>) {
    return put(svcUrl(serviceId), data);
  },
  delete(serviceId: string) {
    return del(svcUrl(serviceId));
  },
  keys(serviceId: string) {
    const s = splitOrg(serviceId);
    const qs = s.org ? `?org=${encodeURIComponent(s.org)}` : '';
    return get<{ keys: string[] }>(`/services/${encodeURIComponent(s.name)}/keys${qs}`);
  },
  addKey(serviceId: string, keyId: string, key: string) {
    const s = splitOrg(serviceId);
    const qs = s.org ? `?org=${encodeURIComponent(s.org)}` : '';
    return post(`/services/${encodeURIComponent(s.name)}/keys${qs}`, { keyId, key });
  },
  deleteKey(serviceId: string, keyId: string) {
    const s = splitOrg(serviceId);
    const qs = s.org ? `?org=${encodeURIComponent(s.org)}` : '';
    return del(`/services/${encodeURIComponent(s.name)}/keys/${keyId}${qs}`);
  },
  dockauths(serviceId: string) {
    const s = splitOrg(serviceId);
    const qs = s.org ? `?org=${encodeURIComponent(s.org)}` : '';
    return get<{ dockauths: any[] }>(`/services/${encodeURIComponent(s.name)}/dockauths${qs}`);
  },
  addDockauth(serviceId: string, data: any) {
    const s = splitOrg(serviceId);
    const qs = s.org ? `?org=${encodeURIComponent(s.org)}` : '';
    return post(`/services/${encodeURIComponent(s.name)}/dockauths${qs}`, data);
  },
  deleteDockauth(serviceId: string, authId: string) {
    const s = splitOrg(serviceId);
    const qs = s.org ? `?org=${encodeURIComponent(s.org)}` : '';
    return del(`/services/${encodeURIComponent(s.name)}/dockauths/${authId}${qs}`);
  },
};
