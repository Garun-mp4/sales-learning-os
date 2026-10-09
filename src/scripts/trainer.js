/* Local scenario UI. Branches follow explicit actions, never free-text inference. */
(() => {
  const root = document.querySelector("[data-trainer-root]");
  if (!root) return;
  const core = window.SalesOSTrainer,
    store = window.SalesOSUserStore;
  const scenarios = JSON.parse(
    root.querySelector("[data-trainer-data]").textContent,
  );
  const scenario = scenarios.find((s) => s.id === root.dataset.scenarioId);
  const work = root.querySelector("[data-trainer-workspace]");
  const history = root.querySelector("[data-trainer-history]");
  const compare = root.querySelector("[data-trainer-comparison]");
  const notice = root.querySelector("[data-trainer-notice]");
  let session = null,
    all = {},
    dirty = false,
    timer,
    busy = false;
  let chain = Promise.resolve();
  let pending = 0;
  let fieldLocks = 0;
  let editCounter = 0;
  let durable = true;
  let historySignature = "";
  const el = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
  const button = (text, action, cls = "btn") => {
    const b = el("button", text, cls);
    b.type = "button";
    b.addEventListener("click", action);
    return b;
  };
  const date = (v) => new Date(v).toLocaleString("ru-RU");
  const ended = (s) => s.scenario.nodes[core.position(s)].kind === "end";
  const incompatible = (s) =>
    !ended(s) && JSON.stringify(s.scenario) !== JSON.stringify(scenario);
  function message(text) {
    notice.textContent = text;
  }
  function setBusy(value) {
    busy = value;
    for (const b of work.querySelectorAll("button")) b.disabled = value;
    const form = work.querySelector("form");
    if (form)
      for (const input of form.querySelectorAll("input,textarea"))
        input.disabled = fieldLocks > 0;
  }
  function enqueue(job, lockFields = false) {
    pending++;
    if (lockFields) fieldLocks++;
    setBusy(true);
    chain = chain.then(async () => {
      setBusy(true);
      try {
        await job();
      } catch (e) {
        message(`Не удалось сохранить: ${e.message}. Текст оставлен в форме.`);
        notice.append(
          " ",
          button(
            "Повторить сохранение",
            () => enqueue(saveDraft),
            "btn smallbtn",
          ),
        );
      } finally {
        pending--;
        if (lockFields) fieldLocks--;
        setBusy(pending > 0);
      }
    });
    return chain;
  }
  function selectSession(s) {
    session = s;
    dirty = false;
    const url = new URL(location.href);
    url.searchParams.set("session", s.id);
    historyAPI(url);
    renderWorkspace();
  }
  function historyAPI(url) {
    window.history.replaceState(null, "", url);
  }
  async function persist(candidate, existing = true, editedAt = editCounter) {
    const baseId = candidate.id,
      expected = session?.revision;
    let savedId = baseId,
      conflict = false;
    const result = await store.updateState((current) => {
      const sessions = { ...current.trainerSessions };
      const latest = sessions[baseId];
      if (existing && (!latest || latest.deletedAt))
        throw Error(
          "Попытка удалена или данные заменены в другой вкладке. Скопируйте текст и начните новую попытку.",
        );
      if (existing && latest.revision !== expected) {
        conflict = true;
        savedId = crypto.randomUUID();
        candidate = {
          ...candidate,
          id: savedId,
          conflictOf: baseId,
          revision: 1,
        };
      } else
        candidate = {
          ...candidate,
          revision: existing ? latest.revision + 1 : 1,
        };
      candidate.updatedAt = Math.max(Date.now(), candidate.createdAt);
      sessions[savedId] = candidate;
      core.validateSessions(sessions);
      return { ...current, trainerSessions: sessions };
    });
    all = result.state.trainerSessions;
    durable = result.durable;
    session = all[savedId];
    dirty = editCounter !== editedAt;
    if (conflict) {
      const u = new URL(location.href);
      u.searchParams.set("session", savedId);
      historyAPI(u);
    }
    message(
      !result.durable
        ? "Изменения только в памяти вкладки. Постоянное хранилище недоступно; скачайте копию здесь до выхода."
        : conflict
          ? "Обнаружены изменения в другой вкладке. Ваш вариант сохранён отдельной попыткой; обе версии доступны в истории."
          : "Сохранено на устройстве.",
    );
    renderHistory();
    if (dirty && result.durable) message("Есть несохранённые изменения…");
    if (!result.durable)
      notice.append(
        " ",
        button(
          "Скачать резервную копию",
          async () => {
            try {
              const snapshot = await store.getState();
              const notes = await store.getAllNotes();
              const url = URL.createObjectURL(
                new Blob(
                  [
                    JSON.stringify(
                      {
                        ...snapshot,
                        notes,
                        exportedAt: new Date().toISOString(),
                      },
                      null,
                      2,
                    ),
                  ],
                  { type: "application/json" },
                ),
              );
              const link = el("a");
              link.href = url;
              link.download = "sales-os-backup.json";
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            } catch (e) {
              message(
                `Не удалось экспортировать: ${e.message}. Скопируйте текст ответа вручную.`,
              );
            }
          },
          "btn smallbtn",
        ),
      );
  }
  function readDraft() {
    const form = work.querySelector("form");
    return form
      ? {
          text: form.querySelector("textarea").value,
          choiceId: form.querySelector("input:checked")?.value || "",
        }
      : session.draft;
  }
  async function saveDraft() {
    if (
      !session ||
      ended(session) ||
      incompatible(session) ||
      session.deletedAt ||
      !dirty
    )
      return;
    await persist({ ...session, draft: readDraft() });
  }
  async function start() {
    if (dirty) await saveDraft();
    const fresh = core.create(scenario);
    await persist(fresh, false);
    selectSession(session);
  }
  function transcript(s, full = true) {
    const box = el("div", undefined, "trainer-transcript");
    const list = el("ol");
    for (const step of s.steps) {
      const node = s.scenario.nodes[step.nodeId],
        choice = node.choices.find((c) => c.id === step.choiceId);
      const li = el("li");
      li.append(
        el("p", "Клиент", "small muted"),
        el("p", node.message, "trainer-message"),
        el("p", "Мой ответ", "small muted"),
        el(
          "p",
          step.text || "Текст не записан; выбрано только действие.",
          "trainer-message",
        ),
        el("p", `Действие: ${choice.label}`, "trainer-action"),
      );
      if (full) li.append(el("p", choice.feedback, "trainer-feedback"));
      list.append(li);
    }
    box.append(list);
    return box;
  }
  function summary(s) {
    const section = el("section", undefined, "trainer-summary");
    section.append(
      el("h3", "Разбор выбранного пути"),
      el("p", s.scenario.nodes[core.position(s)].outcome),
    );
    const choices = s.steps.map((step) =>
      s.scenario.nodes[step.nodeId].choices.find((c) => c.id === step.choiceId),
    );
    for (const [key, title, empty] of [
      [
        "strength",
        "Сильные решения",
        "Сильные решения в этой ветке не отмечены.",
      ],
      [
        "omission",
        "Что пересмотреть",
        "В выбранных действиях явных упущений не отмечено. Это не проверка вашего текста.",
      ],
    ]) {
      section.append(el("h4", title));
      const values = [...new Set(choices.map((c) => c[key]).filter(Boolean))];
      if (values.length) {
        const ul = el("ul");
        for (const v of values) ul.append(el("li", v));
        section.append(ul);
      } else section.append(el("p", empty, "muted"));
    }
    section.append(el("h4", "Вернуться к материалам"));
    const links = el("div", undefined, "row wrap");
    for (const id of s.scenario.related) {
      const a = el("a", `Практика ${id}`, "btn smallbtn");
      a.href = `/practice/${id}/`;
      links.append(a);
    }
    section.append(
      links,
      el(
        "p",
        "Разбор относится к выбранным действиям. Собственный текст проверьте самостоятельно по критериям курса. Сделка и рост продаж не гарантируются.",
        "small muted",
      ),
    );
    return section;
  }
  function renderWorkspace() {
    work.replaceChildren();
    if (!scenario) return;
    if (!session) {
      work.append(
        button("Начать сценарий", () => enqueue(start), "btn primary"),
      );
      return;
    }
    if (session.deletedAt) {
      work.append(
        el(
          "p",
          "Эта попытка удалена. Восстановите её в истории или начните новую.",
        ),
        button("Новая попытка", () => enqueue(start)),
      );
      return;
    }
    work.append(
      el("h2", `Диалог · ${date(session.createdAt)}`, "h2"),
      transcript(session),
    );
    const current = session.scenario.nodes[core.position(session)];
    work.append(
      el("p", "Клиент", "small muted"),
      el("p", current.message, "trainer-message"),
    );
    if (ended(session)) {
      work.append(
        summary(session),
        button(
          "Попробовать другой подход",
          () => enqueue(start),
          "btn primary",
        ),
      );
      return;
    }
    if (incompatible(session)) {
      work.append(
        el(
          "p",
          "Сценарий обновлён. Предыдущая попытка сохранена со своим снимком; продолжать её в новой версии нельзя.",
          "notice",
        ),
        el(
          "p",
          session.draft.text || "Черновик ответа пуст.",
          "trainer-message",
        ),
        button("Начать новую версию", () => enqueue(start), "btn primary"),
      );
      return;
    }
    const form = el("form", undefined, "trainer-form");
    const label = el("label", "Мой ответ клиенту (необязательно)");
    label.htmlFor = "trainer-answer";
    const area = el("textarea");
    area.id = "trainer-answer";
    area.maxLength = 6000;
    area.rows = 5;
    area.value = session.draft.text;
    area.setAttribute("aria-describedby", "trainer-text-help");
    const help = el(
      "p",
      "До 6 000 символов. Текст можно исправить до отправки; он не определяет ветку сценария.",
      "small muted",
    );
    help.id = "trainer-text-help";
    const field = el("fieldset", undefined, "trainer-choices");
    field.append(el("legend", "Какое действие вы выбираете?"));
    for (const choice of current.choices) {
      const l = el("label"),
        input = el("input");
      input.type = "radio";
      input.name = "trainer-action";
      input.value = choice.id;
      input.required = true;
      input.checked = session.draft.choiceId === choice.id;
      l.append(input, el("span", choice.label));
      field.append(l);
    }
    const send = el("button", "Отправить ответ и действие", "btn primary");
    send.type = "submit";
    form.append(label, area, help, field, send);
    form.addEventListener("input", () => {
      editCounter++;
      dirty = true;
      clearTimeout(timer);
      message("Есть несохранённые изменения…");
      timer = setTimeout(() => enqueue(saveDraft), 350);
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (busy) return;
      clearTimeout(timer);
      const draft = readDraft();
      enqueue(async () => {
        await persist(core.advance({ ...session, draft }));
        renderWorkspace();
        work.querySelector("h2").tabIndex = -1;
        work.querySelector("h2").focus();
      }, true);
    });
    work.append(
      form,
      button("Сохранить и вернуться к сценариям", () =>
        enqueue(async () => {
          clearTimeout(timer);
          await saveDraft();
          if (!durable) return;
          setBusy(false);
          location.href = "/trainer/";
        }, true),
      ),
    );
  }
  async function removeOrRestore(id, restore = false) {
    if (session?.id === id && dirty) await saveDraft();
    const result = await store.updateState((state) => {
      const original = state.trainerSessions[id];
      if (!original) throw Error("Попытка больше не существует");
      return {
        ...state,
        trainerSessions: {
          ...state.trainerSessions,
          [id]: {
            ...original,
            deletedAt: restore ? null : Date.now(),
            updatedAt: Date.now(),
            revision: original.revision + 1,
          },
        },
      };
    });
    all = result.state.trainerSessions;
    if (session?.id === id) {
      session = all[id];
      dirty = false;
      renderWorkspace();
    }
    message(
      result.durable
        ? restore
          ? "Попытка восстановлена."
          : "Попытка удалена из списка. Её можно восстановить ниже."
        : "Изменение осталось только в памяти вкладки; экспортируйте копию.",
    );
    renderHistory();
  }
  function renderComparison(list) {
    compare.replaceChildren();
    if (!scenario) {
      compare.append(
        el(
          "p",
          "Откройте нужный сценарий, чтобы сравнить его попытки.",
          "muted",
        ),
      );
      return;
    }
    const completed = list.filter((s) => !s.deletedAt && ended(s));
    if (completed.length < 2) {
      compare.append(
        el(
          "p",
          "Завершите две попытки этого сценария — здесь появится сравнение решений.",
          "muted",
        ),
      );
      return;
    }
    const controls = el("div", undefined, "comparison-controls");
    const selects = [];
    for (const title of ["Первая попытка", "Вторая попытка"]) {
      const label = el("label", title),
        select = el("select");
      completed.forEach((s, i) => {
        const o = el(
          "option",
          `Попытка ${i + 1} · ${date(s.createdAt)} · v${s.scenarioVersion}`,
        );
        o.value = s.id;
        select.append(o);
      });
      label.append(select);
      controls.append(label);
      selects.push(select);
    }
    selects[1].value = completed.at(-1).id;
    const result = el("div", undefined, "comparison-columns");
    function render() {
      result.replaceChildren();
      if (selects[0].value === selects[1].value) {
        result.append(el("p", "Выберите две разные попытки."));
        return;
      }
      for (const select of selects) {
        const s = completed.find((item) => item.id === select.value);
        const col = el("section", undefined, "comparison-column");
        col.append(
          el("h3", `Попытка · ${date(s.createdAt)}`),
          el("p", `Версия сценария: ${s.scenarioVersion}`, "small muted"),
          transcript(s),
          summary(s),
        );
        result.append(col);
      }
      if (
        completed.find((s) => s.id === selects[0].value).scenarioVersion !==
        completed.find((s) => s.id === selects[1].value).scenarioVersion
      )
        result.prepend(
          el(
            "p",
            "Версии сценария отличаются: показаны исходные условия каждой попытки.",
            "notice",
          ),
        );
    }
    selects.forEach((s) => s.addEventListener("change", render));
    compare.append(controls, result);
    render();
  }
  function renderHistory() {
    const list = Object.values(all)
      .filter((s) => !scenario || s.scenarioId === scenario.id)
      .sort((a, b) => a.createdAt - b.createdAt);
    const sig = JSON.stringify(list.map((s) => [s.id, s.steps, s.deletedAt]));
    if (sig === historySignature) return;
    historySignature = sig;
    history.replaceChildren();
    if (!list.length)
      history.append(
        el(
          "p",
          "Пока нет попыток. Выберите ситуацию и начните учебный диалог.",
          "muted",
        ),
      );
    for (const s of [...list].reverse()) {
      const row = el("article", undefined, "trainer-history-row");
      const link = el("a", `${s.scenario.title} · ${date(s.createdAt)}`);
      link.href = `/trainer/${s.scenarioId}/?session=${encodeURIComponent(s.id)}`;
      row.append(
        link,
        el(
          "p",
          `${s.deletedAt ? "Удалена · можно восстановить" : ended(s) ? "Завершена" : "В процессе"} · действий: ${s.steps.length}${s.conflictOf ? " · отдельная сохранённая версия" : ""}`,
          "small muted",
        ),
      );
      row.append(
        button(
          s.deletedAt ? "Восстановить" : "Удалить с восстановлением",
          () => enqueue(() => removeOrRestore(s.id, !!s.deletedAt), true),
          "btn smallbtn",
        ),
      );
      history.append(row);
    }
    renderComparison(list);
  }
  async function refresh() {
    const state = await store.getState();
    all = state.trainerSessions;
    if (session && !dirty && !busy) {
      const next = all[session.id];
      if (next && JSON.stringify(next) !== JSON.stringify(session)) {
        session = next;
        renderWorkspace();
      } else if (!next) {
        session = null;
        renderWorkspace();
        message("Данные заменены в другой вкладке.");
      }
    }
    renderHistory();
  }
  store.subscribe((m) => {
    if (m.type === "state" || m.type === "replace")
      void refresh().catch(() =>
        message("Не удалось прочитать историю. Перезагрузите страницу."),
      );
  });
  window.addEventListener("beforeunload", (e) => {
    if (dirty || busy || !durable) {
      e.preventDefault();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && dirty) {
      clearTimeout(timer);
      void enqueue(saveDraft);
    }
  });
  (async () => {
    try {
      await refresh();
      const wanted = new URL(location.href).searchParams.get("session");
      if (wanted) {
        const found = all[wanted];
        if (found && found.scenarioId === scenario?.id) session = found;
        else
          message(
            "Запрошенная попытка не найдена на этом устройстве. Можно начать новую.",
          );
      } else if (scenario)
        session =
          Object.values(all)
            .filter(
              (s) => s.scenarioId === scenario.id && !s.deletedAt && !ended(s),
            )
            .sort((a, b) => b.updatedAt - a.updatedAt)[0] || null;
      renderWorkspace();
      if (notice.textContent === "Загрузка локальной истории…")
        message(
          "История хранится только на этом устройстве. Экспорт доступен в настройках.",
        );
    } catch (e) {
      message(`Тренажёр не загрузился: ${e.message}. Перезагрузите страницу.`);
    }
  })();
})();
