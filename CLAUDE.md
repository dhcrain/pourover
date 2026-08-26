# CLAUDE.md

## What this is

**Grounds Control** — pour-over coffee timer. Pick a recipe (4:6 Method or
1-Cup V60), tune the dose, run a step-by-step pour timer (countdown ring +
sound alerts). Plain HTML/CSS/JS. No build step, no deps, no package.json.

## Run locally

```
python3 -m http.server 8934 --directory public
```

Open http://localhost:8934/.

## Layout

- `public/` — everything deployed (`index.html`, `app.js`, `recipes.js`,
  `styles.css`). `wrangler.jsonc`'s `assets.directory` points here, so
  nothing else at repo root needs excluding from deploy.
- `src/worker.js` — Cloudflare Worker in front of the static site.

## app.js / recipes.js / index.html

- 4 screens (home → tune → timer → done) as `<section>`s in `index.html`,
  toggled by `showScreen()` in `app.js` (`.active` class). No framework, no
  router. One `state` object closed over in `app.js`'s IIFE.
- `recipes.js` stores water as **percent of total**, not grams, so
  `scaleRecipe(recipe, doseGrams, balanceId, strengthId)` works for any
  dose. `getRecipe()` + `scaleRecipe()` are the only calls `app.js` makes
  into this file.
- `app.js` also owns: timer loop (`requestAnimationFrame`), dose/size
  steppers, Screen Wake Lock, Web Audio beeps/ticks, `localStorage`
  (key `pourover.state.v1`) for last recipe/dose/balance/strength.
- `styles.css`: light theme (home/tune), dark theme (timer/done) —
  `.screen-light` / `.screen-dark`.

## 4:6 Method dial-in

Special-cased in both `recipes.js` and `app.js` — pour schedule isn't fixed
like the V60's, it's generated from two knobs:

- **Balance** (`BALANCE_OPTIONS`: sweet/even/acidic) — how the first 40%
  splits into 2 pours.
- **Strength** (`STRENGTH_OPTIONS`: light/medium/strong) — how many pours
  make up the remaining 60% (2/3/4).

`buildFourSixBreakpoints()` turns those into percent breakpoints;
`scaleRecipe()` only takes this path when `recipe.id === "foursix"`. Tune
screen shows the segmented controls + bar chart (`renderPourChart()`) only
for `"foursix"` — see `.dialin-section` in `openTune()`/`renderTune()`.

## Worker (`src/worker.js`)

- Routes `/api/track` (recipe-picked/timer-started/brew-completed) to the
  `pourover_stats` Analytics Engine dataset (bound `STATS`). Everything
  else falls through to `env.ASSETS.fetch()` (`run_worker_first` in
  `wrangler.jsonc`).
- `app.js`'s `trackEvent()` posts via `sendBeacon` — no-op without the
  Worker (e.g. local `python3 -m http.server`).
- Reads only work via Cloudflare's external Analytics Engine SQL API, not
  from inside the Worker. Query examples: README → "Recipe stats".

## Deployment

Cloudflare Worker with static assets (Workers & Pages → pourover →
production) — **not** Pages, despite the dashboard section name. Workers
Builds auto-deploys on push to `main` (`npx wrangler deploy`). No
`node_modules`/`package.json` — keep it dependency-free. HTTPS (automatic
here) is required for Screen Wake Lock to work on iOS Safari.
