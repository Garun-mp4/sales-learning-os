import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const script = path.resolve("scripts/after-build.mjs");
const temporary = await mkdtemp(path.join(tmpdir(), "sales-os-asset-test-"));
try {
  const builds = [];
  for (const version of ["old", "new"]) {
    const cwd = path.join(temporary, version);
    for (const directory of ["dist/assets", "scripts", "src/generated"])
      await mkdir(path.join(cwd, directory), { recursive: true });
    await writeFile(
      path.join(cwd, "scripts/service-worker.js"),
      "// test worker",
    );
    await writeFile(
      path.join(cwd, "src/generated/content-manifest.json"),
      JSON.stringify({ entries: {} }),
    );
    for (const name of [
      "app.css",
      "app.js",
      "user-store.js",
      "practice-feedback.js",
      "today-core.js",
      "today.js",
      "knowledge-core.js",
      "knowledge.js",
      "projects-core.js",
      "projects.js",
      "templates-core.js",
      "templates.js",
      "trainer-core.js",
      "trainer.js",
    ])
      await writeFile(
        path.join(cwd, "dist/assets", name),
        name === "user-store.js" ? "shared storage bytes" : version + name,
      );
    await writeFile(
      path.join(cwd, "dist/index.html"),
      '<link href="/assets/app.css"><script src="/assets/user-store.js"></script><script src="/assets/app.js"></script><script src="/assets/templates-core.js"></script><script src="/assets/templates.js"></script>',
    );
    execFileSync(process.execPath, [script], { cwd, stdio: "pipe" });
    const html = await readFile(path.join(cwd, "dist/index.html"), "utf8");
    const refs = [...html.matchAll(/assets\/versioned\/[^"]+/g)].map(
      (match) => match[0],
    );
    assert.equal(refs.length, 5);
    const manifest = JSON.parse(
      await readFile(path.join(cwd, "dist/assets/offline-files.json"), "utf8"),
    );
    for (const ref of refs) {
      const bytes = await readFile(path.join(cwd, "dist", ref));
      assert(
        ref.includes(
          createHash("sha256").update(bytes).digest("hex").slice(0, 16),
        ),
      );
      assert(
        manifest.urls.includes(ref),
        "Offline pack must include exact versioned bytes",
      );
    }
    builds.push(refs);
  }
  assert.notEqual(
    builds[0][0],
    builds[1][0],
    "CSS address must change across releases",
  );
  assert.notEqual(
    builds[0][2],
    builds[1][2],
    "App address must change across releases",
  );
  assert.equal(
    builds[0][1],
    builds[1][1],
    "Unchanged storage bytes keep the same address",
  );
  console.log(
    "PASS: two releases get content-addressed assets and complete offline manifests",
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
