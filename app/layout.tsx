import type { Metadata } from "next";
import { SiteHeader } from "@/components/auth/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "PitchForge",
  description:
    "AI director studio for turning rough hackathon prototypes into judge-ready submissions."
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
