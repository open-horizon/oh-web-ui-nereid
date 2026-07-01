import { get, post, put, patch, del } from './client.js';

const AgbotAPI = {
  list(orgId, params = {}) {
    return get(`/orgs/${orgId}/agbots`, params);
  },
  get(orgId, agbotId) {
    return get(`/orgs/${orgId}/agbots/${agbotId}`);
  },
  create(orgId, agbotId, data) {
    return put(`/orgs/${orgId}/agbots/${agbotId}`, data);
  },
  update(orgId, agbotId, data) {
    return put(`/orgs/${orgId}/agbots/${agbotId}`, data);
  },
  patch(orgId, agbotId, data) {
    return patch(`/orgs/${orgId}/agbots/${agbotId}`, data);
  },
  delete(orgId, agbotId) {
    return del(`/orgs/${orgId}/agbots/${agbotId}`);
  },
  heartbeat(orgId, agbotId) {
    return post(`/orgs/${orgId}/agbots/${agbotId}/heartbeat`);
  },
  // Messages
  listMsgs(orgId, agbotId) {
    return get(`/orgs/${orgId}/agbots/${agbotId}/msgs`);
  },
  sendMsg(orgId, agbotId, data) {
    return post(`/orgs/${orgId}/agbots/${agbotId}/msgs`, data);
  },
  deleteMsg(orgId, agbotId, msgId) {
    return del(`/orgs/${orgId}/agbots/${agbotId}/msgs/${msgId}`);
  },
  // Patterns
  listPatterns(orgId, agbotId) {
    return get(`/orgs/${orgId}/agbots/${agbotId}/patterns`);
  },
  addPattern(orgId, agbotId, data) {
    return post(`/orgs/${orgId}/agbots/${agbotId}/patterns`, data);
  },
  deletePattern(orgId, agbotId, patId) {
    return del(`/orgs/${orgId}/agbots/${agbotId}/patterns/${patId}`);
  },
  deleteAllPatterns(orgId, agbotId) {
    return del(`/orgs/${orgId}/agbots/${agbotId}/patterns`);
  },
  // Business policies
  listBusinessPols(orgId, agbotId) {
    return get(`/orgs/${orgId}/agbots/${agbotId}/businesspols`);
  },
  addBusinessPol(orgId, agbotId, data) {
    return post(`/orgs/${orgId}/agbots/${agbotId}/businesspols`, data);
  },
  deleteBusinessPol(orgId, agbotId, polId) {
    return del(`/orgs/${orgId}/agbots/${agbotId}/businesspols/${polId}`);
  },
  // Agreements
  listAgreements(orgId, agbotId) {
    return get(`/orgs/${orgId}/agbots/${agbotId}/agreements`);
  },
  getAgreement(orgId, agbotId, agId) {
    return get(`/orgs/${orgId}/agbots/${agbotId}/agreements/${agId}`);
  },
};

export { AgbotAPI };
