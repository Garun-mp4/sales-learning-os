# M8 production-preview viewport matrix

Captured from the built Astro preview in Chromium on 2026-10-09. The matrix contains 21 representative routes × 5 viewport widths (320, 390, 768, 1024 and 1440 CSS px) × light/dark themes = 210 viewport screenshots, each 900 CSS px high.

The routes cover the original audit matrix plus current library, editorial-review and revisit-queue pages: home, roadmap, level 2, modules 1 and 8, lessons 1 and 14, practice index and practice 18, sources index and source B01, bookmarks, settings, final project, search, library hub, glossary, cases, templates, editorial review and review queue.

The gate asserts HTTP 200 for each route, the selected theme, no horizontal document overflow and no uncaught page errors. Full-page behavior is covered separately by route, content and responsive tests; all 72 practice routes are checked at 320 and 390 px.
