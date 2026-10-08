# Архитектура Sales OS

Состояние документа обновлено по baseline 9 октября 2026 года. Целевой путь реализации задаёт `docs/IMPLEMENTATION_ROADMAP.md`; разделы ниже отделяют текущую реализацию от целевого состояния, чтобы промежуточный этап не выдавался за готовую архитектуру.

## Продуктовые границы

Sales OS — статический русскоязычный учебный продукт без собственного backend и учётных записей. Исходные Markdown и устойчивые идентификаторы находятся в `sales-knowledge-base/`. Прогресс, закладки, заметки и ответы сохраняются локально в браузере. Техническая self-review не является сертификацией или независимой редакторской проверкой.

## Текущие исходники и генерация

- `scripts/audit.py` проверяет учебный корпус и формирует `src/generated/content-manifest.json`.
- `scripts/build.py` — автономный Python renderer. Он читает Markdown и manifest и сейчас целиком очищает/генерирует `dist/`.
- `scripts/sync-content.mjs` копирует 430 Markdown-файлов в игнорируемый `src/content/sales/`. Сейчас он также берёт часть production-ассетов и снимок итогового проекта из Python-сгенерированного `dist/`; из-за этой связи Astro build пока зависит от побочного Python build.
- Astro 5 маршруты находятся в `src/pages/`, общая оболочка — `src/layouts/Shell.astro`, общая статья — `src/components/DocView.astro`, токены и layout — `src/styles/app.css`, клиентские сценарии — `src/scripts/app.js`. Основные React-зависимые элементы сведены к `src/components/react/ProgressWidget.tsx`.
- `astro.config.mjs` задаёт static output в `dist/`; после него Pagefind строит индекс, а `scripts/after-build.mjs` формирует offline manifest и service worker.
- На baseline сборка Astro в отдельный `.astro/baseline-dist/` сгенерировала 475 маршрутов. Это подтверждает компиляцию маршрутов, но отдельный запуск не выполнял Pagefind и post-build генерацию.

## Текущий сборочный риск

`npm run build` запускает lifecycle prebuild, который выполняет `prepare:content`: аудит данных, Python build в общий `dist/`, затем синхронизацию Astro-контента/ассетов; после этого Astro может снова очищать и заполнять тот же `dist/`, за ним идут Pagefind и post-build. `predev`, `precheck` и `prelint` также запускают подготовку с Python build. Каталог `dist/` содержит 938 отслеживаемых файлов. Тесты, запускающие эти hooks, могут незаметно переписывать опубликованные артефакты; конкурирующая генерация способна оставить смешанный или устаревший результат.

Текущий `vercel.json` не запускает установку и сборку, а указывает `dist/` как output. Это расходится с желаемым воспроизводимым deploy из исходников. `requirements.txt` не объявляет прямую зависимость Jinja, хотя её импортирует Python renderer. Архитектурные и QA-документы сохраняют формулировки прошлых этапов и постепенно обновляются.

## Целевое состояние после M1

1. Astro является канонической production-сборкой, локальной основной разработкой и источником Vercel Preview/production artifacts.
2. Content preparation генерирует manifest, Astro content и необходимые исходные ассеты, не очищая и не используя production `dist/` как промежуточный input. Финальный проект, поисковый и offline-индекс генерируются из исходных данных/артефактов прямо в Astro output.
3. Python renderer сохраняется как полезная автономная fallback-сборка, пишет в отдельный output и имеет свои тесты. Его запускают явно, без npm lifecycle hooks и без гонки за `dist/`.
4. `npm ci` и `npm run build` дают чистый reproducible output: Astro → Pagefind → offline manifest/worker. Проверки `check` и `lint` не строят сайт и не изменяют tracked artifacts.
5. Vercel получает исходники, устанавливает lockfile и строит Astro artifact; tracked dist не является источником deployment. Windows/Linux CI проверяет кроссплатформенные пути, тесты, браузерные E2E и оба renderer-а.

## Клиентские данные

Сейчас `sales-os-v2` хранит статусы, закладки и last-visited в localStorage; заметки сохраняются в IndexedDB и локальной резервной копии. `sales-os-roadmap-v1` мигрируется через legacy map. Service worker использует network-first и ранее установленный cache fallback; пользователь вручную устанавливает offline package из настроек. M2 должен превратить это в документированный единый transactional storage API, не нарушая v1/v2 import/export и локальную приватность.

## Текущая проверка

Точные команды, результаты и исходные ограничения зафиксированы в `docs/MILESTONE_LOG.md`, раздел «Текущий roadmap». На baseline Astro build в выделенный каталог прошёл, Astro check, статический gate, Windows offline manifest и адаптивный сценарий практики воспроизвели дефекты. Эти факты не следует смешивать со статусом старого плана M0–M11.
