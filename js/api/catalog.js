import { get } from './client.js';

const CatalogAPI = {
  listServices() {
    return get('/catalog/services');
  },
  listPatterns() {
    return get('/catalog/patterns');
  },
  orgServices(orgId) {
    return get(`/catalog/${orgId}/services`);
  },
  orgPatterns(orgId) {
    return get(`/catalog/${orgId}/patterns`);
  },
};

export { CatalogAPI };
