// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { get, put, del } from './client';

export interface Organization {
  description?: string;
  label?: string;
  lastUpdated?: string;
  nodeCount?: number;
  userCount?: number;
  serviceCount?: number;
  patternCount?: number;
  [key: string]: any;
}

export interface OrgListResponse {
  orgs: Record<string, Organization>;
  lastIndex?: number;
}

export interface OrgStatusResponse {
  nodes: number;
  services: number;
  users: number;
  agbots: number;
  patterns: number;
  policies: number;
  mgmtPolicies: number;
}

export const OrgAPI = {
  list() {
    return get<OrgListResponse>('/organizations');
  },
  create(orgId: string, data: { label?: string; description?: string }) {
    return put(`/organizations/${orgId}`, data);
  },
  delete(orgId: string) {
    return del(`/organizations/${orgId}`);
  },
  status() {
    return get<OrgStatusResponse>('/status');
  },
};

export interface DashboardResponse {
  orgId: string;
  orgType: string;
  nodes: number;
  users: number;
  services: number;
  agbots: number;
  patterns: number;
  policies: number;
  mgmtPolicies: number;
  onlineNodes: number;
  serverUptimeMs: number;
  serverStartedAt: string;
  recentNodes: { id: string; lastHeartbeat: string; pattern?: string; registered: number }[];
  // Existing fields
  nodeHealth: { healthy: number; unhealthy: number; unknown: number };
  totalAgreements: number;
  activeAgreements: number;
  totalErrors: number;
  recentErrors: { id?: string; message?: string; timestamp?: string }[];
  serviceInstances: number;
  exchangeConnected: boolean;
  exchangeLatency: number;
  notifications: { type: 'info' | 'warning' | 'error'; message: string }[];
  // New fields
  nodeVersionList: { version: string; count: number }[];
  unhealthyNodes: { id: string; lastHeartbeat: string; org: string }[];
  orgResources: Record<string, { nodes: number; users: number; services: number; agbots: number }>;
  recentChanges: any[];
  bffResources: { memoryUsedMB: number; memoryTotalMB: number; memoryRssMB: number; uptimeMs: number };
}

export const DashboardAPI = {
  get() {
    return get<DashboardResponse>('/dashboard');
  },
};
