import Link from "next/link";
import { GcpProof } from "@/components/gcp-proof";

const steps = [
  {
    title: "作品理解",
    body: "雑な説明、URL、GCP利用内容、スクリーンショットを一つのブリーフに整理します。"
  },
  {
    title: "辛口採点",
    body: "AI審査員がハッカソン基準で弱点を見つけ、改善前スコアを出します。"
  },
  {
    title: "提出物生成",
    body: "AI監督室が台本、Proto Pedia文、サムネ案、チェックリストを生成します。"
  }
];

const beforeAfter = [
  ["Before", "ユーザーの声をAIで分類するやつ。GCPを使っています。"],
  [
    "After",
    "問い合わせの山から改善優先度を判断し、FAQとIssueまで作るユーザーインサイト監督エージェント。"
  ]
];

export default function HomePage() {
  return (
    <main>
      <section className="studio-grid border-b border-line">
        <div className="container grid min-h-[92vh] items-center gap-10 py-10 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="max-w-3xl">
            <div className="mb-5 inline-flex rounded-full border border-line bg-panel px-4 py-2 text-sm text-muted">
              Cloud Run + Gemini + Firestore + Cloud Storage
            </div>
            <h1 className="text-5xl font-semibold leading-[1.02] tracking-normal text-ink md:text-7xl">
              そのプロトタイプ、まだ伝わる作品になっていない。
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">
              PitchForgeは、AI監督とAI審査員がハッカソン作品をレビューし、
              デモ動画・提出文・サムネイル・ピッチ構成まで磨き込むAIエージェントスタジオです。
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/projects/new"
                className="rounded-md bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forge"
              >
                作品をAI監督に見せる
              </Link>
              <Link
                href="/projects/new?sample=1"
                className="rounded-md border border-line bg-panel px-5 py-3 text-sm font-semibold text-ink transition hover:border-ink"
              >
                サンプルで試す
              </Link>
            </div>
          </div>

          <div className="rounded-lg border border-line bg-panel p-5 shadow-soft">
            <div className="mb-4 flex items-center justify-between border-b border-line pb-3">
              <span className="text-sm font-semibold">Director Room Preview</span>
              <span className="text-xs text-muted">Score 48 {"->"} 86</span>
            </div>
            <div className="space-y-4">
              {beforeAfter.map(([label, text]) => (
                <div key={label} className="rounded-md border border-line bg-white p-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                    {label}
                  </div>
                  <p className="text-base leading-7">{text}</p>
                </div>
              ))}
              <div className="grid gap-3 sm:grid-cols-3">
                {["AI監督", "AI審査員", "AI脚本家"].map((agent) => (
                  <div key={agent} className="rounded-md bg-ink px-3 py-4 text-white">
                    <div className="text-sm font-semibold">{agent}</div>
                    <div className="mt-2 h-2 rounded bg-white/20">
                      <div className="h-2 w-4/5 rounded bg-forge" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="container grid gap-6 py-16 md:grid-cols-3">
        {steps.map((step, index) => (
          <article key={step.title} className="border-t border-line pt-6">
            <div className="text-sm font-semibold text-forge">0{index + 1}</div>
            <h2 className="mt-3 text-2xl font-semibold">{step.title}</h2>
            <p className="mt-3 leading-7 text-muted">{step.body}</p>
          </article>
        ))}
      </section>

      <section className="container pb-20">
        <GcpProof />
      </section>
    </main>
  );
}
