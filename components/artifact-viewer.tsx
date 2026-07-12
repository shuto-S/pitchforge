"use client";

import { useState } from "react";
import type { ArtifactBundle } from "@/lib/schemas/artifact";
import {
  externalHttpUrlDisplayText,
  safeExternalHttpUrl,
  sanitizeCredentialBearingUrls
} from "@/lib/safe-external-url";

const tabs = [
  { key: "strategy", label: "改善方針" },
  { key: "scripts", label: "デモ台本" },
  { key: "proto", label: "紹介文" },
  { key: "visuals", label: "ビジュアル案" },
  { key: "checklist", label: "公開準備" },
  { key: "markdown", label: "Markdown" }
] as const;

type ArtifactTab = (typeof tabs)[number]["key"];
type ChecklistStatus = ArtifactBundle["checklist"]["requiredItems"][number]["status"];

function statusLabel(status: ChecklistStatus) {
  if (status === "ready") {
    return "[準備済み]";
  }
  if (status === "missing") {
    return "[不足]";
  }
  return "[要確認]";
}

function statusTone(status: ChecklistStatus): string {
  if (status === "ready") {
    return "border-emerald-400/15 bg-emerald-400/[0.07] text-emerald-300";
  }
  if (status === "missing") {
    return "border-red-400/15 bg-red-400/[0.07] text-red-300";
  }
  return "border-amber-400/15 bg-amber-400/[0.07] text-amber-300";
}

function countChecklistStatuses(items: ArtifactBundle["checklist"]["requiredItems"]): Record<
  ChecklistStatus,
  number
> {
  const counts: Record<ChecklistStatus, number> = {
    ready: 0,
    missing: 0,
    needs_review: 0
  };
  for (const item of items) {
    counts[item.status] += 1;
  }
  return counts;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      aria-live="polite"
      className="cockpit-button-secondary min-h-9 px-3 py-2 text-xs"
    >
      {copied ? "コピー済み" : "Markdownをコピー"}
    </button>
  );
}

