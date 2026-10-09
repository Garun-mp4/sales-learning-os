/* Shared deterministic graph/session contract. No text grading or network calls. */
(() => {
  const record = (v) =>
    v !== null && typeof v === "object" && !Array.isArray(v);
  const identifier = (v) =>
    typeof v === "string" &&
    /^[a-zA-Z0-9_-]{1,100}$/.test(v) &&
    !["__proto__", "prototype", "constructor"].includes(v);
  const text = (v, max = 6000) => typeof v === "string" && v.length <= max;
  const fail = (message) => {
    throw new Error(message);
  };
  function validateScenario(s) {
    if (
      !record(s) ||
      !identifier(s.id) ||
      !Number.isSafeInteger(s.version) ||
      s.version < 1 ||
      !["editorial_draft", "verified"].includes(s.status) ||
      !record(s.review) ||
      !text(s.review.scope) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(s.review.checkedOn) ||
      (s.status === "verified" && (!s.review.reviewer || !s.review.role)) ||
      !["title", "context", "goal", "constraints"].every(
        (k) => text(s[k]) && s[k].trim(),
      ) ||
      !Array.isArray(s.related) ||
      s.related.length > 10 ||
      !s.related.every(identifier) ||
      !record(s.nodes) ||
      Object.keys(s.nodes).length > 40 ||
      !identifier(s.start)
    )
      fail("Некорректный сценарий тренажёра");
    const visited = new Set();
    const active = new Set();
    let decisions = 0;
    function walk(id) {
      if (active.has(id)) fail("Цикл в сценарии");
      if (visited.has(id)) return;
      const n = s.nodes[id];
      if (
        !identifier(id) ||
        !record(n) ||
        !text(n.message) ||
        !n.message.trim()
      )
        fail("Отсутствует узел сценария");
      visited.add(id);
      active.add(id);
      if (n.kind === "end") {
        if (!text(n.outcome) || !n.outcome.trim()) fail("Нет итога");
      } else {
        if (
          n.kind !== "decision" ||
          !Array.isArray(n.choices) ||
          n.choices.length < 2 ||
          n.choices.length > 6
        )
          fail("Нет действий в узле");
        decisions++;
        const ids = new Set();
        for (const c of n.choices) {
          if (
            !record(c) ||
            !identifier(c.id) ||
            ids.has(c.id) ||
            !text(c.label, 500) ||
            !c.label.trim() ||
            !text(c.feedback) ||
            !c.feedback.trim() ||
            !text(c.strength) ||
            !text(c.omission) ||
            !identifier(c.next)
          )
            fail("Некорректное действие");
          ids.add(c.id);
          walk(c.next);
        }
      }
      active.delete(id);
    }
    walk(s.start);
    if (visited.size !== Object.keys(s.nodes).length || decisions < 3)
      fail("Недостижимые узлы или мало точек выбора");
    return s;
  }
  function position(session) {
    let id = session.scenario.start;
    for (const step of session.steps) {
      if (step.nodeId !== id) fail("Нарушен порядок диалога");
      const choice = session.scenario.nodes[id].choices?.find(
        (c) => c.id === step.choiceId,
      );
      if (!choice) fail("Неизвестное действие");
      id = choice.next;
    }
    return id;
  }
  function validateSessions(raw) {
    if (raw === undefined) return {};
    if (!record(raw) || Object.keys(raw).length > 100)
      fail("Не более 100 сессий тренажёра в копии");
    let bytes = 0;
    for (const [id, s] of Object.entries(raw)) {
      if (
        !identifier(id) ||
        !record(s) ||
        s.id !== id ||
        !identifier(s.scenarioId) ||
        !Number.isSafeInteger(s.revision) ||
        s.revision < 1 ||
        !Number.isFinite(s.createdAt) ||
        s.createdAt <= 0 ||
        !Number.isFinite(s.updatedAt) ||
        s.updatedAt < s.createdAt ||
        (s.deletedAt !== null &&
          (!Number.isFinite(s.deletedAt) || s.deletedAt <= 0)) ||
        !Array.isArray(s.steps) ||
        s.steps.length > 40 ||
        !record(s.draft) ||
        !text(s.draft.text) ||
        !text(s.draft.choiceId, 100) ||
        (s.conflictOf !== undefined && !identifier(s.conflictOf))
      )
        fail("Некорректная сессия тренажёра");
      validateScenario(s.scenario);
      if (
        s.scenarioId !== s.scenario.id ||
        s.scenarioVersion !== s.scenario.version
      )
        fail("Версия сессии не совпадает со снимком");
      for (const step of s.steps)
        if (
          !record(step) ||
          !identifier(step.nodeId) ||
          !identifier(step.choiceId) ||
          !text(step.text) ||
          !Number.isFinite(step.at) ||
          step.at < s.createdAt
        )
          fail("Некорректная реплика");
      const current = s.scenario.nodes[position(s)];
      if (
        s.draft.choiceId &&
        !current.choices?.some((c) => c.id === s.draft.choiceId)
      )
        fail("Некорректное действие черновика");
      bytes += JSON.stringify(s).length;
      if (bytes > 3000000)
        fail("Сессии тренажёра превышают лимит 3 млн символов");
    }
    return JSON.parse(JSON.stringify(raw));
  }
  function create(scenario) {
    validateScenario(scenario);
    const now = Date.now();
    return {
      id: crypto.randomUUID(),
      scenarioId: scenario.id,
      scenarioVersion: scenario.version,
      scenario: JSON.parse(JSON.stringify(scenario)),
      createdAt: now,
      updatedAt: now,
      revision: 1,
      steps: [],
      draft: { text: "", choiceId: "" },
      deletedAt: null,
    };
  }
  function advance(session) {
    const s = JSON.parse(JSON.stringify(session));
    const id = position(s);
    const node = s.scenario.nodes[id];
    if (
      node.kind === "end" ||
      !node.choices.some((c) => c.id === s.draft.choiceId)
    )
      fail("Выберите действие");
    s.steps.push({
      nodeId: id,
      choiceId: s.draft.choiceId,
      text: s.draft.text,
      at: Date.now(),
    });
    s.draft = { text: "", choiceId: "" };
    return s;
  }
  const api = { validateScenario, validateSessions, position, create, advance };
  if (typeof window !== "undefined") window.SalesOSTrainer = api;
  if (typeof module !== "undefined") module.exports = api;
})();
