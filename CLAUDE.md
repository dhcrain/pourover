# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Grounds Control** — a static web app for timing pour-over coffee brews.
Pick a recipe (4:6 Method
or 1-Cup V60), fine-tune the dose, then run a step-by-step pour timer with a
countdown ring and sound alerts. Plain HTML/CSS/JS, no build step, no
dependencies, no package.json.

## Run locally

```
python3 -m http.server 8934
```

Then open http://localhost:8934/. There is no test suite, linter, or build
step — verify changes by exercising the UI in a browser (or via the
`claude-in-chrome` tools if connected).

## Architecture

Four screens live as `<section>`s in a single `index.html`, toggled by
`showScreen()` in `app.js` via an `.active` class (home → tune → timer →
done). All state is a single `state` object closed over in `app.js`'s IIFE;
there is no framework or router.

- **`recipes.js`** — recipe data plus all scaling/timing math. Water amounts
  are stored as *percent of total water*, not fixed grams, so
  `scaleRecipe(recipe, doseGrams, balanceId, strengthId)` can produce a
  correct step list for any dose. `getRecipe()` and `scaleRecipe()` are the
  only entry points `app.js` calls into this file.
- **`app.js`** — screen transitions, timer loop (via
  `requestAnimationFrame`), dose/size steppers, Screen Wake Lock handling,
  and Web Audio beeps/ticks. Reads/writes `localStorage` (key
  `pourover.state.v1`) to remember the last recipe/dose/balance/strength.
- **`styles.css`** — all styling; light theme for home/tune, dark theme for
  timer/done (`.screen-light` / `.screen-dark`).
- **`src/worker.js`** — the Cloudflare Worker in front of the static site.
  Routes `/api/track` (recipe-picked/timer-started/brew-completed counters,
  incremented in the `POUROVER_STATS` KV namespace); everything else falls
  through to `env.ASSETS.fetch()`, per `run_worker_first` in
  `wrangler.jsonc`. `app.js`'s `trackEvent()` posts to it via `sendBeacon`
  and is a no-op without the
  Worker (e.g. plain `python3 -m http.server` local dev). See README's
  "Recipe stats" section for the KV/secret setup, provisioned directly on
  the live Worker (not tracked in this repo).

### 4:6 Method dial-in

The 4:6 Method recipe is special-cased throughout `recipes.js` and `app.js`:
its pour schedule isn't fixed like the V60's, but generated from two knobs —
**Balance** (`BALANCE_OPTIONS`: sweet/even/acidic — how the first 40% of
water splits into 2 pours) and **Strength** (`STRENGTH_OPTIONS`:
light/medium/strong — how many pours make up the remaining 60%, 2/3/4
respectively). `buildFourSixBreakpoints()` in `recipes.js` turns those two
IDs into percent breakpoints; `scaleRecipe()` only takes this path when
`recipe.id === "foursix"`. The tune screen shows segmented controls and a
bar chart (`renderPourChart()` in `app.js`) only when the selected recipe is
`"foursix"` — see the `.dialin-section` toggle in `openTune()`/`renderTune()`.

These ratios/pour-counts are sourced from `46recipie.png` (Tetsu Kasuya's
published 4:6 chart) and are stored as fractions, not grams, so they scale to
any dose automatically — do not hardcode gram amounts when adjusting this
logic.

## Deployment

Hosted as a **Cloudflare Worker with static assets** (Workers & Pages →
pourover → production) — not Cloudflare Pages, despite living under the same
dashboard section. Cloudflare's Workers Builds deploys automatically on push
to `main`, running `npx wrangler deploy` against `wrangler.jsonc`; no local
`node_modules`/`package.json` needed or wanted (keep this repo
dependency-free — see "What this is"). Cloudflare terminates HTTPS
automatically, which is required for the Screen Wake Lock API (keeps the
screen on during a brew) to work at all on iOS Safari.
