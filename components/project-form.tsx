"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type FormState = {
  title: string;
  oneLiner: string;
  description: string;
  problem: string;
  targetUsers: string;
  productUrl: string;
  githubUrl: string;
  gcpUsage: string;
  aiAgentBehavior: string;
  techStack: string;
};

const emptyForm: FormState = {
  title: "",
  oneLiner: "",
  description: "",
  problem: "",
  targetUsers: "",
  productUrl: "",
  githubUrl: "",
  gcpUsage: "",
  aiAgentBehavior: "",
  techStack: "Cloud Run, Gemini API, Firestore, Cloud Storage"
};

const sampleForm: FormState = {
  title: "UserSignal Lake Agent",
  oneLiner: "ユーザーの声をAIで分類するやつ。GCPを使っています。",
  description:
    "問い合わせ、レビュー、Slackの声をまとめて、何から改善すべきかをAIが判断するプロトタイプです。まだ提出文やデモ台本が弱く、価値が伝わりにくい状態です。",
  problem:
    "問い合わせやレビューが多すぎて、開発チームが何から直すべきかわからない。",
  targetUsers: "SaaSのPM、カスタマーサクセス、開発チーム",
  productUrl: "",
  githubUrl: "",
  gcpUsage: "Cloud RunでWebアプリを実行し、Gemini APIで分類と要約、BigQueryで分析します。",
  aiAgentBehavior:
    "ユーザーの声を分類し、改善優先度を判断し、FAQ案とGitHub Issue案を生成する。",
  techStack: "Cloud Run, Gemini API, BigQuery, Firestore"
};

const fields: {
  name: keyof FormState;
  label: string;
  type: "input" | "textarea";
  required?: boolean;
}[] = [
  { name: "title", label: "作品名", type: "input", required: true },
  { name: "oneLiner", label: "一言説明", type: "input", required: true },
  { name: "description", label: "ざっくり概要", type: "textarea", required: true },
  { name: "problem", label: "解決したい課題", type: "textarea", required: true },
  { name: "targetUsers", label: "想定ユーザー", type: "textarea", required: true },
  { name: "productUrl", label: "プロダクトURL", type: "input" },
  { name: "githubUrl", label: "GitHub URL", type: "input" },
  { name: "gcpUsage", label: "GCPの利用内容", type: "textarea", required: true },
  {
    name: "aiAgentBehavior",
    label: "AIエージェントとしての振る舞い",
    type: "textarea",
    required: true
  },
  { name: "techStack", label: "利用技術（カンマ区切り）", type: "input" }
];

export function ProjectForm({ useSample }: { useSample: boolean }) {
  const router = useRouter();
  const initial = useMemo(() => (useSample ? sampleForm : emptyForm), [useSample]);
  const [form, setForm] = useState<FormState>(initial);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          techStack: form.techStack
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Project creation failed");
      }

      if (files.length > 0) {
        const data = new FormData();
        files.forEach((file) => data.append("files", file));
        const upload = await fetch(`/api/projects/${payload.projectId}/assets`, {
          method: "POST",
          body: data
        });
        if (!upload.ok) {
          const uploadPayload = await upload.json();
          throw new Error(uploadPayload.error ?? "Screenshot upload failed");
        }
      }

      router.push(`/projects/${payload.projectId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unknown error");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5 rounded-lg border border-line bg-panel p-6 shadow-soft">
        {fields.map((field) => (
          <label key={field.name} className="block">
            <span className="text-sm font-semibold">
              {field.label}
              {field.required ? " *" : ""}
            </span>
            {field.type === "textarea" ? (
              <textarea
                value={form[field.name]}
                onChange={(event) =>
                  setForm((current) => ({ ...current, [field.name]: event.target.value }))
                }
                required={field.required}
                rows={field.name === "description" ? 5 : 3}
                className="mt-2 w-full rounded-md border border-line bg-white px-3 py-3 text-sm leading-6"
              />
            ) : (
              <input
                value={form[field.name]}
                onChange={(event) =>
                  setForm((current) => ({ ...current, [field.name]: event.target.value }))
                }
                required={field.required}
                className="mt-2 w-full rounded-md border border-line bg-white px-3 py-3 text-sm"
              />
            )}
          </label>
        ))}
      </div>

      <aside className="h-fit rounded-lg border border-line bg-panel p-5 shadow-soft">
        <h2 className="text-lg font-semibold">Screenshots</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          PNG/JPEG/WebP、1枚5MB以下、最大5枚まで。public repoには保存されません。
        </p>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 5))}
          className="mt-4 w-full text-sm"
        />
        {files.length > 0 ? (
          <ul className="mt-4 space-y-2 text-sm text-muted">
            {files.map((file) => (
              <li key={`${file.name}-${file.size}`}>{file.name}</li>
            ))}
          </ul>
        ) : null}
        {error ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-5 w-full rounded-md bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-forge disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "作成中..." : "ワークスペースを作成"}
        </button>
      </aside>
    </form>
  );
}
