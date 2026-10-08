import { readFileSync, existsSync } from "node:fs";
const checks = [
  "astro.config.mjs",
  "src/content.config.ts",
  "src/layouts/Shell.astro",
  "src/pages/index.astro",
  "src/pages/lesson/[id].astro",
  "src/pages/practice/[id].astro",
  "src/pages/module/[id].astro",
];
for (const f of checks) {
  if (!existsSync(f)) throw Error("Missing: " + f);
  if (!readFileSync(f, "utf8").trim()) throw Error("Empty: " + f);
}
console.log(
  "Astro source files present:",
  checks.length,
  "(not a substitute for astro check)",
);
