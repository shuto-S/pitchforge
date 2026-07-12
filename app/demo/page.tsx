import type { Metadata } from "next";
import { PublicDemoWorkspace } from "@/components/public-demo-workspace";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "サンプルデモ | PitchForge",
  description: "ログインなしで、PitchForgeの評価・改善・成果物生成の流れを確認できます。"
};

export default function DemoPage() {
  return (
    <main className="container py-8 lg:py-12">
      <PublicDemoWorkspace />
    </main>
  );
}
