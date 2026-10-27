# WindDesk - GB wind forecast monitor

A web app for a UK day-ahead power procurement desk. It shows **which wind forecast was actually available when a buying decision had to be made**, and **how wrong those forecasts tend to be**, so the desk can size purchases with the error in mind.

Scope: national-level GB wind from Elexon BMRS only - `FUELHH` (fuelType `WIND`) for actual generation and `WINDFOR` for forecasts - for purchase decisions made in **January 2026**.

**Live app:** https://q7vznt.vercel.app &nbsp;·&nbsp; **Video walkthrough:** `<YOUTUBE_URL>`

---

## What it does

| Tab | Question it answers |
|---|---|
| **Day-ahead decision** | "It's 11:00 on D-1 and the auction is about to close. What does the latest wind forecast say for tomorrow, how much of it can I count on (P10), and how much is risk?" The band only uses errors that were already observable before the gate, so there's no hindsight. |
| **Forecast monitor** | Pick a time window and a **forecast horizon (0-48h)**. For each target time it plots the actual output next to the *latest forecast published at least that many hours earlier*, with MAE / RMSE / bias / P90 error. |
| **Accuracy analysis** | How error grows with horizon, the error distribution, bias by wind level and MAE by hour of day. |

### Key findings (January 2026)
- The forecast **over-predicts by ~1.5-1.9 GW on average** at every horizon. In 85% of hours it was higher than the actual output.
- The over-prediction **grows with wind level**, from ~0.5 GW at low wind to over 4 GW when 20 GW+ is forecast. The likely cause is curtailment: FUELHH is metered output after constraint actions, while WINDFOR forecasts the wind resource.
- Horizon matters less than bias: MAE is 1.73 GW at 1h ahead vs 1.90 GW at 24h ahead.
- Subtracting a **trailing 7-day bias**, using no future data, cuts MAE by **20-27%**.
- The day-ahead P10 band held in ~88% of hours (target 90%). Daily actual energy fell below the P10 plan on 3 of 29 days.

Full working is in [`analysis/forecast_error_analysis.ipynb`](analysis/forecast_error_analysis.ipynb).

---

## Repository layout

```
.
├── backend/                     Python API (FastAPI)
│   ├── app/
│   │   ├── main.py              HTTP routes + input validation; serves the built SPA when STATIC_DIR is set
│   │   ├── config.py            Date scope, 48h horizon cap, gate hour, env settings
│   │   ├── elexon.py            Client for the FUELHH / WINDFOR stream endpoints
│   │   ├── store.py             In-memory store + "latest forecast published before X" lookup (bisect)
│   │   ├── analysis.py          Comparison, error slicing, day-ahead view and uncertainty band
│   │   └── metrics.py           MAE/RMSE/bias/quantiles/histogram (pure Python, no numpy)
│   ├── data/wind_jan2026.json.gz  Bundled snapshot of the Jan 2026 data (~100 KB)
│   ├── scripts/fetch_snapshot.py  Re-downloads the snapshot from Elexon
│   ├── tests/                   pytest: lookup rules, metrics, API end-to-end
│   ├── requirements.txt         Runtime dependencies
│   └── requirements-dev.txt     + pytest, pandas, matplotlib, jupyter
├── frontend/                    React 18 + TypeScript + Vite + Recharts
│   └── src/
│       ├── App.tsx              Shell, tabs (#hash routing), footer with data provenance
│       ├── api.ts               Typed API client
│       ├── hooks.ts             useApi (drops stale responses), useDebounced
│       ├── format.ts            UK-time and MW/GWh formatting, axis helpers
│       ├── components/ui.tsx    Panel, KPI card, horizon slider, status
│       └── views/               DayAheadView, MonitorView, AccuracyView
├── analysis/forecast_error_analysis.ipynb   Executed notebook with the findings above
├── api/index.py                 Vercel serverless entrypoint (re-exports the FastAPI app)
├── vercel.json                  Vercel build + /api rewrite
├── Dockerfile                   Multi-stage: build SPA -> python:3.11-slim serving API + SPA
├── docker-compose.yml           One-command local run
├── heroku.yml                   Alternative container deploy on Heroku
├── requirements.txt             Root copy of runtime deps (Vercel's Python runtime reads this)
└── LICENSE                      Proprietary, all rights reserved
```

