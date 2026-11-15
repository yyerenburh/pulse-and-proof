window.app = window.app || {};

const $ = s => document.querySelector(s);
const esc = app.escape || (s => String(s ?? ''));
const colors = { green: '#0e8a5f', amber: '#f2a900', red: '#d7261e', gray: '#8a94a6' };
const clock = ts => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const fitLabel = { green: 'Fit for duty', amber: 'Restricted duty', red: 'Not fit for duty', gray: 'Unknown' };

app.ui = {
  sel: null,
  trendKey: 'hr',
  chart: null,
  showRaw: false,

  crew(id) { return app.crew.find(c => c.id === id); },

  src() { return app.auth.onGround() ? app.ground : app.store; },
  latest(crewId, key) { return this.src().latest(crewId, key); },
  levelOf(crewId, key) { return app.classify(key, this.latest(crewId, key)); },
  untrusted(crewId, key) { return !app.auth.onGround() && !!(app.integrity && app.integrity.flagged[crewId + '|' + key]); },

  values(crewId) { const v = {}; app.indicators.forEach(i => { v[i.key] = this.latest(crewId, i.key); }); return v; },
  news(crewId) { return app.news2(this.values(crewId)); },

  overall(crewId) {
    return app.worst(app.indicators.map(i => (this.untrusted(crewId, i.key) ? 'amber' : this.levelOf(crewId, i.key))).concat(this.news(crewId).level));
  },
  flags(crewId, key) { return app.integrity ? app.integrity.flag(crewId, key) : ''; },

  toast(msg, cls = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + cls;
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), 6000);
    const all = $('#toasts').children;
    if (all.length > 4) all[0].remove();
  },

  dialog(html, opts = {}) {
    const dlg = $('#dlg');
    const actions = opts.onOk
      ? `<div class="dlg-actions"><button class="btn ghost" value="cancel" formnovalidate>Cancel</button><button class="btn primary" value="ok">${esc(opts.ok || 'OK')}</button></div>`
      : '';
    $('#dlg-body').innerHTML = html + actions;
    const form = dlg.querySelector('form');
    form.onsubmit = async ev => {
      const v = ev.submitter && ev.submitter.value;
      if (v !== 'ok' || !opts.onOk) return;
      ev.preventDefault();
      const err = await opts.onOk(form.elements);
      if (typeof err === 'string') { const e = dlg.querySelector('.form-err'); if (e) e.textContent = err; else this.toast(err, 'amber'); return; }
      if (dlg.open) dlg.close();
    };
    if (!dlg.open) dlg.showModal();
  },

  explain(key) {
    const ind = app.indicator(key);
    const v = this.latest(this.sel, key), lvl = app.classify(key, v);
    const now = lvl === 'red' ? ind.red : lvl === 'amber' ? ind.amber : 'Nothing to do. Keep your daily routine.';
    const g = ind.bands.find(b => b.level === 'green');
    const limit = app.auth.can('thresholds')
      ? `<h4>Alert limit (flight surgeon only)</h4>
         <div class="field"><span>Normal range ends below (${esc(ind.unit)})</span><input name="limit" type="number" step="any" value="${g.max}"></div>`
      : `<h4>Alert limit</h4><p class="small muted">Normal range ends below ${g.max} ${esc(ind.unit)}. Only the flight surgeon can change limits; every change is logged.</p>`;
    this.dialog(`
      <h3>${esc(ind.name)}</h3>
      <p class="muted">${esc(this.crew(this.sel).name)}: <b class="lv ${lvl}">${v ?? '—'} ${esc(ind.unit)} · ${app.levels[lvl].icon} ${app.levels[lvl].label}</b></p>
      <h4>What it is</h4><p>${esc(ind.what)}</p>
      <h4>How it is measured</h4><p>${esc(ind.how)}</p>
      <h4>Why it matters in space</h4><p>${esc(ind.space)}</p>
      <h4>What the colors mean</h4>
      <div class="do green">● Normal: ${esc(ind.normal)}</div>
      <div class="do amber">▲ Watch: ${esc(ind.amber)}</div>
      <div class="do red">■ Act now: ${esc(ind.red)}</div>
      <h4>What to do now</h4><div class="do ${lvl}">${esc(now)}</div>
      ${ind.news ? `<p class="small muted" style="margin-top:8px">This value adds <b>${app.news2({ [key]: v }).total}</b> of 3 possible points to the NEWS2 early warning score.</p>` : ''}
      ${limit}
      <p class="small muted" style="margin-top:12px">Ranges are illustrative for this prototype and are not medical advice.</p>`,
    app.auth.can('thresholds') ? { ok: 'Save limit', onOk: f => app.thresholds.change(key, Number(f.limit.value)) } : {});
  },

  async showReport() {
    if (!app.auth.can('vitals', this.sel)) return app.auth.deny('vitals', this.sel);
    const r = await app.report.build(this.sel);
    app.ledger.append(app.auth.actor(), 'signed report exported', { crewId: this.sel, keyFingerprint: r.signature.keyFingerprint });
    const rows = r.vitals.map(v => `<tr><td>${esc(v.name)}</td><td><b>${v.latest}</b> ${esc(v.unit)}</td><td>${v.min} to ${v.max}</td><td>${esc(v.status)}${v.sensorTrusted ? '' : ' (sensor not trusted)'}</td></tr>`).join('');
    this._lastReport = r;
    this.dialog(`<h3>Signed health report: ${esc(r.crew.name)}</h3>
      <p class="small muted">Mission day ${r.mission.day}, ${r.window.readings} readings. Signed by the health hub; Earth can check that nothing was changed.</p>
      <table class="tbl"><thead><tr><th>Vital sign</th><th>Latest</th><th>Range in window</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
      <p style="margin-top:10px">NEWS2 total <b>${r.news2.total}</b> (${esc(r.news2.risk.toLowerCase())} risk). Career radiation dose <b>${r.radiation.careerMSv} mSv</b> of ${r.radiation.careerLimitMSv}. Ledger ${r.ledger.intact ? 'intact' : '<b class="lv red">broken</b>'}, ${r.ledger.entries} entries.</p>
      <p class="small muted mono" style="margin-top:8px">${esc(r.signature.alg)} · key ${esc(r.signature.keyFingerprint)} · sig ${esc(r.signature.value.slice(0, 32))}…</p>
      <div class="dlg-actions"><button class="btn" type="button" id="dl-report">Download JSON</button><button class="btn primary" type="button" id="vf-report">Verify this report</button></div>`);
    $('#dl-report').onclick = () => app.report.download(r);
    $('#vf-report').onclick = async () => this.showVerdict(await app.report.verify(r));
  },

  checkReport() {
    this.dialog(`<h3>Check a health report</h3>
      <p class="small muted">Load a report file, or paste its JSON. The check uses the report's signature and this hub's key.</p>
      <div class="field"><input type="file" id="rep-file" accept="application/json,.json"></div>
      <div class="field"><textarea id="rep-text" rows="6" placeholder='{"format": "pulse-and-proof/health-report@1", …}'></textarea></div>
      <div class="dlg-actions"><button class="btn primary" type="button" id="rep-go">Check report</button></div>`);
    $('#rep-file').onchange = async e => { const f = e.target.files[0]; if (f) $('#rep-text').value = await f.text(); };
    $('#rep-go').onclick = async () => {
      let obj = null;
      try { obj = JSON.parse($('#rep-text').value); } catch (e) { obj = null; }
      this.showVerdict(await app.report.verify(obj));
    };
  },

  showVerdict(v) {
    this.dialog(`<h3>${v.ok ? '<span class="lv green">✓ Report is authentic</span>' : '<span class="lv red">✗ Report failed the check</span>'}</h3><p>${esc(v.why)}</p>`);
    app.ledger.append(app.auth.actor(), 'report checked', { ok: v.ok });
  },

  explainNews() {
    const n = this.news(this.sel);
    const rows = app.indicators.filter(i => i.news).map(i => `<tr><td>${esc(i.name)}</td><td>${this.latest(this.sel, i.key)} ${esc(i.unit)}</td><td><b>${n.parts[i.key] ?? '—'}</b></td></tr>`).join('');
    this.dialog(`<h3>NEWS2 early warning score</h3>
      <p>NEWS2 (Royal College of Physicians, 2017) turns five vital signs into points from 0 to 3 and adds them up. Several small changes together can matter as much as one big change.</p>
      <table class="tbl"><thead><tr><th>Vital sign</th><th>Now</th><th>Points</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="2">Total for ${esc(this.crew(this.sel).name)}</td><td><b>${n.total}</b></td></tr></tfoot></table>
      <h4>What the total means</h4>
      <div class="do green">0 to 4: low risk. Keep monitoring.</div>
      <div class="do amber">3 in one vital sign, or 5 to 6 in total: urgent review by the crew medical officer.</div>
      <div class="do red">7 or more: emergency response.</div>
      <p class="small muted" style="margin-top:12px">NEWS2 was validated on hospital patients on Earth, not in spaceflight. Consciousness is assumed alert and breathing on cabin air. Our color bands follow NEWS2 points: 0 is Normal, 1 to 2 is Watch, 3 is Act now.</p>`);
  },

  renderMission() {
    $('#mission').innerHTML = `<b>${esc(app.mission.name)}</b>, ${esc(app.mission.location.toLowerCase())}. Mission day <b>${app.mission.day}</b>`;
  },

  renderBanner() {
    const b = $('#banner');
    if (!app.auth.onGround()) { b.hidden = true; return; }
    const ago = Math.round((Date.now() - app.ground.lastSync) / 1000);
    b.hidden = false;
    b.className = 'banner' + (app.link.up ? '' : ' amber');
    b.innerHTML = app.link.up
      ? `<b>Earth view.</b> You see only data from verified, decrypted bundles. Last bundle ${ago}s ago. One-way signal delay: ${app.mode.delayText()}${app.mode.demoText()}. Anything you send reaches the crew that much later.`
      : app.link.reason === 'conjunction'
        ? `<b>Solar conjunction: no contact for ${ago}s.</b> Every two years the Sun sits between Earth and Mars and NASA pauses commands for about two weeks. Showing data as of ${clock(app.ground.lastSync)}. The crew is on its own; onboard monitoring continues.`
        : `<b>No contact with the crew for ${ago}s.</b> Showing data as of ${clock(app.ground.lastSync)}. Onboard alerts keep working without Earth.`;
  },

  renderCrew() {
    const r = app.auth.role;
    $('#crew-list').innerHTML = app.crew.map(c => {
      const lvl = this.overall(c.id);
      const hidden = r === 'admin' || (r === 'astronaut' && c.id !== app.auth.self);
      let st;
      if (r === 'admin') st = '<span class="st muted">no medical access</span>';
      else if (hidden) st = '<span class="st muted">🔒 private</span>';
      else if (r === 'ops') st = `<span class="st lv ${lvl}">${app.levels[lvl].icon} ${fitLabel[lvl]}</span>`;
      else st = `<span class="st lv ${lvl}">${app.levels[lvl].icon} ${app.levels[lvl].label}</span>`;
      const clickable = r !== 'astronaut' || c.id === app.auth.self;
      return `<li><button class="crew-item ${c.id === this.sel ? 'sel' : ''}" ${clickable ? `data-crew="${c.id}"` : 'disabled'} type="button">
        ${app.avatar(c.name, hidden || r === 'admin' ? 'gray' : lvl, 'sm')}
        <span class="who"><b>${esc(c.name)}</b><span>${esc(c.role)}</span></span>${st}</button></li>`;
    }).join('');
  },

  renderPerson() {
    const c = this.crew(this.sel), lvl = this.overall(c.id);
    $('#person-avatar').innerHTML = app.avatar(c.name, app.auth.role === 'admin' ? 'gray' : lvl, 'lg');
    $('#person-name').textContent = c.name;
    $('#person-meta').textContent = app.auth.can('vitals', c.id)
      ? `${c.role} · signed readings every ${app.tickMs / 1000} s from wearable sensors`
      : c.role;
    const nw = $('#news'), n = this.news(c.id);
    nw.hidden = !app.auth.can('vitals', c.id);
    nw.innerHTML = `<button class="news-score ${n.level}" data-news type="button" title="What is NEWS2?">${n.total}</button><span><b>NEWS2 ${n.risk === 'None' ? 'no added risk' : esc(n.risk.toLowerCase()) + ' risk'}</b>${esc(n.response)}</span>`;
    const st = $('#person-status');
    if (app.auth.role === 'admin') { st.className = 'status-big'; st.textContent = 'No medical access'; return; }
    st.className = 'status-big ' + lvl;
    st.textContent = app.auth.role === 'ops' ? `${app.levels[lvl].icon} ${fitLabel[lvl]}` : `${app.levels[lvl].icon} Overall: ${app.levels[lvl].label}`;
  },

  renderCards() {
    const ok = app.auth.can('vitals', this.sel);
    $('#trend').closest('.panel').hidden = !ok;
    if (!ok) {
      const lvl = this.overall(this.sel);
      $('#cards').innerHTML = app.auth.role === 'ops'
        ? `<div class="restricted" style="grid-column:1/-1"><span class="muted small">Fit-for-duty status</span>
            <span class="fit lv ${lvl}">${app.levels[lvl].icon} ${fitLabel[lvl]}</span>
            <span class="small muted">Plan EVAs and tasks around this status. Diagnoses and vital signs are restricted to the medical team (least privilege).</span></div>`
        : `<div class="restricted" style="grid-column:1/-1"><span class="fit">🔒</span>
            <span class="small muted">${app.auth.role === 'admin' ? 'System admins manage devices, users and the ledger. They have no access to medical data.' : 'This crew member’s health data is private.'}</span></div>`;
      return;
    }
    $('#cards').innerHTML = app.indicators.map(ind => {
      const v = this.latest(this.sel, ind.key), bad = this.untrusted(this.sel, ind.key);
      const lvl = bad ? 'gray' : app.classify(ind.key, v);
      const flag = app.auth.onGround() ? '' : this.flags(this.sel, ind.key);
      return `<div class="card ${lvl} ${bad ? 'untrusted' : ''} ${ind.key === this.trendKey ? 'active' : ''}" data-key="${ind.key}" role="button" tabindex="0" aria-label="${esc(ind.name)} trend">
        <div class="name">${app.icon(ind.key, 17)}${esc(ind.name)}</div>
        <button class="info" data-explain="${ind.key}" type="button" aria-label="Explain ${esc(ind.name)}">?</button>
        <div class="val">${v ?? '—'}<small>${esc(ind.unit)}</small></div>
        <div class="lvl lv ${lvl}">${bad ? '○ Not trusted' : `${app.levels[lvl].icon} ${app.levels[lvl].label}`}</div>
        <div class="flag">${flag}</div>
      </div>`;
    }).join('');
  },

  renderTabs() {
    $('#trend-tabs').innerHTML = app.indicators.map(i =>
      `<button class="tab ${i.key === this.trendKey ? 'on' : ''}" data-tab="${i.key}" type="button">${esc(i.short)}</button>`).join('');
  },

  bandsPlugin: {
    id: 'bands',
    beforeDraw(chart) {
      const ind = app.indicator(app.ui.trendKey), y = chart.scales.y, area = chart.chartArea, ctx = chart.ctx;
      let lo = y.min;
      ctx.save();
      ind.bands.forEach(b => {
        const hi = Math.min(b.max, y.max);
        if (hi > lo) {
          const top = y.getPixelForValue(hi), bottom = y.getPixelForValue(lo);
          ctx.fillStyle = colors[b.level] + '1c';
          ctx.fillRect(area.left, top, area.right - area.left, bottom - top);
        }
        lo = Math.max(lo, b.max);
      });
      ctx.restore();
    }
  },

  renderChart() {
    if (!app.auth.can('vitals', this.sel)) return;
    const ind = app.indicator(this.trendKey);
    const pts = this.src().series[this.sel][this.trendKey];
    const labels = pts.map(p => clock(p.t));
    const data = pts.map(p => p.v);
    const ptColors = pts.map(p => colors[app.classify(this.trendKey, p.v)]);
    if (!this.chart) {
      this.chart = new Chart($('#trend'), {
        type: 'line',
        data: { labels, datasets: [{ data, borderColor: '#0b3d91', borderWidth: 2, pointRadius: 2.2, pointBackgroundColor: ptColors, pointBorderWidth: 0, tension: 0.25 }] },
        options: {
          animation: false, maintainAspectRatio: false, responsive: true,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${c.parsed.y} ${app.indicator(app.ui.trendKey).unit}` } } },
          scales: {
            x: { ticks: { color: '#5b6577', maxTicksLimit: 6, maxRotation: 0, font: { family: 'Public Sans' } }, grid: { color: '#e6eaf0' } },
            y: { min: ind.chartMin, max: ind.chartMax, ticks: { color: '#5b6577', font: { family: 'Public Sans' } }, grid: { color: '#e6eaf0' }, title: { display: true, text: ind.unit, color: '#5b6577', font: { family: 'Public Sans' } } }
          }
        },
        plugins: [this.bandsPlugin]
      });
    } else {
      const ds = this.chart.data.datasets[0];
      this.chart.data.labels = labels;
      ds.data = data;
      ds.pointBackgroundColor = ptColors;
      Object.assign(this.chart.options.scales.y, { min: ind.chartMin, max: ind.chartMax });
      this.chart.options.scales.y.title.text = ind.unit;
      this.chart.update('none');
    }
    const n = Math.min(30, Math.floor(pts.length / 3));
    if (n > 3) {
      const avg = a => a.reduce((s, p) => s + p.v, 0) / a.length;
      const a0 = avg(pts.slice(0, n)), a1 = avg(pts.slice(-n));
      const diff = a1 - a0, tol = (ind.chartMax - ind.chartMin) * 0.05;
      const word = Math.abs(diff) < tol ? 'stable' : diff > 0 ? 'rising' : 'falling';
      $('#trend-note').innerHTML = `${esc(ind.name)} is <b>${word}</b> over this window: average ${app.round(a0, ind.decimals)} → ${app.round(a1, ind.decimals)} ${esc(ind.unit)}. Shaded bands show the normal, watch and act-now ranges.`;
    }
  },

  alertVisible(a) {
    const r = app.auth.role;
    if (r === 'cmo' || r === 'surgeon') return true;
    if (r === 'astronaut') return a.crewId === app.auth.self;
    if (r === 'ops') return a.kind === 'health';
    if (r === 'admin') return a.kind !== 'health';
    return false;
  },

  alertText(a) {
    if (a.kind === 'health') {
      const ind = app.indicator(a.key), c = this.crew(a.crewId);
      if (app.auth.role === 'ops') return `<b>${esc(c.name)}</b>: duty status changed to <span class="lv ${a.level}">${fitLabel[a.level]}</span>`;
      const tip = (a.level === 'red' ? ind.red : ind.amber).split('. ')[0].replace(/\.$/, '') + '.';
      return `<b>${esc(c.name)}</b>: ${esc(ind.name)} ${a.value} ${esc(ind.unit)} · <span class="lv ${a.level}">${app.levels[a.level].label}</span><div>${esc(tip)}</div>`;
    }
    return a.html || esc(a.text || '');
  },

  renderAlerts() {
    const list = app.alerts.list.filter(a => this.alertVisible(a));
    const open = list.filter(a => !a.acked).length;
    $('#alert-count').textContent = open ? `${open} open` : 'all clear';
    $('#alert-list').innerHTML = list.length ? list.slice(0, 25).map(a => {
      const canAck = a.crewId ? app.auth.can('ack', a.crewId) : ['cmo', 'surgeon', 'admin'].includes(app.auth.role);
      return `<li class="alert ${a.level === 'red' ? 'red' : ''} ${a.kind !== 'health' ? a.kind : ''} ${a.acked ? 'acked' : ''}" data-alert="${a.id}">
        ${this.alertText(a)}
        <div class="meta"><span>${clock(a.ts)}${a.acked ? ` · acknowledged by ${esc(a.ackedBy)}` : ''}</span>
        ${a.acked || !canAck ? '' : `<button class="btn ghost" data-ack="${a.id}" type="button">Acknowledge</button>`}</div>
      </li>`;
    }).join('') : '<li class="empty">No alerts for your view.</li>';
  },

  renderTasks() {
    if (!app.auth.can('viewTasks', this.sel)) {
      $('#level').textContent = ''; $('#xp-bar').style.width = '0';
      $('#xp-text').textContent = 'Health tasks are visible to the astronaut and the medical team only.';
      $('#tasks').innerHTML = ''; $('#badges').innerHTML = '';
      return;
    }
    const s = app.game.state[this.sel], sum = app.game.summary(this.sel), mine = app.auth.can('doTasks', this.sel);
    $('#level').textContent = `Level ${sum.level} · ${sum.streak}-day streak`;
    $('#xp-bar').style.width = (s.points % 100) + '%';
    $('#xp-text').textContent = `${s.points} points · ${100 - (s.points % 100)} to level ${sum.level + 1} · ${sum.doneToday}/${app.tasks.length} done today${mine ? '' : ' · view only'}`;
    $('#tasks').innerHTML = app.tasks.map(t => {
      const done = !!s.doneToday[t.id];
      return `<li class="task ${done ? 'done' : ''}"><span class="chk">${done ? '✓' : ''}</span>
        <span class="tname">${esc(t.name)}</span><span class="pts">+${t.points}</span>
        ${done || !mine ? '' : `<button class="btn" data-task="${t.id}" type="button">Start</button>`}</li>`;
    }).join('');
    $('#badges').innerHTML = app.badges.map(b => `<span class="badge ${s.badges.has(b.id) ? 'got' : ''}">${s.badges.has(b.id) ? '★' : '☆'} ${esc(b.name)}</span>`).join('');
  },

  renderDose() {
    if (!app.auth.can('vitals', this.sel)) { $('#dose').innerHTML = '<p class="small muted">Restricted to the astronaut and the medical team.</p>'; return; }
    const career = app.store.careerDose(this.sel), mission = app.store.missionDose[this.sel], lim = app.nasa.careerLimit;
    const pct = Math.min(100, career / lim * 100);
    const lvl = pct < 50 ? 'green' : pct < 80 ? 'amber' : 'red';
    $('#dose').innerHTML = `
      <div class="row"><span class="big">${career.toFixed(1)} <small class="muted">mSv</small></span><span class="lv ${lvl}">${pct.toFixed(0)}% of career limit</span></div>
      <div class="bar"><div class="fill" style="width:${pct}%;background:${colors[lvl]}"></div></div>
      <div class="row small muted"><span>This mission: ${mission.toFixed(1)} mSv</span><span>Remaining: ${(lim - career).toFixed(0)} mSv</span></div>
      <p class="small muted" style="margin-top:10px">Daily background used: <b>${app.radBackground().mSvDay} mSv</b>, measured by ${esc(app.radBackground().src)}. Mission dose = days on mission × that rate, plus any solar particle event.</p>`;
  },

  async renderRecords() {
    const can = app.auth.can('notes', this.sel);
    $('#note-btn').hidden = !app.auth.can('addNote');
    const recs = app.vault.records.filter(r => r.crewId === this.sel).slice().reverse();
    if (!recs.length) { $('#records').innerHTML = '<li class="empty">No records yet.</li>'; return; }
    const rows = await Promise.all(recs.map(async r => {
      const meta = `<div class="meta">${esc(r.kind === 'checkin' ? 'Sleep and mood check-in' : 'Clinical note')} · ${esc(r.author)} · ${new Date(r.ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>`;
      if (this.showRaw || !can) {
        return `<li class="rec">${meta}<div class="ct">${can ? '' : '🔒 '}iv=${esc(r.box.iv)} ct=${esc(r.box.ct.slice(0, 120))}…</div></li>`;
      }
      const p = await app.vault.open(r);
      if (!p) return `<li class="rec bad">${meta}<b class="lv amber">⚠ This record failed its integrity check and was not shown.</b> <span class="small muted">Restore it from the Earth copy.</span></li>`;
      const body = r.kind === 'checkin'
        ? `Slept ${esc(p.sleep)} h · mood ${['', 'Low', 'Tired', 'OK', 'Good', 'Great'][p.mood] || '—'}${p.note ? ` · “${esc(p.note)}”` : ''}`
        : esc(p.text);
      return `<li class="rec">${meta}${body}</li>`;
    }));
    $('#records').innerHTML = (can ? '' : '<li class="empty">🔒 Encrypted. Your role has no access, so you see only ciphertext.</li>') + rows.join('');
  },

  renderSecurity() {
    const st = app.ledger.status, q = app.link.queue.length;
    const ledger = st.at
      ? (st.ok ? `<span class="lv green">✓ intact</span> · ${st.count} entries · checked ${clock(st.at)}` : `<span class="lv red">✗ broken at #${st.brokenAt}</span>`)
      : `${app.ledger.entries.length} entries · first check soon`;
    $('#sec').innerHTML = `
      <div class="sec-row"><span class="k">Hash-chained ledger</span><span class="v">${ledger}</span></div>
      <div class="sec-row"><span class="k">Signed sensors</span><span class="v">${Object.keys(app.hub.trusted).length} · ${esc(app.crypto.label)}</span></div>
      <div class="sec-row"><span class="k">Readings accepted / rejected</span><span class="v">${app.hub.accepted} / <span class="${app.hub.rejected ? 'lv red' : ''}">${app.hub.rejected}</span></span></div>
      <div class="sec-row"><span class="k">Earth sync</span><span class="v">${app.link.up ? '<span class="lv green">link up</span>' : '<span class="lv red">link down</span>'} · ${q} queued · ${app.ground.received} verified on Earth${app.ground.rejected ? ` · <span class="lv red">${app.ground.rejected} rejected</span>` : ''}</span></div>
      <div class="sec-row"><span class="k">Medical records</span><span class="v">${app.vault.records.length} encrypted (AES-256-GCM)</span></div>
      <div class="sec-row"><span class="k">Hub signing key</span><span class="v mono">${esc(app.report.fingerprint || '')}</span></div>
      <div class="btn-row" style="margin-top:10px"><button class="btn" id="verify-btn" type="button">Verify ledger now</button><button class="btn" id="check-report-btn" type="button">Check a report</button></div>`;
    const pill = $('#link-pill');
    pill.className = 'pill ' + (app.link.up ? 'ok' : 'down');
    pill.textContent = app.link.up ? `Earth link: up · ${app.mode.delayText()} delay` : `Earth link: ${app.link.reason === 'conjunction' ? 'solar conjunction' : 'down'} · ${q} queued`;
    const cj = $('#conj-btn'); $('#conj-row').hidden = app.mode.key !== 'mars'; cj.textContent = app.link.reason === 'conjunction' ? 'End solar conjunction' : 'Solar conjunction';
    $('#report-btn').hidden = !app.auth.can('vitals', this.sel);
    const f = $('#rt-freeze'); f.classList.toggle('on', !!app.devices.override[this.sel]); f.textContent = app.devices.override[this.sel] ? 'Release frozen sensor' : 'Freeze heart-rate sensor';
    const l = $('#rt-link'); l.classList.toggle('on', !app.link.up); l.textContent = app.link.up ? 'Cut Earth link' : 'Restore Earth link';
  },

  async showLedger() {
    if (!app.auth.can('ledger')) return app.auth.deny('ledger');
    const st = await app.ledger.verify(false);
    const shown = app.ledger.entries.slice(-120);
    if (!st.ok && st.brokenAt < app.ledger.entries.length - 120) shown.unshift(app.ledger.entries[st.brokenAt]);
    const rows = shown.reverse().map(e => {
      const who = e.data && e.data.crewId ? ' · ' + this.crew(e.data.crewId).name : '';
      const extra = e.action === 'reading' ? ` seq ${e.data.seq}` : e.data && e.data.reason ? ` · ${e.data.reason}` : e.data && e.data.attempted ? ` · tried: ${e.data.attempted}` : '';
      return `<div class="${st.brokenAt === e.i ? 'broken' : ''}"><span>#${e.i}</span><span>${clock(e.ts)} · ${esc(e.action)}${esc(who)}${esc(extra)}<br><span class="muted">${esc(e.actor)}</span></span><span class="h">${e.hash.slice(0, 10)}…</span></div>`;
    }).join('');
    this.dialog(`<h3>Tamper-evident ledger</h3>
      <p class="small muted">Every reading, action and denied attempt is chained: each entry stores the SHA-256 hash of the one before. Changing any past entry breaks every link after it. ${st.ok ? '<b class="lv green">Chain intact.</b>' : `<b class="lv red">Chain broken at entry #${st.brokenAt}.</b>`} Newest first, ${st.count} entries in total:</p>
      <div class="ledger">${rows}</div>`);
    const broken = document.querySelector('.ledger .broken');
    if (broken) broken.scrollIntoView({ block: 'center' });
  },

  addNote() {
    if (!app.auth.can('addNote')) return app.auth.deny('addNote', this.sel);
    this.dialog(`<h3>Clinical note for ${esc(this.crew(this.sel).name)}</h3>
      <p class="small muted">Encrypted before it is stored. Only the astronaut and the medical team can read it.</p>
      <div class="field"><textarea name="text" rows="4" required placeholder="Observation, plan, follow-up…"></textarea></div>`,
    { ok: 'Save encrypted note', onOk: f => { if (f.text.value.trim()) app.vault.put(this.sel, 'clinical', app.auth.actor(), { text: f.text.value.trim() }); } });
  },

  ready() {
    const signed = !!app.accounts.current;
    $('#gate').hidden = signed; $('#workspace').hidden = !signed;
    if (!signed) return false;
    if (app.auth.role === 'astronaut') this.sel = app.auth.self;
    else if (!this.crew(this.sel)) this.sel = (app.crew[0] || {}).id || null;
    const has = !!this.sel;
    document.querySelectorAll('.needs-crew').forEach(el => { el.hidden = !has; });
    $('#empty').hidden = has;
    return has;
  },

  renderAccount() {
    const acc = app.accounts.current; if (!acc) return;
    $('#who').innerHTML = `${app.avatar(acc.name, 'gray', 'sm')}<div><b>${esc(acc.name)}</b><span class="r">${esc(app.auth.roles[acc.role].label)}${app.accounts.demo ? ' <span class="demo-tag">demo</span>' : ''}</span></div>`;
    $('#reg-btn').hidden = !app.auth.can('registerCrew');
    const has = !!this.sel;
    $('#edit-btn').hidden = !has || !app.auth.can('editProfile', this.sel);
    $('#measure-btn').hidden = !has || !app.auth.can('manualReading', this.sel);
  },

  renderEmpty() {
    const can = app.auth.can('registerCrew');
    $('#empty').innerHTML = `<h2>No crew registered yet</h2>
      <p>Crew health data comes only from people registered here by the crew medical officer or the flight surgeon. Each registration pairs a signed sensor and is written to the ledger.</p>
      ${can ? '<button class="btn primary" type="button" id="empty-reg">Register the first astronaut</button>' : '<p class="muted">Ask the crew medical officer to register the crew.</p>'}`;
    const b = $('#empty-reg'); if (b) b.onclick = () => this.registerDialog();
  },

  renderAll() {
    if (!this.ready()) {
      if (app.accounts.current) { this.renderAccount(); this.renderNav(); this.renderMission(); this.renderCrew(); this.renderEmpty(); this.renderAlerts(); this.renderSecurity(); this.renderCrewPage(); this.renderOverview(); }
      else this.renderGate();
      return;
    }
    this.renderAccount(); this.renderNav();
    this.renderMission(); this.renderBanner(); this.renderCrew(); this.renderPerson(); this.renderCards();
    this.renderTabs(); this.renderChart(); this.renderAlerts(); this.renderTasks(); this.renderDose();
    this.renderRecords(); this.renderSecurity(); this.renderOverview(); this.renderCrewPage();
  },

  sections: [
    { id: 'overview', label: 'Overview', icon: 'overview', desc: 'The crew at a glance: status, early warning score and what needs attention.' },
    { id: 'vitals', label: 'Vital signs', icon: 'vitals', desc: 'Live signed readings with color-coded status and trends.', need: 'vitals' },
    { id: 'routine', label: 'Daily routine', icon: 'routine', desc: 'Health tasks for today, points, streaks and badges.', need: 'viewTasks' },
    { id: 'record', label: 'Medical record', icon: 'record', desc: 'Encrypted check-ins and clinical notes.', need: 'notes' },
    { id: 'radiation', label: 'Radiation', icon: 'radiation', desc: 'Dose budget against NASA limits and space weather from NASA DONKI.', need: 'vitals' },
    { id: 'alerts', label: 'Alerts', icon: 'alerts', desc: 'What needs attention, and what to do first.' },
    { id: 'crew', label: 'Crew and accounts', icon: 'crew', desc: 'Who is registered, by whom, with which sensor.' },
    { id: 'security', label: 'Security', icon: 'security', desc: 'Ledger, sensors, Earth sync and report checks.' },
    { id: 'lab', label: 'Simulation lab', icon: 'lab', desc: 'Trigger mission events and attacks to test the system.', sep: true, needCrew: true }
  ],
  page: 'overview',
  navAllowed(n) {
    if (n.needCrew && !this.sel) return false;
    if (!n.need) return true;
    return !!this.sel && app.auth.can(n.need, this.sel);
  },
  renderNav() {
    const open = app.alerts.list.filter(a => !a.acked && this.alertVisible(a)).length;
    $('#nav').innerHTML = this.sections.filter(n => this.navAllowed(n)).map(n =>
      `${n.sep ? '<div class="sep"></div>' : ''}<a href="#${n.id}" class="${this.page === n.id ? 'on' : ''}" data-route="${n.id}">${app.icon(n.icon, 19)}<span>${esc(n.label)}</span>${n.id === 'alerts' && open ? `<span class="count">${open}</span>` : ''}</a>`).join('');
    const cur = this.sections.find(n => n.id === this.page) || this.sections[0];
    $('#page-icon').innerHTML = app.icon(cur.icon, 22);
    $('#page-title').textContent = cur.label;
    $('#page-desc').textContent = cur.desc;
  },
  route(id, push) {
    let n = this.sections.find(x => x.id === id);
    if (!n || !this.navAllowed(n)) n = this.sections[0];
    this.page = n.id;
    if (push !== false && location.hash !== '#' + n.id) history.replaceState(null, '', '#' + n.id);
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.dataset.page === n.id));
    $('#person').classList.toggle('slim', ['overview', 'alerts', 'crew', 'security'].includes(n.id));
    this.renderNav();
    if (n.id === 'vitals' && this.chart) { this.chart.resize(); this.renderChart(); }
    if (n.id === 'overview') this.renderOverview();
    window.scrollTo(0, 0);
  },

  renderOverview() {
    if (!app.accounts.current) return;
    const r = app.auth.role;
    const crewRows = app.crew.map(c => {
      const hidden = r === 'admin' || (r === 'astronaut' && c.id !== app.auth.self);
      const lvl = this.overall(c.id), canV = app.auth.can('vitals', c.id);
      const label = hidden ? (r === 'admin' ? 'No medical access' : 'Private') : r === 'ops' ? fitLabel[lvl] : app.levels[lvl].label;
      const n = canV ? this.news(c.id) : null;
      return `<li>${app.avatar(c.name, hidden ? 'gray' : lvl)}
        <div class="nm"><b>${esc(c.name)}</b><span>${esc(c.role)}</span></div>
        <span class="lv ${hidden ? 'gray' : lvl} small"><b>${hidden ? '' : app.levels[lvl].icon + ' '}${esc(label)}</b></span>
        ${n ? `<span class="score lv ${n.level}">${n.total}<small>NEWS2</small></span>` : '<span class="score"></span>'}
        ${hidden ? '' : `<button class="icon-btn" data-go="${canV ? 'vitals' : 'overview'}" data-gocrew="${c.id}" type="button" aria-label="Open ${esc(c.name)}">${app.icon('arrow', 18)}</button>`}</li>`;
    }).join('') || `<li class="empty">No crew registered yet.</li>`;

    let strip = '';
    if (this.sel && app.auth.can('vitals', this.sel)) {
      strip = `<section class="panel"><div class="panel-head"><h2>${esc(this.crew(this.sel).name)} now</h2><a href="#vitals" class="small">All vital signs</a></div><div class="strip">` +
        app.indicators.map(i => {
          const v = this.latest(this.sel, i.key), bad = this.untrusted(this.sel, i.key), lvl = bad ? 'gray' : app.classify(i.key, v);
          return `<button class="mini ${lvl}" data-go="vitals" data-gokey="${i.key}" type="button">${app.icon(i.key, 18)}<b>${v ?? '—'}</b><small>${esc(i.short)} · ${esc(i.unit)}</small></button>`;
        }).join('') + '</div></section>';
    }

    const open = app.alerts.list.filter(a => !a.acked && this.alertVisible(a)).length;
    const facts = [];
    facts.push(['alerts', 'alerts', 'Open alerts', open ? 'Review and acknowledge' : 'Nothing needs attention', open]);
    if (this.sel && app.auth.can('viewTasks', this.sel)) { const s = app.game.summary(this.sel); facts.push(['routine', 'routine', 'Daily routine', `${s.streak}-day streak, level ${s.level}`, `${s.doneToday}/${app.tasks.length}`]); }
    if (this.sel && app.auth.can('vitals', this.sel)) { const pct = Math.round(app.store.careerDose(this.sel) / app.nasa.careerLimit * 100); facts.push(['radiation', 'radiation', 'Career radiation dose', `of the ${app.nasa.careerLimit} mSv NASA limit`, pct + '%']); }
    facts.push(['security', 'security', 'Ledger', app.ledger.status.ok ? 'Every record intact' : 'A record was changed', app.ledger.status.ok ? '✓' : '✗']);
    facts.push(['security', 'link', 'Earth link', app.link.up ? `${app.mode.delayText()} one-way delay` : 'No contact: crew is on its own', app.link.up ? 'Up' : 'Down']);
    const factHtml = facts.map(([go, ic, t, s, v]) => `<a class="fact" href="#${go}">${app.icon(ic, 22)}<span class="t"><b>${esc(t)}</b><span>${esc(s)}</span></span><span class="v">${v}</span></a>`).join('');

    $('#ov').innerHTML = `<div class="ov-grid">
      <section class="panel"><div class="panel-head"><h2>Crew</h2><span class="small muted">${app.crew.length} registered</span></div><ul class="ov-crew">${crewRows}</ul></section>
      <section class="panel"><h2>Status</h2><div class="facts">${factHtml}</div></section>
    </div>${strip}`;
  },

  renderCrewPage() {
    if (!app.accounts.current) return;
    const r = app.auth.role;
    const cards = app.crew.map(c => {
      const hidden = r === 'admin' || (r === 'astronaut' && c.id !== app.auth.self);
      const lvl = hidden ? 'gray' : this.overall(c.id);
      const dev = 'band-' + c.id, trusted = app.hub.trusted[dev];
      const acts = [];
      if (!hidden && app.auth.can('vitals', c.id)) acts.push(`<button class="btn" data-go="vitals" data-gocrew="${c.id}" type="button">Open</button>`);
      if (app.auth.can('editProfile', c.id)) acts.push(`<button class="btn ghost" data-editcrew="${c.id}" type="button">Edit profile</button>`);
      return `<article class="crew-card"><div class="top">${app.avatar(c.name, lvl, 'lg')}<div><b>${esc(c.name)}</b><span>${esc(c.role)}</span></div></div>
        <dl><dt>Registered by</dt><dd>${esc(c.registeredBy || '—')}</dd>
        <dt>Sensor</dt><dd class="mono">${esc(dev)} ${trusted ? '<span class="lv green">· paired</span>' : ''}</dd>
        <dt>Account</dt><dd>${app.accounts.list.some(a => a.crewId === c.id) ? 'Yes, PIN protected' : 'None'}</dd></dl>
        ${acts.length ? `<div class="btn-row">${acts.join('')}</div>` : ''}</article>`;
    }).join('');
    const add = app.auth.can('registerCrew')
      ? `<article class="crew-card add">${app.icon('plus', 26)}<b>Register an astronaut</b><p class="small muted">Pre-flight baseline, signed sensor and a PIN-protected account. Logged.</p><button class="btn primary" type="button" data-register>Register</button></article>` : '';
    const acc = `<article class="crew-card add">${app.icon('user', 26)}<b>Accounts</b><p class="small muted">${app.accounts.list.length} accounts on this device. Change your PIN${app.auth.can('manageAccounts') ? ' or add ground staff' : ''}.</p><button class="btn" type="button" data-accounts>Manage</button></article>`;
    $('#crew-cards').innerHTML = cards + add + acc;
  },

  gateHero() {
    return `<div class="gate-hero">${app.logo(56)}
      <h1>Pulse &amp; Proof</h1>
      <p>Crew health monitoring that keeps working, and keeps its word, when Earth is minutes away.</p>
      <ul>
        <li>${app.icon('vitals', 18)}<span>Color-coded vital signs with clinical early warning (NEWS2)</span></li>
        <li>${app.icon('security', 18)}<span>Every reading signed; every record tamper-evident</span></li>
        <li>${app.icon('record', 18)}<span>Medical data encrypted; each role sees only what it needs</span></li>
      </ul>
      ${app.illustration()}
    </div>`;
  },

  onTick() {
    if (!app.accounts.current) return;
    if (this.page === 'overview') this.renderOverview();
    if (!this.sel) return;
    this.renderBanner(); this.renderCrew(); this.renderPerson(); this.renderCards(); this.renderChart(); this.renderDose(); this.renderSecurity();
  },

  renderGate() {
    const A = app.accounts, g = $('#gate');
    if (!A.list.length) {
      g.innerHTML = this.gateHero() + `<div class="gate-main"><div class="gate-card">
        <h2>Set up this habitat</h2>
        <p>Pulse &amp; Proof holds no crew data until an authorized medical officer sets it up. Everything stored on this device is encrypted with a key that only a correct PIN can unlock.</p>
        <form id="setup-form" class="gate-form">
          <label class="field"><span>Your name (crew medical officer)</span><input name="name" required autocomplete="name"></label>
          <label class="field"><span>Choose a PIN (at least ${A.minPin} digits)</span><input name="pin" type="password" inputmode="numeric" autocomplete="new-password" required></label>
          <label class="field"><span>Repeat the PIN</span><input name="pin2" type="password" inputmode="numeric" autocomplete="new-password" required></label>
          <p class="form-err" id="setup-err"></p>
          <button class="btn primary" type="submit">Create medical officer account</button>
        </form>
        <div class="gate-alt"><h3>Just looking?</h3>
          <p>Load a fictional demo crew with simulated data and ready-made accounts. All demo accounts use PIN <b class="mono">${A.demoPin}</b>.</p>
          <button class="btn" type="button" id="demo-btn">Load demo crew (simulated)</button></div>
      </div></div>`;
      $('#setup-form').onsubmit = async ev => {
        ev.preventDefault();
        const f = ev.target.elements, err = $('#setup-err');
        if (!f.name.value.trim()) { err.textContent = 'Enter your name.'; return; }
        if (!A.validPin(f.pin.value)) { err.textContent = `The PIN needs at least ${A.minPin} digits.`; return; }
        if (f.pin.value !== f.pin2.value) { err.textContent = 'The two PINs do not match.'; return; }
        err.textContent = 'Creating encrypted storage…';
        await A.newHabitat();
        const acc = await A.create({ name: f.name.value.trim(), role: 'cmo', pin: f.pin.value }, 'Habitat setup');
        await A.save();
        await A.signIn(acc.id, f.pin.value);
      };
      $('#demo-btn').onclick = async () => { $('#demo-btn').disabled = true; $('#demo-btn').textContent = 'Loading demo crew…'; await app.loadDemo(); this.renderGate(); };
      return;
    }
    const groups = Object.keys(app.auth.roles).map(r => {
      const accs = A.list.filter(x => x.role === r);
      return accs.length ? `<optgroup label="${esc(app.auth.roles[r].label)}">${accs.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</optgroup>` : '';
    }).join('');
    g.innerHTML = this.gateHero() + `<div class="gate-main"><div class="gate-card">
      <h2>Sign in</h2>
      <p>Your PIN unlocks the habitat's encrypted data on this device. Every sign-in and every failed attempt is written to the ledger.</p>
      ${A.demo ? `<p class="demo-note">Demo crew loaded: all names and data are fictional and simulated. Every demo account uses PIN <b class="mono">${A.demoPin}</b>.</p>` : ''}
      <form id="signin-form" class="gate-form">
        <label class="field"><span>Account</span><select name="acc">${groups}</select></label>
        <label class="field"><span>PIN</span><input name="pin" type="password" inputmode="numeric" autocomplete="current-password" required></label>
        <p class="form-err" id="signin-err"></p>
        <button class="btn primary" type="submit">Sign in</button>
      </form>
      <p class="small muted gate-reset"><button class="link" type="button" id="reset-btn">Erase all data on this device</button></p>
    </div></div>`;
    $('#signin-form').onsubmit = async ev => {
      ev.preventDefault();
      const f = ev.target.elements, err = $('#signin-err');
      err.textContent = 'Checking PIN…';
      const r = await A.signIn(f.acc.value, f.pin.value);
      err.textContent = r.ok ? '' : r.why;
    };
    $('#reset-btn').onclick = () => { if (confirm('Erase all accounts, crew profiles and records stored on this device? This cannot be undone.')) A.reset(); };
  },

  baseFields(b = {}) {
    const row = (k, step) => { const ind = app.indicator(k), [lo, hi] = app.baseLimits[k];
      return `<label class="field"><span>${esc(ind.name)}, ${esc(ind.unit)}</span><input name="${k}" type="number" step="${step}" min="${lo}" max="${hi}" value="${b[k] ?? ''}" required></label>`; };
    return `<div class="grid2">${row('hr', 1)}${row('spo2', 1)}${row('sbp', 1)}${row('temp', 0.1)}${row('resp', 1)}</div>`;
  },
  readBase(f) { const o = {}; ['hr', 'spo2', 'sbp', 'temp', 'resp'].forEach(k => { o[k] = Number(f[k].value); }); return o; },

  registerDialog() {
    if (!app.auth.can('registerCrew')) return app.auth.deny('registerCrew');
    this.dialog(`<h3>Register an astronaut</h3>
      <p class="small muted">Enter resting values from the pre-flight medical exam. They become this person's baseline. A signed sensor is paired and an astronaut account is created. Everything is logged.</p>
      <div class="grid2"><label class="field"><span>Full name</span><input name="name" required></label>
      <label class="field"><span>Crew role</span><input name="role" placeholder="e.g. Flight engineer"></label></div>
      <h4>Pre-flight baseline</h4>${this.baseFields()}
      <div class="grid2"><label class="field"><span>Career radiation dose before this mission (mSv)</span><input name="career" type="number" step="0.1" min="0" max="599" value="0" required></label>
      <label class="field"><span>First PIN for the astronaut (at least ${app.accounts.minPin} digits)</span><input name="pin" type="password" inputmode="numeric" required></label></div>
      <p class="form-err"></p>`,
    { ok: 'Register and pair sensor', onOk: async f => {
      const r = await app.crewAdmin.register({ name: f.name.value, role: f.role.value, base: this.readBase(f), careerBefore: Number(f.career.value), pin: f.pin.value });
      if (typeof r === 'string') return r;
      if (!r) return 'Not allowed.';
      this.sel = r.id; this.renderAll();
      this.toast(`${r.name} registered. Sensor paired; astronaut account created.`, 'green');
    } });
  },

  editDialog() {
    const c = this.crew(this.sel);
    if (!app.auth.can('editProfile', c.id)) return app.auth.deny('editProfile', c.id);
    this.dialog(`<h3>Edit profile: ${esc(c.name)}</h3>
      <p class="small muted">Registered by ${esc(c.registeredBy || 'unknown')}. Changes to the baseline are logged with the old and new values.</p>
      <h4>Pre-flight baseline</h4>${this.baseFields(c.base)}
      <label class="field"><span>Career radiation dose before this mission (mSv)</span><input name="career" type="number" step="0.1" min="0" max="599" value="${c.careerBefore}" required></label>
      <p class="form-err"></p>`,
    { ok: 'Save profile', onOk: async f => {
      const r = await app.crewAdmin.editBase(c.id, this.readBase(f), Number(f.career.value));
      if (typeof r === 'string') return r;
      this.renderAll(); this.toast('Profile updated and logged.', 'green');
    } });
  },

  measureDialog() {
    const c = this.crew(this.sel);
    if (!app.auth.can('manualReading', c.id)) return app.auth.deny('manualReading', c.id);
    const row = (k, step) => { const ind = app.indicator(k); return `<label class="field"><span>${esc(ind.name)}, ${esc(ind.unit)}</span><input name="${k}" type="number" step="${step}"></label>`; };
    this.dialog(`<h3>Add a measurement for ${esc(c.name)}</h3>
      <p class="small muted">Use this for a handheld device, such as the arm cuff or the oral thermometer. Fill in only what you measured. The entry is signed with your name in the ledger.</p>
      <div class="grid2">${row('hr', 1)}${row('spo2', 1)}${row('sbp', 1)}${row('temp', 0.1)}${row('resp', 1)}</div>
      <p class="form-err"></p>`,
    { ok: 'Save measurement', onOk: async f => {
      const vals = {}; ['hr', 'spo2', 'sbp', 'temp', 'resp'].forEach(k => { if (f[k].value !== '') vals[k] = Number(f[k].value); });
      const r = await app.hub.manual(c.id, vals);
      if (typeof r === 'string') return r;
      this.toast('Measurement saved and logged.', 'green');
    } });
  },

  accountsDialog() {
    const A = app.accounts, can = app.auth.can('manageAccounts');
    const rows = A.list.map(x => `<tr><td>${esc(x.name)}</td><td>${esc(app.auth.roles[x.role].label)}</td><td class="small muted">${esc(x.createdBy || '')}</td></tr>`).join('');
    this.dialog(`<h3>Accounts</h3>
      <table class="tbl"><thead><tr><th>Name</th><th>Role</th><th>Created by</th></tr></thead><tbody>${rows}</tbody></table>
      <h4>Change my PIN</h4>
      <div class="grid2"><label class="field"><span>Current PIN</span><input name="old" type="password" inputmode="numeric"></label>
      <label class="field"><span>New PIN</span><input name="new" type="password" inputmode="numeric"></label></div>
      ${can ? `<h4>Add an account</h4><p class="small muted">Astronaut accounts are created when a crew member is registered.</p>
      <div class="grid2"><label class="field"><span>Name</span><input name="name"></label>
      <label class="field"><span>Role</span><select name="role"><option value="surgeon">Flight surgeon (Earth)</option><option value="ops">Mission operations (Earth)</option><option value="cmo">Crew medical officer</option><option value="admin">System admin</option></select></label>
      <label class="field"><span>First PIN</span><input name="pin" type="password" inputmode="numeric"></label></div>` : ''}
      <p class="form-err"></p>`,
    { ok: 'Save', onOk: async f => {
      let did = false;
      if (f.old.value || f.new.value) { const e = await A.changePin(f.old.value, f.new.value); if (e) return e; did = true; this.toast('PIN changed.', 'green'); }
      if (can && f.name.value.trim()) {
        if (!A.validPin(f.pin.value)) return `The first PIN needs at least ${A.minPin} digits.`;
        await A.create({ name: f.name.value.trim(), role: f.role.value, pin: f.pin.value }, app.auth.actor());
        await A.save(); did = true; this.toast('Account created and logged.', 'green');
      }
      if (!did) return 'Nothing to save.';
    } });
  },

  select(id) { this.sel = id; this.renderAll(); this.route(this.page, false); },

  help() {
    this.dialog(`<h3>How to use Pulse &amp; Proof</h3>
      <h4>See your status</h4><p>Each card shows one health indicator. Color and shape tell you the status at a glance: <span class="lv green">● Normal</span>, <span class="lv amber">▲ Watch</span>, <span class="lv red">■ Act now</span>.</p>
      <h4>Learn what it means</h4><p>Tap <b>?</b> on a card for a plain explanation, how to measure it, why it matters in space and what to do.</p>
      <h4>Keep your routine</h4><p>Complete today's health tasks to earn points, keep your streak and unlock badges.</p>
      <h4>Trust the data</h4><p>Every reading is signed by its sensor and chained into a tamper-evident ledger. Private notes are encrypted. Each role sees only what it needs: sign in with a different account to compare.</p>
      <h4>NEWS2 score</h4><p>The number next to the person's name is the NEWS2 early warning score built from five vital signs. Tap it to see how it was counted.</p>
      <h4>Simulation lab</h4><p>Mission events change the simulated sensor signals (fever, cabin air problem, solar particle event). Attacks play the threats from our threat model against the selected crew member. The lab log shows how many seconds the system needed to catch each one.</p>
      <h4>Where the data comes from</h4><p>No crew is built in. The crew medical officer or flight surgeon registers each astronaut with pre-flight values and pairs a signed sensor. In this prototype the sensors are simulated; authorized users can also enter measurements by hand.</p>
      <p class="small muted" style="margin-top:12px">Simulated sensor data. Not a medical device.</p>`);
  },

  bind() {
    document.addEventListener('click', ev => {
      if (ev.target.closest('[data-news]')) return this.explainNews();
      if (ev.target.closest('#check-report-btn')) return this.checkReport();
      if (ev.target.closest('#lablog-clear')) return app.lab.clear();
      const t = ev.target.closest('[data-restore],[data-crew],[data-explain],[data-key],[data-tab],[data-task],[data-ack],[data-event],[data-alert],[data-rt],#verify-btn');
      if (!t) return;
      if (t.dataset.restore) { ev.stopPropagation(); return app.ledger.restore(Number(t.dataset.restore)); }
      if (t.id === 'verify-btn') return app.ledger.verify(true);
      if (t.dataset.rt) {
        const name = t.dataset.rt, c = app.redTeam.target();
        const release = name === 'freeze' && c && app.devices.override[c.id];
        const e = name === 'link' || release ? null : app.lab.attack(name, t);
        return Promise.resolve(app.redTeam.run(name)).then(v => {
          if (v === 'skip') return app.lab.drop(e);
          if (name === 'link') app.lab.attack(name, t);
          if (release) app.lab.add({ name: 'Sensor released', who: c.name, status: 'info', text: 'The heart-rate sensor reports real values again.' });
          if (name === 'reportTamper') app.lab.verdict(e, v);
        });
      }
      if (t.dataset.explain) { ev.stopPropagation(); return this.explain(t.dataset.explain); }
      if (t.dataset.crew) return this.select(t.dataset.crew);
      if (t.dataset.key || t.dataset.tab) { this.trendKey = t.dataset.key || t.dataset.tab; this.renderTabs(); this.renderCards(); return this.renderChart(); }
      if (t.dataset.task) return app.game.open(this.sel, t.dataset.task);
      if (t.dataset.ack) return this.acknowledge(t.dataset.ack);
      if (t.dataset.event) { const ev = t.dataset.event; this.mission(ev); return app.lab.event(ev, t); }
      if (t.dataset.alert) {
        const a = app.alerts.list.find(x => x.id === t.dataset.alert);
        if (a && a.kind === 'health' && app.auth.can('vitals', a.crewId)) { this.sel = a.crewId; this.trendKey = a.key; this.renderAll(); }
      }
    });
    document.addEventListener('keydown', ev => {
      if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.classList.contains('card')) { ev.preventDefault(); ev.target.click(); }
    });
    $('#help-btn').onclick = () => this.help();
    $('#help-btn').innerHTML = app.icon('help', 18);
    $('#reg-btn').innerHTML = app.icon('plus', 16);
    $('#brand-logo').innerHTML = app.logo(40);
    window.addEventListener('hashchange', () => this.route(location.hash.slice(1), false));
    document.addEventListener('click', ev => {
      const go = ev.target.closest('[data-go]');
      if (go) {
        if (go.dataset.gocrew) this.sel = go.dataset.gocrew;
        if (go.dataset.gokey) this.trendKey = go.dataset.gokey;
        this.renderAll(); this.route(go.dataset.go); return;
      }
      if (ev.target.closest('[data-register]')) return this.registerDialog();
      if (ev.target.closest('[data-accounts]')) return this.accountsDialog();
      const ed = ev.target.closest('[data-editcrew]');
      if (ed) { this.sel = ed.dataset.editcrew; this.renderAll(); return this.editDialog(); }
    });
    $('#ledger-btn').onclick = () => this.showLedger();
    $('#note-btn').onclick = () => this.addNote();
    $('#raw-btn').onclick = () => { this.showRaw = !this.showRaw; $('#raw-btn').textContent = this.showRaw ? 'Show decrypted' : 'Show what is stored'; this.renderRecords(); };
    $('#report-btn').onclick = () => this.showReport();
    $('#mode').onchange = ev => { app.mode.set(ev.target.value); this.renderAll(); this.toast(`Mission profile: ${app.mode.get().label}. One-way delay ${app.mode.delayText()}${app.mode.demoText()}.`); };
    $('#signout-btn').onclick = () => app.accounts.signOut();
    $('#accounts-btn').onclick = () => this.accountsDialog();
    $('#reg-btn').onclick = () => this.registerDialog();
    $('#edit-btn').onclick = () => this.editDialog();
    $('#measure-btn').onclick = () => this.measureDialog();
  },

  acknowledge(id) {
    const a = app.alerts.list.find(x => x.id === id);
    if (!a || a.acked) return;
    if (a.crewId && !app.auth.can('ack', a.crewId)) return app.auth.deny('ack', a.crewId);
    a.acked = true;
    a.ackedBy = app.auth.actor();
    app.emit('ack', a);
    this.renderAlerts(); this.renderNav();
  },

  mission(ev) {
    const c = this.crew(this.sel);
    if (!c && ev !== 'conjunction') return;
    if (ev === 'fever') { app.sim.personal[c.id].feverTarget = 1; this.toast(`Simulating a fever for ${c.name}…`); }
    if (ev === 'lowO2') { app.sim.targets.lowO2 = 1; this.toast('Simulating a cabin air problem for the whole crew…'); }
    if (ev === 'spe') { app.sim.targets.spe = 1; this.toast('Simulating a solar particle event…'); }
    if (ev === 'clear') {
      app.sim.targets.lowO2 = 0; app.sim.targets.spe = 0;
      Object.values(app.sim.personal).forEach(p => { p.feverTarget = 0; });
      this.toast('Clearing all simulated events.');
    }
    if (ev === 'day') { app.game.nextDay(); this.renderMission(); this.toast(`Mission day ${app.mission.day}. New tasks are ready.`); }
    if (ev === 'conjunction') {
      const on = app.link.reason !== 'conjunction';
      app.link.setUp(!on, 'conjunction');
      this.toast(on ? 'Solar conjunction: Earth and Mars are on opposite sides of the Sun. No commands for about two weeks; the crew relies on onboard monitoring.' : 'Conjunction over. Queued data and messages are being exchanged.', on ? 'amber' : 'green');
      this.renderAll();
    }
  }
};

app.start = async () => {
  app.sim.init(); app.store.init(); app.game.init();
  await app.security.init();
  await app.report.init();
  app.link.oneWayMs = Math.round(app.mode.get().oneWaySec * 1000);
  app.accounts.load();
  app.setRadBands();
  app.lab.render();

  app.on('alert', a => {
    app.lab.onAlert(a);
    app.ui.renderAlerts();
    if (app.accounts.current) app.ui.renderNav();
    if (!app.started || !app.accounts.current || !app.ui.alertVisible(a)) return;
    if (a.kind === 'health') {
      const c = app.ui.crew(a.crewId), ind = app.indicator(a.key);
      app.ui.toast(app.auth.role === 'ops' ? `${c.name}: ${fitLabel[a.level]}` : `${c.name}: ${ind.name} ${a.value} ${ind.unit} · ${app.levels[a.level].label}`, a.level);
    } else {
      const tmp = document.createElement('div'); tmp.innerHTML = a.html || '';
      app.ui.toast(tmp.textContent.slice(0, 170), a.kind);
    }
  });
  let saveTimer = null;
  const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => app.accounts.save(), 400); };
  app.on('tick', () => app.ui.onTick());
  app.on('task', () => { if (app.accounts.current) { app.ui.renderTasks(); app.ui.renderMission(); } save(); });
  app.on('vault', () => { if (app.accounts.current && app.ui.sel) app.ui.renderRecords(); save(); });
  app.on('crew', () => { if (app.accounts.current) app.ui.renderAll(); });
  app.on('signin', () => {
    if (app.ui.chart) { app.ui.chart.destroy(); app.ui.chart = null; }
    app.ui.sel = null; app.ui.renderAll();
    app.ui.route(location.hash.slice(1) || 'overview', false);
    app.ui.toast(`Signed in as ${app.auth.actor()}.`, 'green');
  });
  app.on('signout', () => { if (app.ui.chart) { app.ui.chart.destroy(); app.ui.chart = null; } app.ui.renderAll(); });
  app.on('verified', () => { if (app.accounts.current) app.ui.renderSecurity(); });
  app.on('ground', () => { if (app.accounts.current) { app.ui.renderSecurity(); app.ui.renderBanner(); } });
  app.on('link', () => { if (app.accounts.current) app.ui.renderSecurity(); });
  app.on('redteam', () => { app.ui.renderSecurity(); app.ui.renderChart(); });
  app.on('thresholds', () => { app.ui.renderCards(); app.ui.renderChart(); });
  app.on('spaceweather', sw => sw.render($('#sw')));
  app.on('mode', () => { app.ui.renderMission(); app.ui.renderBanner(); app.ui.renderSecurity(); });

  $('#career-limit').textContent = app.nasa.careerLimit;
  $('#std-link').href = app.nasa.stdUrl;
  app.ui.bind();
  app.ui.renderAll();
  app.weather.render($('#sw'));
  app.weather.load();
  app.started = true;
  app.timer = setInterval(app.tick, app.tickMs);
};

document.addEventListener('DOMContentLoaded', app.start);

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  const had = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !reloaded) { reloaded = true; location.reload(); } });
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').then(r => r.update()).catch(() => {}));
}
window.addEventListener('offline', () => app.ui && app.ui.toast('No network connection. Monitoring, alerts and security checks keep running on this device.', 'amber'));
window.addEventListener('online', () => app.ui && app.ui.toast('Network connection restored.', 'green'));
