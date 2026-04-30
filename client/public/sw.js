const CACHE_NAME = "guber-v13";

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

  // Phase 5 — accept up to 2 server-supplied action buttons per push.
  // Falls back to a single "View" button when none are provided.
  const incomingActions = Array.isArray(payload.actions) ? payload.actions.slice(0, 2) : null;
  const actions = incomingActions && incomingActions.length > 0
    ? incomingActions
    : [{ action: "open", title: "View" }];

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
    actions: actions,
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
            sound: payload.sound || "guber_default.wav",
          });
        });
      });
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  // Phase 5 — action button routing.
  //   "snooze"          → POST to /api/reminders/snooze so the server can
  //                       defer the next nudge by 5 minutes and re-deliver
  //                       it if the worker still hasn't tapped on-the-way.
  //                       The notification is already closed above; we don't
  //                       open or focus a window.
  //   "on_the_way"      → keep the deep link (?action=on_the_way) so the
  //                       job page POSTs the on-the-way milestone for us.
  //   "release_payment" → keep the deep link (?action=release).
  //   default ("open"/no action) → open the supplied url.
  const action = event.action || "open";

  const baseUrl = event.notification.data?.url || "/";

  if (action === "snooze") {
    // Pull the job id out of the deep link (`/jobs/{id}`). If we can't
    // parse one, just close — there's nothing meaningful to snooze.
    let jobId = null;
    try {
      const u = new URL(baseUrl, self.location.origin);
      const match = u.pathname.match(/^\/jobs\/(\d+)/);
      if (match) jobId = parseInt(match[1], 10);
    } catch {}
    if (!jobId) return;
    event.waitUntil(
      fetch("/api/reminders/snooze", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, type: "missing_otw" }),
      }).catch(() => {})
    );
    return;
  }

  // Default ("open"): strip any ?action=... so tapping the body never
  // triggers a side-effect (e.g. accidental payment release).
  // Action buttons explicitly opt-in by adding the right ?action= param.
  let target = baseUrl;
  try {
    const u = new URL(baseUrl, self.location.origin);
    u.searchParams.delete("action");
    if (action === "on_the_way") {
      u.searchParams.set("action", "on_the_way");
    } else if (action === "release_payment") {
      u.searchParams.set("action", "release");
    }
    target = u.pathname + (u.search ? u.search : "") + u.hash;
  } catch {
    target = baseUrl;
  }

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});
