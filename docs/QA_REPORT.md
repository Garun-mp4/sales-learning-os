# QA report

## Текущая проверка (2026-10-09)

Milestone M1 прошёл приёмку 2026-10-09. Полный Windows `verify-windows.ps1` завершился exit 0: чистый `npm ci`, lint, Astro check (42 файла, 0 diagnostics), production build (476 маршрутов, 408 страниц в Pagefind, 937 offline URLs), quality suite, URL Playwright E2E (5/5) и Python fallback suite. GitHub Actions run `37845937407` прошёл на Ubuntu и Windows. Vercel Preview из commit `2b2cb12` достиг READY; protected HTTP smoke подтвердил главную, урок, практику и поиск (200), а пользовательскую 404-страницу (404). В первом preview была найдена и устранена несовместимость глобального `pip install` с PEP 668 через отдельное `.venv`. Параллельный dev/build smoke и `npm audit` (0 уязвимостей) также прошли.

Выполненные M1 изменения и доказательства приведены в `docs/MILESTONE_LOG.md`. Следующий этап реализации — M2. Технические тесты не являются фактологической рецензией учебного корпуса; все материалы пока остаются `editorial_draft`.

Следующие результаты ниже — архивная запись предыдущей проверки от 2026-10-08. Их статусы не описывают текущее состояние после M1.

---

# Архивный QA report — 2026-10-08

## Verified

- Source inventory: **22 modules, 336 lessons, 72 practices, 446 Markdown files**.
- Offline Python output: **475 index.html routes + 404 = 476 HTML pages**.
- `tests/test_static.py`: **430 primary documents, 26,433 link elements, 0 link/structure issues**.
- Offline route manifest: 483 URLs, canonical routes (e.g. `lesson/01-001/`), no `.../index.html` cache keys.
- Chromium in-memory component smoke: theme select, status, bookmarks, JSON search, mobile menu, 390px no horizontal overflow, 22 roadmap cards — passed without JS exceptions.
- Screenshots: `docs/screenshots/` (light roadmap, dark lesson, mobile module).
- Scripts `scripts/after-build.mjs`, `scripts/sync-content.mjs`, `src/scripts/app.js`: Node syntax checked.

## Not verified — blockers

- No npm install: `registry.npmjs.org` DNS returns `EAI_AGAIN`.
- No `astro check`, `astro build`, `npm run preview`, `pagefind --site dist`; Astro source is uncompiled.
- Chromium normal localhost navigation returns `ERR_BLOCKED_BY_ADMINISTRATOR`. In-memory `page.set_content` checks are **not URL E2E**.
- No real network-disabled PWA test or HTTP-based persistence test.
- No independent fact-check of 336 educational articles or full review of video transcripts.
- Geist font files not packaged; CSS uses declared font family with fallback.

## Fixes since the previous project archive

1. Mobile topbar no longer causes horizontal overflow at 390 px.
2. Mobile sidebar can be closed with a visible, accessible close button, shade or Escape.
3. Backup includes localStorage note changes; replacing progress with an import clears previously stored notes first.
4. Offline-packet URL keys correspond to canonical user routes and worker retains old pack on upgrade.
5. Astro source scaffold with content schema and real Markdown routes added (compilation blocked).
6. Pagefind search integration added with previous JSON index fallback.
7. Added Playwright e2e specifications for execution in an unrestricted environment.

**Release status:** static preview is usable; **NOT fully accepted under M0–M11**. Milestones must remain pending until independent gates pass.

## Продолжение проверки и исправлений (2026-10-08, следующая итерация)

### Проверено дополнительно

- **150 HTML-рендеров в Chromium:** 30 маршрутов × ширины 320, 390, 768, 1024, 1440 px. После CSS-исправлений не выявлено горизонтальной прокрутки страницы.
- **Темы:** вычисленные CSS-токены светлой и тёмной палитры подтверждены в Chromium (`#fff/#000`, `#000/#fafafa`, контрастный цвет ссылки).
- **Импорт/экспорт прогресса:** сохранение и восстановление статуса урока, заметок и закладок; миграция v1→v2; экспорт с заметками; отклонение повреждённых ID/статусов/заметок до изменения текущего прогресса.
- **Асинхронная инициализация заметок:** тест с задержкой IndexedDB подтвердил, что текст пользователя не перезаписывается после загрузки старого значения.
- **Service Worker:** отдельный Node VM-тест проверил same-origin GET, режим network-first, использование актуального и предыдущего кэшей и недоступные ресурсы; манифест из 483 канонических URL сверён с файловой системой.
- **Astro Markdown-ссылки:** добавлен remark-плагин, преобразующий относительные `.md` пути в `/lesson/{id}/`, `/practice/{id}/`, `/module/{id}/`; отдельно протестирован без npm.
- **Статическая сборка:** 22 модуля, 336 уроков, 72 практики, 476 HTML-файлов (включая 404), 430 документов в поиске, ссылки валидны.

### Исправления

