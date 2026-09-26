/**
 * App shell + navigation hierarchy suite (P0-E5-S4). The repo has no DOM
 * test runner, so this asserts the navigation DATA and component/CSS source
 * contracts, plus a real sign-out against LOCAL Supabase. Interactive
 * behaviour (drawer open/close, backdrop, Escape, mutual exclusion, focus,
 * scrolling, overflow, themes) is verified in a real browser and recorded in
 * docs/reports/P0-E5-S4-mobile-navigation-app-shell.txt.
 */
import { readFileSync } from "node:fs";
import { loadTestEnv } from "../shared/env.ts";
import { setupFixtures } from "../shared/fixtures.ts";
import { TestRunner, assert } from "../shared/assert.ts";
import { DRAWER_SECTIONS, PRIMARY_AFTER_ADD, PRIMARY_BEFORE_ADD } from "../../../components/layout/nav-items.ts";

const src = (f: string) => readFileSync(f, "utf8");
const drawerLabels = DRAWER_SECTIONS.flatMap((s) => s.items.map((i) => i.label));
const drawerHrefs = DRAWER_SECTIONS.flatMap((s) => s.items.map((i) => i.href));
const primaryLabels = [...PRIMARY_BEFORE_ADD, ...PRIMARY_AFTER_ADD].map((i) => i.label);
const SHELL = ["components/layout/AppShell.tsx", "components/layout/ShellHeader.tsx", "components/layout/NavDrawer.tsx", "components/layout/AccountMenu.tsx", "components/layout/MobileBottomNav.tsx", "components/layout/DesktopNav.tsx", "components/layout/nav-items.ts"];

