/* M5: project documents and immutable practice snapshots, no cloud transport. */
(() => {
  const record = (v) =>
    v !== null && typeof v === "object" && !Array.isArray(v);
  const id = (v) =>
    typeof v === "string" &&
    /^[a-zA-Z0-9_-]{1,100}$/.test(v) &&
    !["__proto__", "prototype", "constructor"].includes(v);
  const txt = (v, max = 10000) => typeof v === "string" && v.length <= max;
  const stamp = (v) =>
    Number.isSafeInteger(v) && v >= 0 && v <= 8640000000000000;
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const fail = (m) => {
    throw Error(m);
  };
  const fields = [
    "service",
    "audience",
    "context",
    "constraints",
    "goal",
    "assumptions",
    "questions",
    "legacyNote",
  ];
  const empty = () => ({
    activeId: null,
    activeUpdatedAt: 0,
    items: {},
    tombstones: {},
    migrations: [],
  });
  const hash = (v) => {
    let a = 2166136261;
    for (const c of JSON.stringify(v))
      a = Math.imul(a ^ c.charCodeAt(0), 16777619) >>> 0;
    return a.toString(16).padStart(8, "0");
  };
  const legacyId = "00000000-0000-4000-8000-000000000005";
  function draftValid(d) {
    if (
      !record(d) ||
      !record(d.answers) ||
      !record(d.selfReview) ||
      !txt(d.nextStep || "") ||
      !stamp(d.updatedAt || 0) ||
      !txt(d.writerId || "", 100)
    )
      fail("Некорректный ответ проекта");
    for (const [k, v] of Object.entries(d.answers))
      if (!/^criterion-\d{1,2}$/.test(k) || !txt(v))
        fail("Некорректный этап проекта");
    for (const [k, v] of Object.entries(d.selfReview))
      if (!/^criterion-\d{1,2}$/.test(k) || ![0, 1, 2].includes(v))
        fail("Некорректная самооценка проекта");
    if (d.versions !== undefined) {
      if (!Array.isArray(d.versions) || d.versions.length > 100)
        fail("Слишком много вариантов черновика");
      for (const v of d.versions) {
        if (v.versions !== undefined)
          fail("Вложенные версии не поддерживаются");
        draftValid(v);
      }
    }
  }
  function attemptValid(a, source = false) {
    if (
      !record(a) ||
      !id(a.id) ||
      !stamp(a.createdAt) ||
      !Array.isArray(a.rubric) ||
      a.rubric.length > 30 ||
      !a.rubric.every(
        (c) => record(c) && id(c.id) && txt(c.label) && txt(c.description),
      )
    )
      fail("Некорректная итерация");
    if (source) {
      if (
        !record(a.answers) ||
        !record(a.selfReview) ||
        !txt(a.nextStep || "") ||
        Object.keys(a.answers).length > 30 ||
        !Object.entries(a.answers).every(([k, v]) => id(k) && txt(v)) ||
        !Object.entries(a.selfReview).every(
          ([k, v]) => id(k) && [0, 1, 2].includes(v),
        )
      )
        fail("Некорректный снимок практики");
    } else draftValid({ ...a, updatedAt: a.createdAt });
  }
  function validate(raw) {
    if (raw === undefined) return empty();
    if (
      !record(raw) ||
      !record(raw.items) ||
      !record(raw.tombstones) ||
      !Array.isArray(raw.migrations) ||
      raw.migrations.length > 500 ||
      !raw.migrations.every(id) ||
      !stamp(raw.activeUpdatedAt) ||
      !(raw.activeId === null || id(raw.activeId)) ||
      Object.keys(raw.items).length > 50 ||
      Object.keys(raw.tombstones).length > 500
    )
      fail("Некорректная рабочая тетрадь");
    for (const [k, p] of Object.entries(raw.items)) {
      if (
        !id(k) ||
        !record(p) ||
        p.id !== k ||
        !txt(p.name, 120) ||
        !p.name.trim() ||
        !stamp(p.createdAt) ||
        !stamp(p.updatedAt) ||
        !Number.isSafeInteger(p.revision) ||
        p.revision < 1 ||
        !Number.isSafeInteger(p.contextRevision) ||
        p.contextRevision < 1 ||
        typeof p.archived !== "boolean" ||
        !record(p.context) ||
        !fields.every((f) =>
          txt(p.context[f], f === "legacyNote" ? 250000 : 10000),
        ) ||
        !Array.isArray(p.attempts) ||
        p.attempts.length > 200 ||
        !record(p.stages) ||
        Object.keys(p.stages).length !== 10
      )
        fail("Некорректный проект");
      draftValid(p.draft);
      for (const a of p.attempts) attemptValid(a);
      if (new Set(p.attempts.map((a) => a.id)).size !== p.attempts.length)
        fail("Повтор ID итерации");
      for (let i = 1; i <= 10; i++) {
        const s = p.stages["criterion-" + i];
        if (
          !record(s) ||
          !id(s.id) ||
          !Number.isSafeInteger(s.revision) ||
          s.revision < 1 ||
          !Array.isArray(s.attachments) ||
          s.attachments.length > 20
        )
          fail("Некорректный этап");
        for (const a of s.attachments) {
          if (
            !record(a) ||
            !id(a.id) ||
            !/^\d{2}-P\d{2}$/.test(a.sourceId) ||
            !txt(a.sourceTitle, 1000) ||
            !stamp(a.attachedAt)
          )
            fail("Некорректный источник практики");
          attemptValid(a.attempt, true);
        }
        if (
          new Set(s.attachments.map((a) => a.id)).size !== s.attachments.length
        )
          fail("Повтор снимка");
      }
    }
    for (const [k, v] of Object.entries(raw.tombstones))
      if (!id(k) || !stamp(v) || Object.hasOwn(raw.items, k))
        fail("Некорректная запись удаления");
    if (
      raw.activeId &&
      (!raw.items[raw.activeId] || raw.items[raw.activeId].archived)
    )
      fail("Активный проект недоступен");
    if (JSON.stringify(raw).length > 3500000)
      fail("Тетрадь превысила допустимый объём. Данные не изменены.");
    return clone(raw);
  }
  function create(raw, name, now = Date.now(), key = crypto.randomUUID()) {
    const r = validate(raw);
    if (r.items[key] || r.tombstones[key]) fail("ID проекта уже используется");
    const stages = {};
    for (let i = 1; i <= 10; i++)
      stages["criterion-" + i] = {
        id: crypto.randomUUID(),
        revision: 1,
        attachments: [],
      };
    r.items[key] = {
      id: key,
      name: name.trim(),
      createdAt: now,
      updatedAt: now,
      revision: 1,
      contextRevision: 1,
      archived: false,
      context: Object.fromEntries(fields.map((f) => [f, ""])),
      draft: {
        answers: {},
        selfReview: {},
        nextStep: "",
        updatedAt: 0,
        writerId: "",
        versions: [],
      },
      attempts: [],
      stages,
    };
    r.activeId = key;
    r.activeUpdatedAt = now;
    return validate(r);
  }
  function get(r, key) {
    const p = r.items[key];
    if (!p || p.archived)
      fail("Проект архивирован или удалён. Ответ оставлен в форме.");
    return p;
  }
  function touch(p, now = Date.now()) {
    p.revision++;
    p.updatedAt = now;
  }
  function activate(raw, key, now = Date.now()) {
    const r = validate(raw);
    get(r, key);
    r.activeId = key;
    r.activeUpdatedAt = now;
    return r;
  }
  function context(raw, key, revision, name, values) {
    const r = validate(raw),
      p = get(r, key);
    if (p.contextRevision !== revision)
      fail(
        "Контекст изменён в другой вкладке. Скопируйте свой текст или загрузите сохранённый вариант.",
      );
    p.name = name.trim();
    p.context = { ...p.context, ...values };
    p.contextRevision++;
    touch(p);
    return validate(r);
  }
  function writeDraft(raw, key, draft) {
    const r = validate(raw),
      p = get(r, key);
    for (const [stage, s] of Object.entries(p.stages))
      if (
        p.draft.answers[stage] !== draft.answers[stage] ||
        p.draft.selfReview[stage] !== draft.selfReview[stage]
      )
        s.revision++;
    const extras = (map) =>
      Object.fromEntries(
        Object.entries(map).filter(
          ([k]) => !/^criterion-(?:[1-9]|10)$/.test(k),
        ),
      );
    p.draft = {
      ...clone(draft),
      answers: { ...extras(p.draft.answers), ...draft.answers },
      selfReview: { ...extras(p.draft.selfReview), ...draft.selfReview },
    };
    touch(p);
    return validate(r);
  }
  function writeAttempts(raw, key, attempts) {
    const r = validate(raw),
      p = get(r, key);
    p.attempts = clone(attempts);
    touch(p);
    return validate(r);
  }
  function attach(raw, key, stage, source, attempt, now = Date.now()) {
    const r = validate(raw),
      p = get(r, key),
      s = p.stages[stage];
    if (!s || source.kind !== "practice")
      fail("Выберите этап и сохранённую итерацию практики");
    if (
      s.attachments.some(
        (a) =>
          a.sourceId === source.id &&
          a.attempt.id === attempt.id &&
          JSON.stringify(a.attempt) === JSON.stringify(attempt),
      )
    )
      return r;
    s.attachments.push({
      id: crypto.randomUUID(),
      sourceId: source.id,
      sourceTitle: source.title,
      attachedAt: now,
      attempt: clone(attempt),
    });
    s.revision++;
    touch(p, now);
    return validate(r);
  }
  function archive(raw, key, archived, now = Date.now()) {
    const r = validate(raw),
      p = r.items[key];
    if (!p) fail("Проект не найден");
    p.archived = archived;
    touch(p, now);
    if (archived && r.activeId === key) {
      r.activeId = null;
      r.activeUpdatedAt = now;
    }
    return validate(r);
  }
  function remove(raw, key, name, now = Date.now()) {
    const r = validate(raw),
      p = r.items[key];
    if (!p?.archived || p.name !== name)
      fail(
        "Для окончательного удаления архивируйте проект и точно введите его название",
      );
    delete r.items[key];
    r.tombstones[key] = now;
    if (r.activeId === key) r.activeId = null;
    return validate(r);
  }
  function migrate(raw, state, note = "") {
    let r = validate(raw);
    const d = state.practiceDrafts?.FINAL_PROJECT,
      attempts = state.practiceAttempts?.FINAL_PROJECT || [];
    if (!d && !attempts.length && !note.trim()) return r;
    const signature = "legacy-" + hash({ d, attempts, note });
    if (r.migrations.includes(signature) || r.tombstones[legacyId]) return r;
    const active = r.activeId,
      activeAt = r.activeUpdatedAt;
    const first = !r.items[legacyId];
    if (first) r = create(r, "Мой первый проект", Date.now(), legacyId);
    const p = r.items[legacyId];
    p.draft.versions ||= [];
    if (d) {
      if (first) p.draft = { ...clone(d), versions: clone(d.versions || []) };
      else if (JSON.stringify(p.draft) !== JSON.stringify(d)) {
        const snap = clone(d);
        delete snap.versions;
        if (
          !p.draft.versions.some(
            (v) => JSON.stringify(v) === JSON.stringify(snap),
          )
        )
          p.draft.versions.push(snap);
      }
      for (const v of d.versions || [])
        if (
          !p.draft.versions.some((o) => JSON.stringify(o) === JSON.stringify(v))
        )
          p.draft.versions.push(clone(v));
    }
    for (const a of attempts) {
      const old = p.attempts.find((v) => v.id === a.id);
      if (!old) p.attempts.push(clone(a));
      else if (JSON.stringify(old) !== JSON.stringify(a)) {
        const key = a.id.slice(0, 70) + "-copy-" + hash(a);
        if (!p.attempts.some((v) => v.id === key))
          p.attempts.push({ ...clone(a), id: key });
      }
    }
    if (note && !p.context.legacyNote.includes(note))
      p.context.legacyNote +=
        (p.context.legacyNote ? "\n\n---\n\n" : "") + note;
    r.migrations.push(signature);
    touch(p);
    if (active) {
      r.activeId = active;
      r.activeUpdatedAt = activeAt;
    }
    return validate(r);
  }
  function merge(left, right) {
    const a = validate(left),
      b = validate(right),
      out = clone(a);
    out.tombstones = { ...a.tombstones, ...b.tombstones };
    for (const k of Object.keys(out.tombstones)) delete out.items[k];
    for (const [k, p] of Object.entries(b.items)) {
      if (out.tombstones[k]) continue;
      const old = out.items[k];
      if (!old) out.items[k] = p;
      else if (JSON.stringify(old) !== JSON.stringify(p)) {
        const newer = p.updatedAt > old.updatedAt ? p : old,
          other = newer === p ? old : p;
        out.items[k] = newer;
        const h =
          hash(other) +
          hash([k, other]) +
          hash([other, k]) +
          hash([k, other, k]);
        const key =
          h.slice(0, 8) +
          "-" +
          h.slice(8, 12) +
          "-4" +
          h.slice(13, 16) +
          "-8" +
          h.slice(17, 20) +
          "-" +
          h.slice(20, 32);
        if (!out.items[key] && !out.tombstones[key])
          out.items[key] = {
            ...other,
            id: key,
            name: other.name.slice(0, 95) + " · вариант из копии",
          };
      }
    }
    out.migrations = [...new Set([...a.migrations, ...b.migrations])];
    if (b.activeUpdatedAt > a.activeUpdatedAt) {
      out.activeId = b.activeId;
      out.activeUpdatedAt = b.activeUpdatedAt;
    }
    if (
      out.activeId &&
      (!out.items[out.activeId] || out.items[out.activeId].archived)
    )
      out.activeId = null;
    return validate(out);
  }
  function summary(p, rubric) {
    const missing = fields.filter(
      (f) =>
        !["assumptions", "questions", "legacyNote"].includes(f) &&
        !p.context[f].trim(),
    );
    const incomplete = rubric.filter(
      (c) => !p.draft.answers[c.id]?.trim() || p.draft.selfReview[c.id] !== 2,
    );
    return {
      missing,
      incomplete,
      filled: rubric.filter((c) => p.draft.answers[c.id]?.trim()).length,
      next: missing.length
        ? "Заполните контекст проекта."
        : incomplete.length
          ? "Доработайте этап «" + incomplete[0].label + "»."
          : "Проверьте допущения и нерешённые вопросы на реальном или учебном случае.",
    };
  }
  function markdown(p, rubric) {
    // Escape Markdown control syntax and raw HTML; user content stays text.
    const escape = (v) =>
      String(v)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/([\\`*_{}\[\]()#+.!|>~-])/g, "\\$1");
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
    const blocks = [
      "# " + escape(p.name),
      "Самооценка и рабочие материалы; пригодность к применению требует вашей проверки.",
    ];
    for (const f of fields)
      blocks.push("## " + labels[f], escape(p.context[f] || "Не заполнено"));
    for (const c of rubric) {
      blocks.push(
        "## " + escape(c.label),
        escape(c.description),
        escape(p.draft.answers[c.id] || "Ответ не записан"),
        "Самооценка: " +
          (["нет результата", "частично", "пригодно к применению"][
            p.draft.selfReview[c.id]
          ] || "не выбрана"),
      );
      for (const a of p.stages[c.id].attachments) {
        blocks.push(
          "### Снимок: " + escape(a.sourceTitle),
          "Источник: /practice/" +
            a.sourceId +
            "/ · " +
            new Date(a.attempt.createdAt).toISOString() +
            " · итерация " +
            escape(a.attempt.id),
        );
        for (const criterion of a.attempt.rubric)
          blocks.push(
            "**" + escape(criterion.label) + "**",
            escape(a.attempt.answers[criterion.id] || "Ответ не записан"),
            "Самооценка: " +
              (["нет результата", "частично", "выполнено"][
                a.attempt.selfReview[criterion.id]
              ] || "не выбрана"),
          );
        if (a.attempt.nextStep)
          blocks.push("Следующая итерация: " + escape(a.attempt.nextStep));
      }
    }
    for (const [k, v] of Object.entries(p.draft.answers))
      if (!rubric.some((c) => c.id === k))
        blocks.push("## Прежнее поле: " + escape(k), escape(v));
    blocks.push(
      "## Следующий шаг",
      escape(p.draft.nextStep || summary(p, rubric).next),
    );
    return blocks.join("\n\n");
  }
  function html(p, rubric) {
    const esc = (v) =>
      String(v).replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      );
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
    const para = (v) => '<p class="text">' + esc(v || "Не заполнено") + "</p>";
    let body =
      "<h1>" +
      esc(p.name) +
      "</h1><p>Рабочие материалы и самооценка. Пригодность к применению требует вашей проверки.</p>";
    for (const f of fields)
      body +=
        "<section><h2>" +
        labels[f] +
        "</h2>" +
        para(p.context[f]) +
        "</section>";
    for (const c of rubric) {
      body +=
        "<section><h2>" +
        esc(c.label) +
        "</h2>" +
        para(c.description) +
        para(p.draft.answers[c.id]) +
        "<p>Самооценка: " +
        (["нет результата", "частично", "пригодно к применению"][
          p.draft.selfReview[c.id]
        ] || "не выбрана") +
        "</p>";
      for (const a of p.stages[c.id].attachments) {
        body +=
          "<h3>Снимок: " +
          esc(a.sourceTitle) +
          '</h3><p><a href="https://sl-os.vercel.app/practice/' +
          a.sourceId +
          '/">Источник ' +
          a.sourceId +
          "</a> · " +
          esc(new Date(a.attempt.createdAt).toISOString()) +
          " · итерация " +
          esc(a.attempt.id) +
          "</p>";
        for (const criterion of a.attempt.rubric)
          body +=
            "<h4>" +
            esc(criterion.label) +
            "</h4>" +
            para(a.attempt.answers[criterion.id]) +
            "<p>Самооценка: " +
            (["нет результата", "частично", "выполнено"][
              a.attempt.selfReview[criterion.id]
            ] || "не выбрана") +
            "</p>";
        body += para(a.attempt.nextStep);
      }
      body += "</section>";
    }
    for (const [k, v] of Object.entries(p.draft.answers))
      if (!rubric.some((c) => c.id === k))
        body += "<h2>Прежнее поле: " + esc(k) + "</h2>" + para(v);
    body +=
      "<h2>Следующий шаг</h2>" +
      para(p.draft.nextStep || summary(p, rubric).next);
    return (
      '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
      esc(p.name) +
      "</title><style>body{max-width:80ch;margin:40px auto;padding:0 24px;font:16px/1.6 system-ui;color:#171717;background:#fff}h1{font-size:28px}h2,h3,h4{break-after:avoid}.text{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#0761d1}@media print{body{margin:0;max-width:none;padding:0}button{display:none}.text{white-space:pre-wrap;overflow-wrap:anywhere}@page{margin:18mm}}</style><body>" +
      body +
      "</body></html>"
    );
  }

  window.SalesOSProjects = {
    empty,
    validate,
    create,
    activate,
    context,
    writeDraft,
    writeAttempts,
    attach,
    archive,
    remove,
    migrate,
    merge,
    summary,
    markdown,
    html,
    fields,
  };
})();
