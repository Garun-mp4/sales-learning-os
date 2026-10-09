/* M6: editable local-only template catalog and safe text preview. */
(() => {
  const root = document.querySelector("[data-template-library]");
  const article = document.querySelector(
    '[data-template-copy][data-library-id="templates"]',
  );
  if (!root || !article) return;

  const core = window.SalesOSTemplates;
  const store = window.SalesOSUserStore;
  const form = root.querySelector("[data-template-form]");
  const list = root.querySelector("[data-template-list]");
  const status = root.querySelector("[data-template-save-status]");
  const queryInput = root.querySelector("[data-template-search]");
  const filterButtons = [...root.querySelectorAll("[data-template-filter]")];
  const categoryLabels = {
    first_message: "Первое сообщение",
    discovery: "Выяснение задачи",
    proposal: "Предложение",
    objection: "Возражение",
    follow_up: "Follow-up",
    other: "Другое",
  };
  const inputs = Object.fromEntries(
    [
      "title",
      "category",
      "body",
      "tags",
      "whenToUse",
      "resultNote",
      "favorite",
    ].map((name) => [name, form.elements.namedItem(name)]),
  );
  let state = store.initialState;
  let starters = [];
  let selectedId = null;
  let baseline = null;
  let baseRevision = null;
  let filter = "active";
  let busy = false;
  let hasConflict = false;

  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };

  function currentItem() {
    return selectedId
      ? state.personalTemplates.items[selectedId] || null
      : null;
  }

  function formFields() {
    return {
      title: inputs.title.value,
      category: inputs.category.value,
      body: inputs.body.value,
      tags: core.parseTags(inputs.tags.value),
      whenToUse: form.elements.namedItem("whenToUse").value,
      resultNote: form.elements.namedItem("resultNote").value,
      favorite: inputs.favorite.checked,
      archived: false,
    };
  }

  function signature(value) {
    return JSON.stringify({
      title: value.title,
      category: value.category,
      body: value.body,
      tags: value.tags,
      whenToUse: value.whenToUse,
      resultNote: value.resultNote,
      favorite: value.favorite,
      archived: value.archived,
    });
  }

  function itemFields(item) {
    return {
      title: item.title,
      category: item.category,
      body: item.body,
      tags: [...item.tags],
      whenToUse: item.whenToUse,
      resultNote: item.resultNote,
      favorite: item.favorite,
      archived: item.archived,
    };
  }

  function isDirty() {
    if (form.hidden) return false;
    return selectedId === null || signature(formFields()) !== baseline;
  }

  function saveStatus(message, conflict = false) {
    status.textContent = message;
    hasConflict = conflict;
    root.querySelector("[data-template-fork]").hidden = !conflict;
  }

  function routeTo(id) {
    const url = new URL(location.href);
    if (id) url.searchParams.set("template", id);
    else url.searchParams.delete("template");
    history.replaceState(null, "", url);
  }

  function writeForm(item, isNew = false) {
    selectedId = item?.id || null;
    baseRevision = item?.revision ?? null;
    baseline = item ? signature(itemFields(item)) : null;
    root.querySelector("[data-template-empty]").hidden = true;
    form.hidden = false;
    form.reset();
    if (item) {
      inputs.title.value = item.title;
      inputs.category.value = item.category;
      inputs.body.value = item.body;
      inputs.tags.value = item.tags.join(", ");
      form.elements.namedItem("whenToUse").value = item.whenToUse;
      form.elements.namedItem("resultNote").value = item.resultNote;
      inputs.favorite.checked = item.favorite;
    }
    const editorHeading = root.querySelector("[data-template-editor-heading]");
    editorHeading.textContent = isNew ? "Новый шаблон" : item.title;
    editorHeading.tabIndex = -1;
    const sourceNode = root.querySelector("[data-template-source]");
    sourceNode.hidden = !item?.source;
    sourceNode.textContent = item?.source
      ? `Личная копия источника «${item.source.title}» · зафиксированная версия ${item.source.version}. Публичный источник не изменяется.`
      : "";
    const saveButton = root.querySelector("[data-template-save]");
    saveButton.textContent = isNew ? "Сохранить шаблон" : "Сохранить изменения";
    root.querySelector("[data-template-archive]").hidden = isNew;
    root.querySelector("[data-template-versions]").hidden = !item;
    root.querySelector("[data-template-fork]").hidden = true;
    root.querySelector("[data-template-copy-fallback]").hidden = true;
    root.querySelector("[data-template-version-name]").value = "";
    root.querySelector("[data-template-project]").value = "";
    for (const variable of root.querySelectorAll("[data-template-variable]"))
      variable.value = "";
    saveStatus(
      isNew ? "Черновик не сохранён." : "Сохранено на этом устройстве.",
    );
    renderVersions(item);
    renderPreview();
    updateActionState();
  }

  function closeEditor(
    message = "Выберите шаблон или добавьте стартовую основу.",
  ) {
    selectedId = null;
    baseline = null;
    baseRevision = null;
    form.hidden = true;
    root.querySelector("[data-template-empty]").hidden = false;
    root.querySelector("[data-template-empty] p").textContent = message;
    routeTo(null);
  }

  function updateActionState() {
    const isNew = selectedId === null;
    root.querySelector("[data-template-save]").disabled =
      busy || (!isNew && !isDirty());
    root.querySelector("[data-template-save-version]").disabled = busy || isNew;
    root.querySelector("[data-template-archive]").disabled = busy;
  }

  function renderList() {
    if (!list) return;
    list.replaceChildren();
    const needle = queryInput.value.trim().toLocaleLowerCase("ru-RU");
    let items = Object.values(state.personalTemplates.items).filter((item) => {
      if (filter === "archived" ? !item.archived : item.archived) return false;
      if (filter === "favorites" && !item.favorite) return false;
      if (!needle) return true;
      return [
        item.title,
        item.body,
        item.whenToUse,
        item.resultNote,
        ...item.tags,
      ]
        .join(" ")
        .toLocaleLowerCase("ru-RU")
        .includes(needle);
    });
    items = items.sort(
      (left, right) =>
        Number(right.favorite) - Number(left.favorite) ||
        right.updatedAt - left.updatedAt,
    );
    const total = Object.values(state.personalTemplates.items).filter((item) =>
      filter === "archived" ? item.archived : !item.archived,
    ).length;
    root.querySelector("[data-template-count]").textContent = needle
      ? `${items.length} из ${total} · поиск только на устройстве`
      : `${total} · поиск только на устройстве`;
    if (!items.length) {
      list.append(
        el(
          "p",
          filter === "archived"
            ? "Архив пуст. Архивирование сохраняет шаблон и все его версии."
            : needle
              ? "По этому запросу личных шаблонов нет."
              : filter === "favorites"
                ? "Пока нет избранных шаблонов."
                : "Сохранённых шаблонов пока нет.",
          "small muted template-list-empty",
        ),
      );
    }
    for (const item of items) {
      const card = el("article", undefined, "template-card");
      const title = el("button", item.title, "template-card-title");
      title.type = "button";
      title.dataset.templateOpen = item.id;
      title.setAttribute("aria-current", String(item.id === selectedId));
      const badge = el("span", categoryLabels[item.category], "badge");
      const tags = el(
        "p",
        item.tags.length
          ? item.tags.map((tag) => `#${tag}`).join(" · ")
          : "Без тегов",
        "small muted",
      );
      const star = el(
        "button",
        item.favorite ? "Убрать из избранного" : "В избранное",
        "template-card-favorite",
      );
      star.type = "button";
      star.dataset.templateFavorite = item.id;
      star.hidden = filter === "archived";
      star.setAttribute("aria-pressed", String(item.favorite));
      star.setAttribute(
        "aria-label",
        `${item.favorite ? "Убрать из избранного" : "В избранное"}: ${item.title}`,
      );
      const meta = el(
        "p",
        `${item.versions.length} сохранённых версий · ${new Date(item.updatedAt).toLocaleDateString("ru-RU")}`,
        "small muted",
      );
      card.append(title, badge, tags, meta, star);
      list.append(card);
      if (filter === "archived") {
        const restore = el("button", "Восстановить из архива", "btn smallbtn");
        restore.type = "button";
        restore.dataset.templateRestoreArchived = item.id;
        card.append(restore);
      }
    }
  }

  function renderVersions(item) {
    const panel = root.querySelector("[data-template-versions]");
    const versionList = root.querySelector("[data-template-version-list]");
    const count = root.querySelector("[data-template-version-count]");
    versionList.replaceChildren();
    if (!item) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    count.textContent = `· ${item.versions.length}`;
    if (!item.versions.length) {
      versionList.append(
        el("p", "Сохранённых версий пока нет.", "small muted"),
      );
      return;
    }
    for (const version of [...item.versions].reverse()) {
      const row = el("div", undefined, "template-version-row");
      const details = el(
        "div",
        `${version.name} · ${new Date(version.createdAt).toLocaleString("ru-RU")}`,
        "template-version-meta",
      );
      const restore = el("button", "Восстановить", "btn smallbtn");
      restore.type = "button";
      restore.dataset.templateRestoreVersion = version.id;
      row.append(details, restore);
      versionList.append(row);
    }
  }

  function projectOptions() {
    const select = root.querySelector("[data-template-project]");
    const previous = select.value;
    select.replaceChildren(el("option", "Не использовать проект"));
    select.options[0].value = "";
    const projects = Object.values(state.projects.items)
      .filter((project) => !project.archived)
      .sort((left, right) => left.name.localeCompare(right.name, "ru"));
    for (const project of projects) {
      const option = el("option", project.name);
      option.value = project.id;
      select.append(option);
    }
    if (projects.some((project) => project.id === previous))
      select.value = previous;
  }

  function fillFromProject() {
    const project =
      state.projects.items[root.querySelector("[data-template-project]").value];
    const context = project?.context || {};
    const values = {
      service: context.service || "",
      client: context.audience || "",
      context: [context.context, context.goal, context.constraints]
        .filter((value) => typeof value === "string" && value.trim())
        .join("\n"),
      next_step: project?.draft?.nextStep || "",
    };
    for (const variable of root.querySelectorAll("[data-template-variable]"))
      variable.value = values[variable.dataset.templateVariable];
    root.querySelector("[data-template-copy-fallback]").hidden = true;
    renderPreview();
  }

  function renderPreview() {
    const text = inputs.body.value;
    const values = Object.fromEntries(
      [...root.querySelectorAll("[data-template-variable]")].map((input) => [
        input.dataset.templateVariable,
        input.value,
      ]),
    );
    const preview = core.preview(text, values);
    root.querySelector("[data-template-preview]").textContent = preview.text;
    const previewStatus = root.querySelector("[data-template-preview-status]");
    previewStatus.textContent = !text.trim()
      ? "Добавьте текст шаблона, чтобы увидеть предпросмотр."
      : preview.resolved
        ? "Все переменные заполнены. Готовый текст можно скопировать вручную; он никуда не отправляется."
        : preview.issues.join(". ") + ".";
    root.querySelector("[data-template-copy-preview]").disabled =
      !preview.resolved || busy || !text.trim();
    root.querySelector("[data-template-copy-fallback]").hidden = true;
    return preview;
  }

  function renderStarters() {
    const holder = root.querySelector("[data-template-starters-list]");
    holder.replaceChildren();
    for (const starter of starters) {
      const row = el("div", undefined, "template-starter-row");
      const info = el("div");
      info.append(
        el("strong", starter.title),
        el(
          "span",
          `${categoryLabels[starter.category]} · ${starter.whenToUse}`,
          "small muted",
        ),
      );
      const add = el("button", "Использовать", "btn smallbtn");
      add.type = "button";
      add.dataset.templateStarter = starter.id;
      row.append(info, add);
      holder.append(row);
    }
  }

  function updateFilter(nextFilter) {
    filter = nextFilter;
    for (const button of filterButtons)
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.templateFilter === filter),
      );
    renderList();
  }

  function categoryFor(title) {
    const value = title.toLocaleLowerCase("ru-RU");
    if (/перв|сообщ|контакт/.test(value)) return "first_message";
    if (/потреб|выяс|discovery|диагност/.test(value)) return "discovery";
    if (/предлож|коммерчес|демонстрац|состав кп/.test(value)) return "proposal";
    if (/возраж|дорого|стоимост/.test(value)) return "objection";
    if (/follow|продолж|заверш|follow-up/.test(value)) return "follow_up";
    return "other";
  }

  function headingTitle(heading) {
    const copy = heading.cloneNode(true);
    copy.querySelector(".template-heading-actions")?.remove();
    return copy.textContent.trim();
  }

  function headingText(heading) {
    const chunks = [];
    for (
      let sibling = heading.nextElementSibling;
      sibling && !sibling.matches("h1, h2");
      sibling = sibling.nextElementSibling
    ) {
      const value = sibling.innerText || sibling.textContent || "";
      if (value.trim()) chunks.push(value.trim());
    }
    return chunks.join("\n\n");
  }

  function sourceForHeading(heading, index) {
    return {
      id: `library/templates#${heading.id || index + 1}`,
      version: article.dataset.libraryUpdated || "unknown",
      title: headingTitle(heading),
      body: headingText(heading),
    };
  }

  function withOwnTitle(title) {
    return `${title.slice(0, 104).trim()} — мой вариант`;
  }

  async function mutate(mutator) {
    if (busy) return null;
    busy = true;
    updateActionState();
    try {
      const result = await store.updateState((current) => ({
        ...current,
        personalTemplates: core.validate(
          mutator(core.validate(current.personalTemplates)),
        ),
      }));
      state = result.state;
      projectOptions();
      renderList();
      return result;
    } finally {
      busy = false;
      updateActionState();
    }
  }

  function showStorageResult(result, message) {
    if (!result) return;
    const location = result.durable
      ? "Сохранено на этом устройстве."
      : "Хранилище браузера недоступно; изменение пока есть только в памяти этой вкладки. Скачайте резервную копию до выхода.";
    saveStatus(`${message} ${location}`);
  }

  function isConflict(error) {
    return /другой вкладке|удалён|изменён/i.test(error.message);
  }

  function reportError(error) {
    saveStatus(error.message, isConflict(error));
  }

  async function persistCurrent() {
    const fields = formFields();
    const previousId = selectedId;
    try {
      let result;
      let createdId = null;
      if (previousId) {
        result = await mutate((templates) =>
          core.update(templates, previousId, baseRevision, fields),
        );
      } else {
        result = await mutate((templates) => {
          const next = core.create(templates, fields);
          createdId = Object.keys(next.items).find(
            (id) => !templates.items[id],
          );
          return next;
        });
      }
      if (!result) return;
      const item = state.personalTemplates.items[createdId || previousId];
      if (item) {
        selectedId = item.id;
        routeTo(item.id);
        writeForm(item);
      }
      showStorageResult(result, "Шаблон сохранён.");
    } catch (error) {
      reportError(error);
    }
  }

  async function createFromSource(source, initial) {
    if (isDirty()) {
      saveStatus("Сначала сохраните текущий текст или сбросьте правки.");
      return;
    }
    try {
      let createdId = null;
      const result = await mutate((templates) => {
        const next = core.duplicate(templates, source, initial);
        createdId = Object.keys(next.items).find((id) => !templates.items[id]);
        return next;
      });
      if (!result || !createdId) return;
      selectedId = createdId;
      const item = state.personalTemplates.items[selectedId];
      routeTo(selectedId);
      writeForm(item);
      showStorageResult(result, "Создана отдельная личная копия источника.");
      root.querySelector("[data-template-editor-heading]").focus?.();
    } catch (error) {
      reportError(error);
    }
  }

  function blankTemplate() {
    if (isDirty()) {
      saveStatus("Сначала сохраните текущий текст или сбросьте правки.");
      return;
    }
    const item = {
      title: "",
      category: "first_message",
      body: "",
      tags: [],
      whenToUse: "",
      resultNote: "",
      favorite: false,
      archived: false,
      source: null,
      versions: [],
    };
    routeTo(null);
    writeForm(item, true);
    inputs.title.focus();
  }

  function saveFork() {
    const fields = formFields();
    const original = currentItem();
    if (!original) return;
    const forkedFields = {
      ...fields,
      title: withOwnTitle(fields.title || original.title),
      archived: false,
      favorite: false,
    };
    void (async () => {
      try {
        let createdId = null;
        const result = await mutate((templates) => {
          const next = core.create(templates, {
            ...forkedFields,
            source: original.source,
          });
          createdId = Object.keys(next.items).find(
            (id) => !templates.items[id],
          );
          return next;
        });
        if (!result || !createdId) return;
        selectedId = createdId;
        routeTo(createdId);
        writeForm(state.personalTemplates.items[createdId]);
        showStorageResult(
          result,
          "Несохранённый текст сохранён отдельной копией.",
        );
      } catch (error) {
        reportError(error);
      }
    })();
  }

  async function archiveSelected(archived) {
    const item = currentItem();
    if (!item) return;
    const fields = formFields();
    try {
      const result = await mutate((templates) =>
        core.archive(templates, item.id, baseRevision, archived, fields),
      );
      if (!result) return;
      closeEditor(
        archived
          ? "Заготовка сохранена в архиве."
          : "Выберите шаблон или добавьте стартовую основу.",
      );
      updateFilter(archived ? "archived" : "active");
      showStorageResult(
        result,
        archived
          ? "Шаблон перемещён в архив."
          : "Шаблон восстановлен из архива.",
      );
    } catch (error) {
      reportError(error);
    }
  }

  function wireStaticSources() {
    const headings = [...article.querySelectorAll("h2")];
    headings.forEach((heading, index) => {
      const actions = el("div", undefined, "template-heading-actions");
      const copy = el("button", "Скопировать", "btn smallbtn template-copy");
      copy.type = "button";
      copy.setAttribute(
        "aria-label",
        `Скопировать текст «${headingTitle(heading)}»`,
      );
      copy.addEventListener("click", async () => {
        const source = sourceForHeading(heading, index);
        try {
          if (!navigator.clipboard?.writeText)
            throw Error("clipboard unavailable");
          await navigator.clipboard.writeText(source.body);
          document.querySelector("#toast").textContent = "Текст скопирован";
        } catch {
          document.querySelector("#toast").textContent =
            "Выделите текст шаблона вручную: браузер запретил доступ к буферу";
        }
      });
      const personal = el("button", "Создать свой вариант", "btn smallbtn");
      personal.type = "button";
      personal.setAttribute(
        "aria-label",
        `Создать личную копию «${headingTitle(heading)}»`,
      );
      personal.addEventListener("click", () => {
        const source = sourceForHeading(heading, index);
        void createFromSource(source, {
          title: withOwnTitle(source.title),
          category: categoryFor(source.title),
          body: source.body,
          tags: [],
          whenToUse: "",
          resultNote: "",
          favorite: false,
          archived: false,
        });
      });
      actions.append(copy, personal);
      heading.append(actions);
    });
  }

  root
    .querySelector("[data-template-new]")
    .addEventListener("click", blankTemplate);
  root.querySelector("[data-template-reset]").addEventListener("click", () => {
    if (selectedId === null) {
      closeEditor();
      return;
    }
    const item = state.personalTemplates.items[selectedId];
    if (item) writeForm(item);
    else
      closeEditor(
        "Шаблон изменён в другой вкладке. Сохраните отдельную копию вашего текста.",
      );
  });
  form.addEventListener("input", () => {
    root.querySelector("[data-template-copy-fallback]").hidden = true;
    renderPreview();
    if (hasConflict)
      saveStatus(
        "Есть несохранённый текст. Последняя сохранённая версия уже изменилась в другой вкладке.",
        true,
      );
    else if (isDirty()) saveStatus("Есть несохранённые правки.");
    else saveStatus("Изменения сброшены.");
    updateActionState();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void persistCurrent();
  });
  queryInput.addEventListener("input", renderList);
  filterButtons.forEach((button) =>
    button.addEventListener("click", () =>
      updateFilter(button.dataset.templateFilter),
    ),
  );
  root
    .querySelector("[data-template-starters-list]")
    .addEventListener("click", (event) => {
      const button = event.target.closest("[data-template-starter]");
      if (!button) return;
      const starter = starters.find(
        (candidate) => candidate.id === button.dataset.templateStarter,
      );
      if (!starter) return;
      void createFromSource(
        {
          id: starter.id,
          title: starter.title,
          version: starter.version,
          body: starter.body,
        },
        {
          title: withOwnTitle(starter.title),
          category: starter.category,
          body: starter.body,
          tags: starter.tags,
          whenToUse: starter.whenToUse,
          resultNote: "",
          favorite: false,
          archived: false,
        },
      );
    });
  list.addEventListener("click", (event) => {
    const restore = event.target.closest("[data-template-restore-archived]");
    if (restore) {
      const item =
        state.personalTemplates.items[restore.dataset.templateRestoreArchived];
      if (item)
        void mutate((templates) =>
          core.archive(
            templates,
            item.id,
            item.revision,
            false,
            itemFields(item),
          ),
        )
          .then((result) => {
            if (result)
              showStorageResult(result, "Шаблон восстановлен из архива.");
          })
          .catch(reportError);
      return;
    }
    const favorite = event.target.closest("[data-template-favorite]");
    if (favorite) {
      const item =
        state.personalTemplates.items[favorite.dataset.templateFavorite];
      if (!item) return;
      if (selectedId === item.id && isDirty()) {
        saveStatus("Сначала сохраните или сбросьте правки текущего шаблона.");
        return;
      }
      const fields = itemFields(item);
      fields.favorite = !item.favorite;
      void mutate((templates) => ({
        ...templates,
        items: core.update(templates, item.id, item.revision, fields).items,
      }))
        .then((result) => {
          if (result && selectedId === item.id)
            writeForm(state.personalTemplates.items[item.id]);
        })
        .catch(reportError);
      return;
    }
    const open = event.target.closest("[data-template-open]");
    if (!open) return;
    if (isDirty()) {
      saveStatus("Сначала сохраните текущий текст или сбросьте правки.");
      return;
    }
    const item = state.personalTemplates.items[open.dataset.templateOpen];
    if (!item || item.archived) return;
    routeTo(item.id);
    writeForm(item);
    root.querySelector("[data-template-editor-heading]").focus();
  });
  root
    .querySelector("[data-template-archive]")
    .addEventListener("click", () => {
      void archiveSelected(true);
    });
  root
    .querySelector("[data-template-fork]")
    .addEventListener("click", saveFork);
  root
    .querySelector("[data-template-project]")
    .addEventListener("change", fillFromProject);
  root
    .querySelector("[data-template-copy-preview]")
    .addEventListener("click", async () => {
      const result = renderPreview();
      if (!result.resolved) return;
      try {
        if (!navigator.clipboard?.writeText)
          throw Error("clipboard unavailable");
        await navigator.clipboard.writeText(result.text);
        root.querySelector("[data-template-preview-status]").textContent =
          "Готовый текст скопирован. Сообщение не отправлено.";
      } catch {
        const fallback = root.querySelector("[data-template-copy-fallback]");
        fallback.value = result.text;
        fallback.hidden = false;
        fallback.focus();
        fallback.select();
        root.querySelector("[data-template-preview-status]").textContent =
          "Браузер не разрешил доступ к буферу. Текст выделен: скопируйте его вручную сочетанием Ctrl+C или Cmd+C.";
      }
    });
  root
    .querySelector("[data-template-save-version]")
    .addEventListener("click", async () => {
      const item = currentItem();
      if (!item || (isDirty() && !formFields().title.trim())) {
        saveStatus("Сначала заполните и сохраните шаблон.");
        return;
      }
      try {
        const result = await mutate((templates) => ({
          ...templates,
          items: core.saveVersion(
            templates,
            item.id,
            baseRevision,
            root.querySelector("[data-template-version-name]").value,
            formFields(),
          ).items,
        }));
        if (result) {
          writeForm(state.personalTemplates.items[item.id]);
          showStorageResult(
            result,
            "Текущий текст сохранён как именованная версия.",
          );
        }
      } catch (error) {
        reportError(error);
      }
    });
  root
    .querySelector("[data-template-version-list]")
    .addEventListener("click", (event) => {
      const button = event.target.closest("[data-template-restore-version]");
      if (!button) return;
      if (isDirty()) {
        saveStatus(
          "Сначала сохраните или сбросьте текущие правки. Их нельзя потерять при восстановлении.",
        );
        return;
      }
      const item = currentItem();
      if (!item) return;
      void (async () => {
        try {
          const result = await mutate((templates) => ({
            ...templates,
            items: core.restoreVersion(
              templates,
              item.id,
              baseRevision,
              button.dataset.templateRestoreVersion,
            ).items,
          }));
          if (result) {
            writeForm(state.personalTemplates.items[item.id]);
            showStorageResult(
              result,
              "Версия восстановлена. Прежний текущий текст добавлен в историю.",
            );
          }
        } catch (error) {
          reportError(error);
        }
      })();
    });

  store.subscribe(async () => {
    const latest = await store.getState();
    if (busy) return;
    state = latest;
    projectOptions();
    renderList();
    const selected = currentItem();
    if (!selectedId) return;
    if (!selected || selected.archived || selected.revision !== baseRevision) {
      if (isDirty()) {
        saveStatus(
          "Шаблон изменён в другой вкладке. Текст в редакторе сохранён; создайте отдельную копию.",
          true,
        );
      } else if (selected && !selected.archived) {
        writeForm(selected);
      } else {
        closeEditor("Шаблон изменён или перемещён в архив в другой вкладке.");
      }
    }
  });

  window.addEventListener("beforeunload", (event) => {
    if (!form.hidden && isDirty()) {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  async function init() {
    try {
      await store.ready;
      state = await store.getState();
      const payload = root.querySelector("[data-template-starters]");
      starters = JSON.parse(payload.textContent || "[]");
      state.personalTemplates = core.validate(state.personalTemplates);
      renderStarters();
      renderList();
      projectOptions();
      wireStaticSources();
      const requested = new URL(location.href).searchParams.get("template");
      const item = requested ? state.personalTemplates.items[requested] : null;
      if (item && !item.archived) {
        writeForm(item);
        root.querySelector("[data-template-editor-heading]").focus();
      }
    } catch (error) {
      saveStatus("Не удалось открыть личные шаблоны: " + error.message);
    }
  }

  void init();
})();
