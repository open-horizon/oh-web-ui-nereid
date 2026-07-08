// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { get, put, del } from './client';

export interface AgentFileVersion {
  agentSoftwareVersions?: string[];
  agentConfigVersions?: string[];
  agentCertVersions?: string[];
  lastUpdated?: string;
}

export const AgentFileVersionAPI = {
  get() {
    return get<AgentFileVersion>('/agentfileversion');
  },
  update(data: Partial<AgentFileVersion>) {
    return put('/agentfileversion', data);
  },
  delete() {
    return del('/agentfileversion');
  },
};
