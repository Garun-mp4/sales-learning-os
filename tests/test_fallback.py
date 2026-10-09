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

fallback = ROOT / "dist-fallback"
review_page = (fallback / "review/index.html").read_text(encoding="utf-8")
assert 'data-review-queue' in review_page
assert 'data-review-due-list' in review_page and 'data-review-upcoming-list' in review_page
assert 'data-highlight-reviews' in review_page
assert 'assets/highlights.js' in review_page
catalog_page = (fallback / "highlights/index.html").read_text(encoding="utf-8")
assert 'name="robots" content="noindex, nofollow"' in catalog_page
assert 'data-highlight-catalog' in catalog_page and 'assets/highlights.js' in catalog_page
lesson_page = (fallback / "lesson/01-001/index.html").read_text(encoding="utf-8")
assert 'article class="article" data-annotation-content' in lesson_page
assert 'data-highlight-workspace' in lesson_page
practice_page = (fallback / "practice/01-P01/index.html").read_text(encoding="utf-8")
article_start = practice_page.index('data-annotation-content')
article_end = practice_page.index('</article>', article_start)
answer_start = practice_page.index('data-practice-answer="criterion-1"')
assert article_end < answer_start, "Practice answers must stay outside annotation content"
for asset in ("highlights-core.js", "highlights.js"):
    assert (fallback / "assets" / asset).is_file(), f"Missing fallback asset {asset}"
settings_page = (fallback / "settings/index.html").read_text(encoding="utf-8")
for selector in (
    'data-backup-last-export',
    'data-restore-points',
    'data-import-dialog',
    'data-import-merge',
    'data-import-replace',
    'data-restore-dialog',
    'data-restore-confirm',
):
    assert selector in settings_page, f"Fallback settings missing {selector}"
manifest = __import__("json").loads((ROOT / "src/generated/content-manifest.json").read_text(encoding="utf-8"))
practice_entries = [entry for entry in manifest["entries"].values() if entry["kind"] == "practice"]
assert len(practice_entries) == 72
for entry in practice_entries:
    document = fallback / "practice" / entry["id"] / "index.html"
    markup = document.read_text(encoding="utf-8")
    assert f'data-practice-form="{entry["id"]}"' in markup, f"Missing practice form for {entry['id']}"
    assert markup.count('data-practice-criterion="criterion-') == 5, f"Incorrect rubric in {entry['id']}"
    assert f'data-revisit-add="{entry["id"]}"' in markup, f"Missing revisit action for {entry['id']}"
print("PASS: Python fallback output passed all static, browser, data, responsive and worker checks")
