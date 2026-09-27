"use client";

import dynamic from "next/dynamic";

/** Keeps the PWA runtime out of the initial bundle: it loads after hydration and renders nothing until needed. */
const PwaRuntime = dynamic(() => import("@/components/pwa/PwaRuntime"), { ssr: false });

export function PwaLoader() {
  return <PwaRuntime />;
}
