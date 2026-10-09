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
| M1 | **PASS** | 2026-10-09; локальные gates, GitHub CI Windows/Linux и Vercel Preview прошли |
| M2 — local-first хранилище | **PASS** | 2026-10-09; локальные gates и GitHub CI Windows/Linux прошли; preview READY |
| M3 — навигация и доступность | **PASS** | 2026-10-09; 21 URL E2E, quality, Astro build/check и Python fallback прошли |
| M4 — визуальная система и бренд | **PASS** | 2026-10-09; build, quality, fallback, 22 E2E, 50 screenshot views и 72 mobile practice routes |
| M5 — учебный путь и редакционная модель | **PASS / M5-CONTENT OPEN** | 2026-10-09; все инженерные gates прошли; независимая проверка 430 материалов не выполнена |
| M6 — полный поиск и надёжный офлайн | **PASS** | 467 единых поисковых материалов; 1 020 URL production-пакета; настоящий Chromium offline install/reload и Pagefind |
| M7 — ответы, повторение и backup center | **PASS** | 2026-10-09; practice editor, revisit queue, backup v3/restore, multi-tab conflicts и production screenshots проверены |
| M8 — итоговый release gate | **IN PROGRESS** | Локальные production gates и Vercel Preview smoke PASS; ручные NVDA/native 200% zoom остаются открыты |

### M1 — воспроизводимая сборка и доставка (PASS, 2026-10-09)

- Переведён renderer на Astro 7.3.8 / React integration 7.0.1; direct Content Collection читает 430 канонических Markdown-источников без синхронизирующей копии. Критическая Astro image-processing уязвимость устранена обновлением; `npm audit` сообщает 0 уязвимостей.
- Путь Python `--out-dir` ограничен выделенным `dist-fallback/`: регрессионный тест доказывает, что попытка записывать сборку в произвольную папку отклоняется без удаления существующего файла.
- Python fallback выводится отдельно в `dist-fallback/`; build/dev/lint/check подготавливают только необходимые входы. Собранные `dist/`, производные `public/` и временные `src/generated/` удалены из Git index и исключены через `.gitignore`; файлы на диске остаются локальными результатами сборки.
- Добавлены manifest-driven проверки 476 страниц, нормализация offline URL для Windows/POSIX, кастомный 404, Astro Markdown table wrappers, formatting/syntax gates, независимые fallback-проверки и матрица CI Windows/Linux. Исправлена Windows-обёртка verification script: сначала используется доступный `python`, fallback явно выбирает `py -3.12`, так как `py -3` на этом хосте попадает в недоступную 3.14.
- Первый GitHub matrix run подтвердил Linux gate и выявил Windows-only CP1252 decoding в чтении `legacy.json` без encoding. Для всех project Python text reads установлен UTF-8, а подготовка и Python quality checks запускаются с `EncodingWarning` как ошибкой; тот же сценарий теперь воспроизводимо обнаруживается до CI.
- Повторный Windows CI выявил, что Windows checkout переводит исходники в CRLF и Prettier ошибочно считает 14 файлов неотформатированными. `.gitattributes` фиксирует LF для текстовых исходников и CRLF для `.bat`/`.ps1`; проверка отдельного checkout с `core.autocrlf=true` прошла.
- Фактически пройдено в Windows: `npm ci` (420 пакетов, 0 уязвимостей), `npm run lint`, `npm run check` (42 файла, 0 errors/warnings/hints), `npm run build` (476 страниц, Pagefind 408, offline 937), `npm run test:quality` (включая 150 responsive views и storage tests), `npm run test:e2e` (5/5 URL tests), `npm run test:fallback` (статические, browser, data, responsive и worker gates), плюс полный `verify-windows.ps1` (exit 0).
- Параллельный dev/build smoke: `npm run build` завершился при запущенном `astro dev`; урок `/lesson/01-001/` продолжал отвечать HTTP 200. Обновлены устаревшие команды проверки и установка зависимостей.
- Первый Vercel Preview build обнаружил PEP 668: системный Python управляется `uv` и не принимает глобальный `pip install`. Vercel теперь создаёт игнорируемый `.venv`, устанавливает туда `requirements.txt` и использует его `python` в build `PATH`.
- GitHub Actions run `37845937407` для `2b2cb12` завершился PASS на Ubuntu и Windows. Vercel Preview для того же commit достиг READY; через защищённый branch alias проверены главная, урок, практика и поиск (HTTP 200), а несуществующий путь показал приложение 404 и HTTP 404. Локальные Windows, remote CI и настоящий Vercel build/HTTP gates пройдены.
- M1 завершён. Push/merge в `main` запускает Production deployment и в текущий scope не входит.

