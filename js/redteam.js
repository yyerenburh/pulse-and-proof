window.app = window.app || {};

app.redTeam = {
  target() { return app.crew.find(c => c.id === app.ui.sel); },

  async freeze() {
    const c = this.target();
    if (app.devices.override[c.id]) {
      delete app.devices.override[c.id];
      app.sim.personal[c.id].feverTarget = 0;
      app.ui.toast(`${c.name}'s heart-rate sensor released.`, 'green');
    } else {
      const v = app.store.latest(c.id, 'hr');
      app.devices.override[c.id] = { hr: v };
      app.sim.personal[c.id].feverTarget = 1;
      app.ui.toast(`Attack: ${c.name}'s heart-rate sensor frozen at ${v} bpm while the real rate climbs. Signatures stay valid.`, 'security');
    }
    app.emit('redteam');
  },

  async fakeDevice() {
    const c = this.target();
    const kp = await app.crypto.keyPair();
    const p = { deviceId: 'band-x9', crewId: c.id, seq: 1, ts: Date.now(), values: app.sim.reading(c, app.sim.t) };
    p.sig = await app.crypto.sign(kp.privateKey, app.canonical(p));
    app.ui.toast(`Attack: unregistered device sends "all normal" readings as ${c.name}.`, 'security');
    await app.hub.ingest(p);
  },
  async forge() {
    const c = this.target();
    const kp = await app.crypto.keyPair();
    const values = Object.assign(app.sim.reading(c, app.sim.t), { hr: 64, spo2: 98, sbp: 115 });
    const p = { deviceId: 'band-' + c.id, crewId: c.id, seq: (app.devices.seq[c.id] || 0) + 1, ts: Date.now(), values };
    p.sig = await app.crypto.sign(kp.privateKey, app.canonical(p));
    app.ui.toast(`Attack: forged reading using ${c.name}'s real device ID, signed with a stolen-looking key.`, 'security');
    await app.hub.ingest(p);
  },
  async replay() {
    const c = this.target();
    const old = app.devices.captured.filter(p => p.crewId === c.id)[0];
    if (!old) return app.lab.skip('Wait a few seconds so there is traffic to capture.', 'amber');
    app.ui.toast(`Attack: replaying a captured, validly signed reading (sequence ${old.seq}) for ${c.name}.`, 'security');
    await app.hub.ingest(JSON.parse(JSON.stringify(old)));
  },

  async tamper() {
    const c = this.target();
    await app.ledger.tail;
    const L = app.ledger.entries;
    const pick = L.slice(Math.max(0, L.length - 80), Math.max(0, L.length - 12)).find(e => e.action === 'reading' && e.data.crewId === c.id);
    if (!pick) return app.lab.skip('Let the app run ~20 seconds first so there are readings to edit.', 'amber');
    const before = pick.data.values.hr, after = Math.max(48, before - 28);
    pick.data.values.hr = after;
    const pt = app.store.series[c.id].hr.find(p => p.t === pick.data.ts);
    if (pt) pt.v = after;
    app.ui.toast(`Attack: edited ${c.name}'s stored heart rate at ${new Date(pick.data.ts).toLocaleTimeString()} from ${before} to ${after} bpm. Watch the ledger check.`, 'security');
    app.emit('redteam');
  },

  async reportTamper() {
    const c = this.target();
    const rep = await app.report.build(c.id);
    const hr = rep.vitals.find(v => v.key === 'hr');
    const before = hr.latest;
    hr.latest = 72; hr.status = 'Normal';
    app.ui.toast(`Attack: a signed report for ${c.name} is edited to show heart rate 72 bpm instead of ${before}.`, 'security');
    const v = await app.report.verify(rep);
    app.ui.showVerdict(v);
    return v;
  },

  async bitflip() {
    const c = this.target();
    const rec = app.vault.records.filter(r => r.crewId === c.id).slice(-1)[0];
    if (!rec) return app.lab.skip('No record for this crew member yet.', 'amber');
    const ct = rec.box.ct, i = Math.floor(ct.length / 3);
    rec.box = { iv: rec.box.iv, ct: ct.slice(0, i) + (ct[i] === 'Q' ? 'R' : 'Q') + ct.slice(i + 1) };
    const ok = await app.vault.open(rec);
    if (!ok) {
      rec.corrupt = true;
      app.ledger.append('Health hub', 'record failed integrity check', { crewId: c.id, id: rec.id });
      app.alerts.raise({ kind: 'sensor', level: 'amber', crewId: c.id, ts: Date.now(),
        html: `<b>Stored record corrupted</b> (simulated radiation bit flip) in ${app.escape(c.name)}'s medical record. AES-GCM refused to decrypt it, so no wrong data is shown. Restore from the Earth copy.` });
    }
    app.emit('vault');
  },

  escalate() {
    const c = this.target();
    app.ui.toast(`Attack: ${c.name} tries to raise their own heart-rate limit to 140 bpm to silence alerts.`, 'security');
    app.thresholds.change('hr', 140, { role: 'astronaut', self: c.id });
  },
  opsPeek() {
    const c = this.target();
    app.ui.toast(`Attack: Mission operations tries to open ${c.name}'s medical record.`, 'security');
    app.auth.deny('notes', c.id, { role: 'ops' });
  },

  link() {
    app.link.setUp(!app.link.up);
    app.ui.toast(app.link.up ? 'Earth link restored: queued bundles are sent and verified on the ground.' : 'Earth link cut. Onboard monitoring and alerts keep working; data waits in the queue.', app.link.up ? 'green' : 'amber');
  },
  linkTamper() {
    app.link.tamperNext = true;
    app.ui.toast('Attack: next bundle to Earth will be altered in transit.', 'security');
  },

  async forgedCommand() {
    const kp = await app.crypto.keyPair();
    const body = { n: app.uid(), ts: Date.now(), issuedBy: 'Flight surgeon (Earth)', type: 'limit', key: 'hr', value: 150 };
    const sig = await app.crypto.sign(kp.privateKey, JSON.stringify(body));
    app.ui.toast('Attack: someone on the space link sends "raise the heart-rate limit to 150 bpm" pretending to be the flight surgeon.', 'security');
    app.link.uplink('heart-rate limit 150 bpm (forged)', () => app.uplink.receive({ body, sig }));
  },

  async guessPin() {
    const acc = app.accounts.list.find(a => a.role === 'cmo');
    if (!acc) return app.lab.skip('No medical officer account to target.', 'amber');
    app.ui.toast(`Attack: someone picks up the tablet and tries PINs for ${acc.name}.`, 'security');
    for (let i = 0; i < 6; i++) {
      const r = await app.accounts.signIn(acc.id, String(100000 + Math.floor(Math.random() * 899999)));
      if (r.ok) break;
      if (/locked/.test(r.why)) { app.ui.toast(`After ${i + 1} wrong PINs the account is locked for 30 s. Every attempt is in the ledger.`, 'green'); break; }
    }
  },

  run(name) { return this[name] && this[name](); }
};

