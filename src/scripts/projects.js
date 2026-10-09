/* M5 UI composes the existing practice editor with project-scoped storage. */
(() => {
  const root = document.querySelector("[data-projects-root]");
  if (!root) return;
  const core = window.SalesOSProjects,
    store = window.SalesOSUserStore,
    data = JSON.parse(root.querySelector("[data-projects-data]").textContent);
  const work = root.querySelector("[data-projects-work]"),
    list = root.querySelector("[data-projects-list]"),
    notice = root.querySelector("[data-projects-notice]");
  const labels = {
    service: "Услуга",
    audience: "Аудитория",
    context: "Контекст",
    constraints: "Ограничения",
    goal: "Цель",
    assumptions: "Допущения",
    questions: "Нерешённые вопросы",
    legacyNote: "Прежние общие заметки",
  };
  const el = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
  const button = (text, job, cls = "btn") => {
    const n = el("button", text, cls);
    n.type = "button";
    n.addEventListener("click", () => queue(job));
    return n;
  };
  let state,
    key = new URL(location.href).searchParams.get("project"),
    editor,
    form,
    contextForm,
    contextRevision = 0,
    contextEdit = 0,
    contextSaved = 0,
    timer,
    chain = Promise.resolve(),
    pending = 0,
    durable = true;
  const selected = () => state?.projects.items[key];
  function status(text, result) {
    notice.textContent = text;
    if (result) {
      durable = result.durable;
      if (!durable)
        notice.append(
          " Только в памяти вкладки. ",
          button("Скачать резервную копию", backup),
        );
    }
  }
  function queue(job) {
    pending++;
    controls();
    chain = chain.then(async () => {
      try {
        await job();
      } catch (e) {
        status("Не удалось выполнить действие: " + e.message, { durable });
        notice.append(" ", button("Повторить сохранение", flush));
        if (contextForm && selected()?.contextRevision !== contextRevision) {
          notice.append(
            " ",
            button("Скачать мой несохранённый контекст", () => {
              const values = Object.fromEntries(new FormData(contextForm));
              download(
                JSON.stringify(values, null, 2),
                "application/json",
                "sales-os-unsaved-context.json",
              );
            }),
            button("Загрузить сохранённый контекст", async () => {
              state = await store.getState();
              hydrateContext(selected());
              status("Загружен сохранённый контекст.");
            }),
          );
        }
      } finally {
        pending--;
        controls();
      }
    });
    return chain;
  }
  function controls() {
    root
      .querySelectorAll("button")
      .forEach(
        (b) =>
          (b.disabled = pending > 0 || b.dataset.projectUnavailable === "true"),
      );
  }
  async function backup() {
    if (editor?.dirty && !(await editor.saveDraft()))
      throw Error("Сначала разрешите конфликт ответа");
    await saveContext();
    download(
      JSON.stringify(
        {
          ...(await store.getState()),
          notes: await store.getAllNotes(),
          exportedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      "application/json",
      "sales-os-backup-v8.json",
    );
  }
  function download(value, type, name) {
    const url = URL.createObjectURL(new Blob([value], { type })),
      a = el("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function mutate(fn) {
    const result = await store.updateState((s) => ({
      ...s,
      projects: core.validate(fn(s.projects, s)),
    }));
    state = result.state;
    status("Сохранено на устройстве.", result);
    return result;
  }
  function hydrateContext(p) {
    if (!contextForm || !p || p.archived)
      throw Error("Проект недоступен; сохраните текст в файл");
    contextForm.querySelector('[name="name"]').value = p.name;
    for (const f of core.fields)
      contextForm.querySelector('[name="' + f + '"]').value = p.context[f];
    contextRevision = p.contextRevision;
    contextSaved = contextEdit;
    clearTimeout(timer);
  }
  async function saveContext() {
    if (!contextForm || contextEdit === contextSaved) return;
    clearTimeout(timer);
    const edited = contextEdit,
      id = key,
      revision = contextRevision,
      name = contextForm.querySelector('[name="name"]').value,
      values = {};
    for (const f of core.fields)
      values[f] = contextForm.querySelector('[name="' + f + '"]').value;
    await mutate((r) => core.context(r, id, revision, name, values));
    contextRevision = state.projects.items[id].contextRevision;
    contextSaved = edited;
    listProjects();
    readiness();
  }
  async function flush() {
    clearTimeout(timer);
    await saveContext();
    if (editor && !(await editor.saveDraft()))
      throw Error(
        "Черновик изменён в другой вкладке. Разрешите конфликт перед сменой проекта.",
      );
    if (editor?.dirty)
      throw Error(
        "Сохраняется последний текст. Повторите действие после сохранения.",
      );
  }
  function selectUrl() {
    const url = new URL(location.href);
    if (key) url.searchParams.set("project", key);
    else url.searchParams.delete("project");
    history.replaceState(null, "", url);
  }
  async function choose(id) {
    await flush();
    await mutate((r) => core.activate(r, id));
    key = id;
    selectUrl();
    renderWork();
    listProjects();
    work.querySelector("h2")?.focus();
  }
  function listProjects() {
    list.replaceChildren();
    const projects = Object.values(state.projects.items);
    list.append(el("h2", "Проекты на устройстве", "h2"));
    if (!projects.length)
      list.append(
        el(
          "p",
          "Пока нет проектов. Создайте рабочую тетрадь или откройте её после импорта прежнего итогового проекта.",
          "muted",
        ),
      );
    for (const p of projects
      .filter((p) => !p.archived)
      .sort((a, b) => b.updatedAt - a.updatedAt)) {
      const row = el("div", undefined, "project-list-row"),
        b = button(p.name, () => choose(p.id), "project-select");
      b.setAttribute("aria-current", String(key === p.id));
      row.append(
        b,
        el(
          "span",
          state.projects.activeId === p.id
            ? "Активный проект"
            : "Сохранён на устройстве",
          "small muted",
        ),
      );
      list.append(row);
    }
    const archived = projects.filter((p) => p.archived);
    if (archived.length) {
      const group = el("details");
      group.append(el("summary", "Архив · " + archived.length));
      for (const p of archived) {
        const row = el("div", undefined, "project-list-row");
        row.append(
          button(
            p.name,
            async () => {
              await flush();
              key = p.id;
              selectUrl();
              renderWork();
              listProjects();
            },
            "project-select",
          ),
          button("Восстановить «" + p.name + "»", async () => {
            await mutate((r) => core.archive(r, p.id, false));
            listProjects();
            if (key === p.id) renderWork();
          }),
        );
        group.append(row);
      }
      list.append(group);
    }
  }
  function readiness() {
    const p = selected(),
      box = work.querySelector("[data-project-readiness]");
    if (!p || !box) return;
    work.querySelector(":scope > h2").textContent = p.name;
    const s = core.summary(p, data.rubric);
    box.replaceChildren(
      el("h3", "Готовность рабочего документа"),
      el(
        "p",
        "Записано этапов: " +
          s.filled +
          "/10. Это полнота записей и ваша самооценка, не аттестация.",
      ),
    );
    if (s.missing.length)
      box.append(
        el(
          "p",
          "Не хватает контекста: " +
            s.missing.map((k) => labels[k].toLowerCase()).join(", ") +
            ".",
        ),
      );
    if (s.incomplete.length)
      box.append(
        el(
          "p",
          "Нужна проверка: " +
            s.incomplete.map((c) => c.label).join(", ") +
            ".",
        ),
      );
    box.append(el("p", "Следующий шаг: " + s.next));
    box.append(
      el(
        "p",
        "Этапы можно заполнять в любом порядке. Аудитория и задача уточняют оффер; диагностика помогает подготовить предложение, а договорённости — следующий шаг и сопровождение.",
        "small muted",
      ),
    );
  }
  function attachments() {
    const p = selected(),
      box = work.querySelector("[data-project-snapshots]");
    if (!p || !box) return;
    box.replaceChildren(el("h3", "Прикреплённые снимки"));
    let count = 0;
    for (const criterion of data.rubric)
      for (const a of p.stages[criterion.id].attachments) {
        count++;
        const details = el("details"),
          head = el(
            "summary",
            criterion.label +
              " · " +
              a.sourceTitle +
              " · " +
              new Date(a.attempt.createdAt).toLocaleString("ru-RU"),
          );
        details.append(
          head,
          el(
            "p",
            "Итерация " +
              a.attempt.id +
              " · снимок добавлен " +
              new Date(a.attachedAt).toLocaleString("ru-RU"),
            "small muted",
          ),
        );
        const link = el("a", "Открыть исходную практику");
        link.href = "/practice/" + a.sourceId + "/";
        details.append(link);
        for (const c of a.attempt.rubric)
          details.append(
            el("h4", c.label),
            el(
              "p",
              a.attempt.answers[c.id] || "Ответ не записан",
              "project-text",
            ),
          );
        if (a.attempt.nextStep)
          details.append(
            el(
              "p",
              "Следующая итерация: " + a.attempt.nextStep,
              "project-text",
            ),
          );
        box.append(details);
      }
    if (!count)
      box.append(
        el(
          "p",
          "Снимков пока нет. Сначала сохраните итерацию в одной из практик, затем прикрепите её к этапу.",
          "muted",
        ),
      );
  }
  function snapshotPicker(p) {
    const section = el("section", undefined, "project-sources");
    section.dataset.projectSources = "";
    section.append(
      el("h3", "Прикрепить итерацию практики"),
      el(
        "p",
        "Сохраняется копия ответа с источником и датой. Изменение практики не обновит её: новую итерацию нужно прикрепить явно.",
        "small muted",
      ),
    );
    const f = el("form"),
      stageLabel = el("label", "Этап проекта"),
      stage = el("select");
    stage.name = "stage";
    for (const c of data.rubric) {
      const o = el("option", c.label);
      o.value = c.id;
      stage.append(o);
    }
    stageLabel.append(stage);
    const sourceLabel = el("label", "Сохранённая итерация"),
      source = el("select");
    source.name = "source";
    const choices = [];
    for (const [id, attempts] of Object.entries(state.practiceAttempts || {})) {
      const entry = data.practices[id];
      if (!entry) continue;
      for (const attempt of attempts) {
        choices.push({ entry, attempt });
        const o = el(
          "option",
          entry.title +
            " · " +
            new Date(attempt.createdAt).toLocaleString("ru-RU") +
            " · " +
            attempt.id,
        );
        o.value = String(choices.length - 1);
        source.append(o);
      }
    }
    sourceLabel.append(source);
    const send = el("button", "Прикрепить снимок", "btn");
    send.type = "submit";
    send.disabled = !choices.length;
    send.dataset.projectUnavailable = String(!choices.length);
    source.disabled = !choices.length;
    f.append(stageLabel, sourceLabel, send);
    if (!choices.length)
      section.append(el("p", "Нет сохранённых итераций. ", "muted"));
    const practices = el("a", "Открыть практики");
    practices.href = "/practice/";
    section.append(practices);
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      const choice = choices[Number(source.value)];
      if (!choice) return;
      const target = stage.value;
      queue(async () => {
        await flush();
        await mutate((r) =>
          core.attach(r, p.id, target, choice.entry, choice.attempt),
        );
        attachments();
        readiness();
      });
    });
    section.append(
      f,
      button("Обновить список итераций", async () => {
        state = await store.getState();
        section.replaceWith(snapshotPicker(selected()));
      }),
    );
    return section;
  }
  function renderWork() {
    if (form) {
      window.SalesOSPractice.unregister(form);
      form = null;
      editor = null;
    }
    contextForm = null;
    contextEdit = 0;
    contextSaved = 0;
    work.replaceChildren();
    const p = selected();
    if (!p) {
      work.append(el("p", "Выберите проект или создайте новый.", "muted"));
      return;
    }
    const heading = el("h2", p.name, "h2");
    heading.tabIndex = -1;
    work.append(heading);
    if (p.archived) {
      work.append(
        el(
          "p",
          "Проект в архиве. Восстановите его, чтобы продолжить работу.",
          "muted",
        ),
        button("Восстановить проект", async () => {
          await mutate((r) => core.archive(r, p.id, false));
          await choose(p.id);
        }),
      );
      const remove = el("details");
      remove.append(el("summary", "Окончательно удалить проект"));
      const label = el("label", "Для удаления введите название проекта"),
        input = el("input");
      input.maxLength = 120;
      label.append(input);
      remove.append(
        label,
        el(
          "p",
          "Удаляется только этот проект. Восстановление возможно из заранее скачанной копии.",
          "small muted",
        ),
        button("Удалить без восстановления", async () => {
          await mutate((r) => core.remove(r, p.id, input.value));
          key = null;
          selectUrl();
          renderWork();
          listProjects();
        }),
      );
      work.append(remove);
      return;
    }
    work.append(
      el(
        "p",
        "Работайте в любом порядке. Оффер опирается на нишу и диагностику; предложение — на согласованный объём. Недостающие сведения не блокируют запись.",
        "muted",
      ),
    );
    const actions = el("div", undefined, "project-actions");
    for (const [label, format] of [
      ["Экспорт Markdown", "md"],
      ["HTML для печати", "html"],
    ])
      actions.append(
        button(label, async () => {
          await flush();
          state = await store.getState();
          const current = selected();
          if (!current || current.archived) throw Error("Проект недоступен");
          download(
            format === "md"
              ? core.markdown(current, data.rubric)
              : core.html(current, data.rubric),
            format === "md"
              ? "text/markdown;charset=utf-8"
              : "text/html;charset=utf-8",
            "sales-os-project." + format,
          );
        }),
      );
    actions.append(
      button("Предпросмотр", async () => {
        await flush();
        state = await store.getState();
        const box = work.querySelector("[data-project-preview]");
        box.replaceChildren();
        const frame = el("iframe");
        frame.title = "Предпросмотр выбранного проекта";
        frame.sandbox = "";
        frame.srcdoc = core.html(selected(), data.rubric);
        box.append(frame);
        box.hidden = false;
      }),
      button("Архивировать проект", async () => {
        await flush();
        await mutate((r) => core.archive(r, p.id, true));
        renderWork();
        listProjects();
      }),
    );
    work.append(actions);
    const preview = el("div");
    preview.dataset.projectPreview = "";
    preview.hidden = true;
    work.append(preview);
    const readinessBox = el("section", undefined, "project-readiness");
    readinessBox.dataset.projectReadiness = "";
    work.append(readinessBox);
    contextForm = el("form", undefined, "project-context");
    contextForm.dataset.projectContext = "";
    contextForm.append(el("h3", "Контекст проекта"));
    const nameLabel = el("label", "Название проекта"),
      name = el("input");
    name.name = "name";
    name.value = p.name;
    name.maxLength = 120;
    name.required = true;
    nameLabel.append(name);
    contextForm.append(nameLabel);
    for (const field of core.fields) {
      const label = el("label", labels[field]),
        input = el("textarea");
      input.name = field;
      input.rows = field === "legacyNote" ? 4 : 2;
      input.maxLength = field === "legacyNote" ? 250000 : 10000;
      input.value = p.context[field];
      label.append(input);
      contextForm.append(label);
    }
    contextRevision = p.contextRevision;
    contextForm.addEventListener("input", () => {
      contextEdit++;
      status("Есть несохранённый контекст…");
      clearTimeout(timer);
      timer = setTimeout(() => queue(saveContext), 450);
    });
    contextForm.addEventListener("submit", (e) => {
      e.preventDefault();
      queue(saveContext);
    });
    const save = el("button", "Сохранить контекст", "btn");
    save.type = "submit";
    contextForm.append(save);
    work.append(contextForm);
    const template = document.querySelector("[data-project-template]");
    work.append(template.content.cloneNode(true));
    form = work.querySelector("[data-practice-form]");
    const id = p.id;
    editor = window.SalesOSPractice.register(form, {
      draft: (s) => s.projects.items[id]?.draft,
      attempts: (s) => s.projects.items[id]?.attempts || [],
      writeDraft: (s, d) => ({
        ...s,
        projects: core.writeDraft(s.projects, id, d),
      }),
      writeAttempts: (s, a) => ({
        ...s,
        projects: core.writeAttempts(s.projects, id, a),
      }),
    });
    const extras = Object.entries(p.draft.answers).filter(
      ([k]) => !data.rubric.some((c) => c.id === k),
    );
    if (extras.length) {
      const legacy = el("details");
      legacy.append(el("summary", "Прежние поля проекта"));
      for (const [k, v] of extras)
        legacy.append(el("h4", k), el("p", v, "project-text"));
      work.append(legacy);
    }
    work.append(snapshotPicker(p));
    const snapshots = el("section", undefined, "project-snapshots");
    snapshots.dataset.projectSnapshots = "";
    work.append(snapshots);
    attachments();
    readiness();
  }
  root.querySelector("[data-project-create]").addEventListener("click", () =>
    queue(async () => {
      const name = root.querySelector("[data-project-name]").value;
      if (!name.trim()) throw Error("Укажите название нового проекта");
      await flush();
      await mutate((r) => core.create(r, name));
      key = state.projects.activeId;
      root.querySelector("[data-project-name]").value = "";
      selectUrl();
      renderWork();
      listProjects();
    }),
  );
  store.ready
    .then(async () => {
      const notes = await store.getAllNotes();
      await mutate((r, s) =>
        core.migrate(r, s, notes.FINAL_PROJECT || "", data.rubric),
      );
      if (!state.projects.items[key]) key = state.projects.activeId;
      selectUrl();
      renderWork();
      listProjects();
      store.subscribe(async () => {
        if (pending) return;
        const latest = await store.getState();
        state = latest;
        durable = store.getMode() !== "memory";
        if (!durable) status("Хранилище недоступно.", { durable });
        if (
          selected() &&
          contextForm &&
          selected().contextRevision !== contextRevision &&
          contextEdit === contextSaved
        )
          hydrateContext(selected());
        listProjects();
        readiness();
        attachments();
        if (!selected()) {
          if (!editor?.dirty && contextEdit === contextSaved) renderWork();
          else
            status(
              "Проект изменён или удалён в другой вкладке. Текст оставлен в форме.",
            );
        } else if (selected().archived) {
          if (!editor?.dirty && contextEdit === contextSaved) renderWork();
          else
            status(
              "Проект архивирован в другой вкладке. Скопируйте несохранённый текст перед выходом.",
            );
        }
      });
    })
    .catch((e) => status("Не удалось загрузить проекты: " + e.message));
  window.addEventListener("beforeunload", (e) => {
    if (contextEdit > contextSaved || editor?.dirty || pending || !durable) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && contextEdit > contextSaved) queue(saveContext);
  });
})();
