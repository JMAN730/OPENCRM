"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Full-screen glass backdrop for the auth flow (sign-in, register,
 * reset-password, accept-invite). Applies the `.crm-app` token scope so the
 * CRM palette is available outside DashboardLayout.
 */
export function AuthShell({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("crm-app crm-auth-shell", className)}>
      <Link href="/" className="crm-auth-brand" aria-label="ClientCore home">
        <span className="crm-auth-brand-mark" aria-hidden="true">C</span>
        <span>ClientCore</span>
      </Link>
      <div className="crm-auth-stage">{children}</div>
    </div>
  );
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
