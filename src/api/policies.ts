// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { get, post, put, del } from './client';

export interface DeploymentPolicy {
  label?: string;
  description?: string;
  service?: Record<string, any>;
  constraints?: string[];
  properties?: any[];
  userInput?: any[];
  secretBinding?: any[];
  owner?: string;
  lastUpdated?: string;
  created?: string;
  [key: string]: any;
}

export interface MgmtPolicy {
  label?: string;
  description?: string;
  owner?: string;
  lastUpdated?: string;
  pattern?: { type?: string };
  agentUpgradePolicy?: { type?: string };
  [key: string]: any;
}

function splitOrg(raw: string): { name: string; org?: string } {
  const i = raw.indexOf('/');
  return i >= 0 ? { name: raw.slice(i + 1), org: raw.slice(0, i) } : { name: raw };
}
function polUrl(id: string): string {
  const s = splitOrg(id);
  const qs = s.org ? `?org=${encodeURIComponent(s.org)}` : '';
  return `/policies/${encodeURIComponent(s.name)}${qs}`;
}
function mgmtUrl(id: string): string {
  const s = splitOrg(id);
  const qs = s.org ? `?org=${encodeURIComponent(s.org)}` : '';
  return `/mgmtpolicies/${encodeURIComponent(s.name)}${qs}`;
}

// Deployment policies (businessPolicy) — controls which services deploy on which nodes via constraints
export const DeploymentPolicyAPI = {
  // List with optional cross-org query parameter
  list(org?: string) {
    const qs = org ? `?org=${encodeURIComponent(org)}` : '';
    return get<{ businessPolicy: Record<string, DeploymentPolicy> }>(`/policies${qs}`);
  },
  create(name: string, data: Partial<DeploymentPolicy>, org?: string) {
    const qs = org ? `?org=${encodeURIComponent(org)}` : '';
    return post(`/policies${qs}`, { name, ...data });
  },
  update(policyId: string, data: Partial<DeploymentPolicy>) {
    return put(polUrl(policyId), data);
  },
  delete(policyId: string) {
    return del(polUrl(policyId));
  },
};

// Management policies — node-level lifecycle management (pattern/businessPolicy/service type)
export const MgmtPolicyAPI = {
  list() {
    return get<{ managementPolicy: Record<string, MgmtPolicy> }>('/mgmtpolicies');
  },
  create(name: string, data: Partial<MgmtPolicy>) {
    return post('/mgmtpolicies', { name, ...data });
  },
  update(policyId: string, data: Partial<MgmtPolicy>) {
    return put(mgmtUrl(policyId), data);
  },
  delete(policyId: string) {
    return del(mgmtUrl(policyId));
  },
};
