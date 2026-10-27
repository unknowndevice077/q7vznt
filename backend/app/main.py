from datetime import date, datetime, timedelta, timezone
from functools import lru_cache
from typing import Annotated

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles

from . import analysis, config
from .metrics import clean
from .store import WindStore, load_store

app = FastAPI(
    title="Wind Forecast Monitor API",
    description="GB national wind: Elexon WINDFOR forecasts vs FUELHH outturn, January 2026.",
    version="1.0.0",
)
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["GET"], allow_headers=["*"])
app.add_middleware(GZipMiddleware, minimum_size=1000)


@lru_cache(maxsize=1)
def get_store() -> WindStore:
    return load_store()


Horizon = Annotated[float, Query(ge=0, le=config.MAX_HORIZON_H, description="Hours between forecast publish and target time")]


def _window(start: datetime | None, end: datetime | None) -> tuple[datetime, datetime]:
    s = start or config.TARGET_FROM
    e = end or config.TARGET_TO
    # treat naive input as UTC
    s = s if s.tzinfo else s.replace(tzinfo=timezone.utc)
    e = e if e.tzinfo else e.replace(tzinfo=timezone.utc)
    if e <= s:
        raise HTTPException(400, "end must be after start")
    return s, e


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/meta")
def meta():
    store = get_store()
    return {
        "source": store.source,
        "loadedAt": store.loaded_at,
        "maxHorizonH": config.MAX_HORIZON_H,
        "gateHourUK": config.DA_GATE_HOUR,
        "errorConvention": "forecast - actual (MW); positive = over-forecast",
        **store.coverage,
    }


@app.get("/api/series")
def series(start: datetime | None = None, end: datetime | None = None, horizon: Horizon = 4):
    s, e = _window(start, end)
    return clean(analysis.series(get_store(), s, e, horizon))


@app.get("/api/accuracy/horizon")
def accuracy_by_horizon(start: datetime | None = None, end: datetime | None = None):
    s, e = _window(start, end)
    return clean(analysis.by_horizon(get_store(), s, e))


@app.get("/api/accuracy/hour")
def accuracy_by_hour(start: datetime | None = None, end: datetime | None = None, horizon: Horizon = 24):
    s, e = _window(start, end)
    return clean(analysis.by_hour_of_day(get_store(), s, e, horizon))


@app.get("/api/accuracy/level")
def accuracy_by_level(start: datetime | None = None, end: datetime | None = None, horizon: Horizon = 24):
    s, e = _window(start, end)
    return clean(analysis.by_level(get_store(), s, e, horizon))


@app.get("/api/accuracy/distribution")
def accuracy_distribution(start: datetime | None = None, end: datetime | None = None, horizon: Horizon = 24,
                          bin_width: Annotated[int, Query(ge=50, le=5000)] = 250):
    s, e = _window(start, end)
    return clean(analysis.error_distribution(get_store(), s, e, horizon, bin_width))


@app.get("/api/day-ahead")
def day_ahead(day: date = date(2026, 1, 15), gate_hour: Annotated[int, Query(ge=0, le=23)] = config.DA_GATE_HOUR):
    # gates on Jan 1..Jan 31 -> delivery days Jan 2..Feb 1
    first = config.PUBLISH_FROM.date() + timedelta(days=1)
    last = config.PUBLISH_TO.date()
    if not (first <= day <= last):
        raise HTTPException(400, f"day must be between {first} and {last}")
    return clean(analysis.day_ahead(get_store(), day, gate_hour))


# single-container mode: serve the built React app from the same origin
if config.STATIC_DIR and config.STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=config.STATIC_DIR, html=True), name="web")
