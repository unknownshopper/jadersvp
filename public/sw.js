// Service worker mínimo: requerido para instalabilidad PWA en Chrome.
// No cachea nada — todo el tráfico sigue yendo a la red.
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener("fetch", () => {
  // Passthrough intencional.
});
