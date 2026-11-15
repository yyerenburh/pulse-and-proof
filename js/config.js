window.app = window.app || {};

app.levels = {
  green: { label: 'Normal', icon: '●' },
  amber: { label: 'Watch', icon: '▲' },
  red: { label: 'Act now', icon: '■' },
  gray: { label: 'No data', icon: '○' }
};

app.indicators = [
  {
    key: 'hr', short: 'Heart rate', name: 'Heart rate', unit: 'bpm', decimals: 0, chartMin: 30, chartMax: 150,
    bands: [{ max: 41, level: 'red' }, { max: 51, level: 'amber' }, { max: 91, level: 'green' }, { max: 131, level: 'amber' }, { max: Infinity, level: 'red' }],
    news: [{ max: 41, score: 3 }, { max: 51, score: 1 }, { max: 91, score: 0 }, { max: 111, score: 1 }, { max: 131, score: 2 }, { max: Infinity, score: 3 }],
    what: 'How many times your heart beats per minute.',
    how: 'Measured continuously by the chest strap. For a resting value, sit still for 5 minutes first.',
    space: 'Without gravity, blood shifts toward the head and the heart works less. Over months it can lose fitness, so resting heart rate and its changes are early signs of cardiovascular deconditioning.',
    normal: '51 to 90 bpm at rest (NEWS2 score 0).',
    amber: 'Rest for 5 minutes, drink water, then measure again. Log any dizziness or palpitations.',
    red: 'Stop strenuous work. Sit or lie down and tell the crew medical officer now.'
  },
  {
    key: 'spo2', short: 'SpO₂', name: 'Blood oxygen (SpO₂)', unit: '%', decimals: 0, chartMin: 80, chartMax: 100,
    bands: [{ max: 92, level: 'red' }, { max: 96, level: 'amber' }, { max: Infinity, level: 'green' }],
    news: [{ max: 92, score: 3 }, { max: 94, score: 2 }, { max: 96, score: 1 }, { max: Infinity, score: 0 }],
    what: 'The share of your red blood cells carrying oxygen.',
    how: 'Measured by the finger or forehead sensor using light. Cold fingers and movement give false low values, so stay still.',
    space: 'A closed habitat depends on life support. A drop across several crew members at once can point to a cabin air problem rather than an illness.',
    normal: '96% or higher (NEWS2 score 0).',
    amber: 'Stay still, warm your hands, re-measure. Check whether other crew members also read low.',
    red: 'Move to a module with verified air, use oxygen if available, and alert the crew medical officer.'
  },
  {
    key: 'sbp', short: 'Blood pressure', name: 'Blood pressure (systolic)', unit: 'mmHg', decimals: 0, chartMin: 70, chartMax: 200,
    bands: [{ max: 91, level: 'red' }, { max: 111, level: 'amber' }, { max: 130, level: 'green' }, { max: 181, level: 'amber' }, { max: Infinity, level: 'red' }],
    news: [{ max: 91, score: 3 }, { max: 101, score: 2 }, { max: 111, score: 1 }, { max: 220, score: 0 }, { max: Infinity, score: 3 }],
    what: 'The top number of a blood pressure reading: the pressure when your heart beats.',
    how: 'Measured by the arm cuff. Sit, keep the arm at heart level and do not talk during the reading.',
    space: 'Fluid shifts and less physical load change blood pressure in space. After landing on the Moon or Mars, low pressure can cause fainting.',
    normal: '111 to 129 mmHg. Low values follow NEWS2; from 130 is high blood pressure (AHA stage 1), above 180 is a crisis.',
    amber: 'Re-measure after 5 minutes of rest. Note the time, what you were doing and any headache.',
    red: 'Stop work and contact the crew medical officer. Do not start an EVA.'
  },
  {
    key: 'temp', short: 'Temperature', name: 'Body temperature', unit: '°C', decimals: 1, chartMin: 34.5, chartMax: 40,
    bands: [{ max: 35.05, level: 'red' }, { max: 36.05, level: 'amber' }, { max: 38.05, level: 'green' }, { max: Infinity, level: 'amber' }],
    news: [{ max: 35.05, score: 3 }, { max: 36.05, score: 1 }, { max: 38.05, score: 0 }, { max: 39.05, score: 1 }, { max: Infinity, score: 2 }],
    what: 'Your core body temperature.',
    how: 'Measured by the skin patch and confirmed with the oral thermometer during the morning check.',
    space: 'On long missions resting core temperature rises by about 1 °C and levels off after about 75 days (ISS study, 2017), so your normal is higher than on Earth. The immune system also changes and dormant viruses can reactivate; a fever in a closed habitat can spread to the crew.',
    normal: '36.1 to 38.0 °C (NEWS2 score 0).',
    amber: 'Re-measure in 30 minutes, drink fluids and log symptoms. Above 39 °C: isolate if possible and contact the crew medical officer.',
    red: 'Body temperature is too low. Warm up now and contact the crew medical officer.'
  },
  {
    key: 'resp', short: 'Breathing', name: 'Breathing rate', unit: '/min', decimals: 0, chartMin: 5, chartMax: 32,
    bands: [{ max: 9, level: 'red' }, { max: 12, level: 'amber' }, { max: 21, level: 'green' }, { max: 25, level: 'amber' }, { max: Infinity, level: 'red' }],
    news: [{ max: 9, score: 3 }, { max: 12, score: 1 }, { max: 21, score: 0 }, { max: 25, score: 2 }, { max: Infinity, score: 3 }],
    what: 'How many breaths you take per minute.',
    how: 'Measured by the chest strap from chest movement.',
    space: 'Fast breathing at rest can be an early sign of high cabin CO₂, infection or stress, often before other values change.',
    normal: '12 to 20 breaths per minute at rest (NEWS2 score 0).',
    amber: 'Rest and re-check. Ask whether others feel headaches or stuffiness (possible high CO₂).',
    red: 'Check cabin CO₂ and contact the crew medical officer.'
  },
  {
    key: 'rad', short: 'Radiation', name: 'Radiation dose rate', unit: 'µSv/h', decimals: 0, chartMin: 0, chartMax: 400,
    bands: [{ max: 34, level: 'green' }, { max: 200, level: 'amber' }, { max: Infinity, level: 'red' }],
    what: 'How much ionizing radiation you are receiving right now, from your personal dosimeter.',
    how: 'Measured continuously by the dosimeter clipped to your suit. Wear it at all times.',
    space: 'Outside Earth’s magnetic field, galactic cosmic rays and solar particle events raise cancer and other risks. Measured backgrounds: 1.37 mSv a day on the lunar surface (Chang’e 4) and 0.67 mSv a day on the Mars surface (NASA Curiosity RAD). NASA-STD-3001 caps an astronaut’s career dose at 600 mSv.',
    normal: '',
    amber: 'More than twice the measured background. Avoid going outside and check space weather for a solar event.',
    red: 'More than ten times the background, as in a solar particle event. Go to the storm shelter now.'
  }
];

