const CACHE_NAME = "renewme-offline-shell-v1";
const OFFLINE_SHELL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll([OFFLINE_SHELL, "/offline-actions.js"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("renewme-offline-") && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(async () => (await caches.match(OFFLINE_SHELL)) || Response.error()));
});

self.addEventListener("push", (event) => {
  const payload = (() => {
    try { return event.data ? event.data.json() : {}; }
    catch { return { body: event.data ? event.data.text() : "You have a RenewMe reminder." }; }
  })();
  event.waitUntil(self.registration.showNotification(payload.title || "RenewMe reminder", {
    body: payload.body || "A subscription deadline is coming up.",
    tag: payload.tag || "renewme-reminder",
    data: { url: payload.url || "/reminders" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/reminders", self.location.origin);
  const safeTarget = target.origin === self.location.origin ? target.href : new URL("/reminders", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) return existing.navigate(safeTarget).then(() => existing.focus());
    return self.clients.openWindow(safeTarget);
  }));
});
