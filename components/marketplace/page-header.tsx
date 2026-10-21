import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * psw page header: one title style for every page (m-large-title 34 / d-large-title 40), an optional one-line
 * description and an action on the right. No English eyebrows; a page that needs context says it in the description.
 */
export function PageHeader({ title, description, action, titleId, className, children }: {
  title: ReactNode; description?: ReactNode; action?: ReactNode; titleId?: string; className?: string; children?: ReactNode;
}) {
  return (
    <header className={cn("flex flex-col gap-4 border-b border-line-strong pb-6 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 id={titleId} className="page-title">{title}</h1>
        {description ? <p className="mt-2 text-m-subhead text-ink-secondary sm:text-d-body">{description}</p> : null}
        {children}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
    </header>
  );
}
