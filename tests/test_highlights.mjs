import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("src/scripts/highlights-core.js", "utf8");
const window = {};
vm.runInNewContext(source, { window, crypto: webcrypto });
const core = window.SalesOSHighlights;
const docId = "01-001";
const replacementId = "b-abcdef01-1";
const block = (id, text) => ({ id, text });
const capture = (blockIds, quote, extra = {}) => ({
  documentId: docId,
  blockIds,
  quote,
  anchorQuote: quote,
  contextBefore: "Важный контекст перед цитатой",
  contextAfter: "Контекст после цитаты",
  textVersion: "1234abcd",
  ...extra,
});
const oneId = core.stableBlockId(docId, ["Первый раздел"], "Текст абзаца");
assert.equal(
  oneId,
  core.stableBlockId(docId, ["Первый раздел"], "Текст абзаца"),
  "IDs are deterministic across renderers",
);
assert.notEqual(
  oneId,
  core.stableBlockId(docId, ["Второй раздел"], "Текст абзаца"),
  "heading context separates repeated blocks",
);

let state = core.empty();
state = core.create(
  state,
  capture([oneId], "Клиенту нужен срок поставки", {
    contextBefore: "Проверяем: ",
    contextAfter: ". Не обещайте неподтверждённое.",
  }),
  "Проверить доступность до отправки.",
  100,
  "highlight-1",
);
let item = state.items["highlight-1"];
assert.equal(item.quote, "Клиенту нужен срок поставки");
assert.equal(item.comment, "Проверить доступность до отправки.");
assert.equal(core.validate(state).items[item.id].revision, 1);

let result = core.locate(item, [
  block("intro", "Начальный раздел."),
  block(
    oneId,
    "Проверяем: Клиенту нужен срок поставки. Не обещайте неподтверждённое.",
  ),
]);
assert.equal(result.status, "anchored");
assert.deepEqual([...result.blockIds], [oneId]);

result = core.locate(item, [
  block(
    replacementId,
    "Проверяем: Клиенту нужен срок поставки. Не обещайте неподтверждённое.",
  ),
]);
assert.equal(
  result.status,
  "moved",
  "a unique exact quote is offered for confirmation",
);
assert.equal(result.blockIds[0], replacementId);

result = core.locate(item, [
  block(
    "first",
    "Проверяем: Клиенту нужен срок поставки. Не обещайте неподтверждённое.",
  ),
  block(
    "second",
    "Проверяем: Клиенту нужен срок поставки. Не обещайте неподтверждённое.",
  ),
]);
assert.equal(
  result.status,
  "ambiguous",
  "repeated text is never silently reattached",
);

result = core.locate(item, [block("new", "Текст полностью изменён и удалён.")]);
assert.equal(result.status, "missing");

state = core.editComment(
  state,
  item.id,
  item.revision,
  "Обновлённая мысль",
  200,
);
item = state.items[item.id];
assert.equal(item.comment, "Обновлённая мысль");
assert.throws(
  () => core.editComment(state, item.id, 1, "Устаревшая вкладка", 201),
  /другой вкладке/,
);

state = core.reanchor(
  state,
  item.id,
  item.revision,
  {
    ...capture([replacementId], "Новая редакция цитаты"),
    anchorQuote: "Новая редакция цитаты",
    contextBefore: "",
    contextAfter: "",
    textVersion: "87654321",
  },
  300,
);
item = state.items[item.id];
assert.equal(
  item.quote,
  "Клиенту нужен срок поставки",
  "original citation is retained",
);
assert.equal(item.anchorQuote, "Новая редакция цитаты");
assert.equal(item.comment, "Обновлённая мысль");

state = core.schedule(state, item.id, 3, 400);
item = state.items[item.id];
assert.equal(item.reviewAt, 400 + 3 * 86400000);
state = core.saveRecall(state, item.id, "Сначала вспомнил вывод", 500);
state = core.completeReview(state, item.id, 600);
item = state.items[item.id];
assert.equal(item.reviewAt, 0);
assert.equal(item.recallDraft, "");

state = core.softDelete(state, item.id, item.revision, 700);
item = state.items[item.id];
assert.equal(item.deletedAt, 700);
state = core.restore(state, item.id, item.revision, 800);
item = state.items[item.id];
assert.equal(item.deletedAt, 0);
assert.equal(item.quote, "Клиенту нужен срок поставки");

const divergent = core.editComment(
  state,
  item.id,
  item.revision,
  "Другая вкладка",
  900,
);
const merged = core.merge(state, divergent);
assert.equal(
  Object.keys(merged.items).length,
  2,
  "conflicting comments survive as a separate copy",
);
assert.ok(
  Object.values(merged.items).some(
    (value) => value.comment === "Обновлённая мысль",
  ),
);
assert.ok(
  Object.values(merged.items).some(
    (value) => value.comment === "Другая вкладка",
  ),
);

assert.throws(() => core.validate({ items: { bad: { id: "bad" } } }));
assert.throws(() => core.create(state, capture([], "Без блока"), ""));
assert.throws(() => core.schedule(state, item.id, 2, 1000), /срок повтора/);
console.log(
  "Highlights core: stable anchors, exact recovery, ambiguity, edits, trash, review, and merge checks passed.",
);
