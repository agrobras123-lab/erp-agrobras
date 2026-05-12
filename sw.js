const CACHE = "erp-agrobras-v4";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./favicon.png",
  "https://unpkg.com/react@18/umd/react.production.min.js",
  "https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  if (e.request.url.includes("firestore.googleapis.com")) return;

  const url = new URL(e.request.url);
  const isAppShell = url.origin === self.location.origin && (url.pathname.endsWith("/") || url.pathname.endsWith("/index.html"));

  if (isAppShell) {
    e.respondWith(
      fetch(e.request)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put("./index.html", copy));
          return resp;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  e.respondWith(caches.match(e.request).then((cached) => cached || fetch(e.request)));
});
