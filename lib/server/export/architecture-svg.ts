import type { ArtifactBundle } from "@/lib/schemas/artifact";
import type { Project } from "@/lib/schemas/project";
import { maskSecrets } from "@/lib/server/security";

const SVG_WIDTH = 1600;
const SVG_HEIGHT = 900;
const MAX_TECH_NODES = 8;

type ArchitectureProject = Pick<Project, "title" | "oneLiner" | "techStack">;

type ArchitectureArtifacts = {
  brief: Pick<ArtifactBundle["brief"], "oneSentencePitch">;
  directorStrategy: Pick<ArtifactBundle["directorStrategy"], "agentStory">;
  protoPediaContent: Pick<ArtifactBundle["protoPediaContent"], "systemArchitecture">;
};

export type ArchitectureSvgInput = {
  project: ArchitectureProject;
  artifacts: ArchitectureArtifacts;
};

type TextOptions = {
  x: number;
  y: number;
  lines: readonly string[];
  size: number;
  lineHeight: number;
  fill?: string;
  weight?: number;
  anchor?: "start" | "middle" | "end";
};

const XML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;"
};

function isValidXmlCodePoint(codePoint: number): boolean {
  return (
    codePoint === 0x09 ||
    codePoint === 0x0a ||
    codePoint === 0x0d ||
    (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
    (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
    (codePoint >= 0x10000 && codePoint <= 0x10ffff)
  );
}

function sanitizeText(value: string): string {
  let xmlSafe = "";
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (isValidXmlCodePoint(codePoint)) {
      xmlSafe += character;
    }
  }

  return maskSecrets(xmlSafe)
    .replace(/\b(?:https?:\/\/|javascript:)[^\s<>"']*/giu, "[link omitted]")
    .replace(/\s+/gu, " ")
    .trim();
}

function escapeXml(value: string): string {
  return sanitizeText(value).replace(/[&<>"']/g, (character) => XML_ENTITIES[character]);
}

function characterWidth(character: string): number {
  if (/^[\u0300-\u036f\ufe00-\ufe0f]$/u.test(character)) {
    return 0;
  }
  return (character.codePointAt(0) ?? 0) <= 0x7f ? 1 : 2;
}

function textWidth(value: string): number {
  return Array.from(value).reduce((width, character) => width + characterWidth(character), 0);
}

function withEllipsis(value: string, maxWidth: number): string {
  const characters = Array.from(value.trimEnd());
  while (characters.length > 0 && textWidth(`${characters.join("")}…`) > maxWidth) {
    characters.pop();
  }
  return `${characters.join("").trimEnd()}…`;
}

function wrapText(value: string, maxWidth: number, maxLines: number): string[] {
  const normalized = sanitizeText(value);
  if (!normalized) {
    return ["—"];
  }

  const lines: string[] = [];
  let current = "";
  let currentWidth = 0;
  let truncated = false;

  for (const character of Array.from(normalized)) {
    const width = characterWidth(character);
    if (current && currentWidth + width > maxWidth) {
      if (lines.length === maxLines - 1) {
        truncated = true;
        break;
      }
      lines.push(current.trimEnd());
      current = character === " " ? "" : character;
      currentWidth = character === " " ? 0 : width;
      continue;
    }
    current += character;
    currentWidth += width;
  }

  if (truncated) {
    lines.push(withEllipsis(current, maxWidth));
  } else if (current || lines.length === 0) {
    lines.push(current.trimEnd());
  }

  return lines.slice(0, maxLines);
}

function renderText(options: TextOptions): string {
  const {
    x,
    y,
    lines,
    size,
    lineHeight,
    fill = "#151515",
    weight = 400,
    anchor = "start"
  } = options;
  const spans = lines
    .map((line, index) => {
      const position = index === 0 ? `y="${y}"` : `dy="${lineHeight}"`;
      return `<tspan x="${x}" ${position}>${escapeXml(line)}</tspan>`;
    })
    .join("");

  return `<text fill="${fill}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${spans}</text>`;
}

function uniqueTechNodes(techStack: readonly string[]): string[] {
  const seen = new Set<string>();
  const nodes: string[] = [];

  for (const rawValue of techStack) {
    const value = sanitizeText(rawValue);
    const key = value.toLowerCase();
    if (!value || seen.has(key)) {
      continue;
    }
    seen.add(key);
    nodes.push(value);
    if (nodes.length === MAX_TECH_NODES) {
      break;
    }
  }

  return nodes;
}

function renderTechNodes(techStack: readonly string[]): string {
  const nodes = uniqueTechNodes(techStack);
  if (nodes.length === 0) {
    return `${renderText({
      x: 70,
      y: 802,
      lines: ["Project technology context was not provided"],
      size: 15,
      lineHeight: 18,
      fill: "#6d6a63"
    })}`;
  }

  return nodes
    .map((node, index) => {
      const x = 64 + index * 184;
      const lines = wrapText(node, 19, 2);
      const firstLineY = lines.length === 1 ? 806 : 797;
      return `<g data-tech-node="true">
        <rect x="${x}" y="770" width="174" height="58" rx="12" fill="#ffffff" stroke="#d7d1c7" />
        ${renderText({
          x: x + 87,
          y: firstLineY,
          lines,
          size: 14,
          lineHeight: 17,
          weight: 600,
          anchor: "middle"
        })}
      </g>`;
    })
    .join("\n");
}

export function renderArchitectureSvg(input: ArchitectureSvgInput): string {
  const { project, artifacts } = input;
  const projectTitle = wrapText(project.title, 28, 2);
  const projectPitch = wrapText(
    artifacts.brief.oneSentencePitch || project.oneLiner,
    92,
    2
  );
  const agentStory = wrapText(artifacts.directorStrategy.agentStory, 78, 1);
  const architectureNote = wrapText(
    artifacts.protoPediaContent.systemArchitecture,
    27,
    4
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${SVG_HEIGHT}" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" role="img" aria-labelledby="architecture-title architecture-description">
  <title id="architecture-title">PitchForge product improvement architecture</title>
  <desc id="architecture-description">A deterministic diagram of the PitchForge evaluation and improvement flow for ${escapeXml(projectTitle.join(" "))}</desc>
  <defs>
    <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L0,6 L9,3 z" fill="#ea6a24" />
    </marker>
  </defs>
  <rect width="1600" height="900" fill="#f7f3ea" />
  <g font-family="Arial, Helvetica, sans-serif">
    ${renderText({
      x: 64,
      y: 58,
      lines: ["PitchForge product improvement architecture"],
      size: 32,
      lineHeight: 36,
      weight: 700
    })}
    ${renderText({
      x: 64,
      y: 96,
      lines: projectPitch,
      size: 16,
      lineHeight: 21,
      fill: "#5d5952"
    })}
    <line x1="64" y1="145" x2="1536" y2="145" stroke="#d7d1c7" />

    <path d="M310 345 H350" fill="none" stroke="#ea6a24" stroke-width="4" marker-end="url(#arrowhead)" />
    <path d="M600 345 H620" fill="none" stroke="#ea6a24" stroke-width="4" marker-end="url(#arrowhead)" />
    <path d="M1170 345 H1190" fill="none" stroke="#ea6a24" stroke-width="4" marker-end="url(#arrowhead)" />

    <path d="M480 480 V548 H505 V568" fill="none" stroke="#7b756c" stroke-width="2" marker-end="url(#arrowhead)" />
    <path d="M515 480 V540 H835 V568" fill="none" stroke="#7b756c" stroke-width="2" marker-start="url(#arrowhead)" marker-end="url(#arrowhead)" />
    <path d="M550 480 V530 H1165 V568" fill="none" stroke="#7b756c" stroke-width="2" marker-start="url(#arrowhead)" marker-end="url(#arrowhead)" />

    <g data-section="project-input">
      <rect x="60" y="210" width="250" height="270" rx="18" fill="#ffffff" stroke="#bbb3a7" stroke-width="2" />
      <rect x="60" y="210" width="250" height="10" rx="5" fill="#151515" />
      ${renderText({ x: 82, y: 254, lines: ["1. User / product input"], size: 18, lineHeight: 22, weight: 700 })}
      ${renderText({ x: 82, y: 289, lines: projectTitle, size: 22, lineHeight: 27, weight: 700, fill: "#ea6a24" })}
      ${renderText({
        x: 82,
        y: 358,
        lines: ["Product description", "Cloud and agent notes", "Screenshots / assets"],
        size: 15,
        lineHeight: 28,
        fill: "#5d5952"
      })}
    </g>

    <g data-section="cloud-run">
      <rect x="360" y="210" width="240" height="270" rx="18" fill="#eaf3ff" stroke="#4d8bd6" stroke-width="2" />
      ${renderText({ x: 382, y: 254, lines: ["2. Cloud Run"], size: 20, lineHeight: 24, weight: 700, fill: "#245f9f" })}
      ${renderText({
        x: 382,
        y: 300,
        lines: ["Next.js web / API", "Authenticated workspace", "Run orchestration", "Artifact export"],
        size: 16,
        lineHeight: 34,
        fill: "#28445f"
      })}
    </g>

    <g data-section="gemini-loop">
      <rect x="630" y="160" width="540" height="370" rx="22" fill="#f0ecff" stroke="#7758bd" stroke-width="2" />
      ${renderText({ x: 656, y: 201, lines: ["3. Gemini multi-agent loop"], size: 21, lineHeight: 25, weight: 700, fill: "#5d3ba4" })}
      ${renderText({ x: 656, y: 228, lines: ["Vertex AI / Gemini"], size: 13, lineHeight: 16, weight: 600, fill: "#7758bd" })}

      <rect x="660" y="247" width="110" height="42" rx="12" fill="#ffffff" stroke="#c8b9e8" />
      <rect x="800" y="247" width="125" height="42" rx="12" fill="#ffffff" stroke="#c8b9e8" />
      <rect x="955" y="247" width="130" height="42" rx="12" fill="#ffffff" stroke="#c8b9e8" />
      ${renderText({ x: 715, y: 274, lines: ["Brief"], size: 14, lineHeight: 17, weight: 700, anchor: "middle" })}
      ${renderText({ x: 862, y: 274, lines: ["Baseline review"], size: 13, lineHeight: 16, weight: 700, anchor: "middle" })}
      ${renderText({ x: 1020, y: 274, lines: ["Director"], size: 14, lineHeight: 17, weight: 700, anchor: "middle" })}
      ${renderText({ x: 785, y: 274, lines: ["→"], size: 18, lineHeight: 20, weight: 700, anchor: "middle", fill: "#7758bd" })}
      ${renderText({ x: 940, y: 274, lines: ["→"], size: 18, lineHeight: 20, weight: 700, anchor: "middle", fill: "#7758bd" })}

      <path d="M1020 289 V303" fill="none" stroke="#7758bd" stroke-width="2" marker-end="url(#arrowhead)" />
      <rect x="660" y="308" width="425" height="42" rx="12" fill="#ffffff" stroke="#c8b9e8" />
      ${renderText({
        x: 872,
        y: 335,
        lines: ["Parallel generation: Demos · Public copy · Visuals · Checklist"],
        size: 12,
        lineHeight: 15,
        weight: 700,
        anchor: "middle"
      })}

      <path d="M872 350 V359 H715 V367" fill="none" stroke="#7758bd" stroke-width="2" marker-end="url(#arrowhead)" />
      <rect x="660" y="367" width="110" height="42" rx="12" fill="#ffffff" stroke="#c8b9e8" data-loop-step="draft-judge" />
      <rect x="800" y="367" width="125" height="42" rx="12" fill="#fff4ec" stroke="#ea6a24" data-loop-step="revision-planner" />
      <rect x="955" y="367" width="130" height="42" rx="12" fill="#fff4ec" stroke="#ea6a24" data-loop-step="optimizer-candidate" />
      ${renderText({ x: 715, y: 394, lines: ["Draft review"], size: 13, lineHeight: 16, weight: 700, anchor: "middle" })}
      ${renderText({ x: 862, y: 385, lines: ["Revision planner", "selects actions"], size: 11, lineHeight: 14, weight: 700, anchor: "middle" })}
      ${renderText({ x: 1020, y: 385, lines: ["Optimizer candidate", "for selected actions"], size: 11, lineHeight: 14, weight: 700, anchor: "middle" })}
      ${renderText({ x: 785, y: 394, lines: ["→"], size: 18, lineHeight: 20, weight: 700, anchor: "middle", fill: "#ea6a24" })}
      ${renderText({ x: 940, y: 394, lines: ["→"], size: 18, lineHeight: 20, weight: 700, anchor: "middle", fill: "#ea6a24" })}

      <path d="M1020 409 V419 H807 V427" fill="none" stroke="#ea6a24" stroke-width="2" marker-end="url(#arrowhead)" />
      <rect x="735" y="427" width="145" height="42" rx="12" fill="#fff4ec" stroke="#ea6a24" data-loop-step="selected-only-merge" />
      <rect x="920" y="427" width="140" height="42" rx="12" fill="#fff4ec" stroke="#ea6a24" data-loop-step="judge-observe" />
      ${renderText({ x: 807, y: 444, lines: ["Selected-only merge", "others unchanged"], size: 11, lineHeight: 14, weight: 700, anchor: "middle" })}
      ${renderText({ x: 990, y: 444, lines: ["Quality review", "score delta"], size: 11, lineHeight: 14, weight: 700, anchor: "middle" })}
      ${renderText({ x: 900, y: 454, lines: ["→"], size: 18, lineHeight: 20, weight: 700, anchor: "middle", fill: "#ea6a24" })}
      <path data-loop-edge="improved-next-round" d="M990 469 V483 H862 V419" fill="none" stroke="#7758bd" stroke-width="2" stroke-dasharray="5 4" marker-end="url(#arrowhead)" />

      ${renderText({
        x: 656,
        y: 499,
        lines: ["Improved: accept + next round · No gain: discard + stop · Maximum 2 rounds"],
        size: 11,
        lineHeight: 14,
        weight: 600,
        fill: "#5d3ba4"
      })}
      ${renderText({ x: 656, y: 519, lines: agentStory, size: 11, lineHeight: 14, fill: "#5d5270" })}
    </g>

    <g data-section="improvement-outputs">
      <rect x="1200" y="210" width="340" height="270" rx="18" fill="#fff4ec" stroke="#ea6a24" stroke-width="2" />
      ${renderText({ x: 1224, y: 254, lines: ["4. Improvement outputs"], size: 20, lineHeight: 24, weight: 700, fill: "#b64c17" })}
      ${renderText({
        x: 1224,
        y: 300,
        lines: ["Scores before / after", "Demo scripts", "Public product copy", "Visual concepts", "Readiness checklist", "Markdown / JSON"],
        size: 15,
        lineHeight: 29,
        fill: "#603a27"
      })}
    </g>

    <g data-section="architecture-note">
      <rect x="60" y="568" width="250" height="122" rx="16" fill="#ffffff" stroke="#d7d1c7" />
      ${renderText({ x: 80, y: 600, lines: ["Architecture note"], size: 15, lineHeight: 18, weight: 700 })}
      ${renderText({ x: 80, y: 628, lines: architectureNote, size: 12, lineHeight: 16, fill: "#5d5952" })}
    </g>

    <g data-section="password-auth">
      <rect x="360" y="568" width="290" height="122" rx="16" fill="#ffffff" stroke="#4d8bd6" stroke-width="2" />
      ${renderText({ x: 382, y: 606, lines: ["Password auth"], size: 18, lineHeight: 22, weight: 700, fill: "#245f9f" })}
      ${renderText({ x: 382, y: 638, lines: ["Pre-provisioned accounts", "Signed httpOnly session"], size: 14, lineHeight: 24, fill: "#4d5964" })}
    </g>

    <g data-section="cloud-sql">
      <rect x="690" y="568" width="290" height="122" rx="16" fill="#ffffff" stroke="#4d8bd6" stroke-width="2" />
      ${renderText({ x: 712, y: 606, lines: ["Cloud SQL / PostgreSQL"], size: 18, lineHeight: 22, weight: 700, fill: "#245f9f" })}
      ${renderText({ x: 712, y: 638, lines: ["auth_users, login throttle", "Projects, runs, artifacts"], size: 14, lineHeight: 24, fill: "#4d5964" })}
    </g>

    <g data-section="cloud-storage">
      <rect x="1020" y="568" width="290" height="122" rx="16" fill="#ffffff" stroke="#4d8bd6" stroke-width="2" />
      ${renderText({ x: 1042, y: 606, lines: ["Cloud Storage"], size: 18, lineHeight: 22, weight: 700, fill: "#245f9f" })}
      ${renderText({ x: 1042, y: 638, lines: ["Screenshots", "Uploaded project assets"], size: 14, lineHeight: 24, fill: "#4d5964" })}
    </g>

    ${renderText({ x: 64, y: 744, lines: ["Project technology context (deduplicated, max 8)"], size: 15, lineHeight: 18, weight: 700, fill: "#5d5952" })}
    ${renderTechNodes(project.techStack)}

    ${renderText({
      x: 1536,
      y: 870,
      lines: ["Generated deterministically from product data and PitchForge outputs"],
      size: 12,
      lineHeight: 15,
      fill: "#777169",
      anchor: "end"
    })}
  </g>
</svg>`;
}