app.indicator = key => app.indicators.find(i => i.key === key);

app.classify = (key, v) => {
  if (v === null || v === undefined || Number.isNaN(v)) return 'gray';
  const ind = app.indicator(key);
  for (const b of ind.bands) if (v < b.max) return b.level;
  return 'red';
};

app.worst = levels => (levels.includes('red') ? 'red' : levels.includes('amber') ? 'amber' : levels.includes('green') ? 'green' : 'gray');

app.crew = [];
app.demoCrew = [
  { id: 'reyes', name: 'Astronaut 1', role: 'Commander', base: { hr: 62, spo2: 98, sbp: 119, temp: 36.6, resp: 14 }, careerBefore: 182 },
  { id: 'osei', name: 'Astronaut 2', role: 'Crew medical officer', base: { hr: 66, spo2: 98, sbp: 121, temp: 36.7, resp: 15 }, careerBefore: 95 },
  { id: 'novak', name: 'Astronaut 3', role: 'Flight engineer', base: { hr: 71, spo2: 98, sbp: 120, temp: 36.5, resp: 16 }, careerBefore: 240, drift: true },
  { id: 'tanaka', name: 'Astronaut 4', role: 'Mission specialist', base: { hr: 58, spo2: 98, sbp: 118, temp: 36.5, resp: 13 }, careerBefore: 61 }
];

app.mission = { name: 'Lunar surface base (simulated)', day: 142, location: 'Lunar south pole' };

app.inputLimits = { hr: [30, 220], spo2: [70, 100], sbp: [60, 250], temp: [33, 42], resp: [4, 45], rad: [0, 5000] };
app.baseLimits = { hr: [35, 110], spo2: [88, 100], sbp: [85, 170], temp: [35.5, 37.8], resp: [8, 24] };

