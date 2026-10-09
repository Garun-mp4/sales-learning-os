/* M4: explicit answers, honest self-assessment and optional local scheduling. */
(() => {
  const root = document.querySelector("[data-knowledge-root]");
  if (!root) return;
  const core = window.SalesOSKnowledge,
    store = window.SalesOSUserStore;
  const questions = JSON.parse(
    root.querySelector("[data-knowledge-data]").textContent,
  );
  const work = root.querySelector("[data-knowledge-work]"),
    catalog = root.querySelector("[data-knowledge-catalog]"),
    stats = root.querySelector("[data-knowledge-stats]"),
    notice = root.querySelector("[data-knowledge-notice]");
  let state,
    qid = new URL(location.href).searchParams.get("question"),
    draft = null,
    chain = Promise.resolve(),
    pending = 0,
    locks = 0,
    timer,
    edit = 0,
    saved = 0,
    durable = true;
  const el = (tag, value, cls) => {
    const n = document.createElement(tag);
    if (value !== undefined) n.textContent = value;
    if (cls) n.className = cls;
    return n;
  };
  const btn = (label, action, cls = "btn") => {
    const b = el("button", label, cls);
    b.type = "button";
    b.addEventListener("click", action);
    return b;
  };
  const q = () => questions.find((v) => v.id === qid);
  const resultName = (a) =>
    a.archived
      ? "Архив черновика"
      : !a.result
        ? "Ожидает самооценки"
        : a.result.kind === "objective"
          ? a.result.value === "correct"
            ? "Проверка по ключу: правильно"
            : "Проверка по ключу: ошибка"
          : {
              met: "Самооценка: критерии выполнены",
              partial: "Самооценка: частично",
              "needs-work": "Самооценка: нужно доработать",
            }[a.result.value];
  function controls() {
    for (const b of root.querySelectorAll("button"))
      b.disabled = pending > 0 && !(b.type === "submit" && locks === 0);
    for (const input of work.querySelectorAll("input,textarea"))
      input.disabled = locks > 0;
  }
  function enqueue(job, lock = false) {
    pending++;
    if (lock) locks++;
    controls();
    chain = chain.then(async () => {
      try {
        await job();
      } catch (e) {
        const errorMessage = "Не удалось выполнить действие: " + e.message;
        notice.textContent = errorMessage;
        if (!durable) {
          warning({ durable: false });
          notice.prepend(errorMessage + " ");
        }
        if (edit > saved)
          notice.append(
            " ",
            btn("Повторить сохранение", () => enqueue(saveDraft)),
          );
      } finally {
        pending--;
        if (lock) locks--;
        controls();
      }
    });
    return chain;
  }
  function warning(result) {
    durable = result.durable;
    notice.textContent = durable
      ? "Сохранено на устройстве."
      : "Только в памяти вкладки. Скачайте копию до выхода.";
    if (!durable)
      notice.append(
        " ",
        btn("Скачать резервную копию", async () => {
          try {
            const data = {
              ...(await store.getState()),
              notes: await store.getAllNotes(),
              exportedAt: new Date().toISOString(),
            };
            const url = URL.createObjectURL(
                new Blob([JSON.stringify(data, null, 2)], {
                  type: "application/json",
                }),
              ),
              a = el("a");
            a.href = url;
            a.download = "sales-os-backup-v9.json";
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          } catch (e) {
            notice.append(" Экспорт: " + e.message);
          }
        }),
      );
  }
  async function mutate(fn, redraw = true) {
    const result = await store.updateState((current) => ({
      ...current,
      knowledgeReview: core.validate(fn(current.knowledgeReview, current)),
    }));
    state = result.state;
    warning(result);
    if (qid) draft = state.knowledgeReview.drafts[qid] || null;
    if (redraw) render();
    return result;
  }
  function read() {
    const f = work.querySelector("[data-knowledge-answer]");
    return {
      text: f?.querySelector("textarea")?.value || "",
      choiceId: f?.querySelector("input:checked")?.value || "",
    };
  }
  async function saveDraft() {
    if (!draft || edit === saved || state.knowledgeReview.attempts[draft.id])
      return;
    const count = edit,
      values = read(),
      base = draft;
    await mutate((r) => core.save(r, { ...base, ...values }), false);
    saved = count;
  }
  async function choose(question, force = false) {
    clearTimeout(timer);
    if (edit > saved) await saveDraft();
    await mutate((r) => core.start(r, question, force), false);
    qid = question.id;
    draft = state.knowledgeReview.drafts[qid];
    const url = new URL(location.href);
    url.searchParams.set("question", qid);
    history.replaceState(null, "", url);
    edit = 0;
    saved = 0;
    render();
    work.querySelector("h2")?.focus();
  }
  function renderStats() {
    const r = state.knowledgeReview,
      attempts = Object.values(r.attempts).filter((a) => !a.archived);
    stats.replaceChildren(
      el(
        "p",
        "Ручные отметки «просмотрено»: " +
          state.revisitHistory.length +
          ". Открыто вопросов: " +
          new Set(
            r.events
              .filter((e) => e.kind === "opened")
              .map((e) => e.questionId),
          ).size +
          ". Проверено по ключу: " +
          attempts.filter((a) => a.result?.kind === "objective").length +
          " (правильно: " +
          attempts.filter((a) => a.result?.value === "correct").length +
          "). Самооценок по рубрике: " +
          attempts.filter((a) => a.result?.kind === "self").length +
          ".",
        "small muted",
      ),
    );
    const toggle = btn(
      r.enabled
        ? "Отключить автоматические интервалы"
        : "Включить автоматические интервалы",
      () =>
        enqueue(async () => {
          if (edit > saved) await saveDraft();
          await mutate((review) => ({
            ...review,
            enabled: !review.enabled,
            settingsUpdatedAt: Date.now(),
          }));
        }, true),
    );
    toggle.setAttribute("aria-pressed", String(r.enabled));
    stats.append(
      toggle,
      el(
        "p",
        "Добровольно: 1 → 3 → 7 → 14 → 30 календарных дней при успешных отсроченных ответах; ошибка возвращает на 1 день. Не более 10 ответов/пропусков и 3 новых вопросов в день. После двух ошибок в разные дни — пауза. Ручная очередь остаётся отдельной.",
        "small muted",
      ),
    );
  }
  function renderCatalog() {
    catalog.replaceChildren();
    const r = state.knowledgeReview,
      due = core.due(r, questions),
      limits = core.load(r);
    catalog.append(
      el("h2", "Выберите задание", "h2"),
      el(
        "p",
        "Сегодня: " +
          limits.total +
          "/10 ответов и пропусков; " +
          limits.newCount +
          "/3 новых заданий. Ответы и статистика остаются на устройстве.",
        "small muted",
      ),
    );
    if (due.length) {
      const box = el("div", undefined, "knowledge-due");
      box.append(el("h3", "Пора проверить понимание"));
      for (const question of due)
        box.append(
          btn(question.skill, () =>
            enqueue(
              () =>
                choose(
                  question,
                  Boolean(r.attempts[r.drafts[question.id]?.id]),
                ),
              true,
            ),
          ),
        );
      catalog.append(box);
    } else
      catalog.append(
        el(
          "p",
          r.enabled
            ? "Сейчас нет доступных автоматических повторов. Можно выбрать задание ниже; лимиты сохраняются."
            : "Автоматическое расписание отключено. Задания доступны для самостоятельной проверки.",
          "small muted",
        ),
      );
    for (const mod of ["01", "02", "08"]) {
      const section = el("section", undefined, "knowledge-module");
      section.append(
        el(
          "h3",
          "Модуль " +
            mod +
            " · " +
            {
              "01": "Природа и процесс продаж",
              "02": "Психология покупки и доверие",
              "08": "Диагностика потребностей",
            }[mod],
        ),
      );
      for (const question of questions.filter((v) => v.module === mod)) {
        const row = el("div", undefined, "knowledge-row"),
          b = btn(
            question.skill,
            () => enqueue(() => choose(question), true),
            "knowledge-select",
          );
        b.setAttribute("aria-current", String(qid === question.id));
        const scheduled = r.schedule[question.id],
          changed =
            scheduled && scheduled.fingerprint !== core.fingerprint(question);
        row.append(
          b,
          el(
            "span",
            question.type === "choice" ? "Выбор · ключ" : "Кейс · самооценка",
            "small muted",
          ),
        );
        if (changed)
          row.append(
            el(
              "span",
              "Обновлён: прежний интервал не используется",
              "small muted",
            ),
          );
        else if (scheduled)
          row.append(
            el(
              "span",
              scheduled.suspended
                ? "Автоповтор на паузе"
                : "Следующий: " +
                    new Date(scheduled.dueAt).toLocaleString("ru-RU"),
              "small muted",
            ),
          );
        section.append(row);
      }
      catalog.append(section);
    }
  }
  function renderQuestion() {
    work.replaceChildren();
    const question = q();
    if (!question) {
      work.append(
        el(
          "p",
          "Выберите вопрос из списка. Сначала ответьте самостоятельно, затем откройте разбор.",
        ),
      );
      return;
    }
    const h = el("h2", question.skill, "h2");
    h.tabIndex = -1;
    work.append(
      h,
      el("p", question.prompt),
      el(
        "p",
        "Модуль " +
          question.module +
          " · версия " +
          question.version +
          " · " +
          (question.type === "choice"
            ? "проверка по ключу"
            : "самооценка по рубрике"),
        "small muted",
      ),
    );
    const existing = state.knowledgeReview.drafts[qid];
    if (
      !existing ||
      existing.fingerprint !== core.fingerprint(question) ||
      existing.skipped
    ) {
      if (
        existing?.fingerprint !== undefined &&
        existing.fingerprint !== core.fingerprint(question)
      )
        work.append(
          el(
            "p",
            "Вопрос изменился. Старый черновик и результаты сохранятся в истории; прежняя оценка не переносится на новую версию.",
            "notice",
          ),
        );
      work.append(
        btn(
          existing?.skipped ? "Попробовать снова" : "Начать отвечать",
          () => enqueue(() => choose(question, true), true),
          "btn primary",
        ),
      );
      return;
    }
    draft = existing;
    const attempt = state.knowledgeReview.attempts[draft.id];
    if (attempt) {
      renderFeedback(attempt);
      return;
    }
    const form = el("form");
    form.dataset.knowledgeAnswer = "";
    if (question.type === "choice") {
      const group = el("fieldset", undefined, "knowledge-choices");
      group.append(el("legend", "Ваш ответ"));
      for (const option of question.options) {
        const l = el("label"),
          radio = el("input");
        radio.type = "radio";
        radio.name = "knowledge-answer";
        radio.value = option.id;
        radio.required = true;
        radio.checked = draft.choiceId === option.id;
        l.append(radio, el("span", option.text));
        group.append(l);
      }
      form.append(group);
    } else {
      const label = el("label", "Ваш ответ (до 6 000 символов)"),
        area = el("textarea");
      area.rows = 5;
      area.maxLength = 6000;
      area.required = true;
      area.value = draft.text;
      label.append(area);
      form.append(label);
    }
    const send = el("button", "Ответить и открыть разбор", "btn primary");
    send.type = "submit";
    form.append(send);
    form.addEventListener("input", () => {
      edit++;
      clearTimeout(timer);
      notice.textContent = "Есть несохранённый ответ…";
      timer = setTimeout(() => enqueue(saveDraft), 300);
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (locks) return;
      clearTimeout(timer);
      const values = read();
      enqueue(async () => {
        await mutate((r) => core.submit(r, { ...draft, ...values }));
        saved = edit;
        work.querySelector("h2")?.focus();
      }, true);
    });
    work.append(
      form,
      btn("Пропустить до завтра", () =>
        enqueue(async () => {
          if (edit > saved) await saveDraft();
          await mutate((r) => core.skip(r, question));
        }, true),
      ),
    );
    const save = el(
      "p",
      "Разбор появится после ответа. Проверка результата не меняет статус освоения урока.",
      "small muted",
    );
    work.append(save);
  }
  function renderFeedback(a) {
    const box = el("section", undefined, "knowledge-feedback");
    box.setAttribute("aria-label", "Разбор ответа");
    box.append(
      el("h3", resultName(a)),
      el("p", "Ваш ответ"),
      el(
        "p",
        a.question.type === "choice"
          ? a.question.options.find((o) => o.id === a.choiceId)?.text || ""
          : a.text,
        "knowledge-response",
      ),
      el("h3", "Почему"),
      el("p", a.question.explanation),
    );
    if (a.question.type === "choice")
      box.append(
        el(
          "p",
          "Ответ по ключу: " +
            a.question.options.find((o) => o.id === a.question.answerId).text,
        ),
      );
    if (a.question.type === "open" && !a.result) {
      const form = el("form");
      form.dataset.knowledgeRubric = "";
      for (const criterion of a.question.rubric) {
        const fs = el("fieldset", undefined, "knowledge-choices");
        fs.append(el("legend", criterion.text));
        for (const [value, label] of [
          [0, "Пока нет"],
          [1, "Частично"],
          [2, "Выполнено"],
        ]) {
          const l = el("label"),
            input = el("input");
          input.type = "radio";
          input.name = criterion.id;
          input.value = String(value);
          input.required = true;
          l.append(input, el("span", label));
          fs.append(l);
        }
        form.append(fs);
      }
      const send = el("button", "Сохранить самооценку", "btn primary");
      send.type = "submit";
      form.append(send);
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (locks) return;
        const ratings = {};
        for (const c of a.question.rubric)
          ratings[c.id] = Number(
            form.querySelector('input[name="' + c.id + '"]:checked').value,
          );
        enqueue(() => mutate((r) => core.assess(r, a.id, ratings)), true);
      });
      box.append(
        form,
        el(
          "p",
          "Это ваша самооценка по критериям. Смысл свободного текста автоматически не проверяется.",
          "small muted",
        ),
      );
    } else {
      box.append(el("p", a.resultNote, "small muted"));
      const scheduled = state.knowledgeReview.schedule[a.question.id];
      if (scheduled)
        box.append(
          el(
            "p",
            scheduled.suspended
              ? "Автоповтор остановлен после двух ошибок. Изучите тему и явно верните вопрос к повторению."
              : (state.knowledgeReview.enabled
                  ? "Следующий автоматический повтор: "
                  : "Сохранённый срок (автоповтор отключён): ") +
                  new Date(scheduled.dueAt).toLocaleString("ru-RU"),
            "small muted",
          ),
        );
      if (scheduled?.suspended)
        box.append(
          btn("Вернуть к повторению завтра", () =>
            enqueue(() =>
              mutate((r) => ({
                ...r,
                schedule: {
                  ...r.schedule,
                  [a.question.id]: {
                    ...r.schedule[a.question.id],
                    failures: 0,
                    suspended: false,
                    dueAt: core.addDays(Date.now(), 1),
                    updatedAt: Date.now(),
                  },
                },
              })),
            ),
          ),
        );
      box.append(
        btn(
          scheduled &&
            !scheduled.suspended &&
            state.knowledgeReview.enabled &&
            scheduled.dueAt <= Date.now()
            ? "Ответить на запланированный повтор"
            : "Тренировочная повторная попытка",
          () => enqueue(() => choose(q(), true), true),
        ),
      );
      box.append(
        el(
          "p",
          "Немедленный повтор не доказывает освоение и не увеличивает интервал. Проверьте понимание позже или на другом похожем случае.",
          "small muted",
        ),
      );
    }
    const link = el("a", "Вернуться к теме курса", "btn");
    link.href = "/lesson/" + a.question.entryId + "/";
    box.append(link);
    work.append(box);
  }
  function renderHistory() {
    const box = root.querySelector("[data-knowledge-history]");
    box.replaceChildren();
    const attempts = Object.values(state.knowledgeReview.attempts)
      .filter((a) => !qid || a.question.id === qid)
      .sort((a, b) => b.at - a.at);
    box.append(el("h2", "История ответов", "h2"));
    if (!attempts.length) {
      box.append(el("p", "Отправленных ответов пока нет.", "small muted"));
      return;
    }
    for (const a of attempts) {
      const details = el("details"),
        summary = el(
          "summary",
          a.question.skill +
            " · v" +
            a.question.version +
            " · " +
            new Date(a.at).toLocaleString("ru-RU") +
            " · " +
            resultName(a),
        );
      details.append(
        summary,
        el("p", a.question.prompt),
        el(
          "p",
          a.question.type === "choice"
            ? a.question.options.find((o) => o.id === a.choiceId)?.text ||
                "Ответ не выбран"
            : a.text,
        ),
        el("p", a.resultNote, "small muted"),
      );
      if (!a.archived) details.append(el("p", a.question.explanation));
      box.append(details);
    }
  }
  function render() {
    renderStats();
    renderCatalog();
    renderQuestion();
    renderHistory();
    controls();
  }
  store.ready
    .then(async () => {
      state = await store.getState();
      durable = store.getMode() !== "memory";
      notice.textContent = durable
        ? "Ответы сохраняются только на устройстве."
        : "Хранилище недоступно: работа только в памяти вкладки.";
      render();
      store.subscribe(async () => {
        if (pending) return;
        if (edit > saved) {
          notice.textContent =
            "Данные изменились в другой вкладке. Несохранённый текст оставлен в форме.";
          return;
        }
        state = await store.getState();
        render();
      });
    })
    .catch(
      (e) =>
        (notice.textContent = "Не удалось загрузить проверку: " + e.message),
    );
  window.addEventListener("beforeunload", (event) => {
    if (edit > saved || pending || !durable) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  let renderedDay = core.day();
  function refreshDay() {
    if (!state || pending || edit > saved) return;
    renderedDay = core.day();
    renderStats();
    renderCatalog();
    controls();
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && edit > saved) enqueue(saveDraft);
    else if (!document.hidden) refreshDay();
  });
  setInterval(() => {
    if (core.day() !== renderedDay) refreshDay();
  }, 30000);
})();
