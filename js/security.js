window.app = window.app || {};

const te = new TextEncoder(), td = new TextDecoder();
const toB64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = s => Uint8Array.from(atob(s), ch => ch.charCodeAt(0));
const zero = '0'.repeat(64);

app.crypto = {
  label: '',
  async init() {
    try {
      await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify']);
      this.genAlg = { name: 'Ed25519' }; this.signAlg = { name: 'Ed25519' }; this.label = 'Ed25519';
    } catch (e) {
      this.genAlg = { name: 'ECDSA', namedCurve: 'P-256' }; this.signAlg = { name: 'ECDSA', hash: 'SHA-256' };
      this.label = 'ECDSA P-256 (this browser lacks Ed25519)';
    }
  },
  keyPair() { return crypto.subtle.generateKey(this.genAlg, false, ['sign', 'verify']); },
  async sign(priv, text) { return toB64(await crypto.subtle.sign(this.signAlg, priv, te.encode(text))); },
  async verify(pub, sig, text) {
    try { return await crypto.subtle.verify(this.signAlg, pub, fromB64(sig), te.encode(text)); } catch (e) { return false; }
  },
  async sha256(text) {
    const h = await crypto.subtle.digest('SHA-256', te.encode(text));
    return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
  },
  aesKey() { return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); },
  async encrypt(key, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(obj)));
    return { iv: toB64(iv), ct: toB64(ct) };
  },
  async decrypt(key, box) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(box.iv) }, key, fromB64(box.ct));
    return JSON.parse(td.decode(pt));
  }
};

app.canonical = p => JSON.stringify([p.deviceId, p.crewId, p.seq, p.ts, app.indicators.map(i => p.values[i.key])]);

app.ledger = {
  entries: [],
  lastHash: zero,
  tail: Promise.resolve(),
  status: { ok: true, at: null, count: 0, brokenAt: null },
  reported: new Set(),
  body: e => JSON.stringify([e.i, e.ts, e.actor, e.action, e.data]),
  append(actor, action, data) {
    const copy = data ? JSON.parse(JSON.stringify(data)) : null;
    this.tail = this.tail.then(async () => {
      const e = { i: this.entries.length, ts: Date.now(), actor, action, data: copy, prev: this.lastHash };
      e.hash = await app.crypto.sha256(e.prev + '|' + this.body(e));
      this.entries.push(e);
      this.lastHash = e.hash;
      app.emit('ledger', e);
      return e;
    });
    return this.tail;
  },
  async verify(manual) {
    await this.tail;
    let prev = zero, brokenAt = null;
    for (const e of this.entries) {
      const h = await app.crypto.sha256(prev + '|' + this.body(e));
      if (e.prev !== prev || h !== e.hash) { brokenAt = e.i; break; }
      prev = e.hash;
    }
    this.status = { ok: brokenAt === null, at: Date.now(), count: this.entries.length, brokenAt };
    if (brokenAt !== null && !this.reported.has(brokenAt)) {
      this.reported.add(brokenAt);
      const e = this.entries[brokenAt];
      const who = e.data && e.data.crewId ? app.crew.find(c => c.id === e.data.crewId).name + ', ' : '';
      app.alerts.raise({ kind: 'security', level: 'red', crewId: e.data && e.data.crewId, ts: Date.now(),
        html: `<b>Ledger broken at entry #${brokenAt}</b> (${app.escape(e.action)}, ${who}${new Date(e.ts).toLocaleTimeString()}). A stored record was changed after it was written. <button class="btn ghost" data-restore="${brokenAt}" type="button">Restore from Earth copy</button>` });
    }
    if (manual) app.ui.toast(this.status.ok ? `Ledger verified: ${this.status.count} entries intact.` : `Ledger broken at entry #${brokenAt}.`, this.status.ok ? 'green' : 'security');
    app.emit('verified', this.status);
    return this.status;
  }
};

