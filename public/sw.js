// Service worker de RÉCORD: guarda la app (no los datos) para que abra sin señal.
// La API nunca pasa por acá: los datos y las cargas pendientes los maneja la app (src/client/lib/offline.ts).
const BUILD = "__BUILD__";
const SHELL = `record-shell-${BUILD}`;

async function precache() {
  const cache = await caches.open(SHELL);
  const res = await fetch("/", { cache: "no-store" });
  if (!res.ok) return;
  const html = await res.clone().text();
  await cache.put("/", res);
  const urls = new Set(["/logo.png", "/favicon.svg", "/manifest.json", "/icon-192.png", "/icon-512.png"]);
  for (const m of html.matchAll(/(?:src|href)="(\/[^"]+)"/g)) urls.add(m[1]);
  // Las fuentes las pide el CSS: se buscan adentro para tenerlas desde la primera visita.
  for (const url of [...urls].filter((u) => u.endsWith(".css"))) {
    try {
      const css = await (await fetch(url)).text();
      for (const m of css.matchAll(/url\((\/assets\/[^)]+)\)/g)) urls.add(m[1]);
    } catch {
      // Se cachea cuando se use.
    }
  }
  await Promise.all([...urls].filter((u) => !u.startsWith("/api")).map((u) => cache.add(u).catch(() => undefined)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith("record-shell-") && key !== SHELL) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  // Páginas: primero la red (así llegan las versiones nuevas) y, sin señal, la app guardada.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok) (await caches.open(SHELL)).put("/", res.clone());
          return res;
        } catch {
          return (await caches.match("/")) ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Archivos de la app: tienen el hash en el nombre, así que lo guardado nunca queda viejo.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      (async () => {
        const hit = await caches.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) (await caches.open(SHELL)).put(req, res.clone());
        return res;
      })(),
    );
    return;
  }

  // Logo, íconos y manifiesto: lo guardado al instante y se actualiza por detrás.
  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL);
      const hit = await cache.match(req);
      const fresh = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => hit ?? Response.error());
      return hit ?? fresh;
    })(),
  );
});
