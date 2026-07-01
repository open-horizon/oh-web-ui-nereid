import { get, patch, put } from './client';

export interface ExchangeNode {
  name?: string;
  nodeType?: string;
  architecture?: string;
  pattern?: string;         // Pattern assigned to node (or null for policy-based)
  token?: string;
  owner?: string;
  lastHeartbeat?: string;
  publicKey?: string;
  [key: string]: any;
}

export interface NodePolicy {
  properties?: Record<string, any>[];
  constraints?: string[];
  [key: string]: any;
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

export const NodeAPI = {
  list() {
    return get<{ nodes: Record<string, ExchangeNode> }>('/nodes');
  },
  // Fetch agreements/containers running on a node
  services(nodeId: string) {
    return get<{ services: NodeServiceStatus[] }>(`/nodes/${encodeURIComponent(nodeId)}/services`);
  },
  // PATCH node to set pattern (requires root auth for already-registered nodes)
  setPattern(nodeId: string, pattern: string) {
    return patch(`/nodes/${encodeURIComponent(nodeId)}`, { pattern });
  },
  getPolicy(nodeId: string) {
    return get<NodePolicy>(`/nodes/${encodeURIComponent(nodeId)}/policy`);
  },
  // PUT replaces the entire policy (not a partial update)
  updatePolicy(nodeId: string, policy: NodePolicy) {
    return put(`/nodes/${encodeURIComponent(nodeId)}/policy`, policy);
  },
};
