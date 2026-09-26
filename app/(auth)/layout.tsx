import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-background px-4 py-12">
      <BrandLogo variant="wordmark" className="h-12 w-auto" />
      {children}
    </div>
  );
}
