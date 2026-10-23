import type { Metadata } from "next";
import Link from "next/link";

import { DeadEnd, primaryButton } from "@/components/marketplace/dead-end";
import { PublicShell } from "@/components/marketplace/public-shell";

export const metadata: Metadata = { title: "找不到这个页面" };

export default function NotFound() {
  return (
    <PublicShell active="discover">
      <DeadEnd
        title="这个页面不存在"
        body="链接可能写错了，或者页面已经搬走了。"
        action={<Link href="/search" className={primaryButton}>去找房</Link>}
      />
    </PublicShell>
  );
}
