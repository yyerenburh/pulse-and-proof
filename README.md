# Pulse & Proof

**Crew health monitoring you can trust when Earth is out of reach.**
Team **DatasavinG** (Kyiv) · NASA Space Apps Challenge 2026 · Challenge: *Create Health Monitoring Software for Astronauts on Space Missions*

By **Yelyzaveta Yerenburh**, National University “Zaporizhzhia Polytechnic”.

**Live demo:** https://github.com/yyerenburh/pulse-and-proof/

## The problem

On long missions, astronauts have to spot changes in their own health, often without a doctor and with minutes of signal delay to Earth. A health alert only helps if its data is real. A frozen sensor, a forged reading or a silently edited record can hide a problem as surely as a missing sensor. Medical and behavioral notes are also highly sensitive, and in a small crew everyone shares the same systems.

## What it does

**For the astronaut**
- Color-coded health cards (heart rate, SpO₂, blood pressure, temperature, breathing, radiation). Color plus a shape (● ▲ ■) shows status at a glance, also for color-blind users.
- Dynamic trend charts with shaded normal, watch and act-now bands, plus a one-line plain-language summary.
- A **?** on every card explains what the indicator is, how to measure it, why it matters in space and what to do now.
- A gamified daily routine: health tasks, points, levels, streaks and badges.
- Alerts that say what to do first, then let you acknowledge them.
- A radiation budget against the NASA-STD-3001 career limit (600 mSv), and space weather from NASA DONKI.
- A **NEWS2 early warning score** (Royal College of Physicians) that adds up small changes across vital signs. All color bands follow NEWS2 points, with AHA stages for high blood pressure.

**Built for distance from Earth**
- **Moon or Mars profile.** Mars adds a 12-minute one-way delay (real range 3 to 22 minutes; the demo plays it 100x faster). Commands from Earth, such as a new alert limit, arrive only after the delay.
- **Solar conjunction.** Every two years the Sun sits between Earth and Mars and NASA pauses commands for about two weeks. The crew keeps full monitoring; data queues and syncs afterwards.
- **Signed health reports.** Export a report signed by the habitat's health hub. Anyone can check that not one number changed since it was signed.
- **Works offline.** Installable app (PWA): after the first visit it runs with no network at all.

**Security built in (from our threat model)**
| | Mitigation | What it stops |
|---|---|---|
| M1 | Every reading signed by its sensor (Ed25519) with a sequence number | Fake devices, forged and replayed readings |
| M2 | Sensor integrity checks (stuck values, impossible jumps) | A compromised or broken sensor that still signs valid data |
| M3 | SHA-256 hash-chained ledger of every reading and action | Silent edits of past records; radiation bit flips |
| M4 | AES-256-GCM encryption of medical notes and check-ins | Leaks of behavioral health data |
| M5 | Least-privilege roles: astronaut, crew medical officer, flight surgeon, mission ops, admin | Over-sharing; astronauts silencing their own alerts |
| M6 | Onboard-first design with a signed, encrypted store-and-forward link to Earth | Blackouts, delay and tampering in transit |
| M10 | Signed, verifiable health reports | Forged or edited reports sent to Earth |
| M11 | Commands from Earth signed by the flight surgeon and checked onboard, with replay protection | Spoofed uplink commands |

**Red team panel.** Judges can run every attack from the threat model against the live app and watch each one get caught.

## Where the data comes from

No crew is built in. On first start the app asks a crew medical officer to set up the habitat with a PIN. Only the medical officer or the flight surgeon can register an astronaut: they enter pre-flight resting values from the medical exam, which become that person's baseline, and the app pairs a signed sensor and creates the astronaut's account. Every registration, baseline change, sign-in and failed PIN is written to the ledger.

In this prototype the paired sensors are **simulated** around each person's baseline, including the documented in-flight rise in body temperature. Authorized users (the astronaut for themselves, or the medical officer) can also enter measurements by hand.

Data on the device is encrypted with one habitat key (AES-256-GCM). Each account stores its own copy of that key, wrapped with a key derived from its PIN (PBKDF2-SHA-256, 150,000 iterations); five wrong PINs lock the account for 30 seconds. Account names are visible on the sign-in screen; medical data is not readable without a PIN.

## Try it in 60 seconds

