import assert from "node:assert/strict";
import remarkCoursePageTitle from "../src/lib/remark-course-page-title.mjs";

const heading = (depth, value) => ({
  type: "heading",
  depth,
  children: [{ type: "text", value }],
});
const tree = {
  type: "root",
  children: [
    heading(1, "Заголовок из frontmatter"),
    { type: "paragraph", children: [{ type: "text", value: "Содержание" }] },
    heading(2, "Первый раздел"),
  ],
};

remarkCoursePageTitle()(tree);
assert.deepEqual(
  tree.children.map((node) => node.children?.[0]?.value || node.type),
  ["Содержание", "Первый раздел"],
);
console.log("PASS: Markdown frontmatter owns the only page-level H1");
