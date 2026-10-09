#!/usr/bin/env python3
"""Validate routes, links, semantics, and indexed documents in a built site."""
import argparse
import json
import pathlib
import re
from urllib.parse import urlparse

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
scenarios = json.loads((ROOT / "sales-knowledge-base/trainer-scenarios.json").read_text(encoding="utf-8"))["scenarios"]
expected.update({"trainer/index.html", *(f"trainer/{s['id']}/index.html" for s in scenarios)})
expected.update(
    {
        "index.html",
        "404.html",
        "roadmap/index.html",
        "practice/index.html",
        "review/index.html",
        "today/index.html",
        "sources/index.html",
        "search/index.html",
        "bookmarks/index.html",
        "final-project/index.html",
        "library/index.html",
        "library/glossary/index.html",
        "library/cases/index.html",
        "library/templates/index.html",
        "editorial-review/index.html",
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
    primary_headings = soup.select("main h1")
    if len(primary_headings) != 1:
        issues.append(f"Expected one primary heading in {name}: {len(primary_headings)}")
    description = soup.select_one('meta[name="description"]')
    if not description or len(description.get("content", "").strip()) < 30:
        issues.append("Missing meaningful meta description " + name)
    if not soup.select_one('meta[property="og:title"]') or not soup.select_one(
        'meta[property="og:description"]'
    ):
        issues.append("Missing Open Graph title/description " + name)
    robots = soup.select_one('meta[name="robots"]')
    private_utility = name == "404.html" or name.split("/", 1)[0] in {
        "settings",
        "today",
        "bookmarks",
        "review",
        "search",
    }
    expected_robots = "noindex, nofollow" if private_utility else "index, follow"
    if not robots or robots.get("content") != expected_robots:
        issues.append("Incorrect robots directive " + name)
    canonical = soup.select_one('link[rel="canonical"]')
    og_url = soup.select_one('meta[property="og:url"]')
    route = "/" if name == "index.html" else "/" + name.removesuffix("index.html")
    if private_utility:
        if canonical or og_url:
            issues.append("Private utility route must omit canonical and og:url " + name)
    else:
        if not canonical:
            issues.append("Missing canonical URL " + name)
        else:
            canonical_href = canonical.get("href", "")
            parsed_canonical = urlparse(canonical_href)
            if parsed_canonical.scheme not in {"http", "https"} or not parsed_canonical.netloc:
                issues.append("Canonical URL must be absolute " + name)
            if re.search(r"(?:^|\.)(?:localhost|127\.0\.0\.1)(?::|$)", parsed_canonical.netloc):
                issues.append("Canonical URL points to a local development host " + name)
            if parsed_canonical.path != route:
                issues.append(f"Canonical path mismatch in {name}: {parsed_canonical.path} != {route}")
        if not og_url or (canonical and og_url.get("content") != canonical.get("href")):
            issues.append("Open Graph URL must match the public canonical URL " + name)
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
sources = manifest.get("sources", [])
expected_search_count = len(entries) + 3 + 1 + len(sources)
if len(page_indexes) != expected_search_count:
    issues.append(f"Search count mismatch: {len(page_indexes)}/{expected_search_count}")
search_by_id = {item.get("id"): item for item in page_indexes}
if len(search_by_id) != len(page_indexes):
    issues.append("Search index contains duplicate document IDs")
for item in page_indexes:
    if not all(isinstance(item.get(key), str) and item[key] for key in ("id", "kind", "level", "module", "title", "url")):
        issues.append(f"Search entry has incomplete shared metadata: {item.get('id')}")
        break
    if item["url"].startswith(("/", "\\")) or "\\" in item["url"] or ".." in item["url"].split("/"):
        issues.append(f"Search entry has a non-relative URL: {item['id']} · {item['url']}")
for identifier, entry in entries.items():
    item = search_by_id.get(identifier, {})
    route = {"module": "module", "theory": "lesson", "practice": "practice"}[entry["kind"]]
    if item.get("url") != f"{route}/{identifier}/" or item.get("module") != entry["module"] or item.get("level") != entry["level"] or item.get("kind") != entry["kind"]:
        issues.append(f"Search metadata differs from the course manifest: {identifier}")
        break
extra_search = {item.get("kind") for item in page_indexes if item.get("level") == "extra"}
if not {"final_project", "library", "source"}.issubset(extra_search):
    issues.append("Search index omits the final project, libraries, or source cards")
if search_by_id.get("FINAL_PROJECT", {}).get("url") != "final-project/":
    issues.append("Search index has no link to the final project")
if {item.get("id") for item in page_indexes if item.get("kind") == "source"} != {source["id"] for source in sources}:
    issues.append("Search index does not include every source card")
library_index = {item.get("id"): item for item in page_indexes if item.get("kind") == "library"}
if set(library_index) != {"glossary", "cases", "templates"}:
    issues.append("Search index does not include all three course libraries")
for identifier in library_index:
    library = BeautifulSoup((DIST / "library" / identifier / "index.html").read_text(encoding="utf8"), "html.parser")
    if not library.select_one("article[data-pagefind-body]"):
        issues.append("Library missing searchable body " + identifier)
    if len(library.select("h1")) != 1:
        issues.append("Library must have exactly one h1 " + identifier)
    article = library.select_one("article[data-pagefind-body]")
    if not article or not all(
        f"{name}[data-search-{name}]" in article.get("data-pagefind-filter", "")
        for name in ("level", "module", "kind")
    ):
        issues.append("Library Pagefind filter metadata is missing " + identifier)
for source in sources:
    source_path = DIST / "source" / source["id"] / "index.html"
    if not source_path.is_file():
        issues.append("Source search record has no route " + source["id"])
        continue
    source_page = BeautifulSoup(source_path.read_text(encoding="utf8"), "html.parser")
    source_article = source_page.select_one("article[data-pagefind-body]")
    if not source_article or not all(
        f"{name}[data-search-{name}]" in source_article.get("data-pagefind-filter", "")
        for name in ("level", "module", "kind")
    ):
        issues.append("Source Pagefind filter metadata is missing " + source["id"])
final_project = BeautifulSoup((DIST / "final-project/index.html").read_text(encoding="utf8"), "html.parser")
final_article = final_project.select_one("article[data-pagefind-body]")
if not final_article or not all(
    f"{name}[data-search-{name}]" in final_article.get("data-pagefind-filter", "")
    for name in ("level", "module", "kind")
):
    issues.append("Final project is not tagged in the Pagefind corpus")
if "data-template-copy" not in (DIST / "library/templates/index.html").read_text(encoding="utf8"):
    issues.append("Template library does not expose copy controls")
for document_id, library_id in (("06-002", "templates"), ("08-001", "cases"), ("16-001", "glossary")):
    lesson_path = DIST / "lesson" / document_id / "index.html"
    lesson = BeautifulSoup(lesson_path.read_text(encoding="utf8"), "html.parser")
    if not any(anchor.get("href", "").endswith(f"library/{library_id}/") for anchor in lesson.select(".library-references a[href]")):
        issues.append(f"Missing contextual {library_id} link on {document_id}")

editorial_html = BeautifulSoup((DIST / "editorial-review/index.html").read_text(encoding="utf8"), "html.parser")
if len(editorial_html.select(".editorial-table tbody tr")) != len(entries):
    issues.append("Editorial coverage map does not list every learning document")
if "0 / 430" not in editorial_html.get_text(" ", strip=True):
    issues.append("Editorial coverage map does not show the current review state")

for identifier in [key for key, entry in entries.items() if entry["kind"] == "module"]:
    module_html = BeautifulSoup((DIST / "module" / identifier / "index.html").read_text(encoding="utf8"), "html.parser")
    chapter = module_html.select_one("article.module-reading[data-pagefind-body]")
    if not chapter or not chapter.select_one("h2"):
        issues.append("Module missing its rendered integration chapter " + identifier)
    elif chapter.select_one("h2#порядок-изучения, h2#обязательная-практика"):
        issues.append("Module duplicates its generated lesson/practice navigation " + identifier)

for issue in issues[:40]:
    print("ERROR", issue)
print(
    f"CHECK: {len(html_files)} pages, {len(expected)} expected routes, "
    f"{links} hrefs, {len(page_indexes)} indexed, {len(issues)} issues"
)
if issues:
    raise SystemExit(1)
