#!/usr/bin/env python3
"""Prepare small generated Astro inputs without rendering a second website."""
import hashlib
import json
import os
import pathlib
import re

from bs4 import BeautifulSoup
from markdown_it import MarkdownIt
from practice_feedback import load_guides, render_feedback
from trainer_content import load_scenarios, render_trainer
from projects_content import project_data, render_projects
from today_content import render_today
from knowledge_content import load_questions, render_knowledge

ROOT = pathlib.Path(__file__).resolve().parents[1]
CONTENT = ROOT / "sales-knowledge-base"
MANIFEST_PATH = ROOT / "src/generated/content-manifest.json"
ASSETS = ROOT / "public/assets"


def write_if_changed(path: pathlib.Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.is_file() and path.read_bytes() == content:
        return
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    try:
        temporary.write_bytes(content)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
entries = manifest["entries"]
questions = load_questions(entries)
write_if_changed(ROOT / "src/generated/projects.html", render_projects(entries).encode("utf-8"))
write_if_changed(ROOT / "src/generated/projects-data.json", json.dumps(project_data(entries),ensure_ascii=False).encode("utf-8"))
write_if_changed(ROOT / "src/generated/knowledge.html", render_knowledge(questions).encode("utf-8"))
write_if_changed(ROOT / "src/generated/today.html", render_today(entries, questions).encode("utf-8"))
guides = load_guides(entries)
scenarios = load_scenarios(entries)
write_if_changed(ROOT / 'src/generated/trainer-pages.json', json.dumps({'index': render_trainer(scenarios), **{s['id']:render_trainer(scenarios,s['id']) for s in scenarios}},ensure_ascii=False).encode('utf-8'))
for script in ('trainer-core.js', 'trainer.js', 'today-core.js', 'today.js', 'knowledge-core.js', 'knowledge.js', 'projects-core.js', 'projects.js'):
    write_if_changed(ASSETS / script, (ROOT / 'src/scripts' / script).read_bytes())
search_index = []
for entry in entries.values():
    raw = (CONTENT / entry["path"]).read_text(encoding="utf-8").split("---", 2)[2]
    raw = re.sub(r"^## (?:\d+\. )?(?:Материалы для углубления|Источники для проверки[^\n]*|Рекомендуемые материалы)[\s\S]*?(?=^## |\Z)", "", raw, flags=re.M)
    text = re.sub(r"\[([^]]+)\]\([^)]*\)", r"\1", raw)
    if entry["id"] in guides:
        text += " " + BeautifulSoup(render_feedback(entry["id"], guides), "html.parser").select_one(".practice-feedback").get_text(" ", strip=True)
    route_kind = {"module": "module", "theory": "lesson", "practice": "practice"}[entry["kind"]]
    search_index.append(
        {
            "id": entry["id"],
            "kind": entry["kind"],
            "level": entry["level"],
            "module": entry["module"],
            "title": entry["title"],
            "url": f"{route_kind}/{entry['id']}/",
        }
        | {"text": text}
    )

library_pages = {
    "glossary": ("Глоссарий продаж", "GLOSSARY.md"),
    "cases": ("Сквозные учебные кейсы", "CASE_LIBRARY.md"),
    "templates": ("Рабочие шаблоны", "TEMPLATE_LIBRARY.md"),
}
for identifier, (title, filename) in library_pages.items():
    raw = (CONTENT / filename).read_text(encoding="utf-8")
    parts = raw.split("---", 2)
    if len(parts) != 3:
        raise SystemExit(f"Missing library metadata: {filename}")
    body = parts[2]
    text = re.sub(r"\[([^]]+)\]\([^)]*\)", r"\1", body)
    search_index.append(
        {"id": identifier, "kind": "library", "level": "extra", "module": "extra", "title": title, "url": f"library/{identifier}/", "text": text}
    )

final_project_text = re.sub(
    r"\[([^]]+)\]\([^)]*\)",
    r"\1",
    (CONTENT / "FINAL_PROJECT.md").read_text(encoding="utf-8"),
)
search_index.append(
    {"id": "FINAL_PROJECT", "kind": "final_project", "level": "extra", "module": "extra", "title": "От первого клиента до сделки", "url": "final-project/", "text": final_project_text}
)
for source in manifest["sources"]:
    source_text = " ".join(
        part for part in (source["id"], source["title"], source.get("author", ""), source.get("description", ""), source.get("type", "")) if part
    )
    search_index.append(
        {"id": source["id"], "kind": "source", "level": "extra", "module": "extra", "title": source["title"], "url": f"source/{source['id']}/", "text": source_text}
    )

final_markdown = (CONTENT / "FINAL_PROJECT.md").read_text(encoding="utf-8")
final_html = MarkdownIt("default", {"html": False}).enable("table").render(final_markdown)
final_soup = BeautifulSoup(final_html, "html.parser")
if final_soup.h1:
    final_soup.h1.decompose()
for table in final_soup.select("table"):
    table.wrap(
        final_soup.new_tag(
            "div",
            attrs={
                "class": "table-wrap",
                "role": "group",
                "tabindex": "0",
                "aria-label": "Широкая таблица. Используйте горизонтальную прокрутку, чтобы увидеть все столбцы.",
            },
        )
    )
write_if_changed(
    ROOT / "src/generated/final-project.html",
    str(final_soup).encode("utf-8"),
)

write_if_changed(ROOT / 'src/generated/practice-feedback.json', json.dumps({id: render_feedback(id, guides) for id, entry in entries.items() if entry['kind'] == 'practice'} | {'FINAL_PROJECT': render_feedback('FINAL_PROJECT', guides)}, ensure_ascii=False).encode('utf-8'))
write_if_changed(ASSETS / 'practice-feedback.js', (ROOT / 'src/scripts/practice-feedback.js').read_bytes())

app_js = (ROOT / "src/scripts/app.js").read_bytes()
user_store_js = (ROOT / "src/scripts/user-store.js").read_bytes()
app_css = (ROOT / "src/styles/app.css").read_bytes()
client_index = (ROOT / "src/generated/client-index.json").read_bytes()
for name, content in (
    ("user-store.js", user_store_js),
    ("app.js", app_js),
    ("app.css", app_css),
    ("client-index.json", client_index),
    ("search-index.json", json.dumps(search_index, ensure_ascii=False, separators=(",", ":")).encode("utf-8")),
):
    write_if_changed(ASSETS / name, content)

route_kinds = {"module": "module", "theory": "lesson", "practice": "practice"}
urls = {
    "",
    "roadmap/",
    "practice/",
    "sources/",
    "search/",
    "bookmarks/",
    "final-project/",
    "library/",
    "editorial-review/",
    "settings/",
    "assets/app.js",
    "assets/practice-feedback.js",
    "assets/user-store.js",
    "assets/app.css",
    "assets/client-index.json",
    "assets/search-index.json",
    "assets/offline-files.json",
    "manifest.webmanifest",
}
for asset_root in (ASSETS / "brand", ASSETS / "fonts"):
    if asset_root.is_dir():
        urls.update(
            path.relative_to(ROOT / "public").as_posix()
            for path in asset_root.rglob("*")
            if path.is_file()
        )
legacy_favicon = ASSETS / "favicon.svg"
old_favicon = b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#000"/><text x="8" y="45" font-family="Arial,sans-serif" font-size="30" font-weight="bold" fill="white">S/</text></svg>'
if legacy_favicon.is_file() and legacy_favicon.read_bytes() == old_favicon:
    legacy_favicon.unlink()
urls.update(f"level/{stage['id']}/" for stage in manifest["stages"])
urls.update(['projects/', 'assets/projects-core.js', 'assets/projects.js', 'review/check/', 'assets/knowledge-core.js', 'assets/knowledge.js', 'today/', 'assets/today-core.js', 'assets/today.js', 'trainer/', 'assets/trainer-core.js', 'assets/trainer.js', *(f'trainer/{s["id"]}/' for s in scenarios)])
urls.update(f"source/{source['id']}/" for source in manifest["sources"])
urls.update(f"library/{identifier}/" for identifier in library_pages)
urls.update(
    f"{route_kinds[entry['kind']]}/{identifier}/"
    for identifier, entry in entries.items()
)
for public_file in (ROOT / "public").rglob("*"):
    if public_file.is_file() and public_file.name != "sw.js":
        urls.add(public_file.relative_to(ROOT / "public").as_posix())

app_manifest = {
    "name": "Sales OS — база знаний по продажам",
    "short_name": "Sales OS",
    "lang": "ru",
    "start_url": "./",
    "display": "standalone",
    "background_color": "#ffffff",
    "theme_color": "#000000",
    "icons": [
        {
            "src": "assets/brand/app-icon-192.png",
            "sizes": "192x192",
            "type": "image/png",
            "purpose": "any",
        },
        {
            "src": "assets/brand/app-icon-512.png",
            "sizes": "512x512",
            "type": "image/png",
            "purpose": "any",
        },
        {
            "src": "assets/brand/app-icon-512-maskable.png",
            "sizes": "512x512",
            "type": "image/png",
            "purpose": "maskable",
        },
    ],
}
write_if_changed(
    ROOT / "public/manifest.webmanifest",
    json.dumps(app_manifest, ensure_ascii=False).encode("utf-8"),
)
write_if_changed(ROOT / "public/sw.js", (ROOT / "scripts/service-worker.js").read_bytes())

# Development routes are rendered on demand, so estimate their bytes from the
# source Markdown and fingerprint all source inputs that shape the app.
search_index_bytes = json.dumps(search_index, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
fingerprint_paths = [path for path in CONTENT.rglob("*") if path.is_file()]
fingerprint_paths += [
    MANIFEST_PATH,
    ROOT / "src/generated/client-index.json",
    ROOT / "src/scripts/app.js",
    ROOT / "src/scripts/user-store.js",
    ROOT / "src/styles/app.css",
]
fingerprint_paths += [path for path in (ROOT / "public").rglob("*") if path.is_file() and path.name != "offline-files.json"]
fingerprint = hashlib.sha256()
for input_path in sorted(set(fingerprint_paths), key=lambda item: item.relative_to(ROOT).as_posix()):
    fingerprint.update(input_path.relative_to(ROOT).as_posix().encode("utf-8") + b"\0")
    fingerprint.update(input_path.read_bytes() + b"\0")
fingerprint.update(search_index_bytes)
version = fingerprint.hexdigest()[:12]

resource_sizes = {}
for entry in entries.values():
    route_kind = route_kinds[entry["kind"]]
    resource_sizes[f"{route_kind}/{entry['id']}/"] = (CONTENT / entry["path"]).stat().st_size
for source in manifest["sources"]:
    resource_sizes[f"source/{source['id']}/"] = len(
        (source["title"] + source.get("description", "") + source.get("author", "") + source.get("type", "")).encode("utf-8")
    )
for identifier, (_, filename) in library_pages.items():
    resource_sizes[f"library/{identifier}/"] = (CONTENT / filename).stat().st_size
resource_sizes["final-project/"] = (CONTENT / "FINAL_PROJECT.md").stat().st_size
for url in urls:
    public_path = ROOT / "public" / url
    if public_path.is_file():
        resource_sizes[url] = public_path.stat().st_size
modules = [
    {"id": entry["module"], "title": entry["title"], "url": f"module/{entry['id']}/"}
    for entry in entries.values() if entry["kind"] == "module"
]
resources = [
    {"url": url, "bytes": resource_sizes.get(url, 0)}
    for url in sorted(urls) if url != "sw.js"
]
offline_manifest = {
    "schemaVersion": 2,
    "version": version,
    "estimatedBytes": sum(resource["bytes"] for resource in resources),
    "modules": modules,
    "resources": resources,
    "urls": [resource["url"] for resource in resources],
}
write_if_changed(
    ASSETS / "offline-files.json",
    json.dumps(offline_manifest, ensure_ascii=False, separators=(",", ":")).encode("utf-8"),
)
print(
    f"PASS: prepared {len(search_index)} full-corpus search records, "
    f"{len(resources)} development offline URLs, {len(modules)} modules, and final-project article"
)
