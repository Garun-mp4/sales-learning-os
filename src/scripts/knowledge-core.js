/* M4 pure contracts: versioned questions, explicit grading and opt-in intervals. */
(() => {
  const record = (v) =>
    v !== null && typeof v === "object" && !Array.isArray(v);
  const safeId = (v) =>
    typeof v === "string" &&
    /^[a-zA-Z0-9_-]{1,100}$/.test(v) &&
    !["__proto__", "constructor", "prototype"].includes(v);
  const text = (v, max = 6000) => typeof v === "string" && v.length <= max;
  const stamp = (v) => Number.isSafeInteger(v) && v >= 0;
  const fail = (m) => {
    throw Error(m);
  };
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const day = (at = Date.now()) => {
    const d = new Date(at);
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  };
  const addDays = (at, n) => {
    const d = new Date(at);
    d.setDate(d.getDate() + n);
    return d.getTime();
  };
  const intervals = [1, 3, 7, 14, 30];
  const empty = () => ({
    enabled: false,
    settingsUpdatedAt: 0,
    drafts: {},
    attempts: {},
    schedule: {},
    events: [],
  });
  function validateQuestion(q) {
    if (
      !record(q) ||
      !safeId(q.id) ||
      !Number.isSafeInteger(q.version) ||
      q.version < 1 ||
      !/^0[128]$/.test(q.module) ||
      !safeId(q.entryId) ||
      !text(q.skill, 200) ||
      !q.skill.trim() ||
      !text(q.prompt) ||
      !q.prompt.trim() ||
      !text(q.explanation) ||
      !q.explanation.trim() ||
      !["choice", "open"].includes(q.type) ||
      !Array.isArray(q.options) ||
      !Array.isArray(q.rubric) ||
      !record(q.review) ||
      q.review.method !== "author_self_review" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(q.review.checkedOn) ||
      !text(q.review.scope) ||
      !q.review.scope.trim()
    )
      fail("Некорректный вопрос");
    if (q.type === "choice") {
      if (
        q.options.length < 3 ||
        q.options.length > 6 ||
        new Set(q.options.map((o) => o.id)).size !== q.options.length ||
        !q.options.every(
          (o) => record(o) && safeId(o.id) && text(o.text) && o.text.trim(),
        ) ||
        !q.options.some((o) => o.id === q.answerId) ||
        q.rubric.length
      )
        fail("Нет однозначного ключа вопроса");
    } else if (
      q.options.length ||
      q.answerId !== "" ||
      q.rubric.length < 3 ||
      q.rubric.length > 6 ||
      new Set(q.rubric.map((c) => c.id)).size !== q.rubric.length ||
      !q.rubric.every(
        (c) => record(c) && safeId(c.id) && text(c.text) && c.text.trim(),
      )
    )
      fail("Нет рубрики открытого вопроса");
    return q;
  }
  function fingerprint(q) {
    let n = 2166136261;
    for (const c of JSON.stringify(q))
      n = Math.imul(n ^ c.charCodeAt(0), 16777619) >>> 0;
    return n.toString(16);
  }
  function score(question, choiceId, ratings) {
    if (question.type === "choice")
      return {
        kind: "objective",
        value: choiceId === question.answerId ? "correct" : "incorrect",
      };
    const keys = question.rubric.map((c) => c.id);
    if (
      !record(ratings) ||
      Object.keys(ratings).length !== keys.length ||
      !keys.every((k) => [0, 1, 2].includes(ratings[k]))
    )
      fail("Оцените каждый критерий рубрики");
    return {
      kind: "self",
      value: keys.every((k) => ratings[k] === 2)
        ? "met"
        : keys.some((k) => ratings[k] > 0)
          ? "partial"
          : "needs-work",
    };
  }
  function validate(raw) {
    if (raw === undefined) return empty();
    const bad = () =>
      fail("Некорректные данные проверки понимания; запись отменена");
    if (
      !record(raw) ||
      typeof raw.enabled !== "boolean" ||
      !stamp(raw.settingsUpdatedAt) ||
      !record(raw.drafts) ||
      !record(raw.attempts) ||
      !record(raw.schedule) ||
      !Array.isArray(raw.events) ||
      Object.keys(raw.drafts).length > 60 ||
      Object.keys(raw.attempts).length > 500 ||
      Object.keys(raw.schedule).length > 60 ||
      raw.events.length > 1000
    )
      bad();
    for (const [key, d] of Object.entries(raw.drafts)) {
      if (
        !safeId(key) ||
        !record(d) ||
        !safeId(d.id) ||
        d.questionId !== key ||
        !stamp(d.updatedAt) ||
        !Number.isSafeInteger(d.revision) ||
        d.revision < 1 ||
        !text(d.text) ||
        !text(d.choiceId, 100) ||
        typeof d.skipped !== "boolean"
      )
        bad();
      validateQuestion(d.question);
      if (
        d.question.id !== key ||
        d.fingerprint !== fingerprint(d.question) ||
        (d.choiceId && !d.question.options.some((o) => o.id === d.choiceId))
      )
        bad();
    }
    for (const [key, a] of Object.entries(raw.attempts)) {
      if (
        !safeId(key) ||
        !record(a) ||
        a.id !== key ||
        !stamp(a.at) ||
        !stamp(a.gradedAt) ||
        a.gradedAt < a.at ||
        !text(a.text) ||
        !text(a.choiceId, 100) ||
        typeof a.scheduleEligible !== "boolean" ||
        !record(a.ratings)
      )
        bad();
      validateQuestion(a.question);
      if (
        a.fingerprint !== fingerprint(a.question) ||
        !text(a.resultNote, 1000)
      )
        bad();
      if (a.archived === true) {
        if (
          a.result !== null ||
          a.scheduleEligible ||
          (a.choiceId && !a.question.options.some((o) => o.id === a.choiceId))
        )
          bad();
      } else if (a.question.type === "choice") {
        if (
          !a.question.options.some((o) => o.id === a.choiceId) ||
          !record(a.result) ||
          a.result.kind !== "objective" ||
          a.result.value !== score(a.question, a.choiceId, {}).value
        )
          bad();
      } else if (
        !a.text.trim() ||
        a.choiceId !== "" ||
        (a.result !== null &&
          (!record(a.result) ||
            a.result.kind !== "self" ||
            a.result.value !== score(a.question, "", a.ratings).value))
      )
        bad();
    }
    for (const [key, s] of Object.entries(raw.schedule)) {
      if (
        !safeId(key) ||
        !record(s) ||
        s.questionId !== key ||
        !safeId(s.entryId) ||
        !Number.isSafeInteger(s.questionVersion) ||
        s.questionVersion < 1 ||
        !text(s.fingerprint, 100) ||
        s.algorithm !== 1 ||
        !stamp(s.dueAt) ||
        !stamp(s.lastGradedAt) ||
        !stamp(s.updatedAt) ||
        !Number.isSafeInteger(s.streak) ||
        s.streak < 0 ||
        s.streak > 5 ||
        !Number.isSafeInteger(s.failures) ||
        s.failures < 0 ||
        s.failures > 2 ||
        typeof s.suspended !== "boolean"
      )
        bad();
    }
    for (const e of raw.events)
      if (
        !record(e) ||
        !safeId(e.id) ||
        !safeId(e.questionId) ||
        !["opened", "skipped"].includes(e.kind) ||
        !stamp(e.at)
      )
        bad();
    if (
      new Set(raw.events.map((e) => e.id)).size !== raw.events.length ||
      JSON.stringify(raw).length > 2000000
    )
      bad();
    return clone(raw);
  }
  function load(state, now = Date.now()) {
    const date = day(now);
    const attempts = Object.values(state.attempts).filter((a) => !a.archived),
      skips = state.events.filter(
        (e) => e.kind === "skipped" && day(e.at) === date,
      );
    const knownBefore = new Set([
      ...state.events.filter((e) => day(e.at) < date).map((e) => e.questionId),
      ...attempts.filter((a) => day(a.at) < date).map((a) => a.question.id),
    ]);
    const newToday = new Set(
      state.events
        .filter(
          (e) =>
            e.kind === "opened" &&
            day(e.at) === date &&
            !knownBefore.has(e.questionId),
        )
        .map((e) => e.questionId),
    );
    return {
      total: attempts.filter((a) => day(a.at) === date).length + skips.length,
      newCount: newToday.size,
      newToday,
      knownBefore,
    };
  }
  function checkLimit(state, q, now) {
    const limits = load(state, now);
    if (limits.total >= 10)
      fail(
        "На сегодня достаточно: лимит 10 ответов/пропусков. Можно изучать материалы и пользоваться ручной очередью.",
      );
    if (
      !limits.knownBefore.has(q.id) &&
      !limits.newToday.has(q.id) &&
      limits.newCount >= 3
    )
      fail(
        "На сегодня уже открыты 3 новых задания. Вернитесь завтра или повторите знакомое.",
      );
  }
  function archive(d) {
    return {
      id: d.id,
      question: d.question,
      fingerprint: d.fingerprint,
      text: d.text,
      choiceId: d.choiceId,
      at: d.updatedAt,
      gradedAt: d.updatedAt,
      ratings: {},
      result: null,
      scheduleEligible: false,
      archived: true,
      resultNote:
        "Архив черновика; не является отправленным или оценённым ответом.",
    };
  }
  function start(state, q, force = false, now = Date.now()) {
    state = validate(state);
    validateQuestion(q);
    const existing = state.drafts[q.id];
    if (
      existing &&
      existing.fingerprint === fingerprint(q) &&
      !force &&
      !existing.skipped
    )
      return state;
    checkLimit(state, q, now);
    // Old drafts and attempts retain their original question snapshot.
    if (
      existing &&
      !state.attempts[existing.id] &&
      (existing.fingerprint !== fingerprint(q) || force || existing.skipped)
    ) {
      state.attempts[existing.id] = archive(existing);
    }
    const id = crypto.randomUUID();
    state.drafts[q.id] = {
      id,
      questionId: q.id,
      question: clone(q),
      fingerprint: fingerprint(q),
      text: "",
      choiceId: "",
      revision: 1,
      updatedAt: now,
      skipped: false,
    };
    state.events.push({
      id: crypto.randomUUID(),
      questionId: q.id,
      kind: "opened",
      at: now,
    });
    return state;
  }
  function save(state, draft) {
    state = validate(state);
    const current = state.drafts[draft.questionId];
    if (
      !current ||
      current.id !== draft.id ||
      current.skipped ||
      state.attempts[draft.id]
    )
      fail("Ответ уже отправлен или заменён в другой вкладке");
    if (current.revision !== draft.revision)
      fail(
        "Черновик изменён в другой вкладке. Скопируйте текст перед перезагрузкой.",
      );
    state.drafts[draft.questionId] = {
      ...current,
      text: draft.text,
      choiceId: draft.choiceId,
      revision: current.revision + 1,
      updatedAt: Date.now(),
    };
    return validate(state);
  }
  function applySchedule(state, a, now) {
    const q = a.question,
      old = state.schedule[q.id];
    const same = old?.fingerprint === a.fingerprint;
    const previous = same ? old : null;
    a.scheduleEligible =
      state.enabled &&
      (!previous ||
        (now >= previous.dueAt && now >= addDays(previous.lastGradedAt, 1))) &&
      !previous?.suspended;
    a.resultNote = !state.enabled
      ? "Автоматические интервалы отключены."
      : previous?.suspended
        ? "Автоповтор на паузе после двух ошибок."
        : !a.scheduleEligible
          ? "Тренировка до срока повтора: интервал не увеличивается и освоение не подтверждается."
          : "Результат учтён алгоритмом интервалов v1.";
    if (!a.scheduleEligible) return;
    const success = a.result.value === "correct" || a.result.value === "met";
    const streak = success ? Math.min(5, (previous?.streak || 0) + 1) : 0;
    const failures = success ? 0 : Math.min(2, (previous?.failures || 0) + 1);
    state.schedule[q.id] = {
      questionId: q.id,
      entryId: q.entryId,
      questionVersion: q.version,
      fingerprint: a.fingerprint,
      algorithm: 1,
      dueAt: addDays(now, success ? intervals[streak - 1] : 1),
      lastGradedAt: now,
      streak,
      failures,
      suspended: failures >= 2,
      updatedAt: now,
    };
  }
  function submit(state, draft, now = Date.now()) {
    state = validate(state);
    if (state.attempts[draft.id]) return state;
    const current = state.drafts[draft.questionId];
    if (!current || current.id !== draft.id || current.skipped)
      fail("Черновик заменён в другой вкладке");
    if (current.revision !== draft.revision)
      fail(
        "Черновик изменён в другой вкладке. Скопируйте текст перед перезагрузкой.",
      );
    checkLimit(state, current.question, now);
    if (
      current.question.type === "choice" &&
      !current.question.options.some((o) => o.id === draft.choiceId)
    )
      fail("Выберите ответ");
    if (current.question.type === "open" && !draft.text.trim())
      fail("Сначала запишите собственный ответ");
    const a = {
      id: current.id,
      question: current.question,
      fingerprint: current.fingerprint,
      text: draft.text,
      choiceId: current.question.type === "choice" ? draft.choiceId : "",
      at: now,
      gradedAt: now,
      ratings: {},
      result:
        current.question.type === "choice"
          ? score(current.question, draft.choiceId, {})
          : null,
      scheduleEligible: false,
      resultNote: "Ожидает самооценки по рубрике.",
    };
    state.drafts[current.questionId] = {
      ...current,
      text: a.text,
      choiceId: a.choiceId,
      revision: current.revision + 1,
      updatedAt: now,
    };
    state.attempts[a.id] = a;
    if (a.result) applySchedule(state, a, now);
    return validate(state);
  }
  function assess(state, attemptId, ratings, now = Date.now()) {
    state = validate(state);
    const a = state.attempts[attemptId];
    if (!a || a.question.type !== "open" || a.archived)
      fail("Нет открытого ответа для самооценки");
    if (a.result) return state;
    a.ratings = ratings;
    a.result = score(a.question, "", ratings);
    a.gradedAt = now;
    applySchedule(state, a, now);
    return validate(state);
  }
  function skip(state, q, now = Date.now()) {
    state = validate(state);
    const d = state.drafts[q.id];
    if (!d || d.skipped || state.attempts[d.id]) return state;
    checkLimit(state, q, now);
    d.skipped = true;
    d.updatedAt = now;
    state.events.push({
      id: crypto.randomUUID(),
      questionId: q.id,
      kind: "skipped",
      at: now,
    });
    if (state.enabled) {
      const old = state.schedule[q.id],
        same = old?.fingerprint === fingerprint(q);
      state.schedule[q.id] = {
        questionId: q.id,
        entryId: q.entryId,
        questionVersion: q.version,
        fingerprint: fingerprint(q),
        algorithm: 1,
        dueAt: addDays(now, 1),
        lastGradedAt: same ? old.lastGradedAt : 0,
        streak: same ? old.streak : 0,
        failures: same ? old.failures : 0,
        suspended: same ? old.suspended : false,
        updatedAt: now,
      };
    }
    return validate(state);
  }
  function due(state, questions, now = Date.now()) {
    if (!state.enabled || load(state, now).total >= 10) return [];
    return questions
      .filter((q) => {
        const s = state.schedule[q.id];
        return (
          s &&
          s.fingerprint === fingerprint(q) &&
          !s.suspended &&
          s.dueAt <= now
        );
      })
      .sort(
        (a, b) =>
          state.schedule[a.id].dueAt - state.schedule[b.id].dueAt ||
          a.id.localeCompare(b.id),
      );
  }
  function priorityForToday(state, questions, now = Date.now()) {
    return due(state, questions, now).map((q) => ({
      questionId: q.id,
      entryId: q.entryId,
      url: "/review/check/?question=" + q.id,
      reason:
        "Наступил добровольный повтор с проверкой понимания. Ответ оценивается отдельно от освоения урока.",
    }));
  }
  function merge(left, right) {
    left = validate(left);
    right = validate(right);
    const out = clone(left);
    if (right.settingsUpdatedAt > left.settingsUpdatedAt) {
      out.enabled = right.enabled;
      out.settingsUpdatedAt = right.settingsUpdatedAt;
    }
    for (const [k, v] of Object.entries(right.schedule))
      if (!out.schedule[k] || v.updatedAt > out.schedule[k].updatedAt)
        out.schedule[k] = v;
    for (const [k, v] of Object.entries(right.drafts)) {
      const old = out.drafts[k];
      if (!old) out.drafts[k] = v;
      else if (JSON.stringify(old) !== JSON.stringify(v)) {
        const keep = v.updatedAt > old.updatedAt ? v : old,
          other = keep === v ? old : v;
        out.drafts[k] = keep;
        if (!out.attempts[other.id] && !right.attempts[other.id]) {
          const archived = archive(other),
            key =
              other.id === keep.id
                ? other.id.slice(0, 75) + "-copy-" + fingerprint(other)
                : other.id;
          out.attempts[key] = { ...archived, id: key };
        }
      }
    }
    for (const [k, v] of Object.entries(right.attempts)) {
      if (!out.attempts[k]) out.attempts[k] = v;
      else if (JSON.stringify(out.attempts[k]) !== JSON.stringify(v)) {
        const copyId = k.slice(0, 75) + "-copy-" + fingerprint(v);
        out.attempts[copyId] = { ...v, id: copyId };
      }
    }
    const events = new Map(out.events.map((e) => [e.id, e]));
    for (const e of right.events) events.set(e.id, e);
    out.events = [...events.values()];
    return validate(out);
  }
  window.SalesOSKnowledge = {
    empty,
    validate,
    validateQuestion,
    fingerprint,
    score,
    day,
    addDays,
    load,
    start,
    save,
    submit,
    assess,
    skip,
    due,
    priorityForToday,
    merge,
  };
})();
