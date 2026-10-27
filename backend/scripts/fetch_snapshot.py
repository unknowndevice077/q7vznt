"""Pull Jan 2026 wind data from Elexon and write the bundled snapshot.

    python -m scripts.fetch_snapshot      (run from backend/)
"""
from app import config
from app.store import fetch_live, save_snapshot


def main():
    actuals, forecasts = fetch_live()
    save_snapshot(actuals, forecasts)
    print(f"actuals: {len(actuals)} half-hours, forecasts: {len(forecasts)} rows -> {config.SNAPSHOT_FILE}")


if __name__ == "__main__":
    main()
