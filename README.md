# Pour Over Timer

A small static web app for timing pour-over coffee. Pick a recipe (4:6 Method
or 1-Cup V60), fine-tune the dose, then run a step-by-step pour timer with a
countdown ring and sound alerts.

Plain HTML/CSS/JS, no build step, no dependencies.

## Files

- `index.html` — markup for all four screens (home, tune, timer, done)
- `styles.css` — styling
- `app.js` — app logic and state
- `recipes.js` — recipe data and scaling math
- `serve.py` — static file server used on the Pi; supports plain HTTP or
  HTTPS depending on the arguments it's started with

## Run locally

From this directory:

```
python3 -m http.server 8934
```

Then open http://localhost:8934/ in a browser.

