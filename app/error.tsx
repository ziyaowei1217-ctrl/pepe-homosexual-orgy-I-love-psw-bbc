"use client";

import { RotateCcw } from "lucide-react";
import { useEffect } from "react";

import { DeadEnd, primaryButton } from "@/components/marketplace/dead-end";
import { PublicShell } from "@/components/marketplace/public-shell";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PublicShell active="discover">
      <DeadEnd
        title="页面没加载出来"
        body="可能是网络或服务暂时出了问题。重试一下，还不行就稍后再来。"
        action={<button type="button" onClick={reset} className={`${primaryButton} gap-2`}><RotateCcw className="size-4" aria-hidden="true" />重新加载</button>}
      />
    </PublicShell>
  );
}
