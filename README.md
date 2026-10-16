# Iron Log

A mobile-first PWA gym workout tracker. Tracks PRs, plans full workout sessions with multiple movements, percentage-based loading, and plate breakdowns.

## Features

- **Log** — Log sets (exercise, weight, reps). PRs are auto-detected and badged. Supersets and circuits log as a group with round numbers.
- **Rest timer** — Counts down between sets, with +30s, pause and skip.
- **PRs** — View 1RM, 3RM, 5RM per exercise with configurable date window and all-time fallback.
- **Planner** — Build full workout sessions with multiple movements. Per-set % or flat lbs input, rep counts, live plate transition instructions.
- **Settings** — Units (lbs/kg), bar weight, plate inventory, exercise management, rest timer, JSON backup/restore.

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
    schema.js       # Set schema, validation, backup migration
    circuits.js     # Circuit grouping (supersets)
    timer.js        # Rest countdown model
    dates.js        # Local calendar-day helpers
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

## Data model

A logged set is a discriminated record — `type` decides which metric
fields are meaningful (see `js/schema.js`):

| `type`     | Metric fields          | Example          |
|------------|------------------------|------------------|
| `strength` | `weight` (lbs), `reps` | 5 × 225 lbs      |
| `timed`    | `duration` (seconds)   | 1:30             |
| `distance` | `distance` (metres)    | 5 km             |
| `output`   | `output` (count)       | 30 calories      |

Every set also stores `exerciseId`, `date` (`YYYY-MM-DD`), `notes`, and —
for circuit members — `groupId` and `round`. Records written before v2 have
no `type` and are treated as `strength`; IndexedDB is migrated in place on
upgrade (`DB_VERSION` in `js/db.js`).

Each exercise declares which metric it logs (Settings → Exercises), and the
Log modal renders the matching inputs. Exercises predating v3 default to
`strength`, and the Planner and PRs tabs only offer weight/reps lifts.

### Circuits (supersets)

The Log modal has a **Circuit** mode: pick two or more exercises, set a round
count, and every round × exercise combination is written in one transaction.
There is no separate circuit entity — the sets themselves carry a shared
`groupId` and a 1-based `round`, and sets without a `groupId` are standalone
(see `js/circuits.js`). The Log tab groups sets by `groupId` and renders them
round by round with a block-level delete. Because the group is just fields on
the sets, backups, restores and older app versions all keep working.

### Rest timer

Saving a set starts a countdown in a bar above the bottom nav (default 90s;
set it in Settings → Rest timer, or choose **Off**). The bar keeps running
while you move between tabs, and the app beeps and vibrates at zero. The
countdown model in `js/timer.js` is pure and unit-tested; `js/app.js` owns the
interval, the audio and the bar. Logging a circuit starts a single rest at the
end — per-round rest intervals are not built yet.

### Units

Weight is stored in lbs and distance in metres, and both are *displayed* in
the unit preference. Distance shows miles for imperial and km for metric, with
short distances (under 0.1 mi / 1 km) staying in metres. Distance is still
*entered* in metres, which is how erg distances are read.

### Backup compatibility

`js/backup.js` writes `version: 3` (`BACKUP_VERSION`). On import, older
files are migrated up to the current version; files from a newer app
version are rejected rather than silently misread.

## Testing

Schema, migration, date, circuit-grouping and timer logic is covered by
Node's built-in test runner (no dependencies):

```bash
npm test
```

## Releases

The service worker is cache-first and precaches an explicit asset list in
`sw.js`. **Bump the `CACHE` name on every release** and add any new module
to `ASSETS` — otherwise installed clients keep serving the old files.
Bump `js/version.js` at the same time.
