window.app = window.app || {};

const enc8 = new TextEncoder();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), ch => ch.charCodeAt(0));

app.accounts = {
  storeKey: 'pulse-and-proof.v2',
  iterations: 150000,
  minPin: 6,
  demoPin: '424242',
  list: [],
  dek: null,
  current: null,
  demo: false,
  fails: {}, lockedUntil: {},
  unlocked: false,

  stored() { try { localStorage.removeItem('pulse-and-proof.v1'); } catch (e) {  } try { return JSON.parse(localStorage.getItem(this.storeKey) || 'null'); } catch (e) { return null; } },
  load() { const s = this.stored(); this.list = s ? s.accounts : []; this.demo = !!(s && s.demo); return !!s; },

  async kek(pin, salt) {
    const base = await crypto.subtle.importKey('raw', enc8.encode(pin), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: this.iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  },
  async wrap(pin) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const raw = await crypto.subtle.exportKey('raw', this.dek);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await this.kek(pin, salt), raw);
    return { salt: b64(salt), iv: b64(iv), ct: b64(ct) };
  },
  async unwrap(acc, pin) {
    const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(acc.iv) }, await this.kek(pin, unb64(acc.salt)), unb64(acc.ct));
    return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
  },
  validPin(pin) { return /^\d+$/.test(pin) && pin.length >= this.minPin; },

  async newHabitat() {
    this.dek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    app.vault.key = this.dek;
    this.list = [];
  },

  async create({ name, role, crewId, pin }, by) {
    const w = await this.wrap(pin);
    const acc = Object.assign({ id: app.uid(), name, role, crewId: crewId || null, createdBy: by, createdAt: Date.now() }, w);
    this.list.push(acc);
    app.ledger.append(by, 'account created', { name, role });
    return acc;
  },

  async signIn(id, pin) {
    const acc = this.list.find(a => a.id === id);
    if (!acc) return { ok: false, why: 'Choose an account.' };
    const wait = (this.lockedUntil[id] || 0) - Date.now();
    if (wait > 0) return { ok: false, why: `Too many wrong PINs. Try again in ${Math.ceil(wait / 1000)} s.` };
    let key;
    try { key = await this.unwrap(acc, pin); } catch (e) {
      this.fails[id] = (this.fails[id] || 0) + 1;
      app.ledger.append('Health hub', 'failed sign-in', { account: acc.name, attempt: this.fails[id] });
      if (this.fails[id] >= 5) {
        this.lockedUntil[id] = Date.now() + 30000; this.fails[id] = 0;
        app.alerts.raise({ kind: 'security', level: 'amber', ts: Date.now(), html: `<b>Account locked</b> for 30 s after 5 wrong PINs: ${app.escape(acc.name)}.` });
        return { ok: false, why: 'Wrong PIN. The account is locked for 30 seconds.' };
      }
      return { ok: false, why: `Wrong PIN (${5 - this.fails[id]} tries left).` };
    }
    this.fails[id] = 0;
    if (!this.unlocked) {
      this.dek = key; app.vault.key = key;
      await this.openVault();
      this.unlocked = true;
    }
    this.current = acc;
    app.auth.role = acc.role;
    app.auth.self = acc.crewId;
    await app.ledger.append(app.auth.actor(), 'signed in', { role: acc.role });
    app.emit('signin', acc);
    return { ok: true };
  },

  signOut() {
    if (this.current) app.ledger.append(app.auth.actor(), 'signed out', {});
    this.current = null; app.auth.role = null; app.auth.self = null;
    app.emit('signout');
  },

  async changePin(oldPin, newPin) {
    const acc = this.current;
    try { await this.unwrap(acc, oldPin); } catch (e) { return 'Current PIN is wrong.'; }
    if (!this.validPin(newPin)) return `The new PIN needs at least ${this.minPin} digits.`;
    Object.assign(acc, await this.wrap(newPin));
    app.ledger.append(app.auth.actor(), 'PIN changed', {});
    await this.save();
    return null;
  },

  profile(c) { return { id: c.id, name: c.name, role: c.role, base: c.base, careerBefore: c.careerBefore, missionDose: app.store.missionDose[c.id] || 0, drift: !!c.drift, registeredBy: c.registeredBy, registeredAt: c.registeredAt }; },

  async save() {
    if (!this.dek) return;
    const payload = {
      mission: { day: app.mission.day },
      crew: app.crew.map(c => this.profile(c)),
      records: app.vault.records.map(r => ({ id: r.id, crewId: r.crewId, kind: r.kind, author: r.author, ts: r.ts, box: r.box })),
      game: Object.fromEntries(Object.entries(app.game.state).map(([k, s]) => [k, { points: s.points, streak: s.streak }]))
    };
    const vault = await app.crypto.encrypt(this.dek, payload);
    try { localStorage.setItem(this.storeKey, JSON.stringify({ v: 1, demo: this.demo, accounts: this.list, vault })); } catch (e) {  }
  },

  async openVault() {
    const s = this.stored();
    if (!s || !s.vault) return;
    const p = await app.crypto.decrypt(this.dek, s.vault);
    if (p.mission) app.mission.day = p.mission.day;
    for (const prof of p.crew) await app.addCrew(prof, { restore: true, prefill: !!s.demo, seed: p.game && p.game[prof.id] ? [p.game[prof.id].points, p.game[prof.id].streak] : null });
    app.vault.records = p.records || [];
  },

  reset() { try { localStorage.removeItem(this.storeKey); } catch (e) {  } location.reload(); }
};