### M2 — local-first хранилище и сохранение (PASS, 2026-10-09)

- Добавлен единый IndexedDB-first слой `src/scripts/user-store.js` (БД `sales-os-personal`, версия 2): отдельные записи состояния и заметок, ревизии заметок и поколение импорта защищают от перезаписи более новых данных устаревшей вкладкой. Старый localStorage и текстовые заметки v1 мигрируются без приоритета над актуальной IndexedDB; при недоступности надёжного хранилища интерфейс явно показывает ограниченный режим.
- Прогресс, статусы, закладки, заметки, темы и экспорт/импорт подключены к слою хранения. Независимые изменения вкладок синхронизируются; одновременное редактирование одной заметки показывает конфликт и сохраняет черновик. Импорт v1/v2 проверяется до замены и выполняется одной транзакцией; quota/abort/закрытие вкладки сохраняют предыдущую базу. Архитектура и границы данных обновлены в README и `docs/ARCHITECTURE.md`.
- Локально пройдены `npm run lint`, `npm run check` (0 errors, 0 warnings, 3 существующих hints `BeforeUnloadEvent.returnValue`), `npm run build` (476 страниц, 408 Pagefind-документов, 938 offline URL), `npm run test:quality`, `npm run test:fallback` и Playwright E2E. Новый сценарий прерывания импорта закрытием вкладки отдельно прошёл локально.
- GitHub Actions run `37850003700` для `756f433` и run `37850409541` для финального M2 commit `17ca14d82f73f3babb882556616ee4f807a2baeb` завершились PASS на Ubuntu и Windows. Второй run содержит полный `test:quality`, URL E2E с регрессией закрытия вкладки и Python fallback.
- Vercel Preview для `17ca14d` достиг `READY` (`sales-learning-25bhofrzs-garun-s-projects.vercel.app`). Защищённый HTTP-smoke для этого deployment не удалось получить: Vercel-интеграция вернула 403 на шаге авторизации к проекту; доступной в окружении команды Vercel CLI нет. Доступ или настройки защиты не менялись. Этот внешний smoke остаётся непроверенным и не маскируется локальными тестами.
- M2 закрыт как инженерный milestone: функциональная матрица выполнена локально и в удалённом CI. Контент остаётся `editorial_draft`; приложение не создаёт облачную синхронизацию и не отправляет пользовательские данные на сервер.

### M3 — навигация, обратная связь и доступность (PASS, 2026-10-09)

