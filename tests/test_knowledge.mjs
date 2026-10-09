import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
const sandbox = { window: {}, crypto: webcrypto };
vm.runInNewContext(
  await readFile("src/scripts/knowledge-core.js", "utf8"),
  sandbox,
);
vm.runInNewContext(
  await readFile("src/scripts/today-core.js", "utf8"),
  sandbox,
);
const c = sandbox.window.SalesOSKnowledge;
const bank = JSON.parse(
  (
    await readFile("sales-knowledge-base/review-questions.json", "utf8")
  ).replace(/^\uFEFF/, ""),
).questions;
const entries = JSON.parse(
  await readFile("src/generated/content-manifest.json", "utf8"),
).entries;
const copy = (v) => JSON.parse(JSON.stringify(v));
const now = new Date(2026, 9, 9, 12).getTime(),
  q = bank[0],
  open = bank.find((q) => q.type === "open");
assert.equal(bank.length, 30);
assert.equal(new Set(bank.map((q) => q.id)).size, 30);
for (const mod of ["01", "02", "08"])
  assert.equal(bank.filter((q) => q.module === mod).length, 10);
for (const q of bank) {
  c.validateQuestion(q);
  assert.equal(entries[q.entryId].module, q.module);
  assert.equal(entries[q.entryId].kind, "theory");
  if (q.type === "choice") {
    assert.equal(c.score(q, q.answerId, {}).value, "correct");
    for (const o of q.options.filter((o) => o.id !== q.answerId))
      assert.equal(c.score(q, o.id, {}).value, "incorrect");
  } else {
    assert.equal(
      c.score(q, "", Object.fromEntries(q.rubric.map((v) => [v.id, 2]))).value,
      "met",
    );
    assert.throws(() => c.score(q, "", {}));
  }
}
function answer(s, q, at, correct = true) {
  s = c.start(s, q, true, at);
  const d = s.drafts[q.id];
  return c.submit(
    s,
    {
      ...d,
      choiceId: correct
        ? q.answerId
        : q.options.find((o) => o.id !== q.answerId).id,
    },
    at,
  );
}
let s = c.empty();
assert.equal(s.enabled, false);
s = answer(s, q, now);
assert.equal(Object.keys(s.schedule).length, 0);
s = { ...c.empty(), enabled: true, settingsUpdatedAt: now };
s = answer(s, q, now);
assert.equal(s.schedule[q.id].dueAt, c.addDays(now, 1));
const once = copy(s);
s = c.submit(s, s.drafts[q.id], now);
assert.equal(Object.keys(s.attempts).length, 1);
s = answer(s, q, now + 1000);
assert.equal(s.schedule[q.id].streak, 1);
assert.equal(s.attempts[s.drafts[q.id].id].scheduleEligible, false);
s = answer(s, q, c.addDays(now, 1));
assert.equal(s.schedule[q.id].streak, 2);
assert.equal(s.schedule[q.id].dueAt, c.addDays(now, 4));
const early = answer(s, q, c.addDays(now, 2));
assert.equal(early.schedule[q.id].streak, 2);
assert.equal(early.schedule[q.id].dueAt, c.addDays(now, 4));
assert.equal(c.due(s, bank, c.addDays(now, 4))[0].id, q.id);
assert.equal(
  c.priorityForToday(s, bank, c.addDays(now, 4))[0].url,
  "/review/check/?question=" + q.id,
);
s = answer(s, q, c.addDays(now, 4), false);
assert.equal(s.schedule[q.id].failures, 1);
assert.equal(s.schedule[q.id].streak, 0);
s = answer(s, q, c.addDays(now, 5), false);
assert.equal(s.schedule[q.id].suspended, true);
assert.equal(c.due(s, bank, c.addDays(now, 6)).length, 0);
s = c.start({ ...c.empty(), enabled: true }, q, false, now);
s = c.skip(s, q, now);
assert.equal(s.schedule[q.id].dueAt, c.addDays(now, 1));
assert.equal(s.schedule[q.id].streak, 0);
assert.equal(c.skip(s, q, now).events.length, s.events.length);
s = c.start(c.empty(), open, false, now);
const draft = s.drafts[open.id];
s = c.save(s, {
  ...draft,
  text: "Сначала уточню цель, ограничения и критерий результата.",
});
assert.throws(() => c.save(s, { ...draft, text: "stale" }));
s = c.submit(s, s.drafts[open.id], now);
assert.equal(s.attempts[draft.id].result, null);
s = c.assess(
  s,
  draft.id,
  Object.fromEntries(open.rubric.map((v) => [v.id, 1])),
  now,
);
assert.equal(s.attempts[draft.id].result.kind, "self");
assert.equal(s.attempts[draft.id].result.value, "partial");
assert.equal(
  c.assess(s, draft.id, {}, now).attempts[draft.id].result.value,
  "partial",
);
let versioned = c.start(c.empty(), open, false, now);
versioned = c.save(versioned, {
  ...versioned.drafts[open.id],
  text: "Исходный ответ",
});
const original = copy(versioned.drafts[open.id]);
const changed = {
  ...open,
  version: 2,
  prompt: open.prompt + " Уточните ограничения.",
};
versioned = c.start(versioned, changed, false, now);
assert.equal(versioned.attempts[original.id].archived, true);
assert.equal(versioned.attempts[original.id].question.version, 1);
assert.equal(versioned.drafts[open.id].text, "");
assert.equal(c.load(versioned, now).total, 0);
assert.equal(c.due(once, [{ ...q, version: 2 }], c.addDays(now, 10)).length, 0);
let limits = c.empty();
for (const q of bank.slice(0, 3)) limits = c.start(limits, q, false, now);
assert.throws(() => c.start(limits, bank[3], false, now), /3 новых/);
limits = c.start(limits, bank[3], false, c.addDays(now, 1));
assert.equal(c.load(limits, c.addDays(now, 1)).newCount, 1);
limits = c.empty();
for (let i = 0; i < 10; i++) limits = answer(limits, q, now + i);
assert.equal(c.load(limits, now).total, 10);
assert.throws(() => c.start(limits, q, true, now + 100), /10 ответов/);
assert.equal(c.load(limits, c.addDays(now, 1)).total, 0);
const merged = c.merge(once, s);
assert.equal(Object.keys(merged.attempts).length, 2);
assert.equal(c.validate(JSON.parse(JSON.stringify(merged))).enabled, true);
assert.equal(Object.keys(c.merge(merged, merged).attempts).length, 2);
let left = c.start(c.empty(), open, false, now),
  right = copy(left);
