"""Error metrics. error = forecast - actual, so positive means wind was over-forecast."""
import math
from statistics import fmean


def quantile(sorted_vals: list[float], q: float) -> float:
    """Linear-interpolated quantile, same as numpy's default."""
    if not sorted_vals:
        return math.nan
    pos = (len(sorted_vals) - 1) * q
    lo, hi = math.floor(pos), math.ceil(pos)
    if lo == hi:
        return sorted_vals[lo]
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (pos - lo)


_KEYS = ["n", "mae", "rmse", "bias", "nmae", "r2", "p50AbsError", "p90AbsError", "p99AbsError",
         "maxAbsError", "errP10", "errP90", "overForecastShare", "meanActual"]


def summarize(forecasts: list[float], actuals: list[float]) -> dict:
    n = len(forecasts)
    if n == 0:
        return {k: (0 if k == "n" else None) for k in _KEYS}

    errs = [f - a for f, a in zip(forecasts, actuals)]
    abs_errs = sorted(abs(e) for e in errs)
    errs_sorted = sorted(errs)
    mean_actual = fmean(actuals)
    mae = fmean(abs_errs)
    rmse = math.sqrt(fmean(e * e for e in errs))

    # R² vs. a "just predict the mean" baseline
    ss_tot = sum((a - mean_actual) ** 2 for a in actuals)
    r2 = 1 - sum(e * e for e in errs) / ss_tot if ss_tot else math.nan

    return {
        "n": n,
        "mae": mae,
        "rmse": rmse,
        "bias": fmean(errs),
        # MAPE blows up near zero wind, so normalise by mean output instead
        "nmae": mae / mean_actual if mean_actual else math.nan,
        "r2": r2,
        "p50AbsError": quantile(abs_errs, 0.5),
        "p90AbsError": quantile(abs_errs, 0.9),
        "p99AbsError": quantile(abs_errs, 0.99),
        "maxAbsError": abs_errs[-1],
        "errP10": quantile(errs_sorted, 0.1),
        "errP90": quantile(errs_sorted, 0.9),
        "overForecastShare": sum(e > 0 for e in errs) / n,
        "meanActual": mean_actual,
    }


def histogram(values: list[float], bin_width: float) -> list[dict]:
    if not values:
        return []
    lo = math.floor(min(values) / bin_width) * bin_width
    hi = math.ceil(max(values) / bin_width) * bin_width
    nbins = max(1, int(round((hi - lo) / bin_width)))
    counts = [0] * nbins
    for v in values:
        i = min(int((v - lo) // bin_width), nbins - 1)
        counts[i] += 1
    return [{"from": lo + i * bin_width, "to": lo + (i + 1) * bin_width, "count": c} for i, c in enumerate(counts)]


def clean(d):
    """NaN -> None so it serialises as JSON null."""
    if isinstance(d, dict):
        return {k: clean(v) for k, v in d.items()}
    if isinstance(d, list):
        return [clean(v) for v in d]
    if isinstance(d, float) and (math.isnan(d) or math.isinf(d)):
        return None
    return d
