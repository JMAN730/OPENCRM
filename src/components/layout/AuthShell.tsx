import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type AuthShellProps = {
  children: ReactNode;
  wide?: boolean;
  className?: string;
};

export function AuthShell({ children, wide, className }: AuthShellProps) {
  return (
    <div className={cn("crm-auth-shell", className)}>
      <div className={cn("crm-auth-shell-inner", wide && "crm-auth-shell-inner-wide")}>
        {children}
      </div>
    </div>
  );
}

export function AuthCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("crm-auth-card", className)}>{children}</div>;
}
