import { getApiUrl, getAuthHeaders, CONFIG } from './config.js';

function showToast(msg, type = 'danger') {
  const container = document.getElementById('toast-container');
  const id = 'toast-' + Date.now();
  const icon = type === 'success' ? 'bi-check-circle-fill' :
               type === 'warning' ? 'bi-exclamation-triangle-fill' :
               'bi-x-circle-fill';
  container.insertAdjacentHTML('beforeend', `
    <div id="${id}" class="toast align-items-center text-bg-${type} border-0" role="alert">
      <div class="d-flex">
        <div class="toast-body"><i class="bi ${icon} me-2"></i>${msg}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>
    </div>
  `);
  const el = document.getElementById(id);
  if (el) {
    bootstrap.Toast.getOrCreateInstance(el, { delay: 4000 }).show();
    el.addEventListener('hidden.bs.toast', () => el.remove());
  }
}

async function request(method, path, body = null, params = {}) {
  const url = new URL(getApiUrl(path));
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  });

  const headers = {
    ...getAuthHeaders(),
    'Accept': 'application/json',
  };
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const res = await fetch(url.toString(), {
      method,
      headers,
      body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
    });

    if (res.status === 204) return null;
    if (res.status === 201) {
      try { return await res.json(); } catch { return null; }
    }

    const data = await res.json();

    if (!res.ok) {
      const errMsg = data.msg || data.message || data.error || `HTTP ${res.status}`;
      throw new Error(errMsg);
    }
    return data;
  } catch (err) {
    if (err.name !== 'Error' || !err.message.startsWith('HTTP')) {
      showToast(`网络错误: ${err.message}`, 'danger');
    }
    throw err;
  }
}

function get(path, params) { return request('GET', path, null, params); }
function post(path, body) { return request('POST', path, body); }
function put(path, body) { return request('PUT', path, body); }
function patch(path, body) { return request('PATCH', path, body); }
function del(path) { return request('DELETE', path); }

export { request, get, post, put, patch, del, showToast };
