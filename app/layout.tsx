import type { Metadata, Viewport } from "next";

import { SavedListingsProvider } from "@/components/marketplace/saved-listings-provider";
import { isWebsiteDemo } from "@/lib/website-demo";

import "./globals.css";

// Per-request CSP nonces must be rendered alongside the matching HTML scripts.
export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export const metadata: Metadata = {
  ...(isWebsiteDemo() ? { robots: { index: false, follow: false } } : {}),
  title: {
    default: "psw｜留学生转租、接租与室友",
    template: "%s｜psw"
  },
  description: "面向留学生的转租与接租平台，按学校周边、月租和可租日期查找房源，衔接回国、异地实习与毕业换房的居住安排。"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth">
      <body>
        {isWebsiteDemo() ? <aside aria-label="演示版说明" className="border-b border-[#416F5A]/25 bg-[#E9F2A9] px-4 py-3 text-center text-xs font-semibold leading-5 text-[#234B3B] sm:text-sm">
          DEMO 演示版 · 房源、室友与匹配分数均为虚构示例。可搜索、查看和本机收藏；不提供登录、聊天、申请或付款。
        </aside> : null}
        <SavedListingsProvider>{children}</SavedListingsProvider>
      </body>
    </html>
  );
}
