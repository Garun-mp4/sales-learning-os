# Sales OS 2.0 — протокол прохождения milestones (2026-10-08)

**Правило приёмки:** если сборка Astro или обязательный E2E не запускался, milestone не получает PASS независимо от наличия рабочего статического fallback.

| Этап | Статус по исходному плану | Фактически реализовано и проверено | Блокер для PASS |
|---|---|---|---|
| M0 — аудит | **PASS** | 22 модуля, 336 уроков, 72 задания, 408 ключей переноса, все ссылки/ID проверены | Нет |
| M1 — Astro | **BLOCKED** | Подготовлен Astro 5 + React/TS/Tailwind config, Content Collections, маршруты, исходные компоненты | npm EAI_AGAIN; нет установки, `astro check/build` |
| M2 — дизайн и темы | **PARTIAL** | Проверенная CSS-система, три темы, адаптивность, скриншоты в Chromium, исправлен мобильный overflow и добавлено закрытие меню | Нет URL E2E и проверки Geist в реальном production |
| M3 — Markdown | **PARTIAL** | 430 документов на отдельных HTML-страницах через Python; Zod-схема и Astro source существуют | Astro Content Collection не собрана фактически |
| M4 — навигация | **PARTIAL** | Изолированные 22 модуля, sidebar/levels, карта | Не пройден `Back/Forward/direct URL` в E2E |
| M5 — уроки | **PARTIAL** | 336 страниц, оглавления/Markdown, связанные упражнения и источники | Нет полного Astro E2E и визуальных снимков всех разрешений |
| M6 — практика | **PARTIAL** | 72 задания, текстовые ответы и самостоятельная отметка | Нет persist/restore по реальному URL |
| M7 — прогресс | **PARTIAL** | Импорт старого JSON, export/import v2, IndexedDB; исправлено смешивание старых заметок | Полный fixture migration и E2E восстановления не завершены |
| M8 — dashboard/roadmap | **PARTIAL** | Главная и карта 22 модулей, React-статистика в Astro source | Astro React island не проверен реальной сборкой |
| M9 — поиск/источники | **PARTIAL** | JSON поиск fallback проверен в Chromium; Pagefind встроен в Astro-команды; 33 карточки | Pagefind build/search по живому URL не проверен |
| M10 — offline | **PARTIAL** | Canonical cache keys без `index.html`, worker сохраняет предыдущий кэш, пакет включает нужные страницы | Нет реального offline PWA сетевого теста |
| M11 — релиз | **NOT ACCEPTED** | Статический архив, исходники, документация, offline files; аудит 0 структурных ошибок | M1–M10 не все прошли QA-gates |

## Проведённые проверки

- `python scripts/audit.py` — исходная база и ссылки.
- `python scripts/build.py` — автономный статический сайт.
- `python tests/test_static.py` — структуру, маршруты, ссылочную целостность, поисковый индекс.
- `python tests/test_browser_embedded.py` — компонентные сценарии в Chromium (без URL-навигации, с фиктивным localStorage и fetch): тема, статус, закладки, поиск, мобильный sidebar, отсутствие ошибок JavaScript.
- `node --check` для браузерного JS и Node helper scripts.
- `node scripts/validate-astro-source.mjs` — проверка существования файлов (не компиляция Astro).

## Чтобы довести M1–M11 до PASS

1. В окружении с доступом к npm установить зависимости и зафиксировать lockfile.
2. Выполнить `npm run check`, `npm run build`, исправить возможные ошибки исходников и повторить.
3. Выполнить Playwright E2E по настоящим страницам; проверить прогресс/импорт/заметки, границы модулей, обе темы.
4. Проверить 390/768/1024/1440 px, клавиатуру, WCAG AA, Geist.
5. Установить офлайн-пакет, выключить сеть и проверить переходы/заметки, обновление кеша.
6. Только после этого установить PASS для соответствующих milestones.

## Дополнительный прогресс (итерация продолжения)

