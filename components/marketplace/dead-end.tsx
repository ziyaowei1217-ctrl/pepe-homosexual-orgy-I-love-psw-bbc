import Link from "next/link";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/marketplace/empty-state";
import type { WowoMood } from "@/components/brand/wowo";

export const primaryButton = "flex min-h-12 items-center justify-center rounded-full bg-primary px-6 font-rounded text-base font-bold text-on-primary transition-colors hover:bg-primary-hover active:scale-[0.97]";
export const secondaryButton = "flex min-h-12 items-center justify-center rounded-full border-[1.5px] border-outline bg-surface px-6 font-rounded text-base font-bold text-ink transition-colors hover:bg-surface-subtle active:scale-[0.97]";

/**
 * psw dead end: a page whose content is missing (404, removed listing) or failed to load.
 * Always inside the site shell, always with a way forward: one primary action, home as the second.
 */
export function DeadEnd({ mood = "sorry", title, body, action, children }: {
  mood?: WowoMood; title: string; body: ReactNode; action: ReactNode; children?: ReactNode;
}) {
  return (
    <main className="page-container pb-16 pt-8 sm:pt-14">
      <EmptyState
        mood={mood}
        headingLevel={1}
        title={title}
        body={body}
        action={<div className="flex flex-wrap justify-center gap-3">{action}<Link href="/" className={secondaryButton}>回首页</Link></div>}
      />
      {children}
    </main>
  );
}
