// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { get, patch, put, del } from './client';

export interface ExchangeNode {
  name?: string;
  nodeType?: string;
  architecture?: string;
  pattern?: string;
  token?: string;
  owner?: string;
  lastHeartbeat?: string;
  publicKey?: string;
  userInput?: OneUserInputService[];
  [key: string]: any;
}

export interface NodePolicy {
  properties?: Record<string, any>[];
  constraints?: string[];
  [key: string]: any;
}

export interface OneUserInputValue {
  name: string;
  value: any;
}

export interface OneUserInputService {
  serviceOrgid: string;
  serviceUrl: string;
  serviceArch?: string;
  serviceVersionRange?: string;
  inputs: OneUserInputValue[];
}

export interface NodeServiceStatus {
  org?: string;
  url?: string;
  version?: string;
  arch?: string;
  agreementId?: string;
  serviceUrl?: string;
  [key: string]: any;
}

// Split an Exchange key (org/name) — org goes to ?org= to avoid Express 5 %2F decoding issue
function splitOrg(raw: string): { name: string; org?: string } {
  const i = raw.indexOf('/');
  return i >= 0 ? { name: raw.slice(i + 1), org: raw.slice(0, i) } : { name: raw };
}
function nodeUrl(id: string): string {
  const s = splitOrg(id);
  const qs = s.org ? `?org=${encodeURIComponent(s.org)}` : '';
  return `/nodes/${encodeURIComponent(s.name)}${qs}`;
}

// All node API functions accept an optional `org` parameter.
// When set (platform user switching orgs), appends ?org=... to query the targeted org's data.
// When omitted, backend defaults to the session's orgId.
export const NodeAPI = {
  list(org?: string) {
    const qs = org ? `?org=${encodeURIComponent(org)}` : '';
    return get<{ nodes: Record<string, ExchangeNode> }>(`/nodes${qs}`);
  },
  // Fetch agreements/containers running on a node
  services(nodeId: string, org?: string) {
    const s = splitOrg(nodeId);
    const orgQ = org || s.org;
    const qs = orgQ ? `?org=${encodeURIComponent(orgQ)}` : '';
    return get<{ services: NodeServiceStatus[] }>(`/nodes/${encodeURIComponent(s.name)}/services${qs}`);
  },
  // PATCH node to set pattern (requires root auth for already-registered nodes)
  setPattern(nodeId: string, pattern: string, org?: string) {
    const s = splitOrg(nodeId);
    const orgQ = org || s.org;
    const qs = orgQ ? `?org=${encodeURIComponent(orgQ)}` : '';
    return patch(`/nodes/${encodeURIComponent(s.name)}${qs}`, { pattern });
  },
  getPolicy(nodeId: string, org?: string) {
    const s = splitOrg(nodeId);
    const orgQ = org || s.org;
    const qs = orgQ ? `?org=${encodeURIComponent(orgQ)}` : '';
    return get<NodePolicy>(`/nodes/${encodeURIComponent(s.name)}/policy${qs}`);
  },
  // PUT replaces the entire policy (not a partial update)
  updatePolicy(nodeId: string, policy: NodePolicy, org?: string) {
    const s = splitOrg(nodeId);
    const orgQ = org || s.org;
    const qs = orgQ ? `?org=${encodeURIComponent(orgQ)}` : '';
    return put(`/nodes/${encodeURIComponent(s.name)}/policy${qs}`, policy);
  },
  deleteNode(nodeId: string, org?: string) {
    const s = splitOrg(nodeId);
    const orgQ = org || s.org;
    const qs = orgQ ? `?org=${encodeURIComponent(orgQ)}` : '';
    return del(`/nodes/${encodeURIComponent(s.name)}${qs}`);
  },
  agreements(nodeId: string, org?: string) {
    const s = splitOrg(nodeId);
    const orgQ = org || s.org;
    const qs = orgQ ? `?org=${encodeURIComponent(orgQ)}` : '';
    return get<{ agreements: Record<string, any> }>(`/nodes/${encodeURIComponent(s.name)}/agreements${qs}`);
  },
  errors(nodeId: string, org?: string) {
    const s = splitOrg(nodeId);
    const orgQ = org || s.org;
    const qs = orgQ ? `?org=${encodeURIComponent(orgQ)}` : '';
    return get<{ errors: any[] }>(`/nodes/${encodeURIComponent(s.name)}/errors${qs}`);
  },
  updateUserInput(nodeId: string, userInput: any[], org?: string) {
    const s = splitOrg(nodeId);
    const orgQ = org || s.org;
    const qs = orgQ ? `?org=${encodeURIComponent(orgQ)}` : '';
    return patch(`/nodes/${encodeURIComponent(s.name)}${qs}`, { userInput });
  },
  managementStatus(nodeId: string, org?: string) {
    const s = splitOrg(nodeId);
    const orgQ = org || s.org;
    const qs = orgQ ? `?org=${encodeURIComponent(orgQ)}` : '';
    return get<{ managementStatus: Record<string, any> }>(`/nodes/${encodeURIComponent(s.name)}/managementStatus${qs}`);
  },
};
