#!/usr/bin/env python3
"""Prepare small generated Astro inputs without rendering a second website."""
import hashlib
import json
import os
import pathlib
import re

from bs4 import BeautifulSoup
from markdown_it import MarkdownIt

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
search_index = []
for entry in entries.values():
    raw = (CONTENT / entry["path"]).read_text(encoding="utf-8").split("---", 2)[2]
    text = re.sub(r"\[([^]]+)\]\([^)]*\)", r"\1", raw)
    search_index.append(
        {
            key: entry[key]
            for key in ("id", "kind", "module", "title")
        }
        | {"text": text[:20000]}
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
        {"id": identifier, "kind": "library", "module": "Справочник", "title": title, "text": text[:20000]}
    )

final_markdown = (CONTENT / "FINAL_PROJECT.md").read_text(encoding="utf-8")
final_html = MarkdownIt("default", {"html": False}).enable("table").render(final_markdown)
final_soup = BeautifulSoup(final_html, "html.parser")
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

app_js = (ROOT / "src/scripts/app.js").read_bytes()
user_store_js = (ROOT / "src/scripts/user-store.js").read_bytes()
app_css = (ROOT / "src/styles/app.css").read_bytes()
client_index = (ROOT / "src/generated/client-index.json").read_bytes()
manifest_bytes = MANIFEST_PATH.read_bytes()
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
    "404.html",
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
urls.update(f"source/{source['id']}/" for source in manifest["sources"])
urls.update(f"library/{identifier}/" for identifier in library_pages)
urls.update(
    f"{route_kinds[entry['kind']]}/{identifier}/"
    for identifier, entry in entries.items()
)
search_index_bytes = json.dumps(search_index, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
library_bytes = b"".join((CONTENT / filename).read_bytes() for _, filename in library_pages.values())
version = hashlib.sha256(user_store_js + app_js + manifest_bytes + search_index_bytes + library_bytes).hexdigest()[:12]
write_if_changed(
    ASSETS / "offline-files.json",
    json.dumps({"version": version, "urls": sorted(urls)}, ensure_ascii=False, separators=(",", ":")).encode("utf-8"),
)

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
worker = "self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET'||new URL(r.url).origin!==self.location.origin)return;e.respondWith((async()=>{try{return await fetch(r)}catch{const names=(await caches.keys()).filter(k=>k.startsWith('sales-os-offline-')).reverse();for(const name of names){const hit=await(await caches.open(name)).match(r);if(hit)return hit;}return Response.error()}})())});"
write_if_changed(ROOT / "public/sw.js", worker.encode("utf-8"))
print(
    f"PASS: prepared {len(search_index)} search records, "
    f"{len(urls)} development offline URLs and final-project article"
)