---

## Running it

### Option 1 - Docker (recommended)
```bash
docker compose up --build
```
Open http://localhost:8000. To pull fresh data from Elexon at startup instead of using the bundled snapshot, run `DATA_SOURCE=live docker compose up --build`.

### Option 2 - local dev (hot reload)
```bash
# backend - Python 3.11+
cd backend
python -m venv .venv
.venv/bin/pip install -r requirements-dev.txt      # Windows: .venv\Scripts\pip
.venv/bin/uvicorn app.main:app --reload --port 8000

# frontend - Node 20+ (in another terminal)
cd frontend
npm ci
npm run dev                                        # http://localhost:5173, proxies /api -> :8000
```
Interactive API docs are at http://localhost:8000/docs.

### Tests and lint
```bash
cd backend && .venv/bin/pytest -q
cd frontend && npm run lint && npm run build
```

### Refresh the data snapshot
```bash
cd backend && .venv/bin/python -m scripts.fetch_snapshot
```

### Deploying
- **Vercel:** import the repo with no extra settings. `vercel.json` builds `frontend/` as static files and deploys `api/index.py` as a Python function. Calls to `/api/*` are rewritten to that function.
- **Heroku:** `heroku stack:set container && git push heroku main` uses `heroku.yml` and the Dockerfile. The container reads `$PORT`.

---

## Design notes

**The core rule.** For a target time *T* and horizon *h*, the forecast used is the one with the **latest `publishTime` ≤ T − h**, as long as T − publishTime ≤ 48h. Forecasts published after their target time are dropped. This is what a trader would have seen *h* hours before delivery. Each target's publish times are kept sorted, so every lookup is a binary search.

**Time handling.** All data is stored and compared in UTC. Display, hour-of-day bucketing and the day-ahead gate (11:00 UK on D-1) use `Europe/London`, so the logic stays correct across DST changes even though January is GMT throughout.

**Resolution mismatch.** WINDFOR is hourly and FUELHH is half-hourly. Metrics are calculated on the hour, where both exist. The chart still draws the half-hourly actuals so the line isn't smoothed.

**Uncertainty band.** At gate time *G*, the band is built from errors in the same lead-time range as that day's forecast (e.g. 14-38h) for targets **before G**, so only already-observed errors count. With fewer than 200 such samples (the first day or two of January), it falls back to the whole month and the UI labels the band "in-sample".

**Data source.** The app uses a bundled snapshot by default. January 2026 is history, so this keeps results reproducible, makes cold starts on serverless instant, and avoids depending on Elexon's availability during a demo. `DATA_SOURCE=live` fetches from Elexon on startup and falls back to the snapshot if Elexon fails.

**Error sign.** `error = forecast − actual`. A positive error means wind was over-forecast and the desk would be short. This is used consistently in the API, the UI and the notebook.

**Backend without numpy.** The API needs only FastAPI, httpx and tzdata. That keeps the Vercel function small and fast to cold-start. pandas is used only in the notebook.

### API
| Endpoint | Description |
|---|---|
| `GET /api/meta` | Data coverage, source, settings |
| `GET /api/series?start&end&horizon` | Actual vs forecast at a horizon, plus summary metrics |
| `GET /api/accuracy/horizon?start&end` | Metrics for every horizon from 0 to 47h |
| `GET /api/accuracy/hour?start&end&horizon` | MAE by UK hour of day |
| `GET /api/accuracy/level?start&end&horizon` | Bias/MAE by forecast level band |
| `GET /api/accuracy/distribution?start&end&horizon&bin_width` | Error histogram |
| `GET /api/day-ahead?day&gate_hour` | Forecast at gate, P10-P90 band, outcome |

---

## Use of AI tools
AI coding assistants were used during development to help scaffold code, draft documentation and review the implementation. All design decisions, the analysis and its conclusions were checked by hand against the data.

## License
Proprietary - all rights reserved. See [LICENSE](LICENSE). The code is public only so it can be evaluated. No permission is granted to copy, reuse or redistribute it.