- **M1:** реализован remark-плагин преобразования Markdown-ссылок, добавлены соответствующие unit-тесты. Фактическая сборка Astro по-прежнему **BLOCKED**.
- **M2:** CSS исправлен по итогам 150 измерений (30 маршрутов × 5 ширин), тёмные/светлые CSS-переменные проверены. Для PASS всё ещё требуется реальная production-сборка, загрузка Geist и визуальная приёмка.
- **M3–M5:** добавлена проверка внутренних `.md` ссылок при рендеринге Astro; статические страницы и их внутренние ссылки перепроверены. Не пройдена фактическая компиляция Astro.
- **M7:** проверены импорт v1/v2, отклонение повреждённых резервных копий, экспорт заметок и сохранение прогресса в Chromium DOM; устранена гонка чтения заметок из IndexedDB. Полный origin E2E остаётся заблокирован.
- **M10:** создан симуляционный тест SW (network-first и оба поколения кэша), 483 ссылки офлайн-пакета проверены. Реальный offline/browser E2E ещё не пройден.
- **M11:** QA-скрипты подключены к CI. Итоговый статус по-прежнему **NOT ACCEPTED** до прохождения M1–M10.

## Итерация 4: additional hardening

- M0 остаётся PASS.
- M1: улучшено staging HTML итогового проекта; не может стать PASS без npm и фактической Astro-сборки.
- M2–M9: исправлены логика заметок, импорт/экспорт, безопасность ID, fallback поиск и статическая проверка ссылок; доступные DOM и структурные тесты проходят.
- M10: симуляция офлайн-кэша проходит; реальный network-offline тест заблокирован.
- M11: итоговая приёмка **НЕ ЗАВЕРШЕНА**, см. `docs/ITERATION_4_HANDOFF.md`.

## Текущий roadmap: baseline и выполнение M0–M8

План текущих этапов: `docs/IMPLEMENTATION_ROADMAP.md`. Старые таблицы выше фиксируют состояние первоначальной реализации на 8 октября 2026 года и остаются историей, а не статусом нового roadmap.

### M0 — baseline (PASS, 2026-10-09)

- Исходная точка: ветка `main`, commit `1060a0a`, `origin/main` синхронизирован. Единственные незакоммиченные файлы — предоставленные пользователем исходники `Sales OS Stepped Logo.png` и `faviicon.png`; они сохранены и не включались в команды сборки или коммиты.
- Окружение: Node 22.22.2, npm 10.9.7, Python 3.12.10, Playwright browsers Chromium и WebKit установлены.
- Delivery decision: Astro — канонический production renderer; Python renderer сохраняется отдельно как fallback. `dist/` сейчас содержит 938 tracked files; текущие npm lifecycle hooks запускают Python generator и затем Astro в одном output. Поэтому baseline Astro build проверен только в игнорируемом `.astro/baseline-dist/`, а full build/dev lifecycle будет проверен после разведения выходов в M1.
- Документация M0: `docs/ARCHITECTURE.md` описывает текущую архитектуру, её сборочный риск и целевое состояние после M1.

| Проверка baseline | Результат |
|---|---|
| `npx astro check` | FAIL: 3 ошибки из-за отсутствующих Node types (`process`, `node:path`, `node:fs/promises`), плюс 6 hints |
| `npx astro build --outDir .astro/baseline-dist` | PASS: Astro сгенерировал 475 страниц; Pagefind и post-build в этой изолированной проверке не запускались |
| `npm run test:quality` | FAIL на первом тесте: `test_static.py` ожидает 476 страниц, фактически 475; последующие тесты этим запуском не выполнялись |
| `node tests/test_offline_worker.mjs` | FAIL: offline manifest содержит Windows-путь `dist\\...` вместо URL |
| `node tests/test_remark_links.mjs` | PASS |
| `python tests/test_browser_embedded.py` | PASS: изолированные сценарии; реальные URL и сетевой offline не проверяются этим тестом |
| `python tests/test_user_data_embedded.py` | PASS: существующие backup/migration/persistence сценарии; multi-tab и blocked-storage дефекты покрыты недостаточно |
| `python tests/test_responsive_embedded.py` | FAIL: `/practice/01-P01/` имеет scrollWidth 538 px при viewport 320 и 390 px |
| `python tests/test_final_project_embedded.py` | PASS |
| `node tests/test_astro_source_integrity.mjs` | FAIL при прямом запуске: нет `src/content/sales/...`; тест зависит от отдельной синхронизации Astro content, которая пока не выражена в его setup |
| Полный URL E2E через `npm run test:e2e` | Не запускался в baseline: текущий `predev` сначала генерирует tracked `dist/`; сначала изолировать build hooks в M1 |