1. Open the live demo and press **Load demo crew (simulated)**: four fictional astronauts with ready-made accounts, all with PIN `424242`. Sign in as *Astronaut 1*.
2. Tap **?** on a card, then complete a health task.
3. Press **Switch user** and sign in as *Astronaut 2* (also the crew medical officer). Select Astronaut 3: heart rate and blood pressure are trending up.
4. In **Red team**, press *Freeze heart-rate sensor*. Within about 12 seconds the card turns to *Not trusted* and a sensor-integrity alert explains why.
5. Press *Edit a stored reading*, then *Verify ledger now*: the chain breaks at that exact entry. Press *Restore from Earth copy*.
6. Sign in as *Mission operations*: you see only fit-for-duty status, never diagnoses.
7. Switch the mission to **Mars**, sign in as *Flight surgeon* (Earth) and change a limit on any **?** card: it reaches the crew only after the signal delay. Try *Solar conjunction* in Mission events.
8. As the crew medical officer, open **Signed report**, then press *Forge a health report* in Red team: the edited report fails the check.

## Data sources

| Data | Source | Real or simulated |
|---|---|---|
| Space weather: solar energetic particle events and solar flares, last 30 days | NASA CCMC DONKI, live (`ccmc.gsfc.nasa.gov/DONKI-API`, the endpoint used since 30 September 2026; older `api.nasa.gov/DONKI` as fallback). If offline, the app shows the latest real DONKI records saved with it. | Real, NASA |
| Radiation background on the Mars surface: 0.67 mSv a day | NASA Curiosity rover, Radiation Assessment Detector (Hassler et al., Science 2014) | Real, NASA measurement |
| Radiation background on the lunar surface: 1.369 mSv a day | Chang'e 4 Lunar Lander Neutrons and Dosimetry (Zhang et al., Science Advances 2020); NASA has no lunar surface measurement | Real measurement |
| Radiation limits: 600 mSv career, 250 mSv per solar particle event | NASA-STD-3001 Vol. 1 | Real, NASA standard |
| Mars solar conjunction: two-week command pause every two years | NASA | Real |
| Spaceflight hazards framing explanations | NASA Human Research Program, five hazards | Real, NASA |
| Alert ranges for vital signs | NEWS2 (Royal College of Physicians, 2017); AHA blood pressure categories | Real clinical standards |
| In-flight rise in body temperature (about +1 °C after ~75 days) | Stahn et al., Scientific Reports 2017 (ISS crews) | Real study, used to shape the simulator |
| Crew vital signs | Generated around each person's entered pre-flight baseline | **Simulated** |

Why vital signs are simulated: there is no public, live stream of astronaut vital signs; NASA notes that access to astronaut health data has historically been limited by privacy rules. The closest open set, the Inspiration4 data in NASA's Open Science Data Repository, holds blood and omics results, not live vital signs. Real measurements can be entered by authorized users with **Add measurement**.

Each crew member's dose = days on mission × the measured daily background for the location, plus any solar particle event. Radiation colors follow the background: normal up to 2×, watch up to 10×, act now above 10× (a solar-particle-event level). These multipliers are our design choice, not a standard.

## Attack simulations

| | Attack | Real-world parallel | MITRE ATT&CK | Caught by |
|---|---|---|---|---|
| D1 | Frozen heart-rate sensor | Faulty or compromised wearable reporting false "normal" values | ICS T0856 Spoof Reporting Message | Stuck-value and jump checks |
| D2 | Fake device, forged signature, replayed packet | Rogue or cloned Bluetooth wearable | T0856, T1557 Adversary-in-the-Middle | Ed25519 signatures, sequence numbers |
| D3 | Edited stored reading, radiation bit flip, forged report | Record tampering by an insider; single-event upsets in space electronics | T1565.001 Stored Data Manipulation | Hash-chained ledger, AES-GCM, signed reports |
| D4 | Astronaut raises own limit, ops opens record, PIN guessing | Insiders beyond their role; lost or stolen tablet | T1078 Valid Accounts, T1110 Brute Force | Role rules, lockout after 5 PINs, ledger |
| D5 | Cut Earth link, tamper data in transit, forged command from Earth | Jamming, blackouts, link-layer attacks on spacecraft | T1565.002 Transmitted Data Manipulation, ICS T0855 Unauthorized Command Message | Onboard-first design, signed bundles, commands signed by the flight surgeon |

