/* Хотелки — service worker. Данные (localStorage) не кэшируются, только оболочка. */
const CACHE = "hotelki-v2";
const ASSETS = [
  "./", "./index.html", "./app.js", "./manifest.webmanifest",
  "./icon-180.png", "./icon-192.png", "./icon-512.png", "./favicon-32.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", e => {
  const req = e.request;
  const url = new URL(req.url);
  // Только свой origin и только GET. Запросы к api.github.com идут мимо кэша (сеть).
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  const isHTML = req.mode === "navigate" || (req.headers.get("accept") || "").indexOf("text/html") >= 0;
  const isCode = url.pathname.endsWith("app.js");

  if (isHTML || isCode) {
    // Network-first для оболочки и кода — обновления приходят сразу, когда есть сеть.
    e.respondWith(
      fetch(req).then(resp => { const c = resp.clone(); caches.open(CACHE).then(cc => cc.put(req, c)); return resp; })
        .catch(() => caches.match(req).then(r => r || caches.match("./index.html")))
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(cached => cached ||
      fetch(req).then(resp => { const c = resp.clone(); caches.open(CACHE).then(cc => cc.put(req, c)); return resp; }))
  );
});

/* push-уведомления */
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  const title = d.title || "Хотелки";
  const opts = {
    body: d.body || "",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    tag: d.tag || "hotelki",
    data: { url: d.url || "./" }
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const c of list) { if ("focus" in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