left = c.save(left, { ...left.drafts[open.id], text: "Ответ слева" });
right = c.save(right, { ...right.drafts[open.id], text: "Ответ справа" });
const conflict = c.merge(left, right);
assert.equal(Object.keys(conflict.attempts).length, 1);
assert.equal(Object.values(conflict.attempts)[0].archived, true);
const bad = copy(once);
Object.values(bad.attempts)[0].result.value = "incorrect";
assert.throws(() => c.validate(bad));
const priority = c.priorityForToday(once, bank, c.addDays(now, 1));
const plan = sandbox.window.SalesOSToday.create(
  entries,
  {
    lessonStatuses: {},
    practiceStatuses: {},
    revisitQueue: {},
    reviewPriorities: priority,
  },
  20,
  "any",
  c.addDays(now, 1),
);
assert.equal(plan.items[0].url, priority[0].url);
assert.equal(plan.items[0].questionId, q.id);
sandbox.window.SalesOSToday.validate({
  preferences: { budget: 20, goal: "any", updatedAt: now },
  plans: { [plan.id]: plan },
});

let skipped = c.start(c.empty(), open, false, now);
skipped = c.save(skipped, {
  ...skipped.drafts[open.id],
  text: "Черновик перед пропуском",
});
const skippedId = skipped.drafts[open.id].id;
skipped = c.skip(skipped, open, now);
skipped = c.start(skipped, open, true, now);
assert.equal(skipped.attempts[skippedId]?.text, "Черновик перед пропуском");
assert.equal(skipped.attempts[skippedId]?.archived, true);

console.log(
  "PASS M4: 30 questions/3 modules, keys and rubrics, opt-in, intervals, failure pause, skip, daily caps, versions, CAS, idempotence, merge, backup validation and M3 priority",
);
