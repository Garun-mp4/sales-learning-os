import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
const sandbox = { window: {}, crypto: webcrypto };
vm.runInNewContext(
  await readFile("src/scripts/trainer-core.js", "utf8"),
  sandbox,
);
const core = sandbox.window.SalesOSTrainer;
const catalog = JSON.parse(
  await readFile("sales-knowledge-base/trainer-scenarios.json", "utf8"),
);
assert.equal(catalog.schemaVersion, 1);
assert.equal(catalog.scenarios.length, 6);
const copy = (x) => JSON.parse(JSON.stringify(x));
let paths = 0;
for (const s of catalog.scenarios) {
  core.validateScenario(s);
  function walk(session) {
    const node = s.nodes[core.position(session)];
    if (node.kind === "end") {
      paths++;
      core.validateSessions({ [session.id]: session });
      return;
    }
    for (const c of node.choices) {
      const next = core.advance({
        ...session,
        draft: { text: "<script>test</script>", choiceId: c.id },
      });
      assert.equal(next.steps.length, session.steps.length + 1);
      assert.equal(session.draft.text, "");
      assert.equal(next.draft.text, "");
      assert.equal(next.steps.at(-1).text, "<script>test</script>");
      walk(next);
    }
  }
  walk(core.create(s));
  const bad = copy(s);
  bad.nodes.agree.choices[0].next = "missing";
  assert.throws(() => core.validateScenario(bad));
  const cycle = copy(s);
  cycle.nodes.agree.choices[0].next = "start";
  assert.throws(() => core.validateScenario(cycle));
  const unreachable = copy(s);
  unreachable.nodes.stray = { kind: "end", message: "x", outcome: "x" };
  assert.throws(() => core.validateScenario(unreachable));
  const verified = copy(s);
  verified.status = "verified";
  assert.throws(() => core.validateScenario(verified));
}
const session = core.create(catalog.scenarios[0]);
assert.throws(() => core.advance(session));
assert.throws(() =>
  core.validateSessions({ [session.id]: { ...session, scenarioVersion: 2 } }),
);
assert.throws(() =>
  core.validateSessions({
    [session.id]: {
      ...session,
      steps: [
        { nodeId: "agree", choiceId: "confirm", text: "", at: Date.now() },
      ],
    },
  }),
);
assert.throws(() =>
  core.validateSessions({
    [session.id]: {
      ...session,
      draft: { text: "x".repeat(6001), choiceId: "" },
    },
  }),
);
console.log(
  `PASS: six graphs, ${paths} complete paths, invalid transitions/cycles/unreachable nodes, snapshot and session validation`,
);
