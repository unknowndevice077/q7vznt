"""Elexon BMRS stream endpoints (FUELHH, WINDFOR)."""
from datetime import datetime, timedelta

import httpx

from . import config


def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_ts(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def fetch_actuals(client: httpx.Client, start: datetime, end: datetime) -> dict[datetime, float]:
    """FUELHH wind outturn, keyed by startTime. Half-hourly."""
    # settlement dates are UK-local days, so pad a day either side and filter by startTime after
    params = {
        "settlementDateFrom": (start - timedelta(days=1)).date().isoformat(),
        "settlementDateTo": (end + timedelta(days=1)).date().isoformat(),
        "fuelType": "WIND",
    }
    r = client.get(f"{config.ELEXON_BASE}/datasets/FUELHH/stream", params=params, timeout=60)
    r.raise_for_status()

    out: dict[datetime, tuple[datetime, float]] = {}
    for row in r.json():
        if row.get("fuelType") != "WIND" or row.get("generation") is None:
            continue
        t = parse_ts(row["startTime"])
        if not (start <= t < end):
            continue
        pub = parse_ts(row["publishTime"])
        # keep the newest value if a period was republished
        if t not in out or pub > out[t][0]:
            out[t] = (pub, float(row["generation"]))
    return {t: v for t, (_, v) in out.items()}


def fetch_forecasts(client: httpx.Client, start: datetime, end: datetime) -> list[tuple[datetime, datetime, float]]:
    """WINDFOR rows as (publishTime, startTime, generation). Hourly targets."""
    rows: list[tuple[datetime, datetime, float]] = []
    # weekly chunks to keep responses small
    cur = start
    while cur < end:
        nxt = min(cur + timedelta(days=7), end)
        params = {"publishDateTimeFrom": _iso(cur), "publishDateTimeTo": _iso(nxt - timedelta(seconds=1))}
        r = client.get(f"{config.ELEXON_BASE}/datasets/WINDFOR/stream", params=params, timeout=60)
        r.raise_for_status()
        for row in r.json():
            if row.get("generation") is None:
                continue
            rows.append((parse_ts(row["publishTime"]), parse_ts(row["startTime"]), float(row["generation"])))
        cur = nxt
    return rows