- Мобильная навигация реализована как управляемый drawer: закрытое состояние inert/aria-hidden, переход фокуса внутрь, ручной Tab-cycle, Escape, кнопка закрытия, возврат фокуса, блокировка фона и прокрутки. Для desktop проверен последовательный клавиатурный обход skip link и разделов меню; для планшета добавлена видимая tooltip-подпись к иконкам.
- Маршрут определяет верхний активный раздел; урок отмечает родительский пункт модуля, вложенные ссылки используют `aria-current=location`, страницы получили навигационный landmark breadcrumbs. Практика и roadmap показывают вход в итоговый проект с пояснением симуляции.
- Поиск и закладки разделяют live status и область результатов, различают загрузку, ошибку и пустое состояние, предлагают восстановление при сбое; каталог практик объявляет число результатов и позволяет сбросить фильтры после пустой выборки. Общий/модульный прогресс представлен семантическим progressbar. Общая загрузка `client-index.json` дедуплицируется, а ошибка очищает in-flight promise для следующей попытки.
- Полоса прогресса использует transform вместо анимации layout-свойства `width`; реактивный dashboard виджет гидратируется при загрузке и подписан на изменения user store.
- Приёмочные артефакты Playwright CLI: `docs/screenshots/m3-practice-light.png`, `docs/screenshots/m3-drawer-mobile-light.png`, `docs/screenshots/m3-drawer-mobile-dark.png`. Проверен построенный Astro сайт по HTTP, без панели dev-toolbar. 150 embedded responsive views подтвердили отсутствие document-level overflow на пяти ширинах.
- Локально пройдены `npm run lint`, `npm run check` (0 errors, 0 warnings, 3 существующих deprecated hints `BeforeUnloadEvent.returnValue`), `npm run build` (476 страниц, Pagefind 408, offline manifest 938 URL), `npm run test:quality`, `npm run test:fallback` и `npx playwright test` (21/21 Chromium URL E2E).
- Impeccable detector оставил один warning на `border-left` в существующем `.article blockquote`; это стиль цитат учебного текста по текущему visual contract, не side-tab интерфейсной карточки. Других detector findings на затронутых UI-файлах нет.
- Структурная/DOM и keyboard проверка семантики прошла. NVDA walkthrough в Windows, как предусмотрено roadmap, переносится на финальную ручную приёмку M8; поэтому здесь не заявляется проверка реального screen-reader произношения. Учебные документы остаются `editorial_draft` до отдельного M5-CONTENT review.

### M4 — адаптивная Vercel-система и бренд (PASS, 2026-10-09)

- Добавлен воспроизводимый `scripts/prepare_brand_assets.py`: он сохраняет прозрачность и пропорции, обрезает только внешние прозрачные поля полного логотипа, готовит светлые/тёмные варианты, 32px favicons и три PWA-размера. Корневые файлы `Sales OS Stepped Logo.png` и `faviicon.png` включены как неизменённые исходники пользователя. Проверки сравнивают alpha/full assets, разрешения, локальные URL и манифесты.
- Новый знак используется в Astro Shell, компактной навигации, Python fallback и сохранённом legacy source; `legacy-index.html` исключён из обоих production outputs. Chromium поочерёдно переключал `prefers-color-scheme`, разрешал соответствующую favicon-ссылку в документе вкладки и декодировал 32×32 light/dark PNG. Производные brand/font-файлы включены в offline manifest. Geist и Geist Mono Vercel bundling локальны, содержат нужные кириллические glyphs и имеют SIL OFL notice.
- В Astro rehype table renderer добавлены `role=group`, `tabindex=0`, русское accessible name; Python/final-project paths получили те же атрибуты. В обычных build и dev включён `--force` для Astro content cache: проверка выявила, что старый cache иначе отдавал HTML без обновлённых атрибутов после правки плагина.
- Приведены к одной шкале typography/surface/border/focus/motion tokens и проверены контрасты в light/dark; мобильные EntryRow, настройки, header/sidebar, TOC и footer выровнены по контракту. Desktop focus E2E теперь явно проверяет фокусируемую бренд-ссылку между skip link и пунктами меню.
- Снимки реального собранного `astro preview` сохранены в `docs/screenshots/m4-responsive/`: 5 представительных templates × 5 ширин (320/390/768/1024/1440) × 2 темы = 50 скриншотов. Дополнительно embedded Chromium прошёл 150 представительных responsive views и 144 маршрута упражнений на 320/390px без document-level overflow; практика с таблицей сохраняет локальный клавиатурный горизонтальный scroll.
- `npm run lint` PASS. `npm run check` PASS: 45 файлов, 0 errors/warnings, 3 существующих deprecated hints `BeforeUnloadEvent.returnValue` (source и два сгенерированных копирования). `npm run build` PASS: 476 HTML routes, 408 Pagefind documents, 949 offline resources. `npm run test:quality` PASS (brand, static, worker, Markdown, storage, responsive, final-project). `npm run test:e2e` PASS: 22/22 Chromium URL tests. `npm run test:fallback` PASS: отдельная Python-сборка прошла все static, browser, data, responsive, brand и worker проверки.
- Визуально проверены главный экран 320px light, главная 1440px dark, практика 390px light, настройки 390px dark, урок 390px light и практика 1024px dark; полная 50-кадровая матрица доступна в папке выше. Свежая production-like сборка проверена без Astro dev toolbar. Все статические preview routes ответили 200; брендовые ресурсы локальные. NVDA/zoom и deployment по Vercel остаются финальными M8 gates; никакие Production deployment settings не менялись.
- Встроенный Chromium сообщал в dev-server log непадающую ошибку его audit match callback `TypeError: Failed to fetch`; браузерных `pageerror` не было, URL E2E прошёл. Этот внешний fetch связан с dev-проверкой доступности ссылок и не блокирует сборку; проверка соответствующей Vercel Preview остаётся M8.

