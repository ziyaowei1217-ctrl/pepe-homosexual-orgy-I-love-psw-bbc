import type { ReactNode } from "react";

import { Wowo, type WowoMood } from "@/components/brand/wowo";
import { cn } from "@/lib/utils";

/**
 * psw EmptyState: 窝窝 with the matching mood, one sentence on what is going on, why, and one thing to do next.
 * `curious` for no results, `sleepy` for nothing here yet, `sorry` for an error.
 */
export function EmptyState({ mood = "curious", title, body, action, headingLevel = 2, className }: {
  mood?: WowoMood; title: string; body?: ReactNode; action?: ReactNode;
  /** 1 when the empty state is the whole page (404, error): the title is then the page's h1. */
  headingLevel?: 1 | 2 | 3; className?: string;
}) {
  const Heading = headingLevel === 1 ? "h1" : headingLevel === 2 ? "h2" : "h3";
  return (
    <div className={cn("flex flex-col items-center rounded-psw-xl bg-surface px-6 py-12 text-center", className)}>
      <Wowo mood={mood} size={104} />
      <Heading className={cn("mt-5 text-ink", headingLevel === 1 ? "font-rounded text-m-title sm:text-d-title" : "text-m-headline sm:text-d-headline")}>{title}</Heading>
      {body ? <div className="mt-2 max-w-md text-m-subhead text-ink-secondary sm:text-d-subhead">{body}</div> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
