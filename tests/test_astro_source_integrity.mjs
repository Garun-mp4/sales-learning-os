/** Verify Astro consumes the canonical Markdown source tree directly. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const manifest = JSON.parse(
  await readFile("src/generated/content-manifest.json", "utf8"),
);
const entries = Object.values(manifest.entries);
assert.equal(entries.length, 430, "Expected 430 learning documents");
for (const [kind, size] of [
  ["module", 22],
  ["theory", 336],
  ["practice", 72],
]) {
  assert.equal(
    entries.filter((entry) => entry.kind === kind).length,
    size,
    kind,
  );
}

const config = await readFile("src/content.config.ts", "utf8");
assert.ok(
  config.includes('base: "./sales-knowledge-base/modules"'),
  "Astro Content Collection must read the authoritative Markdown source",
);
assert.ok(
  !config.includes("src/content/sales"),
  "Astro must not depend on a generated duplicate of the course content",
);

for (const entry of entries) {
  assert.ok(
    !entry.path.includes("\\"),
    `Manifest path must use URL separators: ${entry.id}`,
  );
  const source = await readFile(
    path.join("sales-knowledge-base", entry.path),
    "utf8",
  );
  const frontmatter = source.split(/^---\s*$/m)[1] ?? "";
  const sourceId = /^id:\s*["']?([^"'\r\n]+)["']?\s*$/m.exec(frontmatter)?.[1];
  assert.ok(
    sourceId === entry.id,
    `Source frontmatter ID does not match manifest: ${entry.id}`,
  );
}

const staged = await readFile("src/generated/final-project.html", "utf8");
assert.ok(
  staged.length > 1000 && staged.includes("Чек-пойнты"),
  "Final project Markdown article is not staged outside dist",
);
const finalPage = await readFile("src/pages/final-project/index.astro", "utf8");
assert.ok(finalPage.includes("src/generated/final-project.html"));
assert.ok(!finalPage.includes("readFile(path.resolve('dist/"));
console.log(
  "PASS: all 430 Markdown sources map to manifest IDs; Astro reads the canonical source tree",
);
