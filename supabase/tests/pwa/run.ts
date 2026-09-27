/**
 * PWA installability + safe service worker (P0-E6-S1). No database needed.
 * The service worker is executed in a Node `vm` sandbox with a fake network
 * and fake Cache Storage, so these tests observe REAL caching behaviour
 * (what is stored, what is served, what is never touched) rather than
 * matching source strings.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import vm from "node:vm";
import { TestRunner, assert } from "../shared/assert.ts";
import { buildManifest } from "../../../lib/pwa/manifest.ts";
import { buildServiceWorker, deploymentVersion } from "../../../lib/pwa/service-worker.ts";
import { detectPlatform, installOffer, isInAppBrowser, isStandalone } from "../../../lib/pwa/install.ts";
import { INSTALL_ACTION, INSTALL_HELP, INSTALL_TITLE, IOS_INSTALL_STEPS, OFFLINE_MESSAGE, UPDATE_ACTION, UPDATE_MESSAGE } from "../../../lib/pwa/messages.ts";
import { themeColors } from "../../../lib/config/site.ts";
import { DRAWER_SECTIONS, PRIMARY_AFTER_ADD, PRIMARY_BEFORE_ADD } from "../../../components/layout/nav-items.ts";
import { LANGUAGE_MODES } from "../../../lib/domain/language/types.ts";

const ORIGIN = "https://app.test";
const src = (f: string) => readFileSync(f, "utf8");
const code = (f: string) => src(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
const pngSize = (f: string) => {
  const b = readFileSync(f);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};

// ---------- service-worker sandbox ----------
type Handler = (event: unknown) => void;
function basic(body: string, status = 200): Response {
  const r = new Response(body, { status });
  Object.defineProperty(r, "type", { value: "basic" });
  return r;
}
function sandbox(version: string, network: (url: string) => Response | Promise<Response>) {
  const handlers: Record<string, Handler> = {};
  const store = new Map<string, Map<string, Response>>();
  const requested: string[] = [];
  const state = { skipped: false, claimed: false, offline: false };
  const keyOf = (r: string | { url: string }) => new URL(typeof r === "string" ? r : r.url, ORIGIN).href;
  const fetchImpl = async (r: string | { url: string }) => {
    requested.push(keyOf(r));
    if (state.offline) throw new TypeError("network unavailable");
    return network(keyOf(r));
  };
  const cacheApi = {
    open: async (name: string) => {
      if (!store.has(name)) store.set(name, new Map());
      const m = store.get(name)!;
      return {
        match: async (r: { url: string }) => m.get(keyOf(r))?.clone(),
        put: async (r: { url: string }, res: Response) => void m.set(keyOf(r), res),
        add: async (r: { url: string }) => void m.set(keyOf(r), await fetchImpl(r)),
      };
    },
    keys: async () => [...store.keys()],
    delete: async (n: string) => store.delete(n),
    match: async (r: { url: string }) => {
      for (const m of store.values()) {
        const hit = m.get(keyOf(r));
        if (hit) return hit.clone();
      }
      return undefined;
    },
  };
  class Req extends Request {
    constructor(u: string, i?: RequestInit) {
      super(new URL(u, ORIGIN).href, i);
    }
  }
  const self = {
    addEventListener: (t: string, f: Handler) => void (handlers[t] = f),
    location: { origin: ORIGIN },
    clients: { claim: async () => void (state.claimed = true) },
    skipWaiting: () => void (state.skipped = true),
  };
  const ctx = vm.createContext({ self, caches: cacheApi, fetch: fetchImpl, Request: Req, Response, URL, Promise });
  vm.runInContext(buildServiceWorker(version), ctx);
  const waitable = async (t: string, extra: Record<string, unknown> = {}) => {
    let p: Promise<unknown> = Promise.resolve();
    handlers[t]({ waitUntil: (x: Promise<unknown>) => void (p = x), ...extra });
    await p;
  };
  return {
    state, store, requested, handlers,
    install: () => waitable("install"),
    activate: () => waitable("activate"),
    message: (data: unknown) => handlers.message({ data }),
    /** null = the worker did not intercept the request (the browser goes straight to the network). */
    async fetchEvent(req: { url: string; method?: string; mode?: string }): Promise<Response | null> {
      let responded: Promise<Response> | null = null;
      handlers.fetch({ request: { method: "GET", mode: "cors", ...req }, respondWith: (p: Promise<Response>) => void (responded = p) });
      return responded ? await responded : null;
    },
    cachedUrls: () => [...store.values()].flatMap((m) => [...m.keys()]),
  };
}
const app = (path: string) => `${ORIGIN}${path}`;

