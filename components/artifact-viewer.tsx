"use client";

import { useState } from "react";
import type { ArtifactBundle } from "@/lib/schemas/artifact";

const tabs = [
  "Strategy",
  "Demo Scripts",
  "Proto Pedia",
  "Visual Concepts",
  "Checklist",
  "Markdown"
] as const;

type ArtifactTab = (typeof tabs)[number];

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
      className="rounded-md border border-line bg-white px-3 py-2 text-xs font-semibold hover:border-ink"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function ArtifactViewer({ artifacts }: { artifacts: ArtifactBundle | null }) {
  const [tab, setTab] = useState<ArtifactTab>("Strategy");

  if (!artifacts) {
    return (
      <section className="rounded-lg border border-line bg-panel p-5 shadow-soft">
        <h2 className="text-xl font-semibold">Artifacts</h2>
        <p className="mt-3 text-sm leading-6 text-muted">
          run完了後に台本、提出文、サムネイル案、チェックリストが表示されます。
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-line bg-panel p-5 shadow-soft">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Artifacts</h2>
        <CopyButton text={artifacts.markdownExport} />
      </div>
      <div className="mb-5 flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`rounded-md px-3 py-2 text-sm font-semibold ${
              tab === item ? "bg-ink text-white" : "border border-line bg-white text-ink"
            }`}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="rounded-md border border-line bg-white p-5">
        {tab === "Strategy" ? (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">{artifacts.directorStrategy.coreMessage}</h3>
            <p className="leading-7">{artifacts.directorStrategy.openingHook}</p>
            <p className="leading-7 text-muted">{artifacts.directorStrategy.gcpStory}</p>
          </div>
        ) : null}
        {tab === "Demo Scripts" ? (
          <div className="space-y-6">
            {Object.values(artifacts.demoScripts).map((script) => (
              <article key={script.title}>
                <h3 className="font-semibold">
                  {script.title} / {script.durationSec}s
                </h3>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[680px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-line text-left">
                        <th className="py-2">Time</th>
                        <th className="py-2">Visual</th>
                        <th className="py-2">Narration</th>
                        <th className="py-2">Text</th>
                      </tr>
                    </thead>
                    <tbody>
                      {script.scenes.map((scene) => (
                        <tr key={`${script.title}-${scene.startSec}`} className="border-b border-line">
                          <td className="py-3 pr-3">{scene.startSec}-{scene.endSec}s</td>
                          <td className="py-3 pr-3">{scene.visual}</td>
                          <td className="py-3 pr-3">{scene.narration}</td>
                          <td className="py-3">{scene.onScreenText}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ))}
          </div>
        ) : null}
        {tab === "Proto Pedia" ? (
          <div className="space-y-4 leading-7">
            <h3 className="text-lg font-semibold">{artifacts.protoPediaContent.title}</h3>
            <p>{artifacts.protoPediaContent.overview}</p>
            <p>{artifacts.protoPediaContent.story.problemBackground}</p>
            <p>{artifacts.protoPediaContent.story.productFeatures}</p>
            <p className="text-muted">{artifacts.protoPediaContent.systemArchitecture}</p>
          </div>
        ) : null}
        {tab === "Visual Concepts" ? (
          <div className="space-y-4">
            {artifacts.visualConcepts.thumbnailIdeas.map((idea) => (
              <article key={idea.title} className="border-b border-line pb-4 last:border-b-0">
                <h3 className="font-semibold">{idea.title}</h3>
                <p className="mt-2 leading-7">{idea.concept}</p>
                <p className="mt-2 text-sm text-muted">{idea.imagePrompt}</p>
              </article>
            ))}
          </div>
        ) : null}
        {tab === "Checklist" ? (
          <div className="space-y-3">
            {artifacts.checklist.requiredItems.map((item) => (
              <div key={item.label} className="flex gap-3 border-b border-line pb-3 last:border-b-0">
                <span className="font-semibold">
                  {item.status === "ready" ? "[x]" : item.status === "missing" ? "[ ]" : "[!]"}
                </span>
                <div>
                  <div className="font-semibold">{item.label}</div>
                  <div className="text-sm leading-6 text-muted">{item.note}</div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {tab === "Markdown" ? (
          <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap text-sm leading-6">
            {artifacts.markdownExport}
          </pre>
        ) : null}
      </div>
    </section>
  );
}
