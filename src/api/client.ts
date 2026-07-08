// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { getConfig } from './config';

// Core HTTP request handler for all API calls.
// The session id is carried in an HttpOnly+Secure+SameSite cookie that the
// browser sends automatically, so no session header is attached here.
// Only the optional per-request privileged auth headers are added.
async function request<T = any>(
  method: string,
  path: string,
  body?: any,
): Promise<T> {
  const url = `/api${path}`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  const cfg = getConfig();
  if (cfg.agbotAuth) headers['X-Agbot-Auth'] = cfg.agbotAuth;
  if (cfg.rootAuth) headers['X-Root-Auth'] = cfg.rootAuth;
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  console.debug(`[API] ${method} ${url}`);

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
    });

    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = text; }

    console.debug(`[API] ${method} ${url} -> ${res.status}`);

    if (!res.ok) {
      // Treat 404 with no error fields as "not found" rather than failure
      if (res.status === 404 && data && typeof data === 'object' && !data.msg && !data.message && !data.error) {
        return data as T;
      }
      const errMsg = data?.msg || data?.message || data?.error || `HTTP ${res.status}`;
      throw new Error(`[${res.status}] ${errMsg}`);
    }
    return data as T;
  } catch (err) {
    if (err instanceof TypeError) {
      console.error(`[API] 网络错误: ${err.message}`);
    }
    throw err;
  }
}

export function get<T = any>(path: string) { return request<T>('GET', path); }
export function post<T = any>(path: string, body?: any) { return request<T>('POST', path, body); }
export function put<T = any>(path: string, body?: any) { return request<T>('PUT', path, body); }
export function patch<T = any>(path: string, body?: any) { return request<T>('PATCH', path, body); }
export function del<T = any>(path: string) { return request<T>('DELETE', path); }
