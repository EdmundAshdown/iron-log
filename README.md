# Iron Log

A mobile-first PWA gym workout tracker. Tracks PRs, plans full workout sessions with multiple movements, percentage-based loading, and plate breakdowns.

## Features

- **Log** — Log sets (exercise, weight, reps). PRs are auto-detected and badged.
- **PRs** — View 1RM, 3RM, 5RM per exercise with configurable date window and all-time fallback.
- **Planner** — Build full workout sessions with multiple movements. Per-set % or flat lbs input, rep counts, live plate transition instructions.
- **Settings** — Units (lbs/kg), bar weight, plate inventory, exercise management, JSON backup/restore.

All data lives in IndexedDB on your device. No account, no backend, no cost.

## Project structure

```
iron-log/
  index.html        # App shell + log modal
  manifest.json     # PWA manifest
  sw.js             # Service worker (offline support)
  css/app.css       # All styles
  js/
    app.js          # Main app logic
    db.js           # IndexedDB data layer
    calc.js         # Plate calculator + session plan
    confetti.js     # Set completion celebration
    backup.js       # JSON export/import
    version.js      # Version string
  icons/
    icon-192.png
    icon-512.png
```

## Running locally

Serve over HTTP (required for ES modules):

```bash
# If you have Python
python -m http.server 8080

# Via VS Code — install "Live Server" extension, right-click index.html → Open with Live Server
```

## Deploying to GitHub Pages

1. Create a GitHub repo and push this folder
2. Settings → Pages → Source: main branch, root
3. Live at `https://yourusername.github.io/iron-log`
4. On iPhone: Safari → Share → Add to Home Screen

## Versioning

Bump `js/version.js` with each release. Shows in Settings tab.
