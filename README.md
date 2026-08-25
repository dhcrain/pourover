# Grounds Control

A small static web app for timing pour-over coffee. Pick a recipe (4:6 Method
or 1-Cup V60), fine-tune the dose, then run a step-by-step pour timer with a
countdown ring and sound alerts.

Plain HTML/CSS/JS, no build step, no dependencies.

## Files

- `index.html` — markup for all four screens (home, tune, timer, done)
- `styles.css` — styling
- `app.js` — app logic and state
- `recipes.js` — recipe data and scaling math
- `src/worker.js` — the Worker in front of the static site; routes
  `/api/track` (see "Recipe stats" below) and falls through to the static
  files for everything else
- `wrangler.jsonc` — Worker config: static-assets binding, `run_worker_first`
  routing, and the KV namespace binding

## Run locally

From this directory:

```
python3 -m http.server 8934
```

Then open http://localhost:8934/ in a browser. This serves the static files
directly, so `/api/track` calls just fail silently (no local Worker) — fine
for UI work. To exercise the full Worker + KV locally, use `wrangler dev`
instead (requires `npx wrangler`, see Deployment below).

## Deployment

Hosted as a Cloudflare Worker with static assets (Workers & Pages → pourover
→ production), deployed automatically by Cloudflare's Workers Builds on push
to `main` — it runs `npx wrangler deploy` against `wrangler.jsonc`, no local
`node_modules`/`package.json` needed. This is **not** Cloudflare Pages,
despite living under the same "Workers & Pages" dashboard section.

## Recipe stats

`app.js` fires a fire-and-forget `POST /api/track` (via `sendBeacon`) when a
recipe is picked and again when a brew is followed through to the end.
`src/worker.js` increments a counter per `event:recipe` pair in the
`POUROVER_STATS` KV namespace (bound in `wrangler.jsonc`). Missing locally,
so `python3 -m http.server` still works fine for everything else.

KV namespace and the `STATS_SECRET` (gates the read endpoint below) are
already provisioned on the live Worker. To view counts:
`https://<your-worker-domain>/api/track?secret=<STATS_SECRET>` returns JSON
like `{"picked:foursix": 41, "completed:foursix": 27, ...}`. The secret
itself isn't in this repo — it's a Worker secret (`wrangler secret list
--name pourover` shows it's set, not its value).

## Keeping the screen awake

The timer requests a Screen Wake Lock while it runs. The Wake Lock API only
exists in a "secure context" (HTTPS, or localhost) — over plain HTTP, iOS
Safari never exposes `navigator.wakeLock` at all, so the lock silently does
nothing and the screen sleeps like normal. The Worker serves everything over
HTTPS with a publicly-trusted certificate by default, so this works with no
extra setup.
