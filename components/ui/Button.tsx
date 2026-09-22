import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
}

export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex min-h-10 items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
        variant === "primary" && "bg-accent-primary text-background hover:opacity-90",
        variant === "secondary" &&
          "border border-border bg-surface-raised text-text-primary hover:bg-surface-muted",
        className,
      )}
      {...props}
    />
  );
}