app.ledger.restore = async function (i) {
  const g = app.ground.copy[i], e = this.entries[i];
  if (!g || !e) return app.ui.toast('No Earth copy of this entry yet. Restore the link and try again.', 'amber');
  e.data = JSON.parse(JSON.stringify(g.data));
  if (e.action === 'reading') {
    app.indicators.forEach(ind => {
      const pt = app.store.series[e.data.crewId][ind.key].find(p => p.t === e.data.ts);
      if (pt) pt.v = e.data.values[ind.key];
    });
  }
  this.reported.delete(i);
  app.alerts.list.forEach(a => { if (a.html && a.html.includes(`data-restore="${i}"`)) { a.acked = true; a.ackedBy = 'restored from Earth copy'; } });
  await this.verify(true);
  this.append(app.auth.actor(), 'entry restored from Earth copy', { entry: i });
  app.emit('redteam');
};

app.escape = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

app.auth = {
  role: null,
  self: null,
  roles: {
    astronaut: { label: 'Astronaut', where: 'Onboard' },
    cmo: { label: 'Crew medical officer', where: 'Onboard' },
    surgeon: { label: 'Flight surgeon', where: 'Earth' },
    ops: { label: 'Mission operations', where: 'Earth' },
    admin: { label: 'System admin', where: 'Onboard' }
  },
  rules: {
    vitals: (r, c, self) => (r === 'astronaut' ? c === self : r === 'cmo' || r === 'surgeon'),
    status: r => r !== 'admin',
    notes: (r, c, self) => (r === 'astronaut' ? c === self : r === 'cmo' || r === 'surgeon'),
    addNote: r => r === 'cmo' || r === 'surgeon',
    ack: (r, c, self) => (r === 'astronaut' ? c === self : r === 'cmo' || r === 'surgeon'),
    doTasks: (r, c, self) => r === 'astronaut' && c === self,
    viewTasks: (r, c, self) => (r === 'astronaut' ? c === self : r === 'cmo' || r === 'surgeon'),
    thresholds: r => r === 'surgeon',
    ledger: r => r === 'admin' || r === 'surgeon' || r === 'cmo',
    registerCrew: r => r === 'cmo' || r === 'surgeon',
    editProfile: r => r === 'cmo' || r === 'surgeon',
    manualReading: (r, c, self) => (r === 'astronaut' ? c === self : r === 'cmo'),
    manageAccounts: r => r === 'cmo' || r === 'admin'
  },
  can(action, crewId, as) {
    const role = (as && as.role) || this.role, self = (as && as.self) || this.self;
    const rule = this.rules[action];
    return !!rule && rule(role, crewId, self);
  },
  actor(as) {
    if (!as && app.accounts && app.accounts.current) {
      const a = app.accounts.current, R = this.roles[a.role];
      return `${a.name} (${R.label.toLowerCase()}${R.where === 'Earth' ? ', Earth' : ''})`;
    }
    if (!as && !this.role) return 'Health hub';
    const role = (as && as.role) || this.role, self = (as && as.self) || this.self;
    if (role === 'astronaut') return ((app.crew.find(c => c.id === self) || {}).name || 'An astronaut') + ' (astronaut)';
    if (role === 'cmo') return 'Crew medical officer';
    return this.roles[role].label + (this.roles[role].where === 'Earth' ? ' (Earth)' : '');
  },
  onGround() { return this.roles[this.role].where === 'Earth'; },
  deny(action, crewId, as) {
    const actor = this.actor(as);
    app.ledger.append(actor, 'access denied', { attempted: action, crewId: crewId || null });
    app.alerts.raise({ kind: 'security', level: 'amber', crewId, ts: Date.now(),
      html: `<b>Access denied</b>: ${app.escape(actor)} tried to <i>${app.escape(this.describe(action))}</i>${crewId ? ' for ' + app.escape(app.crew.find(c => c.id === crewId).name) : ''}. Logged.` });
    app.ui.toast(`Access denied: ${this.describe(action)}. This attempt was logged.`, 'security');
    return false;
  },
  describe(a) {
    return { vitals: 'view vital signs', notes: 'open the medical record', addNote: 'add a clinical note', ack: 'acknowledge an alert',
      doTasks: 'complete a health task', thresholds: 'change alert limits', ledger: 'view the ledger', viewTasks: 'view health tasks',
      registerCrew: 'register a crew member', editProfile: 'edit a crew profile', manualReading: 'enter a measurement', manageAccounts: 'manage accounts' }[a] || a;
  }
};

