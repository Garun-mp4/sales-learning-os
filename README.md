# Sales OS 2.0 — roadmap и база знаний по продажам

Интерактивная обучающая платформа для продаж **через переписку**. 4 уровня, 22 модуля, 336 уроков, 72 практических задания. Оригинальные 446 Markdown-файлов хранятся в `sales-knowledge-base/` неизменёнными. Сайт не отправляет данные пользователя на собственный сервер.

## Статус реализации

- **Проверенная автономная сборка** — папка `dist/`, созданная Python-генератором. Работает через локальный HTTP-сервер без Node.js.
- **Исходники целевого Astro 5 + TypeScript + React + Tailwind CSS 4 + Pagefind** — `astro.config.mjs`, `package.json`, `src/pages/`, `src/layouts/`, `src/content.config.ts`. Исходники подготовлены, но **не прошли `npm run build` в данной среде**, потому что `registry.npmjs.org` недоступен по DNS (`EAI_AGAIN`). Это важное ограничение: нельзя считать M1–M11 полностью принятыми.
- **Браузерные component-smoke тесты** прошли в изолированном Chromium-контексте с встроенным HTML. Настоящий Playwright E2E по URL и сетевой offline-тест не выполнены: навигацию к localhost блокирует администратор среды (`ERR_BLOCKED_BY_ADMINISTRATOR`).
- **Учебные тексты** помечены `editorial_draft`: инженерная сборка не означает содержательной научной рецензии материалов.

Полные результаты: `docs/QA_REPORT.md` и `docs/MILESTONE_LOG.md`.

## Самый простой запуск — уже проверенная статическая версия

На Windows из папки проекта:

```powershell
cd dist
py -m http.server 8000
```

Откройте http://localhost:8000. Python нужен только для HTTP-сервера, не для работы сайта. Поиск, прогресс, заметки, закладки, темы работают в браузере. Не открывайте страницы двойным кликом по `file://`: поисковый индекс и service worker требуют HTTP(S).

Также есть файл `start.bat`.

## Основной Astro-проект (проверить в обычной сети)

Требуется Node.js 22+ и Python 3.12+ с pip:

```powershell
py -m pip install -r requirements.txt
npm install
npm run dev
```

Откройте http://localhost:4321. Для production:

```powershell
npm run check
npm run lint
npm run test
npm run build
npm run preview
npm run test:e2e
```

`npm run build` вызывает `scripts/audit.py` и `scripts/build.py`, переносит Markdown во временную Content Collection `src/content/sales/`, собирает Astro, запускает Pagefind и формирует актуальный офлайн-манифест. `src/content/sales/` — генерируемая копия, исходные материалы находятся в `sales-knowledge-base/`.

**Примечание:** lockfile не создан, поскольку в среде не удаётся получить метаданные пакетов npm. После первой установки сохраните `package-lock.json` и в CI используйте `npm ci`. Проверка Astro TypeScript и запуск E2E остаются обязательным QA-gate перед финальным релизом.

### Размещение

После успешного `npm run build` опубликуйте папку `dist/` на Vercel/Netlify/Cloudflare Pages или другом статическом хостинге. В `astro.config.mjs` укажите настоящую `site` через переменную `SITE_URL` при необходимости. Сайту не нужен backend.

## Архитектура

| Папка | Назначение |
|---|---|
| `sales-knowledge-base/` | Неизменённые Markdown-источники, 446 файлов |
| `src/content.config.ts` | Astro Content Collection, проверяемая Zod-схема |
| `src/pages/` | Главная, roadmap, модули, уроки, практика, источники, настройки |
| `src/layouts/Shell.astro` | Общая оболочка и sidebar |
| `src/components/` | Карточки, ссылки, страницы чтения, React-статистика |
| `src/styles/app.css` | Дизайн-токены, обе темы и адаптивность |
| `src/scripts/app.js` | Local-first прогресс, IndexedDB, заметки, поиск, офлайн |
| `scripts/build.py` | Проверенная резервная статическая сборка |
| `scripts/sync-content.mjs` | Копирование исходного Markdown/ассетов в Astro |
| `scripts/after-build.mjs` | Офлайн-манифест с реальными маршрутами и service worker |
| `tests/` | Статические тесты, браузерные компонентные тесты и E2E для Astro |
| `dist/` | На момент поставки: готовая Python-сборка (Astro build не запускался) |