### M5 — учебный путь и редакционная модель (PASS приложения / OPEN M5-CONTENT, 2026-10-09)

- Реальный текст 22 интегрирующих глав встроен в модульные страницы. Дублирующий список `Порядок изучения`/`Обязательная практика` удалён только для этих глав, а не для отдельных уроков. В маршрут чтения добавлены три существующие библиотеки, тематические ссылки из материалов, поиск по библиотекам и отдельная карта редакционной готовности 430 основных документов.
- Главная теперь различает «Вернуться к последнему материалу» и «Продолжить программу». Второй маршрут ведёт к первому незавершённому обязательному уроку/практике, затем к следующему модулю и итоговому проекту; продвинутые материалы остаются доступны без блокировки.
- Идемпотентная миграция `scripts/enrich_course_materials_m5.py` убрала повторяющиеся блоки проверки из всех 336 уроков. Цели, вопросы и подсказки теперь связаны с заголовком и самопроверкой урока. Рубрики 72 практик содержат индивидуальные критерии по цели, артефакту и условию, а также отличающиеся сильный/слабый ориентиры; реальный пример не подставляет внешние факты. Все документы остались `editorial_draft`.
- Добавлен `sales-knowledge-base/editorial-review-ledger.json` и регламент `sales-knowledge-base/EDITORIAL_REVIEW_WORKFLOW.md`. Валидатор сверяет запись тезиса со стабильным ID документа и первичным каталогом источников, проверяет даты/scope/рецензента/охват, профильное подтверждение права и правил платформ. Страница `/editorial-review/` различает источники из списка рекомендаций и фактически пройденные записи. Реестр пуст: 0/430 документов имеют полную независимую проверку; gate M5-CONTENT остаётся открытым.
- Тест `tests/test_m5_content.py` проверяет 336 уникальных целей/вопросов/подсказок, 72 уникальные предметные рубрики, отсутствие автоматической смены статуса и нулевой diff у повторного запуска миграции. URL E2E покрывает маршрут урок → практика → следующий модуль → итоговый проект, прямой доступ к advanced-контенту, контекст справочников, fallback-поиск и копирование шаблона.
- `npm run lint` PASS; `npm run check` PASS (50 файлов, 0 ошибок/предупреждений, 3 прежних `BeforeUnloadEvent.returnValue` hints); `npm run build` PASS (481 страниц, 433 Pagefind, 982 Astro offline resources); `npm run test:quality` PASS; `npm run test:e2e` PASS (25/25); `npm run test:fallback` PASS (481 страниц, 433 JSON search records, 500 offline resources). Статический Astro check: 481 ожидаемый маршрут, 34 534 внутренних ссылок, 0 проблем.
- Снимки реального production-like `astro preview` сохранены в [docs/screenshots/m5-learning/](screenshots/m5-learning/): home, module, practice, library hub, template library и editorial review × 320/390/768/1024/1440 × light/dark = 60 кадров; дополнительно зафиксированы раскрытые мобильные состояния рубрики и редакционной таблицы. Каждая страница основной матрицы ответила HTTP 200, не создала browser pageerror и не имела document-level overflow. Impeccable detector отметил семантический `blockquote` border и оба семейства Geist; они сохранены как заданные цитатный паттерн и обязательные Vercel-шрифты по `DESIGN-vercel.md`.
- Dev-server периодически логировал нефатальный `TypeError: Failed to fetch` внутри Astro audit callback; Playwright не получил browser `pageerror`, все URL тесты прошли. Реальная ручная NVDA и Vercel Preview остаются release gates M8.

