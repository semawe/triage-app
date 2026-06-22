const CACHE = "triapp-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) =>
  e.waitUntil(self.clients.claim())
);

self.addEventListener("fetch", (e) => {
  // Pass-through — pas de cache agressif, on veut toujours du contenu frais
  if (e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
