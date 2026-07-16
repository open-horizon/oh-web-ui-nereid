import { get, post, put, del } from './client';

export interface ManagementPolicy {
  name?: string;
  label?: string;
  description?: string;
  patterns?: string[];
  agentUpgradePolicy?: any;
  owner?: string;
  lastUpdated?: string;
  [key: string]: any;
}

export const MgmtPolicyAPI = {
  list(org?: string) {
    const params = org ? `?org=${encodeURIComponent(org)}` : '';
    return get<{ managementPolicies: Record<string, ManagementPolicy> }>(`/mgmtpolicies${params}`);
  },
  create(data: Record<string, any>, org?: string) {
    const params = org ? `?org=${encodeURIComponent(org)}` : '';
    return post(`/mgmtpolicies${params}`, data);
  },
  update(id: string, data: Record<string, any>, org?: string) {
    const encoded = encodeURIComponent(id);
    const params = org ? `?org=${encodeURIComponent(org)}` : '';
    return put(`/mgmtpolicies/${encoded}${params}`, data);
  },
  delete(id: string, org?: string) {
    const encoded = encodeURIComponent(id);
    const params = org ? `?org=${encodeURIComponent(org)}` : '';
    return del(`/mgmtpolicies/${encoded}${params}`);
  },
  status(id: string, org?: string) {
    const encoded = encodeURIComponent(id);
    const params = org ? `?org=${encodeURIComponent(org)}` : '';
    return get(`/mgmtpolicies/${encoded}/status${params}`);
  },
};
