window.app = window.app || {};

app.game = {
  state: {},

  init() { this.state = {}; },
  addCrew(c, seed) {
    const [points, streak] = seed || [0, 0];
    this.state[c.id] = { points, streak, doneToday: {}, doneCount: 0, badges: new Set() };
    this.checkBadges(c.id, true);
  },

  level(points) { return Math.floor(points / 100) + 1; },

  summary(crewId) {
    const s = this.state[crewId];
    return { points: s.points, streak: s.streak, level: this.level(s.points), doneToday: Object.keys(s.doneToday).length, doneCount: s.doneCount };
  },

  checkBadges(crewId, silent) {
    const s = this.state[crewId], sum = this.summary(crewId);
    app.badges.forEach(b => {
      if (!s.badges.has(b.id) && b.test(sum)) {
        s.badges.add(b.id);
        if (!silent) app.ui.toast(`Badge earned: ${b.name}`, 'green');
      }
    });
  },

  complete(crewId, taskId, data) {
    const s = this.state[crewId];
    if (s.doneToday[taskId]) return false;
    const task = app.tasks.find(t => t.id === taskId);
    const before = this.level(s.points);
    s.doneToday[taskId] = { ts: Date.now(), data: data || null };
    s.points += task.points;
    s.doneCount += 1;
    if (taskId === 'mood' && data) {
      app.vault.put(crewId, 'checkin', app.auth.actor(), data);
      s.doneToday[taskId].data = { stored: 'encrypted record' };
    }
    app.ui.toast(`+${task.points} points · ${task.name}`, 'green');
    if (this.level(s.points) > before) app.ui.toast(`Level up! You are now level ${this.level(s.points)}.`, 'green');
    this.checkBadges(crewId);
    app.emit('task', { crewId, taskId, data });
    return true;
  },

  nextDay() {
    app.crew.forEach(c => {
      const s = this.state[c.id];
      const all = Object.keys(s.doneToday).length === app.tasks.length;
      s.streak = all ? s.streak + 1 : 0;
      s.doneToday = {};
      this.checkBadges(c.id);
    });
    app.mission.day += 1;
    app.emit('task', {});
  },

  open(crewId, taskId) {
    if (!app.auth.can('doTasks', crewId)) return app.auth.deny('doTasks', crewId);
    const task = app.tasks.find(t => t.id === taskId);
    const s = this.state[crewId];
    if (s.doneToday[taskId]) { app.ui.toast('Already done today. Nice work!', 'green'); return; }
    let body = `<h3>${task.name}</h3><p class="muted">${task.steps}</p>`;
    let onOk;

    if (task.kind === 'measure') {
      const vals = task.keys.map(k => {
        const v = app.store.latest(crewId, k), ind = app.indicator(k), lvl = app.classify(k, v);
        return `<div class="${lvl}"><span class="muted">${ind.name}</span><b>${v ?? '—'} <small class="muted">${ind.unit}</small></b><span class="lv ${lvl}">${app.levels[lvl].icon} ${app.levels[lvl].label}</span></div>`;
      }).join('');
      body += `<div class="measure">${vals}</div>
        <p class="small muted" style="margin-top:10px">Not sure what a value means? Tap <b>?</b> on its card after saving.</p>`;
      onOk = () => {
        const data = {};
        task.keys.forEach(k => { data[k] = app.store.latest(crewId, k); });
        this.complete(crewId, taskId, data);
      };
    } else if (task.kind === 'checkin') {
      body += `
        <div class="field"><span>Hours of sleep last night</span>
          <select name="sleep"><option>4 or less</option><option>5</option><option>6</option><option selected>7</option><option>8</option><option>9 or more</option></select></div>
        <div class="field"><span>How do you feel?</span>
          <div class="seg">${['Low', 'Tired', 'OK', 'Good', 'Great'].map((m, i) => `<label><input type="radio" name="mood" value="${i + 1}" ${i === 2 ? 'checked' : ''}><span>${m}</span></label>`).join('')}</div></div>
        <div class="field"><span>Anything on your mind? (optional, private)</span>
          <textarea name="note" rows="3" placeholder="Only you and the medical team can read this."></textarea></div>`;
      onOk = form => {
        const data = { sleep: form.sleep.value, mood: Number(form.mood.value), note: form.note.value.trim() };
        this.complete(crewId, taskId, data);
        if (data.mood <= 2 || data.sleep === '4 or less' || data.sleep === '5') {
          app.ui.toast('Short sleep or a low mood is common on long missions. Consider a private talk with the crew medical officer.', 'amber');
        }
      };
    } else {
      onOk = () => this.complete(crewId, taskId, null);
    }

    app.ui.dialog(body, {
      ok: task.kind === 'measure' ? 'Save measurement' : task.kind === 'checkin' ? 'Submit check-in' : 'Mark as done',
      onOk
    });
  }
};
