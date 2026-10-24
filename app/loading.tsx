"use client";

import { usePathname } from "next/navigation";
import { PublicShell, type PublicNavKey } from "@/components/marketplace/public-shell";

export default function LoadingPage() {
  const path = usePathname();
  const active: PublicNavKey = path.startsWith("/inbox") || path.startsWith("/messages") ? "inbox" :
    path.startsWith("/roommates") ? "roommates" : path.startsWith("/saved") ? "saved" :
    path.startsWith("/account") || path.startsWith("/auth") ? "account" : "discover";
  return <PublicShell active={active}>
    <main className="page-container py-12" aria-busy="true">
      <p role="status" className="text-d-subhead font-semibold text-ink-secondary">正在加载…首次打开时可能需要稍等片刻。</p>
      <div aria-hidden="true" className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map(item => <div key={item} className="overflow-hidden rounded-psw-xl bg-surface motion-safe:animate-pulse"><div className="aspect-[4/3] bg-surface-subtle" /><div className="space-y-3 p-5"><div className="h-4 w-2/3 rounded-full bg-surface-subtle" /><div className="h-3 w-1/2 rounded-full bg-surface-subtle" /></div></div>)}
      </div>
    </main>
  </PublicShell>;
}
