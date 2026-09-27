/**
 * Signup email confirmation -> onboarding (P0-E6-AUTH-R1).
 *
 * Local Supabase stack only (env.ts refuses anything else). Exercises the
 * REAL local Auth server and its outbound mail (Mailpit): a real signup, the
 * real email Supabase renders from supabase/templates/confirmation.html, and
 * the same verifyOtp({ token_hash, type }) call the /auth/confirm route makes.
 * The route's pure decision logic (lib/auth/*) is tested directly.
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { loadTestEnv } from "../shared/env.ts";
import { TestRunner, assert } from "../shared/assert.ts";
import { safeNextPath } from "../../../lib/auth/redirects.ts";
import { classifyVerifyError, parseConfirmType, postConfirmDestination } from "../../../lib/auth/confirm.ts";
import { friendlyAuthError, RESEND_COOLDOWN_SECONDS } from "../../../lib/auth/messages.ts";
import { getProfile, updateProfile } from "../../../lib/domain/profile/repository.ts";

const MAIL = process.env.SUPABASE_TEST_MAILPIT_URL ?? "http://127.0.0.1:54324";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const src = (f: string) => readFileSync(f, "utf8");

interface Mail { subject: string; html: string; to: string; }
async function mailFor(email: string, expected: number, timeoutMs = 10000): Promise<Mail[]> {
  const started = Date.now();
  for (;;) {
    const list = (await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json()) as { messages: { ID: string; Subject: string; Created: string }[] };
    if (list.messages.length >= expected || Date.now() - started > timeoutMs) {
      const out: Mail[] = [];
      for (const m of [...list.messages].sort((a, b) => a.Created.localeCompare(b.Created))) {
        const full = (await (await fetch(`${MAIL}/api/v1/message/${m.ID}`)).json()) as { HTML: string };
        out.push({ subject: m.Subject, html: full.HTML, to: email });
      }
      return out;
    }
    await sleep(300);
  }
}
function confirmLink(html: string): URL {
  const href = /href="([^"]*\/auth\/confirm[^"]*)"/.exec(html)?.[1];
  assert(Boolean(href), "no /auth/confirm link in the email");
  return new URL(href!.replace(/&amp;/g, "&"));
}

async function main() {
  const env = loadTestEnv();
  const runner = new TestRunner();
  const admin = createClient(env.url, env.testServiceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const anon = () => createClient(env.url, env.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const created: string[] = [];
  console.log("Monitriq signup confirmation -> onboarding\n");

  try {
    // ---------- open-redirect safety ----------
    await runner.run("safeNextPath: only approved internal routes; every off-site / tricky form falls back", async () => {
      const allowed: [string, string][] = [["/home", "/home"], ["/money", "/money"], ["/budget/", "/budget"], ["/update-password", "/update-password"], ["/onboarding", "/onboarding"], ["/assets/123", "/assets/123"]];
      for (const [input, expected] of allowed) assert(safeNextPath(input, "/fallback") === expected, `${input} should be allowed as ${expected}`);
      assert(safeNextPath("/goals?x=1#y", "/home") === "/goals", "query and fragment are dropped");
      for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "@evil.example", "javascript:alert(1)", "http://localhost:3000/home", "/../etc/passwd", "/admin", "/homepage-evil", "/home%0d%0aSet-Cookie:x", "", "home", "/\t/evil.example", "///evil.example", null, undefined]) {
        assert(safeNextPath(bad as string | null | undefined, "/home") === "/home", `${String(bad)} must fall back`);
      }
      assert(safeNextPath("https://evil.example", "/onboarding") === "/onboarding", "fallback is returned as given");
    });

    await runner.run("Confirm decision logic: type parsing, failure classification, destination", async () => {
      assert(parseConfirmType("email") === "email" && parseConfirmType("signup") === "signup" && parseConfirmType("recovery") === "recovery", "accepted types");
      for (const bad of ["magiclink", "invite", "email_change", "", null, undefined, "EMAIL"]) assert(parseConfirmType(bad as string | null | undefined) === null, `${String(bad)} rejected`);
      assert(classifyVerifyError({ code: "otp_expired", status: 403 }) === "expired" && classifyVerifyError({ code: "x" }) === "invalid" && classifyVerifyError(null) === "invalid", "classification");
      assert(postConfirmDestination({ type: "email", onboardingCompleted: false }) === "/onboarding", "incomplete -> onboarding");
      assert(postConfirmDestination({ type: "email", onboardingCompleted: false, next: "/money" }) === "/onboarding", "onboarding wins over next");
      assert(postConfirmDestination({ type: "email", onboardingCompleted: true }) === "/home", "complete -> home");
      assert(postConfirmDestination({ type: "email", onboardingCompleted: true, next: "/budget" }) === "/budget", "approved next honoured once onboarded");
      assert(postConfirmDestination({ type: "email", onboardingCompleted: true, next: "https://evil.example" }) === "/home", "evil next ignored");
      assert(postConfirmDestination({ type: "recovery", onboardingCompleted: true, next: "/money" }) === "/update-password", "recovery -> update-password");
      for (const t of ["email", "signup"] as const) assert(!["/login", "/signup", "/auth"].includes(postConfirmDestination({ type: t, onboardingCompleted: false })), "never back to sign-in/up");
    });

    await runner.run("Friendly auth errors never echo provider text or reveal account existence", async () => {
      const cases = [
        [{ code: "over_email_send_rate_limit", message: "email rate limit exceeded" }, "signup"],
        [{ code: "weak_password", message: "Password should contain at least one character of each" }, "signup"],
        [{ code: "user_already_exists", message: "User already registered" }, "signup"],
        [{ code: "email_not_confirmed", message: "Email not confirmed" }, "signin"],
        [{ code: "invalid_credentials", message: "Invalid login credentials" }, "signin"],
        [{ code: "unexpected_failure", message: "Database error saving new user" }, "signup"],
      ] as const;
      for (const [err, kind] of cases) {
        const text = friendlyAuthError(err, kind);
        assert(!/supabase|rate limit exceeded|already registered|database|invalid login/i.test(text), `leaks provider text: ${text}`);
      }
      assert(!/already|exists|registered/i.test(friendlyAuthError({ code: "user_already_exists" }, "signup")), "no enumeration");
      assert(RESEND_COOLDOWN_SECONDS >= 30, "resend cooldown is meaningful");
    });

    // ---------- template + config ----------
    await runner.run("Template: SSR token_hash link, Monitriq wording, email-safe HTML, no Supabase branding", async () => {
      const t = src("supabase/templates/confirmation.html");
      assert(t.includes("{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=email"), "link");
      assert(!/ConfirmationURL/.test(t), "must not use the Supabase-hosted verify link (that yields no SSR session)");
      for (const s of ["Confirm your email", "Thanks for creating your Monitriq account.", "Confirm your email address to finish setting up your account.", "Confirm my email", "you can ignore this email"]) assert(t.includes(s.replace("'", "&#8217;")) || t.includes(s), `missing copy: ${s}`);
      assert(!/supabase/i.test(t), "no Supabase branding");
      assert(!/<script|<link|@import|@font-face|fonts\.googleapis|gradient|backdrop-filter|<img|https?:\/\/(?!www\.w3\.org)/i.test(t), "no scripts, web fonts, gradients, images or external URLs");
      assert(/<table[^>]*role="presentation"/.test(t) && /style="[^"]*background-color:#0E6F62/.test(t) && /background-color:#071820/i.test(t), "table layout, inline styles, brand teal CTA and navy header");
      const cfg = src("supabase/config.toml");
      assert(/\[auth\.email\.template\.confirmation\][\s\S]*subject = "Confirm your Monitriq email"[\s\S]*content_path = "\.\/supabase\/templates\/confirmation\.html"/.test(cfg), "local config wires template + subject");
      assert(/enable_confirmations = true/.test(cfg.split("[auth.sms]")[0]), "local email confirmations on, matching production");
      assert(!/RESEND_|re_[A-Za-z0-9]{10,}/.test(cfg + t), "no Resend key in repo config/template");
    });

    // ---------- real signup -> real email -> verifyOtp ----------
    const email = `auth-confirm-${randomUUID()}@monatriq.test`;
    const password = `Pw-${randomUUID()}`;
    const client = anon();
    let tokenHash = "";

    await runner.run("1-3 New signup creates NO session and sends a Monitriq email whose link points to /auth/confirm", async () => {
      const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: "http://localhost:3000/auth/confirm" } });
      assert(!error && Boolean(data.user), `signUp failed: ${error?.code}`);
      created.push(data.user!.id);
      assert(data.session === null, "signup must not yield a session before confirmation");
      const [mail] = await mailFor(email, 1);
      assert(Boolean(mail), "no confirmation email was generated");
      assert(mail.subject === "Confirm your Monitriq email", `subject: ${mail.subject}`);
      assert(!/supabase/i.test(mail.html), "email mentions Supabase");
      const link = confirmLink(mail.html);
      assert(link.pathname === "/auth/confirm" && link.searchParams.get("type") === "email", `link: ${link.pathname}?type=${link.searchParams.get("type")}`);
      assert(link.origin === "http://localhost:3000", `link origin ${link.origin} (Site URL)`);
      tokenHash = link.searchParams.get("token_hash") ?? "";
      assert(tokenHash.length > 10, "token_hash missing");
    });

    let session: Awaited<ReturnType<typeof client.auth.verifyOtp>>["data"]["session"] = null;
    await runner.run("4-7 verifyOtp({ token_hash, type: 'email' }) confirms the user and yields an authenticated session; profile readable via RLS; destination = /onboarding", async () => {
      const { data, error } = await client.auth.verifyOtp({ type: "email", token_hash: tokenHash });
      assert(!error, `verifyOtp failed: ${error?.code}`);
      session = data.session;
      assert(Boolean(session?.access_token) && data.user?.email === email && Boolean(data.user?.email_confirmed_at), "no confirmed session");
      const { data: who } = await client.auth.getUser();
      assert(who.user?.id === created[0], "getUser() does not see the confirmed user");
      const profile = await getProfile(client as never);
      assert(profile?.id === created[0] && profile.onboarding_completed === false, "exactly one trigger-created, un-onboarded profile via RLS (maybeSingle would throw on duplicates)");
      assert(postConfirmDestination({ type: "email", onboardingCompleted: profile.onboarding_completed }) === "/onboarding", "destination");
    });

    await runner.run("Unconfirmed users cannot sign in with a password; confirmed ones can", async () => {
      const other = `auth-confirm-${randomUUID()}@monatriq.test`;
      const { data } = await anon().auth.signUp({ email: other, password });
      created.push(data.user!.id);
      const { error } = await anon().auth.signInWithPassword({ email: other, password });
      assert(error?.code === "email_not_confirmed", `expected email_not_confirmed, got ${error?.code}`);
      assert(friendlyAuthError(error, "signin") === "Please confirm your email before signing in.", "friendly copy");
      const ok = await anon().auth.signInWithPassword({ email, password });
      assert(!ok.error && Boolean(ok.data.session), "confirmed user signs in");
    });

    await runner.run("18 Reused link is rejected as expired/used (otp_expired) and classified for the invalid-link screen", async () => {
      const { data, error } = await anon().auth.verifyOtp({ type: "email", token_hash: tokenHash });
      assert(Boolean(error) && data.session === null, "a used token must not verify again");
      assert(classifyVerifyError(error) === "expired", `classified ${classifyVerifyError(error)} (${error?.code})`);
    });

    await runner.run("16-17 Garbage / tampered token_hash is rejected; no session", async () => {
      for (const bad of ["not-a-real-token", `${tokenHash.slice(0, -2)}zz`, "0".repeat(56)]) {
        const { data, error } = await anon().auth.verifyOtp({ type: "email", token_hash: bad });
        assert(Boolean(error) && data.session === null, `token ${bad.slice(0, 8)}… verified`);
      }
    });

    await runner.run("11-14, 19 Onboarding completes -> profile flips -> sign out/in works -> destination /home (already-onboarded)", async () => {
      const c = anon();
      const { error: signInError } = await c.auth.signInWithPassword({ email, password });
      assert(!signInError, "sign-in");
      const updated = await updateProfile(c as never, { first_name: "Ada", preferred_name: null, preferred_currency: "USD", timezone: "Africa/Lagos" });
      assert(updated.onboarding_completed === true, "onboarding_completed");
      await c.auth.signOut();
      const again = anon();
      await again.auth.signInWithPassword({ email, password });
      const profile = await getProfile(again as never);
      assert(postConfirmDestination({ type: "email", onboardingCompleted: profile!.onboarding_completed }) === "/home", "returning user -> /home");
    });

    await runner.run("15 Resend: a second email is generated by Supabase Auth, same /auth/confirm architecture, and its token verifies", async () => {
      const email2 = `auth-confirm-${randomUUID()}@monatriq.test`;
      const c = anon();
      const { data } = await c.auth.signUp({ email: email2, password });
      created.push(data.user!.id);
      await mailFor(email2, 1);
      await sleep(1500); // local max_frequency = 1s
      const { error } = await c.auth.resend({ type: "signup", email: email2, options: { emailRedirectTo: "http://localhost:3000/auth/confirm" } });
      assert(!error, `resend failed: ${error?.code}`);
      const mails = await mailFor(email2, 2);
      assert(mails.length === 2, `expected 2 emails, got ${mails.length}`);
      const link = confirmLink(mails[1].html);
      assert(link.pathname === "/auth/confirm" && link.searchParams.get("type") === "email" && mails[1].subject === "Confirm your Monitriq email", "resent email uses the same template + route");
      const { data: v, error: ve } = await anon().auth.verifyOtp({ type: "email", token_hash: link.searchParams.get("token_hash")! });
      assert(!ve && Boolean(v.session), `resent token failed to verify: ${ve?.code}`);
    });

    await runner.run("Resend for an unknown address reveals nothing (same success shape) and creates no account", async () => {
      const ghost = `auth-confirm-ghost-${randomUUID()}@monatriq.test`;
      const { error } = await anon().auth.resend({ type: "signup", email: ghost });
      assert(!error, `resend to unknown address must not error (enumeration): ${error?.code}`);
      const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
      assert(!data.users.some((u) => u.email === ghost), "resend created an account");
    });

    // ---------- guards ----------
    await runner.run("Route + pages: server-side verifyOtp, session check, no tokens logged, no service role, no duplicate profile write, callback hardened", async () => {
      const route = src("app/auth/confirm/route.ts");
      assert(/from "@\/lib\/supabase\/server"/.test(route) && /auth\.verifyOtp\(\{ type, token_hash: tokenHash \}\)/.test(route), "server client verifyOtp");
      assert(route.indexOf("verifyOtp") < route.indexOf("auth.getUser()") && route.indexOf("auth.getUser()") < route.indexOf("await getProfile("), "verify -> confirm session -> read profile, in order");
      assert(!/console\.\w+\([^)]*tokenHash|console\.\w+\([^)]*token_hash/.test(route.replace(/hasToken: Boolean\(tokenHash\)/g, "")), "token must not be logged");
      assert(!/service_role|SERVICE_ROLE|insert\(|\.from\("profiles"\)/.test(route), "no service role or profile writes");
      assert(!/createClient\([^)]*SERVICE/i.test(route), "no service-role client");
      assert(/safeNextPath/.test(src("app/auth/callback/route.ts")), "callback next is validated");
      const authCode = [src("app/(auth)/signup/page.tsx"), src("components/auth/ResendConfirmation.tsx"), src("app/(auth)/link-invalid/page.tsx")].join("\n");
      assert(!/RESEND_API|RESEND_KEY|api\.resend\.com|service_role/i.test(authCode), "no Resend/service-role references in auth UI code");
      assert(!/RESEND_|re_[A-Za-z0-9]{10,}/.test(src(".env.example")), "no Resend key in env example");
      assert(/setSubmitted\(false\)/.test(src("app/(auth)/signup/page.tsx")) && /Use a different email/.test(src("components/auth/ResendConfirmation.tsx")), "use a different email");
      assert(/\/auth\/confirm/.test(src("app/(auth)/signup/page.tsx")), "signup points emailRedirectTo at /auth/confirm");
    });
  } finally {
    for (const id of created) await admin.auth.admin.deleteUser(id).catch(() => undefined);
  }

  const s = runner.summary();
  console.log(`\n${s.passed}/${s.total} passed`);
  if (s.failed > 0) process.exitCode = 1;
}
main().catch((e) => { console.error("auth-confirm suite crashed:", e); process.exitCode = 1; });
