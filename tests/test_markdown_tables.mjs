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
