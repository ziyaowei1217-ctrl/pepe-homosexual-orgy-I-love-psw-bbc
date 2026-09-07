"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect } from "react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-dvh place-items-center bg-[#f7f8fb] px-6 text-center">
      <div className="max-w-md rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-amber-50 text-amber-600">
          <AlertTriangle className="size-6" />
        </span>
        <h1 className="mt-5 text-2xl font-black">页面暂时无法加载</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">服务连接出现问题，请稍后重试。我们不会用演示数据替代真实内容。</p>
        <button type="button" onClick={reset} className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#0668e1] px-5 py-3 text-sm font-black text-white">
          <RotateCcw className="size-4" />重新加载
        </button>
      </div>
    </main>
  );
}
