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

// Deployment policies (businessPolicy) — controls which services deploy on which nodes via constraints
export const DeploymentPolicyAPI = {
  // List with optional cross-org query parameter
  list(org?: string) {
    const qs = org ? `?org=${encodeURIComponent(org)}` : '';
    return get<{ businessPolicy: Record<string, DeploymentPolicy> }>(`/policies${qs}`);
  },
  create(name: string, data: Partial<DeploymentPolicy>) {
    return post('/policies', { name, ...data });
  },
  update(policyId: string, data: Partial<DeploymentPolicy>) {
    return put(`/policies/${encodeURIComponent(policyId)}`, data);
  },
  delete(policyId: string) {
    return del(`/policies/${encodeURIComponent(policyId)}`);
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
  delete(policyId: string) {
    return del(`/mgmtpolicies/${encodeURIComponent(policyId)}`);
  },
};
