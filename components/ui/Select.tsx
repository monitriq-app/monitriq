import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "min-h-12 w-full rounded-lg border border-border bg-surface px-3 py-2 text-base text-text-primary sm:text-sm",
        className,
      )}
      {...props}
    />
  );
}
