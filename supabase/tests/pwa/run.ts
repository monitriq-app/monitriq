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
import { INSTALL_PROMPT_DISMISS_KEY, INSTALL_PROMPT_REMINDER_MS, INSTALL_PROMPT_SHOW_DELAY_MS, shouldShowInstallPrompt } from "../../../lib/pwa/install-prompt.ts";
import {
  INSTALL_ACTION,
  INSTALL_BANNER_BODY,
  INSTALL_BANNER_INSTALL,
  INSTALL_BANNER_NOT_NOW,
  INSTALL_BANNER_TITLE,
  INSTALL_HELP,
  INSTALL_TITLE,
  IOS_INSTALL_STEPS,
  IOS_SHEET_DISMISS,
  IOS_SHEET_FOOTER,
  IOS_SHEET_STEPS,
  IOS_SHEET_TITLE,
  OFFLINE_MESSAGE,
  UPDATE_ACTION,
  UPDATE_MESSAGE,
} from "../../../lib/pwa/messages.ts";
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

  await runner.run("no persistence of financial data offline: no IndexedDB / Cache writes of user data, and the ONE permitted localStorage use holds only a bare install-prompt-dismissal timestamp (P0-E6-S1R3 section 20)", async () => {
    const pwaFiles = [...walk("lib/pwa"), ...walk("components/pwa"), "app/offline/page.tsx", "app/sw.js/route.ts"];
    const STORAGE_ALLOWLIST = new Set(["lib/pwa/install-prompt-store.ts"]);
    for (const f of pwaFiles) {
      assert(!/indexedDB|openDatabase/.test(src(f)), `${f}: IndexedDB is never permitted`);
      if (STORAGE_ALLOWLIST.has(f)) continue;
      assert(!/localStorage|sessionStorage/.test(code(f)), `${f}: client storage outside the one allowlisted dismissal-timestamp module`);
    }
    const dismissalStore = src("lib/pwa/install-prompt-store.ts");
    assert(!/sessionStorage/.test(dismissalStore), "only localStorage is used, for the cross-visit reminder; the in-tab flag is a plain module variable");
    assert(/localStorage\.setItem\(INSTALL_PROMPT_DISMISS_KEY, String\(Date\.now\(\)\)\)/.test(dismissalStore), "the only value ever written is a bare epoch-millisecond timestamp");
    assert(!/\bbalance|\bbudget|\baccount\b|\bsession\b|\btoken\b|\bemail\b|user_id|supabase/i.test(code("lib/pwa/install-prompt-store.ts") + code("lib/pwa/install-prompt.ts")), "no financial, identity or auth data anywhere near the dismissal storage");
    assert(!/lib\/domain|supabase/i.test(pwaFiles.map(code).join("\n")), "PWA code imports no financial domain or Supabase code");
  });

  // ---------------- INSTALL EXPERIENCE ----------------
  const UA = {
    iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    ipadDesktopUa: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
    desktop: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    instagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0",
    // Real iOS third-party browser UAs (P0-E6-S1R1): Apple requires every iOS
    // browser to run on WebKit, so each still identifies as an iPhone/iPad and
    // reaches Add to Home Screen through the same OS Share sheet as Safari.
    iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.6422.80 Mobile/15E148 Safari/604.1",
    iphoneFirefox: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/126.0 Mobile/15E148 Safari/605.1.15",
    iphoneEdge: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 EdgiOS/125.2535.85 Mobile/15E148 Safari/605.1.15",
    ipadChrome: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.6422.80 Mobile/15E148 Safari/604.1",
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

  await runner.run("P0-E6-S1R1: iOS install guidance is a per-DEVICE decision, not Safari-only — Chrome/Firefox/Edge on iPhone and iPad get it too", async () => {
    for (const [name, ua] of Object.entries({ "Chrome iPhone (CriOS)": UA.iphoneChrome, "Firefox iPhone (FxiOS)": UA.iphoneFirefox, "Edge iPhone (EdgiOS)": UA.iphoneEdge })) {
      assert(detectPlatform({ userAgent: ua }) === "ios", `${name} must be detected as iOS`);
      assert(installOffer({ standalone: false, platform: detectPlatform({ userAgent: ua }), hasPrompt: false, inAppBrowser: isInAppBrowser(ua) }) === "ios_guide", `${name} must be offered ios_guide, not "none"`);
    }
    // iPad Chrome presents the same iPadOS "Macintosh" UA as iPad Safari; only real touch support (not the browser name) tells it apart from a desktop Mac running Chrome.
    assert(detectPlatform({ userAgent: UA.ipadChrome, platform: "MacIntel", maxTouchPoints: 5 }) === "ios", "iPad Chrome (Mac UA + touch) must be detected as iOS");
    assert(installOffer({ standalone: false, platform: detectPlatform({ userAgent: UA.ipadChrome, platform: "MacIntel", maxTouchPoints: 5 }), hasPrompt: false, inAppBrowser: false }) === "ios_guide", "iPad Chrome gets Add to Home Screen guidance");
    assert(detectPlatform({ userAgent: UA.ipadChrome, platform: "MacIntel", maxTouchPoints: 0 }) === "desktop", "a real desktop Mac running Chrome must still be desktop, not ios");
    // Regressions this must keep true: standalone still hides it, in-app webviews still hide it, Android/desktop behaviour is untouched.
    assert(installOffer({ standalone: true, platform: "ios", hasPrompt: false, inAppBrowser: false }) === "none", "standalone iOS (any browser) still hides the guidance");
    assert(!isInAppBrowser(UA.iphoneChrome) && !isInAppBrowser(UA.iphoneFirefox) && !isInAppBrowser(UA.iphoneEdge), "real iOS browsers are never mistaken for an in-app webview");
    assert(isInAppBrowser(UA.instagram) && installOffer({ standalone: false, platform: "ios", hasPrompt: false, inAppBrowser: true }) === "none", "Instagram/Facebook-style in-app webviews on iOS still get no install UI");
    assert(installOffer({ standalone: false, platform: "android", hasPrompt: true, inAppBrowser: false }) === "prompt" && installOffer({ standalone: false, platform: "android", hasPrompt: false, inAppBrowser: false }) === "none", "Android behaviour is unchanged: beforeinstallprompt only");
    // Guard against a future regression back to browser-name sniffing.
    const installLogic = code("lib/pwa/install.ts");
    assert(!/Safari|CriOS|FxiOS|EdgiOS|Chrome/.test(installLogic), "install.ts must not gate on a specific iOS browser name outside comments");
  });

  await runner.run("install entry points: the top InstallBanner (primary) and the profile InstallSection (secondary fallback) are the only two, with the approved wording", async () => {
    assert(INSTALL_TITLE === "Install Monitriq" && INSTALL_ACTION === "Install Monitriq" && INSTALL_HELP === "Add Monitriq to your device for quicker access.", "profile fallback copy unchanged");
    assert(/<InstallSection/.test(src("components/layout/AccountMenu.tsx")), "profile menu hosts the fallback");
    assert(/<InstallBanner/.test(src("components/layout/AppShell.tsx")), "AppShell hosts the primary top banner, once, for the whole authenticated app");
    for (const f of ["app/(app)/home/page.tsx", "components/home/PositionSection.tsx", "components/home/SpendingCheckCard.tsx"]) assert(!/InstallSection|InstallBanner|beforeinstallprompt/.test(src(f)), `${f}: no page reimplements its own install UI outside the two shared entry points`);
    for (const f of ["components/pwa/InstallSection.tsx", "components/pwa/InstallBanner.tsx", "components/pwa/InstallInstructionsSheet.tsx"]) {
      const section = src(f);
      assert(/min-h-12/.test(section), `${f}: 48px touch target`);
    }
  });

  await runner.run("P0-E6-S1R2 temporary diagnostics fully removed (P0-E6-S1R3 section 21): no ?pwaDebug UI, no debug panel, no diagnostic console logging left behind", async () => {
    for (const f of [...walk("components/pwa"), ...walk("lib/pwa")]) {
      assert(!/pwaDebug/.test(src(f)), `${f}: leftover ?pwaDebug reference`);
      assert(!/TEMPORARY DIAGNOSTICS|InstallDiagnostics/.test(src(f)), `${f}: leftover diagnostics panel`);
    }
    assert(!/console\.log/.test(code("components/pwa/InstallSection.tsx")), "no diagnostic console logging left in the profile fallback");
    // The pure detection helpers themselves are exactly what a diagnostics tool would have used — keeping them is "keep only the pure internal helpers", not the removed user-visible panel.
    for (const fn of [detectPlatform, isInAppBrowser, isStandalone, installOffer]) assert(typeof fn === "function", "pure detection helper still exists and is exported");
  });

  // ---------------- P0-E6-S1R3: TOP INSTALL BANNER ----------------
  await runner.run("shouldShowInstallPrompt: eligibility, session suppression, standalone/in-app suppression (via offer), and the 7-day reminder", async () => {
    const base = { offer: "prompt" as const, dismissedAt: null, now: 1_000_000, sessionDismissed: false, ready: true };
    assert(shouldShowInstallPrompt(base) === true, "1/18 Android eligible + returning user: banner shows");
    assert(shouldShowInstallPrompt({ ...base, offer: "ios_guide" }) === true, "5/6/7 any eligible iOS browser: banner shows");
    assert(shouldShowInstallPrompt({ ...base, ready: false }) === false, "11 first-show delay: not yet ready");
    assert(shouldShowInstallPrompt({ ...base, offer: "none" }) === false, "12/13 offer=none already covers standalone AND in-app — no second detector needed here");
    assert(shouldShowInstallPrompt({ ...base, sessionDismissed: true }) === false, "11 session suppression: 'Not now' this tab session, no reload needed to hide it");
    assert(shouldShowInstallPrompt({ ...base, dismissedAt: base.now - 1 }) === false, "10 just dismissed: still within the reminder window");
    assert(shouldShowInstallPrompt({ ...base, dismissedAt: base.now - (INSTALL_PROMPT_REMINDER_MS - 1) }) === false, "10 one millisecond short of 7 days: still suppressed");
    assert(shouldShowInstallPrompt({ ...base, dismissedAt: base.now - INSTALL_PROMPT_REMINDER_MS }) === true, "10 exactly 7 days later: eligible again");
    assert(shouldShowInstallPrompt({ ...base, dismissedAt: base.now - INSTALL_PROMPT_REMINDER_MS - 1 }) === true, "10 well past 7 days: eligible again");
    assert(INSTALL_PROMPT_REMINDER_MS === 7 * 24 * 60 * 60 * 1000, "reminder delay is centralized at exactly 7 days and easy to change (one constant)");
    assert(INSTALL_PROMPT_SHOW_DELAY_MS >= 1000 && INSTALL_PROMPT_SHOW_DELAY_MS <= 2000, "11 first-show delay is the requested ~1-2s, not instant and not indefinite");
    assert(INSTALL_PROMPT_DISMISS_KEY === "monitriq_install_prompt_dismissed_at", "the exact, approved storage key");
  });

  await runner.run("InstallBanner: Android invokes the REAL native prompt (never a fake button), declining applies the normal reminder delay, accepting clears state", async () => {
    const banner = code("components/pwa/InstallBanner.tsx");
    assert(/prompt\.prompt\(\)/.test(banner) && /prompt\.userChoice/.test(banner), "2 calls the real deferred browser install prompt, then inspects the result");
    assert(/setDeferredInstallPrompt\(null\)/.test(banner), "4 clears the deferred prompt state after use, same as the profile fallback");
    assert(/outcome === "accepted"[\s\S]{0,40}markInstallPromptInstalled\(\)/.test(banner), "4 success: marks installed, never offered again this session");
    assert(/else[\s\S]{0,40}dismissInstallPromptForSession\(\)/.test(banner), "3 decline: dismissed politely with the normal 7-day reminder delay, not silently forgotten");
    assert(!/fetch\(.*install|new Notification|apk|App Store/i.test(banner), "never fakes an install channel that doesn't exist");
  });

  await runner.run("InstallBanner: iOS Install opens the instruction sheet, never a fake programmatic install", async () => {
    const banner = code("components/pwa/InstallBanner.tsx");
    assert(/offer === "ios_guide"[\s\S]{0,40}setSheetOpen\(true\)/.test(banner), "6/8 iOS Install opens the sheet instead of calling a native prompt that doesn't exist on iOS");
    assert(!/\.prompt\(\)/.test(banner.replace(/prompt\.prompt\(\)/, "")), "the native prompt() call only ever runs in the Android branch");
  });

  await runner.run("iOS instruction sheet: accessible dialog, the approved concise steps, Escape support, and Got it", async () => {
    assert(IOS_SHEET_TITLE === "Install Monitriq" && IOS_SHEET_DISMISS === "Got it", "copy");
    assert(IOS_SHEET_STEPS.length === 3 && /Share/.test(IOS_SHEET_STEPS[0]) && /Add to Home Screen/.test(IOS_SHEET_STEPS[1]) && /Add/.test(IOS_SHEET_STEPS[2]), "6 concise numbered steps, not a screenshot-heavy flow");
    assert(/Then launch Monitriq from the new Home Screen icon\./.test(IOS_SHEET_FOOTER), "footer copy");
    const sheet = src("components/pwa/InstallInstructionsSheet.tsx");
    assert(/role="dialog"/.test(sheet) && /aria-modal="true"/.test(sheet) && /aria-labelledby="install-sheet-title"/.test(sheet), "19 accessible title, real dialog semantics");
    assert(/event\.key === "Escape"/.test(sheet), "19 Escape closes it on desktop");
    assert(/panelRef\.current\?\.focus\(\)/.test(sheet), "19 focus moves into the dialog on open");
    assert(/<ol/.test(sheet) && !IOS_SHEET_STEPS.some((s) => /screenshot|\.png|\.jpg/i.test(s)), "readable ordered instructions, no screenshot-heavy onboarding");
    assert(/aria-label="Close"/.test(sheet), "19 the icon-only close control has a real accessible name, not icon alone");
  });

  await runner.run("InstallBanner: copy, semantics, placement and approved icon — a tasteful banner, not a browser alert or full-screen interruption", async () => {
    assert(INSTALL_BANNER_TITLE === "Install Monitriq" && INSTALL_BANNER_BODY === "Get quicker access from your Home Screen." && INSTALL_BANNER_NOT_NOW === "Not now" && INSTALL_BANNER_INSTALL === "Install", "15 approved copy, never Download APK / Download app / App Store");
    const banner = src("components/pwa/InstallBanner.tsx");
    assert(/role="region"/.test(banner), "19 an appropriate landmark, not a raw <div> soup");
    assert(/<button type="button"/.test(banner), "19 real buttons, not clickable spans");
    assert(/BrandLogo variant="mark"/.test(banner), "1 the approved app icon, never a redrawn/invented one");
    assert(!/fixed inset-0|position:\s*fixed/.test(banner) && !/backdrop-blur|bg-black\/(?:[5-9]\d|100)/.test(banner), "1 in-shell placement, not a full-screen takeover or a giant modal on first paint");
    assert(!/animate-pulse|glow|shadow-\[0.*0.*(?:teal|00d1b2)/i.test(banner) && !/gradient/i.test(banner), "1 no neon/glow/excessive gradients");
    assert(/PageContainer/.test(banner), "2 reuses the shell's own safe-area horizontal padding, so it can never cause horizontal overflow");
    assert(!/env\(safe-area-inset-top\)/.test(banner), "2 sits below ShellHeader (which already owns the top inset), so it never needs or duplicates its own top-safe-area padding");
    assert(!/z-\[?[5-9]\d/.test(banner), "2 in normal document flow (no high z-index), so it structurally cannot cover the header, profile menu, drawer or forms");
  });

  await runner.run("dismissal and profile fallback: 'Not now' truly suppresses the banner without touching the Profile entry point", async () => {
    const store = src("lib/pwa/install-prompt-store.ts");
    assert(/sessionDismissed = true/.test(store), "9 an explicit in-memory session flag, checked before any storage read");
    assert(/localStorage\.setItem/.test(store), "9 also persisted across visits");
    const section = code("components/pwa/InstallSection.tsx");
    assert(!/install-prompt-store|dismissInstallPromptForSession|isInstallPromptSessionDismissed/.test(section), "14 the profile fallback never reads the banner's dismissal state — dismissing the banner must never hide the fallback");
    assert(!/dismiss|Not now/i.test(section), "14 the profile entry point has no dismiss action of its own; it is a stable, always-available fallback");
  });

  await runner.run("install vs update: never stacked, installation takes precedence, and this does not touch the update architecture itself", async () => {
    const rt = code("components/pwa/PwaRuntime.tsx");
    assert(/useInstallPromptVisible/.test(rt), "16 reads the SAME eligibility the banner renders from — one source of truth, not a second guess");
    assert(/showUpdate = waiting !== null && !dismissed && !installPromptVisible/.test(rt), "16 installation takes precedence: the update banner is suppressed while the install banner is offered");
    assert(/registration\.update|reg\.update|skipWaiting|SKIP_WAITING|updateViaCache/.test(src("components/pwa/PwaRuntime.tsx")), "17 update registration/detection/apply flow is untouched by this phase");
  });

  await runner.run("onboarding and first-run: the banner cannot appear before onboarding has settled, and appears once Home is reached", async () => {
    assert(!/InstallBanner/.test(src("app/onboarding/page.tsx")), "the onboarding page does not render AppShell, so it structurally cannot show the top banner");
    assert(!/AppShell/.test(code("app/onboarding/page.tsx")), "onboarding uses its own minimal shell, not AppShell");
    for (const f of ["app/(auth)/signup/page.tsx", "app/(auth)/login/page.tsx", "app/auth/confirm/route.ts"]) assert(!/InstallBanner/.test(src(f)), `${f}: install banner cannot appear during signup/confirmation`);
    assert(/<InstallBanner \/>/.test(src("components/layout/AppShell.tsx")), "13/18 mounted once for the whole authenticated shell (every (app) route, including Home for a returning user) — a persistent Next.js layout, so it does not remount (and re-offer itself) on every in-app navigation");
  });

  await runner.run("language mode: installation copy is identical regardless of financial_language_mode — no three-way install experience", async () => {
    const installCode = [code("components/pwa/InstallBanner.tsx"), code("components/pwa/InstallInstructionsSheet.tsx"), code("components/pwa/InstallSection.tsx")].join("\n");
    assert(!/financial_language_mode|languageMode|useLanguageMode|terms\.t\(/i.test(installCode), "16 install UI never reads the language-mode system; copy is the same simple text for every mode");
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