app.tasks = [
  { id: 'vitals', name: 'Morning vitals check', points: 20, kind: 'measure', keys: ['hr', 'spo2', 'sbp'],
    steps: 'Sit still for 5 minutes. Put on the finger sensor and the arm cuff, then press Measure.' },
  { id: 'temp', name: 'Temperature check', points: 10, kind: 'measure', keys: ['temp'],
    steps: 'Hold the thermometer under your tongue for 1 minute, then press Measure.' },
  { id: 'exercise', name: 'Exercise session', points: 30, kind: 'confirm',
    steps: 'Complete about 2 hours of treadmill and resistance exercise. In low gravity weight-bearing bone can lose 1 to 1.5% of its density a month; daily loading slows that loss and protects muscles and heart.' },
  { id: 'water', name: 'Hydration log', points: 10, kind: 'confirm',
    steps: 'Drink your planned daily water ration and log it. Fluid shifts toward the head in low gravity make thirst a poor guide.' },
  { id: 'mood', name: 'Sleep and mood check-in', points: 15, kind: 'checkin',
    steps: 'How did you sleep and how do you feel? NASA schedules 8.5 hours of sleep, but crews have averaged about 6. Answers are private: only you and the medical team can read them.' },
  { id: 'dosimeter', name: 'Dosimeter check', points: 10, kind: 'measure', keys: ['rad'],
    steps: 'Make sure the dosimeter is clipped on and its light is green, then press Measure.' }
];

app.badges = [
  { id: 'first', name: 'First check-in', test: s => s.doneCount >= 1 },
  { id: 'perfect', name: 'Perfect day', test: s => s.doneToday === app.tasks.length },
  { id: 'streak7', name: '7-day streak', test: s => s.streak >= 7 },
  { id: 'lvl3', name: 'Level 3', test: s => s.level >= 3 }
];

app.nasa = {
  careerLimit: 600,
  speLimit: 250,
  stdUrl: 'https://www.nasa.gov/wp-content/uploads/2023/03/radiation-protection-technical-brief-ochmo.pdf',
  donkiUrl: 'https://ccmc.gsfc.nasa.gov/tools/DONKI',
  donkiBases: ['https://ccmc.gsfc.nasa.gov/DONKI-API/get/', 'https://api.nasa.gov/DONKI/', 'https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/'],
  background: {
    moon: { mSvDay: 1.369, src: 'Chang\u2019e 4 LND, lunar surface (Zhang et al., Science Advances 2020)' },
    mars: { mSvDay: 0.67, src: 'NASA Curiosity RAD, Mars surface (Hassler et al., Science 2014)' }
  },
  cachedSep: [
    { sepID: '2026-08-22T22:28:00-SEP-001', eventTime: '2026-08-22T22:28Z', instrument: 'STEREO A: IMPACT 13-100 MeV', link: 'https://kauai.ccmc.gsfc.nasa.gov/DONKI/view/SEP/48231/2' },
    { sepID: '2026-07-30T18:45:00-SEP-001', eventTime: '2026-07-30T18:45Z', instrument: 'GOES-P: SEISS >10 MeV', link: 'https://kauai.ccmc.gsfc.nasa.gov/DONKI/view/SEP/47879/2' },
    { sepID: '2026-01-19T02:57:00-SEP-001', eventTime: '2026-01-19T02:57Z', instrument: 'SOHO: COSTEP 28.2-50.1 MeV', link: 'https://kauai.ccmc.gsfc.nasa.gov/DONKI/view/SEP/44047/1' }
  ]
};

app.radBackground = () => app.nasa.background[(app.mode && app.mode.key) || 'moon'];
app.setRadBands = () => {
  const bg = app.radBackground(), uSvh = bg.mSvDay * 1000 / 24, ind = app.indicator('rad');
  ind.bands = [{ max: Math.round(uSvh * 2), level: 'green' }, { max: Math.round(uSvh * 10), level: 'amber' }, { max: Infinity, level: 'red' }];
  ind.chartMax = Math.round(uSvh * 14);
  ind.normal = `Up to ${Math.round(uSvh * 2)} µSv/h: within twice the measured background here, ${Math.round(uSvh)} µSv/h (${bg.src}).`;
};

app.news2 = values => {
  const parts = {};
  let total = 0, maxPart = 0;
  app.indicators.filter(i => i.news).forEach(i => {
    const v = values[i.key];
    if (v === null || v === undefined) return;
    const sc = i.news.find(b => v < b.max).score;
    parts[i.key] = sc; total += sc; maxPart = Math.max(maxPart, sc);
  });
  let risk, level, response;
  if (total >= 7) { risk = 'High'; level = 'red'; response = 'Emergency response: continuous monitoring, crew medical officer now.'; }
  else if (total >= 5) { risk = 'Medium'; level = 'amber'; response = 'Urgent review by the crew medical officer; monitor at least hourly.'; }
  else if (maxPart === 3) { risk = 'Low to medium'; level = 'amber'; response = 'One value is far off: urgent review by the crew medical officer.'; }
  else if (total >= 1) { risk = 'Low'; level = 'green'; response = 'Keep monitoring; recheck within 4 to 6 hours.'; }
  else { risk = 'None'; level = 'green'; response = 'Routine monitoring.'; }
  return { total, parts, risk, level, response };
};
