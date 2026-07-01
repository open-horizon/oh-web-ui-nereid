function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function formatDate(isoStr) {
  if (!isoStr) return '-';
  try {
    return new Date(isoStr).toLocaleString('zh-CN');
  } catch {
    return isoStr;
  }
}

function pluralize(count, singular) {
  return `${count} ${singular}${count !== 1 ? 's' : ''}`;
}

function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function renderJsonSyntax(str) {
  if (!str) return '';
  try {
    const obj = typeof str === 'string' ? JSON.parse(str) : str;
    return syntaxHighlight(JSON.stringify(obj, null, 2));
  } catch {
    return escapeHtml(str);
  }
}

function syntaxHighlight(json) {
  json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return json.replace(
    /("(?:[^"\\]|\\.)*")(?=\s*[:,\}\]])|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(true|false|null)|("(?:[^"\\]|\\.)*")/g,
    (match, key, num, bool, str) => {
      if (key) return `<span class="text-info">${key}</span>`;
      if (num) return `<span class="text-warning">${num}</span>`;
      if (bool) return `<span class="text-primary">${bool}</span>`;
      return `<span class="text-success">${str}</span>`;
    }
  );
}

function createSpinner(small = false) {
  const size = small ? 'spinner-border-sm' : '';
  return `<div class="spinner-border ${size} text-secondary" role="status"><span class="visually-hidden">加载中...</span></div>`;
}

function showConfirm(msg) {
  return new Promise((resolve) => {
    document.getElementById('confirmModalMsg').textContent = msg;
    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('confirmModal'));
    const okBtn = document.getElementById('confirmModalOk');
    const cleanup = () => {
      modal.hide();
      okBtn.removeEventListener('click', onOk);
      document.getElementById('confirmModal').removeEventListener('hidden.bs.modal', onCancel);
    };
    const onOk = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };
    okBtn.addEventListener('click', onOk);
    document.getElementById('confirmModal').addEventListener('hidden.bs.modal', onCancel);
    modal.show();
  });
}

export { escapeHtml, formatDate, pluralize, debounce, renderJsonSyntax, syntaxHighlight, createSpinner, showConfirm };
