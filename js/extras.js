window.app = window.app || {};

app.modes = {
  moon: { label: 'Moon', name: 'Lunar surface base (simulated)', location: 'Lunar south pole', oneWaySec: 1.3, accel: 1 },

  mars: { label: 'Mars', name: 'Mars surface outpost (simulated)', location: 'Mars', oneWaySec: 12 * 60, accel: 100 }
};
app.mode = {
  key: 'moon',
  get() { return app.modes[this.key]; },
  set(key) {
    this.key = key;
    const m = this.get();
    app.mission.name = m.name;
    app.mission.location = m.location;
    app.link.oneWayMs = Math.round(m.oneWaySec * 1000 / m.accel);
    app.setRadBands();
    if (key === 'moon' && app.link.reason === 'conjunction') app.link.setUp(true);
    app.ledger.append(app.auth.actor(), 'mission profile changed', { mode: key, oneWaySec: m.oneWaySec });
    app.emit('mode', key);
  },
  delayText() {
    const m = this.get();
    if (m.oneWaySec < 60) return `${m.oneWaySec.toFixed(1)} s`;
    return `${Math.round(m.oneWaySec / 60)} min`;
  },
  demoText() {
    const m = this.get();
    return m.accel > 1 ? ` (shown ${m.accel}× faster: ${(app.link.oneWayMs / 1000).toFixed(1)} s)` : '';
  }
};

app.link.upQueue = [];
app.link.reason = null;
app.link.uplink = function (desc, apply) {
  const item = { desc, apply, sent: Date.now() };
  if (!this.up) { this.upQueue.push(item); app.ui.toast(`No contact: "${desc}" waits until the link returns.`, 'amber'); return; }
  app.ui.toast(`Sent to the crew: ${desc}. Arrives in ${app.mode.delayText()}${app.mode.demoText()}.`);
  setTimeout(() => apply(), this.oneWayMs);
};
const baseSetUp = app.link.setUp.bind(app.link);
app.link.setUp = function (up, reason) {
  this.reason = up ? null : (reason || 'outage');
  baseSetUp(up);
  if (up) {
    const pending = this.upQueue.splice(0);
    pending.forEach(i => setTimeout(() => i.apply(), this.oneWayMs));
  }
};

app.uplink = {
  keys: null, seen: new Set(),
  async init() { this.keys = await app.crypto.keyPair(); },
  async send(cmd, as) {
    const body = Object.assign({ n: app.uid(), ts: Date.now(), issuedBy: app.auth.actor(as) }, cmd);
    const sig = await app.crypto.sign(this.keys.privateKey, JSON.stringify(body));
    app.ledger.append(body.issuedBy, 'command sent from Earth', { type: body.type, key: body.key, value: body.value });
    app.link.uplink(`${app.indicator(body.key).name} limit ${body.value} ${app.indicator(body.key).unit}`, () => this.receive({ body, sig }));
  },
  async receive(pkt) {
    const ok = await app.crypto.verify(this.keys.publicKey, pkt.sig, JSON.stringify(pkt.body));
    const reject = why => {
      app.ledger.append('Health hub', 'command from Earth rejected', { why, type: pkt.body.type });
      app.alerts.raise({ kind: 'security', level: 'red', ts: Date.now(), html: `<b>Command from Earth rejected</b>: ${app.escape(why)}. Alert limits were not changed.` });
    };
    if (!ok) return reject('the flight surgeon\u2019s signature is missing or wrong');
    if (this.seen.has(pkt.body.n)) return reject('this command was already received once (replay)');
    this.seen.add(pkt.body.n);
    if (pkt.body.type === 'limit') baseChange(pkt.body.key, pkt.body.value, { role: 'surgeon' });
  }
};

