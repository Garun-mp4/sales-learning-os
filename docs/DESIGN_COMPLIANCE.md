# Соответствие дизайн-системе

## Текущий результат — 2026-10-09

`DESIGN-vercel.md` — визуальный контракт приложения. В рабочем интерфейсе используются локальные Geist/Geist Mono с кириллическими glyphs, светлая и тёмная темы, нейтральные surface/border tokens, функциональный синий для ссылок и focus, видимый keyboard focus, `prefers-reduced-motion`, логотип/фавикон Sales OS и адаптивные навигация и таблицы. Пользовательские исходники логотипа и favicon сохранены без изменения; производные варианты готовятся скриптом из репозитория.

### Проверенное отображение

- Реальный production-like Astro preview снят в Chromium для главной, урока, модуля, практики и настроек: 5 шаблонов × 5 ширин (320/390/768/1024/1440 px) × light/dark = 50 кадров в [m4-responsive/](screenshots/m4-responsive/).
- После M5 реальные Astro preview-кадры покрывают home, module, practice, library hub, template library и editorial review при тех же пяти ширинах и двух темах — 60 кадров в [m5-learning/](screenshots/m5-learning/). Дополнительно сохранены раскрытые mobile состояния практической рубрики и таблицы редакционного реестра.
- Встроенная Chromium responsive suite прошла 175 репрезентативных представлений 35 маршрутов × 5 ширин, плюс 144 состояния всех 72 упражнений на 320/390 px; document-level overflow не выявлен. Таблицы остаются локально прокручиваемыми и имеют клавиатурно доступные области прокрутки.
- Production build и browser smoke подтвердили загрузку локального шрифта, ассетов бренда, 481 статического маршрута и отсутствие pageerror на M5 screenshot matrix. `npm run check` завершился без ошибок и предупреждений; остались три существовавших deprecated hints `BeforeUnloadEvent.returnValue`.
- M6 добавил production-preview matrix для `/search/` и `/settings/`: 2 страницы × 5 ширин × 2 темы = 20 кадров в [m6-search-offline/](screenshots/m6-search-offline/). Все размеры прошли проверку document-level overflow; отдельно просмотрены узкий mobile search/settings и широкий dark search/settings. Offline manager использует существующие control/border/surface tokens и явные ready/partial/quota/error states.
- M7 добавил фактические production-preview снимки практики и очереди повтора: 2 маршрута × 5 ширин × 2 темы = 20 кадров в [m7-practice-data/](screenshots/m7-practice-data/). Структурированный редактор, self-review, конфликт черновиков и backup-центр сохраняют нейтральные поверхности, типографику и общие focus/control tokens.
- Локальный production build preview сохранил 210 кадров: 21 representative route (15 маршрутов из исходной audit matrix и текущие справочные/editorial/review маршруты) × 5 ширин × 2 темы в [m8-release/](screenshots/m8-release/). Все маршруты дали HTTP 200, все кадры прошли проверку document-level overflow, browser pageerror не было; проверены home, roadmap, level, два модуля, два урока, две практики, источники, bookmarks, settings, final project, search, библиотеки и их разделы, editorial review и revisit queue.
- Все 482 маршрута актуального manifest прошли production HTTP/H1 gate; 72 практики прошли отдельные responsive views при 320/390 px. Автоматизирован reflow на 640 CSS px как layout-эквивалент 200% от viewport 1280 px для home/practice/review/settings. Это не заявляется как проверка browser-native zoom.

### Сигналы детектора и исключения

Разовый Impeccable detector пометил семантический `blockquote` с левым border и Geist/Geist Mono. Первый используется для Markdown-цитаты, второй предписан `DESIGN-vercel.md` как обязательная гарнитура; это проверенные контекстные исключения, а не дрейф интерфейсной системы.

### Остаётся проверить в M8

- Ручное чтение интерфейса NVDA на Windows: команда `Get-Command NVDA` и две стандартные папки установки не обнаружили доступный запуск. Автоматические role/name/focus и клавиатурные E2E проверки не заменяют реальную речь screen reader.
- Browser-native zoom до 200% и фактическое поведение при увеличенном системном тексте. 640 CSS px reflow test — отдельная автоматическая проверка без заявления, что масштаб браузера был изменён.
- Авторизованный Vercel Preview для `2da6af0602d96e31c4a6eb42cb2aa03f5f5e8a31` получил `READY`; in-app browser проверил 15 маршрутов. Один H1 и description присутствуют на всех, публичные canonical/og:url указывают на соответствующий production route, личные страницы закрыты `noindex, nofollow` без canonical, browser errors отсутствуют. Preview smoke закрыт; Vercel API detail endpoints по-прежнему возвращают 403, но этот отдельный API доступ для проверки опубликованной страницы не нужен.
- Проверка Preview нашла, что production Astro `site` по умолчанию становился localhost и canonical/og:url пропускались. Исправление использует подтверждённый домен `https://sl-os.vercel.app`; static builder, production E2E и статические гейты проверяют это поведение. Ошибка подтверждена устранённой на опубликованном Preview.
- Ни одна из автоматических проверок не является полной WCAG-сертификацией или проверкой сторонней лаборатории.

Ручные NVDA/native zoom проверки остаются открытой частью release gate M8. Автоматические проверки и снимки страниц подтверждают только перечисленные размеры, маршруты и состояния и не заявляют независимую сертификацию WCAG.
