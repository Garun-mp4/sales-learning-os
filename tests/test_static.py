#!/usr/bin/env python3
"""Validate routes, links, semantics, and indexed documents in a built site."""
import argparse
import json
import pathlib
import re

from bs4 import BeautifulSoup

ROOT = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--site", default="dist", help="Built site directory (default: dist)")
args = parser.parse_args()
DIST = pathlib.Path(args.site)
if not DIST.is_absolute():
    DIST = ROOT / DIST
DIST = DIST.resolve()
if DIST == ROOT or not DIST.is_relative_to(ROOT):
    raise SystemExit(f"Site directory must be inside the project: {DIST}")

manifest = json.loads((ROOT / "src/generated/content-manifest.json").read_text(encoding="utf8"))
entries = manifest["entries"]
issues = []
links = 0
html_files = list(DIST.rglob("*.html"))
route_kinds = {"theory": "lesson", "practice": "practice", "module": "module"}
expected = {f"{route_kinds[entry['kind']]}/{identifier}/index.html" for identifier, entry in entries.items()}
expected.update(
    {
        "index.html",
        "404.html",
        "roadmap/index.html",
        "practice/index.html",
        "sources/index.html",
        "search/index.html",
        "bookmarks/index.html",
        "final-project/index.html",
        "settings/index.html",
        *(f"level/{stage['id']}/index.html" for stage in manifest["stages"]),
        *(f"source/{source['id']}/index.html" for source in manifest["sources"]),
    }
)
actual = {path.relative_to(DIST).as_posix() for path in html_files}
for rel in sorted(expected - actual):
    issues.append("Missing route " + rel)
for rel in sorted(actual - expected):
    issues.append("Unexpected HTML route " + rel)

for path in html_files:
    soup = BeautifulSoup(path.read_text(encoding="utf8"), "html.parser")
    name = path.relative_to(DIST).as_posix()
    root = path.parent
    if not soup.select_one('html[lang="ru"]'):
        issues.append("Missing lang " + name)
    if not soup.select_one("main#main"):
        issues.append("Missing main " + name)
    for anchor in soup.select("a[href]"):
        url = anchor.get("href", "")
        links += 1
        if url.startswith(("http://", "https://", "mailto:", "#")):
            continue
        bare = url.split("#", 1)[0].split("?", 1)[0]
        if not bare:
            continue
        # Resolve root-absolute web links within the selected output directory.
        target = (DIST / bare.lstrip("/")) if bare.startswith("/") else (root / bare)
        target = target.resolve()
        if not target.is_relative_to(DIST):
            issues.append("Escaping href " + name + " " + url)
            continue
        if target.is_dir():
            target = target / "index.html"
        if not target.exists():
            issues.append("Broken href " + name + " " + url)
    for anchor in soup.select('a[href^="#"]'):
        fragment = anchor.get("href")[1:]
        if fragment and not soup.find(id=fragment):
            issues.append("Broken anchor " + name + " " + fragment)
    if name.startswith("lesson/") or re.match(r"^practice/\d{2}-P\d{2}/index.html$", name):
        if not soup.select_one(".article"):
            issues.append("Missing article " + name)
        if not soup.select_one("[data-status-control]"):
            issues.append("Missing status " + name)
        if not soup.select_one("[data-note]"):
            issues.append("Missing notes " + name)
    if name.startswith("module/"):
        module = re.match(r"module/(\d{2})-MODULE/index.html", name)
        if module:
            expected_count = sum(
                entry["module"] == module.group(1) and entry["kind"] != "module"
                for entry in entries.values()
            )
            observed = len(soup.select("main .item"))
            if expected_count != observed:
                issues.append(f"Module leakage/count {name}: {observed}/{expected_count}")

final_project = DIST / "final-project/index.html"
if not final_project.is_file() or 'data-note="FINAL_PROJECT"' not in final_project.read_text(encoding="utf8"):
    issues.append("Missing final project editable notes")
for identifier, entry in entries.items():
    if entry["kind"] == "theory":
        lesson = DIST / "lesson" / identifier / "index.html"
        if lesson.is_file():
            text = BeautifulSoup(lesson.read_text(encoding="utf8"), "html.parser").text
            if "Редакционный черновик" not in text:
                issues.append("Missing editorial label " + identifier)
            if entry["title"] not in text:
                issues.append("Missing title " + identifier)

search_index_path = DIST / "assets/search-index.json"
if not search_index_path.is_file():
    page_indexes = []
    issues.append("Missing search index")
else:
    page_indexes = json.loads(search_index_path.read_text(encoding="utf8"))
if len(page_indexes) != len(entries):
    issues.append(f"Search count mismatch: {len(page_indexes)}/{len(entries)}")

for issue in issues[:40]:
    print("ERROR", issue)
print(
    f"CHECK: {len(html_files)} pages, {len(expected)} expected routes, "
    f"{links} hrefs, {len(page_indexes)} indexed, {len(issues)} issues"
)
if issues:
    raise SystemExit(1)