const baseChange = app.thresholds.change.bind(app.thresholds);
app.thresholds.change = function (key, newMax, as) {
  const role = (as && as.role) || app.auth.role;
  if (app.auth.roles[role].where !== 'Earth' || !app.auth.can('thresholds', null, as)) return baseChange(key, newMax, as);
  app.uplink.send({ type: 'limit', key, value: newMax }, as);
  return true;
};

const canon = v => {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v);
};

app.report = {
  pubJwk: null, fingerprint: null,
  async init() {
    await app.uplink.init();
    this.pubJwk = await crypto.subtle.exportKey('jwk', app.link.hubKeys.publicKey);
    this.fingerprint = (await app.crypto.sha256(canon(this.pubJwk))).slice(0, 16);
  },

  async build(crewId) {
    const c = app.crew.find(x => x.id === crewId);
    const src = app.ui.src();
    await app.ledger.tail;
    const st = await app.ledger.verify(false);
    const vitals = app.indicators.map(ind => {
      const pts = src.series[crewId][ind.key];
      const vals = pts.map(p => p.v);
      const mean = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
      const latest = vals[vals.length - 1];
      return { key: ind.key, name: ind.name, unit: ind.unit, latest, min: Math.min(...vals), max: Math.max(...vals),
        mean: app.round(mean, ind.decimals + 1), status: app.levels[app.classify(ind.key, latest)].label,
        sensorTrusted: !app.ui.untrusted(crewId, ind.key) };
    });
    const pts = src.series[crewId].hr;
    const n = app.ui.news(crewId);
    const body = {
      format: 'pulse-and-proof/health-report@1',
      crew: { id: c.id, name: c.name, role: c.role },
      mission: { name: app.mission.name, location: app.mission.location, day: app.mission.day },
      generatedAt: new Date().toISOString(),
      generatedBy: app.auth.actor(),
      window: { from: new Date(pts[0].t).toISOString(), to: new Date(pts[pts.length - 1].t).toISOString(), readings: pts.length },
      vitals,
      news2: { total: n.total, risk: n.risk, response: n.response },
      radiation: { careerMSv: app.round(app.store.careerDose(crewId), 1), missionMSv: app.round(app.store.missionDose[crewId], 1), careerLimitMSv: app.nasa.careerLimit },
      ledger: { entries: st.count, intact: st.ok, headHash: app.ledger.lastHash },
      disclaimer: 'Simulated crew data. Prototype, not a medical device.'
    };
    const sig = await app.crypto.sign(app.link.hubKeys.privateKey, canon(body));
    return Object.assign({}, body, { signature: { alg: app.crypto.label.split(' ')[0] === 'Ed25519' ? 'Ed25519' : 'ECDSA-P256-SHA256', publicKeyJwk: this.pubJwk, keyFingerprint: this.fingerprint, value: sig } });
  },

  async verify(report) {
    try {
      if (!report || !report.signature) return { ok: false, why: 'This file has no signature.' };
      const { signature, ...body } = report;
      const alg = signature.alg === 'Ed25519' ? { name: 'Ed25519' } : { name: 'ECDSA', namedCurve: 'P-256' };
      const key = await crypto.subtle.importKey('jwk', signature.publicKeyJwk, alg, true, ['verify']);
      const ok = await app.crypto.verify(key, signature.value, canon(body));
      const fp = (await app.crypto.sha256(canon(signature.publicKeyJwk))).slice(0, 16);
      const known = fp === this.fingerprint;
      if (!ok) return { ok: false, why: 'The signature does not match the content: the report was changed after it was signed.' };
      if (!known) return { ok: false, why: `The signature is valid, but key ${fp} is not this hub's key (${this.fingerprint}). Keys are regenerated each session in this prototype.` };
      return { ok: true, why: `Signed by this habitat's health hub (key ${fp}). Not a single character has changed since ${new Date(body.generatedAt).toLocaleString()}.` };
    } catch (e) {
      return { ok: false, why: 'This is not a valid Pulse & Proof report.' };
    }
  },

  download(report) {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `health-report-${report.crew.id}-day${report.mission.day}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
};