### M6 — полный поиск и надёжный офлайн (PASS, 2026-10-09)

- Установлен единый индекс из 467 записей: 430 уроков/упражнений/модулей, 3 существующих библиотеки, итоговый проект и все 33 карточки источников. В каждой записи согласованы `id`, `kind`, `level`, `module`, `title`, полный текст и канонический маршрут. Astro Pagefind и JSON fallback используют одну классификацию; production browser test подтвердил фильтрацию по уровню, модулю и типу.
- Страница `/search/` получила фильтры уровня/модуля/типа и явное согласие на локальный поиск заметок/закладок. Частные запросы и тексты не записываются в URL; поиска личных данных нет до включения переключателя. При ошибке Pagefind после инициализации управление переключается на JSON fallback; недоступный индекс показывает ошибку и действие повтора, не маскируясь пустой выдачей.
- Service worker выделен в общий `scripts/service-worker.js`. Он отдаёт кэшированные файлы только из app-кэшей с подтверждённым marker полной установки, игнорирует незавершённый кэш, уважает installer fetch, сохраняет настоящий HTTP 404 и переходит к offline-ответу при сетевой ошибке. Установщик возобновляет пропущенные ресурсы, умеет отмену, не выдаёт неполный пакет за готовый, удаляет старые пакеты после успешной установки и очищает только префикс Sales OS.
- Offline manifest schema 2 перечисляет относительные веб-пути `/`, точные production-размеры и 22 модульных маршрута. Post-build fingerprint рассчитывается от всех реально созданных HTML/CSS/JS/контента/Pagefind/manifest и worker-файлов, исключая только сам манифест во избежание рекурсии. Dev manifest не выдаёт build-only `404.html` за доступный dev URL; Python fallback независимо enumerates собственный output.
- `/settings/` показывает размер пакета, свободную квоту браузера, версию, состав, прогресс, историю результата, недоступные ресурсы и действия установки/обновления/повтора/отмены/очистки. Полный package browser test установил все 1 020 production-ресурсов, проверил ready marker, отключил сеть, открыл урок, сохранил заметку и выполнил публичный и личный поиск после reload. Дополнительно E2E проверил частичный сбой, retry, обновление версии, отмену и quota.
- `npm run lint` PASS. `npm run check` PASS: 53 файла, 0 errors, 0 warnings, 3 hints на существующий deprecated `BeforeUnloadEvent.returnValue`. `npm run build` PASS: 481 HTML-страница, 467 Pagefind-документов, 3 фильтра и 1 020 offline resources (27 276 401 bytes по последней собранной версии). `npm run test:quality` PASS; статический маршрутный gate — 481/481, 34 534 ссылки, 0 issues. `npm run test:fallback` PASS: Python build, 467 search records, 500 offline URLs и все static/browser/data/responsive/worker gates. `npm run test:e2e` PASS: 31 passed, 3 production-only tests skipped на dev origin; production acceptance `npm run test:preview` PASS: 3/3, включая полный пакет и Pagefind.
- Production-preview снимки search/settings охватывают 2 шаблона × 5 ширин (320/390/768/1024/1440) × light/dark = 20 кадров в `docs/screenshots/m6-search-offline/`; вся матрица прошла проверку document overflow. Визуально просмотрены узкий light search, узкие/широкие dark settings и широкий dark search.
- Ограничения: `npm run check` сохраняет три старых deprecated hints. Встроенные Chromium E2E иногда вызывают диагностический, но нефатальный Astro audit callback `Failed to fetch`; browser pageerror нет. Ручная NVDA, keyboard-only walkthrough, zoom 200% и финальная Vercel Preview остаются M8. M5-CONTENT остаётся OPEN (0/430 независимых полных рецензий).

