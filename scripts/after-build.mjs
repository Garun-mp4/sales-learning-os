import { readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const root = path.resolve("dist");
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
let urls = [];
async function walk(dir) {
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) await walk(p);
    else if (ent.isFile() && !p.endsWith("sw.js"))
      urls.push(path.relative(root, p).split(path.sep).join("/"));
  }
}
await walk(root);
const version = createHash("sha256")
  .update(await readFile("src/scripts/app.js"))
  .update(await readFile("src/scripts/user-store.js"))
  .update(await readFile("src/generated/content-manifest.json"))
  .digest("hex")
  .slice(0, 12);
urls = [
  ...new Set(
    urls
      .filter((u) => !u.endsWith("offline-files.json"))
      .map((u) =>
        u.endsWith("index.html") ? u.slice(0, -"index.html".length) : u,
      ),
  ),
].sort();
await writeAtomic(
  path.join(root, "assets/offline-files.json"),
  JSON.stringify({ version, urls }, null, 0),
);
const script = `self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET'||new URL(r.url).origin!==location.origin)return;e.respondWith((async()=>{try{const a=await fetch(r);if(a.ok)return a;throw Error(String(a.status));}catch{const names=(await caches.keys()).filter(k=>k.startsWith('sales-os-offline-')).reverse();for(const n of names){const a=await(await caches.open(n)).match(r);if(a)return a;}return Response.error()}})())});`;
await writeAtomic(path.join(root, "sw.js"), script);
console.log(
  "Offline manifest rebuilt:",
  urls.length,
  "resources; build version:",
  version,
);
