import { buildServiceWorker, deploymentVersion } from "@/lib/pwa/service-worker";

/**
 * /sw.js — generated at build time so it carries the deployment version (a
 * new deployment produces a new worker, which is how installed apps learn an
 * update exists). Never cached by the browser or the CDN, so update checks
 * always see the latest bytes.
 */
export const dynamic = "force-static";

export function GET() {
  return new Response(buildServiceWorker(deploymentVersion(process.env)), {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Service-Worker-Allowed": "/",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
