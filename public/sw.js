const CACHE = "bosch-range-v3-20261029";
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      await cache.addAll(["/", "/icon.svg", "/manifest.webmanifest"]);
      const html = await (await cache.match("/")).text();
      const assets = [
        ...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g),
      ].map((m) => m[1]);
      await cache.addAll(assets);
      const dependencies = new Set();
      for (const asset of assets.filter((a) => a.endsWith(".js"))) {
        const source = await (await cache.match(asset)).text();
        for (const match of source.matchAll(/["'](\/assets\/[^"']+\.js)["']/g))
          dependencies.add(match[1]);
      }
      await cache.addAll([...dependencies]);
    }),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      ),
  );
});
self.addEventListener("fetch", (event) => {
  if (
    event.request.method !== "GET" ||
    new URL(event.request.url).origin !== self.location.origin
  )
    return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === "navigate") return caches.match("/");
        return Response.error();
      }),
  );
});
