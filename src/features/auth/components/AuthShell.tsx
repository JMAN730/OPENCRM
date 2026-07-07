"use client";

import { cn } from "@/lib/utils";

/**
 * Full-screen clay-paper backdrop for the auth flow (sign-in, register,
 * reset-password, accept-invite). Applies the `.crm-app` token scope so the
 * clay palette is available outside DashboardLayout.
 */
export function AuthShell({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("crm-app crm-auth-shell", className)}>{children}</div>;
}

export function AuthCard({
  title,
  description,
  children,
  className,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("crm-auth-card", className)}>
      {title || description ? (
        <div className="crm-auth-card-head">
          {title ? <h1>{title}</h1> : null}
          {description ? <p>{description}</p> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}
