import { get, put, del } from './client';

export interface Organization {
  description?: string;
  label?: string;
  lastUpdated?: string;
  nodeCount?: number;
  userCount?: number;
  serviceCount?: number;
  patternCount?: number;
  [key: string]: any;
}

export interface OrgListResponse {
  orgs: Record<string, Organization>;
  lastIndex?: number;
}

export interface OrgStatusResponse {
  nodes: number;
  services: number;
  users: number;
  agbots: number;
}

export const OrgAPI = {
  list() {
    return get<OrgListResponse>('/organizations');
  },
  create(orgId: string, data: { label?: string; description?: string }) {
    return put(`/organizations/${orgId}`, data);
  },
  delete(orgId: string) {
    return del(`/organizations/${orgId}`);
  },
  status() {
    return get<OrgStatusResponse>('/status');
  },
};
