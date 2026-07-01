import { get, post, put, patch, del } from './client.js';

const BusinessPolicyAPI = {
  list(orgId, params = {}) {
    return get(`/orgs/${orgId}/business/policies`, params);
  },
  get(orgId, policyId) {
    return get(`/orgs/${orgId}/business/policies/${policyId}`);
  },
  create(orgId, policyId, data) {
    return post(`/orgs/${orgId}/business/policies/${policyId}`, data);
  },
  update(orgId, policyId, data) {
    return put(`/orgs/${orgId}/business/policies/${policyId}`, data);
  },
  patch(orgId, policyId, data) {
    return patch(`/orgs/${orgId}/business/policies/${policyId}`, data);
  },
  delete(orgId, policyId) {
    return del(`/orgs/${orgId}/business/policies/${policyId}`);
  },
  searchNodes(orgId, policyId, data = {}) {
    return post(`/orgs/${orgId}/business/policies/${policyId}/search`, data);
  },
};

const MgmtPolicyAPI = {
  list(orgId, params = {}) {
    return get(`/orgs/${orgId}/managementpolicies`, params);
  },
  get(orgId, policyId) {
    return get(`/orgs/${orgId}/managementpolicies/${policyId}`);
  },
  create(orgId, policyId, data) {
    return post(`/orgs/${orgId}/managementpolicies/${policyId}`, data);
  },
  update(orgId, policyId, data) {
    return put(`/orgs/${orgId}/managementpolicies/${policyId}`, data);
  },
  delete(orgId, policyId) {
    return del(`/orgs/${orgId}/managementpolicies/${policyId}`);
  },
};

export { BusinessPolicyAPI, MgmtPolicyAPI };
