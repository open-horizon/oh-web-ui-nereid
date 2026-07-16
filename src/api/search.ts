// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { post, get } from './client';

export interface NodeSearchResult {
  nodes: Record<string, any>;
  total: number;
}

export interface NodeHealthResult {
  [nodeId: string]: {
    updateNeeded: boolean;
    missingServices: any[];
  };
}

export interface ChangeIdResult {
  maxChangeId: number;
}

export const SearchAPI = {
  // Search nodes by service
  nodesByService(org: string, body: { service: string; serviceVersionRange?: string }) {
    return post<NodeSearchResult>(`/search/nodes/service?org=${encodeURIComponent(org)}`, body);
  },

  // Search nodes by error
  nodesByError(org: string, body?: { error?: string }) {
    return post<NodeSearchResult>(`/search/nodes/error?org=${encodeURIComponent(org)}`, body || {});
  },

  // Get all node errors
  allNodeErrors(org: string) {
    return get<Record<string, any>>(`/search/nodes/error/all?org=${encodeURIComponent(org)}`);
  },

  // Search node health for a pattern
  nodeHealth(org: string, body: { pattern: string; service?: string }) {
    return post<NodeHealthResult>(`/search/nodehealth?org=${encodeURIComponent(org)}`, body);
  },
};

export const ChangesAPI = {
  // Get max change ID
  maxChangeId() {
    return get<ChangeIdResult>('/changes/maxchangeid');
  },

  // List changes between two change IDs
  list(since: number, until: number) {
    return post<{ changes: any[] }>('/changes', { since, until });
  },

  // Register for changes
  register(org: string, body: { id: string; heartbeatInterval?: number }) {
    return post<any>(`/changes?org=${encodeURIComponent(org)}`, body);
  },
};

export const MyOrgsAPI = {
  list() {
    return post<{ orgs: Record<string, any> }>('/myorgs');
  },
};
