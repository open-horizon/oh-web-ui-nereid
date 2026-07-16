import { get, del } from './client';

export interface ServiceInstance {
  [key: string]: any;
}

export const ServiceInstanceAPI = {
  list(org?: string) {
    const params = org ? `?org=${encodeURIComponent(org)}` : '';
    return get<{ [key: string]: ServiceInstance }>(`/service-instances${params}`);
  },
  get(id: string, org?: string) {
    const params = org ? `?org=${encodeURIComponent(org)}` : '';
    return get<ServiceInstance>(`/service-instances/${encodeURIComponent(id)}${params}`);
  },
  delete(id: string, org?: string) {
    const params = org ? `?org=${encodeURIComponent(org)}` : '';
    return del(`/service-instances/${encodeURIComponent(id)}${params}`);
  },
};