### M7 — завершённые практические инструменты (PASS, 2026-10-09)

- Все 72 страницы практики получили редактируемые ответы, индивидуальные критерии самопроверки, сохранение черновика и историю попыток. Самопроверка остаётся личной отметкой: интерфейс не начисляет баллы и не выдаёт внешнюю аттестацию. Rubric data считывается из канонических Markdown-источников и проверена для всех практик.
- `/review/` показывает due/upcoming элементы с вопросом активного воспроизведения; пользователь может отложить, отметить просмотренным или удалить запись. Нет streaks, игровых баллов и ложного давления. Состояние хранится в едином user store.
- Настройки содержат локальный backup center: preview импорта, merge/replace, сведения о последнем экспорте, восстанавливаемые точки до replace/import и явные границы локальности. Экспорт создаёт `sales-os-v3`; импортер продолжает принимать `sales-os-roadmap-v1` и `sales-os-v2`. Merging дедуплицирует попытки, сохраняет конфликтующие заметки отдельными частями, а replace остаётся восстанавливаемым.
- IndexedDB schema v3 добавила хранилище restore points; новый формат local snapshot миграции сохраняет v2, текущее состояние пользователя и прежние backup форматы совместимы. Проверены draft conflict между вкладками, reload, export/import, restore/replace, storage quota и отказ постоянного хранилища.
- Production screenshots практики и очереди повтора: 20 кадров в `docs/screenshots/m7-practice-data/`. `npm run test:m7` проверяет rubric mapping всех 72 практик; URL E2E сценарии подтверждают сохранение ответов, revisit queue, конфликт двух вкладок и merge/restore резервной копии.
- M7 завершён поверх единого store; исходные учебные материалы и их ID массово не изменялись. Учебный курс остаётся `editorial_draft` до отдельной экспертизы.

### M8 — сквозная приёмка и готовность релиза (IN PROGRESS; локальные и удалённые Preview gates PASS, 2026-10-09)

