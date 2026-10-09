/* M1 compares immutable history snapshots; it never writes grades or user state. */
(() => {
  const store = window.SalesOSUserStore;
  if (!store) return;
  const ratings = ["Пока не выполнено", "Частично", "Выполнено по условию"];
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  for (const panel of document.querySelectorAll("[data-practice-comparison]")) {
    const id = panel.dataset.practiceComparison;
    const controls = panel.querySelector("[data-comparison-controls]");
    const left = panel.querySelector("[data-comparison-left]");
    const right = panel.querySelector("[data-comparison-right]");
    const status = panel.querySelector("[data-comparison-status]");
    const result = panel.querySelector("[data-comparison-result]");
    let attempts = [];
    let fingerprint = null;
    let request = 0;
    const date = (value) => new Date(value).toLocaleString("ru-RU");
    function column(attempt, key, title) {
      const section = element("section", undefined, "comparison-column");
      section.append(element("h5", title));
      if (key === "nextStep") {
        section.append(
          element(
            "p",
            attempt.nextStep || "Следующий шаг не записан.",
            "comparison-answer",
          ),
        );
        return section;
      }
      const criterion = (attempt.rubric || []).find((row) => row.id === key);
      section.append(
        element(
          "p",
          criterion?.label || "Критерия нет в снимке рубрики",
          "comparison-label",
        ),
      );
      if (criterion?.description)
        section.append(element("p", criterion.description, "small muted"));
      section.append(
        element(
          "p",
          attempt.answers?.[key] || "Ответ не записан.",
          "comparison-answer",
        ),
      );
      section.append(
        element(
          "p",
          `Самопроверка: ${ratings[attempt.selfReview?.[key]] || "не выбрана"}`,
          "small muted",
        ),
      );
      return section;
    }
    function render() {
      result.replaceChildren();
      if (attempts.length < 2) return;
      if (left.value === right.value) {
        status.textContent = "Выберите две разные итерации для сравнения.";
        return;
      }
      const a = attempts.find((attempt) => attempt.id === left.value);
      const b = attempts.find((attempt) => attempt.id === right.value);
      if (!a || !b) return;
      const keys = [
        ...new Set([
          ...(a.rubric || []).map((row) => row.id),
          ...(b.rubric || []).map((row) => row.id),
          ...Object.keys(a.answers || {}),
          ...Object.keys(b.answers || {}),
          ...Object.keys(a.selfReview || {}),
          ...Object.keys(b.selfReview || {}),
        ]),
      ];
      let changedCount = 0;
      for (const [index, key] of [...keys, "nextStep"].entries()) {
        const row = element("article", undefined, "comparison-row");
        const heading = element(
          "h4",
          key === "nextStep" ? "Следующий шаг" : `Критерий ${index + 1}`,
        );
        const ca = (a.rubric || []).find((r) => r.id === key);
        const cb = (b.rubric || []).find((r) => r.id === key);
        const changedRubric =
          key !== "nextStep" && JSON.stringify(ca) !== JSON.stringify(cb);
        const changed =
          key === "nextStep"
            ? a.nextStep !== b.nextStep
            : changedRubric ||
              (a.answers?.[key] || "") !== (b.answers?.[key] || "") ||
              a.selfReview?.[key] !== b.selfReview?.[key];
        if (changed) changedCount++;
        row.append(
          heading,
          element(
            "p",
            changed ? "Есть изменения" : "Без изменений",
            "small muted",
          ),
        );
        if (changedRubric)
          row.append(
            element(
              "p",
              "Рубрика изменилась. Ниже показаны исходные формулировки каждой итерации; оценки напрямую не сопоставимы.",
              "notice",
            ),
          );
        const columns = element("div", undefined, "comparison-columns");
        columns.append(
          column(a, key, `Первая · ${date(a.createdAt)}`),
          column(b, key, `Вторая · ${date(b.createdAt)}`),
        );
        row.append(columns);
        result.append(row);
      }
      status.textContent = `Сравнение готово. Разделов с изменениями: ${changedCount} из ${keys.length + 1}. Самооценка не является внешней оценкой качества.`;
    }
    function update(state) {
      const next = [...(state.practiceAttempts?.[id] || [])].sort(
        (a, b) => a.createdAt - b.createdAt,
      );
      const signature = JSON.stringify(next);
      if (signature === fingerprint) return;
      fingerprint = signature;
      const hadComparison = attempts.length >= 2;
      attempts = next;
      const oldLeft = hadComparison ? left.value : "";
      const oldRight = hadComparison ? right.value : "";
      left.replaceChildren();
      right.replaceChildren();
      for (const [index, attempt] of attempts.entries()) {
        for (const select of [left, right]) {
          const option = element(
            "option",
            `Итерация ${index + 1} · ${date(attempt.createdAt)}`,
          );
          option.value = attempt.id;
          select.append(option);
        }
      }
      controls.hidden = attempts.length < 2;
      if (attempts.length < 2) {
        result.replaceChildren();
        status.textContent = attempts.length
          ? "Сохранена одна итерация. После следующей попытки можно сравнить ответы."
          : "Сохраните две итерации ответа, чтобы увидеть различия.";
        return;
      }
      left.value = attempts.some((a) => a.id === oldLeft)
        ? oldLeft
        : attempts[0].id;
      right.value = attempts.some((a) => a.id === oldRight)
        ? oldRight
        : attempts.at(-1).id;
      render();
    }
    async function refresh() {
      const current = ++request;
      try {
        const state = await store.getState();
        if (current === request) update(state);
      } catch {
        if (current !== request) return;
        fingerprint = null;
        controls.hidden = true;
        result.replaceChildren();
        status.replaceChildren(
          element("span", "Не удалось прочитать историю. "),
        );
        const retry = element("button", "Повторить", "btn smallbtn");
        retry.type = "button";
        retry.addEventListener("click", refresh);
        status.append(retry);
      }
    }
    left.addEventListener("change", render);
    right.addEventListener("change", render);
    store.subscribe((message) => {
      if (message.type === "state" || message.type === "replace")
        void refresh();
    });
    void refresh();
  }
})();
