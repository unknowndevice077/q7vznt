"""API tests against the bundled snapshot."""
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


def test_meta(client):
    r = client.get("/api/meta").json()
    assert r["source"] == "snapshot"
    assert r["forecastRuns"] > 200
    assert r["publishFrom"].startswith("2026-01-01")


def test_series_respects_horizon(client):
    r = client.get("/api/series", params={"start": "2026-01-10T00:00:00Z", "end": "2026-01-12T00:00:00Z", "horizon": 12})
    body = r.json()
    assert r.status_code == 200
    assert len(body["points"]) == 48
    for p in body["points"]:
        if p["forecast"] is None:
            continue
        lead = (datetime.fromisoformat(p["time"]) - datetime.fromisoformat(p["publishTime"])).total_seconds() / 3600
        assert 12 <= lead <= 48
    assert body["metrics"]["n"] > 0


def test_series_rejects_bad_horizon(client):
    assert client.get("/api/series", params={"horizon": 72}).status_code == 422


def test_series_rejects_inverted_window(client):
    r = client.get("/api/series", params={"start": "2026-01-12T00:00:00Z", "end": "2026-01-10T00:00:00Z"})
    assert r.status_code == 400


def test_error_grows_with_horizon(client):
    rows = {r["horizonH"]: r for r in client.get("/api/accuracy/horizon").json()}
    assert rows[1]["mae"] < rows[24]["mae"] < rows[40]["mae"]


def test_hour_of_day_has_24_buckets(client):
    assert len(client.get("/api/accuracy/hour").json()) == 24


def test_day_ahead_uses_only_forecasts_before_gate(client):
    body = client.get("/api/day-ahead", params={"day": "2026-01-15"}).json()
    gate = datetime.fromisoformat(body["gateClosure"])
    assert gate.isoformat() == "2026-01-14T11:00:00+00:00"
    assert len(body["points"]) == 24
    for run in body["forecastRunsUsed"]:
        assert datetime.fromisoformat(run) <= gate
    assert body["band"]["calibration"] == "out-of-sample"
    p = body["points"][12]
    assert 0 <= p["p10"] <= p["p90"]


def test_day_ahead_out_of_range(client):
    assert client.get("/api/day-ahead", params={"day": "2026-03-01"}).status_code == 400
