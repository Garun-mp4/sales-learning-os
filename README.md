# Sales OS — платформа обучения продажам

Русскоязычная статическая платформа для самостоятельного обучения продажам через переписку: 4 уровня, 22 модуля, 336 уроков и 72 практических задания. У сайта нет собственного backend или учётных записей; заметки, ответы, закладки и прогресс хранятся в браузере пользователя.

Учебные тексты имеют статус редакционных черновиков. Инженерные тесты подтверждают работу приложения, но не означают независимую экспертную проверку содержания.

## Запуск для разработки

Требуются Node.js 22.12+ и Python 3.12+.

```powershell
py -m pip install -r requirements-dev.txt
npm ci
npm run dev
```

`npm run dev` проверяет manifest, генерирует необходимые runtime-индексы и принудительно обновляет Astro Content Collection. `npm run build` также пересобирает content cache без использования старого обработанного Markdown. Astro читает исходники напрямую из `sales-knowledge-base/`; резервный Python site renderer не запускается как побочный этап разработки или основной production-сборки.

## Сборка и проверки

```powershell
npm run lint
npm run check
npm run build
npm run test:quality
npm run test:e2e
npm run test:fallback
```

Основной production renderer — Astro 7.3.8. Сборка создаёт `dist/`, затем Pagefind и post-build формируют поисковый индекс, offline manifest и service worker. `dist/` — игнорируемый результат сборки, не источник истины и не файл для коммита. `npm run test:fallback` отдельно собирает и проверяет Python-версию в `dist-fallback/`.

Публичный поиск охватывает все основные материалы курса, итоговый проект, три библиотеки и карточки источников; фильтры работают по уровню, модулю и типу. Поиск по личным заметкам и закладкам запускается только отдельным переключателем и выполняется в браузере. В настройках можно установить весь production offline-пакет, увидеть его версию, примерный размер, состав модулей и состояние установки; фактическая доступность без сети подтверждается только после успешной установки.

CI запускает чистую установку `npm ci` и проверки на Windows и Linux, включая оба renderer-а и URL-based Playwright E2E.

Production-only проверки настоящего Pagefind и полного офлайн-пакета запускаются на собранном preview. В первом терминале выполните `npm run build`, затем `npm run preview -- --host 127.0.0.1`. Во втором:

```powershell
$env:PLAYWRIGHT_BASE_URL = "http://127.0.0.1:4321"
npm run test:preview
```

## Автономная Python-версия

Python-версия пригодна для локального статического размещения и не требует Node.js:

```powershell
py -m pip install -r requirements.txt
py scripts/audit.py
py scripts/build.py --out-dir dist-fallback
py -m http.server 8000 --directory dist-fallback
```

Откройте http://localhost:8000. На Windows можно использовать `start.bat` после установки Python-зависимостей. Не открывайте сайт через `file://`: поиск и service worker требуют HTTP(S) или localhost.

## Размещение

Vercel устанавливает npm-зависимости из `package-lock.json`, создаёт изолированное Python-окружение `.venv` для `requirements.txt`, запускает `npm run build` с этим окружением в `PATH` и публикует `dist/`. Так сборка не пытается менять системный Python. Для preview или другого статического хостинга используйте готовый `dist/`. Сайту не требуется backend.

## Архитектура

| Путь | Назначение |
|---|---|
| `sales-knowledge-base/` | Исходные Markdown и библиотека материалов |
| `sales-knowledge-base/editorial-review-ledger.json` | Проверки тезисов с источником, датой, охватом, рецензентом и статусом |
| `sales-knowledge-base/EDITORIAL_REVIEW_WORKFLOW.md` | Правила редакторской проверки и перехода материала в `verified` |
| `src/generated/content-manifest.json` | Проверенный manifest маршрутов и корпуса |
| `src/content.config.ts` | Zod-схема Astro Content Collection |
| `src/pages/` | Маршруты приложения и страниц курса, включая 404 |
| `src/layouts/Shell.astro` | Общая оболочка и навигация |
| `src/components/` | Повторно используемые компоненты курса |
| `src/styles/app.css` | Vercel-ориентированные токены, темы и адаптивные стили |
| `src/scripts/user-store.js` | IndexedDB-first пользовательские данные, миграции, транзакции и межвкладочная синхронизация |
| `src/scripts/app.js` | UI состояния, поиск, backup/restore и offline UI через единый data store |
| `scripts/build.py` | Отдельный Python fallback renderer (`dist-fallback/`) |
| `scripts/prepare_astro.py` | Подготовка runtime-индексов и статьи итогового проекта |
| `scripts/after-build.mjs` | Генерация offline manifest и service worker после Astro/Pagefind |
| `tests/` | Статические, браузерные, data, responsive и URL E2E проверки |
| `docs/IMPLEMENTATION_ROADMAP.md` | План этапов до полной готовности |
| `docs/MILESTONE_LOG.md` | Проверяемый статус этапов и результаты QA |

Курс и три справочника доступны через интерфейс `/library/`; редакционная карта находится на `/editorial-review/`. Все основные учебные документы остаются `editorial_draft`, пока проверка каждого из них не внесена в реестр и не пройдены условия полного охвата.

## Дизайн

Визуальная система следует `DESIGN-vercel.md`: нейтральные поверхности, сдержанный синий акцент, функциональная типографика, чёткие границы, светлая и тёмная темы, адаптивная навигация, заметные focus-состояния и reduced motion. Изменения интерфейса должны продолжать этот контракт.

## Текущий статус и ограничения

Фактические статусы и проверочные результаты ведутся в `docs/MILESTONE_LOG.md`. Реализация инженерных этапов не заменяет независимую редакционную рецензию 430 учебных документов; пока она не проведена, тексты остаются отмечены как черновики. Автоматическая облачная синхронизация и AI-проверка ответов в продукт не входят.