export function ArtifactViewer({
  artifacts: persistedArtifacts
}: {
  artifacts: ArtifactBundle | null;
}) {
  const [tab, setTab] = useState<ArtifactTab>("strategy");
  const artifacts = persistedArtifacts
    ? sanitizeCredentialBearingUrls(persistedArtifacts)
    : null;

  if (!artifacts) {
    return (
      <section className="cockpit-panel p-6">
        <div className="cockpit-kicker">成果物セット</div>
        <h2 className="mt-3 text-2xl font-semibold text-white">成果物</h2>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          AI改善の完了後、台本・紹介文・ビジュアル案・公開準備を表示します。
        </p>
      </section>
    );
  }

  const checklistCounts = countChecklistStatuses(artifacts.checklist.requiredItems);

  return (
    <section className="cockpit-panel p-5 sm:p-7">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-white/[0.07] pb-6">
        <div>
          <div className="cockpit-kicker">共有できる成果物</div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">成果物</h2>
          <p className="mt-2 text-sm text-slate-400">
            台本、紹介文、ビジュアル案、公開準備を一か所に。
          </p>
        </div>
        <CopyButton text={artifacts.markdownExport} />
      </div>
      <div
        role="tablist"
        aria-label="成果物セット表示"
        aria-orientation="horizontal"
        className="mb-5 flex flex-wrap gap-1 rounded-xl border border-white/[0.07] bg-slate-950/30 p-1.5"
      >
        {tabs.map((item, index) => (
          <button
            key={item.key}
            id={`artifact-tab-${item.key}`}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            aria-controls="artifact-tabpanel"
            tabIndex={tab === item.key ? 0 : -1}
            onClick={() => setTab(item.key)}
            onKeyDown={(event) => {
              let nextIndex: number | null = null;
              if (event.key === "ArrowRight") {
                nextIndex = (index + 1) % tabs.length;
              } else if (event.key === "ArrowLeft") {
                nextIndex = (index - 1 + tabs.length) % tabs.length;
              } else if (event.key === "Home") {
                nextIndex = 0;
              } else if (event.key === "End") {
                nextIndex = tabs.length - 1;
              }
              if (nextIndex === null) {
                return;
              }
              event.preventDefault();
              const nextTab = tabs[nextIndex];
              setTab(nextTab.key);
              document.getElementById(`artifact-tab-${nextTab.key}`)?.focus();
            }}
            data-active={tab === item.key}
            className="cockpit-tab focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        id="artifact-tabpanel"
        role="tabpanel"
        aria-labelledby={`artifact-tab-${tab}`}
        tabIndex={0}
        className="rounded-xl border border-white/[0.07] bg-slate-950/35 p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 sm:p-6"
      >
        {tab === "strategy" ? (
          <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-xl border border-blue-400/15 bg-blue-500/[0.055] p-5">
              <div className="cockpit-kicker">中心メッセージ</div>
              <h3 className="mt-4 text-balance text-2xl font-semibold leading-tight text-white">
                {artifacts.directorStrategy.coreMessage}
              </h3>
              <p className="mt-4 text-sm leading-7 text-slate-300">
                {artifacts.directorStrategy.openingHook}
              </p>
            </div>
            <div className="cockpit-card p-5">
              <div className="cockpit-kicker">Google Cloud構成</div>
              <p className="mt-4 text-sm leading-7 text-slate-300">
                {artifacts.directorStrategy.gcpStory}
              </p>
            </div>
          </div>
        ) : null}
        {tab === "scripts" ? (
          <div className="space-y-5">
            {Object.values(artifacts.demoScripts).map((script) => (
              <article key={script.title} className="cockpit-card overflow-hidden">
                <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
                  <h3 className="text-sm font-semibold text-slate-100">{script.title}</h3>
                  <span className="cockpit-chip">{script.durationSec}s</span>
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[680px] border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-white/[0.07] text-left text-[10px] uppercase tracking-wider text-slate-500">
                        <th className="px-4 py-2">時間</th>
                        <th className="px-4 py-2">画面</th>
                        <th className="px-4 py-2">ナレーション</th>
                        <th className="px-4 py-2">画面テキスト</th>
                      </tr>
                    </thead>
                    <tbody>
                      {script.scenes.map((scene) => (
                        <tr
                          key={`${script.title}-${scene.startSec}`}
                          className="border-b border-white/[0.055] text-slate-300 last:border-0"
                        >
                          <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums text-blue-300">
                            {scene.startSec}-{scene.endSec}s
                          </td>
                          <td className="px-4 py-3 leading-5">{scene.visual}</td>
                          <td className="px-4 py-3 leading-5">{scene.narration}</td>
                          <td className="px-4 py-3 leading-5 text-slate-400">
                            {scene.onScreenText}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ))}
          </div>
        ) : null}
        {tab === "proto" ? (
          <dl className="grid gap-3 text-sm leading-6 lg:grid-cols-2 [&>div]:rounded-xl [&>div]:border [&>div]:border-white/[0.07] [&>div]:bg-white/[0.025] [&>div]:p-4 [&>div>dt]:text-[10px] [&>div>dt]:font-bold [&>div>dt]:uppercase [&>div>dt]:tracking-[0.12em] [&>div>dt]:text-slate-500 [&>div>dd]:mt-2 [&>div>dd]:text-slate-300">
            <div>
              <dt>タイトル</dt>
              <dd className="text-lg font-semibold text-white">
                {artifacts.protoPediaContent.title}
              </dd>
            </div>
            <div>
              <dt>概要</dt>
              <dd>{artifacts.protoPediaContent.overview}</dd>
            </div>
            <div>
              <dt>課題と背景</dt>
              <dd>{artifacts.protoPediaContent.story.problemBackground}</dd>
            </div>
            <div>
              <dt>想定ユーザー</dt>
              <dd>{artifacts.protoPediaContent.story.targetUsers}</dd>
            </div>
            <div>
              <dt>主な機能</dt>
              <dd>{artifacts.protoPediaContent.story.productFeatures}</dd>
            </div>
            <div>
              <dt>システム構成</dt>
              <dd>{artifacts.protoPediaContent.systemArchitecture}</dd>
            </div>
            <div>
              <dt>開発素材・使用技術</dt>
              <dd>
                {artifacts.protoPediaContent.developmentMaterials.length > 0 ? (
                  <ul className="flex flex-wrap gap-2">
                    {artifacts.protoPediaContent.developmentMaterials.map((material, index) => (
                      <li key={`${material}-${index}`} className="cockpit-chip">
                        {material}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-slate-500">未設定</span>
                )}
              </dd>
            </div>
            <div>
              <dt>タグ</dt>
              <dd className="flex flex-wrap gap-2">
                {artifacts.protoPediaContent.tags.length > 0 ? (
                  artifacts.protoPediaContent.tags.map((tag, index) => (
                    <span
                      key={`${tag}-${index}`}
                      className="rounded-full border border-blue-400/15 bg-blue-500/[0.07] px-3 py-1 text-xs font-semibold text-blue-200"
                    >
                      {tag}
                    </span>
                  ))
                ) : (
                  <span className="text-slate-500">未設定</span>
                )}
              </dd>
            </div>
            <div className="lg:col-span-2">
              <dt>関連URL</dt>
              <dd>
                {artifacts.protoPediaContent.relatedUrls.length > 0 ? (
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {artifacts.protoPediaContent.relatedUrls.map((relatedUrl, index) => {
                      const safeUrl = safeExternalHttpUrl(relatedUrl.url);
                      return (
                        <li
                          key={`${relatedUrl.label}-${index}`}
                          className="rounded-lg bg-slate-950/40 p-3"
                        >
                          <div className="text-xs font-semibold text-slate-200">
                            {relatedUrl.label}
                          </div>
                          {safeUrl ? (
                            <a
                              href={safeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1 block break-all text-xs text-blue-300 underline underline-offset-2"
                            >
                              {safeUrl}
                            </a>
                          ) : (
                            <div className="mt-1 break-all text-xs text-slate-500">
                              <span>{externalHttpUrlDisplayText(relatedUrl.url)}</span>
                              <span className="ml-2 font-semibold">（安全基準外のためリンク無効）</span>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <span className="text-slate-500">未設定</span>
                )}
              </dd>
            </div>
          </dl>
        ) : null}
        {tab === "visuals" ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {artifacts.visualConcepts.thumbnailIdeas.map((idea, index) => (
              <article key={idea.title} className="cockpit-card p-5">
                <div className="cockpit-kicker">案 {String(index + 1).padStart(2, "0")}</div>
                <h3 className="mt-3 font-semibold text-slate-100">{idea.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-300">{idea.concept}</p>
                <p className="mt-4 rounded-lg bg-slate-950/45 p-3 text-xs leading-5 text-slate-500">
                  {idea.imagePrompt}
                </p>
              </article>
            ))}
          </div>
        ) : null}
        {tab === "checklist" ? (
          <div className="space-y-6">
            <div>
              <div className="cockpit-kicker">公開準備</div>
              <h3 className="mt-3 text-xl font-semibold text-white">公開前チェック</h3>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                外部URLの公開状態は送信前に人が確認。
              </p>
              <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.06] p-4">
                  <dt className="text-[10px] font-bold tracking-wider text-emerald-400">準備済み</dt>
                  <dd>
                    <div className="mt-2 text-3xl font-semibold tabular-nums text-emerald-200">
                      {checklistCounts.ready}
                    </div>
                    <p className="mt-1 text-xs text-emerald-200/60">準備済み</p>
                  </dd>
                </div>
                <div className="rounded-xl border border-red-400/15 bg-red-400/[0.06] p-4">
                  <dt className="text-[10px] font-bold tracking-wider text-red-400">不足</dt>
                  <dd>
                    <div className="mt-2 text-3xl font-semibold tabular-nums text-red-200">
                      {checklistCounts.missing}
                    </div>
                    <p className="mt-1 text-xs text-red-200/60">追加が必要</p>
                  </dd>
                </div>
                <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.06] p-4">
                  <dt className="text-[10px] font-bold tracking-wider text-amber-400">要確認</dt>
                  <dd>
                    <div className="mt-2 text-3xl font-semibold tabular-nums text-amber-200">
                      {checklistCounts.needs_review}
                    </div>
                    <p className="mt-1 text-xs text-amber-200/60">人の確認が必要</p>
                  </dd>
                </div>
              </dl>
            </div>
            <div className="grid gap-2">
              {artifacts.checklist.requiredItems.map((item, index) => (
                <div
                  key={`${item.label}-${index}`}
                  className="grid gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-4 sm:grid-cols-[7rem_1fr]"
                >
                  <span
                    className={`h-fit w-fit rounded-md border px-2 py-1 text-[10px] font-bold ${statusTone(
                      item.status
                    )}`}
                  >
                    {statusLabel(item.status)}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-200">{item.label}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">{item.note}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="cockpit-card p-5">
                <div className="cockpit-kicker">次の改善</div>
                <h3 className="mt-3 font-semibold text-slate-100">推奨修正</h3>
              {artifacts.checklist.recommendedFixes.length > 0 ? (
                  <ol className="mt-4 space-y-3 text-xs leading-5 text-slate-400">
                  {artifacts.checklist.recommendedFixes.map((fix, index) => (
                      <li key={`${fix}-${index}`} className="flex gap-3">
                        <span className="font-semibold tabular-nums text-blue-400">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        {fix}
                      </li>
                  ))}
                  </ol>
              ) : (
                  <p className="mt-3 text-xs text-slate-500">追加修正なし。</p>
              )}
              </div>
              <div className="rounded-xl border border-blue-400/15 bg-blue-500/[0.055] p-5">
                <div className="cockpit-kicker">レビューまとめ</div>
                <h3 className="mt-3 font-semibold text-slate-100">確認ポイント</h3>
                <p className="mt-4 text-sm leading-6 text-slate-300">
                  {artifacts.checklist.finalSubmissionAdvice}
                </p>
              </div>
            </div>
          </div>
        ) : null}
        {tab === "markdown" ? (
          <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-[#070a12]">
            <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
              <div className="flex gap-1.5" aria-hidden="true">
                <span className="h-2 w-2 rounded-full bg-red-400/70" />
                <span className="h-2 w-2 rounded-full bg-amber-400/70" />
                <span className="h-2 w-2 rounded-full bg-emerald-400/70" />
              </div>
              <span className="text-[10px] font-bold tracking-wider text-slate-600">
                PITCHFORGE.MD
              </span>
            </div>
            <pre className="max-h-[560px] overflow-auto whitespace-pre-wrap p-5 font-mono text-xs leading-6 text-slate-300">
              {artifacts.markdownExport}
            </pre>
          </div>
        ) : null}
      </div>
    </section>
  );
}
