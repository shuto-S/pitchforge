import type { GeneratedArtifacts } from "@/lib/schemas/artifact";
import type { SubmissionChecklist } from "@/lib/schemas/agent";
import type { Project } from "@/lib/schemas/project";
import {
  safeExternalHttpUrl,
  sanitizeCredentialBearingUrls
} from "@/lib/safe-external-url";

type ChecklistItem = SubmissionChecklist["requiredItems"][number];

const adapterOnlyPattern = /(?:proto\s*pedia|findy(?:_hackathon)?|最終提出フォーム)/iu;

export function uniqueTrimmed(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }

    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(trimmed);
  }

  return normalized;
}

export function projectUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? safeExternalHttpUrl(trimmed) ?? undefined : undefined;
}

function checklistForProject(project: Project): {
  requiredItems: ChecklistItem[];
  requiredActions: string[];
} {
  const githubUrl = projectUrl(project.githubUrl);
  const productUrl = projectUrl(project.productUrl);
  const hasTechStack = uniqueTrimmed(project.techStack).length > 0;

  const requiredItems: ChecklistItem[] = [
    {
      label: "プロダクトURL",
      status: productUrl ? "needs_review" : "missing",
      note: productUrl
        ? "URLは入力済みです。想定する閲覧者がアクセスでき、主要機能を確認できるかテストしてください。"
        : "レビューや共有に使うプロダクトURLを入力してください。"
    },
    {
      label: "関連リポジトリ",
      status: githubUrl ? "needs_review" : "missing",
      note: githubUrl
        ? "URLは入力済みです。共有範囲と、秘密情報や不要な内部情報が含まれていないことを確認してください。"
        : "レビューや共有に使う関連リポジトリURLを入力してください。"
    },
    {
      label: "紹介ページ",
      status: "ready",
      note: "プロダクト情報から紹介文を生成しました。実装済みの内容と一致しているか確認してください。"
    },
    {
      label: "デモ台本",
      status: "ready",
      note: "30秒、90秒、3分の台本を生成しました。実際の画面遷移と所要時間を確認してください。"
    },
    {
      label: "アーキテクチャ図",
      status: "ready",
      note: "ワークスペースのExportからSVGまたはPNGで保存し、審査・レビュー資料や公開ページに利用できます。"
    },
    {
      label: "技術スタック",
      status: hasTechStack ? "needs_review" : "missing",
      note: hasTechStack
        ? "プロジェクトに入力された技術スタックを反映しました。実際の構成と一致するか確認してください。"
        : "紹介ページと構成図に反映する技術スタックを入力してください。"
    },
    {
      label: "公開範囲と認証",
      status: "needs_review",
      note: "公開範囲、ログイン方法、レビュー用アカウントの権限が意図どおりか確認してください。"
    },
    {
      label: "機密情報",
      status: "needs_review",
      note: "画面、URL、リポジトリ、生成資料に認証情報や内部設定値が含まれていないか確認してください。"
    }
  ];

  const requiredActions = [
    productUrl
      ? "プロダクトURLを想定する閲覧条件で開き、主要な操作とログイン方法を確認する"
      : "レビューや共有に使うプロダクトURLを入力する",
    githubUrl
      ? "関連リポジトリの共有範囲と秘密情報の混入がないことを確認する"
      : "レビューや共有に使う関連リポジトリURLを入力する",
    "紹介文、デモ台本、構成図が実装済みの内容と一致するか確認する",
    hasTechStack
      ? "入力した技術スタックが実際の構成と一致するか確認する"
      : "実際に利用している技術スタックをプロジェクトへ入力する",
    "共有前にアクセス権限と機密情報の表示を確認する"
  ];

  return { requiredItems, requiredActions };
}

/**
 * User-entered project facts are authoritative for public product fields.
 * Competition-specific requirements belong in an explicit publishing adapter.
 * This function is intentionally synchronous and performs no URL/network checks.
 */
export function finalizeSubmissionArtifacts(input: {
  project: Project;
  artifacts: GeneratedArtifacts;
}): GeneratedArtifacts {
  const { project } = input;
  const artifacts = sanitizeCredentialBearingUrls(input.artifacts);
  const githubUrl = projectUrl(project.githubUrl);
  const productUrl = projectUrl(project.productUrl);
  const { requiredItems, requiredActions } = checklistForProject(project);

  const genericTags = uniqueTrimmed(artifacts.protoPediaContent.tags).filter(
    (tag) => !adapterOnlyPattern.test(tag)
  );

  const relatedUrls = [
    githubUrl ? { label: "関連リポジトリ", url: githubUrl } : null,
    productUrl ? { label: "プロダクト", url: productUrl } : null
  ].filter((item): item is { label: string; url: string } => item !== null);

  const seenUrls = new Set<string>();
  const uniqueRelatedUrls = relatedUrls.filter(({ url }) => {
    if (seenUrls.has(url)) {
      return false;
    }
    seenUrls.add(url);
    return true;
  });

  const genericGeneratedFixes = artifacts.checklist.recommendedFixes.filter(
    (fix) => !adapterOnlyPattern.test(fix)
  );

  return {
    ...artifacts,
    protoPediaContent: {
      ...artifacts.protoPediaContent,
      title: project.title,
      developmentMaterials: uniqueTrimmed(project.techStack),
      tags: genericTags,
      relatedUrls: uniqueRelatedUrls
    },
    checklist: {
      requiredItems,
      recommendedFixes: uniqueTrimmed([
        ...requiredActions,
        ...genericGeneratedFixes
      ]),
      finalSubmissionAdvice:
        "共有前に、プロダクトURLのアクセス、紹介文と実装の整合性、機密情報の非表示を確認してください。"
    }
  };
}
