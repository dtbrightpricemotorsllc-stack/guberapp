const CACHE_NAME = "guber-v10";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // For HTML navigation (the app shell) — always go network-first so updates show immediately
  if (event.request.mode === "navigate" || event.request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // For everything else — network-first, cache fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "GUBER", body: event.data.text(), url: "/" };
  }

  const isHighPriority = payload.priority === "high";

  // Tag strategy:
  //  "nearby-jobs"         → always replaces the previous (same tag, no timestamp)
  //  "messages"            → grouped (same tag, renotify)
  //  "job-status-{id}"     → grouped per job (same tag, renotify)
  //  "pay-increase-{id}"   → grouped per job — replaces earlier pay-increase for same job
  //  everything else       → unique (append timestamp so it never deduplicates)
  const rawTag = payload.tag || "";
  const grouped = rawTag === "nearby-jobs" || rawTag === "messages" || rawTag.startsWith("job-status-") || rawTag.startsWith("pay-increase-");
  const tag = grouped ? rawTag : (rawTag ? rawTag + "-" + Date.now() : "guber-" + Date.now());

  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icon-192.png",
    badge: "/favicon.png",
    image: payload.image || undefined,
    data: { url: payload.url || "/" },
    // High priority: longer vibration + requireInteraction so it stays on screen
    vibrate: isHighPriority
      ? [300, 100, 300, 100, 500, 100, 300]
      : [200, 100, 200, 100, 200],
    tag: tag,
    renotify: true,
    silent: false,
    requireInteraction: isHighPriority,
    actions: [{ action: "open", title: "View" }],
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || "GUBER", options).then(() => {
      // Signal open app windows to play the custom in-app sound
      return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
        list.forEach((client) => {
          client.postMessage({
            type: "GUBER_PUSH",
            tag: rawTag,
            title: payload.title,
          });
        });
      });
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
