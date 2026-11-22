const $ = id => document.getElementById(id);
let token = sessionStorage.getItem('token');
let timer = null, configLoaded = false;

async function api(path, method = 'GET', data) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: method === 'POST' ? JSON.stringify(data || {}) : undefined
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/api/login') { signedOut(); throw new Error('Sign in to continue'); }
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

function signedOut() {
  token = null; sessionStorage.removeItem('token'); configLoaded = false;
  clearInterval(timer); $('app').hidden = true; $('login').hidden = false;
}

function fillConfig(c) {
  const f = $('config-form');
  for (const el of f.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') el.checked = !!c[el.name]; else el.value = c[el.name] ?? '';
  }
}

function render(s) {
  $('phase').textContent = s.phase || 'stopped';
  $('phase').className = 'badge ' + (s.phase || 'stopped');
  $('task').textContent = s.task || 'Idle';
  $('version').textContent = s.version || '-';
  $('vitals').textContent = s.health == null ? '-' : `${s.health} / ${s.food}`;
  $('position').textContent = s.position ? `${s.position.x}, ${s.position.y}, ${s.position.z}` : '-';
  $('players').textContent = s.players?.length ? s.players.join(', ') : '-';
  const inv = $('inventory'); inv.replaceChildren();
  for (const i of s.inventory?.length ? s.inventory : [{ name: 'Empty', count: '' }]) {
    const li = document.createElement('li'); li.textContent = i.count ? `${i.name} ×${i.count}` : i.name; inv.append(li);
  }
  const logs = $('logs'); logs.replaceChildren();
  for (const l of s.logs || []) {
    const span = document.createElement('div');
    span.className = `l-${l.level || l.type || 'info'}`;
    span.textContent = typeof l === 'string' ? l : `${l.time ? new Date(l.time).toLocaleTimeString() + ' ' : ''}${l.message ?? l.text ?? ''}`;
    logs.append(span);
  }
  if (!configLoaded && s.config) { fillConfig(s.config); configLoaded = true; }
}

async function refresh() { try { render(await api('/api/state')); } catch (e) { $('action-msg').textContent = e.message; } }

function showApp() {
  $('login').hidden = true; $('app').hidden = false;
  refresh(); clearInterval(timer); timer = setInterval(refresh, 2000);
}

$('login-form').addEventListener('submit', async e => {
  e.preventDefault(); $('login-error').textContent = '';
  try {
    const r = await api('/api/login', 'POST', { password: $('password').value });
    token = r.token; sessionStorage.setItem('token', token); $('password').value = ''; showApp();
  } catch (err) { $('login-error').textContent = err.message; }
});

$('logout').addEventListener('click', async () => { try { await api('/api/logout', 'POST'); } catch {} signedOut(); });

for (const [id, path] of [['start', '/api/start'], ['stop', '/api/stop']]) {
  $(id).addEventListener('click', async () => {
    $('action-msg').textContent = '';
    try { await api(path, 'POST'); } catch (err) { $('action-msg').textContent = err.message; }
    refresh();
  });
}
$('stop-action').addEventListener('click', async () => {
  try { await api('/api/command', 'POST', { command: 'stop' }); } catch (err) { $('action-msg').textContent = err.message; }
  refresh();
});

$('config-form').addEventListener('submit', async e => {
  e.preventDefault(); const msg = $('config-msg'); msg.textContent = '';
  const c = {};
  for (const el of e.target.elements) {
    if (!el.name) continue;
    c[el.name] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
  }
  try { await api('/api/config', 'POST', c); msg.textContent = 'Saved'; } catch (err) { msg.textContent = err.message; }
});

$('command-form').addEventListener('submit', async e => {
  e.preventDefault();
  try { await api('/api/command', 'POST', { command: $('command').value }); $('command').value = ''; $('action-msg').textContent = ''; }
  catch (err) { $('action-msg').textContent = err.message; }
  setTimeout(refresh, 500);
});

if (token) showApp();
