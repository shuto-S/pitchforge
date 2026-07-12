import type { GeneratedArtifacts } from "@/lib/schemas/artifact";
import type { SubmissionChecklist } from "@/lib/schemas/agent";
import type { Project } from "@/lib/schemas/project";
import {
  finalizeSubmissionArtifacts,
  projectUrl,
  uniqueTrimmed
} from "@/lib/server/submission/finalize";

type ChecklistItem = SubmissionChecklist["requiredItems"][number];

export type FindyHackathonSubmissionEvidence = {
  protoPediaUrl?: string;
  demoVideoUrl?: string;
  systemArchitectureImageUrl?: string;
  systemArchitectureImageReady?: boolean;
  finalFormSubmitted?: boolean;
};

/**
 * Adds the DevOps x AI Agent Hackathon 2026 publishing requirements.
 * Call this adapter only when preparing that event's external submission.
 */
export function adaptArtifactsForFindyHackathon(input: {
  project: Project;
  artifacts: GeneratedArtifacts;
  evidence?: FindyHackathonSubmissionEvidence;
}): GeneratedArtifacts {
  const artifacts = finalizeSubmissionArtifacts(input);
  const protoPediaUrl = projectUrl(input.evidence?.protoPediaUrl);
  const demoVideoUrl = projectUrl(input.evidence?.demoVideoUrl);
  const systemArchitectureImageUrl = projectUrl(
    input.evidence?.systemArchitectureImageUrl
  );
  const systemArchitectureImageReady =
    systemArchitectureImageUrl !== undefined ||
    input.evidence?.systemArchitectureImageReady === true;
  const finalFormSubmitted = input.evidence?.finalFormSubmitted === true;

  const eventItems: ChecklistItem[] = [
    {
      label: "ProtoPedia作品URL",
      status: protoPediaUrl ? "needs_review" : "missing",
      note: protoPediaUrl
        ? "URLは入力済みです。公開状態と登録内容を確認してください。"
        : "ProtoPedia作品ページを作成し、作品URLを記録してください。"
    },
    {
      label: "デモ動画",
      status: demoVideoUrl ? "needs_review" : "missing",
      note: demoVideoUrl
        ? "URLは入力済みです。外部から再生でき、内容が最新であることを確認してください。"
        : "生成したデモ台本で動画を収録し、YouTubeまたはVimeoのURLを用意してください。"
    },
    {
      label: "システム構成図画像",
      status: systemArchitectureImageReady ? "needs_review" : "missing",
      note: systemArchitectureImageUrl
        ? "画像URLは入力済みです。外部から表示でき、最新のシステム構成と一致することを確認してください。"
        : systemArchitectureImageReady
          ? "画像の準備済みとして記録されています。実ファイルが最新のシステム構成と一致することを確認してください。"
          : "ProtoPediaへ登録するシステム構成図画像を用意し、準備済みの証跡または画像URLを記録してください。"
    },
    {
      label: "Google Cloud実行サービス",
      status: "needs_review",
      note: "Cloud Run等の実行環境とデプロイURLが実際に稼働していることを確認してください。"
    },
    {
      label: "Google Cloud AI技術",
      status: "needs_review",
      note: "GeminiまたはVertex AIを利用する本番フローを実行し、利用実績を確認してください。"
    },
    {
      label: "findy_hackathonタグ",
      status: "ready",
      note: "このアダプターがProtoPediaタグの先頭に正確なfindy_hackathonを設定しました。"
    },
    {
      label: "最終提出フォーム",
      status: finalFormSubmitted ? "ready" : "missing",
      note: finalFormSubmitted
        ? "送信済みとして記録されています。回答内容の控えを保管してください。"
        : "公開GitHub、デプロイ、ProtoPediaの各URLを揃えて期限までに送信してください。"
    }
  ];

  const eventActions = [
    protoPediaUrl
      ? "ProtoPedia作品ページの公開状態と登録内容を確認する"
      : "ProtoPedia作品ページを作成し、作品URLを記録する",
    demoVideoUrl
      ? "デモ動画を外部から再生し、内容が最新であることを確認する"
      : "生成した台本でデモ動画を収録し、YouTubeまたはVimeoへアップロードする",
    systemArchitectureImageUrl
      ? "システム構成図画像を外部から表示し、最新の構成と一致することを確認する"
      : systemArchitectureImageReady
        ? "準備したシステム構成図画像が最新の構成と一致することを確認する"
        : "ProtoPediaへ登録するシステム構成図画像を用意し、証跡を記録する",
    "Cloud Run等の実行環境とデプロイURLが実際に稼働していることを確認する",
    "GeminiまたはVertex AIを使う本番フローを実行し、AI技術の利用を確認する",
    ...(finalFormSubmitted
      ? []
      : ["公開GitHub、デプロイ、ProtoPediaの各URLを最終提出フォームへ入力して送信する"])
  ];

  const eventTags = uniqueTrimmed(artifacts.protoPediaContent.tags).filter(
    (tag) => tag.toLowerCase() !== "findy_hackathon"
  );

  return {
    ...artifacts,
    protoPediaContent: {
      ...artifacts.protoPediaContent,
      tags: ["findy_hackathon", ...eventTags]
    },
    checklist: {
      requiredItems: [...artifacts.checklist.requiredItems, ...eventItems],
      recommendedFixes: uniqueTrimmed([
        ...eventActions,
        ...artifacts.checklist.recommendedFixes
      ]),
      finalSubmissionAdvice:
        "ProtoPedia作品ページ、デモ動画、公開GitHub、デプロイURLを最終確認し、提出フォームを期限までに送信してください。"
    }
  };
}
