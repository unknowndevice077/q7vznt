import math

import pytest

from app.metrics import clean, histogram, quantile, summarize


def test_summarize_basic():
    m = summarize([110, 90, 100, 120], [100, 100, 100, 100])
    assert m["n"] == 4
    assert m["mae"] == pytest.approx(10)
    assert m["bias"] == pytest.approx(5)
    assert m["rmse"] == pytest.approx(math.sqrt((100 + 100 + 0 + 400) / 4))
    assert m["maxAbsError"] == 20
    assert m["overForecastShare"] == 0.5
    assert m["nmae"] == pytest.approx(0.1)


def test_summarize_empty_keeps_shape():
    m = summarize([], [])
    assert m["n"] == 0 and m["mae"] is None and "rmse" in m


def test_perfect_forecast_r2_is_one():
    assert summarize([1, 2, 3], [1, 2, 3])["r2"] == pytest.approx(1)


def test_quantile_matches_numpy_linear():
    vals = [1, 2, 3, 4]
    assert quantile(vals, 0.5) == 2.5
    assert quantile(vals, 0.0) == 1
    assert quantile(vals, 1.0) == 4
    assert quantile(vals, 0.1) == pytest.approx(1.3)


def test_histogram_counts_everything():
    vals = [-260, -10, 0, 10, 240, 251, 999]
    bins = histogram(vals, 250)
    assert sum(b["count"] for b in bins) == len(vals)
    assert bins[0]["from"] == -500


def test_clean_nan():
    assert clean({"a": float("nan"), "b": [1.0, float("inf")]}) == {"a": None, "b": [1.0, None]}
