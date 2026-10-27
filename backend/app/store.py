"""In-memory wind actuals + forecasts."""
import bisect
import gzip
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

import httpx

from . import config, elexon

log = logging.getLogger(__name__)


def _ts(epoch: int) -> datetime:
    return datetime.fromtimestamp(epoch, tz=timezone.utc)


@dataclass
class ForecastHit:
    value: float
    publish_time: datetime
    horizon_h: float


@dataclass
class WindStore:
    actuals: dict[datetime, float]
    # target time -> publish times (sorted) and matching values
    _pubs: dict[datetime, list[datetime]] = field(default_factory=dict)
    _vals: dict[datetime, list[float]] = field(default_factory=dict)
    source: str = "snapshot"
    loaded_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    @classmethod
    def build(cls, actuals, forecasts, source="snapshot") -> "WindStore":
        store = cls(actuals=dict(actuals), source=source)
        rows = sorted(forecasts, key=lambda r: (r[1], r[0]))
        for pub, target, gen in rows:
            # published after the target started - not a real forecast
            if pub > target:
                continue
            pubs = store._pubs.setdefault(target, [])
            vals = store._vals.setdefault(target, [])
            if pubs and pubs[-1] == pub:
                vals[-1] = gen
                continue
            pubs.append(pub)
            vals.append(gen)
        return store

    def forecast_at_horizon(self, target: datetime, horizon_h: float) -> ForecastHit | None:
        """Latest forecast published at least `horizon_h` hours before target (and at most 48h before)."""
        return self.forecast_as_of(target, target - timedelta(hours=horizon_h))

    def forecast_as_of(self, target: datetime, as_of: datetime) -> ForecastHit | None:
        """Latest forecast for `target` that was public at `as_of`."""
        pubs = self._pubs.get(target)
        if not pubs:
            return None
        i = bisect.bisect_right(pubs, as_of) - 1
        if i < 0:
            return None
        pub = pubs[i]
        h = (target - pub).total_seconds() / 3600
        if h > config.MAX_HORIZON_H:
            return None
        return ForecastHit(self._vals[target][i], pub, h)

    def target_times(self, start: datetime, end: datetime) -> list[datetime]:
        """Hourly target times in [start, end) that have an actual value.

        WINDFOR is hourly while FUELHH is half-hourly, so we compare on the hour.
        """
        return sorted(t for t in self._pubs if start <= t < end and t in self.actuals)

    def actuals_between(self, start: datetime, end: datetime) -> list[tuple[datetime, float]]:
        return sorted((t, v) for t, v in self.actuals.items() if start <= t < end)

    @property
    def coverage(self) -> dict:
        targets = [t for t in self._pubs if t in self.actuals]
        pubs = sorted({p for ps in self._pubs.values() for p in ps})
        return {
            "targetFrom": min(targets).isoformat() if targets else None,
            "targetTo": max(targets).isoformat() if targets else None,
            "publishFrom": pubs[0].isoformat() if pubs else None,
            "publishTo": pubs[-1].isoformat() if pubs else None,
            "forecastRuns": len(pubs),
            "actualPoints": len(self.actuals),
        }


def load_snapshot(path=config.SNAPSHOT_FILE) -> WindStore:
    with gzip.open(path, "rt", encoding="utf-8") as f:
        raw = json.load(f)
    actuals = {_ts(t): g for t, g in raw["actuals"]}
    forecasts = [(_ts(p), _ts(t), g) for p, t, g in raw["forecasts"]]
    store = WindStore.build(actuals, forecasts, source="snapshot")
    store.loaded_at = datetime.fromisoformat(raw["fetchedAt"])
    return store


def fetch_live() -> tuple[dict, list]:
    with httpx.Client(headers={"Accept": "application/json"}) as client:
        actuals = elexon.fetch_actuals(client, config.TARGET_FROM, config.TARGET_TO)
        forecasts = elexon.fetch_forecasts(client, config.PUBLISH_FROM, config.PUBLISH_TO)
    return actuals, forecasts


def save_snapshot(actuals: dict, forecasts: list, path=config.SNAPSHOT_FILE) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "actuals": [[int(t.timestamp()), g] for t, g in sorted(actuals.items())],
        "forecasts": [[int(p.timestamp()), int(t.timestamp()), g] for p, t, g in sorted(forecasts)],
    }
    with gzip.open(path, "wt", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"))


def load_store() -> WindStore:
    if config.DATA_SOURCE == "live":
        try:
            actuals, forecasts = fetch_live()
            return WindStore.build(actuals, forecasts, source="live")
        except httpx.HTTPError:
            log.exception("live fetch failed, falling back to bundled snapshot")
    return load_snapshot()
