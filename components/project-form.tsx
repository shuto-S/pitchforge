"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { validateScreenshotFiles } from "@/lib/asset-upload-validation";
import {
  buildGithubImportReview,
  firstProjectDraftSubmitValidation,
  findProjectDraftFieldsNeedingReview,
  githubRepositoryUrlError,
  projectDraftFieldLabels,
  requiredProjectDraftFields,
  type GithubImportMode,
  type ProjectDraftFormState,
  type RequiredProjectDraftField
} from "@/lib/client/github-import-draft";

type FormState = ProjectDraftFormState;
type EntryMode = "github" | "manual" | "review";
type ImportStatus = "idle" | "loading" | "success" | "partial" | "error";

type ImportEvidence = {
  analyzedFiles: string[];
  mode: GithubImportMode | null;
  warnings: string[];
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
  techStack: ""
};

const sampleForm: FormState = {
  title: "UserSignal Lake Agent",
  oneLiner:
    "問い合わせ・レビュー・Slackの声から改善優先度を判断し、FAQとGitHub Issueまで起案するインサイト監督エージェント。",
  description:
    "問い合わせ、レビュー、Slackの声をまとめ、AIが改善優先度を判断します。入力から分類、改善提案、Issue起案までを短いデモで確認できます。",
  problem:
    "問い合わせやレビューが多すぎて、開発チームが何から直すべきかを判断できない。",
  targetUsers: "SaaSのPM、カスタマーサクセス、開発チーム",
  productUrl: "",
  githubUrl: "",
  gcpUsage:
    "Cloud RunでWeb/APIを公開し、Gemini APIで分類・要約・改善案生成を行います。Cloud SQLに分析履歴を保存し、Cloud Storageにアップロード資料を保管します。",
  aiAgentBehavior:
    "ユーザーの声を分類し、影響度と緊急度から改善優先度を判断し、FAQ案とGitHub Issue案を自律的に生成する。",
  techStack: "Cloud Run, Gemini API, Cloud SQL, Cloud Storage"
};

const fields: {
  name: keyof FormState;
  label: string;
  help?: string;
  placeholder?: string;
  type: "input" | "textarea";
  inputType?: "text" | "url";
  minLength?: number;
  maxLength?: number;
  required?: boolean;
}[] = [
  {
    name: "title",
    label: "プロダクト名",
    placeholder: "例: UserSignal Lake Agent",
    type: "input",
    maxLength: 80,
    required: true
  },
  {
    name: "oneLiner",
    label: "一言で言うと",
    help: "誰の、どんな課題を、どう変えるプロダクトかを一文で書きます。",
    placeholder: "例: 顧客の声から改善優先度とIssue案を自動で作るAIエージェント",
    type: "input",
    maxLength: 120,
    required: true
  },
  {
    name: "description",
    label: "プロダクト概要",
    help: "入力 / 処理 / 出力 / デモの見せ場",
    type: "textarea",
    minLength: 20,
    maxLength: 2000,
    required: true
  },
  {
    name: "problem",
    label: "解決する課題",
    help: "課題を端的に表す一文",
    type: "textarea",
    maxLength: 2000,
    required: true
  },
  {
    name: "targetUsers",
    label: "想定ユーザー",
    help: "職種 / 利用シーン / 困っている状況",
    type: "textarea",
    maxLength: 2000,
    required: true
  },
  { name: "productUrl", label: "プロダクトURL", type: "input", inputType: "url" },
  { name: "githubUrl", label: "GitHub URL", type: "input", inputType: "url" },
  {
    name: "gcpUsage",
    label: "Google Cloudの使いどころ",
    help: "サービス名だけでなく、役割と必然性",
    type: "textarea",
    maxLength: 2000,
    required: true
  },
  {
    name: "aiAgentBehavior",
    label: "AIエージェントとしての自律動作",
    help: "観察 → 判断 → 実行 → 再評価",
    type: "textarea",
    maxLength: 2000,
    required: true
  },
  { name: "techStack", label: "利用技術（カンマ区切り）", type: "input" }
];

const fieldGroups = [
  {
    code: "01",
    label: "課題と価値",
    description: "誰の、何を、どう変えるか。",
    fields: fields.slice(0, 5)
  },
  {
    code: "02",
    label: "AIとGoogle Cloud",
    description: "判断ループと技術の必然性。",
    fields: fields.slice(7)
  },
  {
    code: "03",
    label: "共有URL",
    description: "共有・レビューに使うURL。",
    fields: fields.slice(5, 7)
  }
];