app.lab = {
  log: [], window: 60000, caught: {},
  layers: [
    ['health', 'Health limits', 'NEWS2 ranges and NASA limits'],
    ['sig', 'Device signature', 'Only paired sensors are believed'],
    ['seq', 'Sequence numbers', 'Old readings cannot be resent'],
    ['plaus', 'Sensor plausibility', 'Frozen or jumping values are flagged'],
    ['ledger', 'Hash-chained ledger', 'Past records cannot be quietly edited'],
    ['enc', 'Encrypted records', 'Damaged notes are refused, not shown'],
    ['report', 'Signed reports', 'Edited reports fail verification'],
    ['roles', 'Roles and PIN', 'Each person sees and changes only their part'],
    ['link', 'Signed Earth link', 'Data and commands to and from Earth are signed']
  ],
  info: {
    freeze: ['plaus', 'Freezes the heart-rate sensor at its last normal value while a fever starts. The readings stay correctly signed, so a signature check alone would accept them.', 'The hub sees the same value 8 readings in a row. A living heart never does that.', 'Vital signs: the heart-rate card is struck through and marked Not trusted, and an amber sensor alert appears.', 'vitals'],
    fakeDevice: ['sig', 'Sends "all normal" readings in this person\'s name from a wearable that was never paired.', 'Every reading must be signed by a paired device. This device has no key on record.', 'The reading never reaches the charts. A red security alert names the device.', 'alerts'],
    forge: ['sig', 'Uses this person\'s real device name but signs with a different key.', 'The signature is checked with the device\'s stored public key and does not match.', 'The reading never reaches the charts. A red security alert says the signature is invalid.', 'alerts'],
    replay: ['seq', 'Resends an old reading that was genuinely signed.', 'Every reading has a sequence number. One that was already seen is refused.', 'A red security alert says the reading was replayed.', 'alerts'],
    tamper: ['ledger', 'Changes a past heart rate in storage to hide a trend.', 'Each ledger entry holds the hash of the one before it, so one change breaks the chain from that point.', 'Security: the ledger shows where the chain broke, with a button to restore the entry from the copy on Earth.', 'security'],
    bitflip: ['enc', 'Flips one bit in an encrypted medical note, as cosmic radiation can do to memory.', 'AES-GCM checks a tag every time a note is opened. One changed bit fails the check.', 'Medical record: the note is marked corrupted instead of showing wrong text, and can be restored from Earth.', 'record'],
    reportTamper: ['report', 'Changes one number in a signed health report after it was signed.', 'The report\'s digital signature is checked against its content.', 'A window says the report was changed after signing.', ''],
    escalate: ['roles', 'The astronaut tries to raise their own heart-rate limit to silence alerts.', 'Only the crew medical officer and the flight surgeon may change limits.', 'The limit stays the same. An Access denied alert and a ledger entry record the attempt.', 'alerts'],
    opsPeek: ['roles', 'Mission operations tries to open private medical notes.', 'Operations sees only fit-for-duty status, never medical details.', 'An Access denied alert and a ledger entry record the attempt.', 'alerts'],
    guessPin: ['roles', 'Someone with the tablet tries random PINs for the medical officer.', 'After 5 wrong PINs the account locks for 30 s. The PIN is never stored; it only unlocks a key.', 'An Account locked alert. Every attempt is in the ledger.', 'alerts'],
    link: ['link', 'Cuts contact with Earth, as jamming or a blackout would.', 'Alerts run on board, so the crew is still warned. Data waits in a signed, encrypted queue.', 'The top bar shows Earth link down and how much data is queued. Press again to restore.', 'security'],
    linkTamper: ['link', 'Alters the next data bundle on its way to Earth.', 'Ground checks each bundle\'s signature before opening it. A changed bundle is refused and sent again.', 'A red alert: Ground rejected bundle.', 'alerts'],
    forgedCommand: ['link', 'Sends a fake "raise the heart-rate limit" command pretending to be the flight surgeon.', 'Commands from Earth must carry the flight surgeon\'s signature. This one does not.', 'After the signal delay, a red alert: Command from Earth rejected. The limit does not change.', 'alerts'],
    fever: ['health', 'The selected person\'s temperature and heart rate start to rise.', 'Every reading is compared with NEWS2 ranges and NASA limits.', 'Cards turn amber, then red. The NEWS2 score rises, and ? on a card says what to do.', 'vitals'],
    lowO2: ['health', 'Blood oxygen falls and breathing speeds up for the whole crew.', 'Every reading is compared with NEWS2 ranges and NASA limits.', 'Overview: the whole crew changes status and alerts appear for each person.', 'overview'],
    spe: ['health', 'Radiation rises to more than 10 times the measured background.', 'Dose rate is compared with the background measured on the Moon or Mars; career dose with the NASA 600 mSv limit.', 'Radiation: the dose rate turns red, next to live NASA space weather.', 'radiation']
  },
  events: {
    fever: { match: (a, e) => a.kind === 'health' && a.crewId === e.crewId && (a.key === 'temp' || a.key === 'hr') },
    lowO2: { match: a => a.kind === 'health' && (a.key === 'spo2' || a.key === 'resp') },
    spe: { match: a => a.kind === 'health' && a.key === 'rad' }
  },
  label(btn) { return btn ? btn.textContent.trim() : ''; },
  add(e) {
    e.id = app.uid(); e.t0 = Date.now(); e.key = this.cur;
    this.log.unshift(e);
    if (this.log.length > 40) this.log.pop();
    this.render();
    if (e.status === 'wait') setTimeout(() => { if (e.status === 'wait') { e.status = 'miss'; this.render(); } }, this.window);
    return e;
  },
  attack(name, btn) {
    this.cur = name;
    const c = app.redTeam.target();
    if (name === 'link') return this.add({ name: this.label(btn), who: '', status: 'info', text: app.link.up ? 'Earth link restored. Queued bundles are sent and checked on the ground.' : 'Earth link cut. Alerts keep working on board; data waits in the queue.' });
    if (name === 'reportTamper') return this.add({ name: this.label(btn), who: c && c.name, status: 'wait', kind: 'attack' });
    return this.add({ name: this.label(btn), who: ['guessPin', 'forgedCommand', 'linkTamper'].includes(name) ? '' : c && c.name, status: 'wait', kind: 'attack', crewId: c && c.id });
  },
  event(ev, btn) {
    this.cur = ev;
    const c = app.redTeam.target();
    if (!this.events[ev]) return this.add({ name: this.label(btn), who: '', status: 'info', text: ev === 'day' ? `Mission day ${app.mission.day}. Daily tasks were reset.` : ev === 'clear' ? 'All simulated events stopped. Values return to normal over the next minute.' : app.link.reason === 'conjunction' ? 'Solar conjunction started. No contact with Earth.' : 'Solar conjunction over. Queued data is being sent.' });
    return this.add({ name: this.label(btn), who: ev === 'fever' ? c && c.name : 'Whole crew', status: 'wait', kind: 'event', ev, crewId: c && c.id });
  },
  verdict(e, v) {
    if (!v) return;
    e.status = v.ok ? 'miss' : 'ok'; e.t1 = Date.now();
    e.text = v.ok ? 'The edited report still verified.' : 'Signature check failed: ' + v.why;
    if (!v.ok) this.count(e);
    this.render();
  },
  plain(a) {
    if (a.html) return a.html.replace(/<[^>]+>/g, '');
    const i = app.indicator(a.key);
    return `${i ? i.name : a.key} ${a.value}${i ? ' ' + i.unit : ''} (${a.level === 'red' ? 'act now' : 'watch'}).`;
  },
  onAlert(a) {
    const e = this.log.find(x => x.status === 'wait' && x.kind && (x.kind === 'event' ? this.events[x.ev].match(a, x) : a.kind !== 'health'));
    if (!e) return;
    e.status = 'ok'; e.t1 = Date.now(); e.text = this.plain(a);
    this.count(e);
    this.render();
  },
  skip(msg, lvl) { app.ui.toast(msg, lvl); return 'skip'; },
  drop(e) { if (e) { this.log = this.log.filter(x => x !== e); this.render(); } },
  count(e) { const i = this.info[e.key]; if (i) this.caught[i[0]] = (this.caught[i[0]] || 0) + 1; },
  clear() { this.log = []; this.caught = {}; this.render(); },
  renderLast() {
    const body = document.getElementById('lt-body');
    if (!body) return;
    const esc = app.escape, e = this.log[0], i = e && this.info[e.key];
    const pill = document.getElementById('lt-status');
    const act = i ? i[0] : null;
    document.getElementById('layers').innerHTML = this.layers.map(([k, n, d]) => `<li class="${k === act ? 'on ' + (e.status) : ''}"><span class="dot"></span><span><b>${n}</b><span class="small muted">${d}</span></span><span class="n">${this.caught[k] ? '✓ ' + this.caught[k] : ''}</span></li>`).join('');
    if (!e) { pill.textContent = ''; pill.className = 'st-pill'; return; }
    pill.className = 'st-pill ' + e.status;
    pill.textContent = e.status === 'ok' ? (e.kind === 'event' ? 'Flagged in ' : 'Caught in ') + ((e.t1 - e.t0) / 1000).toFixed(1) + ' s' : e.status === 'wait' ? 'Watching…' : e.status === 'miss' ? (e.kind === 'event' ? 'No new alert' : 'Not caught') : 'Info';
    if (!i) { body.innerHTML = `<p><b>${esc(e.name)}</b></p><p class="muted">${esc(e.text || '')}</p>`; return; }
    body.innerHTML = `<p class="lt-name"><b>${esc(e.name)}</b>${e.who ? ' <span class="muted">· ' + esc(e.who) + '</span>' : ''}</p>
      <ol class="lt-steps"><li><span>${e.kind === 'event' ? 'What happens' : 'What the attacker does'}</span>${esc(i[1])}</li>
      <li><span>What the system checks</span>${esc(i[2])}</li>
      <li><span>What you will see</span>${esc(i[3])}${i[4] ? ` <button class="link" data-go="${i[4]}" type="button">Show me</button>` : ''}</li></ol>`;
  },
  render() {
    this.renderLast();
    const el = document.getElementById('lab-log');
    if (!el) return;
    if (!this.log.length) { el.innerHTML = '<li class="empty">Run an event or an attack to see the result here.</li>'; return; }
    const esc = app.escape;
    const head = { ok: e => e.kind === 'event' ? `Flagged in ${((e.t1 - e.t0) / 1000).toFixed(1)} s` : `Caught in ${((e.t1 - e.t0) / 1000).toFixed(1)} s`, wait: () => 'Watching…', miss: e => e.kind === 'event' ? 'No new alert' : 'Not caught', info: () => 'Info' };
    el.innerHTML = this.log.map(e => `<li><span class="muted small">${new Date(e.t0).toLocaleTimeString()}</span><span><b>${esc(e.name)}</b>${e.who ? `<br><span class="small muted">${esc(e.who)}</span>` : ''}</span><span><span class="st ${e.status}">${head[e.status](e)}</span>${e.text ? ' · ' + esc(e.text) : e.status === 'wait' ? ' · waiting for the first matching alert' : e.status === 'miss' ? (e.kind === 'event' ? ' · the value may already have been alerting' : ' · no alert within 60 s') : ''}</span></li>`).join('');
  }
};