async function main() {
  const runner = new TestRunner();
  console.log("Monitriq PWA installability + safe service worker\n");

  // ---------------- MANIFEST ----------------
  await runner.run("1-5 manifest: Monitriq / Monitriq, start_url /, scope /, standalone, canonical brand colours", async () => {
    const m = buildManifest();
    assert(m.name === "Monitriq" && m.short_name === "Monitriq", "name and short_name");
    assert(m.start_url === "/" && m.scope === "/" && m.id === "/" && m.display === "standalone", "start_url, scope, id, display");
    assert(m.description === "Know today. Go further.", "approved product copy");
    const tokens = src("docs/reference/brand/brand-tokens.css");
    const token = (name: string) => tokens.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1].toLowerCase();
    assert(m.background_color.toLowerCase() === token("monitriq-obsidian") && m.theme_color.toLowerCase() === token("monitriq-obsidian"), "manifest colours are the canonical dark app background token");
    assert(themeColors.light.toLowerCase() === token("monitriq-warm-off-white") && themeColors.dark.toLowerCase() === token("monitriq-obsidian"), "theme colours follow the brand tokens");
    assert(!("orientation" in m), "orientation is not locked");
  });

  await runner.run("6 icons: 192, 512 and a maskable 512 exist on disk with the declared dimensions; Apple touch icon is 180x180", async () => {
    const m = buildManifest();
    const sizes = m.icons.map((i) => `${i.sizes}:${i.purpose}`).join();
    assert(sizes === "192x192:any,512x512:any,512x512:maskable", sizes);
    for (const icon of m.icons) {
      const file = `public${icon.src}`;
      assert(existsSync(file), `${file} missing`);
      const { w, h } = pngSize(file);
      assert(`${w}x${h}` === icon.sizes && icon.type === "image/png", `${file} is ${w}x${h}`);
    }
    const apple = pngSize("public/brand/apple-touch-icon-180.png");
    assert(apple.w === 180 && apple.h === 180, "apple-touch-icon-180");
    for (const f of ["public/brand/favicon-32.png", "public/brand/favicon-64.png"]) assert(existsSync(f), `${f}`);
    assert(existsSync("scripts/generate-pwa-icons.py"), "icon derivatives are reproducible from the approved 1024px original");
  });

  await runner.run("7 no obsolete Monatriq branding in the PWA surfaces, icon files or manifest", async () => {
    const files = ["lib/pwa/manifest.ts", "lib/pwa/service-worker.ts", "lib/pwa/messages.ts", "app/layout.tsx", "app/manifest.ts", "app/offline/page.tsx", "components/pwa/PwaRuntime.tsx", "components/pwa/InstallSection.tsx"];
    for (const f of files) assert(!/monatriq/i.test(src(f)), `${f} mentions the old name`);
    assert(!walk("public").some((f) => /monatriq/i.test(f)), "no old-name asset in public/");
    assert(!/monatriq/i.test(JSON.stringify(buildManifest())), "manifest");
  });

  await runner.run("iOS / Apple + viewport metadata: apple-touch icon, web-app capable, title, status bar, viewport-fit=cover, theme colours", async () => {
    const layout = src("app/layout.tsx");
    assert(/apple-touch-icon-180\.png/.test(layout) && /appleWebApp:\s*\{[^}]*capable:\s*true[^}]*title:\s*siteConfig\.name/.test(layout), "apple web app metadata");
    assert(/"mobile-web-app-capable":\s*"yes"/.test(layout), "modern mobile-web-app-capable");
    assert(/viewportFit:\s*"cover"/.test(layout), "safe-area insets are real");
    assert(/themeColors\.light/.test(layout) && /themeColors\.dark/.test(layout) && /colorScheme:\s*"light dark"/.test(layout), "light and dark theme colours; system mode preserved");
    assert(!/forcedTheme|defaultTheme="dark"/.test(src("components/theme/ThemeProvider.tsx")), "installing never forces dark mode");
  });

  // ---------------- SERVICE WORKER: REAL BEHAVIOUR ----------------
  const routes = (url: string): Response => {
    if (url.endsWith("/offline")) return basic("<html>offline page</html>");
    if (url.includes("/_next/static/")) return basic("chunk");
    if (url.includes("/brand/")) return basic("png");
    return basic("SECRET-BALANCE NGN 850,200");
  };

  await runner.run("8 installs by precaching ONLY the public offline page, and never skips waiting on its own (no mid-form interruption)", async () => {
    const sw = sandbox("v1", routes);
    await sw.install();
    assert(sw.cachedUrls().join() === app("/offline"), `precached: ${sw.cachedUrls().join()}`);
    assert(!sw.state.skipped, "install must not skipWaiting");
    sw.message({ type: "SKIP_WAITING" });
    assert(Boolean(sw.state.skipped), "only the user's Refresh (a message) activates the new worker");
    sw.message({ type: "SOMETHING_ELSE" });
  });

  await runner.run("12 authenticated pages are NEVER cached: navigations go to the network, and their HTML/data is never stored", async () => {
    const sw = sandbox("v1", routes);
    await sw.install();
    for (const path of ["/home", "/money", "/budget", "/goals", "/liabilities", "/receivables", "/assets", "/spending-check", "/decisions", "/financial-position", "/rules"]) {
      const res = await sw.fetchEvent({ url: app(path), mode: "navigate" });
      assert(res !== null && (await res.text()) === "SECRET-BALANCE NGN 850,200", `${path} served fresh from the network`);
    }
    assert(sw.cachedUrls().join() === app("/offline"), `nothing else was stored: ${sw.cachedUrls().join()}`);
  });

  await runner.run("10/11 offline: a navigation shows the branded offline page instead of stale balances; nothing personal is ever served from a cache", async () => {
    const sw = sandbox("v1", routes);
    await sw.install();
    await sw.fetchEvent({ url: app("/home"), mode: "navigate" });
    sw.state.offline = true;
    const res = await sw.fetchEvent({ url: app("/home"), mode: "navigate" });
    const body = await res!.text();
    assert(body.includes("offline page") && !body.includes("SECRET-BALANCE"), `offline body: ${body}`);
    const empty = sandbox("v1", routes);
    empty.state.offline = true;
    const fallback = await empty.fetchEvent({ url: app("/money"), mode: "navigate" });
    assert(fallback!.status === 503 && /You are offline\. Reconnect to refresh your financial information\./.test(await fallback!.text()), "honest fallback even without the precached page");
  });

  await runner.run("12 private data traffic is not intercepted at all: Supabase and other origins, non-GET, RSC/data fetches, API and auth routes", async () => {
    const sw = sandbox("v1", routes);
    await sw.install();
    const cases: { url: string; method?: string; mode?: string }[] = [
      { url: "https://abc.supabase.co/rest/v1/profiles?select=*" },
      { url: "https://abc.supabase.co/auth/v1/token?grant_type=password", method: "POST" },
      { url: "https://abc.supabase.co/rest/v1/rpc/budget_summary", method: "POST" },
      { url: app("/home?_rsc=abc123") },
      { url: app("/money?_rsc=xyz"), mode: "same-origin" },
      { url: app("/api/anything") },
      { url: app("/auth/callback?code=1") },
      { url: app("/budget"), method: "POST" },
      { url: "https://fonts.example.com/font.woff2" },
    ];
    for (const c of cases) assert((await sw.fetchEvent(c)) === null, `${c.method ?? "GET"} ${c.url} must not be intercepted`);
    assert(sw.cachedUrls().join() === app("/offline") && sw.requested.every((u) => u.endsWith("/offline")), "no cache write and no network call made by the worker for any of them");
  });

  await runner.run("9/10 only public build assets are cached: hashed /_next/static chunks (cache-first) and /brand icons (stale-while-revalidate)", async () => {
    let chunkHits = 0;
    const sw = sandbox("v1", (u) => {
      if (u.includes("/_next/static/")) chunkHits++;
      return routes(u);
    });
    await sw.install();
    const a = await sw.fetchEvent({ url: app("/_next/static/chunks/app-1a2b.js") });
    const b = await sw.fetchEvent({ url: app("/_next/static/chunks/app-1a2b.js") });
    assert((await a!.text()) === "chunk" && (await b!.text()) === "chunk" && chunkHits === 1, `static chunk fetched once then served from cache (network hits ${chunkHits})`);
    await sw.fetchEvent({ url: app("/brand/monitriq-app-icon-192.png") });
    assert(sw.cachedUrls().includes(app("/brand/monitriq-app-icon-192.png")), "brand icon cached");
    const allowed = /\/offline$|\/_next\/static\/|\/brand\//;
    assert(sw.cachedUrls().every((u) => allowed.test(u)), `cache holds only allowlisted public URLs: ${sw.cachedUrls().join(", ")}`);
    const bad = sandbox("v1", () => basic("boom", 500));
    await bad.install().catch(() => undefined);
    await bad.fetchEvent({ url: app("/_next/static/chunks/err.js") });
    assert(!bad.cachedUrls().some((u) => u.includes("err.js")), "failed responses are never cached");
  });

  await runner.run("13/update strategy: each deployment gets its own worker version and cache names; old caches are removed on activate; the app version is identifiable", async () => {
    const v1 = sandbox("abc123-dpl_1", routes);
    await v1.install();
    await v1.fetchEvent({ url: app("/_next/static/chunks/x.js") });
    assert([...v1.store.keys()].every((k) => k.includes("abc123-dpl_1") && k.startsWith("monitriq-")), [...v1.store.keys()].join());
    const v2 = sandbox("def456-dpl_2", routes);
    for (const [name, m] of v1.store) v2.store.set(name, m); // the browser keeps caches across worker versions
    v2.store.set("some-other-app-cache", new Map());
    await v2.install();
    await v2.activate();
    const keys = [...v2.store.keys()].sort();
    assert(keys.join() === ["monitriq-shell-def456-dpl_2", "some-other-app-cache"].join(), `old monitriq caches deleted, unrelated caches untouched: ${keys.join()}`);
    assert(Boolean(v2.state.claimed), "new worker claims clients on activate");
    assert(buildServiceWorker("a") !== buildServiceWorker("b"), "different deployments produce different worker bytes (that is what triggers an update)");
    assert(deploymentVersion({ VERCEL_GIT_COMMIT_SHA: "abc", VERCEL_DEPLOYMENT_ID: "dpl_9" }) === "abc-dpl_9" && deploymentVersion({}) === "dev", "version comes from the Vercel build environment");
    assert(!/SUPABASE|SERVICE_ROLE|process\.env|localStorage|indexedDB/i.test(buildServiceWorker("x")), "no secrets, env or client storage inside the worker");
    const route = src("app/sw.js/route.ts");
    assert(/force-static/.test(route) && /no-cache, no-store, must-revalidate/.test(route) && /application\/javascript/.test(route), "the worker file is served fresh with the right type");
  });

  await runner.run("no persistence of financial data offline: no IndexedDB / localStorage / Cache writes of user data anywhere in the PWA code", async () => {
    const pwaFiles = [...walk("lib/pwa"), ...walk("components/pwa"), "app/offline/page.tsx", "app/sw.js/route.ts"];
    for (const f of pwaFiles) assert(!/indexedDB|localStorage|sessionStorage|openDatabase/.test(src(f)), `${f}: client storage`);
    assert(!/lib\/domain|supabase/i.test(pwaFiles.map(code).join("\n")), "PWA code imports no financial domain or Supabase code");
  });

  // ---------------- INSTALL EXPERIENCE ----------------
  const UA = {
    iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    ipadDesktopUa: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
    desktop: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    instagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0",
  };

  await runner.run("8/9 install experience: platform detection, standalone detection, and who sees what", async () => {
    assert(detectPlatform({ userAgent: UA.iphone }) === "ios" && detectPlatform({ userAgent: UA.ipadDesktopUa, platform: "MacIntel", maxTouchPoints: 5 }) === "ios" && detectPlatform({ userAgent: UA.ipadDesktopUa, platform: "MacIntel", maxTouchPoints: 0 }) === "desktop", "iOS / iPadOS vs a real Mac");
    assert(detectPlatform({ userAgent: UA.android }) === "android" && detectPlatform({ userAgent: UA.desktop }) === "desktop", "android and desktop");
    assert(isStandalone({ matchesStandalone: true }) && isStandalone({ matchesStandalone: false, iosStandalone: true }) && !isStandalone({ matchesStandalone: false }), "standalone detection (display-mode and iOS navigator.standalone)");
    const offer = (p: Parameters<typeof installOffer>[0]) => installOffer(p);
    assert(offer({ standalone: true, platform: "ios", hasPrompt: true, inAppBrowser: false }) === "none" && offer({ standalone: true, platform: "android", hasPrompt: true, inAppBrowser: false }) === "none", "never shown when already running standalone");
    assert(offer({ standalone: false, platform: "android", hasPrompt: true, inAppBrowser: false }) === "prompt" && offer({ standalone: false, platform: "desktop", hasPrompt: true, inAppBrowser: false }) === "prompt", "Chromium install prompt only when the browser exposes it");
    assert(offer({ standalone: false, platform: "android", hasPrompt: false, inAppBrowser: false }) === "none" && offer({ standalone: false, platform: "desktop", hasPrompt: false, inAppBrowser: false }) === "none", "no iPhone guidance and no fake prompt on Android/desktop");
    assert(offer({ standalone: false, platform: "ios", hasPrompt: false, inAppBrowser: false }) === "ios_guide", "iPhone/iPad get Add to Home Screen guidance");
    assert(offer({ standalone: false, platform: "ios", hasPrompt: false, inAppBrowser: true }) === "none" && isInAppBrowser(UA.instagram) && !isInAppBrowser(UA.iphone), "in-app browsers cannot install, so no guidance there");
    assert(!/android|chrome/i.test(IOS_INSTALL_STEPS) && /Share/.test(IOS_INSTALL_STEPS) && /Add to Home Screen/.test(IOS_INSTALL_STEPS), "iOS wording is iOS-only");
  });

  await runner.run("install entry point is secondary: only in the profile menu (not Home), with the approved wording", async () => {
    assert(INSTALL_TITLE === "Install Monitriq" && INSTALL_ACTION === "Install Monitriq" && INSTALL_HELP === "Add Monitriq to your device for quicker access.", "copy");
    assert(/<InstallSection/.test(src("components/layout/AccountMenu.tsx")), "profile menu hosts it");
    for (const f of ["app/(app)/home/page.tsx", "components/home/PositionSection.tsx", "components/home/SpendingCheckCard.tsx", "components/layout/AppShell.tsx"]) assert(!/InstallSection|beforeinstallprompt/.test(src(f)), `${f}: no install banner outside the profile menu`);
    const section = src("components/pwa/InstallSection.tsx");
    assert(/min-h-12/.test(section) && /aria-hidden="true"/.test(section), "48px target; icons are decorative next to text labels");
  });

  await runner.run("offline and update states: honest copy, announced to assistive technology, never auto-reloading", async () => {
    assert(OFFLINE_MESSAGE === "You’re offline. Reconnect to refresh your financial information." && UPDATE_MESSAGE === "An update is available." && UPDATE_ACTION === "Refresh", "copy");
    const rt = src("components/pwa/PwaRuntime.tsx");
    assert((rt.match(/role="status"/g) ?? []).length === 2 && /aria-live="polite"/.test(rt), "offline and update notices are live regions");
    assert(/postMessage\(\{ type: "SKIP_WAITING" \}\)/.test(rt) && /onClick=\{applyUpdate\}/.test(rt) && !/reload\(\)[^;]*\n?[^}]*useEffect/.test(rt.split("applyUpdate")[0]), "the update is applied only when the user presses Refresh");
    assert(/process\.env\.NODE_ENV === "production"/.test(rt) && /updateViaCache: "none"/.test(rt), "registered in production only, with fresh update checks");
    const offline = src("app/offline/page.tsx");
    assert(/OFFLINE_MESSAGE/.test(offline) && /robots/.test(offline), "offline page shows the message and is not indexed");
    assert(/dynamic\(\(\) => import\("@\/components\/pwa\/PwaRuntime"\), \{ ssr: false \}\)/.test(src("components/pwa/PwaLoader.tsx")), "PWA runtime is code-split off the initial bundle");
  });

  await runner.run("13/14/15 no auth or navigation or language regression: session clients/profile/language/migrations untouched, proxy change limited to public PWA paths, navigation and language modes unchanged", async () => {
    const dirty = execSync("git status --porcelain -- lib/supabase app/onboarding lib/domain/profile lib/domain/language supabase/migrations", { encoding: "utf8" }).trim();
    assert(dirty === "", `session/profile/language/migration files changed:\n${dirty}`);
    const diff = execSync("git diff -U0 -- proxy.ts", { encoding: "utf8" }).split("\n").filter((l) => /^[+-][^+-]/.test(l));
    assert(diff.length === 0 || (diff.length === 2 && diff.every((l) => /sw\\\.js|manifest\.webmanifest/.test(l)) && !/cookies|getUser/.test(diff.join())), `proxy diff: ${diff.join(" | ")}`);
    const proxy = src("proxy.ts");
    assert(/sw\\\\\.js\$/.test(proxy) && /offline\(\?:\/\|\$\)/.test(proxy) && /manifest\.webmanifest/.test(proxy), "the worker and offline page bypass the session refresh (no Set-Cookie on cached resources)");
    assert([...PRIMARY_BEFORE_ADD, ...PRIMARY_AFTER_ADD].map((i) => i.label).join() === "Home,Money,Budget,Goals" && DRAWER_SECTIONS.flatMap((s) => s.items.map((i) => i.href)).join() === "/assets,/liabilities,/receivables,/decisions,/financial-position,/rules", "navigation unchanged");
    assert(LANGUAGE_MODES.join() === "simple,balanced,financial" && !/financial_language_mode|languageMode/i.test(JSON.stringify(buildManifest()) + buildServiceWorker("x")), "one manifest and one worker for every language mode");
    assert(!/SUPABASE|service_role/i.test([...walk("lib/pwa"), ...walk("components/pwa"), "app/manifest.ts", "app/sw.js/route.ts"].map(code).join("\n")), "no Supabase keys or service-role references in PWA code");
  });

  await runner.run("safe areas and mobile viewport: real insets enabled, header/nav/pages honour them, dynamic viewport units, no page-level overflow hiding, scrollbar chrome hidden on mobile", async () => {
    const shell = src("components/layout/AppShell.tsx");
    assert(/min-h-dvh/.test(shell) && /safe-area-inset-top/.test(shell + src("components/layout/ShellHeader.tsx")) && /safe-area-inset-bottom/.test(shell + src("components/layout/MobileBottomNav.tsx")), "top/bottom insets and dvh");
    assert(/safe-area-inset-left/.test(src("components/layout/PageContainer.tsx")) && /safe-area-inset-right/.test(src("components/layout/PageContainer.tsx")) && /safe-area-inset-left/.test(src("components/layout/MobileBottomNav.tsx")), "landscape notch insets");
    const css = src("app/globals.css");
    assert(!/(?:^|\n)\s*(?:html|body)\s*\{[^}]*overflow:\s*hidden/.test(css) && /@media \(max-width: 767\.98px\)[\s\S]*scrollbar-width: none/.test(css), "no global overflow:hidden; mobile scrollbar chrome hidden");
    assert(!/(?:^|[^-])\b100vh\b/.test(walk("components").concat(walk("app").filter((f) => /\.(tsx|css)$/.test(f))).map(src).join("\n").replace(/max-h-\[9\dvh\]|max-h-\[85vh\]|max-h-\[90vh\]/g, "")), "no 100vh layouts (dynamic viewport units instead)");
  });

  const s = runner.summary();
  console.log(`\n${s.passed}/${s.total} passed`);
  if (s.failed > 0) {
    for (const r of s.results.filter((r) => !r.passed)) console.error(`  - ${r.name}: ${r.error}`);
    process.exitCode = 1;
  }
}
main().catch((e) => { console.error("PWA suite crashed:", e); process.exitCode = 1; });