async function main() {
  const env = loadTestEnv();
  const fx = await setupFixtures(env, "app-shell");
  const runner = new TestRunner();
  try {
    console.log("Monitriq app shell suite (navigation hierarchy)\n");

    await runner.run("1/2/3 bottom nav is Home / Money / + / Budget / Goals; Assets and Decisions are not in it", async () => {
      assert(primaryLabels.join() === "Home,Money,Budget,Goals", primaryLabels.join());
      assert([...PRIMARY_BEFORE_ADD, ...PRIMARY_AFTER_ADD].map((i) => i.href).join() === "/home,/money,/budget,/goals", "routes");
      const nav = src("components/layout/MobileBottomNav.tsx");
      assert(nav.indexOf("PRIMARY_BEFORE_ADD.map") < nav.indexOf("onClick={openQuickAdd}") && nav.indexOf("onClick={openQuickAdd}") < nav.indexOf("PRIMARY_AFTER_ADD.map"), "the + sits between the two groups");
      assert(!/assets|decisions/i.test(nav.replace(/Assets, Decisions and the other/g, "")) && !/\/assets|\/decisions/.test(nav), "no Assets/Decisions in the bottom nav");
      assert(/aria-label="Quick Add"/.test(nav) && /openQuickAdd/.test(nav), "existing Quick Add trigger preserved");
      assert(/h-12/.test(nav) && /safe-area-inset-bottom/.test(nav) && /md:hidden/.test(nav) && /aria-current/.test(nav), "48px targets, safe area, active state");
      assert(!/\/assets|\/decisions/.test(src("components/layout/DesktopNav.tsx")), "desktop nav mirrors the four everyday destinations");
    });

    await runner.run("4-9 the drawer holds Assets, Debts, Money Owed to You, Decisions, Financial Overview, Rules & Commitments", async () => {
      for (const l of ["Assets", "Debts", "Money Owed to You", "Decisions", "Financial Overview", "Rules & Commitments"]) assert(drawerLabels.includes(l), `drawer missing ${l}`);
      assert(drawerHrefs.join() === "/assets,/liabilities,/receivables,/decisions,/financial-position,/rules", "routes unchanged");
      assert(DRAWER_SECTIONS.map((s) => s.heading).join() === "Your money,Planning", "sections");
      assert(!drawerLabels.some((l) => ["Home", "Money", "Budget", "Goals"].includes(l)), "bottom-nav routes are not duplicated in the drawer");
      assert(!drawerLabels.includes("Can I afford this?") && !/spending-check/.test(src("components/layout/nav-items.ts")), "Spending Check stays out of primary/drawer nav");
    });

    await runner.run("10 no 'foundation routes' or internal build-stage copy anywhere in the shell", async () => {
      for (const f of SHELL) assert(!/foundation routes|foundation-level|not the final design/i.test(src(f).replace(/^\s*\*.*$/gm, "")), `${f}: internal copy`);
      assert(!/Foundation routes/i.test(src("components/layout/AccountMenu.tsx")), "profile menu");
    });

    await runner.run("11/12 the profile menu has account and settings only, no product navigation", async () => {
      const menu = src("components/layout/AccountMenu.tsx");
      const code = menu.replace(/\/\*[\s\S]*?\*\//g, "");
      for (const nav of ["/budget", "/assets", "/decisions", "/liabilities", "/receivables", "/rules", "/financial-position", "Financial Position", "Money Owed"]) assert(!code.includes(nav), `profile menu contains product navigation: ${nav}`);
      for (const part of ["Preferred currency", "Appearance", "ThemeToggle", "Security", "/update-password", "SignOutButton", "displayName", "email"]) assert(code.includes(part), `profile menu missing ${part}`);
      const shell = src("components/layout/AppShell.tsx");
      assert(/preferred_name \|\| profile\?\.first_name/.test(shell) && !/Vicky|Victor/i.test(shell + menu), "name derives from the profile, never hardcoded");
      assert(/\{displayName \?/.test(menu) && /\{email \?/.test(menu), "email-only when there is no name");
    });

    await runner.run("13/22/23/24 appearance keeps Light / Dark / System with labels, titles and a clear selected state", async () => {
      const t = src("components/theme/ThemeToggle.tsx");
      for (const v of ['"light"', '"dark"', '"system"']) assert(t.includes(v), `theme option ${v}`);
      assert(/role="radiogroup"/.test(t) && /aria-checked=\{selected\}/.test(t) && /title=\{label\}/.test(t) && /aria-label=\{label\}/.test(t) && /setTheme\(value\)/.test(t), "accessible radio group wired to setTheme");
      assert(/showLabels/.test(t) && /<ThemeToggle showLabels/.test(src("components/layout/AccountMenu.tsx")), "labels always visible in the profile menu");
      assert(/defaultTheme="system"|defaultTheme=\{"system"\}/.test(src("components/theme/ThemeProvider.tsx")) || /system/.test(src("components/theme/ThemeProvider.tsx")), "system theme supported");
    });

    await runner.run("14 sign out remains functional and is visually quiet", async () => {
      const so = src("components/auth/SignOutButton.tsx");
      assert(/auth\.signOut\(\)/.test(so) && /router\.replace\("\/login"\)/.test(so), "signs out and returns to login");
      assert(/subtle/.test(so) && /<SignOutButton subtle/.test(src("components/layout/AccountMenu.tsx")), "quiet style in the menu");
      const { error } = await fx.userA.client.auth.signOut();
      assert(error === null, "real sign-out succeeds");
      const { data } = await fx.userA.client.auth.getUser();
      assert(data.user === null, "session is gone after sign-out");
    });

    await runner.run("15-18 drawer and profile overlays: one at a time; closes on Escape, backdrop, route selection; focus handled", async () => {
      const header = src("components/layout/ShellHeader.tsx");
      assert(/type Overlay = "drawer" \| "profile" \| null/.test(header) && /open=\{overlay === "profile"\}/.test(header) && /overlay === "drawer" \?/.test(header), "single overlay state owns both surfaces");
      assert(/aria-label="Open navigation"/.test(header) && /aria-expanded=\{overlay === "drawer"\}/.test(header) && /h-12 w-12/.test(header), "labelled 48px menu button");
      assert(/restoreFocus\) menuButtonRef\.current\?\.focus\(\)/.test(header), "focus returns to the menu button");
      assert(/<\/header>\s*\{overlay === "drawer"/.test(header), "drawer is a sibling of <header> (backdrop-blur would trap fixed positioning)");
      const drawer = src("components/layout/NavDrawer.tsx");
      assert(/event\.key === "Escape"/.test(drawer) && /onClick=\{\(\) => onClose\(\{ restoreFocus: true \}\)\}/.test(drawer) && /onClick=\{\(\) => onClose\(\{ restoreFocus: false \}\)\}/.test(drawer), "Escape, backdrop and link selection all close");
      assert(/role="dialog"/.test(drawer) && /aria-modal="true"/.test(drawer) && /aria-label="Close navigation"/.test(drawer) && /<nav aria-label="App navigation"/.test(drawer) && /closeRef\.current\?\.focus\(\)/.test(drawer), "dialog + nav semantics, close label, focus moves in");
      assert(/nav-locked/.test(drawer) && /overscroll-contain/.test(drawer) && /overflow-y-auto/.test(drawer) && /w-\[min\(85vw,20rem\)\]/.test(drawer) && /safe-area-inset/.test(drawer), "scroll lock, inner scroll, 85vw/20rem width, safe areas");
      const menu = src("components/layout/AccountMenu.tsx");
      assert(/event\.key === "Escape"/.test(menu) && /triggerRef\.current\?\.focus\(\)/.test(menu) && /aria-expanded=\{open\}/.test(menu) && /aria-label="Account menu"/.test(menu), "profile keeps accessible open/close behaviour");
    });

    await runner.run("19/20/21 scroll ownership: the document is the only scroller; scrollbar chrome hidden below md; no page-level overflow:hidden; content clears the bottom nav", async () => {
      const css = src("app/globals.css");
      assert(/@media \(max-width: 767\.98px\)[\s\S]*scrollbar-width: none[\s\S]*-ms-overflow-style: none[\s\S]*html::-webkit-scrollbar[\s\S]*display: none/.test(css), "cross-browser hiding below the md breakpoint");
      assert(/@media \(min-width: 768px\)[\s\S]*scrollbar-gutter: stable/.test(css), "desktop keeps a normal scrollbar with a stable gutter");
      assert(/-webkit-overflow-scrolling: touch/.test(css), "momentum scrolling preserved");
      assert(/html\.nav-locked\s*\{\s*overflow: hidden;\s*\}/.test(css) && !/(^|\n)\s*(html|body)\s*\{[^}]*overflow:\s*hidden/.test(css), "overflow:hidden only while the drawer is open");
      const shell = src("components/layout/AppShell.tsx");
      assert(/pb-\[calc\(6rem\+env\(safe-area-inset-bottom\)\)\]/.test(shell), "main reserves 96px plus the safe-area inset above the fixed nav (nav is 64px)");
      assert(!/overflow-(y-)?(auto|scroll)/.test(shell) && !/overflow-hidden/.test(shell), "no competing scroll container in the shell");
      assert(!/addEventListener\((["'])(wheel|touchmove|scroll)\1/.test(SHELL.map(src).join("\n")), "no JavaScript scroll interception");
    });

    await runner.run("Route labels are consumer-friendly and page headings match them; no domain/route rename", async () => {
      assert(/Financial Overview<\/h1>/.test(src("app/(app)/financial-position/page.tsx")), "Financial Overview heading");
      assert(/Rules &amp; Commitments/.test(src("app/(app)/rules/page.tsx")), "Rules & Commitments heading");
      assert(drawerHrefs.includes("/liabilities") && drawerHrefs.includes("/receivables") && drawerHrefs.includes("/financial-position"), "internal routes unchanged");
    });

    await runner.run("no financial domain, schema or RLS code is touched by the shell", async () => {
      const shell = src("components/layout/AppShell.tsx");
      assert(/listBuckets|getBucketBalances/.test(shell), "AppShell still supplies Quick Add's existing data unchanged");
      for (const f of ["components/layout/ShellHeader.tsx", "components/layout/NavDrawer.tsx", "components/layout/AccountMenu.tsx"]) assert(!/from "@\/lib\/domain\/(?!profile|language)/.test(src(f)), `${f}: no financial-domain imports (profile and language preferences are not financial)`);
    });

  } finally {
    await fx.cleanup();
  }
  const s = runner.summary();
  console.log(`\n${s.passed}/${s.total} passed`);
  if (s.failed > 0) {
    for (const r of s.results.filter((r) => !r.passed)) console.error(`  - ${r.name}: ${r.error}`);
    process.exitCode = 1;
  }
}
main().catch((e) => { console.error("App shell suite crashed:", e); process.exitCode = 1; });
