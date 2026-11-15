window.app = window.app || {};

app.iconPaths = {
  overview: '<circle cx="12" cy="12" r="8.5"/><path d="M4.8 12.6h3.3l1.6-3.6 2.6 7.2 1.9-4.6 1.1 1h3.9"/>',
  vitals: '<path d="M12 19.8s-7.6-4.6-7.6-10.1A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.6 2.3c0 5.5-7.6 10.1-7.6 10.1z"/><path d="M7.4 12.2h2.1l1.2-2.1 2 4 1.3-1.9h2.7"/>',
  routine: '<rect x="4.5" y="4" width="15" height="16.5" rx="2.5"/><path d="M8.3 9.4l1.6 1.6 3.2-3.2"/><path d="M8.5 15.5h7"/>',
  record: '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><rect x="9.5" y="12.6" width="5" height="4" rx="1"/><path d="M10.6 12.6v-1a1.4 1.4 0 0 1 2.8 0v1"/>',
  radiation: '<path d="M10.40 9.23L7.70 4.55A8.6 8.6 0 0 1 16.30 4.55L13.60 9.23A3.2 3.2 0 0 0 10.40 9.23z M15.20 12.00L20.60 12.00A8.6 8.6 0 0 1 16.30 19.45L13.60 14.77A3.2 3.2 0 0 0 15.20 12.00z M10.40 14.77L7.70 19.45A8.6 8.6 0 0 1 3.40 12.00L8.80 12.00A3.2 3.2 0 0 0 10.40 14.77z"/><circle cx="12" cy="12" r="1.2"/>',
  alerts: '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  crew: '<path d="M5.5 17.5v-6a6.5 6.5 0 0 1 13 0v6"/><path d="M8.3 11.6a3.7 2.8 0 0 1 7.4 0v1.2a1.3 1.3 0 0 1-1.3 1.3H9.6a1.3 1.3 0 0 1-1.3-1.3z"/><path d="M4 20.5h16"/>',
  security: '<path d="M12 3.5l7 2.8v5.4c0 4.4-3 7.9-7 9.3-4-1.4-7-4.9-7-9.3V6.3z"/><path d="M9 12.3l2.1 2.1 4-4.4"/>',
  lab: '<path d="M9.5 3.5h5"/><path d="M10.5 3.5v5.2L5.4 18a1.7 1.7 0 0 0 1.5 2.5h10.2a1.7 1.7 0 0 0 1.5-2.5l-5.1-9.3V3.5"/><path d="M7.6 14.5h8.8"/>',
  hr: '<path d="M12 19.8s-7.6-4.6-7.6-10.1A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.6 2.3c0 5.5-7.6 10.1-7.6 10.1z"/>',
  spo2: '<path d="M12 3.6s6 6.4 6 10.4a6 6 0 0 1-12 0c0-4 6-10.4 6-10.4z"/><circle cx="12" cy="14.4" r="2.3"/>',
  sbp: '<path d="M4.5 16.5a7.5 7.5 0 1 1 15 0"/><path d="M12 16.5l3.4-4.2"/><circle cx="12" cy="16.5" r="1.1"/>',
  temp: '<path d="M10 14.2V5.6a2 2 0 0 1 4 0v8.6a3.8 3.8 0 1 1-4 0z"/><path d="M12 9.2v7.2"/>',
  resp: '<path d="M3.5 8.5c2.8 0 2.8-2 5.6-2s2.8 2 5.6 2 2.8-2 5.8-2"/><path d="M3.5 13c2.8 0 2.8-2 5.6-2s2.8 2 5.6 2 2.8-2 5.8-2"/><path d="M3.5 17.5c2.8 0 2.8-2 5.6-2s2.8 2 5.6 2 2.8-2 5.8-2"/>',
  rad: '<path d="M10.40 9.23L7.70 4.55A8.6 8.6 0 0 1 16.30 4.55L13.60 9.23A3.2 3.2 0 0 0 10.40 9.23z M15.20 12.00L20.60 12.00A8.6 8.6 0 0 1 16.30 19.45L13.60 14.77A3.2 3.2 0 0 0 15.20 12.00z M10.40 14.77L7.70 19.45A8.6 8.6 0 0 1 3.40 12.00L8.80 12.00A3.2 3.2 0 0 0 10.40 14.77z"/><circle cx="12" cy="12" r="1.2"/>',
  link: '<circle cx="6" cy="17.5" r="2"/><path d="M6 11.5a6 6 0 0 1 6 6"/><path d="M6 6a11.5 11.5 0 0 1 11.5 11.5"/>',
  moon: '<path d="M15.6 4.4a7.8 7.8 0 1 0 4.2 12.8A6.3 6.3 0 0 1 15.6 4.4z"/>',
  plus: '<path d="M12 5.5v13M5.5 12h13"/>',
  user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.4 3.6-5.3 7-5.3s6.2 1.9 7 5.3"/>',
  out: '<path d="M14 4.5h4a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-4"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h9"/>',
  help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.7 9.6a2.4 2.4 0 1 1 3.4 2.2c-.7.3-1.1.9-1.1 1.6v.6"/><path d="M12 16.6v.1"/>',
  arrow: '<path d="M9 5.5l6.5 6.5L9 18.5"/>'
};

app.icon = (name, size = 20, cls = '') =>
  `<svg class="ic ${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${app.iconPaths[name] || ''}</svg>`;

app.logo = (size = 40) => `<svg class="logo-seal" viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true">
  <circle cx="24" cy="24" r="21.5" fill="none" stroke="currentColor" stroke-width="2"/>
  <circle cx="24" cy="24" r="17" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="1.5 3.2" opacity=".7"/>
  <path d="M7 25.5h7.5l2.8-8.5 4.8 15 3.8-10 1.9 3.5h7.2" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="38" cy="25.5" r="2.6" fill="#fc3d21"/>
</svg>`;

app.avatar = (name, level = 'gray', size = 'md') => {
  const ini = String(name || '?').split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return `<span class="av av-${size} ring-${level}" aria-hidden="true"><span>${app.escape(ini)}</span></span>`;
};

app.illustration = () => `<svg class="illus" viewBox="0 0 320 190" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <circle cx="262" cy="44" r="15"/><path d="M251 38c5 2 9 1 13-3M250 50c6-3 13-2 21 1" opacity=".7"/>
  <g opacity=".55"><path d="M40 30h.01M88 52h.01M140 22h.01M196 58h.01M214 18h.01M300 96h.01M24 92h.01"/></g>
  <path d="M0 160C80 142 240 142 320 158"/>
  <path d="M64 151v-21a28 28 0 0 1 56 0v21"/><path d="M64 151h56"/><circle cx="92" cy="124" r="6"/>
  <path d="M152 150v-28"/><path d="M139 117a13 13 0 0 0 26 0z"/>
  <path d="M170 106a14 14 0 0 1 11-9" opacity=".8"/><path d="M175 114a24 24 0 0 1 20-17" opacity=".6"/><path d="M180 122a34 34 0 0 1 30-25" opacity=".4"/>
  <path d="M16 178h70l6-11 8 20 6-13 4 4h194" stroke-width="2"/><circle cx="306" cy="178" r="3" fill="#fc3d21" stroke="none"/>
</svg>`;