app.addCrew = async (prof, opts = {}) => {
  const c = { id: prof.id, name: prof.name, role: prof.role, base: Object.assign({}, prof.base), radOffset: (app.crew.length % 4 - 1.5) * 0.03, careerBefore: Number(prof.careerBefore) || 0,
    missionDose: prof.missionDose || 0, drift: !!prof.drift, registeredBy: prof.registeredBy, registeredAt: prof.registeredAt };
  app.crew.push(c);
  app.sim.addCrew(c); app.store.addCrew(c); app.game.addCrew(c, opts.seed);
  if (opts.prefill) app.prefillCrew(c);
  app.ground.addCrew(c);
  await app.hub.pair(c, opts.by);
  app.emit('crew', c);
  return c;
};

app.crewAdmin = {
  slug(name) { return (name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'crew') + '-' + app.uid().slice(0, 4); },
  checkBase(base) {
    for (const [k, [lo, hi]] of Object.entries(app.baseLimits)) {
      const v = base[k];
      if (!Number.isFinite(v) || v < lo || v > hi) return `${app.indicator(k).name}: enter a resting pre-flight value between ${lo} and ${hi} ${app.indicator(k).unit}.`;
    }
    return null;
  },
  async register({ name, role, base, careerBefore, pin }) {
    if (!app.auth.can('registerCrew')) return app.auth.deny('registerCrew') && null;
    if (!name.trim()) return 'Enter the full name.';
    const bad = this.checkBase(base); if (bad) return bad;
    if (!(careerBefore >= 0 && careerBefore < app.nasa.careerLimit)) return `Prior career dose must be between 0 and ${app.nasa.careerLimit} mSv.`;
    if (!app.accounts.validPin(pin)) return `The astronaut's first PIN needs at least ${app.accounts.minPin} digits.`;
    const by = app.auth.actor();
    const c = await app.addCrew({ id: this.slug(name), name: name.trim(), role: role.trim() || 'Crew member', base, careerBefore, registeredBy: by, registeredAt: Date.now() }, { by });
    app.ledger.append(by, 'crew member registered', { crewId: c.id, baseline: base, careerBefore });
    await app.accounts.create({ name: c.name, role: 'astronaut', crewId: c.id, pin }, by);
    await app.accounts.save();
    return c;
  },
  async editBase(crewId, base, careerBefore) {
    if (!app.auth.can('editProfile', crewId)) return app.auth.deny('editProfile', crewId) && null;
    const bad = this.checkBase(base); if (bad) return bad;
    const c = app.crew.find(x => x.id === crewId);
    const from = Object.assign({}, c.base);
    Object.assign(c.base, base); c.careerBefore = careerBefore;
    app.ledger.append(app.auth.actor(), 'baseline changed', { crewId, from, to: base });
    await app.accounts.save();
    return c;
  }
};

app.hub.manual = async function (crewId, entered) {
  if (!app.auth.can('manualReading', crewId)) return app.auth.deny('manualReading', crewId) && null;
  const keys = Object.keys(entered).filter(k => entered[k] !== null && entered[k] !== '' && !Number.isNaN(entered[k]));
  if (!keys.length) return 'Enter at least one value.';
  for (const k of keys) {
    const [lo, hi] = app.inputLimits[k];
    if (entered[k] < lo || entered[k] > hi) return `${app.indicator(k).name} must be between ${lo} and ${hi} ${app.indicator(k).unit}.`;
  }
  const values = {};
  app.indicators.forEach(i => { values[i.key] = keys.includes(i.key) ? Number(entered[i.key]) : app.store.latest(crewId, i.key); });
  const ts = Date.now();
  app.store.push(crewId, ts, values);
  app.alerts.evaluate(crewId, values, ts);
  const only = Object.fromEntries(keys.map(k => [k, Number(entered[k])]));
  await app.ledger.append(app.auth.actor(), 'manual reading', { crewId, ts, values, entered: only });
  app.emit('tick', ts);
  return null;
};

app.loadDemo = async () => {
  const A = app.accounts;
  await A.newHabitat();
  A.demo = true;
  const by = 'Demo setup';
  const seeds = { reyes: [260, 6], osei: [410, 12], novak: [150, 2], tanaka: [330, 6] };
  for (const d of app.demoCrew) {
    await app.addCrew(Object.assign({}, d, { missionDose: app.mission.day * app.radBackground().mSvDay, registeredBy: by, registeredAt: Date.now() }), { prefill: true, seed: seeds[d.id], by });
  }
  await app.vault.seed();
  for (const [name, role, crewId] of [['Astronaut 1', 'astronaut', 'reyes'], ['Astronaut 2', 'cmo', 'osei'], ['Astronaut 3', 'astronaut', 'novak'], ['Astronaut 4', 'astronaut', 'tanaka'],
    ['Flight surgeon', 'surgeon', null], ['Mission operations', 'ops', null], ['System admin', 'admin', null]]) {
    await A.create({ name, role, crewId, pin: A.demoPin }, by);
  }

  app.crew.forEach(c => app.indicators.forEach(i => {
    const v = app.store.latest(c.id, i.key), lvl = app.classify(i.key, v);
    if (lvl === 'amber' || lvl === 'red') {
      app.alerts.alerted[c.id + '|' + i.key] = lvl;
      app.alerts.raise({ kind: 'health', crewId: c.id, key: i.key, level: lvl, value: v, ts: Date.now() });
    }
  }));
  A.unlocked = true;
  await A.save();
};
