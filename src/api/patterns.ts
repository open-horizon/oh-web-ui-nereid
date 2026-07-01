import { get, post, put, del } from './client';

export interface ExchangePattern {
  label?: string;
  description?: string;
  public?: boolean;
  owner?: string;
  lastUpdated?: string;
  services?: any[];        // Key field — named "services" not "patternServices"
  servicesRef?: any[];
  [key: string]: any;
}

export const PatternAPI = {
  list(org?: string) {
    const qs = org ? `?org=${encodeURIComponent(org)}` : '';
    return get<{ patterns: Record<string, ExchangePattern> }>(`/patterns${qs}`);
  },
  create(name: string, data: Partial<ExchangePattern>) {
    return post('/patterns', { name, ...data });
  },
  update(patternId: string, data: Partial<ExchangePattern>) {
    return put(`/patterns/${encodeURIComponent(patternId)}`, data);
  },
  delete(patternId: string) {
    return del(`/patterns/${encodeURIComponent(patternId)}`);
  },
};
