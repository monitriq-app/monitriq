import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "min-h-12 w-full rounded-lg border border-border bg-surface px-3 py-2 text-base text-text-primary placeholder:text-text-muted sm:text-sm",
        className,
      )}
      {...props}
    />
  );
}
