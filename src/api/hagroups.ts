import { get } from './client';

export interface HaGroup {
  name?: string;
  owner?: string;
  members?: string[];
  lastUpdated?: string;
  [key: string]: any;
}

export const HaGroupAPI = {
  list() {
    return get<{ hagroups: Record<string, HaGroup> }>('/hagroups');
  },
};
