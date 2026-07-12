import { describe, expect, it } from "vitest";
import {
  renderArchitectureSvg,
  type ArchitectureSvgInput
} from "@/lib/server/export/architecture-svg";

function architectureInput(): ArchitectureSvgInput {
  return {
    project: {
      title: "PitchForge",
      oneLiner: "AI作戦会議がハッカソン提出物を磨く",
      techStack: [
        "Cloud Run",
        "Gemini",
        "Cloud SQL",
        "Cloud Storage",
        "Password auth"
      ]
    },
    artifacts: {
      brief: {
        oneSentencePitch: "実装済み作品を審査員に届く提出パッケージへ磨き込む。"
      },
      directorStrategy: {
        agentStory: "複数の専門エージェントが採点、生成、改善、再採点を行います。"
      },
      protoPediaContent: {
        systemArchitecture:
          "Cloud RunでWeb/APIを実行し、Geminiで作品を分析し、Cloud SQLとCloud Storageへ履歴と素材を保存します。"
      }
    }
  };
}

describe("architecture SVG export", () => {
  it("is deterministic and declares a 1600x900 canvas", () => {
    const input = architectureInput();
    const first = renderArchitectureSvg(input);
    const second = renderArchitectureSvg(input);

    expect(first).toBe(second);
    expect(first).toContain('width="1600" height="900" viewBox="0 0 1600 900"');
  });

  it("escapes XML and cannot create script or event attributes", () => {
    const input = architectureInput();
    const malicious = `Rock & <Roll> "quoted" 'single'</text><script>alert(1)</script><rect onload="alert(2)"><a href="javascript:alert(3)">`;
    input.project.title = malicious;
    input.project.techStack = [malicious];
    input.artifacts.brief.oneSentencePitch = malicious;
    input.artifacts.directorStrategy.agentStory = malicious;
    input.artifacts.protoPediaContent.systemArchitecture = malicious;

    const svg = renderArchitectureSvg(input);

    expect(svg).toContain(
      "Rock &amp; &lt;Roll&gt; &quot;quoted&quot; &apos;single&apos;"
    );
    expect(svg).not.toMatch(/<script\b/iu);
    expect(svg).not.toMatch(/<[^>]+\son[a-z]+\s*=/iu);
    expect(svg).not.toContain("javascript:");
  });

  it("deduplicates project technologies and renders at most eight nodes", () => {
    const input = architectureInput();
    input.project.techStack = [
      "Tool 1",
      "tool 1",
      "Tool 2",
      "Tool 3",
      "Tool 4",
      "Tool 5",
      "Tool 6",
      "Tool 7",
      "Tool 8",
      "Tool 9",
      "Tool 10"
    ];

    const svg = renderArchitectureSvg(input);
    const techNodes = svg.match(/data-tech-node="true"/g) ?? [];

    expect(techNodes).toHaveLength(8);
    expect(svg).toContain("Tool 8");
    expect(svg).not.toContain("Tool 9");
    expect(svg).not.toContain("Tool 10");
  });

  it("shows the implemented PitchForge and Google Cloud processing flow", () => {
    const svg = renderArchitectureSvg(architectureInput());

    expect(svg).toContain("User / product input");
    expect(svg).toContain("Cloud Run");
    expect(svg).toContain("Gemini multi-agent loop");
    expect(svg).toContain("Cloud SQL / PostgreSQL");
    expect(svg).toContain("Cloud Storage");
    expect(svg).toContain("Password auth");
    expect(svg).toContain("Pre-provisioned accounts");
    expect(svg).toContain("Signed httpOnly session");
    expect(svg).toContain("auth_users, login throttle");
    expect(svg).toContain("Improvement outputs");
  });

  it("shows the selected-action revision loop without the retired final-judge flow", () => {
    const svg = renderArchitectureSvg(architectureInput());

    expect(svg).toContain('data-loop-step="draft-judge"');
    expect(svg).toContain('data-loop-step="revision-planner"');
    expect(svg).toContain("Revision planner");
    expect(svg).toContain("selects actions");
    expect(svg).toContain('data-loop-step="optimizer-candidate"');
    expect(svg).toContain('data-loop-step="selected-only-merge"');
    expect(svg).toContain("others unchanged");
    expect(svg).toContain('data-loop-step="judge-observe"');
    expect(svg).toContain('data-loop-edge="improved-next-round"');
    expect(svg).toContain(
      "Improved: accept + next round · No gain: discard + stop · Maximum 2 rounds"
    );
    expect(svg).not.toContain("Final judge");
  });

  it("keeps the footer inside the right edge of the canvas", () => {
    const svg = renderArchitectureSvg(architectureInput());

    expect(svg).toMatch(
      /<text[^>]+text-anchor="end"><tspan x="1536" y="870">Generated deterministically from product data and PitchForge outputs<\/tspan><\/text>/u
    );
  });

  it("is self-contained and includes no executable or external SVG references", () => {
    const svg = renderArchitectureSvg(architectureInput());

    expect(svg).not.toMatch(/<(?:script|style|foreignObject)\b/iu);
    expect(svg).not.toMatch(/\b(?:href|xlink:href)\s*=/iu);
    expect(svg).not.toMatch(/url\((?!#arrowhead\))/iu);
  });

  it("bounds long and invalid input instead of emitting it without limit", () => {
    const input = architectureInput();
    const longText = `start-${"x".repeat(20_000)}-end\u0000`;
    input.project.title = longText;
    input.project.oneLiner = longText;
    input.project.techStack = Array.from({ length: 20 }, (_, index) =>
      `${index}-${longText}`
    );
    input.artifacts.brief.oneSentencePitch = longText;
    input.artifacts.directorStrategy.agentStory = longText;
    input.artifacts.protoPediaContent.systemArchitecture = longText;

    const svg = renderArchitectureSvg(input);

    expect(svg.length).toBeLessThan(30_000);
    expect(svg).not.toContain(longText);
    expect(svg).not.toContain("x".repeat(100));
    expect(svg).not.toContain("\u0000");
  });

  it("omits URLs and masks known secret formats from displayed text", () => {
    const input = architectureInput();
    input.project.title =
      "Demo https://private.example/path GEMINI_API_KEY=should-not-be-rendered";
    input.artifacts.brief.oneSentencePitch =
      "Authorization: Bearer token-value https://another.example/path";

    const svg = renderArchitectureSvg(input);

    expect(svg).not.toContain("private.example");
    expect(svg).not.toContain("another.example");
    expect(svg).not.toContain("should-not-be-rendered");
    expect(svg).not.toContain("token-value");
    expect(svg).toContain("****");
  });
});
