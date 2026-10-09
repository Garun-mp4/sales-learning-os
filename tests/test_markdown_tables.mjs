import assert from "node:assert/strict";
import rehypeWrapTables from "../src/lib/rehype-wrap-tables.mjs";

const table = {
  type: "element",
  tagName: "table",
  properties: {},
  children: [{ type: "element", tagName: "tbody", children: [] }],
};
const paragraph = {
  type: "element",
  tagName: "p",
  properties: {},
  children: [{ type: "text", value: "before" }],
};
const root = {
  type: "root",
  children: [
    { type: "element", tagName: "blockquote", children: [table] },
    paragraph,
  ],
};

rehypeWrapTables()(root);

const wrapper = root.children[0].children[0];
assert.equal(wrapper.tagName, "div");
assert.deepEqual(wrapper.properties.className, ["table-wrap"]);
assert.equal(wrapper.properties.role, "group");
assert.equal(wrapper.properties.tabIndex, 0);
assert.match(wrapper.properties["aria-label"], /горизонтальную прокрутку/);
assert.equal(wrapper.children[0], table);
assert.equal(
  root.children[1],
  paragraph,
  "Non-table siblings must keep their order",
);
console.log(
  "PASS: rendered Markdown tables are wrapped without changing document order",
);

const element = (tagName, children = [], properties = {}) => ({
  type: "element",
  tagName,
  children,
  properties,
});
const text = (value) => ({ type: "text", value });
const header = element("th", [text("Что проверить")]);
const cell = element("td", [text("Полное определение")]);
const annotated = element("table", [
  element("thead", [element("tr", [text("\n"), header])]),
  element("tbody", [element("tr", [text("\n"), cell])]),
]);
const checks = element("li", [
  element("input", [], { type: "checkbox", disabled: true }),
  text("Ориентир освоения"),
]);
const reference = element("p", [text("Повторённая ссылка")]);
const content = element("p", [text("Самостоятельное объяснение")]);
const document = {
  type: "root",
  children: [
    annotated,
    checks,
    element("h2", [text("Источники для проверки")]),
    reference,
    element("h2", [text("Следующий раздел")]),
    content,
  ],
};
rehypeWrapTables()(document);
assert.equal(cell.properties["data-label"], "Что проверить");
assert.equal(cell.properties.role, "cell");
assert.equal(header.properties.role, "columnheader");
assert.equal(annotated.properties.role, "table");
assert.equal(checks.children.length, 1);
assert.equal(checks.children[0].value, "Ориентир освоения");
assert.equal(reference.properties["data-pagefind-ignore"], true);
assert.equal(content.properties["data-pagefind-ignore"], undefined);
console.log(
  "PASS: table labels survive whitespace, checklist text remains and only reference sections leave the search index",
);
