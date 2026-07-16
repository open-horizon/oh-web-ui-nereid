import { put } from './client';

export const OrgConfigAPI = {
  update(orgId: string, data: { description?: string; label?: string; heartbeatIntervals?: any; limits?: any }) {
    return put(`/organizations/${encodeURIComponent(orgId)}/config`, data);
  },
};
