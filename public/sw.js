const CACHE_NAME = "organic-vegetables-v3";
const APP_SHELL = "/";
const PRECACHE = [
  "/",
  "/manifest.webmanifest",
  "/css/styles.css",
  "/css/base.css",
  "/css/home.css",
  "/css/dialogs.css",
  "/css/checkout.css",
  "/css/orders.css",
  "/css/admin.css",
  "/css/responsive.css",
  "/js/app.js",
  "/js/api.js",
  "/js/utils.js",
  "/js/ui.js",
  "/js/views.js",
  "/js/payments.js",
  "/assets/logo.svg",
  "/assets/favicon.svg",
  "/favicon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/images/placeholder.svg",
  "/images/tomatoes.jpg",
  "/images/spinach.jpg",
  "/images/carrots.jpg",
  "/images/broccoli.jpg",
  "/images/peppers.jpg",
  "/images/cucumbers.jpg",
  "/images/onions.jpg",
  "/images/lettuce.jpg",
  "/images/potatoes.jpg",
  "/images/market.jpg",
  "/vendor/leaflet/leaflet.js",
  "/vendor/leaflet/leaflet.css",
  "/vendor/leaflet/images/layers.png",
  "/vendor/leaflet/images/layers-2x.png",
  "/vendor/leaflet/images/marker-icon.png",
  "/vendor/leaflet/images/marker-icon-2x.png",
  "/vendor/leaflet/images/marker-shadow.png"
];

const isStaticAsset = (pathname) =>
  /\.(?:css|js|mjs|png|jpe?g|webp|gif|svg|ico|woff2?|json|webmanifest)$/i.test(pathname);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request, fallback = null) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (fallback) {
      const shell = await cache.match(fallback);
      if (shell) return shell;
    }
    return new Response("Offline. Reconnect to continue.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) void cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || (await network) || new Response("", { status: 504 });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname === "/sw.js") return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, APP_SHELL));
    return;
  }

  if (!isStaticAsset(url.pathname)) return;

  if (/\.(?:css|js|mjs)$/i.test(url.pathname)) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});
