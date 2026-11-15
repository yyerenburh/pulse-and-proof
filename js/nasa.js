window.app = window.app || {};

app.weather = {
  source: 'loading',
  events: [],
  flares: null,
  endpoint: null,

  async get(type, start, end) {
    for (const base of app.nasa.donkiBases) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 7000);
        const key = base.includes('api.nasa.gov') ? '&api_key=DEMO_KEY' : '';
        const res = await fetch(`${base}${type}?startDate=${start}&endDate=${end}${key}`, { signal: ctrl.signal });
        clearTimeout(timer);
        if (!res.ok) continue;
        const data = await res.json();
        if (!Array.isArray(data)) continue;
        this.endpoint = base;
        return data;
      } catch (e) {  }
    }
    return null;
  },

  async load() {
    const d = x => x.toISOString().slice(0, 10);
    const end = new Date(), start = new Date(end.getTime() - 30 * 864e5);
    const sep = await this.get('SEP', d(start), d(end));
    if (sep) {
      this.events = sep.map(e => ({ sepID: e.sepID, eventTime: e.eventTime, instrument: (e.instruments || []).map(i => i.displayName).join(', '), link: e.link })).reverse();
      this.source = 'live';
      const flr = await this.get('FLR', d(start), d(end));
      if (flr) {
        const rank = c => ({ X: 4, M: 3, C: 2, B: 1, A: 0 }[(c || 'A')[0]] * 100 + parseFloat((c || 'A0').slice(1) || 0));
        const big = flr.slice().sort((a, b) => rank(b.classType) - rank(a.classType))[0];
        this.flares = { count: flr.length, strongest: big ? big.classType : null, when: big ? big.peakTime : null };
      }
    } else {
      this.events = app.nasa.cachedSep;
      this.source = 'cached';
    }
    app.emit('spaceweather', this);
  },

  render(el) {
    const fmt = t => new Date(t).toUTCString().replace(':00 GMT', ' UTC');
    if (this.source === 'loading') { el.innerHTML = '<p class="small muted">Loading NASA DONKI…</p>'; return; }
    let head;
    if (this.source === 'live') {
      head = `<p class="small">${this.events.length
        ? `<b class="lv amber">${this.events.length}</b> solar energetic particle event${this.events.length > 1 ? 's' : ''} in the last 30 days`
        : '<b class="lv green">No</b> solar energetic particle events in the last 30 days'}. <span class="muted">Live from NASA DONKI.</span></p>`;
      if (this.flares) head += `<p class="small">${Number(this.flares.count) || 0} solar flares in the last 30 days${this.flares.strongest ? `, strongest <b>${app.escape(this.flares.strongest)}</b> on ${app.escape(fmt(this.flares.when))}` : ''}.</p>`;
    } else {
      head = '<p class="small muted">NASA DONKI is unreachable right now (offline or blocked). Showing the latest real records saved with the app.</p>';
    }
    const safe = u => (/^https:\/\/[a-z0-9.-]*nasa\.gov\//i.test(u || '') ? app.escape(u) : '');
    const items = this.events.slice(0, 4).map(e => `<div class="sw-item"><div><b>${app.escape(fmt(e.eventTime))}</b></div>
      <div class="muted small">${app.escape(e.instrument || 'SEP event')}${safe(e.link) ? ` · <a href="${safe(e.link)}" target="_blank" rel="noopener noreferrer">DONKI record</a>` : ''}</div></div>`).join('');
    el.innerHTML = head + items + `<p class="small muted" style="margin-top:8px">Source: NASA CCMC DONKI. NASA-STD-3001 limits one solar particle event to ${app.nasa.speLimit} mSv, so crews shelter when dosimeters spike.</p>`;
  }
};
