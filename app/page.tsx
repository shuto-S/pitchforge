import Link from "next/link";
import { GcpProof } from "@/components/gcp-proof";

const decisionLoop = ["理解", "評価", "選択", "改善", "再評価"];

const outputs = ["30/90秒台本", "紹介ページ本文", "5観点スコア", "構成図", "公開チェック"];

const stack = ["Cloud Run", "Gemini", "Cloud SQL", "Cloud Storage"];

const steps = [
  {
    number: "01",
    label: "自動入力",
    title: "GitHub URLから始める",
    body: "概要、課題、技術構成を読み取り、編集できる下書きにします。"
  },
  {
    number: "02",
    label: "改善判断",
    title: "弱点に合わせて資料を磨く",
    body: "5つの観点で評価。弱い観点に合わせて資料を整え、伝わり方を再評価します。"
  },
  {
    number: "03",
    label: "成果物",
    title: "共有できる形にする",
    body: "台本、紹介文、構成図、公開チェックを一つの成果物セットへ。"
  }
];

export default function HomePage() {
  return (
    <main className="overflow-hidden">
      <section className="studio-grid border-b border-white/[0.06]">
        <div className="container grid min-h-[44rem] items-center gap-14 py-14 lg:grid-cols-[0.92fr_1.08fr] lg:py-16">
          <div className="relative z-10 max-w-3xl">
            <div className="cockpit-kicker mb-6 flex items-center gap-3">
              <span className="cockpit-dot" />
              AIプロダクト評価
            </div>
            <h1 className="text-balance text-5xl font-semibold leading-[1.02] tracking-[-0.045em] text-white md:text-6xl">
              プロダクトの価値を、
              <span className="mt-2 block bg-gradient-to-r from-blue-300 via-blue-400 to-indigo-400 bg-clip-text text-transparent">
                5つの観点で磨く。
              </span>
            </h1>
            <p className="mt-7 max-w-xl text-pretty text-base leading-7 text-slate-400 md:text-lg md:leading-8">
              GitHub URLから基本情報を自動入力。AIが5観点で評価し、改善とレビュー資料まで仕上げます。
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/projects/new" className="cockpit-button-primary px-5">
                プロジェクトを評価
              </Link>
              <Link href="/projects/new?sample=1" className="cockpit-button-secondary px-5">
                サンプルで試す
              </Link>
            </div>
            <div className="mt-9 flex flex-wrap gap-2">
              <span className="cockpit-chip">GitHubから自動入力</span>
              <span className="cockpit-chip">5観点評価</span>
              <span className="cockpit-chip">改善・資料生成</span>
            </div>
          </div>

          <div className="cockpit-panel p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] pb-4">
              <div>
                <div className="cockpit-kicker">画面イメージ</div>
                <div className="mt-1 text-sm font-semibold text-slate-200">改善状況</div>
              </div>
              <div className="cockpit-chip">
                <span className="cockpit-dot" />
                サンプル
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_13rem]">
              <div className="cockpit-card p-4">
                <div className="cockpit-kicker">01 / 課題</div>
                <p className="mt-3 text-sm leading-6 text-slate-200">
                  実装の価値と技術構成を、短時間で伝わる形に整理できていない。
                </p>
              </div>
              <div className="rounded-xl border border-blue-400/20 bg-blue-500/[0.08] p-4">
                <div className="cockpit-kicker">評価差分</div>
                <div className="mt-3 flex items-baseline gap-2 font-semibold tabular-nums">
                  <span className="text-2xl text-slate-500">58</span>
                  <span className="text-slate-600">→</span>
                  <span className="text-4xl tracking-tight text-blue-300">86</span>
                </div>
                <div className="mt-2 text-xs font-semibold text-emerald-400">+28 改善</div>
              </div>
            </div>

            <div className="cockpit-card mt-4 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="cockpit-kicker">02 / AI改善サイクル</div>
                <div className="text-[11px] text-slate-500">評価 → 選択 → 改訂</div>
              </div>
              <ol className="mt-4 grid grid-cols-5 gap-1.5" aria-label="AI改善ループ">
                {decisionLoop.map((step, index) => (
                  <li
                    key={step}
                    className="rounded-lg border border-white/[0.07] bg-slate-950/50 px-2 py-3 text-center"
                  >
                    <div className="text-[10px] font-semibold tabular-nums text-blue-400">
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <div className="mt-1 text-xs font-semibold text-slate-200">{step}</div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="cockpit-card p-4">
                <div className="cockpit-kicker">03 / 成果物</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {outputs.map((output) => (
                    <span key={output} className="cockpit-chip">
                      {output}
                    </span>
                  ))}
                </div>
              </div>
              <div className="cockpit-card p-4">
                <div className="cockpit-kicker">04 / 実行基盤</div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-semibold text-slate-300">
                  {stack.map((item) => (
                    <div key={item} className="rounded-md bg-white/[0.035] px-2.5 py-2">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="container py-20">
        <div className="max-w-2xl">
          <div className="cockpit-kicker">評価から審査・レビュー資料まで</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">
            評価で終わらず、改善と資料作成まで。
          </h2>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {steps.map((step) => (
            <article key={step.number} className="cockpit-card p-6">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold tabular-nums text-blue-400">
                  {step.number}
                </span>
                <span className="cockpit-kicker">{step.label}</span>
              </div>
              <h3 className="mt-8 text-xl font-semibold text-slate-100">{step.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-400">{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="container pb-24">
        <GcpProof />
      </section>
    </main>
  );
}
