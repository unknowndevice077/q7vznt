from datetime import datetime, timedelta, timezone

import pytest

from app.store import WindStore

T0 = datetime(2026, 1, 10, 12, tzinfo=timezone.utc)
h = lambda n: timedelta(hours=n)  # noqa: E731


@pytest.fixture
def store():
    forecasts = [
        (T0 - h(50), T0, 1000.0),  # too old (>48h)
        (T0 - h(30), T0, 2000.0),
        (T0 - h(10), T0, 3000.0),
        (T0 - h(2), T0, 4000.0),
        (T0 + h(1), T0, 9999.0),  # published after target -> dropped
    ]
    return WindStore.build({T0: 3500.0}, forecasts)


@pytest.mark.parametrize("horizon,expected", [
    (0, 4000.0),   # newest one wins
    (2, 4000.0),   # exactly on the boundary is allowed
    (3, 3000.0),
    (10, 3000.0),
    (11, 2000.0),
    (30, 2000.0),
    (31, None),    # only the 50h-old one is left, which is outside the 48h window
])
def test_forecast_at_horizon(store, horizon, expected):
    hit = store.forecast_at_horizon(T0, horizon)
    assert (hit.value if hit else None) == expected


def test_horizon_reported_is_real_lead_time(store):
    hit = store.forecast_at_horizon(T0, 5)
    assert hit.horizon_h == 10


def test_forecast_after_target_is_ignored(store):
    assert store.forecast_as_of(T0, T0 + h(5)).value == 4000.0


def test_unknown_target():
    assert WindStore.build({}, []).forecast_at_horizon(T0, 1) is None


def test_republished_same_run_keeps_last_value():
    s = WindStore.build({}, [(T0 - h(3), T0, 1.0), (T0 - h(3), T0, 2.0)])
    assert s.forecast_at_horizon(T0, 0).value == 2.0


def test_target_times_need_an_actual():
    s = WindStore.build({T0: 1.0}, [(T0 - h(3), T0, 1.0), (T0 - h(3), T0 + h(1), 1.0)])
    assert s.target_times(T0 - h(1), T0 + h(5)) == [T0]
