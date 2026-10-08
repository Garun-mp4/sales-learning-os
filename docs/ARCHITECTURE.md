# Архитектура рабочей статической реализации

`Markdown` → `scripts/audit.py` (YAML и связи) → `src/generated/content-manifest.json` → `scripts/build.py` (markdown-it-py, HTML escape, безопасная обработка ссылок) → `dist/` (многостраничный сайт).

Браузерный JS работает с неизменными ID, а не позиционными индексами. Для компактного прогресса — localStorage (`sales-os-v2`), заметок — IndexedDB с локальной аварийной копией. Настройки темы — `sales-os-theme`. Этапы v1 отображаются через `legacyMap` без интерпретации старой галочки как аттестации.

Маршруты: `/`, `/roadmap/`, `/level/{1..4}/`, `/module/{ID}/`, `/lesson/{ID}/`, `/practice/{ID}/`, `/practice/`, `/search/`, `/sources/`, `/source/{ID}/`, `/bookmarks/`, `/settings/`, `/final-project/`.

Статический сайт не содержит серверных API. Служебный worker обеспечивает сетевой fallback на ранее закэшированные ресурсы; пользователь вручную загружает offline pack на странице настроек.

**Отклонение от плана:** пока нет Astro Content Collections, React islands, Tailwind 4, Pagefind. Для перехода на них потребуется отдельная работа со сборкой и тестированием.
