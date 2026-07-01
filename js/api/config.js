const CONFIG = {
  baseURL: localStorage.getItem('exchange_base_url') || 'http://localhost:8080',
  orgId: localStorage.getItem('exchange_org') || '',
  auth: localStorage.getItem('exchange_auth') || '',
  apiVersion: 'v1',
};

function getApiUrl(path) {
  let base = CONFIG.baseURL.replace(/\/+$/, '');
  return `${base}/${CONFIG.apiVersion}${path}`;
}

function getAuthHeaders() {
  if (!CONFIG.auth) return {};
  return { Authorization: `Basic ${btoa(CONFIG.auth)}` };
}

function saveConfig(baseURL, orgId, auth) {
  CONFIG.baseURL = baseURL;
  CONFIG.orgId = orgId;
  CONFIG.auth = auth;
  localStorage.setItem('exchange_base_url', baseURL);
  localStorage.setItem('exchange_org', orgId);
  localStorage.setItem('exchange_auth', auth);
}

function clearConfig() {
  CONFIG.baseURL = '';
  CONFIG.orgId = '';
  CONFIG.auth = '';
  localStorage.removeItem('exchange_base_url');
  localStorage.removeItem('exchange_org');
  localStorage.removeItem('exchange_auth');
}

function isAuthenticated() {
  return !!CONFIG.auth;
}

export { CONFIG, getApiUrl, getAuthHeaders, saveConfig, clearConfig, isAuthenticated };
