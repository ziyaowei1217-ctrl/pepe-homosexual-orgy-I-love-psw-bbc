import type { Metadata } from "next";
import { LockKeyhole, Search, UsersRound } from "lucide-react";
import Link from "@/components/ui/app-link";
import { notFound } from "next/navigation";

import { PublicShell } from "@/components/marketplace/public-shell";
import { isWebsiteDemo } from "@/lib/website-demo";
import { websiteDemoNotice } from "@/lib/website-demo-navigation";

export const metadata: Metadata = { title: "演示版说明", robots: { index: false, follow: false } };

export default async function DemoNoticePage({ searchParams }: { searchParams?: Promise<{ section?: string | string[] }> }) {
  if (!isWebsiteDemo()) notFound();
  const notice = websiteDemoNotice((await searchParams)?.section);
  return <PublicShell active={notice.active}><main className="mx-auto min-h-[65dvh] max-w-[1120px] px-4 py-8 sm:px-6 sm:py-12 lg:px-8 lg:py-16">
    <header className="max-w-2xl">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3"><h1 className="text-balance text-3xl font-semibold leading-tight tracking-[-0.025em] text-[#0b1026] sm:text-[40px]">{notice.title}</h1><span className="rounded-full bg-[#fbbf24] px-3 py-1.5 text-xs font-semibold text-[#2453ff]">演示版</span></div>
      <p className="mt-4 flex items-center gap-2 text-base font-medium leading-7 text-[#2453ff]"><LockKeyhole className="size-4 shrink-0" aria-hidden="true" />{notice.status}</p>
      <p className="mt-2 text-base leading-7 text-slate-600">{notice.description}</p>
      <div className="mt-5 flex flex-wrap gap-3"><Link href="/search" className="primary-action"><Search className="size-4" aria-hidden="true" />浏览房源</Link><Link href="/roommates" className="secondary-action"><UsersRound className="size-4" aria-hidden="true" />查看室友示例</Link></div>
    </header>
    <div className="mt-8 grid gap-7 border-t border-[#2453ff]/15 pt-6 sm:mt-10 sm:grid-cols-2 sm:gap-10 sm:pt-8">
      <section aria-labelledby="demo-browsing-title">
        <h2 id="demo-browsing-title" className="text-lg font-semibold text-[#0b1026]">现在可以体验</h2>
        <p className="mt-3 max-w-md text-sm leading-7 text-slate-600">你可以搜索示例房源、查看详情、使用地图和在此设备上收藏。房源与室友均为虚构示例，价格与匹配分数只展示界面效果。</p>
      </section>
      <section aria-labelledby="demo-private-title">
        <h2 id="demo-private-title" className="flex items-center gap-2 text-lg font-semibold text-[#0b1026]"><LockKeyhole className="size-4 shrink-0 text-[#1a3dd6]" aria-hidden="true" />真实服务暂未开放</h2>
        <p className="mt-3 max-w-md text-sm leading-7 text-slate-600">登录、申请、房东发布、聊天、上传和付款暂未开放。这里不会提交申请、建立真实匹配或处理款项。</p>
        <p className="mt-4 border-l-2 border-[#1a3dd6]/40 pl-3 text-sm leading-6 text-[#2453ff]">请勿在收藏备注中填写个人或敏感信息。</p>
      </section>
    </div>
  </main></PublicShell>;
}
