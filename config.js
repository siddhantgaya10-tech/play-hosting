export const defaults = {
  host: '', port: 25565, version: '', username: 'BlockmateBot',
  owner: '', ownerUuid: '', reconnect: true, autostart: false
};

export function validateConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid configuration');
  const c = Object.fromEntries(Object.keys(defaults).map(k => [k, input[k] ?? defaults[k]]));
  for (const k of ['host', 'version', 'username', 'owner', 'ownerUuid']) {
    if (typeof c[k] !== 'string') throw new Error(`${k} must be text`);
    c[k] = c[k].trim();
  }
  if (!/^[a-zA-Z0-9.-]{1,253}$/.test(c.host)) throw new Error('Enter a hostname or IPv4 address, without a URL or port');
  c.port = Number(c.port);
  if (!Number.isInteger(c.port) || c.port < 1 || c.port > 65535) throw new Error('Invalid port');
  if (c.version && !/^\d{1,2}\.\d{1,2}(\.\d{1,2})?$/.test(c.version)) throw new Error('Use an exact version, for example 1.21.11 or 26.1, or leave blank');
  if (!/^\w{3,16}$/.test(c.username)) throw new Error('Bot names must have 3–16 letters, digits or underscores');
  if (!/^\w{3,16}$/.test(c.owner)) throw new Error('Owner must be a Minecraft player name (3–16 characters)');
  if (c.ownerUuid && !/^([a-f0-9]{32}|[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.test(c.ownerUuid)) throw new Error('Invalid owner UUID');
  for (const k of ['reconnect', 'autostart']) if (typeof c[k] !== 'boolean') throw new Error(`${k} must be a boolean`);
  return c;
}

export function authorizedOwner(config, username, uuid) {
  if (!username || username.toLowerCase() !== config.owner.toLowerCase()) return false;
  const norm = s => String(s || '').replaceAll('-', '').toLowerCase();
  return !config.ownerUuid || (!!uuid && norm(uuid) === norm(config.ownerUuid));
}

export function boundedInt(value, min, max, fallback) {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Expected a whole number from ${min} to ${max}`);
  return n;
}
