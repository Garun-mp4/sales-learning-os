/* M7: private, recoverable text anchors for learning documents. */
(() => {
  const maxItems = 500;
  const maxBlocks = 40;
  const maxStateBytes = 8_000_000;
  const record = (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const text = (value, max) => typeof value === "string" && value.length <= max;
  const stamp = (value) =>
    Number.isSafeInteger(value) && value >= 0 && value <= 8640000000000000;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const fail = (message) => {
    throw Error(message);
  };
  const empty = () => ({ items: {} });
  const validId = (value) =>
    typeof value === "string" &&
    /^[a-zA-Z0-9_-]{1,100}$/.test(value) &&
    !["__proto__", "prototype", "constructor"].includes(value);
  const validDocumentId = (value) =>
    value === "FINAL_PROJECT" ||
    (typeof value === "string" &&
      /^\d{2}-(?:\d{3}|P\d{2}|MODULE)$/.test(value));
  const normalizeText = (value) =>
    String(value ?? "")
      .normalize("NFC")
      .replace(/[\u00a0\u202f]/gu, " ")
      .replace(/\s+/gu, " ")
      .trim();
  function hash(value) {
    let result = 2166136261;
    for (const char of value)
      result = Math.imul(result ^ char.charCodeAt(0), 16777619) >>> 0;
    return result.toString(16).padStart(8, "0");
  }
  function stableBlockId(documentId, headingPath, value, seen = new Map()) {
    if (!validDocumentId(documentId)) fail("Некорректный ID материала");
    const content = normalizeText(value);
    const heading = normalizeText(headingPath.join(" › "));
    const signature = `${documentId}\u0000${heading}\u0000${content}`;
    const fingerprint = hash(signature);
    const occurrence = (seen.get(fingerprint) || 0) + 1;
    seen.set(fingerprint, occurrence);
    return `b-${fingerprint}-${occurrence}`;
  }
  function versionFor(blocks) {
    return hash(
      blocks
        .map((block) => `${block.id}\u0000${normalizeText(block.text)}`)
        .join("\u0001"),
    );
  }
  function normalizeBlockIds(value) {
    if (
      !Array.isArray(value) ||
      value.length < 1 ||
      value.length > maxBlocks ||
      value.some(
        (id) => typeof id !== "string" || !/^b-[0-9a-f]{8}-\d{1,6}$/.test(id),
      ) ||
      new Set(value).size !== value.length
    )
      fail("Не удалось сохранить привязку к фрагменту");
    return [...value];
  }
  function normalizeCapture(value) {
    if (!record(value) || !validDocumentId(value.documentId))
      fail("Не удалось определить учебный материал");
    const quote = normalizeText(value.quote);
    const anchorQuote = normalizeText(value.anchorQuote || quote);
    const blockIds = normalizeBlockIds(value.blockIds);
    const contextBefore = normalizeText(value.contextBefore || "").slice(-240);
    const contextAfter = normalizeText(value.contextAfter || "").slice(0, 240);
    const textVersion = value.textVersion;
    if (
      !quote ||
      quote.length > 10000 ||
      !anchorQuote ||
      anchorQuote.length > 10000 ||
      !text(contextBefore, 240) ||
      !text(contextAfter, 240) ||
      typeof textVersion !== "string" ||
      !/^[0-9a-f]{8}$/.test(textVersion)
    )
      fail("Цитата слишком длинная или привязка заполнена неверно");
    return {
      documentId: value.documentId,
      blockIds,
      quote,
      anchorQuote,
      contextBefore,
      contextAfter,
      textVersion,
    };
  }
  function validate(raw) {
    if (raw === undefined) return empty();
    if (
      !record(raw) ||
      !record(raw.items) ||
      Object.keys(raw.items).length > maxItems
    )
      fail("Некорректный каталог выделений; данные не изменены");
    const next = { items: {} };
    for (const [key, value] of Object.entries(raw.items)) {
      if (
        !validId(key) ||
        !record(value) ||
        value.id !== key ||
        !validDocumentId(value.documentId) ||
        !Array.isArray(value.blockIds) ||
        value.blockIds.length < 1 ||
        value.blockIds.length > maxBlocks ||
        value.blockIds.some(
          (id) => typeof id !== "string" || !/^b-[0-9a-f]{8}-\d{1,6}$/.test(id),
        ) ||
        new Set(value.blockIds).size !== value.blockIds.length ||
        !text(value.quote, 10000) ||
        !value.quote.trim() ||
        !text(value.anchorQuote, 10000) ||
        !value.anchorQuote.trim() ||
        !text(value.contextBefore, 240) ||
        !text(value.contextAfter, 240) ||
        typeof value.textVersion !== "string" ||
        !/^[0-9a-f]{8}$/.test(value.textVersion) ||
        !text(value.comment, 5000) ||
        !stamp(value.createdAt) ||
        !stamp(value.updatedAt) ||
        value.updatedAt < value.createdAt ||
        !Number.isSafeInteger(value.revision) ||
        value.revision < 1 ||
        !stamp(value.deletedAt) ||
        (value.deletedAt > 0 && value.deletedAt < value.createdAt) ||
        !stamp(value.reviewAt) ||
        !stamp(value.scheduledAt) ||
        (value.reviewAt === 0) !== (value.scheduledAt === 0) ||
        (value.reviewAt > 0 && value.reviewAt < value.scheduledAt) ||
        !text(value.recallDraft, 10000)
      )
        fail("Некорректная запись выделения; данные не изменены");
      next.items[key] = {
        id: key,
        documentId: value.documentId,
        blockIds: [...value.blockIds],
        quote: value.quote,
        anchorQuote: value.anchorQuote,
        contextBefore: value.contextBefore,
        contextAfter: value.contextAfter,
        textVersion: value.textVersion,
        comment: value.comment,
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
        revision: value.revision,
        deletedAt: value.deletedAt,
        reviewAt: value.reviewAt,
        scheduledAt: value.scheduledAt,
        recallDraft: value.recallDraft,
      };
    }
    if (JSON.stringify(next).length > maxStateBytes)
      fail("Каталог выделений превысил допустимый размер; данные не изменены");
    return next;
  }
  function create(
    raw,
    input,
    comment = "",
    now = Date.now(),
    key = crypto.randomUUID(),
  ) {
    const state = validate(raw);
    if (!validId(key) || state.items[key])
      fail("ID выделения уже используется");
    if (Object.keys(state.items).length >= maxItems)
      fail("Достигнут лимит в 500 сохранённых выделений");
    if (!text(comment, 5000))
      fail("Комментарий должен быть не длиннее 5000 символов");
    const capture = normalizeCapture(input);
    state.items[key] = {
      id: key,
      ...capture,
      comment: comment.trim(),
      createdAt: now,
      updatedAt: now,
      revision: 1,
      deletedAt: 0,
      reviewAt: 0,
      scheduledAt: 0,
      recallDraft: "",
    };
    return validate(state);
  }
  function editComment(raw, id, revision, comment, now = Date.now()) {
    const state = validate(raw);
    const item = state.items[id];
    if (!item || item.deletedAt) fail("Выделение удалено или не найдено");
    if (item.revision !== revision)
      fail("Выделение изменено в другой вкладке. Обновите список и повторите.");
    if (typeof comment !== "string" || comment.length > 5000)
      fail("Комментарий должен быть не длиннее 5000 символов");
    item.comment = comment.trim();
    item.revision++;
    item.updatedAt = now;
    return validate(state);
  }
  function reanchor(raw, id, revision, input, now = Date.now()) {
    const state = validate(raw);
    const item = state.items[id];
    if (!item || item.deletedAt) fail("Выделение удалено или не найдено");
    if (item.revision !== revision)
      fail("Выделение изменено в другой вкладке. Обновите список и повторите.");
    const capture = normalizeCapture({
      ...input,
      documentId: item.documentId,
      quote: item.quote,
      anchorQuote: input.anchorQuote || input.quote,
    });
    Object.assign(item, {
      blockIds: capture.blockIds,
      anchorQuote: capture.anchorQuote,
      contextBefore: capture.contextBefore,
      contextAfter: capture.contextAfter,
      textVersion: capture.textVersion,
      revision: item.revision + 1,
      updatedAt: now,
    });
    return validate(state);
  }
  function softDelete(raw, id, revision, now = Date.now()) {
    const state = validate(raw);
    const item = state.items[id];
    if (!item || item.deletedAt) fail("Выделение уже удалено или не найдено");
    if (item.revision !== revision)
      fail("Выделение изменено в другой вкладке. Обновите список и повторите.");
    item.deletedAt = now;
    item.revision++;
    item.updatedAt = now;
    return validate(state);
  }
  function restore(raw, id, revision, now = Date.now()) {
    const state = validate(raw);
    const item = state.items[id];
    if (!item || !item.deletedAt) fail("Выделение не находится в корзине");
    if (item.revision !== revision)
      fail("Выделение изменено в другой вкладке. Обновите список и повторите.");
    item.deletedAt = 0;
    item.revision++;
    item.updatedAt = now;
    return validate(state);
  }
  function schedule(raw, id, days, now = Date.now()) {
    const state = validate(raw);
    const item = state.items[id];
    if (!item || item.deletedAt) fail("Выделение удалено или не найдено");
    if (![1, 3, 7].includes(days)) fail("Выберите срок повтора");
    item.scheduledAt = now;
    item.reviewAt = now + days * 86400000;
    item.revision++;
    item.updatedAt = now;
    return validate(state);
  }
  function saveRecall(raw, id, draft, now = Date.now()) {
    const state = validate(raw);
    const item = state.items[id];
    if (!item || item.deletedAt || !item.reviewAt)
      fail("Повтор выделения не найден");
    if (typeof draft !== "string" || draft.length > 10000)
      fail("Ответ должен быть не длиннее 10000 символов");
    item.recallDraft = draft;
    item.revision++;
    item.updatedAt = now;
    return validate(state);
  }
  function completeReview(raw, id, now = Date.now()) {
    const state = validate(raw);
    const item = state.items[id];
    if (!item || item.deletedAt || !item.reviewAt)
      fail("Повтор выделения не найден");
    item.reviewAt = 0;
    item.scheduledAt = 0;
    item.recallDraft = "";
    item.revision++;
    item.updatedAt = now;
    return validate(state);
  }
  function reschedule(raw, id, days, now = Date.now()) {
    return schedule(raw, id, days, now);
  }
  function contextMatches(textValue, at, quoteLength, item) {
    const before = item.contextBefore;
    const after = item.contextAfter;
    return (
      (!before ||
        textValue.slice(Math.max(0, at - before.length), at) === before) &&
      (!after ||
        textValue.slice(at + quoteLength, at + quoteLength + after.length) ===
          after)
    );
  }
  function occurrences(haystack, needle) {
    const found = [];
    if (!needle) return found;
    let at = -1;
    while ((at = haystack.indexOf(needle, at + 1)) !== -1) found.push(at);
    return found;
  }
  function anchorForRange(blocks, start, end) {
    const ids = [];
    let cursor = 0;
    let firstStart = 0;
    let lastEnd = 0;
    for (const [index, block] of blocks.entries()) {
      const blockStart = cursor;
      const blockEnd = blockStart + block.text.length;
      if (blockEnd > start && blockStart < end) {
        ids.push(block.id);
        if (ids.length === 1) firstStart = Math.max(0, start - blockStart);
        lastEnd = Math.min(block.text.length, end - blockStart);
      }
      cursor = blockEnd + (index < blocks.length - 1 ? 1 : 0);
    }
    const first = blocks.find((block) => block.id === ids[0]);
    const last = blocks.find((block) => block.id === ids.at(-1));
    return {
      blockIds: ids,
      contextBefore: first
        ? first.text.slice(Math.max(0, firstStart - 240), firstStart)
        : "",
      contextAfter: last ? last.text.slice(lastEnd, lastEnd + 240) : "",
    };
  }
  function locate(item, blocks) {
    const normalized = blocks.map((block) => ({
      id: block.id,
      text: normalizeText(block.text),
    }));
    const textValue = normalized.map((block) => block.text).join(" ");
    const quote = normalizeText(item.anchorQuote || item.quote);
    const byId = new Map(normalized.map((block) => [block.id, block]));
    const localBlocks = item.blockIds.map((id) => byId.get(id));
    if (localBlocks.every(Boolean)) {
      const localText = localBlocks.map((block) => block.text).join(" ");
      const matches = occurrences(localText, quote);
      const narrowed = matches.filter((at) =>
        contextMatches(localText, at, quote.length, item),
      );
      const candidates = narrowed.length ? narrowed : matches;
      if (candidates.length === 1) {
        const indexes = item.blockIds.map((id) =>
          normalized.findIndex((block) => block.id === id),
        );
        const contiguous = indexes.every(
          (index, i) => index >= 0 && (!i || index === indexes[i - 1] + 1),
        );
        if (contiguous) {
          const globalStart = normalized
            .slice(0, indexes[0])
            .reduce((length, block) => length + block.text.length + 1, 0);
          const start = globalStart + candidates[0];
          const end = start + quote.length;
          return {
            status: "anchored",
            start,
            end,
            ...anchorForRange(normalized, start, end),
          };
        }
      }
      if (candidates.length > 1)
        return { status: "ambiguous", blockIds: [...item.blockIds] };
    }
    const matches = occurrences(textValue, quote);
    const narrowed = matches.filter((at) =>
      contextMatches(textValue, at, quote.length, item),
    );
    const candidates = narrowed.length ? narrowed : matches;
    if (candidates.length === 1)
      return {
        status: "moved",
        start: candidates[0],
        end: candidates[0] + quote.length,
        ...anchorForRange(
          normalized,
          candidates[0],
          candidates[0] + quote.length,
        ),
      };
    return {
      status: candidates.length > 1 ? "ambiguous" : "missing",
      blockIds: [...item.blockIds],
    };
  }
  function merge(left, right) {
    const a = validate(left);
    const b = validate(right);
    const merged = clone(a);
    const fingerprint = (item) => hash(JSON.stringify(item));
    for (const [id, incoming] of Object.entries(b.items)) {
      const local = merged.items[id];
      if (!local) {
        merged.items[id] = incoming;
        continue;
      }
      if (JSON.stringify(local) === JSON.stringify(incoming)) continue;
      const winner = incoming.updatedAt > local.updatedAt ? incoming : local;
      const loser = winner === incoming ? local : incoming;
      merged.items[id] = winner;
      const conflictId = `${id.slice(0, 72)}-conflict-${fingerprint(loser)}`;
      if (!merged.items[conflictId])
        merged.items[conflictId] = { ...loser, id: conflictId };
    }
    return validate(merged);
  }
  window.SalesOSHighlights = {
    empty,
    validate,
    normalizeText,
    hash,
    stableBlockId,
    versionFor,
    create,
    editComment,
    reanchor,
    softDelete,
    restore,
    schedule,
    saveRecall,
    completeReview,
    reschedule,
    locate,
    merge,
  };
})();
