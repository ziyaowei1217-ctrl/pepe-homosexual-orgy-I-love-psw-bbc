import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PublicShell } from "@/components/marketplace/public-shell";
import { isWebsiteDemo } from "@/lib/website-demo";

export const metadata: Metadata = { title: "演示版说明", robots: { index: false, follow: false } };

export default function DemoNoticePage() {
  if (!isWebsiteDemo()) notFound();
  return <PublicShell active="discover"><main className="mx-auto flex min-h-[65dvh] max-w-2xl flex-col justify-center px-5 py-12">
    <p className="text-sm font-bold text-blue-700">Sublet Pipeline · 演示版</p>
    <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">这个演示仅供浏览</h1>
    <p className="mt-5 text-base leading-7 text-slate-600">你可以搜索示例房源、查看详情、使用地图和在此设备上收藏。房源与室友均为虚构示例，价格与匹配分数只展示界面效果。</p>
    <p className="mt-4 text-base leading-7 text-slate-600">登录、申请、房东发布、聊天、上传和付款暂未开放。这里不会提交申请、建立真实匹配或处理款项。请勿在收藏备注中填写个人或敏感信息。</p>
    <div className="mt-8 flex flex-wrap gap-3"><Link href="/search" className="primary-action">浏览房源</Link><Link href="/roommates" className="secondary-action">查看室友示例</Link></div>
  </main></PublicShell>;
}
