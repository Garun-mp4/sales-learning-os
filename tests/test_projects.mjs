import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
const sandbox = { window: {}, crypto: webcrypto };
vm.runInNewContext(
  await readFile("src/scripts/projects-core.js", "utf8"),
  sandbox,
);
const c = sandbox.window.SalesOSProjects;
const copy = (v) => JSON.parse(JSON.stringify(v));
const rubric = JSON.parse(
  await readFile("src/generated/projects-data.json", "utf8"),
).rubric;
const draft = (text) => ({
  answers: { "criterion-1": text },
  selfReview: { "criterion-1": 2 },
  nextStep: "Дальше",
  updatedAt: 100,
  writerId: "test",
  versions: [],
});
let r = c.create(c.empty(), "Проект А", 1),
  a = r.activeId;
r = c.create(r, "Проект Б", 2);
const b = r.activeId;
assert.match(a, /^[0-9a-f-]{36}$/);
assert.equal(Object.keys(r.items[a].stages).length, 10);
r = c.writeDraft(r, a, draft("Только А"));
assert.equal(r.items[b].draft.answers["criterion-1"], undefined);
assert.equal(r.items[a].stages["criterion-1"].revision, 2);
r = c.context(r, a, 1, "Проект А", { service: "Услуга" });
assert.throws(() =>
  c.context(r, a, 1, "Потеря", { service: "другая вкладка" }),
);
assert.equal(r.items[a].context.service, "Услуга");
const attempt = {
  id: "attempt-1",
  createdAt: 100,
  rubric: [rubric[0]],
  answers: { "criterion-1": "Снимок" },
  selfReview: { "criterion-1": 2 },
  nextStep: "Дальше",
};
r = c.attach(
  r,
  a,
  "criterion-1",
  { id: "01-P01", title: "Практика", kind: "practice" },
  attempt,
  101,
);
attempt.answers["criterion-1"] = "Изменённый оригинал";
assert.equal(
  r.items[a].stages["criterion-1"].attachments[0].attempt.answers[
    "criterion-1"
  ],
  "Снимок",
);
const snap = r.items[a].stages["criterion-1"].attachments[0];
r = c.attach(
  r,
  a,
  "criterion-1",
  { id: "01-P01", title: "Практика", kind: "practice" },
  snap.attempt,
  103,
);
assert.equal(r.items[a].stages["criterion-1"].attachments.length, 1);
assert.throws(() => c.remove(r, a, "Проект А"));
const before = copy(r);
r = c.archive(r, a, true, 104);
assert.throws(() => c.writeDraft(r, a, draft("Потеря")));
r = c.archive(r, a, false, 105);
assert.equal(r.items[a].draft.answers["criterion-1"], "Только А");
r = c.archive(r, a, true, 106);
assert.throws(() => c.remove(r, a, "ошибка"));
r = c.remove(r, a, "Проект А", 107);
assert.equal(c.merge(r, before).items[a], undefined);
const legacy = {
  practiceDrafts: {
    FINAL_PROJECT: {
      ...draft("Старый ответ"),
      versions: [{ ...draft("Вариант"), versions: undefined }],
    },
  },
  practiceAttempts: {
    FINAL_PROJECT: [{ ...attempt, answers: { "criterion-1": "История" } }],
  },
};
const migrated = c.migrate(r, legacy, "Общая заметка");
const old = Object.values(migrated.items).find(
  (p) => p.name === "Мой первый проект",
);
assert.equal(migrated.activeId, b);
assert.equal(old.context.legacyNote, "Общая заметка");
assert.equal(old.draft.versions.length, 1);
assert.equal(old.attempts[0].answers["criterion-1"], "История");
assert.equal(
  JSON.stringify(c.migrate(migrated, legacy, "Общая заметка")),
  JSON.stringify(migrated),
);
const changed = copy(legacy);
changed.practiceDrafts.FINAL_PROJECT.answers["criterion-1"] =
  "Новый старый ответ";
const updated = c.migrate(migrated, changed, "Общая заметка");
assert.equal(
  updated.items[old.id].draft.answers["criterion-1"],
  "Старый ответ",
);
assert.equal(updated.items[old.id].draft.versions.length, 2);
const conflicts = c.merge(
  before,
  c.context(before, a, before.items[a].contextRevision, "Другой", {
    goal: "Цель",
  }),
);
assert.equal(Object.keys(conflicts.items).length, 3);
assert.equal(Object.keys(c.merge(conflicts, before).items).length, 3);
const p = copy(before.items[a]);
p.context.questions = '<script>alert("x")</script>';
p.draft.answers["criterion-11"] = "Прежнее поле";
const html = c.html(p, rubric),
  md = c.markdown(p, rubric);
assert.ok(!html.includes("<script>"));
assert.ok(html.includes("&lt;script&gt;"));
assert.ok(!md.includes("<script>"));
assert.ok(!html.includes("Проект Б"));
assert.ok(html.includes("@media print"));
assert.ok(html.includes("overflow-wrap:anywhere"));
assert.ok(html.includes("Снимок"));
assert.ok(md.includes("attempt"));
assert.ok(html.includes("Прежнее поле"));
assert.ok(md.includes("Прежнее поле"));
assert.equal(c.summary(p, rubric).filled, 1);
assert.equal(c.summary(p, rubric).missing.length, 4);
const malformed = copy(before);
malformed.items[a].stages["criterion-1"].attachments[0].sourceId =
  "javascript:alert(1)";
assert.throws(() => c.validate(malformed));
const limit = copy(before);
limit.items[a].draft.versions = Array.from({ length: 101 }, () => ({
  ...draft("x"),
  versions: undefined,
}));
assert.throws(() => c.validate(limit));
assert.equal(
  legacy.practiceDrafts.FINAL_PROJECT.answers["criterion-1"],
  "Старый ответ",
);
console.log(
  "M5 projects: isolation, revisions, snapshots, migration, archive, merge, validation and escaped scoped exports passed",
);
