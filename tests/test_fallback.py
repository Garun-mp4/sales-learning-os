"""Run the same static and embedded-browser gates against Python fallback output."""
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
environment = os.environ.copy()
environment["SALES_OS_SITE_DIR"] = str(ROOT / "dist-fallback")
strict_python = [
    sys.executable,
    "-X",
    "warn_default_encoding",
    "-W",
    "error::EncodingWarning",
]

test_results = ROOT / "test-results"
test_results.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(prefix="build-output-guard-", dir=test_results) as temporary:
    protected = Path(temporary) / "preserve.txt"
    protected.write_text("user files must be preserved", encoding="utf-8")
    rejected = subprocess.run(
        [sys.executable, "scripts/build.py", "--out-dir", temporary],
        cwd=ROOT,
        env=environment,
        capture_output=True,
        text=True,
    )
    assert rejected.returncode != 0, "Fallback builder must reject arbitrary output directories"
    assert protected.read_text(encoding="utf-8") == "user files must be preserved"
print("PASS: fallback builder refuses an arbitrary output directory without deleting its files")

commands = [
    [*strict_python, "tests/test_m5_content.py"],
    [*strict_python, "tests/test_brand_assets.py", "--site", "dist-fallback"],
    [*strict_python, "tests/test_static.py", "--site", "dist-fallback"],
    [*strict_python, "tests/test_browser_embedded.py"],
    [*strict_python, "tests/test_user_data_embedded.py"],
    [*strict_python, "tests/test_responsive_embedded.py"],
    [*strict_python, "tests/test_final_project_embedded.py"],
    ["node", "tests/test_offline_worker.mjs", "dist-fallback"],
]
for command in commands:
    print("+", " ".join(command), flush=True)
    subprocess.run(command, cwd=ROOT, env=environment, check=True)
print("PASS: Python fallback output passed all static, browser, data, responsive and worker checks")
