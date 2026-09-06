# Jumbo

An AI + human wellness and longevity companion. Jumbo reads the health data you
already have, fills the small gaps with almost no friction, explains what is
changing, and lets you explore what your current patterns could mean over years.

This is a **functional product build**, not a click-through prototype. Every core
flow works against a realistic six-month sample history, generated
deterministically so the app is explorable the moment it loads.

> Jumbo is a wellness, performance and longevity companion. It is not a
> diagnostic tool or a medical device, and its projections are not clinical
> predictions.

---

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
npm run preview  # serve the build
```

No API keys, no backend, no device integrations. State persists in
`localStorage`; **Profile → Your data → Clear everything** resets it, which also
replays onboarding.

---

## What actually works

| Area | What you can do |
|---|---|
| **Onboarding** | Welcome → goal → one-tap connect → live import → fill gaps → computed baseline → first win. Skippable at every step. |
| **Today** | Four-ring daily state, per-domain detail from imported data, 1–2 insights, and a single "next useful thing". |
| **Trajectory** | Pick a metric and horizon, drag five behaviour levers, watch the modelled path and its uncertainty band move against your current pattern. |
| **Capture** | Camera-first meal logging with an editable AI proposal, workout entry with perceived effort, measurement entry, day notes. |
| **Insights** | Full six-beat insight cards with evidence, confidence, stated limitations, options and your decision. |
| **Measurements** | VO₂ max, DEXA body composition, biomarkers, grip strength — each with history, source and reference context. |
| **Explore** | Follow creators, goal-matched video recommendations, kept explicitly separate from Jumbo's own guidance. |
| **Profile** | Goal, connect/disconnect/sync sources, privacy switches that change real behaviour, theme, export, delete. |

Responsive from 320px to desktop; light and dark; reduced-motion honoured;
haptics on devices that support them.

---

## How it is put together

```
src/
  data/          Domain types, deterministic sample-history generator,
                 food database, simulated meal recognition, creators
  lib/           Baseline + insight engine, trajectory model, haptics, utils
  state/         Single reducer store, localStorage persistence
  components/    Icon set, rings, charts, sheet, toast, form primitives
  onboarding/    The seven-step first run
  screens/       Today, Trajectory, Capture, Insights, Measurements, Explore, You
  styles/        Design tokens, base stylesheet
```

**No UI framework and no chart library.** Every ring, sparkline, line chart and
projection band is hand-built SVG, so the visual language stays consistent and
the bundle stays small (~87 kB gzipped).

### The sample data is deliberately imperfect

`src/data/generate.ts` builds 182 correlated days from a seeded PRNG. Signals
influence each other the way they do in life: late bedtimes depress overnight
HRV, hard sessions raise the next morning's resting heart rate, rest days
restore it. It also encodes three real stories for the insight engine to find —
a cluster of late nights in the last three weeks, a training-load ramp in the
last seven days, and protein sitting below a common reference range — so the
patterns Jumbo surfaces are genuinely present in the data rather than scripted.

### The trajectory model is inspectable

`src/lib/trajectory.ts` applies documented directional relationships (aerobic
volume → VO₂ max with diminishing returns, strength → lean mass, sleep gating
adaptation) to *your* baseline, and widens its uncertainty band with the
horizon. Every assumption it makes is listed in the UI under "What the model
assumes", including what it does not model at all.

---

## Design decisions worth naming

Built against Apple's Human Interface Guidelines, applied as cross-platform
principles.

- **Provenance is always visible.** Three tags — *Measured*,
  *Evidence-informed*, *Model estimate* — separate what was recorded from what
  research suggests from what Jumbo computed. They appear wherever the three mix.
- **No AI claim without a confidence.** Every insight and every meal proposal
  carries a confidence band and a named limitation. Low-confidence recognition
  says so and tells you why.
- **The human decides.** Insights end in a choice, not an instruction. Meals are
  not recorded until you confirm them. Nothing is auto-applied.
- **Rest counts.** On a rest day the movement target relaxes and recovery is
  weighted higher. The consistency streak carries one grace day, so a single bad
  night does not erase a month of showing up.
- **No badges, points or leaderboards.** Progress is four rings, a streak that
  rewards sustainability, and a trajectory that moves.
- **Never fear-based.** No mortality countdowns, no deterministic health claims.
  The trajectory shows ranges and says plainly that they are projections.
- **Accessibility.** 8-point spacing, a deliberate type scale, sans-serif only,
  all body text at or above 4.5:1 contrast in both themes, every control at
  least 44pt, full keyboard support with focus trapping in sheets, labelled
  charts, and `prefers-reduced-motion` respected throughout.
- **Navigation stays light.** Five tabs on mobile, a flat sidebar on desktop.
  Trajectory — the signature experience — is one tap from anywhere.

---

## Known scope boundaries

- Data sources are simulated. "Connecting" imports the generated history rather
  than talking to Apple Health, Ōura or Garmin.
- Meal recognition is a deterministic stand-in for an on-device model. It
  returns realistic items, confidences, alternatives and failure cases, but it
  does not look at the photograph. The camera opens for real where the browser
  allows it, and falls back to an obviously abstract placeholder where it does not.
- Video playback is not wired to YouTube.
- Reference ranges shown next to biomarkers are commonly cited figures for
  context only; they vary between labs and guidelines.

## Naming note

"Jumbo" is also used as an AI agent name in the NEXA booking/rebooking project.
Worth resolving before both sit in the same portfolio.
