import { get, post, put, patch, del } from './client.js';

const PatternAPI = {
  list(orgId, params = {}) {
    return get(`/orgs/${orgId}/patterns`, params);
  },
  get(orgId, patternId) {
    return get(`/orgs/${orgId}/patterns/${patternId}`);
  },
  create(orgId, patternId, data) {
    return post(`/orgs/${orgId}/patterns/${patternId}`, data);
  },
  update(orgId, patternId, data) {
    return put(`/orgs/${orgId}/patterns/${patternId}`, data);
  },
  patch(orgId, patternId, data) {
    return patch(`/orgs/${orgId}/patterns/${patternId}`, data);
  },
  delete(orgId, patternId) {
    return del(`/orgs/${orgId}/patterns/${patternId}`);
  },
  searchNodes(orgId, patternId, data = {}) {
    return post(`/orgs/${orgId}/patterns/${patternId}/search`, data);
  },
  nodeHealth(orgId, patternId, data = {}) {
    return post(`/orgs/${orgId}/patterns/${patternId}/nodehealth`, data);
  },
  // Keys
  listKeys(orgId, patternId) {
    return get(`/orgs/${orgId}/patterns/${patternId}/keys`);
  },
  putKey(orgId, patternId, keyId, data) {
    return put(`/orgs/${orgId}/patterns/${patternId}/keys/${keyId}`, data);
  },
  deleteKey(orgId, patternId, keyId) {
    return del(`/orgs/${orgId}/patterns/${patternId}/keys/${keyId}`);
  },
};

export { PatternAPI };
