import { get, post, put, patch, del } from './client.js';

const OrgAPI = {
  list() {
    return get('/orgs');
  },
  get(orgId) {
    return get(`/orgs/${orgId}`);
  },
  create(orgId, data) {
    return post(`/orgs/${orgId}`, data);
  },
  update(orgId, data) {
    return put(`/orgs/${orgId}`, data);
  },
  patch(orgId, data) {
    return patch(`/orgs/${orgId}`, data);
  },
  delete(orgId) {
    return del(`/orgs/${orgId}`);
  },
  status(orgId) {
    return get(`/orgs/${orgId}/status`);
  },
  maxChangeId() {
    return get('/changes/maxchangeid');
  },
};

export { OrgAPI };
