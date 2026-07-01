import { get, post, put, del } from './client.js';

const HaGroupAPI = {
  list(orgId) {
    return get(`/orgs/${orgId}/hagroups`);
  },
  get(orgId, groupId) {
    return get(`/orgs/${orgId}/hagroups/${groupId}`);
  },
  create(orgId, groupId, data) {
    return post(`/orgs/${orgId}/hagroups/${groupId}`, data);
  },
  update(orgId, groupId, data) {
    return put(`/orgs/${orgId}/hagroups/${groupId}`, data);
  },
  delete(orgId, groupId) {
    return del(`/orgs/${orgId}/hagroups/${groupId}`);
  },
  addNode(orgId, groupId, nodeId) {
    return post(`/orgs/${orgId}/hagroups/${groupId}/nodes/${nodeId}`);
  },
  removeNode(orgId, groupId, nodeId) {
    return del(`/orgs/${orgId}/hagroups/${groupId}/nodes/${nodeId}`);
  },
};

export { HaGroupAPI };