1. Узкий экран 320 px: устранено переполнение в списках уроков, селектах практики и заголовках уровней.
2. Прогресс v2: добавлена проверка перечислимых статусов, ID уроков и практик, состава закладок и заметок перед импортом.
3. Импортируемые заметки больше не дублируются внутри сохранённого JSON состояния; восстановление старых заметок осуществляется отдельно.
4. Взаимодействие с `localStorage` использует стандартные `Storage.length`/`Storage.key()` для совместимости браузеров.
5. При восстановлении заметок обработчики пользовательского ввода навешиваются **до** асинхронного чтения IndexedDB.
6. GitHub Actions устанавливает Python Playwright/Chromium, запускает новое качество QA; путь браузера выбирается без привязки к `/usr/bin/chromium`.

### Ограничения, которые всё ещё не позволяют поставить финальный PASS

- Реальный `npm install`, `astro check`, `astro build`, Astro/React hydration, Pagefind в production **не запускались**: `registry.npmjs.org` по-прежнему отвечает `EAI_AGAIN`.
- Прямая браузерная навигация на `127.0.0.1` заблокирована (`ERR_BLOCKED_BY_ADMINISTRATOR`). Статические HTTP-проверки и `page.set_content` не заменяют E2E на URL.
- Offline SW-поведение проверено симуляцией, но не сценариями отключения сети в настоящем браузере с зарегистрированным SW.
- Шрифты Geist не поставляются в архиве; их фактическое отображение в production не подтверждено.
- Статус учебных материалов остаётся `editorial_draft`, независимой академической экспертизы не проводилось.

**Вывод:** качество статического прототипа улучшено и проверено, однако закрывать M1–M11 как PASS нельзя до установки Astro и полного браузерного прогона в обычном окружении.


# Sales OS 2.0 — аудит продолжения (итерация 4)

Дата: 2026-10-08.

## Исправления

1. **Итоговый проект:** заметки с ID `FINAL_PROJECT` теперь валидируются и восстанавливаются при импорте v2. Ранее экспорт мог содержать заметку, но обратный импорт отклонял её.
2. **Astro final-project:** HTML статьи теперь подготавливается в `src/generated/final-project.html` во время `prepare:content`, а не читается из удаляемого при Astro build `dist/final-project/index.html`. Исправлена также прежняя ошибочная попытка поиска `<article>`: Python-сборка генерирует `<div class="article" data-pagefind-body>`.
3. **Безопасность резервных копий:** идентификаторы уроков, закладок и заметок проверяются как собственные свойства индекса; имена `constructor` и другие унаследованные свойства отклоняются.
4. **Статический тест:** проверка HTML практических заданий теперь выполняется (исправлено регулярное выражение) и допускает root-relative ссылки Astro (`/lesson/...`) помимо относительных ссылок Python-сборки.
5. **Поиск:** в JSON-резервном поиске большие учебные статьи нормализуются один раз при загрузке, а не при каждом вводе символа.
6. **Целостность коллекции:** новый проверочный скрипт сравнивает SHA-256 всех 430 Markdown-копий Astro с исходниками и контролирует подготовку итогового проекта за пределами `dist/`.

## Пройденные тесты в текущем окружении

- Аудит: 22 модуля / 336 уроков / 72 задания / 33 записи источников / 408 ключей миграции.
- Python-сборка: 476 HTML (включая 404), 430 основных документов, 26 433 ссылочных элемента, ошибок структуры 0.
- Совпадение 430 копий Markdown с исходниками; HTML итогового проекта подготовлен отдельно.
- Реальные компоненты в изолированном Chromium: темы, статусы, закладки, резервный поиск, открытие мобильного меню, обработчики пользовательских данных.
- Импорт/экспорт v1 и v2, заметки урока, практика, итоговый проект; отклонение некорректных идентификаторов и защита от гонки IndexedDB.
- 150 вариантов адаптивной вёрстки: 30 страниц × 320/390/768/1024/1440 px, переполнений страницы 0.
- Симуляция service worker и проверка 483 URL офлайн-манифеста.
- AST-синтаксис TypeScript фронтматтера `.astro` и TS/TSX просмотрен локальным TypeScript-парсером (не `astro check`).

## Оставшиеся обязательные критерии — НЕ ЗАКРЫТЫ

- `npm install`, `npm run check`, `npm run build`: npm registry недоступен по DNS (`EAI_AGAIN`); невозможно подтвердить сборку и реальный runtime Astro/React/Pagefind.
- Полноценные браузерные E2E по `localhost`: Chromium блокирует URL-навигацию (`ERR_BLOCKED_BY_ADMINISTRATOR`). DOM-симуляция не равна реальной URL-навигации.
- Реальный PWA тест с отключённой сетью и проверкой скачанного офлайн-кэша не выполнен.
- Реальная загрузка Geist и полная дизайн-приёмка не подтверждены; файлы шрифтов в архив не включены.
- Образовательный контент имеет статус `editorial_draft`; независимая редакторская и фактологическая оценка не проведена.

**Релизный статус:** работающий и расширенно проверенный статический fallback; Astro проект и M1–M11 ещё не прошли полную приёмку. На Windows с доступом к npm нужно запустить `verify-windows.ps1` и исправить любые обнаруженные сборкой или E2E проблемы. Нельзя сообщать статус полного PASS заранее.

Сборочный контроль CI: `prelint` запускает `prepare:content`, чтобы проверка 430 Markdown-копий корректно работала и в чистом Git checkout.
