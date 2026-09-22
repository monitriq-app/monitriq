import type { ReactNode } from "react";

interface AuthCardProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function AuthCard({ title, description, children }: AuthCardProps) {
  return (
    <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 sm:p-8">
      <h1 className="text-xl font-semibold text-text-primary">{title}</h1>
      {description ? <p className="mt-1 text-sm text-text-secondary">{description}</p> : null}
      <div className="mt-6">{children}</div>
    </div>
  );
}
