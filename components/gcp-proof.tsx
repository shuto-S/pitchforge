"use client";

import { useEffect, useState } from "react";

type RuntimeStatus = {
  runtimeMode: string;
  aiMode: string;
  datastoreMode: string;
  storageMode: string;
  cloudRunService: string;
  googleCloudProject: string;
  gcsBucket: string;
};

const proofItems = [
  {
    title: "Cloud Run",
    body: "Next.js APIとUIをコンテナで公開し、提出URLとして使える実行基盤にします。"
  },
  {
    title: "Gemini / Vertex AI",
    body: "作品説明とスクリーンショットを読み、審査・改善・提出物生成を担当します。"
  },
  {
    title: "Firestore",
    body: "プロジェクト、run、AI監督室のイベント、スコア履歴を保存します。"
  },
  {
    title: "Cloud Storage",
    body: "スクリーンショットや生成物を保存し、AI処理と提出準備に接続します。"
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
    <div className="rounded-lg border border-line bg-panel p-6 shadow-soft">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">GCP Proof</h2>
          <p className="mt-2 max-w-2xl leading-7 text-muted">
            PitchForgeは、公開実行、AI生成、履歴保存、画像保存が一つの流れで見える
            Google Cloudプロダクトです。
          </p>
        </div>
        {status ? (
          <div className="rounded-md border border-line bg-white px-4 py-3 text-sm">
            <div>Runtime: {status.runtimeMode}</div>
            <div>AI: {status.aiMode}</div>
            <div>
              DB/Storage: {status.datastoreMode} / {status.storageMode}
            </div>
          </div>
        ) : null}
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {proofItems.map((item) => (
          <article key={item.title} className="rounded-md border border-line bg-white p-4">
            <h3 className="font-semibold">{item.title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted">{item.body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
