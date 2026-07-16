import { get, put, del } from './client';

export interface Secret {
  name: string;
  key: string;
  value?: string;
  [key: string]: any;
}

export const SecretAPI = {
  list(org?: string, scope = 'org', user = '', node = '') {
    const params = new URLSearchParams();
    if (org) params.set('org', org);
    if (scope) params.set('scope', scope);
    if (user) params.set('user', user);
    if (node) params.set('node', node);
    const qs = params.toString() ? `?${params}` : '';
    return get<{ secrets?: Record<string, Secret> }>(`/secrets${qs}`);
  },
  create(data: { name: string; key: string; value: string }, org?: string, scope = 'org', user = '', node = '') {
    const params = new URLSearchParams();
    if (org) params.set('org', org);
    if (scope) params.set('scope', scope);
    if (user) params.set('user', user);
    if (node) params.set('node', node);
    const qs = params.toString() ? `?${params}` : '';
    return put(`/secrets${qs}`, data);
  },
  delete(name: string, org?: string, scope = 'org', user = '', node = '') {
    const params = new URLSearchParams();
    if (org) params.set('org', org);
    if (scope) params.set('scope', scope);
    if (user) params.set('user', user);
    if (node) params.set('node', node);
    const qs = params.toString() ? `?${params}` : '';
    return del(`/secrets/${encodeURIComponent(name)}${qs}`);
  },
};
