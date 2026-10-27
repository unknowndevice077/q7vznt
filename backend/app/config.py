import os
from datetime import datetime, timezone
from pathlib import Path

ELEXON_BASE = "https://data.elexon.co.uk/bmrs/api/v1"

# decisions made in Jan 2026 -> forecasts published in Jan, targets up to ~2 Feb
PUBLISH_FROM = datetime(2026, 1, 1, tzinfo=timezone.utc)
PUBLISH_TO = datetime(2026, 2, 1, tzinfo=timezone.utc)
TARGET_FROM = datetime(2026, 1, 1, tzinfo=timezone.utc)
TARGET_TO = datetime(2026, 2, 3, tzinfo=timezone.utc)

MAX_HORIZON_H = 48

# GB day-ahead auction (N2EX / EPEX) closes 11:00 UK time on D-1
DA_GATE_HOUR = 11

DATA_DIR = Path(os.getenv("DATA_DIR", Path(__file__).resolve().parent.parent / "data"))
SNAPSHOT_FILE = DATA_DIR / "wind_jan2026.json.gz"

# "snapshot" (bundled file) or "live" (fetch from Elexon on startup)
DATA_SOURCE = os.getenv("DATA_SOURCE", "snapshot")

STATIC_DIR = Path(os.environ["STATIC_DIR"]) if os.getenv("STATIC_DIR") else None

CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]
