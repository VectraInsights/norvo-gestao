/* Service worker mínimo p/ instalabilidade (Chrome: Instalar app).
 * Só repassa as requisições (sem cache) — o app continua 100% online. */
self.addEventListener("install", (event) => {
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
