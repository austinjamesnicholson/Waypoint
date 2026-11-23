// PWA: register offline caching on supported HTTPS hosts.
if (
  "serviceWorker" in navigator &&
  (location.protocol === "https:" || location.hostname === "localhost")
) {
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("./service-worker.js").catch(console.warn),
  );
}
