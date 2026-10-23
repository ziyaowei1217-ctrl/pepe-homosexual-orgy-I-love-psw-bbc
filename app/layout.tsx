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

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "psw｜留学生之间的转租",
    template: "%s｜psw"
  },
  description: "留学生之间的转租：按城市、学校找能租的房间，选好日期就能看到这段日期的总价。"
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
