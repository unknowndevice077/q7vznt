"""Forecast vs actual comparisons, error breakdowns and the day-ahead view."""
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from . import config
from .metrics import histogram, quantile, summarize
from .store import WindStore

UK = ZoneInfo("Europe/London")


def compare(store: WindStore, start: datetime, end: datetime, horizon_h: float) -> list[dict]:
    """Actual vs the forecast that was live `horizon_h` hours before each target."""
    rows = []
    for t in store.target_times(start, end):
        hit = store.forecast_at_horizon(t, horizon_h)
        rows.append({
            "time": t,
            "actual": store.actuals[t],
            "forecast": hit.value if hit else None,
            "publishTime": hit.publish_time if hit else None,
            "horizonH": round(hit.horizon_h, 2) if hit else None,
            "error": hit.value - store.actuals[t] if hit else None,
        })
    return rows


def _paired(rows):
    paired = [r for r in rows if r["forecast"] is not None]
    return [r["forecast"] for r in paired], [r["actual"] for r in paired]


def series(store, start, end, horizon_h) -> dict:
    rows = compare(store, start, end, horizon_h)
    f, a = _paired(rows)
    return {
        "horizonH": horizon_h,
        "points": rows,
        # half-hourly actuals for the chart
        "actualsHalfHourly": [{"time": t, "actual": v} for t, v in store.actuals_between(start, end)],
        "metrics": summarize(f, a),
        "missingForecasts": sum(r["forecast"] is None for r in rows),
    }


def by_horizon(store, start, end, horizons=None) -> list[dict]:
    # runs publish at :30 and targets are on the hour, so nothing has a lead of exactly 48h - stop at 47
    horizons = horizons if horizons is not None else range(0, config.MAX_HORIZON_H)
    out = []
    for h in horizons:
        f, a = _paired(compare(store, start, end, h))
        m = summarize(f, a)
        out.append({"horizonH": h, **m})
    return out


def by_hour_of_day(store, start, end, horizon_h) -> list[dict]:
    buckets: dict[int, list] = defaultdict(list)
    for r in compare(store, start, end, horizon_h):
        if r["forecast"] is not None:
            buckets[r["time"].astimezone(UK).hour].append(r)
    out = []
    for hour in range(24):
        rs = buckets.get(hour, [])
        m = summarize([r["forecast"] for r in rs], [r["actual"] for r in rs])
        out.append({"hour": hour, **m})
    return out


def error_distribution(store, start, end, horizon_h, bin_width=250) -> dict:
    errs = [r["error"] for r in compare(store, start, end, horizon_h) if r["error"] is not None]
    return {"horizonH": horizon_h, "binWidth": bin_width, "bins": histogram(errs, bin_width)}


def by_level(store, start, end, horizon_h, step=2500) -> list[dict]:
    """Errors bucketed by forecast level (known at decision time, unlike the actual)."""
    buckets: dict[int, list] = defaultdict(list)
    for r in compare(store, start, end, horizon_h):
        if r["forecast"] is not None:
            buckets[int(r["forecast"] // step)].append(r)
    out = []
    for k in sorted(buckets):
        rs = buckets[k]
        m = summarize([r["forecast"] for r in rs], [r["actual"] for r in rs])
        out.append({"from": k * step, "to": (k + 1) * step, **m})
    return out


def gate_closure(delivery_day: date, gate_hour: int = config.DA_GATE_HOUR) -> datetime:
    """Day-ahead auction gate for delivery day D is D-1 at gate_hour UK local."""
    d1 = delivery_day - timedelta(days=1)
    return datetime.combine(d1, time(gate_hour), tzinfo=UK).astimezone(timezone.utc)


def delivery_window(delivery_day: date) -> tuple[datetime, datetime]:
    # UK-local day, so DST days come out at 23/25h automatically
    s = datetime.combine(delivery_day, time(0), tzinfo=UK).astimezone(timezone.utc)
    e = datetime.combine(delivery_day + timedelta(days=1), time(0), tzinfo=UK).astimezone(timezone.utc)
    return s, e


def _error_pool(store, before: datetime, h_lo: int, h_hi: int) -> list[float]:
    """Errors that had already been *observed* by `before`, for horizons in [h_lo, h_hi]."""
    errs = []
    for h in range(h_lo, h_hi + 1):
        for t in store.target_times(datetime.min.replace(tzinfo=timezone.utc), before):
            hit = store.forecast_at_horizon(t, h)
            if hit:
                errs.append(hit.value - store.actuals[t])
    return errs


def day_ahead(store: WindStore, delivery_day: date, gate_hour: int = config.DA_GATE_HOUR,
              min_samples: int = 200) -> dict:
    gate = gate_closure(delivery_day, gate_hour)
    start, end = delivery_window(delivery_day)
    targets = sorted(t for t in store._pubs if start <= t < end)

    hits = {t: store.forecast_as_of(t, gate) for t in targets}
    horizons = [h.horizon_h for h in hits.values() if h]

    band = None
    if horizons:
        h_lo, h_hi = int(min(horizons)), int(max(horizons)) + 1
        # only errors already observable at the gate
        pool = _error_pool(store, gate, h_lo, h_hi)
        calibration = "out-of-sample"
        if len(pool) < min_samples:
            # first few days of Jan don't have enough history; fall back and say so
            pool = _error_pool(store, datetime.max.replace(tzinfo=timezone.utc), h_lo, h_hi)
            calibration = "in-sample"
        pool.sort()
        band = {
            "errP10": quantile(pool, 0.1),
            "errP50": quantile(pool, 0.5),
            "errP90": quantile(pool, 0.9),
            "samples": len(pool),
            "calibration": calibration,
            "horizonRange": [h_lo, h_hi],
        }

    points = []
    for t in targets:
        hit = hits[t]
        p = {
            "time": t,
            "actual": store.actuals.get(t),
            "forecast": hit.value if hit else None,
            "publishTime": hit.publish_time if hit else None,
            "horizonH": round(hit.horizon_h, 2) if hit else None,
        }
        if hit and band:
            # wind you can count on 90% of the time = forecast minus the P90 over-forecast
            p["p10"] = max(0.0, hit.value - band["errP90"])
            p["p90"] = max(0.0, hit.value - band["errP10"])
        points.append(p)

    with_fc = [p for p in points if p["forecast"] is not None]
    hours = len(with_fc)  # hourly points -> MWh
    summary = {
        "forecastEnergyMWh": sum(p["forecast"] for p in with_fc),
        "p10EnergyMWh": sum(p.get("p10", 0) for p in with_fc) if band else None,
        "p90EnergyMWh": sum(p.get("p90", 0) for p in with_fc) if band else None,
        "hoursCovered": hours,
    }
    scored = [p for p in with_fc if p["actual"] is not None]
    if scored:
        summary["actualEnergyMWh"] = sum(p["actual"] for p in scored)
        summary["metrics"] = summarize([p["forecast"] for p in scored], [p["actual"] for p in scored])
        if band:
            inside = sum(p["p10"] <= p["actual"] <= p["p90"] for p in scored)
            summary["bandHitRate"] = inside / len(scored)

    runs = sorted({h.publish_time for h in hits.values() if h})
    return {
        "deliveryDay": delivery_day.isoformat(),
        "gateClosure": gate,
        "forecastRunsUsed": runs,
        "band": band,
        "points": points,
        "summary": summary,
    }
