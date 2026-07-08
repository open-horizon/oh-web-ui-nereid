// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { get } from './client';

export const CatalogAPI = {
  listServices() {
    return get<{ catalogServices: Record<string, any> }>('/catalog-services');
  },
  listPatterns() {
    return get<{ catalogPatterns: Record<string, any> }>('/catalog-patterns');
  },
};
