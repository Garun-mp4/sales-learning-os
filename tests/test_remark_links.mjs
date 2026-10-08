import assert from "node:assert/strict";
import path from "node:path";
import remarkCourseLinks, {
  routeForMarkdownLink,
} from "../src/lib/remark-course-links.mjs";
const source = path.resolve(
  "sales-knowledge-base/modules/01-foundations/00-module.md",
);
const hrefs = [
  ["theory/01-001.md", "/lesson/01-001/"],
  ["practice/01-P01.md", "/practice/01-P01/"],
  ["theory/01-002.md#notes", "/lesson/01-002/#notes"],
  ["https://example.org/guide.md", "https://example.org/guide.md"],
  ["#local-heading", "#local-heading"],
];
for (const [from, to] of hrefs)
  assert.equal(routeForMarkdownLink(from, source), to);
const root = {
  type: "root",
  children: [
    {
      type: "paragraph",
      children: [
        {
          type: "link",
          url: "theory/01-001.md",
          children: [{ type: "text", value: "first" }],
        },
      ],
    },
    { type: "definition", url: "practice/01-P01.md" },
  ],
};
remarkCourseLinks()(root, { path: source });
assert.equal(root.children[0].children[0].url, "/lesson/01-001/");
assert.equal(root.children[1].url, "/practice/01-P01/");
console.log(
  "PASS: Astro Markdown relative links resolve to stable lesson/practice routes",
);
