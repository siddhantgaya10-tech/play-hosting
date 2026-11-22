import { EventEmitter } from 'node:events';
import mineflayer from 'mineflayer';
import pf from 'mineflayer-pathfinder';
import vec from 'vec3';
import { authorizedOwner, boundedInt } from './config.js';
const { pathfinder, Movements, goals } = pf;
const { Vec3 } = vec;
const HELP = 'status | inventory | follow [player] | come | goto x y z | mine block [1-64] | chop [1-64] | collect | craft item [recipe-runs] | equip item | drop item [count] | place block x y z | eat | sleep | wake | attack entity | say text | stop';

export class Companion extends EventEmitter {
  constructor(config, dataDir) {
    super(); this.config = config; this.dataDir = dataDir; this.bot = null;
    this.desired = false; this.phase = 'stopped'; this.task = 'Idle'; this.logs = [];
    this.retry = 0; this.generation = 0; this.active = false; this.authCode = null;
  }
  log(level, text) {
    const row = { time: new Date().toISOString(), level, text: String(text).slice(0, 1500) };
    this.logs.push(row); if (this.logs.length > 250) this.logs.shift();
    console.log(`[${level}] ${row.text}`); this.emit('change');
  }
  snapshot() {
    const b = this.bot, p = b?.entity?.position;
    return { phase: this.phase, task: this.task, desired: this.desired, version: b?.version || null,
      health: b?.health ?? null, food: b?.food ?? null,
      position: p ? { x: +p.x.toFixed(1), y: +p.y.toFixed(1), z: +p.z.toFixed(1) } : null,
      inventory: b?.inventory?.items().map(i => ({ name: i.name, count: i.count, slot: i.slot })) || [],
      players: Object.keys(b?.players || {}), logs: this.logs, authCode: this.authCode };
  }
  start() {
    if (this.desired || this.bot) throw new Error('Bot is already running or connecting');
    if (!this.config.host || !this.config.owner) throw new Error('Save the server and owner first');
    this.desired = true; this.retry = 0; this.connect();
  }
  connect() {
    if (!this.desired || this.bot) return;
    this.phase = 'connecting'; this.authCode = null;
    this.log('info', `Connecting to ${this.config.host}:${this.config.port}`);
    let b;
    try {
      b = mineflayer.createBot({ host: this.config.host, port: this.config.port,
        version: this.config.version || false, username: this.config.username,
        auth: 'offline' });
      this.bot = b; b.loadPlugin(pathfinder);
    } catch (e) {
      this.desired = false; this.phase = 'error'; this.log('error', e.message); return;
    }
    b.once('spawn', () => {
      if (this.bot !== b || !this.desired) return;
      const movement = new Movements(b);
      movement.canDig = false; movement.allow1by1towers = false;
      movement.allowParkour = false; movement.allowFreeMotion = false;
      movement.scafoldingBlocks = [];
      b.pathfinder.setMovements(movement); b.pathfinder.thinkTimeout = 10000;
      this.phase = 'online'; this.retry = 0; this.authCode = null;
      this.log('success', `Joined as ${b.username}; Minecraft ${b.version}. Waiting for commands.`);
    });
    b.on('chat', (username, message) => {
      if (this.bot !== b || !this.desired || username === b.username) return;
      if (!message.startsWith('!bot ')) return;
      if (!authorizedOwner(this.config, username, b.players[username]?.uuid)) {
        this.log('warning', `Ignored a command from non-owner ${username}`); return;
      }
      this.log('command', `${username}: ${message}`);
      this.execute(message.slice(5)).then(result => {
        if (this.bot === b && this.phase === 'online') b.whisper(username, result.slice(0, 220));
      }).catch(e => {
        this.log('error', e.message);
        if (this.bot === b && this.phase === 'online') b.whisper(username, `Error: ${e.message}`.slice(0, 220));
      });
    });
    b.on('death', () => { this.stopTask(); this.log('warning', 'Bot died. Items may have been dropped.'); });
    b.on('kicked', reason => {
      const text = typeof reason === 'string' ? reason : JSON.stringify(reason);
      this.log('warning', `Kicked: ${text}`);
      if (/banned|whitelist|not authenticated|invalid session|failed to verify/i.test(text)) {
        this.desired = false; this.log('warning', 'Reconnect paused. Resolve the server restriction before starting again.');
      }
    });
    b.on('error', e => this.log('error', e.message));
    b.once('end', reason => {
      if (this.bot !== b) return;
      this.stopTask(); this.bot = null; this.authCode = null;
      this.log('warning', `Disconnected: ${reason}`);
      if (this.desired && this.config.reconnect) {
        const delay = Math.min(60000, 5000 * 2 ** Math.min(this.retry++, 4)) + Math.floor(Math.random() * 2000);
        this.phase = 'reconnecting'; this.log('info', `Retrying in ${Math.ceil(delay / 1000)} seconds`);
        this.timer = setTimeout(() => this.connect(), delay);
      } else { this.desired = false; this.phase = 'stopped'; }
    });
  }
  stopTask() {
    this.generation++; this.task = 'Idle';
    if (this.bot?.pathfinder) this.bot.pathfinder.setGoal(null);
    this.bot?.clearControlStates?.();
    if (this.bot?.targetDigBlock) this.bot.stopDigging?.();
  }
  stop() {
    this.desired = false; clearTimeout(this.timer); this.stopTask(); this.authCode = null;
    const b = this.bot; this.phase = b ? 'stopping' : 'stopped';
    if (b) {
      try { if (typeof b.quit === 'function') b.quit('Stopped from dashboard'); else b.end('Stopped from dashboard'); } catch {}
      setTimeout(() => {
        if (this.bot !== b) return;
        try { b.end('Forced stop'); } catch {}
        setTimeout(() => {
          if (this.bot !== b) return;
          this.bot = null; this.phase = 'stopped'; this.log('info', 'Stopped');
        }, 1000).unref();
      }, 4000).unref();
    }
    this.log('info', 'Stop requested');
  }
  async execute(line) {
    if (typeof line !== 'string' || !line.trim() || line.length > 240) throw new Error('Enter a command (1–240 characters)');
    const [raw, ...a] = line.trim().split(/\s+/); const cmd = raw.toLowerCase();
    if (cmd === 'help') return HELP;
    if (cmd === 'stop') { this.stopTask(); return 'Current action cancelled; bot stays connected.'; }
    const b = this.bot;
    if (!b || this.phase !== 'online') throw new Error('Bot is not online');
    if (cmd === 'status') return JSON.stringify({ health: b.health, food: b.food, position: b.entity.position, task: this.task });
    if (cmd === 'inventory') return b.inventory.items().map(i => `${i.name} ×${i.count}`).join(', ') || 'Inventory is empty';
    if (this.active) throw new Error('An action is finishing. Use stop, then wait for it to cancel.');
    this.stopTask(); const generation = this.generation;
    const check = () => { if (generation !== this.generation || this.bot !== b || this.phase !== 'online') throw new Error('Action cancelled'); };
    const go = async goal => { check(); await b.pathfinder.goto(goal); check(); };
    const item = name => { const i = b.inventory.items().find(v => v.name === name); if (!i) throw new Error(`No ${name || 'item'} in inventory`); return i; };
    const coords = offset => a.slice(offset, offset + 3).map(v => boundedInt(v, -30000000, 30000000));
    this.active = true; this.task = line; this.log('command', `Running: ${line}`);
    try {
      switch (cmd) {
        case 'follow': case 'come': {
          const name = a[0] || this.config.owner; const entity = b.players[name]?.entity;
          if (!entity) throw new Error('Player must be nearby and loaded');
          if (cmd === 'follow') { b.pathfinder.setGoal(new goals.GoalFollow(entity, 2), true); return `Following ${name}`; }
          await go(new goals.GoalNear(entity.position.x, entity.position.y, entity.position.z, 2)); break;
        }
        case 'goto': {
          if (a.length !== 3) throw new Error('Usage: goto x y z');
          const [x,y,z] = coords(0);
          if (b.entity.position.distanceTo(new Vec3(x,y,z)) > 128) throw new Error('Destination must be within 128 blocks');
          await go(new goals.GoalNear(x,y,z,1)); break;
        }
        case 'mine': case 'chop': {
          const count = boundedInt(cmd === 'chop' ? a[0] : a[1], 1, 64, 1);
          const type = cmd === 'mine' ? b.registry.blocksByName[a[0]] : null;
          if (cmd === 'mine' && !type) throw new Error('Unknown block. Use its exact ID, for example coal_ore');
          let done = 0;
          for (; done < count; done++) {
            check();
            if (b.inventory.emptySlotCount() < 1) throw new Error(`Inventory full after ${done} blocks`);
            const block = b.findBlock({ matching: v => cmd === 'chop' ? /(_log|_stem)$/.test(v.name) : v.type === type.id, maxDistance: 32 });
            if (!block) throw new Error(`No matching reachable-area block found within 32 blocks; mined ${done}`);
            await go(new goals.GoalNear(block.position.x, block.position.y, block.position.z, 2));
            const live = b.blockAt(block.position);
            if (!live || live.type !== block.type) throw new Error('Target block changed');
            const tool = b.pathfinder.bestHarvestTool(live);
            if (tool) { await b.equip(tool, 'hand'); check(); }
            if (!live.canHarvest(b.heldItem?.type ?? null)) throw new Error('A suitable tool is required to harvest this block');
            if (!b.canDigBlock(live)) throw new Error('Block is out of reach or cannot be broken');
            await b.dig(live); check();
          }
          return `Mined ${done} blocks. Use collect for nearby drops. Chopping targets reachable logs, not guaranteed whole trees.`;
        }
        case 'collect': {
          const drops = Object.values(b.entities).filter(e => e.name === 'item' && e.position.distanceTo(b.entity.position) < 16).slice(0, 32);
          for (const e of drops) {
            check(); if (!b.entities[e.id]) continue;
            if (!b.inventory.emptySlotCount()) throw new Error('Inventory full');
            await go(new goals.GoalNear(e.position.x, e.position.y, e.position.z, 0.8));
          }
          return `Visited ${drops.length} nearby item drops`;
        }
        case 'craft': {
          const def = b.registry.itemsByName[a[0]];
          if (!def) throw new Error('Unknown item');
          const times = boundedInt(a[1], 1, 64, 1);
          const table = b.findBlock({ matching: b.registry.blocksByName.crafting_table.id, maxDistance: 4 });
          const recipe = b.recipesFor(def.id, null, 1, table)[0];
          if (!recipe) throw new Error('Missing ingredients or a crafting table within 4 blocks');
          await b.craft(recipe, times, table); check(); break;
        }
        case 'equip': await b.equip(item(a[0]), 'hand'); check(); break;
        case 'drop': {
          const i = item(a[0]); await b.toss(i.type, null, boundedInt(a[1], 1, i.count, i.count)); check(); break;
        }
        case 'place': {
          if (a.length !== 4) throw new Error('Usage: place block_item x y z');
          const [x,y,z] = coords(1), target = new Vec3(x,y,z);
          const existing = b.blockAt(target);
          if (!existing || existing.boundingBox !== 'empty') throw new Error('Target must be loaded and empty');
          await go(new goals.GoalNear(x,y,z,3));
          const faces = [new Vec3(0,1,0),new Vec3(1,0,0),new Vec3(-1,0,0),new Vec3(0,0,1),new Vec3(0,0,-1),new Vec3(0,-1,0)];
          const face = faces.find(f => b.blockAt(target.minus(f))?.boundingBox === 'block');
          if (!face) throw new Error('No solid adjacent block');
          await b.equip(item(a[0]), 'hand'); check();
          await b.placeBlock(b.blockAt(target.minus(face)), face); check(); break;
        }
        case 'eat': {
          const safe = ['cooked_beef','cooked_porkchop','cooked_chicken','cooked_mutton','cooked_rabbit','bread','baked_potato','carrot','apple','cooked_cod','cooked_salmon','melon_slice','sweet_berries'];
          const food = b.inventory.items().find(i => safe.includes(i.name));
          if (!food) throw new Error('No supported safe food in inventory');
          await b.equip(food, 'hand'); check(); await b.consume(); check(); break;
        }
        case 'sleep': {
          const bed = b.findBlock({ matching: v => b.isABed(v), maxDistance: 8 });
          if (!bed) throw new Error('No bed within 8 blocks');
          await go(new goals.GoalNear(bed.position.x,bed.position.y,bed.position.z,2));
          await b.sleep(bed); check(); break;
        }
        case 'wake': await b.wake(); check(); break;
        case 'attack': {
          if (!a[0]) throw new Error('Usage: attack entity_name (one nearby non-player hit)');
          const e = b.nearestEntity(e => e.name === a[0] && e.type !== 'player' && e.position.distanceTo(b.entity.position) < 3);
          if (!e) throw new Error('No matching non-player entity within 3 blocks');
          b.attack(e); break;
        }
        case 'say': {
          const message = a.join(' ');
          if (!message || message.startsWith('/')) throw new Error('Use ordinary chat, not server slash commands');
          b.chat(message); break;
        }
        default: throw new Error(`Unknown command. ${HELP}`);
      }
      return `Completed: ${line}`;
    } finally {
      this.active = false;
      if (generation === this.generation && cmd !== 'follow') this.task = 'Idle';
    }
  }
}