## Прогресс и защита данных

Все пользовательские записи сохраняются локально. Формат бэкапа: `sales-os-v2`; поддерживается импорт старого `sales-os-roadmap-v1`. Изучение теории и выполнение практики учитываются отдельно. Статус «освоено» — самооценка, а не сертификация.

## Дизайн

Оформление основано на `DESIGN-vercel.md`: 12-шаговые нейтральные поверхности, светлая/тёмная/системная темы, 240px sidebar, границы вместо теней, сдержанные акценты, focus-ring и reduced motion. Гарнитуры Geist/Geist Mono указаны в CSS в приоритете; **файлы шрифтов не включены**, поэтому при отсутствии гарнитуры используются fallback-шрифты. Это нужно дополнительно проверить на финальном хостинге.

## Известные ограничения

- Установка Astro/npm и production сборка не подтверждены в текущей среде; исходники Astro требуют реального `npm install`, `astro check`, `astro build` и устранения возможных ошибок.
- Полноценные браузерные URL E2E, визуальная регрессия тем на всех разрешениях и сетевой тест PWA требуют отдельного запуска в окружении без ограничений администратора браузера.
- Исходные книги, ссылки и обучающие утверждения не прошли независимую редакционную экспертизу.
- Автоматическая облачная синхронизация и AI-проверка заданий намеренно не реализованы — они не входили в MVP.

## Дополнительные тесты (итерация продолжения)

После установки Python-зависимостей для разработки и Node.js-зависимостей:

```powershell
py -m pip install -r requirements-dev.txt
npm install
npm run build
npm run test:quality
npm run test:e2e
```

`npm run test:quality` выполняет статическую проверку ссылок и страниц, тесты офлайн-манифеста/worker, проверку переписывания Markdown-ссылок и изолированные Chromium-сценарии по прогрессу, импорту/экспорту и адаптивной вёрстке. Тесты не подменяют реальный Playwright E2E через URL.

При недоступном npm можно проверить уже собранную статическую версию так:

```powershell
py -m pip install -r requirements-dev.txt
py scripts/audit.py
py scripts/build.py
py tests/test_static.py
py tests/test_browser_embedded.py
py tests/test_user_data_embedded.py
py tests/test_responsive_embedded.py
node tests/test_offline_worker.mjs
node tests/test_remark_links.mjs
```

Основные новые исправления и остающиеся ограничения см. в `docs/QA_REPORT.md` и `docs/MILESTONE_LOG.md`.

### Полная локальная приёмка на Windows

Если в этой среде недоступны npm и localhost, после распаковки проекта на обычном Windows ПК можно выполнить:

```powershell
powershell -ExecutionPolicy Bypass -File .\verify-windows.ps1
```

Скрипт проверяет наличие Node.js 22+ и Python 3.12+, устанавливает зависимости, выполняет `lint`, Astro `check/build`, дополнительные статические/Chromium проверки и настоящий Playwright E2E. При первой ошибке останавливается; протокол сохраняется в `docs/LOCAL_QA_LOG.txt`. **Наличие скрипта не означает, что эти команды уже прошли проверку на данном ПК.**

## Обновление 2.1.1 — итерация 4

Выполнены исправления резервного копирования итогового проекта, совместимости генерации Astro с очисткой `dist/`, валидации ID, ускорения резервного поиска и CI-проверки абсолютных ссылок. Новый тест проверяет равенство 430 Markdown-источников копиям Astro.

Подробный статус и оставшиеся неподтверждённые тесты — `docs/ITERATION_4_HANDOFF.md`.

Сборочный контроль CI: `prelint` запускает `prepare:content`, чтобы проверка 430 Markdown-копий корректно работала и в чистом Git checkout.