app.devices.keys = {};
app.devices.captured = [];
app.devices.override = {};
app.devices.packetFor = async function (c, ts) {
  this.seq[c.id] = (this.seq[c.id] || 0) + 1;
  const values = app.sim.reading(c, app.sim.t);
  Object.assign(values, this.override[c.id] || {});
  const deviceId = 'band-' + c.id;
  const p = { deviceId, crewId: c.id, seq: this.seq[c.id], ts, values };
  p.sig = await app.crypto.sign(this.keys[deviceId], app.canonical(p));
  this.captured.push(JSON.parse(JSON.stringify(p)));
  if (this.captured.length > 40) this.captured.shift();
  return p;
};

app.hub.trusted = {};
app.hub.rejected = 0;
app.hub.accepted = 0;

app.hub.pair = async function (c, by) {
  const kp = await app.crypto.keyPair();
  const deviceId = 'band-' + c.id;
  app.devices.keys[deviceId] = kp.privateKey;
  app.devices.seq[c.id] = 0;
  this.trusted[deviceId] = { crewId: c.id, pub: kp.publicKey, lastSeq: 0, recent: [] };
  await app.ledger.append(by || 'Health hub', 'sensor paired', { deviceId, crewId: c.id, alg: app.crypto.label });
};
app.hub.ingest = async function (p) {
  const reject = reason => {
    this.rejected += 1;
    app.ledger.append('Health hub', 'reading rejected', { deviceId: p.deviceId, crewId: p.crewId, seq: p.seq, reason });
    const name = (app.crew.find(c => c.id === p.crewId) || {}).name || p.crewId;
    app.alerts.raise({ kind: 'security', level: 'red', crewId: p.crewId, ts: Date.now(),
      html: `<b>Reading rejected</b> from <span class="mono">${app.escape(p.deviceId)}</span> claiming to be ${app.escape(name)}: ${app.escape(reason)}. Nothing was stored.` });
    app.emit('rejected', { p, reason });
    return { ok: false, reason };
  };
  const reg = this.trusted[p.deviceId];
  if (!reg) return reject('unknown device (not registered)');
  if (reg.crewId !== p.crewId) return reject('device is not assigned to this crew member');
  if (!p.sig || !(await app.crypto.verify(reg.pub, p.sig, app.canonical(p)))) return reject('invalid signature');
  if (p.seq <= reg.lastSeq) return reject(`replayed reading (sequence ${p.seq} already seen)`);
  if (Math.abs(Date.now() - p.ts) > 30000) return reject('stale timestamp');
  const now = Date.now();
  reg.recent = reg.recent.filter(t => now - t < 3000);
  if (reg.recent.length >= 4) return reject('rate limit exceeded');
  reg.recent.push(now);
  reg.lastSeq = p.seq;
  this.accepted += 1;

  app.store.push(p.crewId, p.ts, p.values);
  app.integrity.check(p.crewId, p.values, p.ts);
  app.alerts.evaluate(p.crewId, p.values, p.ts);
  app.ledger.append(p.deviceId, 'reading', { crewId: p.crewId, seq: p.seq, ts: p.ts, values: p.values });
  return { ok: true };
};

