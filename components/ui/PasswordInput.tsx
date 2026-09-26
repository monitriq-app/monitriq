"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils/cn";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/**
 * Shared password field with a show/hide control (P0-E3-S1D). Purely a
 * presentation toggle between type="password" and type="text" on the same
 * <input>: the value stays in the caller's own state (never copied,
 * logged, or sent anywhere), so toggling cannot reset it, validate, or
 * submit — the button is type="button". The input keeps its own id/name/
 * autoComplete, so labels and browser password managers are unaffected.
 * The icon uses text-secondary (not the faint muted token, which measured
 * ~2.3:1 on the light-theme field and read as invisible — P0-E3-S1E) at 20px.
 * The 48px control sits inside the field's right padding, so it never
 * covers typed text and the field's size does not change on toggle.
 */
export function PasswordInput({ className, id, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input id={id} type={visible ? "text" : "password"} className={cn("pr-12", className)} {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-controls={id}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 z-10 flex w-12 cursor-pointer items-center justify-center rounded-r-lg text-text-secondary transition-colors hover:text-text-primary"
      >
        {visible ? <EyeOff size={20} strokeWidth={2} aria-hidden="true" /> : <Eye size={20} strokeWidth={2} aria-hidden="true" />}
      </button>
    </div>
  );
}