Базовый Astro renderer работает, но это не подтверждает full production pipeline. Прямой изолированный build и проверки не меняли tracked `dist/`; рабочая копия по-прежнему содержит только два исходных PNG.

| Новый этап | Статус | Последняя запись |
|---|---|---|
| M0 — baseline и архитектурное решение | **PASS** | 2026-10-09; результаты выше |
| M1 | **IN PROGRESS** | Исходники, сборки и все локальные Windows gates готовы; ожидаются GitHub CI Windows/Linux и Vercel preview |
| M2–M8 | **NOT STARTED** | Начинать по одному этапу после приёмки предыдущего |

### M1 — воспроизводимая сборка и доставка (IN PROGRESS, 2026-10-09)

- Переведён renderer на Astro 7.3.8 / React integration 7.0.1; direct Content Collection читает 430 канонических Markdown-источников без синхронизирующей копии. Критическая Astro image-processing уязвимость устранена обновлением; `npm audit` сообщает 0 уязвимостей.
- Путь Python `--out-dir` ограничен выделенным `dist-fallback/`: регрессионный тест доказывает, что попытка записывать сборку в произвольную папку отклоняется без удаления существующего файла.
- Python fallback выводится отдельно в `dist-fallback/`; build/dev/lint/check подготавливают только необходимые входы. Собранные `dist/`, производные `public/` и временные `src/generated/` удалены из Git index и исключены через `.gitignore`; файлы на диске остаются локальными результатами сборки.
- Добавлены manifest-driven проверки 476 страниц, нормализация offline URL для Windows/POSIX, кастомный 404, Astro Markdown table wrappers, formatting/syntax gates, независимые fallback-проверки и матрица CI Windows/Linux. Исправлена Windows-обёртка verification script: сначала используется доступный `python`, fallback явно выбирает `py -3.12`, так как `py -3` на этом хосте попадает в недоступную 3.14.
- Первый GitHub matrix run подтвердил Linux gate и выявил Windows-only CP1252 decoding в чтении `legacy.json` без encoding. Для всех project Python text reads установлен UTF-8, а подготовка и Python quality checks запускаются с `EncodingWarning` как ошибкой; тот же сценарий теперь воспроизводимо обнаруживается до CI.
- Фактически пройдено в Windows: `npm ci` (420 пакетов, 0 уязвимостей), `npm run lint`, `npm run check` (42 файла, 0 errors/warnings/hints), `npm run build` (476 страниц, Pagefind 408, offline 937), `npm run test:quality` (включая 150 responsive views и storage tests), `npm run test:e2e` (5/5 URL tests), `npm run test:fallback` (статические, browser, data, responsive и worker gates), плюс полный `verify-windows.ps1` (exit 0).
- Параллельный dev/build smoke: `npm run build` завершился при запущенном `astro dev`; урок `/lesson/01-001/` продолжал отвечать HTTP 200. Обновлены устаревшие команды проверки и установка зависимостей.
- Осталось до PASS: отправить ветку с подготовленными изменениями для чистого GitHub CI Windows/Linux и проверить, что веточная Vercel Preview собирается из этого commit. Push в `main` здесь запускает Production deployment и в текущий scope не входит.
