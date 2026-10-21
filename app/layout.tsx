import type { Metadata } from "next";
import localFont from "next/font/local";

import { SavedListingsProvider } from "@/components/marketplace/saved-listings-provider";

// psw design system fonts. 资源圆体 Bold (titles, buttons) and Heavy (the slogan only) come from app/psw-fonts.css,
// split by unicode-range so a page downloads only the small files its characters need (design/psw/fonts/subset.py).
// Nunito for numbers. Body text and trust details stay on the system sans.
import "./psw-fonts.css";
import "./globals.css";

const nunito = localFont({
  src: "./fonts/nunito-variable.woff2",
  weight: "200 1000",
  variable: "--font-num",
  display: "swap"
});

export const metadata: Metadata = {
  title: {
    default: "psw｜全美学生与职场租房及室友匹配",
    template: "%s｜psw"
  },
  description: "搜索全美主要城市、学校或大企业附近的房源，并在地图上同步比较租期、通勤与信任信息。"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth" className={nunito.variable}>
      <body><SavedListingsProvider>{children}</SavedListingsProvider></body>
    </html>
  );
}
