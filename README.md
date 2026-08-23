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

## Run locally

From this directory:

```
python3 -m http.server 8934
```

Then open http://localhost:8934/ in a browser.

## Deployment

Hosted on [Cloudflare Pages](https://pages.cloudflare.com/), deployed from
this repo. No build command or output directory config needed — it's plain
static files served from the repo root. Push to the connected branch and
Cloudflare deploys automatically.

## Keeping the screen awake

The timer requests a Screen Wake Lock while it runs. The Wake Lock API only
exists in a "secure context" (HTTPS, or localhost) — over plain HTTP, iOS
Safari never exposes `navigator.wakeLock` at all, so the lock silently does
nothing and the screen sleeps like normal. Cloudflare Pages serves everything
over HTTPS with a publicly-trusted certificate by default, so this works with
no extra setup.
