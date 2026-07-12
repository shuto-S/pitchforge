"use client";

import { useState } from "react";
import Link from "next/link";
import { ArtifactViewer } from "@/components/artifact-viewer";
import { DirectorRoom } from "@/components/director-room";
import { ScoreBoard } from "@/components/score-board";
import {
  publicDemoArtifacts,
  publicDemoBaselineScore,
  publicDemoEvents,
  publicDemoFinalScore,
  publicDemoProject,
  publicDemoRun
} from "@/lib/demo/public-demo";

const tabs = [
  { key: "overview", label: "概要" },
  { key: "director", label: "AI改善フロー" },
  { key: "score", label: "5観点評価" },
  { key: "artifacts", label: "成果物" }
] as const;

type DemoTab = (typeof tabs)[number]["key"];

export function PublicDemoWorkspace() {
  const [tab, setTab] = useState<DemoTab>("overview");

  return (
    <div className="space-y-5">
      <header className="cockpit-panel p-5 sm:p-7">
        <div className="flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0 max-w-3xl">
            <div className="cockpit-kicker flex items-center gap-2">
              <Link href="/" className="hover:text-blue-300">PitchForge</Link>
              <span className="text-slate-700">/</span>
              読み取り専用デモ
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
              {publicDemoProject.title}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              {publicDemoProject.oneLiner}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="cockpit-chip"><span className="cockpit-dot" /> サンプルデータ</span>
              <span className="cockpit-chip">保存されません</span>
              <span className="cockpit-chip">AI・外部APIは実行されません</span>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="cockpit-card min-w-52 px-4 py-3">
              <div className="cockpit-kicker">評価差分</div>
              <div className="mt-2 flex items-baseline gap-2 font-semibold tabular-nums">
                <span className="text-xl text-slate-500">58</span>
                <span className="text-slate-700">→</span>
                <span className="text-3xl text-blue-300">86</span>
                <span className="ml-auto text-xs text-emerald-400">+28</span>
              </div>
            </div>
            <Link
              href="/login?next=%2Fprojects%2Fnew"
              prefetch={false}
              className="cockpit-button-primary min-w-52"
            >
              自分のプロジェクトを評価
            </Link>
          </div>
        </div>
      </header>

      <nav
        role="tablist"
        aria-label="サンプルワークスペース表示"
        aria-orientation="horizontal"
        className="cockpit-panel flex flex-wrap gap-1 p-1.5"
      >
        {tabs.map((item, index) => (
          <button
            key={item.key}
            id={`demo-tab-${item.key}`}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            aria-controls="demo-tabpanel"
            tabIndex={tab === item.key ? 0 : -1}
            onClick={() => setTab(item.key)}
            onKeyDown={(event) => {
              let nextIndex: number | null = null;
              if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
              if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
              if (event.key === "Home") nextIndex = 0;
              if (event.key === "End") nextIndex = tabs.length - 1;
              if (nextIndex === null) return;
              event.preventDefault();
              const nextTab = tabs[nextIndex];
              setTab(nextTab.key);
              document.getElementById(`demo-tab-${nextTab.key}`)?.focus();
            }}
            data-active={tab === item.key}
            className="cockpit-tab focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div
        id="demo-tabpanel"
        role="tabpanel"
        aria-labelledby={`demo-tab-${tab}`}
        tabIndex={0}
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
      >
        {tab === "overview" ? (
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="cockpit-panel p-5 sm:p-6">
              <div className="cockpit-kicker">01 / 課題</div>
              <h2 className="mt-3 text-xl font-semibold text-white">解決する課題</h2>
              <p className="mt-4 text-sm leading-7 text-slate-300">{publicDemoProject.problem}</p>
            </section>
            <section className="cockpit-panel p-5 sm:p-6">
              <div className="cockpit-kicker">02 / AIの判断</div>
              <h2 className="mt-3 text-xl font-semibold text-white">観察 → 判断 → 実行</h2>
              <p className="mt-4 text-sm leading-7 text-slate-300">{publicDemoProject.aiAgentBehavior}</p>
            </section>
            <section className="cockpit-panel p-5 sm:p-6 lg:col-span-2">
              <div className="cockpit-kicker">03 / Google Cloud</div>
              <h2 className="mt-3 text-xl font-semibold text-white">AIとクラウドの役割</h2>
              <p className="mt-4 max-w-4xl text-sm leading-7 text-slate-300">{publicDemoProject.gcpUsage}</p>
              <div className="mt-5 grid gap-2 sm:grid-cols-4">
                {[
                  ["Cloud Run", "Web体験"],
                  ["Gemini", "理解・生成"],
                  ["Cloud SQL", "履歴"],
                  ["Cloud Storage", "素材"]
                ].map(([service, role]) => (
                  <div key={service} className="cockpit-card p-3">
                    <div className="text-xs font-semibold text-slate-200">{service}</div>
                    <div className="mt-1 text-[11px] text-slate-500">{role}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : null}
        {tab === "director" ? <DirectorRoom run={publicDemoRun} events={publicDemoEvents} /> : null}
        {tab === "score" ? <ScoreBoard baselineScore={publicDemoBaselineScore} finalScore={publicDemoFinalScore} /> : null}
        {tab === "artifacts" ? <ArtifactViewer artifacts={publicDemoArtifacts} /> : null}
      </div>

      <section className="cockpit-panel flex flex-col items-start justify-between gap-5 p-5 sm:flex-row sm:items-center sm:p-7">
        <div>
          <div className="cockpit-kicker">次のステップ</div>
          <h2 className="mt-2 text-xl font-semibold text-white">自分のプロダクトを評価する</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">ログイン後はGitHubから下書きを作り、AI評価と資料生成を実行できます。</p>
        </div>
        <Link
          href="/login?next=%2Fprojects%2Fnew"
          prefetch={false}
          className="cockpit-button-primary shrink-0"
        >
          ログインして始める
        </Link>
      </section>
    </div>
  );
}
