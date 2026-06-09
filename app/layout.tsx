import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Sublet Pipeline",
  description: "High-trust sublet marketplace and co-living matching platform."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
