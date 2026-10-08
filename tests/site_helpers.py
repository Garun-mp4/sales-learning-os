"""Common build output selection for embedded browser integration tests."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = Path(os.environ.get("SALES_OS_SITE_DIR", ROOT / "dist"))
if not SITE.is_absolute():
    SITE = ROOT / SITE
SITE = SITE.resolve()
if SITE == ROOT or not SITE.is_relative_to(ROOT):
    raise RuntimeError(f"Site directory must be inside the project: {SITE}")
