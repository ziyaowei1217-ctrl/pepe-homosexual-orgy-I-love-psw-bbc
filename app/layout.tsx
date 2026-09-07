import type { Metadata } from "next";

import { SavedListingsProvider } from "@/components/marketplace/saved-listings-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Sublet Pipeline｜全美学生与职场租房及室友匹配",
    template: "%s｜Sublet Pipeline"
  },
  description: "搜索全美主要城市、学校或大企业附近的房源，并在地图上同步比较租期、通勤与信任信息。"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth">
      <body><SavedListingsProvider>{children}</SavedListingsProvider></body>
    </html>
  );
}
