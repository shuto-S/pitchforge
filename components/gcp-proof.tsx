"use client";

import { useEffect, useState } from "react";

type RuntimeStatus = {
  runtimeMode: string;
  aiMode: string;
  datastoreMode: string;
  storageMode: string;
  authMode: string;
  cloudRunService: string;
  googleCloudProject: string;
  gcsBucket: string;
};

const proofItems = [
  {
    code: "RUN",
    title: "Cloud Run",
    body: "Next.js UI/APIをコンテナで実行。WebアプリとAIワークフローを一体化。",
    tone: "text-blue-300"
  },
  {
    code: "AI",
    title: "Gemini / Vertex AI",
    body: "説明と画像を理解し、5観点評価、改善対象の選択、再評価まで実行。",
    tone: "text-indigo-300"
  },
  {
    code: "DB",
    title: "Cloud SQL",
    body: "プロジェクト、実行履歴、スコア、成果物をPostgreSQLへ一貫保存。",
    tone: "text-cyan-300"
  },
  {
    code: "OBJ",
    title: "Cloud Storage",
    body: "プロダクト画面と参考素材を保存し、Geminiの内容理解へ接続。",
    tone: "text-emerald-300"
  },
  {
    code: "AUTH",
    title: "DB Auth / Owner Scope",
    body: "Cloud SQLへ事前登録したID・パスワードで認証し、owner単位でデータを分離。",
    tone: "text-violet-300"
  }
];

export function GcpProof() {
  const [status, setStatus] = useState<RuntimeStatus | null>(null);

  useEffect(() => {
    fetch("/api/system/status")
      .then((response) => response.json())
      .then(setStatus)
      .catch(() => undefined);
  }, []);

  return (
    <section className="cockpit-panel p-5 sm:p-7">
      <div className="flex flex-col gap-6 border-b border-white/[0.07] pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <div className="cockpit-kicker">Google Cloud構成</div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            継続運用できるプロダクト基盤。
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            実行、AI判断、履歴、素材、所有者分離を一つのワークフローにつなぎます。
          </p>
        </div>
        {status ? (
          <div
            aria-live="polite"
            className="grid min-w-0 grid-cols-2 gap-x-6 gap-y-2 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.045] px-4 py-3 text-xs sm:grid-cols-4"
          >
            <div>
              <div className="text-slate-500">実行環境</div>
              <div className="mt-1 font-semibold text-emerald-300">{status.runtimeMode}</div>
            </div>
            <div>
              <div className="text-slate-500">AI</div>
              <div className="mt-1 font-semibold text-emerald-300">{status.aiMode}</div>
            </div>
            <div>
              <div className="text-slate-500">Data</div>
              <div className="mt-1 font-semibold text-emerald-300">
                {status.datastoreMode} / {status.storageMode}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Auth</div>
              <div className="mt-1 font-semibold text-emerald-300">{status.authMode}</div>
            </div>
          </div>
        ) : (
          <div className="cockpit-chip">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-600" />
            構成を確認中
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr))]">
        {proofItems.map((item) => (
          <article key={item.code} className="cockpit-card min-w-0 p-4">
            <div className={`text-[10px] font-bold tracking-[0.16em] ${item.tone}`}>
              {item.code}
            </div>
            <h3 className="mt-4 text-sm font-semibold text-slate-100">{item.title}</h3>
            <p className="mt-2 text-xs leading-5 text-slate-400">{item.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
