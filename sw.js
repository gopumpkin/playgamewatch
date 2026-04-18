const CACHE_NAME = "game-watch-v1";
const ASSETS = [
  "/",
  "/index.html",
  "/styles/site.css",
  "/shared/audio.js",
  "/shared/controls.js",
  "/shared/input.js",
  "/shared/layout.js",
  "/shared/storage.js",
  "/games/fire/",
  "/games/fire/index.html",
  "/games/fire/fire.css",
  "/games/fire/fire.js",
  "/games/fire/fire-engine.js",
  "/manifest.webmanifest",
  "/assets/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      )),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(event.request).then((response) => {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        return response;
      });
    }),
  );
});
