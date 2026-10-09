/* Deterministic local study plans. Completion is independent of course mastery. */
(() => {
  const record = (v) => v && typeof v === "object" && !Array.isArray(v);
  const id = (v) =>
    typeof v === "string" &&
    /^[a-zA-Z0-9_-]{1,100}$/.test(v) &&
    !["__proto__", "constructor", "prototype"].includes(v);
  const text = (v, max = 1000) => typeof v === "string" && v.length <= max;
  const stamp = (v) => Number.isSafeInteger(v) && v >= 0;
  const goals = {
    any: [],
    foundation: ["01", "02", "03", "04"],
    conversation: ["07", "08", "09", "10", "11"],
    pricing: ["04", "11", "12"],
  };
  const empty = () => ({
    preferences: { budget: 20, goal: "any", updatedAt: 0 },
    plans: {},
  });
  const day = (now = new Date()) =>
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  function validate(raw) {
    if (raw === undefined) return empty();
    const bad = () => {
      throw Error("Некорректное занятие или настройки: копия не изменена");
    };
    if (!record(raw) || !record(raw.preferences) || !record(raw.plans)) bad();
    const p = raw.preferences;
    if (
      ![10, 20, 40].includes(p.budget) ||
      !Object.hasOwn(goals, p.goal) ||
      !stamp(p.updatedAt) ||
      Object.keys(raw.plans).length > 365
    )
      bad();
    for (const [key, plan] of Object.entries(raw.plans)) {
      if (
        !id(key) ||
        !record(plan) ||
        plan.id !== key ||
        plan.version !== 1 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(plan.day) ||
        !text(plan.zone, 100) ||
        !stamp(plan.createdAt) ||
        !stamp(plan.updatedAt) ||
        plan.updatedAt < plan.createdAt ||
        ![10, 20, 40].includes(plan.budget) ||
        !Object.hasOwn(goals, plan.goal) ||
        !["active", "paused", "finished"].includes(plan.status) ||
        !["", "easy", "fit", "hard"].includes(plan.feasibility) ||
        !Array.isArray(plan.items) ||
        plan.items.length < 1 ||
        plan.items.length > 3
      )
        bad();
      const seen = new Set(),
        slots = new Set();
      for (const item of plan.items) {
        if (
          !record(item) ||
          !id(item.id) ||
          slots.has(item.id) ||
          !id(item.entryId) ||
          seen.has(item.entryId) ||
          !["review", "theory", "practice"].includes(item.kind) ||
          !text(item.title) ||
          !item.title.trim() ||
          !text(item.reason) ||
          !text(item.step) ||
          !(
            (/^\/(lesson|practice)\/[a-zA-Z0-9_-]+\/$/.test(item.url) &&
              item.url.endsWith(`/${item.entryId}/`) &&
              item.questionId === undefined) ||
            (item.kind === "review" &&
              id(item.questionId) &&
              item.url === `/review/check/?question=${item.questionId}`)
          ) ||
          !Array.isArray(item.minutes) ||
          item.minutes.length !== 2 ||
          !Number.isSafeInteger(item.minutes[0]) ||
          item.minutes[0] < 1 ||
          !Number.isSafeInteger(item.minutes[1]) ||
          item.minutes[1] < item.minutes[0] ||
          !["pending", "done", "skipped"].includes(item.status) ||
          !stamp(item.updatedAt) ||
          !Array.isArray(item.excluded) ||
          item.excluded.length > 430 ||
          !item.excluded.every(id)
        )
          bad();
        seen.add(item.entryId);
        slots.add(item.id);
      }
      if (
        plan.items.reduce((n, i) => n + i.minutes[1], 0) > plan.budget ||
        (plan.status === "finished" &&
          plan.items.some((i) => i.status === "pending"))
      )
        bad();
    }
    if (JSON.stringify(raw).length > 2000000) bad();
    return JSON.parse(JSON.stringify(raw));
  }
  const completed = (e, state) =>
    e.kind === "theory"
      ? ["theory_completed", "mastered"].includes(state.lessonStatuses?.[e.id])
      : ["self_reviewed", "completed", "mastered"].includes(
          state.practiceStatuses?.[e.id],
        );
  function candidates(kind, entries, state, goal, now) {
    const list = Object.values(entries).filter((e) =>
      ["theory", "practice"].includes(e.kind),
    );
    const rank = (e) =>
      (goals[goal].length && !goals[goal].includes(e.module) ? 100000 : 0) +
      (e.level === "advanced" ? 10000 : 0) +
      Number(e.module) * 100 +
      e.order;
    list.sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
    const lastUse = new Map();
    for (const p of Object.values(state.today?.plans || {}))
      for (const item of p.items) {
        lastUse.set(
          item.entryId,
          Math.max(lastUse.get(item.entryId) || 0, p.createdAt),
        );
      }
    const leastRecent = (a, b) =>
      (lastUse.get(a.id) || 0) - (lastUse.get(b.id) || 0) ||
      rank(a) - rank(b) ||
      a.id.localeCompare(b.id);
    if (kind === "review") {
      const due = Object.values(state.revisitQueue || {})
        .filter((q) => entries[q.entryId] && q.dueAt <= now)
        .sort(
          (a, b) => a.dueAt - b.dueAt || a.entryId.localeCompare(b.entryId),
        );
      const reviewable = list
        .filter((e) => completed(e, state))
        .sort(leastRecent);
      return [
        ...new Set([
          ...(state.reviewPriorities || []).map((q) => q.entryId),
          ...due.map((q) => q.entryId),
          ...reviewable.map((e) => e.id),
        ]),
      ]
        .map((key) => entries[key])
        .filter((e) => list.some((v) => v.id === e.id));
    }
    const relevant = list.filter((e) => e.kind === kind);
    return [
      ...relevant.filter((e) => !completed(e, state)),
      ...relevant.filter((e) => completed(e, state)).sort(leastRecent),
    ];
  }
  function itemFor(entry, kind, state, minutes, slot, now, excluded = []) {
    const isDone = completed(entry, state);
    const priority =
      kind === "review" &&
      state.reviewPriorities?.find((q) => q.entryId === entry.id);
    const queueDue = state.revisitQueue?.[entry.id]?.dueAt <= now;
    return {
      id: slot,
      entryId: entry.id,
      title: entry.title,
      kind,
      ...(priority ? { questionId: priority.questionId } : {}),
      url: priority
        ? priority.url
        : `/${entry.kind === "theory" ? "lesson" : "practice"}/${entry.id}/`,
      reason: priority
        ? priority.reason
        : kind === "review"
          ? queueDue
            ? "Вы вручную назначили повтор; его срок наступил. Срок в очереди останется прежним."
            : "Материал отмечен пройденным — восстановим главную мысль."
          : isDone
            ? "Материал уже пройден: применим его к новой ситуации."
            : "Следующий доступный материал по выбранной цели и порядку программы.",
      step: priority
        ? "Ответьте на вопрос самостоятельно, затем сверьтесь с разбором. Открытый ответ оцените по рубрике отдельно."
        : kind === "review"
          ? "Перед открытием вспомните главную мысль и один пример. Затем сверьтесь с материалом. Повтор в очереди завершайте отдельно."
          : entry.kind === "practice"
            ? "Откройте условия. Выберите один критерий, запишите исходную ситуацию и черновой ответ на него. Полное задание можно продолжить позже."
            : isDone
              ? "Придумайте новый пример из своей работы: где применим принцип и где его ограничения? Сверьтесь с материалом."
              : "Прочитайте один смысловой раздел. Сформулируйте главную мысль и пример своими словами; весь урок за это время заканчивать не требуется.",
      minutes,
      status: "pending",
      updatedAt: now,
      excluded,
    };
  }
  function create(
    entries,
    state,
    budget,
    goal,
    now = Date.now(),
    date = new Date(now),
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone,
  ) {
    if (![10, 20, 40].includes(budget) || !Object.hasOwn(goals, goal))
      throw Error("Выберите бюджет и цель");
    const ranges =
      budget === 10
        ? [
            [2, 3],
            [2, 3],
            [2, 4],
          ]
        : budget === 20
          ? [
              [3, 5],
              [4, 7],
              [5, 8],
            ]
          : [
              [4, 6],
              [8, 15],
              [10, 19],
            ];
    const items = [];
    for (const [i, kind] of ["review", "theory", "practice"].entries()) {
      const entry = candidates(kind, entries, state, goal, now).find(
        (e) => !items.some((v) => v.entryId === e.id),
      );
      if (entry)
        items.push(
          itemFor(entry, kind, state, ranges[i], `step-${i + 1}`, now),
        );
    }
    if (!items.length) throw Error("Нет доступных материалов для занятия");
    return {
      id: crypto.randomUUID(),
      version: 1,
      day: day(date),
      zone,
      budget,
      goal,
      createdAt: now,
      updatedAt: now,
      status: "active",
      feasibility: "",
      items,
    };
  }
  function replace(plan, slot, entries, state, now = Date.now()) {
    const item = plan.items.find((i) => i.id === slot);
    if (!item || item.status !== "pending" || plan.status !== "active")
      throw Error("Менять можно только невыполненный пункт активного занятия");
    const excluded = [...new Set([...item.excluded, item.entryId])];
    const next = candidates(item.kind, entries, state, plan.goal, now).find(
      (e) =>
        !excluded.includes(e.id) && !plan.items.some((i) => i.entryId === e.id),
    );
    if (!next)
      throw Error(
        "Других подходящих материалов нет. Тот же пункт не подставлен; можно пропустить его или продолжить.",
      );
    return {
      ...plan,
      updatedAt: now,
      items: plan.items.map((i) =>
        i.id === slot
          ? itemFor(next, item.kind, state, item.minutes, slot, now, excluded)
          : i,
      ),
    };
  }
  function merge(a, b) {
    a = validate(a);
    b = validate(b);
    const result = validate(a);
    if (b.preferences.updatedAt > a.preferences.updatedAt)
      result.preferences = b.preferences;
    for (const [key, plan] of Object.entries(b.plans)) {
      if (!result.plans[key]) result.plans[key] = plan;
      else if (JSON.stringify(result.plans[key]) !== JSON.stringify(plan)) {
        // Backup merge preserves conflicting snapshots; it never overwrites a plan.
        let hash = 2166136261;
        for (const c of JSON.stringify(plan))
          hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
        const copyId = `${key.slice(0, 80)}-copy-${hash.toString(16)}`;
        result.plans[copyId] = { ...plan, id: copyId };
      }
    }
    return validate(result);
  }
  window.SalesOSToday = {
    empty,
    day,
    validate,
    create,
    replace,
    merge,
    candidates,
  };
})();
