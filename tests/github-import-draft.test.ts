import { describe, expect, it } from "vitest";
import {
  buildGithubImportReview,
  firstProjectDraftSubmitValidation,
  githubRepositoryUrlError,
  isDraftValueNeedsReview,
  parseGithubImportResponse
} from "@/lib/client/github-import-draft";
import { publicGitHubRepositoryUrlSchema } from "@/lib/schemas/project";

const completeResponse = {
  draft: {
    title: "PitchForge",
    oneLiner: "プロダクト評価と資料作成を支えるAIワークスペース",
    description:
      "プロダクトの価値と実装を評価し、改善案とレビュー向け資料を生成します。",
    problem: "レビュー準備に必要な情報が複数の場所へ分散している。",
    targetUsers: "プロダクトマネージャーと開発チーム",
    productUrl: "https://pitchforge.example.com",
    githubUrl: "https://github.com/example/pitchforge",
    gcpUsage: "Cloud Runで提供し、Geminiで分析します。",
    aiAgentBehavior: "情報を観察し、改善対象を判断して再評価します。",
    techStack: ["Next.js", "Cloud Run", "Next.js"]
  },
  analyzedFiles: ["README.md", "package.json", "README.md"],
  mode: "ai" as const,
  warnings: []
};

describe("GitHub import draft client helpers", () => {
  it("builds an editable complete review and deduplicates evidence", () => {
    const review = buildGithubImportReview(completeResponse);

    expect(review.status).toBe("success");
    expect(review.fieldsNeedingReview).toEqual([]);
    expect(review.form.techStack).toBe("Next.js, Cloud Run");
    expect(review.analyzedFiles).toEqual(["README.md", "package.json"]);
  });

  it("keeps partial drafts editable and reports fields needing review", () => {
    const review = buildGithubImportReview({
      ...completeResponse,
      draft: {
        ...completeResponse.draft,
        description: "短い概要",
        targetUsers: ""
      },
      warnings: ["想定ユーザーを確認できませんでした。"]
    });

    expect(review.status).toBe("partial");
    expect(review.fieldsNeedingReview).toEqual(["description", "targetUsers"]);
    expect(review.form.title).toBe("PitchForge");
  });

  it("keeps 要確認: values in the review state", () => {
    expect(isDraftValueNeedsReview("要確認: 想定ユーザーを追記してください。")).toBe(true);
    expect(isDraftValueNeedsReview("  要確認: Google Cloudの役割を追記してください。")).toBe(
      true
    );
    expect(isDraftValueNeedsReview("プロダクトチーム")).toBe(false);

    const review = buildGithubImportReview({
      ...completeResponse,
      draft: {
        ...completeResponse.draft,
        targetUsers: "要確認: 想定ユーザーを追記してください。"
      }
    });

    expect(review.status).toBe("partial");
    expect(review.fieldsNeedingReview).toContain("targetUsers");
  });

  it("returns the first unconfirmed required field for submit validation", () => {
    const review = buildGithubImportReview({
      ...completeResponse,
      draft: {
        ...completeResponse.draft,
        problem: "要確認: 解決する課題を追記してください。",
        targetUsers: "要確認: 想定ユーザーを追記してください。"
      }
    });

    expect(firstProjectDraftSubmitValidation(review.form)).toEqual({
      field: "problem",
      message: "「解決する課題」の「要確認:」を実際の内容に置き換えてください。"
    });
    expect(firstProjectDraftSubmitValidation(completeForm())).toBeNull();
  });

  it("rejects a response without a supported mode or draft", () => {
    expect(() => parseGithubImportResponse({ mode: "unknown", draft: {} })).toThrow();
    expect(() => parseGithubImportResponse({ mode: "ai" })).toThrow();
  });

  it("accepts only a top-level public GitHub repository URL shape", () => {
    expect(githubRepositoryUrlError("https://github.com/example/pitchforge")).toBeNull();
    expect(githubRepositoryUrlError("https://github.com/example/pitchforge.git")).toBeNull();
    expect(githubRepositoryUrlError("https://github.com/example/pitchforge/")).toBeNull();

    expect(githubRepositoryUrlError("https://example.com/example/pitchforge")).not.toBeNull();
    expect(githubRepositoryUrlError("http://github.com/example/pitchforge")).not.toBeNull();
    expect(githubRepositoryUrlError("https://github.com/example/pitchforge/tree/main")).not.toBeNull();
    expect(githubRepositoryUrlError("https://github.com/example/repo?tab=readme")).not.toBeNull();
    expect(githubRepositoryUrlError("https://github.com/example%2Frepo/project")).not.toBeNull();
    expect(githubRepositoryUrlError("https://github.com//example/pitchforge")).not.toBeNull();
    expect(githubRepositoryUrlError("https://github.com/example//pitchforge")).not.toBeNull();
  });

  it.each([
    ["https://github.com/example/pitchforge", "https://github.com/example/pitchforge"],
    [" HTTPS://GITHUB.COM/Example/pitchforge.git/ ", "https://github.com/Example/pitchforge"],
    [
      `https://github.com/${`a${"b".repeat(37)}c`}/${"r".repeat(100)}`,
      `https://github.com/${`a${"b".repeat(37)}c`}/${"r".repeat(100)}`
    ]
  ])("matches server acceptance and normalization for %s", (value, normalized) => {
    expect(githubRepositoryUrlError(value)).toBeNull();
    expect(publicGitHubRepositoryUrlSchema.parse(value)).toBe(normalized);
  });

  it.each([
    "https://github.com/_owner/repository",
    "https://github.com/owner_/repository",
    "https://github.com/-owner/repository",
    "https://github.com/owner-/repository",
    `https://github.com/${"o".repeat(40)}/repository`,
    `https://github.com/owner/${"r".repeat(101)}`,
    "https://github.com/owner/.git"
  ])("matches server rejection for owner/repository boundary %s", (value) => {
    expect(githubRepositoryUrlError(value)).not.toBeNull();
    expect(publicGitHubRepositoryUrlSchema.safeParse(value).success).toBe(false);
  });
});

function completeForm() {
  return buildGithubImportReview(completeResponse).form;
}
