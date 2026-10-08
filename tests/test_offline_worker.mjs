/** Service worker behavior using Node VM with simulated fetch/CacheStorage.
 * No real-browser offline assertion is implied by these tests.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { runInNewContext } from "node:vm";
import path from "node:path";

const site = path.resolve(process.argv[2] ?? "dist");
const sourceManifest = JSON.parse(
  readFileSync("src/generated/content-manifest.json", "utf8"),
);
const manifest = JSON.parse(
  readFileSync(path.join(site, "assets/offline-files.json"), "utf8"),
);
assert.ok(
  manifest.urls.length > Object.keys(sourceManifest.entries).length,
  "The offline manifest should list every course page and support asset",
);
assert.equal(
  new Set(manifest.urls).size,
  manifest.urls.length,
  "The manifest must not contain duplicates",
);
for (const url of manifest.urls) {
  assert.ok(!url.startsWith("/"), `Expected relative canonical URL: ${url}`);
  assert.ok(
    !url.includes("\\"),
    `Expected URL separators to use forward slashes: ${url}`,
  );
  assert.ok(!url.endsWith("index.html"), `Non-canonical URL: ${url}`);
  const segments = url.split("/").filter(Boolean);
  const file =
    url.endsWith("/") || url === ""
      ? path.join(site, ...segments, "index.html")
      : path.join(site, ...segments);
  assert.ok(existsSync(file), `Offline resource missing: ${url}`);
}
for (const [id, entry] of Object.entries(sourceManifest.entries)) {
  const kind = { module: "module", theory: "lesson", practice: "practice" }[
    entry.kind
  ];
  assert.ok(
    manifest.urls.includes(`${kind}/${id}/`),
    `Course route missing from offline manifest: ${id}`,
  );
}
console.log(
  `PASS: manifest has ${manifest.urls.length} unique canonical URLs, all exist`,
);

const registrations = {};
const version = manifest.version;
const storage = new Map([
  [
    "sales-os-offline-previous",
    new Map([
      ["http://test.local/lesson/01-001/", { status: 200, body: "stored old" }],
    ]),
  ],
  [
    `sales-os-offline-${version}`,
    new Map([
      ["http://test.local/lesson/01-001/", { status: 200, body: "stored new" }],
    ]),
  ],
]);
let online = true;
let networkResponse = { ok: true, status: 200, body: "fresh network" };
let errorSent = false;
const ctx = {
  self: {
    location: { origin: "http://test.local" },
    clients: { claim: async () => {} },
    skipWaiting: () => {},
    addEventListener(type, handler) {
      registrations[type] = handler;
    },
  },
  location: { origin: "http://test.local" },
  caches: {
    keys: async () => [...storage.keys()],
    open: async (name) => ({
      match: async (req) => storage.get(name)?.get(req.url) || null,
    }),
  },
  fetch: async () => {
    if (!online) throw Error("offline");
    return networkResponse;
  },
  Response: {
    error: () => {
      errorSent = true;
      return { status: 0, body: "network error" };
    },
  },
  URL,
};
runInNewContext(readFileSync(path.join(site, "sw.js"), "utf8"), ctx);
assert.equal(typeof registrations.fetch, "function");
function respond(url, method = "GET") {
  let response;
  registrations.fetch({
    request: { url, method },
    respondWith(p) {
      response = p;
    },
  });
  return response;
}
assert.equal(
  respond("http://elsewhere.invalid/test"),
  undefined,
  "Cross-origin requests must be untouched",
);
assert.equal(
  respond("http://test.local/api", "POST"),
  undefined,
  "Non-GET requests must be untouched",
);
const onlineResp = await Promise.resolve(
  respond("http://test.local/lesson/01-001/"),
);
assert.equal(onlineResp.body, "fresh network");
online = false;
const offlineResp = await Promise.resolve(
  respond("http://test.local/lesson/01-001/"),
);
assert.equal(offlineResp.body, "stored new");
storage.get(`sales-os-offline-${version}`).clear();
const oldResp = await Promise.resolve(
  respond("http://test.local/lesson/01-001/"),
);
assert.equal(
  oldResp.body,
  "stored old",
  "Worker must find older cache after an app update",
);
const missingResp = await Promise.resolve(
  respond("http://test.local/lesson/02-001/"),
);
assert.equal(missingResp.status, 0);
assert.equal(errorSent, true);
console.log(
  "PASS: worker same-origin GET, network-first, cached fallback, old cache fallback, missing resource",
);
