# Архитектура Sales OS

Sales OS — статическая русскоязычная обучающая платформа без backend и учётных записей. Исходные Markdown и устойчивые ID хранятся в `sales-knowledge-base/`; браузерные данные пользователя остаются на устройстве. Инженерная self-review не является сертификацией, а статус материала `editorial_draft` не снимается сборкой или тестом.

## Источники и сборки

- `scripts/audit.py` проверяет исходный курс и создаёт `src/generated/content-manifest.json` и клиентский индекс.
- `src/content.config.ts` подключает Astro Content Collection напрямую к `sales-knowledge-base/modules/`; курс не копируется в параллельное дерево.
- `scripts/prepare_astro.py` создаёт поисковый индекс, runtime-ассеты и очищенный снимок итогового проекта из исходников. Он не строит второй сайт перед Astro.
- Astro 7 собирает production-сайт из `src/pages/`, `src/layouts/`, компонентов, стилей и исходной коллекции. `scripts/after-build.mjs` добавляет Pagefind-independent offline URL manifest и service worker в `dist/`.
- `dist/` — одноразовый, игнорируемый результат Astro. Python fallback запускается явно через `python scripts/build.py --out-dir dist-fallback`; он не очищает и не подменяет Astro output.
- Vercel выполняет `npm ci`, создаёт `.venv` для `requirements.txt`, запускает `npm run build` с `.venv/bin` в `PATH` и публикует `dist/`. Изолированное окружение обходится без установки пакетов в управляемый системный Python. В репозитории нет сохранённых сборочных HTML-страниц.

## Runtime и границы данных

`src/scripts/user-store.js` — единственный runtime-слой пользовательских данных: IndexedDB (`sales-os-personal`, schema v2) является основным хранилищем состояния и заметок; отдельные транзакции, ревизии заметок и generation защищают от потерянных обновлений. localStorage используется для миграционных снимков и явно ограниченного режима. Межвкладочные обновления синхронизируются, импорт v1/v2 валидируется до атомарной замены, экспорт остаётся локальным JSON. `src/scripts/app.js` подключает этот API к интерфейсу, а также обслуживает поиск, offline package и PWA worker. Данные пользователя не отправляются на сервер приложения.

Общая оболочка и sidebar находятся в `src/layouts/Shell.astro`; UI-атомы и course routes — в `src/components/` и `src/pages/`. Дизайн-токены, responsive layout и темы определены в `src/styles/app.css`. `DESIGN-vercel.md` — визуальный контракт: нейтральные поверхности, ограниченная палитра, ясная типографика, разделители вместо декоративных эффектов, accessible focus и уважение к reduced motion.

## Подготовка и локальные команды

```powershell
py -m pip install -r requirements-dev.txt
npm ci
npm run dev
```

`dev`, `check`, `lint` и `build` атомарно готовят небольшие производные входы; они не запускают Python site renderer и не генерируют в `dist/`. Content Collection загружает один и тот же исходник напрямую, а обе сборки используют разные outputs. Канонические проверки:

```powershell
npm run lint
npm run check
npm run build
npm run test:quality
npm run test:e2e
npm run test:fallback
```

CI выполняет эти проверки на Windows и Linux. Playwright Node и Python pinned на совместимые версии, браузер устанавливается один раз для общей browser cache.

## Проверяемые риски

`docs/MILESTONE_LOG.md` содержит датированные результаты и различает успешно выполненные проверки, заблокированные окружением действия и редакционные зависимости. Текущие продуктовые ограничения и очередь работ собраны в `docs/IMPLEMENTATION_ROADMAP.md`. Главный внешний release dependency — независимая рецензия всех 430 материалов; инженерные проверки не должны выдавать её за завершённую.
