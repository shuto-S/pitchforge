import { describe, expect, it } from "vitest";
import type { GeneratedArtifacts } from "@/lib/schemas/artifact";
import type { JudgeScore } from "@/lib/schemas/agent";
import { MockAIProvider } from "@/lib/server/ai/mock-provider";
import { renderMarkdownExport } from "@/lib/server/export/markdown";

describe("markdown export", () => {
  it("renders before and after score plus GCP story", async () => {
    const provider = new MockAIProvider();
    const artifacts = await provider.generateJson<GeneratedArtifacts>({
      system: "",
      prompt: "",
      schemaName: "GeneratedArtifacts",
      schema: {}
    });
    const baselineScore = await provider.generateJson<JudgeScore>({
      system: "",
      prompt: "",
      schemaName: "JudgeScoreBaseline",
      schema: {}
    });
    const finalScore = await provider.generateJson<JudgeScore>({
      system: "",
      prompt: "",
      schemaName: "JudgeScoreFinal",
      schema: {}
    });

    const markdown = renderMarkdownExport({
      project: {
        id: "proj_test",
        ownerUid: "test-user",
        ownerEmail: "test-user@example.test",
        title: "PitchForge",
        oneLiner: "AI監督",
        description: "description",
        problem: "problem",
        targetUsers: "users",
        gcpUsage: "Cloud Run",
        aiAgentBehavior: "agent",
        techStack: ["Cloud Run"],
        status: "completed",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      baselineScore,
      finalScore,
      artifacts
    });

    expect(markdown).toContain(
      `総合スコア: ${baselineScore.totalScore} -> ${finalScore.totalScore}`
    );
    expect(markdown).toContain("Cloud Run");
    expect(markdown).toContain("product\\_review");
    expect(markdown).not.toMatch(/(?:ProtoPedia|Findy|findy_hackathon|最終提出フォーム)/iu);
  });

  it("exports every introduction-page field, explicit checklist states, and safe related links", async () => {
    const provider = new MockAIProvider();
    const generated = await provider.generateJson<GeneratedArtifacts>({
      system: "",
      prompt: "",
      schemaName: "GeneratedArtifacts",
      schema: {}
    });
    const baselineScore = await provider.generateJson<JudgeScore>({
      system: "",
      prompt: "",
      schemaName: "JudgeScoreBaseline",
      schema: {}
    });
    const finalScore = await provider.generateJson<JudgeScore>({
      system: "",
      prompt: "",
      schemaName: "JudgeScoreFinal",
      schema: {}
    });
    const artifacts: GeneratedArtifacts = {
      ...generated,
      demoScripts: {
        ...generated.demoScripts,
        script90s: {
          ...generated.demoScripts.script90s,
          scenes: generated.demoScripts.script90s.scenes.map((scene, index) =>
            index === 0 ? { ...scene, visual: "左右 | 比較\n次の画面" } : scene
          )
        }
      },
      protoPediaContent: {
        title: "提出タイトル",
        overview: "提出概要",
        story: {
          problemBackground: "課題背景",
          targetUsers: "想定利用者",
          productFeatures: "主要機能"
        },
        systemArchitecture: "Cloud RunからGeminiを呼び出す構成",
        developmentMaterials: ["Next.js", "Cloud Run", "Vertex AI / Gemini"],
        tags: ["product_review", "ai_agent"],
        relatedUrls: [
          { label: "公開デモ", url: "https://example.com/demo" },
          { label: "危険なURL", url: "javascript:alert(1)" },
          { label: "認証情報入り", url: "https://user:secret@example.com/private" }
        ]
      },
      checklist: {
        requiredItems: [
          { label: "技術説明", status: "ready", note: "AI出力には含まれる" },
          { label: "動画", status: "missing", note: "録画が必要" },
          { label: "公開URL", status: "needs_review", note: "人の確認が必要" }
        ],
        recommendedFixes: ["冒頭5秒を短くする"],
        finalSubmissionAdvice: "送信前に全URLを再確認する"
      }
    };
    const scoreWithTableText: JudgeScore = {
      ...baselineScore,
      categories: baselineScore.categories.map((category, index) =>
        index === 0 ? { ...category, label: "項目 | 改行\n確認" } : category
      )
    };

    const markdown = renderMarkdownExport({
      project: {
        id: "proj_test",
        ownerUid: "test-user",
        ownerEmail: "test-user@example.test",
        title: "Pitch | Forge",
        oneLiner: "AI監督",
        description: "description",
        problem: "problem",
        targetUsers: "users",
        productUrl: "https://legacy-user:super-secret@example.test/private",
        gcpUsage: "Cloud Run",
        aiAgentBehavior: "agent",
        techStack: ["Cloud Run"],
        status: "completed",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      baselineScore: scoreWithTableText,
      finalScore,
      artifacts
    });

    expect(markdown).toContain("## 紹介ページ");
    expect(markdown).toContain("### タイトル\n\n提出タイトル");
    expect(markdown).toContain("提出概要");
    expect(markdown).toContain("課題背景");
    expect(markdown).toContain("想定利用者");
    expect(markdown).toContain("主要機能");
    expect(markdown).toContain("Cloud RunからGeminiを呼び出す構成");
    expect(markdown).toContain("## 開発素材・使用技術\n\n- Next.js\n- Cloud Run");
    expect(markdown).toContain("## タグ\n\n- product\\_review\n- ai\\_agent");
    expect(markdown).toContain("- 公開デモ: <https://example.com/demo>");
    expect(markdown).not.toContain("javascript:alert(1)");
    expect(markdown).not.toContain("https://user:secret@example.com/private");
    expect(markdown).not.toContain("super-secret");
    expect(markdown).not.toContain("<javascript:");
    expect(markdown).not.toContain("<https://user:secret@");
    expect(markdown).toContain("安全でないURLを非表示");
    expect(markdown).toContain("安全基準外のためリンク無効");
    expect(markdown).toContain("- [x] 技術説明");
    expect(markdown).toContain("状態: ready / システム判定の準備済み");
    expect(markdown).toContain("- [ ] 動画: 録画が必要 （状態: missing / 不足）");
    expect(markdown).toContain("- [ ] 公開URL: 人の確認が必要 （状態: needs_review / 要確認）");
    expect(markdown).toContain("## 推奨修正\n\n- 冒頭5秒を短くする");
    expect(markdown).toContain("送信前に全URLを再確認する");
    expect(markdown).not.toContain("- 動画URL: TBD");
    expect(markdown).not.toContain("ページURL: TBD");
    expect(markdown).toContain("- プロダクトURL: 安全でないURLを非表示");
    expect(markdown).toContain("- GitHub URL: 未設定");
    expect(markdown).toContain("構成図をPNGまたはSVGで保存");
    expect(markdown).toContain("## 公開準備チェック");
    expect(markdown).toContain("| 項目 \\| 改行 確認 |");
    expect(markdown).toContain("| 0-5s | 左右 \\| 比較 次の画面 |");
  });

  it("escapes AI free text as literal Markdown while preserving paragraph breaks", async () => {
    const provider = new MockAIProvider();
    const artifacts = await provider.generateJson<GeneratedArtifacts>({
      system: "",
      prompt: "",
      schemaName: "GeneratedArtifacts",
      schema: {}
    });
    const baselineScore = await provider.generateJson<JudgeScore>({
      system: "",
      prompt: "",
      schemaName: "JudgeScoreBaseline",
      schema: {}
    });
    const finalScore = await provider.generateJson<JudgeScore>({
      system: "",
      prompt: "",
      schemaName: "JudgeScoreFinal",
      schema: {}
    });
    const credentialUrl = "https://legacy-user:super-secret@example.test/private";
    const attack =
      "first paragraph\r\n\r\n<script>alert(1)</script>\n# injected heading\n---\n1. ordered\n![image](javascript:alert(1))\n[link](https://attacker.example)\n`code` *bold* _italic_\n" +
      credentialUrl;
    artifacts.directorStrategy.coreMessage = attack;
    artifacts.protoPediaContent.overview = attack;
    artifacts.checklist.finalSubmissionAdvice = attack;
    artifacts.demoScripts.script90s.scenes[0].narration = "<img src=x onerror=alert(1)> | injected";

    const markdown = renderMarkdownExport({
      project: {
        id: "proj_escape_test",
        ownerUid: "test-user",
        ownerEmail: "test-user@example.test",
        title: "PitchForge",
        oneLiner: "AI監督",
        description: "description",
        problem: "problem",
        targetUsers: "users",
        gcpUsage: "Cloud Run",
        aiAgentBehavior: "agent",
        techStack: ["Cloud Run"],
        status: "completed",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      baselineScore,
      finalScore,
      artifacts
    });

    expect(markdown).toContain("first paragraph\n\n\\<script\\>alert(1)\\</script\\>");
    expect(markdown).toContain("\\# injected heading");
    expect(markdown).toContain("\\---");
    expect(markdown).toContain("1\\. ordered");
    expect(markdown).toContain("\\!\\[image\\](javascript:alert(1))");
    expect(markdown).toContain("\\[link\\](https://attacker.example)");
    expect(markdown).toContain("\\`code\\` \\*bold\\* \\_italic\\_");
    expect(markdown).toContain("\\<img src=x onerror=alert(1)\\> \\| injected");
    expect(markdown).not.toContain("<script>");
    expect(markdown).not.toContain("<img src=x onerror=alert(1)>");
    expect(markdown).not.toContain(credentialUrl);
    expect(markdown).not.toContain("super-secret");
    expect(markdown).not.toContain("\r");
  });
});
