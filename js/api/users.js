import { get, post, put, patch, del } from './client.js';

const UserAPI = {
  list(orgId, params = {}) {
    return get(`/orgs/${orgId}/users`, params);
  },
  get(orgId, username) {
    return get(`/orgs/${orgId}/users/${username}`);
  },
  create(orgId, username, data) {
    return post(`/orgs/${orgId}/users/${username}`, data);
  },
  update(orgId, username, data) {
    return put(`/orgs/${orgId}/users/${username}`, data);
  },
  patch(orgId, username, data) {
    return patch(`/orgs/${orgId}/users/${username}`, data);
  },
  delete(orgId, username) {
    return del(`/orgs/${orgId}/users/${username}`);
  },
  changePw(orgId, username, data) {
    return post(`/orgs/${orgId}/users/${username}/changepw`, data);
  },
  confirm(orgId, username) {
    return post(`/orgs/${orgId}/users/${username}/confirm`);
  },
  getByApiKey(orgId) {
    return get(`/orgs/${orgId}/users/apikey`);
  },
  // API key management
  listApiKeys(orgId, username) {
    return get(`/orgs/${orgId}/users/${username}/apikeys`);
  },
  createApiKey(orgId, username, data) {
    return post(`/orgs/${orgId}/users/${username}/apikeys`, data);
  },
  deleteApiKey(orgId, username, keyId) {
    return del(`/orgs/${orgId}/users/${username}/apikeys/${keyId}`);
  },
};

export { UserAPI };
