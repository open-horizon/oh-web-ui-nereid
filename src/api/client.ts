import { getConfig } from './config';

// Core HTTP request handler for all API calls.
// The session id is carried in an HttpOnly+Secure+SameSite cookie that the
// browser sends automatically. Mutations (POST/PUT/PATCH/DELETE) include the
// CSRF token from the current session config.
async function request<T = any>(
  method: string,
  path: string,
  body?: any,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const url = `/api${path}`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  const cfg = getConfig();
  // Attach CSRF token on state-changing requests
  if (cfg.csrfToken && method !== 'GET') {
    headers['X-Csrf-Token'] = cfg.csrfToken;
  }
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (extraHeaders) Object.assign(headers, extraHeaders);

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
      if (res.status === 404 && data && typeof data === 'object' && !data.msg && !data.message && !data.error) {
        return data as T;
      }
      const errMsg = data?.msg || data?.message || data?.error || `请求失败 (${res.status})`;
      if (res.status === 401) {
        const { clearSession } = await import('./config');
        clearSession();
        window.location.href = '/login';
      }
      throw new Error(errMsg);
    }
    return data as T;
  } catch (err) {
    if (err instanceof TypeError) {
      console.error(`[API] network error: ${err.message}`);
      throw new Error('Cannot connect to server, please check if backend is running');
    }
    throw err;
  }
}

// Typed HTTP helpers wrapping request(). Paths are relative (e.g. "/nodes") and
// automatically prefixed with /api by the vite proxy during dev. Mutations automatically
// attach X-Csrf-Token from the cookie store for CSRF double-submit validation.
export function get<T = any>(path: string, extraHeaders?: Record<string, string>) {
  return request<T>('GET', path, undefined, extraHeaders);
}
export function post<T = any>(path: string, body?: any, extraHeaders?: Record<string, string>) {
  return request<T>('POST', path, body, extraHeaders);
}
export function put<T = any>(path: string, body?: any, extraHeaders?: Record<string, string>) {
  return request<T>('PUT', path, body, extraHeaders);
}
export function patch<T = any>(path: string, body?: any, extraHeaders?: Record<string, string>) {
  return request<T>('PATCH', path, body, extraHeaders);
}
export function del<T = any>(path: string, extraHeaders?: Record<string, string>) {
  return request<T>('DELETE', path, undefined, extraHeaders);
}
