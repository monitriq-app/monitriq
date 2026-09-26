import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Button } from "@/components/ui/Button";
import { siteConfig } from "@/lib/config/site";
import { isSupabaseConfigured } from "@/lib/config/env";
import { ConfigurationNotice } from "@/components/layout/ConfigurationNotice";

export default function LandingPage() {
  if (!isSupabaseConfigured()) {
    return <ConfigurationNotice />;
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-background px-4 text-center">
      <BrandLogo variant="wordmark" className="h-10 w-auto" />
      <p className="max-w-md text-text-secondary">{siteConfig.description}</p>
      <div className="flex gap-3">
        <Link href="/login">
          <Button variant="secondary">Sign in</Button>
        </Link>
        <Link href="/signup">
          <Button>Create account</Button>
        </Link>
      </div>
    </div>
  );
}