app.integrity = {
  win: {}, flagged: {},
  stuckN: 8,
  stuckKeys: ['hr', 'sbp'],
  jumps: { hr: 40, spo2: 8, sbp: 45, temp: 1.0, resp: 12 },
  check(crewId, values) {
    app.indicators.forEach(ind => {
      const k = crewId + '|' + ind.key, v = values[ind.key];
      const w = (this.win[k] = this.win[k] || []);
      const prev = w.length ? w[w.length - 1] : null;
      w.push(v); if (w.length > 12) w.shift();
      let problem = null;
      if (this.stuckKeys.includes(ind.key) && w.length >= this.stuckN && w.slice(-this.stuckN).every(x => x === v)) {
        problem = { reason: 'stuck', text: `reading has not changed (${v} ${ind.unit}) for ${this.stuckN} readings in a row. Real signals always vary.` };
      } else if (prev !== null && this.jumps[ind.key] && Math.abs(v - prev) > this.jumps[ind.key]) {
        problem = { reason: 'jump', text: `jumped from ${prev} to ${v} ${ind.unit} in one reading, which is physically implausible.` };
      }
      if (problem && !this.flagged[k]) {
        this.flagged[k] = problem;
        const c = app.crew.find(x => x.id === crewId);
        app.ledger.append('Health hub', 'sensor integrity alert', { crewId, key: ind.key, reason: problem.reason });
        app.alerts.raise({ kind: 'sensor', level: 'amber', crewId, key: ind.key, ts: Date.now(),
          html: `<b>Sensor integrity</b>: ${app.escape(c.name)}'s ${app.escape(ind.name.toLowerCase())} ${app.escape(problem.text)} Do not trust this value; check or replace the sensor.` });
      } else if (!problem && this.flagged[k] && (this.flagged[k].reason === 'jump' || !w.slice(-3).every(x => x === v))) {
        delete this.flagged[k];
      }
    });
  },
  flag(crewId, key) { const f = this.flagged[crewId + '|' + key]; return f ? (f.reason === 'stuck' ? '⚠ Sensor stuck: value not trusted' : '⚠ Implausible jump: check sensor') : ''; }
};

app.vault = {
  key: null, records: [],

  async put(crewId, kind, author, payload) {
    const box = await app.crypto.encrypt(this.key, payload);
    const rec = { id: app.uid(), crewId, kind, author, ts: Date.now(), box };
    this.records.push(rec);
    app.ledger.append(author, 'record written', { crewId, kind, id: rec.id, ctDigest: (await app.crypto.sha256(box.ct)).slice(0, 16) });
    app.emit('vault', rec);
    return rec;
  },
  async open(rec) { try { return await app.crypto.decrypt(this.key, rec.box); } catch (e) { return null; } },
  async seed() {
    const now = Date.now();
    const seed = [
      ['novak', 'clinical', 'Astronaut 2 (crew medical officer)', { text: 'Resting heart rate and blood pressure trending up over 3 weeks. Add resistance sessions, recheck BP twice daily, report headaches.' }],
      ['novak', 'checkin', 'Astronaut 3 (astronaut)', { sleep: '6', mood: 2, note: 'Headaches in the afternoon twice this week.' }],
      ['reyes', 'checkin', 'Astronaut 1 (astronaut)', { sleep: '7', mood: 4, note: '' }],
      ['tanaka', 'checkin', 'Astronaut 4 (astronaut)', { sleep: '5', mood: 3, note: 'Noisy night near the CO2 scrubber.' }]
    ];
    for (const [crewId, kind, author, payload] of seed) await this.put(crewId, kind, author, payload);
    this.records.forEach((r, i) => { r.ts = now - (this.records.length - i) * 36e5; });
  }
};

app.link = {
  up: true,
  oneWayMs: 1300,
  queue: [], sentUpTo: 0, bundles: 0, hubKeys: null, linkKey: null, tamperNext: false,
  async init() { this.hubKeys = await app.crypto.keyPair(); this.linkKey = await app.crypto.aesKey(); this.sentUpTo = app.ledger.entries.length; },
  async makeBundle() {
    await app.ledger.tail;
    const to = app.ledger.entries.length, from = this.sentUpTo;
    if (to <= from) return;
    const entries = app.ledger.entries.slice(from, to).map(e => JSON.parse(JSON.stringify(e)));
    const box = await app.crypto.encrypt(this.linkKey, entries);
    const n = ++this.bundles;
    const sig = await app.crypto.sign(this.hubKeys.privateKey, `${n}|${from}|${to}|${box.iv}|${box.ct}`);
    this.queue.push({ n, from, to, box, sig, made: Date.now() });
    this.sentUpTo = to;
  },
  pump() {
    if (!this.up) return;
    while (this.queue.length) {
      const b = this.queue.shift();
      if (this.tamperNext) {
        this.tamperNext = false;
        b.original = b.box;
        const ct = b.box.ct; const i = Math.floor(ct.length / 2);
        b.box = { iv: b.box.iv, ct: ct.slice(0, i) + (ct[i] === 'A' ? 'B' : 'A') + ct.slice(i + 1) };
      }
      setTimeout(() => app.ground.receive(b), this.oneWayMs);
    }
  },
  setUp(up) {
    this.up = up;
    app.ledger.append('Health hub', up ? 'Earth link restored' : 'Earth link lost', { queued: this.queue.length });
    if (up) this.pump();
    app.emit('link', up);
  }
};

