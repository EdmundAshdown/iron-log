# Iron Log

A mobile-first PWA gym workout tracker. Tracks PRs, plans sessions with percentage-based loading, and calculates plate breakdowns.

## Features

- **Log tab** — Log sets (exercise, weight, reps). PRs are auto-detected and badged.
- **PRs tab** — View 1RM, 3RM, 5RM per exercise. Filter by date window (3mo / 6mo / 1yr / all-time) with automatic fallback to older records if nothing found in window.
- **Session Planner** — Program per-set percentages of your PR upfront. See target weight + exact plate breakdown per set. Check off sets as you complete them with a confetti celebration.
- **Settings** — lbs/kg toggle, bar weight, plate inventory editor, exercise management.

All data lives in IndexedDB on your device. No account, no backend, no cost.

## Project structure

```
iron-log/
  index.html        # App shell + log modal
  manifest.json     # PWA manifest
  sw.js             # Service worker (offline support)
  css/
    app.css         # All styles
  js/
    app.js          # Main app logic + tab renderers
    db.js           # IndexedDB data layer
    calc.js         # Plate calculator + weight utils
    confetti.js     # Set completion celebration animation
  icons/
    icon-192.png    # Required for PWA install prompt
    icon-512.png    # Required for PWA install prompt
```

## Running locally

Just open `index.html` in a browser — no build step needed.

For the service worker to function (offline support + installability), serve it over HTTP:

```bash
# Python
python -m http.server 8080

# Node
npx serve .
```

Then visit `http://localhost:8080`.

## Deploying to GitHub Pages

1. Create a new GitHub repo (e.g. `iron-log`)
2. Push this folder's contents to the `main` branch
3. Go to Settings → Pages → Source: `main` branch, `/ (root)`
4. Your app will be live at `https://yourusername.github.io/iron-log`
5. On iPhone: open that URL in Safari → Share → "Add to Home Screen"

## Icons

You'll need two PNG icons to complete the PWA:
- `icons/icon-192.png` (192×192)
- `icons/icon-512.png` (512×512)

A simple barbell or dumbbell on a teal (#1D9E75) background works great. You can generate these at https://favicon.io or use any image editor.

## Adding features later

- **Imperial/metric conversion**: all weights stored in lbs internally — `calc.js` has `toKg`/`toLbs` and the `unit` preference is already wired.
- **Export**: `db.js` exposes `getSets()` — easy to add a CSV export button.
- **Charts**: progress over time per exercise is a natural next feature — all the data is there.
