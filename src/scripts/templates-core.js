/* M6: private reusable templates, with immutable source and user snapshots. */
(() => {
  const categories = [
    "first_message",
    "discovery",
    "proposal",
    "objection",
    "follow_up",
    "other",
  ];
  const labels = {
    service: "Услуга",
    client: "Клиент",
    context: "Контекст",
    next_step: "Следующий шаг",
  };
  const maxItems = 250;
  const maxVersions = 100;
  const maxStateBytes = 3_500_000;
  const isRecord = (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const isText = (value, max) =>
    typeof value === "string" && value.length <= max;
  const isStamp = (value) =>
    Number.isSafeInteger(value) && value >= 0 && value <= 8640000000000000;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const fail = (message) => {
    throw Error(message);
  };
  const empty = () => ({ items: {} });
  const newId = () => crypto.randomUUID();
  const validId = (value) =>
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );

  function uniqueTags(value) {
    if (!Array.isArray(value)) fail("Некорректный список тегов");
    const tags = [];
    const seen = new Set();
    for (const raw of value) {
      if (typeof raw !== "string") fail("Некорректный тег");
      const tag = raw.trim();
      if (!tag) continue;
      if (tag.length > 40) fail("Один тег не может быть длиннее 40 символов");
      const key = tag.toLocaleLowerCase("ru-RU");
      if (!seen.has(key)) {
        seen.add(key);
        tags.push(tag);
      }
    }
    return tags;
  }

  function normalizedTags(value) {
    const tags = uniqueTags(value);
    if (tags.length > 20) fail("Добавьте не более 20 тегов");
    return tags;
  }

  function parseTags(value) {
    if (typeof value !== "string") fail("Некорректный список тегов");
    return uniqueTags(value.split(","));
  }

  function fieldsOf(value) {
    if (!isRecord(value)) fail("Не удалось прочитать поля шаблона");
    const title = typeof value.title === "string" ? value.title.trim() : "";
    const category = value.category;
    const body = value.body;
    const whenToUse = value.whenToUse ?? "";
    const resultNote = value.resultNote ?? "";
    if (!title || title.length > 120) fail("Название: от 1 до 120 символов");
    if (!categories.includes(category)) fail("Выберите категорию шаблона");
    if (!isText(body, 50000)) fail("Текст шаблона длиннее 50 000 символов");
    if (!body.trim()) fail("Добавьте текст шаблона");
    if (!isText(whenToUse, 3000))
      fail("Пояснение не может быть длиннее 3 000 символов");
    if (!isText(resultNote, 5000))
      fail("Заметка о результате не может быть длиннее 5 000 символов");
    if (
      (value.favorite !== undefined && typeof value.favorite !== "boolean") ||
      (value.archived !== undefined && typeof value.archived !== "boolean")
    )
      fail("Некорректный статус личного шаблона");
    return {
      title,
      category,
      body,
      whenToUse,
      tags: normalizedTags(value.tags || []),
      resultNote,
      favorite: value.favorite === true,
      archived: value.archived === true,
    };
  }

  function validateSource(source) {
    if (source === null) return null;
    if (
      !isRecord(source) ||
      !isText(source.id, 180) ||
      !source.id.trim() ||
      !isText(source.title, 120) ||
      !source.title.trim() ||
      !isText(source.version, 80) ||
      !isText(source.body, 50000)
    )
      fail("Некорректная зафиксированная версия источника");
    return {
      id: source.id,
      title: source.title.trim(),
      version: source.version,
      body: source.body,
    };
  }

  function validateVersion(version) {
    if (
      !isRecord(version) ||
      !validId(version.id) ||
      !isText(version.name, 120) ||
      !version.name.trim() ||
      !isStamp(version.createdAt)
    )
      fail("Некорректная сохранённая версия шаблона");
    return {
      ...fieldsOf(version),
      id: version.id,
      name: version.name.trim(),
      createdAt: version.createdAt,
    };
  }

  function validateItem(key, item) {
    if (
      !validId(key) ||
      !isRecord(item) ||
      item.id !== key ||
      !isStamp(item.createdAt) ||
      !isStamp(item.updatedAt) ||
      !Number.isSafeInteger(item.revision) ||
      item.revision < 1 ||
      !Array.isArray(item.versions) ||
      item.versions.length > maxVersions
    )
      fail("Некорректная личная заготовка");
    const fields = fieldsOf(item);
    const versions = item.versions.map(validateVersion);
    if (new Set(versions.map((version) => version.id)).size !== versions.length)
      fail("Повтор ID сохранённой версии");
    return {
      id: key,
      ...fields,
      source: validateSource(item.source ?? null),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      revision: item.revision,
      versions,
    };
  }

  function validate(raw) {
    if (raw === undefined) return empty();
    if (!isRecord(raw) || !isRecord(raw.items))
      fail("Некорректная личная библиотека шаблонов");
    const keys = Object.keys(raw.items);
    if (keys.length > maxItems)
      fail("В личной библиотеке не более 250 шаблонов");
    const items = {};
    for (const [key, item] of Object.entries(raw.items))
      items[key] = validateItem(key, item);
    const next = { items };
    if (JSON.stringify(next).length > maxStateBytes)
      fail(
        "Личная библиотека превысила 3,5 МБ. Сначала скачайте резервную копию.",
      );
    return clone(next);
  }

  function create(raw, initial, now = Date.now(), key = newId()) {
    const next = validate(raw);
    if (!validId(key) || next.items[key]) fail("ID шаблона уже используется");
    if (Object.keys(next.items).length >= maxItems)
      fail("Достигнут лимит в 250 личных шаблонов");
    const fields = fieldsOf(initial);
    const source = validateSource(initial.source ?? null);
    next.items[key] = {
      id: key,
      ...fields,
      source,
      createdAt: now,
      updatedAt: now,
      revision: 1,
      versions: [],
    };
    return validate(next);
  }

  function get(raw, key, revision) {
    const next = validate(raw);
    const item = next.items[key];
    if (!item) fail("Шаблон удалён или изменён в другой вкладке");
    if (item.archived) fail("Сначала восстановите шаблон из архива");
    if (revision !== undefined && item.revision !== revision)
      fail("Шаблон изменён в другой вкладке. Ваш текст оставлен в редакторе.");
    return { next, item };
  }

  function snapshot(item, name, now, id = newId()) {
    return {
      ...fieldsOf(item),
      id,
      name: name.trim().slice(0, 120) || "Без названия",
      createdAt: now,
    };
  }

  function writeFields(item, changes) {
    const fields = fieldsOf({ ...item, ...changes });
    Object.assign(item, fields);
  }

  function update(raw, key, revision, changes, now = Date.now()) {
    const { next, item } = get(raw, key, revision);
    writeFields(item, changes);
    item.revision++;
    item.updatedAt = now;
    return validate(next);
  }

  function saveVersion(raw, key, revision, name, changes, now = Date.now()) {
    const { next, item } = get(raw, key, revision);
    if (!isText(name, 120) || !name.trim())
      fail("Укажите название версии длиной до 120 символов");
    if (item.versions.length >= maxVersions)
      fail("Достигнут лимит версий. Скачайте резервную копию перед очисткой.");
    writeFields(item, changes);
    item.versions.push(snapshot(item, name, now));
    item.revision++;
    item.updatedAt = now;
    return validate(next);
  }

  function restoreVersion(raw, key, revision, versionId, now = Date.now()) {
    const { next, item } = get(raw, key, revision);
    const version = item.versions.find(
      (candidate) => candidate.id === versionId,
    );
    if (!version) fail("Сохранённая версия больше недоступна");
    if (item.versions.length >= maxVersions)
      fail("Сначала скачайте резервную копию и освободите место для версии");
    item.versions.push(
      snapshot(item, `Перед восстановлением · ${version.name}`, now),
    );
    writeFields(item, version);
    item.revision++;
    item.updatedAt = now;
    return validate(next);
  }

  function archive(raw, key, revision, archived, changes, now = Date.now()) {
    if (typeof archived !== "boolean") fail("Некорректный статус архива");
    const next = validate(raw);
    const item = next.items[key];
    if (!item) fail("Шаблон удалён или изменён в другой вкладке");
    if (item.revision !== revision)
      fail("Шаблон изменён в другой вкладке. Ваш текст оставлен в редакторе.");
    writeFields(item, { ...changes, archived });
    item.revision++;
    item.updatedAt = now;
    return validate(next);
  }

  function contentKey(value) {
    const { id, name, createdAt, ...content } = value;
    return JSON.stringify(content);
  }

  function mergeVersions(primary, secondary, losingItem, now) {
    const all = [...primary, ...secondary];
    const seen = new Set();
    const versions = [];
    for (const version of all) {
      const fingerprint = contentKey(version);
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      const duplicateId = versions.some(
        (candidate) => candidate.id === version.id,
      );
      versions.push(duplicateId ? { ...version, id: newId() } : version);
    }
    const losingFingerprint = contentKey(losingItem);
    if (!seen.has(losingFingerprint))
      versions.push(
        snapshot(
          losingItem,
          `Вариант при объединении · ${new Date(losingItem.updatedAt).toLocaleDateString("ru-RU")}`,
          losingItem.updatedAt || now,
        ),
      );
    if (versions.length > maxVersions)
      fail(
        "При объединении превышен лимит версий; сначала скачайте обе копии данных",
      );
    return versions.sort((left, right) => left.createdAt - right.createdAt);
  }

  function merge(currentRaw, incomingRaw) {
    const current = validate(currentRaw);
    const incoming = validate(incomingRaw);
    for (const [key, imported] of Object.entries(incoming.items)) {
      const local = current.items[key];
      if (!local) {
        current.items[key] = imported;
        continue;
      }
      if (JSON.stringify(local) === JSON.stringify(imported)) continue;
      const importedWins = imported.updatedAt > local.updatedAt;
      const winner = importedWins ? imported : local;
      const loser = importedWins ? local : imported;
      current.items[key] = {
        ...winner,
        versions: mergeVersions(
          local.versions,
          imported.versions,
          loser,
          Date.now(),
        ),
      };
    }
    return validate(current);
  }

  function preview(body, values) {
    const used = new Set();
    const missing = new Set();
    const unknown = new Set();
    const source = String(body ?? "");
    const text = source.replace(/\{\{([^{}]*)\}\}/g, (marker, rawKey) => {
      const key = rawKey.trim();
      if (!Object.hasOwn(labels, key)) {
        unknown.add(marker);
        return marker;
      }
      used.add(key);
      const value = typeof values[key] === "string" ? values[key].trim() : "";
      if (!value) {
        missing.add(key);
        return marker;
      }
      return value;
    });
    const residue = source.replace(/\{\{[^{}]*\}\}/g, "");
    const malformed = residue.includes("{{") || residue.includes("}}");
    const bracketPlaceholders = [...source.matchAll(/\[[^\]\n]{1,100}\]/g)].map(
      ([marker]) => marker,
    );
    const issues = [];
    if (unknown.size)
      issues.push("Неизвестные переменные: " + [...unknown].join(", "));
    if (malformed) issues.push("В тексте есть незакрытый маркер переменной");
    if (missing.size)
      issues.push(
        "Заполните поля: " + [...missing].map((key) => labels[key]).join(", "),
      );
    if (bracketPlaceholders.length)
      issues.push(
        "Уберите незаполненные обозначения в квадратных скобках: " +
          [...new Set(bracketPlaceholders)].join(", "),
      );
    return {
      text,
      used: [...used],
      missing: [...missing],
      unknown: [...unknown],
      resolved: issues.length === 0,
      issues,
    };
  }

  function duplicate(raw, source, initial, now = Date.now(), key = newId()) {
    if (!isRecord(source)) fail("Исходный шаблон недоступен");
    const original = validateSource(source);
    const normalized = fieldsOf(initial);
    return create(
      raw,
      {
        ...normalized,
        source: original,
        title: normalized.title || `${original.title} — мой вариант`,
      },
      now,
      key,
    );
  }

  window.SalesOSTemplates = {
    categories,
    labels,
    parseTags,
    empty,
    validate,
    create,
    duplicate,
    update,
    saveVersion,
    restoreVersion,
    archive,
    merge,
    preview,
  };
})();
