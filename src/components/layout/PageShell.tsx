import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageShellProps = {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function PageShell({
  title,
  subtitle,
  actions,
  children,
  className,
  contentClassName,
}: PageShellProps) {
  const hasHead = title != null || subtitle != null || actions != null;

  return (
    <div className={cn("crm-content", className)}>
      {hasHead ? (
        <div className="crm-page-head">
          <div>
            {title != null ? <h1 className="crm-page-title">{title}</h1> : null}
            {subtitle != null ? <div className="crm-page-sub">{subtitle}</div> : null}
          </div>
          {actions != null ? <div className="crm-page-head-actions">{actions}</div> : null}
        </div>
      ) : null}
      {contentClassName != null ? (
        <div className={contentClassName}>{children}</div>
      ) : (
        children
      )}
    </div>
  );
}
