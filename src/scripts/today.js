/* Snapshot-based daily study UI. No telemetry or automatic mastery updates. */
(() => {
  const root = document.querySelector("[data-today-root]");
  if (!root) return;
  const core = window.SalesOSToday,
    store = window.SalesOSUserStore;
  const data = JSON.parse(root.querySelector("[data-today-data]").textContent);
  const entries = data.entries;
  const withReviews = (current) => ({
    ...current,
    reviewPriorities: window.SalesOSKnowledge.priorityForToday(
      current.knowledgeReview,
      data.questions || [],
    ),
  });
  const work = root.querySelector("[data-today-workspace]"),
    notice = root.querySelector("[data-today-notice]");
  const goalNames = {
    any: "Без отдельной цели",
    foundation: "Основы продаж",
    conversation: "Переписка с клиентом",
    pricing: "Цена и предложение",
  };
  let state,
    selected,
    busy = false;
  const el = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
  const button = (label, action, cls = "btn") => {
    const b = el("button", label, cls);
    b.type = "button";
    b.addEventListener("click", action);
    return b;
  };
  function select(id) {
    selected = id;
    const url = new URL(location.href);
    url.searchParams.set("plan", id);
    url.searchParams.delete("budget");
    url.searchParams.delete("goal");
    history.replaceState(null, "", url);
  }
  function latest(current) {
    return Object.values(current.today.plans).sort(
      (a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id),
    )[0];
  }
  function backupButton() {
    notice.append(
      " ",
      button("Скачать резервную копию", async () => {
        try {
          const data = {
            ...(await store.getState()),
            format: "sales-os-v7",
            version: 7,
            exportedAt: new Date().toISOString(),
            notes: await store.getAllNotes(),
          };
          const url = URL.createObjectURL(
              new Blob([JSON.stringify(data, null, 2)], {
                type: "application/json",
              }),
            ),
            a = el("a");
          a.href = url;
          a.download = "sales-os-backup-v7.json";
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (e) {
          notice.append(" Экспорт не удался: " + e.message);
        }
      }),
    );
  }
  async function mutate(fn) {
    if (busy) return;
    busy = true;
    work
      .querySelectorAll("button,input,select")
      .forEach((b) => (b.disabled = true));
    try {
      const result = await store.updateState((current) => {
        const today = core.validate(current.today);
        fn(today, current);
        return { ...current, today: core.validate(today) };
      });
      state = result.state;
      notice.textContent = result.durable
        ? "Занятие сохранено на устройстве."
        : "Изменения только в памяти вкладки. Не закрывайте страницу без резервной копии.";
      if (!result.durable) backupButton();
    } catch (e) {
      notice.textContent = "Не удалось изменить занятие: " + e.message;
    } finally {
      busy = false;
      render();
    }
  }
  function controls() {
    const fieldset = el("fieldset", undefined, "today-setup");
    fieldset.append(el("legend", "Составить занятие"));
    const row = el("div", undefined, "today-options"),
      pref = state.today.preferences;
    for (const [key, label, values] of [
      [
        "budget",
        "Сколько времени есть?",
        { 10: "10 минут", 20: "20 минут", 40: "40 минут" },
      ],
      ["goal", "Текущая цель (необязательно)", goalNames],
    ]) {
      const box = el("label", label),
        input = el("select");
      input.name = key;
      input.setAttribute("aria-label", label);
      for (const [value, title] of Object.entries(values)) {
        const o = el("option", title);
        o.value = value;
        input.append(o);
      }
      input.value = String(pref[key]);
      box.append(input);
      row.append(box);
    }
    fieldset.append(
      row,
      el(
        "p",
        "Время — ориентировочный диапазон для небольшого шага, а не оценка чтения всего материала.",
        "small muted",
      ),
    );
    fieldset.append(
      button(
        state.today.plans[selected]
          ? "Создать новое занятие"
          : "Начать занятие",
        () => {
          const budget = Number(
              fieldset.querySelector('[name="budget"]').value,
            ),
            goal = fieldset.querySelector('[name="goal"]').value;
          mutate((today, current) => {
            if (Object.keys(today.plans).length >= 365)
              throw Error(
                "Достигнут лимит 365 занятий. Сохраните копию; история не удаляется автоматически.",
              );
            const p = core.create(entries, withReviews(current), budget, goal);
            today.preferences = { budget, goal, updatedAt: Date.now() };
            today.plans[p.id] = p;
            select(p.id);
          });
        },
        "btn primary",
      ),
    );
    return fieldset;
  }
  function updatePlan(action) {
    const expectedId = selected;
    mutate((today, current) => {
      const p = today.plans[expectedId];
      if (!p)
        throw Error(
          "Занятие заменено в другой вкладке. Выберите сохранённое занятие.",
        );
      action(p, today, current);
      p.updatedAt = Math.max(Date.now(), p.updatedAt + 1);
    });
  }
  function render() {
    if (!state) return;
    work.replaceChildren();
    const p = state.today.plans[selected],
      setup = controls();
    if (p) {
      const details = el("details", undefined, "today-settings");
      details.append(
        el("summary", "Изменить время или цель для нового занятия"),
        setup,
      );
      work.append(details);
    } else {
      work.append(setup);
      if (Object.keys(state.today.plans).length) {
        const b = button("Открыть последнее сохранённое занятие", () => {
          select(latest(state).id);
          render();
        });
        work.append(b);
      }
      return;
    }
    const section = el("section", undefined, "today-plan");
    section.setAttribute("aria-labelledby", "today-plan-heading");
    const heading = el("h2", p.day + " · " + p.budget + " минут", "h2");
    heading.id = "today-plan-heading";
    section.append(
      heading,
      el(
        "p",
        goalNames[p.goal] +
          " · " +
          { paused: "На паузе", finished: "Завершено", active: "В работе" }[
            p.status
          ],
        "muted",
      ),
    );
    if (
      p.day !== core.day() ||
      p.zone !== Intl.DateTimeFormat().resolvedOptions().timeZone
    )
      section.append(
        el(
          "p",
          "Сменился день или часовой пояс. Этот план сохранён без изменений: продолжите его или явно создайте новое занятие.",
          "notice",
        ),
      );
    const lo = p.items.reduce((n, i) => n + i.minutes[0], 0),
      hi = p.items.reduce((n, i) => n + i.minutes[1], 0);
    section.append(
      el(
        "p",
        "Примерно " +
          lo +
          "–" +
          hi +
          " минут. Выполнение шага не означает освоение урока. Статусы курса и сроки повторения меняются только в соответствующих разделах.",
        "small muted",
      ),
    );
    if (!p.items.some((i) => i.kind === "review"))
      section.append(
        el(
          "p",
          "Пока нет пройденных материалов или назначенных повторов. В этом занятии начнём с нового материала и практики.",
          "small muted",
        ),
      );
    const list = el("ol", undefined, "today-items");
    for (const item of p.items) {
      const li = el("li");
      li.dataset.todayItem = item.id;
      const head = el("div", undefined, "today-item-head");
      head.append(
        el(
          "span",
          {
            review: "Повторить",
            theory: "Разобрать и применить",
            practice: "Шаг практики",
          }[item.kind],
          "badge",
        ),
        el(
          "span",
          item.minutes.join("–") +
            " мин · " +
            { done: "Выполнено", skipped: "Пропущено", pending: "Предстоит" }[
              item.status
            ],
          "small muted",
        ),
      );
      const link = el("a", item.title);
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noopener";
      link.setAttribute("aria-label", item.title + " (в новой вкладке)");
      const h = el("h3");
      h.append(link);
      li.append(
        head,
        h,
        el("p", item.step),
        el("p", item.reason, "small muted"),
      );
      if (p.status === "active" && item.status === "pending") {
        const actions = el("div", undefined, "today-actions");
        const change = (value) =>
          updatePlan((latest) => {
            const i = latest.items.find((v) => v.id === item.id);
            if (
              latest.status !== "active" ||
              i.entryId !== item.entryId ||
              i.status !== "pending"
            )
              throw Error(
                "Пункт уже изменён в другой вкладке; проверьте план.",
              );
            i.status = value;
            i.updatedAt = Date.now();
          });
        actions.append(
          button("Шаг выполнен", () => change("done"), "btn primary"),
          button("Пропустить", () => change("skipped")),
          button("Заменить", () =>
            updatePlan((latest, today, current) => {
              const i = latest.items.find((v) => v.id === item.id);
              if (i.entryId !== item.entryId)
                throw Error("Пункт уже заменён в другой вкладке.");
              today.plans[latest.id] = core.replace(
                latest,
                item.id,
                entries,
                withReviews(current),
              );
            }),
          ),
        );
        li.append(actions);
      }
      list.append(li);
    }
    section.append(list);
    if (p.status !== "finished") {
      const actions = el("div", undefined, "today-actions");
      actions.append(
        button(
          p.status === "paused" ? "Продолжить занятие" : "Поставить на паузу",
          () =>
            updatePlan((latest) => {
              if (latest.status === "finished")
                throw Error("Занятие уже завершено");
              latest.status = p.status === "paused" ? "active" : "paused";
            }),
        ),
      );
      if (p.items.every((i) => i.status !== "pending"))
        actions.append(
          button(
            "Завершить занятие",
            () =>
              updatePlan((latest) => {
                if (latest.items.some((i) => i.status === "pending"))
                  throw Error("Остались невыполненные пункты");
                latest.status = "finished";
              }),
            "btn primary",
          ),
        );
      section.append(actions);
    } else {
      section.append(
        el("h3", "Результат занятия"),
        el(
          "p",
          "Выполнено: " +
            p.items.filter((i) => i.status === "done").length +
            ". Пропущено: " +
            p.items.filter((i) => i.status === "skipped").length +
            ". Пропуски не создают долг.",
        ),
      );
      const next =
        p.items.find((i) => i.status === "skipped") ||
        p.items.find((i) => i.kind === "practice") ||
        p.items[0];
      section.append(
        el(
          "p",
          "Следующий шаг: " +
            (next.status === "skipped"
              ? "вернитесь к пропущенному пункту, когда будет удобно"
              : "продолжите материал и проверьте результат по его критериям") +
            ".",
        ),
      );
      const a = el("a", next.title, "btn");
      a.href = next.url;
      section.append(a);
      const feedback = el("fieldset", undefined, "today-feedback");
      feedback.append(
        el(
          "legend",
          "Насколько посильно? (необязательно, только на устройстве)",
        ),
      );
      for (const [value, label] of Object.entries({
        easy: "Легко",
        fit: "В самый раз",
        hard: "Слишком много",
      })) {
        const b = button(label, () =>
          updatePlan((latest) => {
            latest.feasibility = value;
          }),
        );
        b.setAttribute("aria-pressed", String(p.feasibility === value));
        feedback.append(b);
      }
      section.append(feedback);
    }
    work.append(section);
    const historySection = el("section", undefined, "today-history");
    historySection.append(el("h2", "Сохранённые занятия", "h2"));
    for (const plan of Object.values(state.today.plans).sort(
      (a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id),
    )) {
      const b = button(
        plan.day +
          " · " +
          plan.budget +
          " мин · " +
          { finished: "Завершено", paused: "На паузе", active: "В работе" }[
            plan.status
          ],
        () => {
          select(plan.id);
          render();
        },
      );
      b.setAttribute("aria-pressed", String(selected === plan.id));
      historySection.append(b);
    }
    work.append(historySection);
  }
  let observedDay = core.day(),
    observedZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  function calendarCheck() {
    const next = core.day(),
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (next !== observedDay || zone !== observedZone) {
      observedDay = next;
      observedZone = zone;
      render();
    }
  }
  document.addEventListener("visibilitychange", calendarCheck);
  setInterval(calendarCheck, 30000);
  store.ready
    .then(async () => {
      state = await store.getState();
      const query = new URL(location.href).searchParams;
      if ([10, 20, 40].includes(Number(query.get("budget"))))
        state.today.preferences.budget = Number(query.get("budget"));
      if (Object.hasOwn(goalNames, query.get("goal")))
        state.today.preferences.goal = query.get("goal");
      selected =
        new URL(location.href).searchParams.get("plan") || latest(state)?.id;
      notice.textContent =
        store.getMode() === "memory"
          ? "Хранилище недоступно: работа только в этой вкладке."
          : "Прогресс хранится на этом устройстве.";
      if (store.getMode() === "memory") backupButton();
      render();
      store.subscribe(async () => {
        if (busy) return;
        state = await store.getState();
        render();
      });
    })
    .catch((e) => {
      notice.textContent =
        "Не удалось загрузить занятие: " +
        e.message +
        ". Перезагрузите страницу.";
    });
})();
