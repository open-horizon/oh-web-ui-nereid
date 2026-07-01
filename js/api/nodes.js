import { get, post, put, patch, del } from './client.js';

const NodeAPI = {
  list(orgId, params = {}) {
    return get(`/orgs/${orgId}/nodes`, params);
  },
  get(orgId, nodeId) {
    return get(`/orgs/${orgId}/nodes/${nodeId}`);
  },
  details(orgId) {
    return get(`/orgs/${orgId}/node-details`);
  },
  create(orgId, nodeId, data) {
    return put(`/orgs/${orgId}/nodes/${nodeId}`, data);
  },
  update(orgId, nodeId, data) {
    return put(`/orgs/${orgId}/nodes/${nodeId}`, data);
  },
  patch(orgId, nodeId, data) {
    return patch(`/orgs/${orgId}/nodes/${nodeId}`, data);
  },
  delete(orgId, nodeId) {
    return del(`/orgs/${orgId}/nodes/${nodeId}`);
  },
  heartbeat(orgId, nodeId) {
    return post(`/orgs/${orgId}/nodes/${nodeId}/heartbeat`);
  },
  // Policies
  getPolicy(orgId, nodeId) {
    return get(`/orgs/${orgId}/nodes/${nodeId}/policy`);
  },
  setPolicy(orgId, nodeId, data) {
    return put(`/orgs/${orgId}/nodes/${nodeId}/policy`, data);
  },
  deletePolicy(orgId, nodeId) {
    return del(`/orgs/${orgId}/nodes/${nodeId}/policy`);
  },
  // Status
  getStatus(orgId, nodeId) {
    return get(`/orgs/${orgId}/nodes/${nodeId}/status`);
  },
  setStatus(orgId, nodeId, data) {
    return put(`/orgs/${orgId}/nodes/${nodeId}/status`, data);
  },
  // Errors
  getErrors(orgId, nodeId) {
    return get(`/orgs/${orgId}/nodes/${nodeId}/errors`);
  },
  putErrors(orgId, nodeId, data) {
    return put(`/orgs/${orgId}/nodes/${nodeId}/errors`, data);
  },
  deleteErrors(orgId, nodeId) {
    return del(`/orgs/${orgId}/nodes/${nodeId}/errors`);
  },
  // Agreements
  getAgreements(orgId, nodeId) {
    return get(`/orgs/${orgId}/nodes/${nodeId}/agreements`);
  },
  // Management status
  getMgmtStatus(orgId, nodeId) {
    return get(`/orgs/${orgId}/nodes/${nodeId}/managementStatus`);
  },
  // Service config state
  setServiceConfigState(orgId, nodeId, data) {
    return post(`/orgs/${orgId}/nodes/${nodeId}/services_configstate`, data);
  },
};

export { NodeAPI };
