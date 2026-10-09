import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const root = path.resolve("dist");
const offlineManifestPath = path.join(root, "assets/offline-files.json");
const workerPath = path.join(root, "sw.js");

async function writeAtomic(file, content) {
  const temporary = `${file}.tmp`;
  try {
    await writeFile(temporary, content);
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

await writeAtomic(workerPath, await readFile("scripts/service-worker.js"));

// Stable legacy URLs remain available; each new page references immutable bytes.
const assetNames = new Map();
await mkdir(path.join(root, "assets/versioned"), { recursive: true });
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
  "trainer-core.js",
  "trainer.js",
]) {
  const content = await readFile(path.join(root, "assets", name));
  const extension = path.extname(name);
  const hash = createHash("sha256").update(content).digest("hex").slice(0, 16);
  const versioned = `versioned/${name.slice(0, -extension.length)}.${hash}${extension}`;
  await writeAtomic(path.join(root, "assets", versioned), content);
  assetNames.set(name, versioned);
}
async function versionHtml(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await versionHtml(file);
    else if (entry.name.endsWith(".html")) {
      let html = await readFile(file, "utf8");
      for (const [name, versioned] of assetNames)
        html = html.replaceAll(`assets/${name}"`, `assets/${versioned}"`);
      await writeAtomic(file, html);
    }
  }
}
await versionHtml(root);

const files = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(absolute);
    } else if (entry.isFile()) {
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      if (relative !== "assets/offline-files.json") {
        files.push({ relative, absolute, content: await readFile(absolute) });
      }
    }
  }
}
await walk(root);

const fingerprint = createHash("sha256");
const resources = [];
for (const file of files.sort((left, right) =>
  left.relative < right.relative ? -1 : left.relative > right.relative ? 1 : 0,
)) {
  fingerprint
    .update(file.relative)
    .update("\0")
    .update(file.content)
    .update("\0");
  if (file.relative === "sw.js") continue;

  const url = file.relative.endsWith("index.html")
    ? file.relative.slice(0, -"index.html".length)
    : file.relative;
  resources.push({ url, bytes: file.content.byteLength });
}
resources.push({ url: "assets/offline-files.json", bytes: 0 });
resources.sort((left, right) =>
  left.url < right.url ? -1 : left.url > right.url ? 1 : 0,
);

const contentManifest = JSON.parse(
  await readFile("src/generated/content-manifest.json", "utf8"),
);
const modules = Object.values(contentManifest.entries)
  .filter((entry) => entry.kind === "module")
  .sort((left, right) => left.module.localeCompare(right.module))
  .map((entry) => ({
    id: entry.module,
    title: entry.title,
    url: `module/${entry.id}/`,
  }));

const version = fingerprint.digest("hex").slice(0, 12);
const manifest = {
  schemaVersion: 2,
  version,
  estimatedBytes: resources.reduce(
    (total, resource) => total + resource.bytes,
    0,
  ),
  modules,
  resources,
  urls: resources.map((resource) => resource.url),
};
await writeAtomic(offlineManifestPath, JSON.stringify(manifest));

console.log(
  "Offline manifest rebuilt:",
  resources.length,
  "resources; build version:",
  version,
);
