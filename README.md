# Grounds Control

A small static web app for timing pour-over coffee. Pick a recipe (4:6 Method
or 1-Cup V60), fine-tune the dose, then run a step-by-step pour timer with a
countdown ring and sound alerts.

Plain HTML/CSS/JS, no build step, no dependencies.

## Run locally

From this directory:

```
python3 -m http.server 8934 --directory public
```

Then open http://localhost:8934/ in a browser. This serves the static files
directly, so `/api/track` calls just fail silently (no local Worker) — fine
for UI work. To exercise the full Worker locally, use `wrangler dev` instead
(requires `npx wrangler`, see Deployment below).

## Deployment

Hosted as a Cloudflare Worker with static assets (Workers & Pages → pourover
→ production), deployed automatically by Cloudflare's Workers Builds on push
to `main` — it runs `npx wrangler deploy` against `wrangler.jsonc`, no local
`node_modules`/`package.json` needed. This is **not** Cloudflare Pages,
despite living under the same "Workers & Pages" dashboard section.

## Recipe stats

`app.js` fires a fire-and-forget `POST /api/track` (via `sendBeacon`) when a
recipe is picked, again when the timer is started for it, and again when a
brew is followed through to the end. `src/worker.js` writes each as an event
(`{event, recipe}`, count 1) to the `pourover_stats` Workers Analytics
Engine dataset (bound as `STATS` in `wrangler.jsonc`, auto-created on first
write). Missing locally, so `python3 -m http.server` still works fine for
everything else.

Unlike a hand-rolled KV counter, writes are append-only (no read-modify-write
race) and queries can be windowed by time, not just all-time totals. The
tradeoff: reads only work through Cloudflare's external SQL API — no
dashboard UI (Cloudflare doesn't ship one for Analytics Engine) and no
`/api/track?secret=...`-style JSON endpoint here. Query it directly with a
Cloudflare API token scoped to `Account Analytics: Read` (dashboard → My
Profile → API Tokens → Create Token):

```
curl -s https://api.cloudflare.com/client/v4/accounts/2f005bc85fa106ef5efcbab654cc668e/analytics_engine/sql \
  -H "Authorization: Bearer $TOKEN" \
  -d "SELECT blob2 AS recipe, blob1 AS event, SUM(double1) AS count
      FROM pourover_stats
      WHERE timestamp > NOW() - INTERVAL '90' DAY
      GROUP BY blob2, blob1
      ORDER BY recipe, event"
```

Data retention is 90 days (Analytics Engine default).

## Keeping the screen awake

The timer requests a Screen Wake Lock while it runs. The Wake Lock API only
exists in a "secure context" (HTTPS, or localhost) — over plain HTTP, iOS
Safari never exposes `navigator.wakeLock` at all, so the lock silently does
nothing and the screen sleeps like normal. The Worker serves everything over
HTTPS with a publicly-trusted certificate by default, so this works with no
extra setup.
