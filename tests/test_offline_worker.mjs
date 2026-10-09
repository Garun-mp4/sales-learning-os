/** Validate generated offline manifests and the service worker's ready-pack gate. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";

const site = path.resolve(process.argv[2] ?? "dist");
const sourceManifest = JSON.parse(
  readFileSync("src/generated/content-manifest.json", "utf8"),
);
const manifest = JSON.parse(
  readFileSync(path.join(site, "assets/offline-files.json"), "utf8"),
);
const markerUrl = "http://test.local/__sales-os-offline-ready__";

assert.equal(manifest.schemaVersion, 2);
assert.match(manifest.version, /^[a-f0-9]{12}$/i);
assert.equal(manifest.urls.length, manifest.resources.length);
assert.deepEqual(
  manifest.urls,
  manifest.resources.map((resource) => resource.url),
  "Legacy URL list and sized resources must stay in sync",
);
assert.equal(new Set(manifest.urls).size, manifest.urls.length);
assert.equal(manifest.modules.length, 22);
assert.ok(manifest.estimatedBytes > 0);
assert.ok(manifest.urls.includes("assets/offline-files.json"));
assert.ok(
  !manifest.urls.includes("sw.js"),
  "The running worker is managed by the browser",
);

for (const resource of manifest.resources) {
  const url = resource.url;
  assert.ok(!url.startsWith("/"), `Expected relative canonical URL: ${url}`);
  assert.ok(
    !url.includes("\\"),
    `Expected web separators, not Windows paths: ${url}`,
  );
  assert.ok(
    !url.split("/").includes(".."),
    `Path traversal in offline manifest: ${url}`,
  );
  assert.ok(
    !url.toLowerCase().includes("dist"),
    `Build directory leaked into manifest: ${url}`,
  );
  assert.ok(
    !url.endsWith("index.html"),
    `Expected canonical route URL: ${url}`,
  );
  const segments = url.split("/").filter(Boolean);
  const output =
    url === "assets/offline-files.json"
      ? path.join(site, ...segments)
      : url.endsWith("/") || url === ""
        ? path.join(site, ...segments, "index.html")
        : path.join(site, ...segments);
  assert.ok(statSync(output).isFile(), `Offline resource missing: ${url}`);
  if (url !== "assets/offline-files.json")
    assert.equal(
      resource.bytes,
      statSync(output).size,
      `Resource size is stale: ${url}`,
    );
}

for (const [id, entry] of Object.entries(sourceManifest.entries)) {
  const routeKind = {
    module: "module",
    theory: "lesson",
    practice: "practice",
  }[entry.kind];
  assert.ok(
    manifest.urls.includes(`${routeKind}/${id}/`),
    `Course route missing: ${id}`,
  );
}
for (const source of sourceManifest.sources)
  assert.ok(
    manifest.urls.includes(`source/${source.id}/`),
    `Source route missing: ${source.id}`,
  );
for (const module of manifest.modules)
  assert.ok(
    manifest.urls.includes(module.url),
    `Module route missing: ${module.id}`,
  );

function collectFiles(directory, relative = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(absolute, name);
    if (name === "assets/offline-files.json") return [];
    return [{ name, absolute }];
  });
}
const fingerprint = createHash("sha256");
for (const file of collectFiles(site).sort((left, right) =>
  left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
))
  fingerprint
    .update(file.name)
    .update("\0")
    .update(readFileSync(file.absolute))
    .update("\0");
assert.equal(
  manifest.version,
  fingerprint.digest("hex").slice(0, 12),
  "Offline version must fingerprint actual rendered resources and the service worker",
);
console.log(
  `PASS: ${manifest.resources.length} canonical Windows/POSIX-safe offline resources, ${manifest.modules.length} modules, ${manifest.estimatedBytes} estimated bytes, output fingerprint ${manifest.version}`,
);

const registrations = {};
const currentVersion = manifest.version;
const readyBody = (version, installedAt) => ({
  ok: true,
  json: async () => ({ version, installedAt }),
});
const response = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  body,
});
const storage = new Map([
  [
    "sales-os-offline-incomplete",
    new Map([
      ["http://test.local/lesson/01-001/", response("unsafe partial")],
      ["http://test.local/lesson/02-001/", response("unsafe partial")],
    ]),
  ],
  [
    "sales-os-offline-previous",
    new Map([
      [markerUrl, readyBody("previous", 10)],
      ["http://test.local/lesson/01-001/", response("stored previous")],
    ]),
  ],
  [
    `sales-os-offline-${currentVersion}`,
    new Map([
      [markerUrl, readyBody(currentVersion, 20)],
      ["http://test.local/lesson/01-001/", response("stored current")],
    ]),
  ],
]);
let online = true;
let networkResponse = response("fresh network");
let errorSent = false;
const context = {
  self: {
    location: { origin: "http://test.local" },
    registration: { scope: "http://test.local/" },
    clients: { claim: async () => {} },
    skipWaiting: () => {},
    addEventListener(type, handler) {
      registrations[type] = handler;
    },
  },
  caches: {
    keys: async () => [...storage.keys()],
    open: async (name) => ({
      match: async (key) =>
        storage.get(name)?.get(typeof key === "string" ? key : key.url) || null,
    }),
  },
  fetch: async () => {
    if (!online) throw new Error("offline");
    return networkResponse;
  },
  Response: {
    error: () => {
      errorSent = true;
      return response("network error", 0);
    },
  },
  URL,
};
runInNewContext(readFileSync(path.join(site, "sw.js"), "utf8"), context);
assert.equal(typeof registrations.fetch, "function");

function request(url, { method = "GET", headers = {} } = {}) {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    url,
    method,
    headers: { get: (key) => normalizedHeaders[key.toLowerCase()] || null },
  };
}
/** @returns {Promise<any> | undefined} */
function respond(url, options) {
  let result;
  registrations.fetch({
    request: request(url, options),
    respondWith(value) {
      result = value;
    },
  });
  return result;
}

assert.equal(respond("https://outside.invalid/resource"), undefined);
assert.equal(respond("http://test.local/api", { method: "POST" }), undefined);
assert.equal(
  respond("http://test.local/lesson/01-001/", {
    headers: { "X-SalesOS-Offline-Install": "1" },
  }),
  undefined,
  "Installer requests must bypass stale offline fallback",
);
assert.equal(
  (await respond("http://test.local/lesson/01-001/")).body,
  "fresh network",
);
networkResponse = response("not found", 404);
assert.equal((await respond("http://test.local/lesson/01-001/")).status, 404);

online = false;
networkResponse = response("server error", 503);
const offlineResponse = await respond(
  "http://test.local/lesson/01-001/?q=local&personal=text",
);
assert.equal(
  offlineResponse.body,
  "stored current",
  "Newest completed pack should serve a cache hit and ignore query state",
);
storage
  .get(`sales-os-offline-${currentVersion}`)
  .delete("http://test.local/lesson/01-001/");
assert.equal(
  (await respond("http://test.local/lesson/01-001/")).body,
  "stored previous",
);
assert.equal((await respond("http://test.local/lesson/02-001/")).status, 0);
assert.equal(errorSent, true);
console.log(
  "PASS: worker bypasses installer fetches, preserves real 404s, and serves only completed packs newest-first",
);
