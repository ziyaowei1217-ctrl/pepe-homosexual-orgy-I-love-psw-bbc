import type { Metadata } from "next";
import localFont from "next/font/local";

import { SavedListingsProvider } from "@/components/marketplace/saved-listings-provider";

import "./globals.css";

// psw design system fonts. 资源圆体: the app uses Bold only (titles, buttons); Heavy is kept for covers and big slogans.
// Nunito for numbers. Body text and trust details stay on the system sans.
const pswRounded = localFont({
  // One Bold face answers every bold weight (600–900), so font-black titles render Bold rather than Heavy or faux bold.
  src: [{ path: "./fonts/psw-rounded-bold.woff2", weight: "600 900", style: "normal" }],
  variable: "--font-rounded",
  display: "swap",
  // The CJK subsets are large; let the browser fetch them when a title needs them instead of preloading.
  preload: false,
  fallback: ["PingFang SC", "Microsoft YaHei", "sans-serif"]
});

const pswSlogan = localFont({
  src: [{ path: "./fonts/psw-rounded-heavy.woff2", weight: "600 900", style: "normal" }],
  variable: "--font-slogan",
  display: "swap",
  preload: false,
  fallback: ["PingFang SC", "Microsoft YaHei", "sans-serif"]
});

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
    <html lang="zh-CN" data-scroll-behavior="smooth" className={`${pswRounded.variable} ${pswSlogan.variable} ${nunito.variable}`}>
      <body><SavedListingsProvider>{children}</SavedListingsProvider></body>
    </html>
  );
}
