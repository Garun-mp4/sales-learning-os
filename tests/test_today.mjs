import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
const sandbox = { window: {}, crypto: webcrypto };
vm.runInNewContext(
  await readFile("src/scripts/today-core.js", "utf8"),
  sandbox,
);
const c = sandbox.window.SalesOSToday,
  entries = JSON.parse(
    await readFile("src/generated/client-index.json", "utf8"),
  ).entries;
const copy = (x) => JSON.parse(JSON.stringify(x));
const now = 1791532800000;
const empty = { lessonStatuses: {}, practiceStatuses: {}, revisitQueue: {} };
let checked = 0;
for (const budget of [10, 20, 40])
  for (const goal of ["any", "foundation", "conversation", "pricing"]) {
    for (const mode of ["new", "partial", "finished"]) {
      const state = copy(empty);
      if (mode !== "new")
        for (const e of Object.values(entries)) {
          if (mode === "finished" || e.module === "01")
            (e.kind === "theory"
              ? state.lessonStatuses
              : state.practiceStatuses)[e.id] =
              e.kind === "theory" ? "theory_completed" : "self_reviewed";
        }
      const p = c.create(
        entries,
        state,
        budget,
        goal,
        now,
        new Date(2026, 9, 9),
        "Europe/Astrakhan",
      );
      assert.equal(p.day, "2026-10-09");
      assert.ok(p.items.reduce((s, i) => s + i.minutes[1], 0) <= budget);
      assert.equal(new Set(p.items.map((i) => i.entryId)).size, p.items.length);
      assert.ok(p.items.every((i) => i.status === "pending"));
      c.validate({ ...c.empty(), plans: { [p.id]: p } });
      const frozen = JSON.stringify(p),
        replaced = c.replace(p, p.items[0].id, entries, state, now + 1);
      assert.notEqual(replaced.items[0].entryId, p.items[0].entryId);
      assert.equal(JSON.stringify(p), frozen);
      if (mode === "finished")
        assert.ok(
          p.items
            .find((i) => i.kind === "theory")
            .reason.includes("уже пройден"),
        );
      checked++;
    }
  }
const state = copy(empty);
state.revisitQueue["01-002"] = { entryId: "01-002", dueAt: now - 1 };
state.revisitQueue["01-003"] = { entryId: "01-003", dueAt: now + 1 };
const p = c.create(
  entries,
  state,
  20,
  "pricing",
  now,
  new Date(2026, 9, 9),
  "Europe/Astrakhan",
);
assert.equal(p.items[0].entryId, "01-002");
assert.equal(state.revisitQueue["01-002"].dueAt, now - 1);
const a = { ...c.empty(), plans: { [p.id]: p } },
  b = copy(a);
b.plans[p.id].items[0].status = "done";
const merged = c.merge(a, b);
assert.equal(Object.keys(merged.plans).length, 2);
assert.equal(Object.keys(c.merge(merged, b).plans).length, 2);
for (const change of [
  (x) => (x.plans[p.id].items[0].url = "javascript:alert(1)"),
  (x) => (x.plans[p.id].budget = 1),
  (x) => (x.plans[p.id].items[0].minutes = [5, 100]),
  (x) => (x.plans[p.id].status = "finished"),
  (x) => (x.plans[p.id].version = 2),
  (x) => (x.preferences.goal = "constructor"),
  (x) => x.plans[p.id].items.push(copy(x.plans[p.id].items[0])),
]) {
  const bad = copy(a);
  change(bad);
  assert.throws(() => c.validate(bad));
}
const exhausted = copy(p);
exhausted.items[0].excluded = Object.keys(entries);
assert.throws(() =>
  c.replace(exhausted, exhausted.items[0].id, entries, state),
);
assert.equal(c.day(new Date(2026, 9, 9, 23, 59)), "2026-10-09");
assert.equal(c.day(new Date(2026, 9, 10, 0, 0)), "2026-10-10");
const finished = copy(empty);
for (const e of Object.values(entries)) {
  if (e.kind === "theory") finished.lessonStatuses[e.id] = "mastered";
  if (e.kind === "practice") finished.practiceStatuses[e.id] = "self_reviewed";
}
const firstPlan = c.create(entries, finished, 20, "any", now);
finished.today = { ...c.empty(), plans: { [firstPlan.id]: firstPlan } };
const nextPlan = c.create(entries, finished, 20, "any", now + 1);
assert.ok(
  nextPlan.items.every(
    (i) => !firstPlan.items.some((j) => j.entryId === i.entryId),
  ),
);
console.log(
  "PASS M3: " +
    checked +
    " new/partial/finished budget+goal plans; due priority, replacements, immutable snapshots, merge, malformed data and midnight",
);
