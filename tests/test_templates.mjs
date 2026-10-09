import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import vm from "node:vm";

const sandbox = { window: {}, crypto: webcrypto };
vm.runInNewContext(
  await readFile("src/scripts/templates-core.js", "utf8"),
  sandbox,
);
const templates = sandbox.window.SalesOSTemplates;
const fields = {
  title: "Первый контакт",
  category: "first_message",
  body: "Здравствуйте, {{client}}. Предлагаю {{service}}.",
  tags: templates.parseTags("первый контакт, персонализация, ПЕРВЫЙ КОНТАКТ"),
  whenToUse: "Только для уместного персонального обращения.",
  resultNote: "",
  favorite: false,
  archived: false,
  source: null,
};

assert.equal(
  JSON.stringify(fields.tags),
  JSON.stringify(["первый контакт", "персонализация"]),
);

let state = templates.create(templates.empty(), fields, 100);
const id = Object.keys(state.items)[0];
state = templates.saveVersion(state, id, 1, "Исходный вариант", fields, 101);
const versionId = state.items[id].versions[0].id;
state = templates.update(
  state,
  id,
  2,
  { ...fields, body: "Изменённый вариант" },
  102,
);
state = templates.restoreVersion(state, id, 3, versionId, 103);
assert.equal(state.items[id].body, fields.body);
assert.equal(state.items[id].revision, 4);
assert.equal(state.items[id].versions.length, 2);
assert.equal(state.items[id].versions[1].body, "Изменённый вариант");
assert.match(state.items[id].versions[1].name, /^Перед восстановлением/);

const preview = templates.preview("{{client}} — {{service}} — {{unknown}}", {
  client: "<script>alert(1)</script>",
  service: "Аудит",
});
assert.equal(preview.resolved, false);
assert.equal(preview.text, "<script>alert(1)</script> — Аудит — {{unknown}}");
assert.equal(JSON.stringify(preview.unknown), JSON.stringify(["{{unknown}}"]));
assert.equal(
  templates.preview("{{client}} и {{client}}", { client: "Анна" }).text,
  "Анна и Анна",
);

const originalSource = {
  id: "library/templates#first-message",
  title: "Публичный пример",
  version: "2026-10-09",
  body: "Снимок исходного текста",
};
const privateCopy = templates.duplicate(
  templates.empty(),
  originalSource,
  { ...fields, title: "Мой пример" },
  104,
);
originalSource.body = "Исходник был изменён позже";
const copiedItem = Object.values(privateCopy.items)[0];
assert.equal(copiedItem.source.body, "Снимок исходного текста");
assert.equal(copiedItem.source.title, "Публичный пример");

state = templates.archive(state, id, 4, true, fields, 105);
assert.equal(state.items[id].archived, true);
state = templates.archive(state, id, 5, false, fields, 106);
assert.equal(state.items[id].archived, false);
assert.equal(state.items[id].versions.length, 2);
assert.throws(() =>
  templates.update(
    state,
    id,
    4,
    { ...fields, title: "Устаревшая запись" },
    107,
  ),
);
const localBranch = templates.update(
  state,
  id,
  6,
  { ...fields, body: "Локальный вариант" },
  107,
);
const importedBranch = templates.update(
  state,
  id,
  6,
  { ...fields, body: "Импортированный вариант" },
  108,
);
const merged = templates.merge(localBranch, importedBranch);
assert.equal(merged.items[id].body, "Импортированный вариант");
assert.ok(
  merged.items[id].versions.some(
    (version) => version.body === "Локальный вариант",
  ),
);
assert.throws(() =>
  templates.create(
    templates.empty(),
    {
      ...fields,
      tags: Array.from({ length: 21 }, (_, index) => `тег ${index}`),
    },
    108,
  ),
);

console.log(
  "Personal template core: tags, snapshots, restore, preview, archive, merge, and revision checks passed.",
);