## How the app is organized

Sign in with a PIN, then open only the section you need from the navigation rail. Each section has its own address (for example `#vitals`), so it can be bookmarked or linked:

| Section | What it holds | Who sees it |
|---|---|---|
| Overview | Crew status, NEWS2 scores, open alerts, routine, radiation, ledger and Earth link at a glance | Everyone (details by role) |
| Vital signs | Six color-coded vital signs, NEWS2 breakdown, trend chart, explanations | Astronaut (own), medical team |
| Daily routine | Health tasks, points, streaks, badges | Astronaut (own), medical team |
| Medical record | Encrypted check-ins and clinical notes | Astronaut (own), medical team |
| Radiation | Career dose budget and NASA DONKI space weather | Astronaut (own), medical team |
| Alerts | What needs attention and what to do first | Everyone, filtered by role |
| Crew and accounts | Registered crew, who registered them, paired sensors, accounts | Everyone; registration by medical staff only |
| Security | Ledger check, sensors, Earth sync, report checks | Everyone |
| Simulation lab | Mission events and red-team attacks, with a lab log that times how fast each one is caught | Signed-in users, clearly separated from real data |

**Design elements drawn for this project:** a seal-style logo (habitat ring, pulse trace, red proof point), a 22-icon set on one 24-pixel grid, helmet-shaped crew avatars with a status ring, and a line illustration of a lunar habitat linked to Earth by the pulse trace.

## How it works

A static web app: HTML, CSS and plain JavaScript, with [Chart.js](https://www.chartjs.org/) (MIT) bundled. All cryptography uses the browser's built-in Web Crypto API; there is no custom crypto. No build step and no server.

```
index.html
css/style.css    base theme
css/shell.css    navigation and sections
js/config.js     indicators, color bands, explanations, demo crew, tasks, NASA references
js/icons.js      logo, icon set, avatars, illustration
js/sim.js        crew simulator, record store, health alerts
js/nasa.js       NASA DONKI feed with offline fallback
js/tasks.js      gamified health routine
js/security.js   signing, ledger, encryption, roles, Earth sync, sensor integrity
js/extras.js     Moon/Mars profiles, uplink delay, solar conjunction, signed reports
js/accounts.js   PIN sign-in, encrypted on-device storage, crew registration, manual measurements
sw.js            offline cache (installable app)
js/redteam.js    attack simulator
js/app.js        user interface
```

Run locally: open `index.html` in a recent Chrome, Edge, Firefox or Safari (offline install needs the hosted version or a local web server, e.g. `python3 -m http.server`). Ed25519 needs a recent browser; older ones fall back to ECDSA P-256 automatically.

## Out of scope

Production would use CCSDS Space Data Link Security on the link, hardware key storage with rotation, tamper-resistant sensors and multi-factor sign-in for ground users. In the prototype, the onboard hub, the sensors and Earth all run in one browser tab, roles are enforced in the browser, and the ledger restarts with each session.

## Team

**DatasavinG**, NASA Space Apps Challenge 2026, local event Kyiv, Ukraine. Team member: Yelyzaveta Yerenburh, National University “Zaporizhzhia Polytechnic”.

## Authorship and use of AI

**By the author (Yelyzaveta Yerenburh):** the idea and the threat model, the system architecture (signed sensor readings, hash-chained ledger, encrypted records, roles, store-and-forward link to Earth), the structure of the app and of the work, the choice of data sources, part of the code, and all testing decisions.

**With AI assistance (Claude, Anthropic):**

| Where | What the AI did |
|---|---|
| Icons and logo (`js/icons.js`, `icons/`) | Generated the line icons, the logo and the app icons as code. They are marked AI-generated in the app footer. |
| Code (`js/`, `css/`) | Edited, refactored and improved code written by the author; helped write parts of it, fix bugs and write automated tests. |
| Documentation | Drafted and edited this README, the `LICENSE` file, the threat model, the slide text and the submission text. |

All AI output was reviewed, tested and accepted by the author. No images, video or audio were generated with AI. The app uses no NASA logos, insignia or mission names.

## License

MIT. See `LICENSE`.