app.ground = {
  series: {}, copy: {}, lastSync: null, received: 0, rejected: 0, entries: 0,
  init() { this.series = {}; this.lastSync = Date.now(); },
  addCrew(c) {
    this.series[c.id] = {};
    app.indicators.forEach(i => { this.series[c.id][i.key] = app.store.series[c.id][i.key].map(p => ({ ...p })); });
  },
  async receive(b) {
    const ok = await app.crypto.verify(app.link.hubKeys.publicKey, b.sig, `${b.n}|${b.from}|${b.to}|${b.box.iv}|${b.box.ct}`);
    let entries = null;
    if (ok) { try { entries = await app.crypto.decrypt(app.link.linkKey, b.box); } catch (e) { entries = null; } }
    if (!entries) {
      this.rejected += 1;
      app.alerts.raise({ kind: 'security', level: 'red', ts: Date.now(),
        html: `<b>Ground rejected bundle #${b.n}</b>: signature check failed, so it was changed in transit. The hub keeps it and resends.` });
      if (b.original) {
        app.link.queue.unshift({ n: b.n, from: b.from, to: b.to, box: b.original, sig: b.sig, made: b.made });
        setTimeout(() => app.link.pump(), 800);
      }
      app.emit('ground');
      return;
    }
    entries.forEach(e => {
      this.copy[e.i] = e;
      if (e.action === 'reading') {
        const arr = this.series[e.data.crewId];
        app.indicators.forEach(i => {
          arr[i.key].push({ t: e.data.ts, v: e.data.values[i.key] });
          if (arr[i.key].length > app.historySize) arr[i.key].shift();
        });
      }
    });
    this.received += 1; this.entries += entries.length;
    this.lastSync = Date.now();
    app.emit('ground');
  },
  latest(crewId, key) { const a = this.series[crewId][key]; return a.length ? a[a.length - 1].v : null; }
};

app.thresholds = {
  change(key, newMax, as) {
    const ind = app.indicator(key);
    if (!app.auth.can('thresholds', null, as)) return app.auth.deny('thresholds', as && as.self, as);
    const g = ind.bands.find(b => b.level === 'green');
    const idx = ind.bands.indexOf(g), next = ind.bands[idx + 1];
    const from = g.max;
    if (!next || newMax <= ind.bands[idx - 1]?.max || newMax >= next.max) {
      app.ui.toast('That limit would overlap the next range.', 'amber');
      return false;
    }
    g.max = newMax;
    app.ledger.append(app.auth.actor(as), 'alert limit changed', { key, normalBelow: { from, to: newMax } });
    app.ui.toast(`${ind.name}: normal range now ends below ${newMax} ${ind.unit}. Change logged.`, 'green');
    app.emit('thresholds', key);
    return true;
  }
};

app.security = {
  async init() {
    await app.crypto.init();
    await app.link.init();
    app.ground.init();

    app.on('ack', a => app.ledger.append(app.auth.actor(), 'alert acknowledged', { crewId: a.crewId || null, alert: a.kind, key: a.key || null }));
    app.on('task', t => { if (t.taskId) app.ledger.append(app.auth.actor(), 'task completed', { crewId: t.crewId, taskId: t.taskId }); });

    let n = 0;
    app.on('tick', async () => {
      n += 1;
      if (n % 3 === 0) { await app.link.makeBundle(); app.link.pump(); app.emit('link', app.link.up); }
      if (n % 8 === 0) app.ledger.verify(false);
    });
  }
};
