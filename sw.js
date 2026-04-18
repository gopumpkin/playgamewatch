const CACHE_NAME = "game-watch-v3";
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

  const url = new URL(event.request.url);
  const isScript = url.pathname.endsWith(".js") || url.pathname.endsWith(".html");

  if (isScript) {
    // Network-first for JS/HTML so updates are always picked up
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request)),
    );
  } else {
    // Cache-first for assets (images, audio, fonts)
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) {
          return cached;
        }
        return fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        });
      }),
    );
  }
});
