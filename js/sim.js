window.app = window.app || {};

app.historySize = 180;
app.tickMs = 1500;

app.noise = s => (Math.random() + Math.random() + Math.random() - 1.5) * s * 1.15;
app.clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
app.round = (v, d) => Number(v.toFixed(d));
app.uid = () => Math.random().toString(36).slice(2, 10);

app.sim = {
  t: 0,
  events: { lowO2: 0, spe: 0 },
  targets: { lowO2: 0, spe: 0 },
  personal: {},

  init() { this.personal = {}; },
  addCrew(c) { this.personal[c.id] = { fever: 0, feverTarget: 0 }; },

  drift(c, t) {
    if (!c.drift) return 0;
    return app.clamp(14 + (t + 90) * 0.12, 0, 34);
  },

  step() {
    const ramp = (cur, tgt) => cur + app.clamp(tgt - cur, -0.08, 0.08);
    this.events.lowO2 = ramp(this.events.lowO2, this.targets.lowO2);
    this.events.spe = ramp(this.events.spe, this.targets.spe);
    Object.values(this.personal).forEach(p => { p.fever = ramp(p.fever, p.feverTarget); });
    this.t += 1;
  },

  truth(c, t) {
    const b = c.base, d = this.drift(c, t);
    const f = (this.personal[c.id] || {}).fever || 0;
    const o = this.events.lowO2, s = this.events.spe;
    return {
      hr: b.hr + d + 3 * Math.sin(t / 15) + f * 18 + o * 12,
      spo2: b.spo2 - o * 8 - f * 1,
      sbp: b.sbp + d * 0.9 + f * 6,

      temp: b.temp + 0.95 * Math.min(1, app.mission.day / 75) + 0.15 * Math.sin(t / 40) + f * 1.9,
      resp: b.resp + f * 5 + o * 8,
      rad: (app.radBackground().mSvDay * 1000 / 24) * (1 + (c.radOffset || 0) + s * 12)
    };
  },

  reading(c, t) {
    const v = this.truth(c, t);
    return {
      hr: app.round(app.clamp(v.hr + app.noise(2), 30, 220), 0),
      spo2: app.round(app.clamp(v.spo2 + app.noise(0.6), 70, 100), 0),
      sbp: app.round(app.clamp(v.sbp + app.noise(3), 60, 220), 0),
      temp: app.round(app.clamp(v.temp + app.noise(0.05), 34, 42), 1),
      resp: app.round(app.clamp(v.resp + app.noise(0.8), 4, 45), 0),
      rad: app.round(app.clamp(v.rad + app.noise(2), 0, 2000), 0)
    };
  }
};

app.store = {
  series: {},
  missionDose: {},
  init() { this.series = {}; this.missionDose = {}; },
  addCrew(c) {
    this.series[c.id] = {};
    app.indicators.forEach(i => { this.series[c.id][i.key] = []; });
    this.missionDose[c.id] = c.missionDose || 0;
  },
  push(crewId, ts, values) {
    app.indicators.forEach(i => {
      const arr = this.series[crewId][i.key];
      arr.push({ t: ts, v: values[i.key] });
      if (arr.length > app.historySize) arr.shift();
    });

    this.missionDose[crewId] += values.rad / 60 / 1000;
  },
  latest(crewId, key) {
    const arr = this.series[crewId][key];
    return arr.length ? arr[arr.length - 1].v : null;
  },
  careerDose(crewId) {
    const c = app.crew.find(x => x.id === crewId);
    return c.careerBefore + this.missionDose[crewId];
  }
};

app.alerts = {
  list: [],
  state: {},
  rank: { gray: 0, green: 1, amber: 2, red: 3 },
  alerted: {},
  calm: {},
  calmReset: 20,
  evaluate(crewId, values, ts) {
    app.indicators.forEach(i => {
      const k = crewId + '|' + i.key;
      const lvl = app.classify(i.key, values[i.key]);
      this.state[k] = lvl;
      if (lvl === 'green') {
        this.calm[k] = (this.calm[k] || 0) + 1;
        if (this.calm[k] >= this.calmReset) this.alerted[k] = 'green';
        return;
      }
      this.calm[k] = 0;
      const already = this.alerted[k] || 'green';
      if (this.rank[lvl] > this.rank[already]) {
        this.alerted[k] = lvl;
        this.raise({ kind: 'health', crewId, key: i.key, level: lvl, value: values[i.key], ts });
      }
    });
  },
  raise(a) {
    const alert = Object.assign({ id: app.uid(), acked: false }, a);
    this.list.unshift(alert);
    if (this.list.length > 60) this.list.pop();
    app.emit('alert', alert);
    return alert;
  }
};

app.hub = {};

app._handlers = {};
app.on = (name, fn) => { (app._handlers[name] = app._handlers[name] || []).push(fn); };
app.emit = (name, data) => { (app._handlers[name] || []).forEach(fn => fn(data)); };

app.devices = { seq: {} };

app.prefillCrew = c => {
  const now = Date.now(), t0 = app.sim.t;
  for (let k = -app.historySize + 1; k <= 0; k++) {
    const values = app.sim.reading(c, t0 + k);
    app.store.push(c.id, now + k * app.tickMs, values);
    app.indicators.forEach(i => { app.alerts.state[c.id + '|' + i.key] = app.classify(i.key, values[i.key]); });
  }
};

app.tick = async () => {
  if (app._busy) return;
  app._busy = true;
  try {
    app.sim.step();
    const ts = Date.now();
    for (const c of app.crew) await app.hub.ingest(await app.devices.packetFor(c, ts));
    app.emit('tick', ts);
  } finally { app._busy = false; }
};
