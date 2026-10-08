import assert from "node:assert/strict";
import remarkModuleReadingBody from "../src/lib/remark-module-reading-body.mjs";

const paragraph = (value) => ({
  type: "paragraph",
  children: [{ type: "text", value }],
});
const heading = (depth, value) => ({
  type: "heading",
  depth,
  children: [{ type: "text", value }],
});
const tree = {
  type: "root",
  children: [
    heading(1, "Модуль 01. Природа и процесс продаж"),
    heading(2, "Концептуальная основа"),
    paragraph("Объясняем ценность."),
    heading(2, "Порядок изучения"),
    paragraph("Автоматически выстроенный список уроков."),
    heading(2, "Обязательная практика"),
    paragraph("Автоматически выстроенный список практик."),
    heading(2, "Границы и проверка освоения"),
    paragraph("Сохраняем заключительную часть главы."),
  ],
};
remarkModuleReadingBody()(tree, {
  path: "C:\\course\\modules\\01-foundations\\00-module.md",
});
const headings = tree.children
  .filter((node) => node.type === "heading")
  .map((node) => node.children[0].value);
assert.deepEqual(headings, [
  "Концептуальная основа",
  "Границы и проверка освоения",
]);
assert(
  !tree.children.some((node) =>
    node.children?.[0]?.value?.includes("Автоматически"),
  ),
);

const lesson = { type: "root", children: [heading(1, "Не изменять урок")] };
remarkModuleReadingBody()(lesson, {
  path: "/course/modules/01-foundations/theory/01-001.md",
});
assert.equal(lesson.children[0].children[0].value, "Не изменять урок");
console.log(
  "PASS: integration chapters omit duplicated course navigation without affecting lessons",
);