function githubImportFailureMessage(status: number): string {
  if (status === 400 || status === 422) {
    return "GitHubリポジトリ URLを確認してください。";
  }
  if (status === 404) {
    return "公開リポジトリを確認できませんでした。URLと公開設定を確認してください。";
  }
  if (status === 429) {
    return "読み取り回数の上限に達しました。少し待ってからもう一度お試しください。";
  }
  if (status === 502 || status === 503 || status === 504) {
    return "GitHubまたはAIの応答を待てませんでした。少し待ってからもう一度お試しください。";
  }
  return "リポジトリを読み取れませんでした。時間をおいてもう一度お試しください。";
}

export function ProjectForm({ useSample }: { useSample: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => (useSample ? sampleForm : emptyForm));
  const [entryMode, setEntryMode] = useState<EntryMode>(useSample ? "review" : "github");
  const [importStatus, setImportStatus] = useState<ImportStatus>("idle");
  const [importError, setImportError] = useState<string | null>(null);
  const [importEvidence, setImportEvidence] = useState<ImportEvidence>({
    analyzedFiles: [],
    mode: null,
    warnings: []
  });
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [uploadFailed, setUploadFailed] = useState(false);
  const githubUrlInputRef = useRef<HTMLInputElement>(null);
  const projectFormRef = useRef<HTMLFormElement>(null);
  const importErrorRef = useRef<HTMLDivElement>(null);
  const reviewSummaryRef = useRef<HTMLHeadingElement>(null);
  const manualHeadingRef = useRef<HTMLHeadingElement>(null);

  const fieldsNeedingReview =
    entryMode === "review" ? findProjectDraftFieldsNeedingReview(form) : [];
  const completedRequiredFieldCount =
    requiredProjectDraftFields.length - fieldsNeedingReview.length;

  useEffect(() => {
    if (entryMode === "review" && (importStatus === "success" || importStatus === "partial")) {
      reviewSummaryRef.current?.focus();
    }
  }, [entryMode, importStatus]);

  useEffect(() => {
    if (entryMode === "manual") {
      manualHeadingRef.current?.focus();
    }
  }, [entryMode]);

  useEffect(() => {
    if (importStatus === "error") {
      importErrorRef.current?.focus();
    }
  }, [importStatus]);

  function openManualEntry() {
    setImportError(null);
    setImportStatus("idle");
    setEntryMode("manual");
  }

  function openGithubEntry() {
    setImportError(null);
    setImportStatus("idle");
    setImportEvidence({ analyzedFiles: [], mode: null, warnings: [] });
    setEntryMode("github");
  }

  async function importGithubRepository() {
    if (importStatus === "loading") {
      return;
    }

    const validationError = githubRepositoryUrlError(form.githubUrl);
    if (validationError) {
      setImportError(validationError);
      setImportStatus("error");
      return;
    }

    setImportError(null);
    setImportStatus("loading");
    try {
      const response = await fetch("/api/projects/import-github", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ githubUrl: form.githubUrl.trim() })
      });

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (!response.ok) {
        setImportError(githubImportFailureMessage(response.status));
        setImportStatus("error");
        return;
      }

      const review = buildGithubImportReview(payload);
      setForm({
        ...review.form,
        githubUrl: review.form.githubUrl || form.githubUrl.trim()
      });
      setImportEvidence({
        analyzedFiles: review.analyzedFiles,
        mode: review.mode,
        warnings: review.warnings
      });
      setImportStatus(review.status);
      setEntryMode("review");
    } catch {
      setImportError("リポジトリを読み取れませんでした。時間をおいてもう一度お試しください。");
      setImportStatus("error");
    }
  }

  function openCreatedWorkspace() {
    if (createdProjectId) {
      router.push(`/projects/${createdProjectId}`);
    }
  }

  function selectFiles(selectedFiles: File[]) {
    setFiles(selectedFiles);
    setError(validateScreenshotFiles(selectedFiles));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (createdProjectId && uploadFailed) {
      openCreatedWorkspace();
      return;
    }

    const draftValidation = firstProjectDraftSubmitValidation(form);
    if (draftValidation) {
      setError(draftValidation.message);
      projectFormRef.current
        ?.querySelector<HTMLElement>(`#project-field-${draftValidation.field}`)
        ?.focus();
      return;
    }

    const fileValidationError = validateScreenshotFiles(files);
    if (fileValidationError) {
      setError(fileValidationError);
      return;
    }

    setError(null);
    setIsSubmitting(true);
    let projectId = createdProjectId;
    try {
      if (!projectId) {
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
          const firstIssueMessage =
            Array.isArray(payload.issues) && typeof payload.issues[0]?.message === "string"
              ? payload.issues[0].message
              : null;
          throw new Error(firstIssueMessage ?? payload.error ?? "プロジェクトを作成できませんでした。");
        }
        projectId = payload.projectId;
        setCreatedProjectId(projectId);
      }

      if (files.length > 0) {
        const data = new FormData();
        files.forEach((file) => data.append("files", file));
        try {
          const upload = await fetch(`/api/projects/${projectId}/assets`, {
            method: "POST",
            body: data
          });
          if (!upload.ok) {
            const uploadPayload = await upload.json();
            throw new Error(uploadPayload.error ?? "Screenshot upload failed");
          }
        } catch (caught) {
          const detail = caught instanceof Error ? caught.message : "Unknown error";
          setUploadFailed(true);
          setError(
            `ワークスペースは作成済み、画像のアップロードに失敗しました。画像の自動再送は行いません。 (${detail})`
          );
          return;
        }
      }

      router.push(`/projects/${projectId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unknown error");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (entryMode === "github") {
    const isImporting = importStatus === "loading";
    return (
      <section
        className="cockpit-panel max-w-3xl p-5 sm:p-7"
        aria-busy={isImporting}
        aria-labelledby="github-import-heading"
      >
        <div className="cockpit-kicker">GitHubから開始</div>
        <h2 id="github-import-heading" className="mt-2 text-2xl font-semibold text-white">
          リポジトリを読み取る
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">
          READMEや設定ファイルから、プロダクト概要と技術情報の下書きを作ります。
        </p>

        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void importGithubRepository();
          }}
          className="mt-7"
        >
          <label htmlFor="github-import-url" className="block text-sm font-semibold text-slate-200">
            GitHubリポジトリ URL
            <span aria-hidden="true" className="ml-1 text-blue-400">
              *
            </span>
            <span className="sr-only">（必須）</span>
          </label>
          <p id="github-import-url-help" className="mt-1 text-xs leading-5 text-slate-500">
            公開リポジトリに対応。作成された内容は保存前に編集できます。
          </p>
          <input
            ref={githubUrlInputRef}
            id="github-import-url"
            type="url"
            value={form.githubUrl}
            onChange={(event) => {
              setForm((current) => ({ ...current, githubUrl: event.target.value }));
              setImportError(null);
              if (importStatus === "error") {
                setImportStatus("idle");
              }
            }}
            autoComplete="url"
            inputMode="url"
            spellCheck={false}
            autoFocus
            required
            aria-describedby={
              importError ? "github-import-url-help github-import-error" : "github-import-url-help"
            }
            aria-invalid={importStatus === "error" ? true : undefined}
            placeholder="https://github.com/owner/repository"
            className="cockpit-input mt-3 px-3 py-3 text-sm"
          />

          {isImporting ? (
            <div
              role="status"
              aria-live="polite"
              className="mt-4 rounded-lg border border-blue-400/20 bg-blue-500/[0.08] p-3 text-sm leading-6 text-blue-100"
            >
              READMEや設定ファイルから、プロダクト情報を整理しています…
            </div>
          ) : null}

          {importError ? (
            <div
              ref={importErrorRef}
              id="github-import-error"
              role="alert"
              tabIndex={-1}
              className="mt-4 rounded-lg border border-red-400/20 bg-red-500/[0.08] p-3 text-sm leading-6 text-red-200"
            >
              {importError}
            </div>
          ) : null}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              disabled={isImporting}
              onClick={() => void importGithubRepository()}
              className="cockpit-button-primary min-w-48"
            >
              {isImporting
                ? "読み取り中…"
                : importStatus === "error"
                  ? "もう一度試す"
                  : "下書きを作成"}
            </button>
            <button
              type="button"
              disabled={isImporting}
              onClick={openManualEntry}
              className="cockpit-button-secondary"
            >
              項目を直接入力
            </button>
          </div>
        </form>
      </section>
    );
  }

  return (
    <form
      ref={projectFormRef}
      onSubmit={submit}
      className="grid items-start gap-5 lg:grid-cols-[1fr_340px]"
    >
      <div className="space-y-4">
        {entryMode === "review" &&
        (importStatus === "success" || importStatus === "partial") ? (
          <section className="cockpit-panel p-5 sm:p-6" aria-live="polite">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="cockpit-kicker">下書きの確認</div>
                <h2
                  ref={reviewSummaryRef}
                  tabIndex={-1}
                  className="mt-2 text-xl font-semibold text-white"
                >
                  内容を確認してください
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="cockpit-chip">
                  {importStatus === "partial" ? "確認あり" : "下書き作成済み"}
                </span>
                <span className="cockpit-chip">
                  {importEvidence.mode === "ai" ? "AIで下書き" : "リポジトリから検出"}
                </span>
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              {fieldsNeedingReview.length > 0
                ? `${requiredProjectDraftFields.length}項目中${completedRequiredFieldCount}項目を入力しました。不足項目を確認してください。`
                : `${requiredProjectDraftFields.length}項目の下書きを作成しました。すべて編集できます。`}
            </p>
            {importEvidence.analyzedFiles.length > 0 ? (
              <p className="mt-2 text-xs leading-5 text-slate-500">
                {importEvidence.analyzedFiles.length}ファイルを確認しました。
              </p>
            ) : null}
            {fieldsNeedingReview.length > 0 ? (
              <div className="mt-4 rounded-lg border border-amber-400/20 bg-amber-500/[0.07] p-3">
                <div className="text-xs font-semibold text-amber-200">確認が必要な項目</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {fieldsNeedingReview.map((field) => (
                    <a
                      key={field}
                      href={`#project-field-${field}`}
                      className="cockpit-chip hover:border-amber-300/40 hover:text-white"
                    >
                      {projectDraftFieldLabels[field]}
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
            {importEvidence.warnings.length > 0 ? (
              <ul className="mt-4 list-disc space-y-1.5 pl-5 text-xs leading-5 text-amber-100/90">
                {importEvidence.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
            <button
              type="button"
              onClick={openGithubEntry}
              className="cockpit-button-secondary mt-5"
            >
              別のリポジトリを読み取る
            </button>
          </section>
        ) : null}

        {entryMode === "manual" ? (
          <section className="cockpit-panel p-5 sm:p-6">
            <div className="cockpit-kicker">手入力</div>
            <h2
              ref={manualHeadingRef}
              tabIndex={-1}
              className="mt-2 text-xl font-semibold text-white"
            >
              プロダクト情報を入力
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              必須項目を入力して、評価ワークスペースを作成します。
            </p>
            <button
              type="button"
              onClick={openGithubEntry}
              className="cockpit-button-secondary mt-5"
            >
              GitHubから下書きを作る
            </button>
          </section>
        ) : null}

        {fieldGroups.map((group) => (
          <section key={group.code} className="cockpit-panel p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.07] pb-5">
              <div>
                <div className="cockpit-kicker">
                  {group.code} / {group.label}
                </div>
                <p className="mt-2 text-sm text-slate-400">{group.description}</p>
              </div>
              {useSample && group.code === "01" ? (
                <span className="cockpit-chip">
                  <span className="cockpit-dot" /> サンプル入力済み
                </span>
              ) : null}
            </div>
            <div className="mt-5 grid gap-5">
              {group.fields.map((field) => {
                const fieldId = `project-field-${field.name}`;
                const helpId = field.help ? `${fieldId}-help` : null;
                const needsReview =
                  entryMode === "review" &&
                  fieldsNeedingReview.includes(field.name as RequiredProjectDraftField);
                const reviewId = needsReview ? `${fieldId}-review` : null;
                const describedBy = [helpId, reviewId].filter(Boolean).join(" ") || undefined;

                return (
                  <div key={field.name} className="block">
                    <label htmlFor={fieldId} className="text-sm font-semibold text-slate-200">
                      {field.label}
                      {field.required ? (
                        <>
                          <span aria-hidden="true" className="ml-1 text-blue-400">
                            *
                          </span>
                          <span className="sr-only">（必須）</span>
                        </>
                      ) : null}
                    </label>
                    {field.help ? (
                      <p id={helpId ?? undefined} className="mt-1 text-xs leading-5 text-slate-500">
                        {field.help}
                      </p>
                    ) : null}
                    {field.type === "textarea" ? (
                      <textarea
                        id={fieldId}
                        value={form[field.name]}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            [field.name]: event.target.value
                          }))
                        }
                        required={field.required}
                        minLength={field.minLength}
                        maxLength={field.maxLength}
                        aria-describedby={describedBy}
                        aria-invalid={needsReview ? true : undefined}
                        placeholder={field.placeholder}
                        rows={field.name === "description" ? 5 : 3}
                        className="cockpit-input mt-2 px-3 py-3 text-sm leading-6"
                      />
                    ) : (
                      <input
                        id={fieldId}
                        type={field.inputType ?? "text"}
                        value={form[field.name]}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            [field.name]: event.target.value
                          }))
                        }
                        required={field.required}
                        minLength={field.minLength}
                        maxLength={field.maxLength}
                        autoComplete={field.inputType === "url" ? "url" : undefined}
                        inputMode={field.inputType === "url" ? "url" : undefined}
                        spellCheck={field.inputType === "url" ? false : undefined}
                        aria-describedby={describedBy}
                        aria-invalid={needsReview ? true : undefined}
                        placeholder={field.placeholder}
                        className="cockpit-input mt-2 px-3 py-3 text-sm"
                      />
                    )}
                    {needsReview ? (
                      <p id={reviewId ?? undefined} className="mt-2 text-xs leading-5 text-amber-200">
                        リポジトリから確認できませんでした。内容を入力してください。
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <aside className="cockpit-panel h-fit p-5 lg:sticky lg:top-6">
        <div className="cockpit-kicker">参考画像</div>
        <h2 className="mt-2 text-lg font-semibold text-white">見せたい画面</h2>
        <p id="project-screenshots-help" className="mt-2 text-xs leading-5 text-slate-500">
          PNG / JPEG / WebP · 5MB以下 · 最大5枚
        </p>

        <label className="mt-5 block rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-4 transition hover:border-blue-400/50">
          <span className="text-sm font-semibold text-slate-200">画像を選択</span>
          <span className="mt-1 block text-xs text-slate-500">Geminiがプロダクト理解に使用</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            disabled={uploadFailed}
            aria-describedby="project-screenshots-help"
            onChange={(event) => selectFiles(Array.from(event.target.files ?? []))}
            className="mt-3 w-full text-xs text-slate-400 file:mr-3 file:rounded-md file:border-0 file:bg-blue-500/15 file:px-3 file:py-2 file:font-semibold file:text-blue-200"
          />
        </label>

        {files.length > 0 ? (
          <div className="mt-4">
            <div className="text-xs font-semibold text-emerald-400">{files.length}件を追加</div>
            <ul className="mt-2 space-y-1.5 text-xs text-slate-400">
              {files.map((file) => (
                <li
                  key={`${file.name}-${file.size}`}
                  className="truncate rounded-md bg-white/[0.035] px-2.5 py-2"
                >
                  {file.name}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {error ? (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-red-400/20 bg-red-500/[0.08] p-3 text-xs leading-5 text-red-200"
          >
            {error}
            {createdProjectId && uploadFailed ? (
              <button
                type="button"
                onClick={openCreatedWorkspace}
                className="cockpit-button-secondary mt-3 w-full"
              >
                画像なしで開く
              </button>
            ) : null}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="cockpit-button-primary mt-5 w-full"
        >
          {isSubmitting
            ? "ワークスペースを作成中…"
            : createdProjectId && uploadFailed
              ? "画像なしで開く"
              : "評価ワークスペースを作成"}
        </button>

        <div className="mt-5 border-t border-white/[0.07] pt-5">
          <div className="cockpit-kicker">入力のポイント</div>
          <ul className="mt-3 space-y-2 text-xs text-slate-400">
            {["誰の、どの課題か", "AIが何を判断するか", "Google Cloudがなぜ必要か"].map(
              (item) => (
                <li key={item} className="flex gap-2">
                  <span className="text-emerald-400">✓</span>
                  {item}
                </li>
              )
            )}
          </ul>
        </div>
      </aside>
    </form>
  );
}
