import { get, post, put, patch, del } from './client.js';

const ServiceAPI = {
  list(orgId, params = {}) {
    return get(`/orgs/${orgId}/services`, params);
  },
  get(orgId, serviceId) {
    return get(`/orgs/${orgId}/services/${serviceId}`);
  },
  create(orgId, data) {
    return post(`/orgs/${orgId}/services`, data);
  },
  update(orgId, serviceId, data) {
    return put(`/orgs/${orgId}/services/${serviceId}`, data);
  },
  patch(orgId, serviceId, data) {
    return patch(`/orgs/${orgId}/services/${serviceId}`, data);
  },
  delete(orgId, serviceId) {
    return del(`/orgs/${orgId}/services/${serviceId}`);
  },
  // Docker auths
  listDockAuths(orgId, serviceId) {
    return get(`/orgs/${orgId}/services/${serviceId}/dockauths`);
  },
  createDockAuth(orgId, serviceId, data) {
    return post(`/orgs/${orgId}/services/${serviceId}/dockauths`, data);
  },
  deleteDockAuth(orgId, serviceId, authId) {
    return del(`/orgs/${orgId}/services/${serviceId}/dockauths/${authId}`);
  },
  // Keys
  listKeys(orgId, serviceId) {
    return get(`/orgs/${orgId}/services/${serviceId}/keys`);
  },
  putKey(orgId, serviceId, keyId, data) {
    return put(`/orgs/${orgId}/services/${serviceId}/keys/${keyId}`, data);
  },
  deleteKey(orgId, serviceId, keyId) {
    return del(`/orgs/${orgId}/services/${serviceId}/keys/${keyId}`);
  },
  // Policy
  getPolicy(orgId, serviceId) {
    return get(`/orgs/${orgId}/services/${serviceId}/policy`);
  },
  setPolicy(orgId, serviceId, data) {
    return put(`/orgs/${orgId}/services/${serviceId}/policy`, data);
  },
  deletePolicy(orgId, serviceId) {
    return del(`/orgs/${orgId}/services/${serviceId}/policy`);
  },
};

export { ServiceAPI };
