# Перенос пользовательского прогресса

Старая версия: `sales-os-roadmap-v1`, JSON `{format,checks,notes}`. Новая версия: `sales-os-v2` (version 2), JSON `lessonStatuses`, `practiceStatuses`, `bookmarks`, `notes`.

Карта: `t-mi-ti-ii` → `NN-NNN`, `p-mi-li` → `NN-PNN`. Файл `src/generated/content-manifest.json` хранит словарь `legacyMap` на 408 ключей. В новой версии: старая отметка теории → `theory_completed`; практика → `self_reviewed` (самоотметка), **не** `mastered`/внешняя аттестация. Старые заметки к модулю → `NN-MODULE`.

Из-за разных browser origins старый сайт, открытый через `file://`, не может передать localStorage веб-сайту автоматически. Пользователь вручную экспортирует JSON в старом `index.html`, затем выбирает «Импорт данных» в Настройках новой версии. Внимание: импорт с подтверждением **заменяет** текущий прогресс; перед ним сохраняйте резервную копию.
