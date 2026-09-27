/**
 * Monitriq's service worker (served at /sw.js by app/sw.js/route.ts). Its job
 * is deliberately narrow and SAFE for private financial data:
 *
 *  - It NEVER stores HTML pages, RSC payloads, API or Supabase responses, auth
 *    or profile traffic, cookies or tokens. Only an allowlist of public,
 *    non-personal resources is ever written to a cache:
 *      /offline                (the branded offline page, precached)
 *      /_next/static/*         (immutable, content-hashed build assets; cache-first)
 *      /brand/*                (public logos and icons; stale-while-revalidate)
 *  - Page navigations are network-only. If the network is unavailable the
 *    branded offline page is shown instead: an honest "reconnect to refresh
 *    your financial information", never stale balances.
 *  - Everything else (cross-origin requests such as Supabase, non-GET, fetches
 *    for data or RSC, the auth callback) is not intercepted at all.
 *  - No skipWaiting on install: a new worker waits until the user chooses
 *    Refresh in the app, so an in-progress form is never interrupted.
 *
 * The version below changes with every deployment, so each deployment yields a
 * new worker (and a new set of cache names); old caches are deleted on activate.
 */
export function buildServiceWorker(version: string): string {
  const safe = version.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 64) || "dev";
  return `/* Monitriq service worker ${safe} — generated; see lib/pwa/service-worker.ts */
const VERSION = ${JSON.stringify(safe)};
const PREFIX = "monitriq-";
const STATIC_CACHE = PREFIX + "static-" + VERSION;
const SHELL_CACHE = PREFIX + "shell-" + VERSION;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" }))));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== STATIC_CACHE && k !== SHELL_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

function classify(request) {
  if (request.method !== "GET") return "network";
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return "network";
  if (request.mode === "navigate") return "navigate";
  if (url.pathname.startsWith("/_next/static/")) return "static";
  if (url.pathname.startsWith("/brand/")) return "brand";
  return "network";
}

function cacheable(response) {
  return response && response.ok && response.type === "basic";
}

self.addEventListener("fetch", (event) => {
  const kind = classify(event.request);
  if (kind === "network") return;

  if (kind === "navigate") {
    event.respondWith(
      fetch(event.request).catch(async () => (await caches.match(OFFLINE_URL)) || new Response("You are offline. Reconnect to refresh your financial information.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } })),
    );
    return;
  }

  if (kind === "static") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const hit = await cache.match(event.request);
        if (hit) return hit;
        const response = await fetch(event.request);
        if (cacheable(response)) cache.put(event.request, response.clone());
        return response;
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      const hit = await cache.match(event.request);
      const refresh = fetch(event.request).then((response) => {
        if (cacheable(response)) cache.put(event.request, response.clone());
        return response;
      });
      if (hit) {
        refresh.catch(() => {});
        return hit;
      }
      return refresh;
    })(),
  );
});
`;
}

/** The deployment identity that versions the worker. Vercel provides these at build time; local builds use "dev". */
export function deploymentVersion(env: Record<string, string | undefined>): string {
  return [env.VERCEL_GIT_COMMIT_SHA, env.VERCEL_DEPLOYMENT_ID].filter(Boolean).join("-") || "dev";
}
