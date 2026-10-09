import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parsePracticeRubric } from "../src/lib/practice-rubric.mjs";

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory()
        ? walk(target)
        : target.endsWith(".md")
          ? [target]
          : [];
    }),
  );
  return nested.flat();
}

const root = path.resolve("sales-knowledge-base/modules");
const files = (await walk(root)).filter((file) =>
  /[\\/]practice[\\/].+-P\d+\.md$/.test(file),
);
assert.equal(
  files.length,
  72,
  "Expected all 72 practice sources to be covered",
);

for (const file of files) {
  const markdown = await readFile(file, "utf8");
  const criteria = parsePracticeRubric(markdown);
  assert.equal(
    criteria.length,
    5,
    `${file} should expose its full five-row rubric`,
  );
  assert.deepEqual(
    criteria.map((criterion) => criterion.id),
    ["criterion-1", "criterion-2", "criterion-3", "criterion-4", "criterion-5"],
  );
  assert.equal(new Set(criteria.map((criterion) => criterion.label)).size, 5);
  assert.ok(
    criteria.every(
      (criterion) =>
        criterion.label.length > 0 && criterion.description.length > 0,
    ),
  );
}

console.log(
  `PASS: M7 practice editor can use individual rubric criteria from all ${files.length} source documents`,
);
