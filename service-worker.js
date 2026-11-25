const CACHE = "waypoint-v10-flow-focus-20261124";
const ASSETS = [
  "./",
  "./index.html",
  "./css/styles.css?v=20261124",
  "./js/dependencies.js",
  "./js/views.js",
  "./js/views/dashboard.js",
  "./js/views/projects.js?v=20261124",
  "./js/views/project-detail.js?v=20261124",
  "./js/views/project-flow.js",
  "./js/views/tasks.js",
  "./js/views/inbox.js",
  "./js/config.js",
  "./js/vendor/supabase.js",
  "./js/sync.js",
  "./js/cloud.js",
  "./js/app.js?v=20261124",
  "./js/pwa.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((k) => k.startsWith("waypoint-") && k !== CACHE)
              .map((k) => caches.delete(k)),
          ),
        ),
      self.clients.claim(),
    ]),
  );
});
self.addEventListener("fetch", (e) => {
  if (
    e.request.method !== "GET" ||
    new URL(e.request.url).origin !== self.location.origin
  )
    return;
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return response;
      })
      .catch(() =>
        caches
          .match(e.request)
          .then(
            (r) =>
              r ||
              (e.request.mode === "navigate"
                ? caches.match("./index.html")
                : Response.error()),
          ),
      ),
  );
});
