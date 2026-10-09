/* Local text annotations. Ranges are painted with the CSS Custom Highlight API,
   so learning content stays untouched for copy, links, search and assistive tech. */
(() => {
  const core = window.SalesOSHighlights;
  const store = window.SalesOSUserStore;
  if (!core || !store) return;

  const root = document.documentElement.dataset.root || "/";
  const article = document.querySelector("article[data-annotation-content]");
  const workspace = document.querySelector("[data-highlight-workspace]");
  const catalog = document.querySelector("[data-highlight-catalog]");
  const review = document.querySelector("[data-highlight-reviews]");
  const toolbar = document.querySelector("[data-highlight-toolbar]");
  const $ = (parent, selector) => parent?.querySelector(selector) || null;
  const normalize = core.normalizeText;
  const pageDocId = document.body.dataset.docId || "";
  const now = () => Date.now();
  const state = {
    current: store.initialState,
    blocks: [],
    pending: null,
    reanchorId: "",
    index: null,
    catalogIndexError: false,
    renderToken: 0,
    queryHandled: false,
  };
  const timers = new Map();

  function textNodeMap(block) {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let raw = "";
    let current;
    while ((current = walker.nextNode())) {
      const parent = current.parentElement;
      if (
        !parent ||
        parent.closest(
          "script,style,button,textarea,select,[contenteditable='true'],[data-no-highlight]",
        )
      )
        continue;
      const value = current.nodeValue || "";
      if (!value) continue;
      const start = raw.length;
      raw += value;
      nodes.push({ node: current, start, end: raw.length });
    }
    const source = new Array(raw.length);
    for (const entry of nodes) {
      for (let offset = entry.start; offset < entry.end; offset++) {
        const local = offset - entry.start;
        const code = raw.codePointAt(offset);
        const width = code > 0xffff ? 2 : 1;
        source[offset] = { node: entry.node, start: local, end: local + width };
      }
    }

    let canonical = "";
    const starts = [];
    const ends = [];
    const startPoints = [];
    const endPoints = [];
    const segmenter =
      typeof Intl.Segmenter === "function"
        ? new Intl.Segmenter("ru", { granularity: "grapheme" })
        : null;
    let fallbackOffset = 0;
    const segments = segmenter
      ? [...segmenter.segment(raw)].map(({ segment, index }) => ({
          segment,
          index,
        }))
      : Array.from(raw).map((segment) => {
          const index = fallbackOffset;
          fallbackOffset += segment.length;
          return { segment, index };
        });
    for (const part of segments) {
      const begin = part.index;
      const finish = begin + part.segment.length;
      const value = part.segment.normalize("NFC");
      const pointStart = source[begin];
      const pointEnd = source[finish - 1];
      if (!pointStart || !pointEnd) continue;
      if (/^\s+$/u.test(value)) {
        if (!canonical || canonical.endsWith(" ")) {
          if (canonical.endsWith(" ")) {
            ends[ends.length - 1] = finish;
            endPoints[endPoints.length - 1] = {
              node: pointEnd.node,
              offset: pointEnd.end,
            };
          }
          continue;
        }
        canonical += " ";
        starts.push(begin);
        ends.push(finish);
        startPoints.push({ node: pointStart.node, offset: pointStart.start });
        endPoints.push({ node: pointEnd.node, offset: pointEnd.end });
        continue;
      }
      for (let offset = 0; offset < value.length; offset++) {
        canonical += value[offset];
        starts.push(begin);
        ends.push(finish);
        startPoints.push({ node: pointStart.node, offset: pointStart.start });
        endPoints.push({ node: pointEnd.node, offset: pointEnd.end });
      }
    }
    if (canonical.endsWith(" ")) {
      canonical = canonical.slice(0, -1);
      starts.pop();
      ends.pop();
      startPoints.pop();
      endPoints.pop();
    }
    return {
      node: block,
      raw,
      text: canonical,
      starts,
      ends,
      startPoints,
      endPoints,
    };
  }

  function eligibleNodes(rootNode) {
    if (!rootNode) return [];
    const candidates = [
      ...rootNode.querySelectorAll("p,h2,h3,h4,h5,h6,li,pre,td,th"),
    ];
    return candidates.filter((node) => {
      if (node.matches("li,td,th") && node.querySelector("p,ul,ol,table"))
        return false;
      if (
        node.closest(
          "[contenteditable='true'],textarea,button,select,[data-no-highlight]",
        )
      )
        return false;
      return normalize(node.textContent).length > 0;
    });
  }

  function buildBlocks() {
    if (!article) return [];
    const seen = new Map();
    const headingPath = [];
    return eligibleNodes(article)
      .map((node) => {
        const text = normalize(node.textContent);
        const headingMatch = /^H([2-6])$/.exec(node.tagName);
        let blockPath = [...headingPath];
        if (headingMatch) {
          const depth = Number(headingMatch[1]);
          headingPath.splice(depth - 2);
          headingPath[depth - 2] = text;
          blockPath = headingPath.slice(0, depth - 2);
        }
        const id = core.stableBlockId(pageDocId, blockPath, text, seen);
        node.dataset.highlightBlock = id;
        const mapped = textNodeMap(node);
        return { id, text: mapped.text, node, map: mapped };
      })
      .filter((block) => block.text);
  }

  function blockStarts(blocks = state.blocks) {
    let offset = 0;
    return blocks.map((block, index) => {
      const start = offset;
      offset += block.text.length + (index < blocks.length - 1 ? 1 : 0);
      return start;
    });
  }

  function rangeOffset(block, node, offset) {
    const range = document.createRange();
    range.selectNodeContents(block.node);
    try {
      range.setEnd(node, offset);
      return range.toString().length;
    } catch {
      return edge === "start" ? 0 : block.map.raw.length;
    }
  }

  function canonicalOffset(map, rawOffset, edge) {
    if (edge === "start") {
      let index = map.ends.findIndex((end) => end > rawOffset);
      if (index < 0) index = map.text.length;
      if (map.text[index] === " ") index++;
      return Math.min(index, map.text.length);
    }
    let index = 0;
    while (index < map.starts.length && map.starts[index] < rawOffset) index++;
    if (index && map.text[index - 1] === " ") index--;
    return index;
  }

  function blocksForRange(range) {
    return state.blocks.flatMap((block, index) => {
      try {
        return range.intersectsNode(block.node) ? [{ block, index }] : [];
      } catch {
        return [];
      }
    });
  }

  function clippedRange(block, sourceRange) {
    const local = document.createRange();
    local.selectNodeContents(block.node);
    const startInside =
      block.node === sourceRange.startContainer ||
      block.node.contains(sourceRange.startContainer);
    const endInside =
      block.node === sourceRange.endContainer ||
      block.node.contains(sourceRange.endContainer);
    try {
      if (startInside)
        local.setStart(sourceRange.startContainer, sourceRange.startOffset);
      if (endInside)
        local.setEnd(sourceRange.endContainer, sourceRange.endOffset);
      return { local, startInside, endInside };
    } catch {
      return null;
    }
  }

  function selectionCapture(sourceRange) {
    const hits = blocksForRange(sourceRange);
    if (!hits.length || hits.length > 40) return null;
    const first = hits[0];
    const last = hits.at(-1);
    const firstClip = clippedRange(first.block, sourceRange);
    const lastClip =
      first.index === last.index
        ? firstClip
        : clippedRange(last.block, sourceRange);
    if (!firstClip || !lastClip) return null;
    const localStart = firstClip.startInside
      ? canonicalOffset(
          first.block.map,
          rangeOffset(
            first.block,
            sourceRange.startContainer,
            sourceRange.startOffset,
          ),
          "start",
        )
      : 0;
    const localEnd = lastClip.endInside
      ? canonicalOffset(
          last.block.map,
          rangeOffset(
            last.block,
            sourceRange.endContainer,
            sourceRange.endOffset,
          ),
          "end",
        )
      : last.block.text.length;
    const pieces = hits.map(({ block, index }) => {
      const start = index === first.index ? localStart : 0;
      const end = index === last.index ? localEnd : block.text.length;
      return block.text.slice(start, end);
    });
    const quote = normalize(pieces.join(" "));
    if (!quote) return null;
    const firstBlock = first.block;
    const lastBlock = last.block;
    return {
      documentId: pageDocId,
      blockIds: hits.map(({ block }) => block.id),
      quote,
      anchorQuote: quote,
      contextBefore: firstBlock.text.slice(
        Math.max(0, localStart - 240),
        localStart,
      ),
      contextAfter: lastBlock.text.slice(localEnd, localEnd + 240),
      textVersion: core.versionFor(state.blocks),
    };
  }

  function currentItem(id) {
    return state.current.annotations?.items?.[id] || null;
  }

  async function mutateAnnotation(mutation) {
    const result = await store.updateState((current) => ({
      ...current,
      annotations: mutation(current.annotations || core.empty()),
    }));
    state.current = result.state;
    if (!result.durable)
      statusMessage(
        "Запись доступна только в этой вкладке. Скачайте резервную копию до закрытия.",
      );
    return result;
  }

  function statusMessage(
    message,
    target = $(workspace, "[data-highlight-status]"),
  ) {
    if (target) target.textContent = message;
  }

  function sourcePath(documentId) {
    if (documentId === "FINAL_PROJECT") return "final-project/";
    if (/^\d{2}-MODULE$/.test(documentId)) return `module/${documentId}/`;
    if (/^\d{2}-P\d{2}$/.test(documentId)) return `practice/${documentId}/`;
    if (/^\d{2}-\d{3}$/.test(documentId)) return `lesson/${documentId}/`;
    return "highlights/";
  }

  function sourceHref(item) {
    return `${root}${sourcePath(item.documentId)}?annotation=${encodeURIComponent(item.id)}#highlight-workspace`;
  }

  function entryFor(documentId) {
    if (documentId === "FINAL_PROJECT")
      return {
        id: documentId,
        title: "От первого клиента до сделки",
        module: "Итоговый проект",
        kind: "final_project",
      };
    return (
      state.index?.entries?.[documentId] || {
        id: documentId,
        title: documentId,
        module: documentId.slice(0, 2),
        kind: "theory",
      }
    );
  }

  function itemLocation(item) {
    if (!article || item.documentId !== pageDocId) return null;
    return core.locate(item, state.blocks);
  }

  function rangesForOffsets(start, end) {
    const offsets = blockStarts();
    const output = [];
    for (const [index, block] of state.blocks.entries()) {
      const blockStart = offsets[index];
      const blockEnd = blockStart + block.text.length;
      if (blockEnd <= start || blockStart >= end) continue;
      const from = Math.max(0, start - blockStart);
      const to = Math.min(block.text.length, end - blockStart);
      const map = block.map;
      if (to <= from || !map.startPoints[from] || !map.endPoints[to - 1])
        continue;
      try {
        const range = document.createRange();
        range.setStart(
          map.startPoints[from].node,
          map.startPoints[from].offset,
        );
        range.setEnd(map.endPoints[to - 1].node, map.endPoints[to - 1].offset);
        output.push(range);
      } catch {
        // A changed DOM invalidates only the paint, never the saved quote.
      }
    }
    return output;
  }

  function paintHighlights() {
    if (
      !article ||
      !window.CSS?.highlights ||
      typeof window.Highlight !== "function"
    )
      return;
    const ranges = [];
    for (const item of Object.values(state.current.annotations?.items || {})) {
      if (item.deletedAt || item.documentId !== pageDocId) continue;
      const located = itemLocation(item);
      if (located?.status === "anchored")
        ranges.push(...rangesForOffsets(located.start, located.end));
    }
    try {
      if (ranges.length)
        CSS.highlights.set("sales-os-highlights", new Highlight(...ranges));
      else CSS.highlights.delete("sales-os-highlights");
    } catch {
      CSS.highlights.delete("sales-os-highlights");
    }
  }

  function appendText(parent, tag, value, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = value;
    parent.append(node);
    return node;
  }

  function button(label, action, id, className = "btn smallbtn") {
    const control = document.createElement("button");
    control.type = "button";
    control.className = className;
    control.textContent = label;
    control.dataset[action] = id;
    return control;
  }

  function dateLabel(value) {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "long",
    }).format(new Date(value));
  }

  function annotationCard(item, { catalogCard = false, trash = false } = {}) {
    const card = document.createElement("article");
    card.className = catalogCard ? "highlight-catalog-card" : "highlight-item";
    card.dataset.highlightId = item.id;
    const itemHead = document.createElement("div");
    itemHead.className = catalogCard
      ? "highlight-catalog-card-head row wrap"
      : "highlight-item-head row wrap";
    const source = entryFor(item.documentId);
    const sourceLink = document.createElement("a");
    sourceLink.href = sourceHref(item);
    sourceLink.textContent = source.title;
    const meta = document.createElement("span");
    meta.className = catalogCard ? "highlight-catalog-meta" : "small muted";
    meta.textContent = `${source.module === "Итоговый проект" ? source.module : `Модуль ${source.module}`} · ${item.deletedAt ? "в корзине" : item.reviewAt ? `повтор ${dateLabel(item.reviewAt)}` : "без повтора"}`;
    itemHead.append(sourceLink, meta);
    card.append(itemHead);
    appendText(card, "blockquote", item.quote, "highlight-quote");
    if (item.comment) appendText(card, "p", item.comment, "highlight-comment");
    if (item.anchorQuote !== item.quote && !item.deletedAt)
      appendText(
        card,
        "p",
        `Текущая формулировка в материале: ${item.anchorQuote}`,
        "highlight-changed",
      );
    const location = itemLocation(item);
    if (
      item.documentId === pageDocId &&
      location &&
      location.status !== "anchored" &&
      !item.deletedAt
    ) {
      const changed = document.createElement("p");
      changed.className = "highlight-changed";
      changed.textContent =
        location.status === "moved"
          ? "Нашлось одно точное совпадение в другом месте. Проверьте его перед переносом заметки."
          : "Место изменилось или цитата встречается несколько раз. Выберите новый фрагмент вручную; исходная заметка сохранена.";
      card.append(changed);
      if (location.status === "moved")
        card.append(
          button(
            "Принять новое место",
            "highlightAcceptMove",
            item.id,
            "btn smallbtn",
          ),
        );
      else
        card.append(
          button(
            "Выбрать новое место",
            "highlightStartReanchor",
            item.id,
            "btn smallbtn",
          ),
        );
    }
    if (trash) {
      card.append(button("Восстановить", "highlightRestore", item.id));
      return card;
    }

    const editor = document.createElement("form");
    editor.className = "highlight-edit";
    editor.hidden = true;
    const label = document.createElement("label");
    label.textContent = "Комментарий к фрагменту";
    const field = document.createElement("textarea");
    field.maxLength = 5000;
    field.value = item.comment;
    label.append(field);
    const editActions = document.createElement("div");
    editActions.className = "row wrap";
    const save = document.createElement("button");
    save.type = "submit";
    save.className = "btn primary smallbtn";
    save.textContent = "Сохранить комментарий";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn smallbtn";
    cancel.textContent = "Отмена";
    cancel.addEventListener("click", () => {
      editor.hidden = true;
    });
    editActions.append(save, cancel);
    editor.append(label, editActions);
    editor.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await mutateAnnotation((annotations) =>
          core.editComment(annotations, item.id, item.revision, field.value),
        );
        await renderAll();
        statusMessage(
          "Комментарий сохранён.",
          $(catalog, "[data-highlight-catalog-status]"),
        );
      } catch (error) {
        statusMessage(error.message || "Не удалось сохранить комментарий.");
      }
    });
    card.append(editor);
    const actions = document.createElement("div");
    actions.className = "highlight-item-actions";
    const sourceAction = document.createElement("a");
    sourceAction.className = "btn smallbtn";
    sourceAction.href = sourceHref(item);
    sourceAction.textContent = "К месту в материале";
    const edit = button("Изменить заметку", "highlightEdit", item.id);
    edit.addEventListener("click", () => {
      editor.hidden = false;
      field.focus();
    });
    const reviewSelect = document.createElement("select");
    reviewSelect.className = "status-select highlight-review-delay";
    reviewSelect.setAttribute("aria-label", "Срок повтора фрагмента");
    for (const [value, labelText] of [
      [1, "Завтра"],
      [3, "Через 3 дня"],
      [7, "Через неделю"],
    ]) {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = labelText;
      reviewSelect.append(option);
    }
    reviewSelect.dataset.highlightDelay = item.id;
    const schedule = button(
      item.reviewAt ? "Перенести повтор" : "Повторить фрагмент",
      "highlightSchedule",
      item.id,
    );
    schedule.dataset.days = reviewSelect.value;
    reviewSelect.addEventListener("change", () => {
      schedule.dataset.days = reviewSelect.value;
    });
    const remove = button("В корзину", "highlightDelete", item.id);
    actions.append(sourceAction, edit, reviewSelect, schedule, remove);
    card.append(actions);
    return card;
  }

  function renderWorkspace() {
    if (!workspace) return;
    const list = $(workspace, "[data-highlight-items]");
    const trashList = $(workspace, "[data-highlight-trash-items]");
    const trash = $(workspace, "[data-highlight-trash]");
    const pageCount = $(workspace, "[data-highlight-page-count]");
    const records = Object.values(state.current.annotations?.items || {});
    const active = records
      .filter((item) => !item.deletedAt && item.documentId === pageDocId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    const deleted = records
      .filter((item) => item.deletedAt && item.documentId === pageDocId)
      .sort((a, b) => b.deletedAt - a.deletedAt);
    list.replaceChildren(...active.map((item) => annotationCard(item)));
    if (!active.length)
      appendText(
        list,
        "p",
        "На этой странице пока нет сохранённых фрагментов.",
        "small muted",
      );
    trashList.replaceChildren(
      ...deleted.map((item) => annotationCard(item, { trash: true })),
    );
    trash.hidden = deleted.length === 0;
    $(workspace, "[data-highlight-trash-count]").textContent = String(
      deleted.length,
    );
    pageCount.textContent = String(active.length);
    const support = $(workspace, "[data-highlight-support]");
    if (support)
      support.hidden = Boolean(
        window.CSS?.highlights && typeof window.Highlight === "function",
      );
    paintHighlights();
    const query = new URLSearchParams(location.search).get("annotation");
    if (query && !state.queryHandled) {
      const item = currentItem(query);
      if (item && item.documentId === pageDocId && !item.deletedAt) {
        const card = list.querySelector(`[data-highlight-id="${item.id}"]`);
        if (card) {
          state.queryHandled = true;
          state.reanchorId =
            itemLocation(item)?.status === "anchored" ? "" : item.id;
          if (state.reanchorId) {
            card.scrollIntoView({ behavior: "auto", block: "center" });
            const manual = $(workspace, ".highlight-manual");
            if (manual) manual.open = true;
            const cancel = $(workspace, "[data-highlight-cancel]");
            if (cancel) cancel.hidden = false;
            $(workspace, "[data-highlight-quote]").value =
              item.anchorQuote || item.quote;
            statusMessage(
              "Проверьте привязку. Если место изменилось, выберите абзац ниже и сохраните новую цитату.",
            );
          } else {
            const located = itemLocation(item);
            if (located?.status === "anchored") {
              const match = rangesForOffsets(located.start, located.end)[0];
              requestAnimationFrame(() => {
                const node = match?.startContainer;
                const target =
                  node instanceof Element ? node : node?.parentElement;
                target?.scrollIntoView({ behavior: "smooth", block: "center" });
              });
            }
          }
        }
      }
    }
  }

  function renderCatalog() {
    if (!catalog) return;
    const list = $(catalog, "[data-highlight-catalog-list]");
    const empty = $(catalog, "[data-highlight-empty]");
    const query = normalize(
      $(catalog, "[data-highlight-search]")?.value || "",
    ).toLocaleLowerCase("ru");
    const module = $(catalog, "[data-highlight-module]")?.value || "";
    const scope = $(catalog, "[data-highlight-scope]")?.value || "active";
    const all = Object.values(state.current.annotations?.items || {});
    const visible = all
      .filter((item) => {
        if (scope === "active" && item.deletedAt) return false;
        if (scope === "deleted" && !item.deletedAt) return false;
        if (
          module &&
          (item.documentId === "FINAL_PROJECT"
            ? "extra"
            : item.documentId.slice(0, 2)) !== module
        )
          return false;
        const source = entryFor(item.documentId);
        const haystack = normalize(
          `${item.quote} ${item.comment} ${source.title}`,
        ).toLocaleLowerCase("ru");
        return !query || haystack.includes(query);
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
    list.replaceChildren(
      ...visible.map((item) =>
        annotationCard(item, {
          catalogCard: true,
          trash: Boolean(item.deletedAt),
        }),
      ),
    );
    empty.hidden = visible.length > 0;
    const countLabel = `${visible.length} ${visible.length === 1 ? "фрагмент" : "фрагментов"}`;
    $(catalog, "[data-highlight-catalog-status]").textContent =
      state.catalogIndexError
        ? `Названия материалов не загрузились. Доступно: ${countLabel}; поиск работает по цитате и комментарию.`
        : countLabel;
    catalog.setAttribute("aria-busy", "false");
  }

  function renderReview() {
    if (!review) return;
    const dueList = $(review, "[data-highlight-review-due-list]");
    const upcomingList = $(review, "[data-highlight-review-upcoming-list]");
    const dueGroup = $(review, "[data-highlight-review-due-group]");
    const upcomingGroup = $(review, "[data-highlight-review-upcoming-group]");
    const all = Object.values(state.current.annotations?.items || {}).filter(
      (item) => !item.deletedAt && item.reviewAt > 0,
    );
    const due = all
      .filter((item) => item.reviewAt <= now())
      .sort((a, b) => a.reviewAt - b.reviewAt);
    const upcoming = all
      .filter((item) => item.reviewAt > now())
      .sort((a, b) => a.reviewAt - b.reviewAt);
    dueList.replaceChildren(...due.map((item) => reviewCard(item)));
    upcomingList.replaceChildren(...upcoming.map((item) => reviewCard(item)));
    dueGroup.hidden = due.length === 0;
    upcomingGroup.hidden = upcoming.length === 0;
    $(review, "[data-highlight-review-due-count]").textContent = String(
      due.length,
    );
    review.hidden = all.length === 0;
  }

  function reviewCard(item) {
    const card = document.createElement("article");
    card.className = "highlight-review-card";
    card.dataset.highlightReviewId = item.id;
    const head = document.createElement("div");
    head.className = "highlight-review-card-head row wrap";
    const link = document.createElement("a");
    link.href = sourceHref(item);
    link.textContent = entryFor(item.documentId).title;
    const due = document.createElement("span");
    due.className = "badge";
    due.textContent =
      item.reviewAt <= now()
        ? "Пора вспомнить"
        : `Повтор ${dateLabel(item.reviewAt)}`;
    head.append(link, due);
    appendText(card, "blockquote", item.quote, "highlight-quote");
    if (item.comment) {
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "Открыть свою заметку";
      details.append(summary);
      appendText(details, "p", item.comment, "highlight-comment");
      card.append(details);
    }
    const label = document.createElement("label");
    label.textContent =
      "Сначала вспомните: что означает этот фрагмент и как применить его?";
    label.htmlFor = `highlight-recall-${item.id}`;
    const answer = document.createElement("textarea");
    answer.id = label.htmlFor;
    answer.value = item.recallDraft;
    answer.maxLength = 10000;
    answer.dataset.highlightRecallId = item.id;
    answer.setAttribute("aria-label", label.textContent);
    card.append(head, label, answer);
    const actions = document.createElement("div");
    actions.className = "highlight-review-actions";
    const delay = document.createElement("select");
    delay.className = "status-select highlight-review-delay";
    delay.setAttribute("aria-label", "Новый срок повтора");
    for (const [value, text] of [
      [1, "Завтра"],
      [3, "Через 3 дня"],
      [7, "Через неделю"],
    ]) {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = text;
      delay.append(option);
    }
    delay.dataset.highlightReviewDelay = item.id;
    const move = button("Перенести", "highlightReviewReschedule", item.id);
    move.dataset.days = delay.value;
    delay.addEventListener("change", () => {
      move.dataset.days = delay.value;
    });
    const complete = button(
      "Отметить просмотренным",
      "highlightReviewComplete",
      item.id,
      "btn primary smallbtn",
    );
    actions.append(delay, move, complete);
    card.append(actions);
    return card;
  }

  async function renderAll() {
    const token = ++state.renderToken;
    try {
      state.current = await store.getState();
      if (token !== state.renderToken) return;
      const badge = document.querySelector("[data-review-count]");
      if (badge) {
        const duePages = Object.values(state.current.revisitQueue || {}).filter(
          (item) => item.dueAt <= now(),
        ).length;
        const dueHighlights = Object.values(
          state.current.annotations?.items || {},
        ).filter(
          (item) =>
            !item.deletedAt && item.reviewAt > 0 && item.reviewAt <= now(),
        ).length;
        const dueCount = duePages + dueHighlights;
        badge.textContent = String(dueCount);
        badge.hidden = dueCount === 0;
        badge.setAttribute("aria-label", `${dueCount} повтора пора выполнить`);
      }
      renderWorkspace();
      renderCatalog();
      renderReview();
    } catch {
      const error = $(catalog, "[data-highlight-catalog-error]");
      if (error) error.hidden = false;
      statusMessage("Не удалось прочитать локальный каталог.");
    }
  }

  function showCapture(capture) {
    state.pending = capture;
    const action = $(workspace, "[data-highlight-selection-action]");
    const label = $(workspace, "[data-highlight-selection-label]");
    if (action) action.disabled = !capture;
    if (label)
      label.textContent = capture
        ? `Выбрано ${capture.quote.length} знаков. Откройте форму, чтобы добавить комментарий.`
        : "Выберите текст в статье или добавьте абзац вручную.";
    if (toolbar) {
      toolbar.hidden =
        !capture || window.matchMedia("(max-width: 760px)").matches;
      if (capture) {
        const selection = getSelection();
        const rect = selection?.rangeCount
          ? selection.getRangeAt(0).getBoundingClientRect()
          : null;
        if (rect) {
          toolbar.style.top = `${Math.max(8, rect.top - toolbar.offsetHeight - 8)}px`;
          toolbar.style.left = `${Math.max(8, Math.min(window.innerWidth - toolbar.offsetWidth - 8, rect.left + rect.width / 2 - toolbar.offsetWidth / 2))}px`;
        }
      }
    }
  }

  function openCaptureForm(capture = state.pending) {
    if (!capture || !workspace) return;
    const details = $(workspace, ".highlight-manual");
    if (details) details.open = true;
    const select = $(workspace, "[data-highlight-block-select]");
    const quote = $(workspace, "[data-highlight-quote]");
    if (select && capture.blockIds.length === 1)
      select.value = capture.blockIds[0];
    if (quote) quote.value = capture.quote;
    workspace.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => $(workspace, "[data-highlight-comment]")?.focus(), 250);
  }

  function manualCapture(quoteValue, blockId) {
    const quote = normalize(quoteValue);
    const block = state.blocks.find((candidate) => candidate.id === blockId);
    if (!block || !quote) throw Error("Выберите абзац и укажите цитату.");
    const positions = [];
    let cursor = -1;
    while ((cursor = block.text.indexOf(quote, cursor + 1)) !== -1)
      positions.push(cursor);
    if (positions.length !== 1)
      throw Error(
        "В выбранном абзаце цитата должна встречаться один раз. Уточните фразу или выберите другой абзац.",
      );
    const start = positions[0];
    const end = start + quote.length;
    return {
      documentId: pageDocId,
      blockIds: [block.id],
      quote,
      anchorQuote: quote,
      contextBefore: block.text.slice(Math.max(0, start - 240), start),
      contextAfter: block.text.slice(end, end + 240),
      textVersion: core.versionFor(state.blocks),
    };
  }

  function initWorkspace() {
    if (!workspace || !article) return;
    const select = $(workspace, "[data-highlight-block-select]");
    for (const block of state.blocks) {
      const option = document.createElement("option");
      option.value = block.id;
      const path = block.node.tagName.match(/^H[2-6]$/)
        ? "Заголовок"
        : block.text;
      option.textContent = `${path.slice(0, 120)}${path.length > 120 ? "…" : ""}`;
      select.append(option);
    }
    select.addEventListener("change", () => {
      state.pending = null;
      const selected = state.blocks.find((block) => block.id === select.value);
      const quote = $(workspace, "[data-highlight-quote]");
      if (selected && quote) quote.value = selected.text;
    });
    $(workspace, "[data-highlight-selection-action]")?.addEventListener(
      "click",
      () => openCaptureForm(),
    );
    $(toolbar, "[data-highlight-toolbar-action]")?.addEventListener(
      "click",
      () => openCaptureForm(),
    );
    $(workspace, "[data-highlight-cancel]")?.addEventListener("click", () => {
      state.reanchorId = "";
      $(workspace, "[data-highlight-quote]").value = "";
      $(workspace, "[data-highlight-cancel]").hidden = true;
      statusMessage("Перепривязка отменена; сохранённая цитата не изменена.");
    });
    $(workspace, "[data-highlight-form]")?.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const quote = $(form, "[data-highlight-quote]").value;
        const comment = $(form, "[data-highlight-comment]").value;
        const currentAnchor =
          state.pending && normalize(quote) === state.pending.quote
            ? state.pending
            : manualCapture(quote, select.value);
        const reanchorId = state.reanchorId;
        try {
          if (reanchorId) {
            const item = currentItem(reanchorId);
            if (!item) throw Error("Выделение больше не найдено.");
            await mutateAnnotation((annotations) =>
              core.reanchor(annotations, item.id, item.revision, currentAnchor),
            );
            statusMessage(
              "Привязка обновлена. Исходная цитата и комментарий сохранены.",
            );
          } else {
            const id = crypto.randomUUID();
            await mutateAnnotation((annotations) =>
              core.create(annotations, currentAnchor, comment, now(), id),
            );
            statusMessage("Фрагмент сохранён на этом устройстве.");
          }
          state.pending = null;
          state.reanchorId = "";
          $(form, "[data-highlight-comment]").value = "";
          form.reset();
          state.blocks = buildBlocks();
          await renderAll();
        } catch (error) {
          statusMessage(error.message || "Не удалось сохранить выделение.");
        }
      },
    );
    workspace.addEventListener(
      "click",
      (event) => void handleAnnotationAction(event),
    );
    document.addEventListener("selectionchange", () => {
      if (!article) return;
      const selection = getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) return;
      const range = selection.getRangeAt(0);
      if (!article.contains(range.commonAncestorContainer)) return;
      showCapture(selectionCapture(range));
    });
    article.addEventListener("mouseup", () => {
      const selection = getSelection();
      if (selection && !selection.isCollapsed && selection.rangeCount)
        showCapture(selectionCapture(selection.getRangeAt(0)));
    });
    article.addEventListener("keyup", (event) => {
      if (
        !event.shiftKey &&
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      )
        return;
      const selection = getSelection();
      if (
        selection &&
        !selection.isCollapsed &&
        selection.rangeCount &&
        article.contains(selection.anchorNode)
      )
        showCapture(selectionCapture(selection.getRangeAt(0)));
    });
    window.addEventListener("resize", () => {
      if (toolbar && window.matchMedia("(max-width: 760px)").matches)
        toolbar.hidden = true;
    });
  }

  async function handleAnnotationAction(event) {
    const target =
      event.target instanceof Element ? event.target.closest("button") : null;
    const id =
      target?.dataset.highlightId ||
      target?.dataset.highlightAcceptMove ||
      target?.dataset.highlightStartReanchor ||
      target?.dataset.highlightRestore ||
      target?.dataset.highlightDelete ||
      target?.dataset.highlightSchedule;
    if (!target || !id) return;
    try {
      if (target.dataset.highlightRestore) {
        const item = currentItem(id);
        await mutateAnnotation((annotations) =>
          core.restore(annotations, id, item.revision),
        );
      } else if (target.dataset.highlightDelete) {
        const item = currentItem(id);
        await mutateAnnotation((annotations) =>
          core.softDelete(annotations, id, item.revision),
        );
      } else if (target.dataset.highlightSchedule) {
        const days = Number(target.dataset.days);
        await mutateAnnotation((annotations) =>
          core.schedule(annotations, id, days),
        );
      } else if (target.dataset.highlightAcceptMove) {
        const item = currentItem(id);
        const located = itemLocation(item);
        if (located?.status !== "moved")
          throw Error("Новое место больше не доступно. Обновите страницу.");
        const capture = {
          documentId: item.documentId,
          blockIds: located.blockIds,
          quote: item.quote,
          anchorQuote: item.anchorQuote,
          contextBefore: located.contextBefore,
          contextAfter: located.contextAfter,
          textVersion: core.versionFor(state.blocks),
        };
        await mutateAnnotation((annotations) =>
          core.reanchor(annotations, id, item.revision, capture),
        );
      } else if (target.dataset.highlightStartReanchor) {
        state.reanchorId = id;
        const item = currentItem(id);
        const details = $(workspace, ".highlight-manual");
        if (details) details.open = true;
        $(workspace, "[data-highlight-quote]").value =
          item.anchorQuote || item.quote;
        $(workspace, "[data-highlight-cancel]").hidden = false;
        statusMessage(
          "Выберите абзац и уточните цитату, затем сохраните новую привязку.",
        );
        workspace.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      await renderAll();
      if (target.dataset.highlightRestore)
        statusMessage("Фрагмент восстановлен.");
      if (target.dataset.highlightDelete)
        statusMessage("Перемещено в корзину. Его можно восстановить.");
      if (target.dataset.highlightSchedule)
        statusMessage("Повтор добавлен в очередь.");
      if (target.dataset.highlightAcceptMove)
        statusMessage("Новое место подтверждено.");
    } catch (error) {
      statusMessage(error.message || "Не удалось обновить выделение.");
    }
  }

  async function initCatalog() {
    if (!catalog) return;
    $(catalog, "[data-highlight-search]")?.addEventListener(
      "input",
      renderCatalog,
    );
    for (const filter of catalog.querySelectorAll(
      "[data-highlight-module],[data-highlight-scope]",
    ))
      filter.addEventListener("change", renderCatalog);
    catalog.addEventListener(
      "click",
      (event) => void handleAnnotationAction(event),
    );
    try {
      const response = await fetch(`${root}assets/client-index.json`);
      if (!response.ok) throw Error("Index unavailable");
      const index = await response.json();
      state.index = index;
      const select = $(catalog, "[data-highlight-module]");
      const modules = [
        ...new Set(
          Object.values(index.entries || {})
            .map((entry) => entry.module)
            .filter((value) => /^\d{2}$/.test(value)),
        ),
      ].sort();
      for (const module of modules) {
        const option = document.createElement("option");
        option.value = module;
        option.textContent = `Модуль ${module}`;
        select.append(option);
      }
    } catch {
      state.catalogIndexError = true;
    }
  }

  function initReview() {
    if (!review) return;
    const queue = document.querySelector("[data-review-queue]");
    queue?.addEventListener("input", (event) => {
      const field = event.target.closest("[data-highlight-recall-id]");
      if (!field) return;
      const id = field.dataset.highlightRecallId;
      clearTimeout(timers.get(id));
      timers.set(
        id,
        setTimeout(async () => {
          try {
            await mutateAnnotation((annotations) =>
              core.saveRecall(annotations, id, field.value),
            );
            const status = document.createElement("span");
            status.className = "small muted";
            status.textContent = "Ответ сохранён";
            field.setAttribute(
              "aria-describedby",
              `highlight-recall-status-${id}`,
            );
            status.id = `highlight-recall-status-${id}`;
            field.insertAdjacentElement("afterend", status);
            setTimeout(() => status.remove(), 1800);
          } catch {
            field.setAttribute("aria-invalid", "true");
          }
        }, 450),
      );
    });
    queue?.addEventListener("click", async (event) => {
      const target =
        event.target instanceof Element ? event.target.closest("button") : null;
      const id =
        target?.dataset.highlightReviewReschedule ||
        target?.dataset.highlightReviewComplete;
      if (!target || !id) return;
      try {
        const answer = target
          .closest(".highlight-review-card")
          ?.querySelector("[data-highlight-recall-id]")?.value;
        clearTimeout(timers.get(id));
        await mutateAnnotation((annotations) => {
          const saved =
            typeof answer === "string"
              ? core.saveRecall(annotations, id, answer)
              : annotations;
          return target.dataset.highlightReviewComplete
            ? core.completeReview(saved, id)
            : core.reschedule(saved, id, Number(target.dataset.days));
        });
        await renderAll();
      } catch (error) {
        const card = target.closest(".highlight-review-card");
        if (card)
          appendText(
            card,
            "p",
            error.message || "Не удалось обновить повтор.",
            "highlight-changed",
          );
      }
    });
  }

  async function init() {
    if (!pageDocId && !catalog && !review) return;
    if (article) {
      state.blocks = buildBlocks();
      initWorkspace();
    }
    const catalogReady = initCatalog();
    initReview();
    await catalogReady;
    await renderAll();
    store.subscribe((message) => {
      if (!["state", "replace"].includes(message.type)) return;
      void renderAll();
    });
  }

  void init();
})();
