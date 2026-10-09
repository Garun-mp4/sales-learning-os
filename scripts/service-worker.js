const CACHE_PREFIX = "sales-os-offline-";
const READY_MARKER = "__sales-os-offline-ready__";
const INSTALL_HEADER = "x-salesos-offline-install";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

async function readyCaches() {
  const markerUrl = new URL(READY_MARKER, self.registration.scope).href;
  const names = (await caches.keys()).filter((name) =>
    name.startsWith(CACHE_PREFIX),
  );
  const packs = await Promise.all(
    names.map(async (name) => {
      const cache = await caches.open(name);
      const response = await cache.match(markerUrl);
      if (!response?.ok) return null;
      try {
        const marker = await response.json();
        const version = name.slice(CACHE_PREFIX.length);
        if (marker.version !== version || !Number.isFinite(marker.installedAt))
          return null;
        return { cache, installedAt: marker.installedAt };
      } catch {
        return null;
      }
    }),
  );
  return packs
    .filter(Boolean)
    .sort((left, right) => right.installedAt - left.installedAt);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (
    request.method !== "GET" ||
    new URL(request.url).origin !== self.location.origin
  )
    return;
  if (request.headers.get(INSTALL_HEADER) === "1") return;

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        if (response.status < 500) return response;
      } catch {
        // An explicitly completed offline pack is the only network fallback.
      }

      const cacheUrl = new URL(request.url);
      cacheUrl.search = "";
      cacheUrl.hash = "";
      for (const { cache } of await readyCaches()) {
        const response = await cache.match(cacheUrl.href);
        if (response) return response;
      }
      return Response.error();
    })(),
  );
});
