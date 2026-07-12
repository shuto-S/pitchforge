import type { Metadata } from "next";
import { SiteHeader } from "@/components/auth/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "PitchForge",
  description:
    "プロダクトを5つの観点で評価し、改善から審査・レビュー向け資料作成まで支えるAIワークスペース。"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