- Удалён React island dashboard главной и больше неиспользуемые React runtime/dev dependencies. `ProgressWidget.astro` отдаёт семантический статический markup; `src/scripts/app.js` поддерживает реактивность через vanilla-JS/store subscriptions. E2E поймал и зафиксировал локальное обновление состояния при прямом `replaceAll`; повторная проверка прогресса прошла.
- Последний production build на Windows: 482 HTML routes, Pagefind 467 страниц/3 фильтра, offline manifest 1 018 ресурсов (28 776 336 bytes), fingerprint `f841687f9e4b`. Все текущие home requests обходятся без React JS chunks и без полного `search-index.json`; production browser gate не обнаружил uncaught `pageerror`. В dev E2E отдельно встречался нефатальный `Failed to fetch` внутри Astro audit callback без ошибки страницы.
- Удалены повторы H1 в Markdown-rendered lesson/final-project routes для Astro и Python fallback через проверяемый remark plugin и подготовку fallback markup; исходные Markdown не менялись. Static gate прошёл 482/482 маршрута, 35 051 Astro-внутреннюю ссылку, 467 индексируемых документов и 0 проблем. Production URL sweep вернул HTTP 200 и ровно один H1 для всех 482 маршрутов, включая 404 HTML.
- Добавлены осмысленные description/Open Graph/Twitter метаданные, `noindex` и отсутствие canonical на settings/bookmarks/review/search и 404. В авторизованном Preview обнаружено отсутствие canonical и `og:url` из-за localhost fallback Astro `site`; production origin теперь по умолчанию `https://sl-os.vercel.app`, fallback builder добавляет согласованные canonical/og:url на публичные страницы. Статические и production E2E gates проверяют абсолютные URL, совпадение Open Graph, маршрут и исключение личных страниц.
- Production screenshot matrix хранит 210 viewport frames в `docs/screenshots/m8-release/`: 21 representative route × 320/390/768/1024/1440 × light/dark. HTTP 200, выбранная тема, нулевой document overflow и нулевой pageerror подтверждены. Все 72 практики дополнительно прошли 144 responsive views на 320/390 px; layout reflow ширины 640 CSS px прошёл на home/practice/review/settings как автоматический эквивалент 200% от 1280 px.
- Для embedded browser suites исправлена замена CSS в HTML fixture: она теперь работает при обоих порядках атрибутов `<link rel="stylesheet">`. Это устранило ложноположительный responsive smoke, который на Python fallback раньше проверял страницу без CSS. `npm run test:fallback` после этого прошёл вместе со static/data/responsive/service-worker проверками.
- На этой итерации локально пройдены `npm run lint`, `npm run check` (60 файлов, 0 errors/warnings, 3 прежних deprecated hints), `npm run build`, `npm run test:quality`, `npm run test:e2e` (39 passed; 6 preview-only tests skipped на dev origin), `npm run test:fallback` и полный production-preview набор `npm run test:preview` — **10/10** при явно запущенном Astro production preview. Сборка содержит 482 HTML routes, 467 Pagefind документов/3 фильтра и 1 018 offline resources.
- Production preview установил все ресурсы offline manifest, проверил Pagefind, lesson reload и приватную заметку после отключения сети. Utility indexing rules, metadata, домашние transfer requests и 200%-equivalent reflow прошли. Home Chromium same-origin `transferSize`: 459 196 bytes; `DOMContentLoaded`: 118 ms; `load`: 133 ms в последнем локальном запуске — это одно локальное preview measurement, не Lighthouse, не CDN-compressed measurement и не результат реального устройства. До удаления React старые generated client/react/widget JS files занимали 222 816 raw bytes суммарно; эти React chunks теперь не запрашиваются.
- `verify-windows.ps1` получил опциональный `SALES_OS_PREVIEW_URL`/`-RequirePreview` gate. README, migration/architecture/design/QA/roadmap документы обновлены.
- Vercel Preview для коммита `2da6af0602d96e31c4a6eb42cb2aa03f5f5e8a31` (deployment `sales-learning-99wdbp9v6-garun-s-projects.vercel.app`) достиг `READY`. Подключённый авторизованный браузер открыл 15 маршрутов, включая 4 личных раздела: все вернули страницу с ровно одним H1, description и без browser errors; публичные canonical/og:url совпадают с production origin и pathname, личные маршруты имеют `noindex, nofollow` и не содержат этих URL. API detail endpoints Vercel всё ещё отвечают 403, но для read-only browser smoke доступ к проекту достаточен; protection и production settings не менялись.
- **Оставшиеся обязательные проверки M8:** `Get-Command NVDA` и стандартные папки установки не обнаружили доступный screen reader, поэтому NVDA speech не проверена; browser-native zoom 200% и увеличение системного текста также остаются открытыми. Автоматический reflow на 640 CSS px не заменяет эти проверки.
- Независимый контентный gate остаётся **M5-CONTENT OPEN, 0/430** полных проверок. Production deployment не выполнялся.
