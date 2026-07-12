import { z } from "zod";
import { publicGitHubRepositoryUrlSchema } from "@/lib/schemas/project";
import { maskPublicRepositorySecrets } from "@/lib/server/security";

const GITHUB_API_ORIGIN = "https://api.github.com";
const GITHUB_API_VERSION = "2026-03-10";
const REQUEST_TIMEOUT_MS = 8_000;
const README_LIMIT_BYTES = 32 * 1024;
const CONFIG_LIMIT_BYTES = 8 * 1024;
export const GITHUB_IMPORT_TOTAL_BYTES = 64 * 1024;

const CONFIG_FILE_PRIORITY = [
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "Dockerfile",
  "cloudbuild.yaml",
  "cloudbuild.yml",
  "docker-compose.yml",
  "docker-compose.yaml",
  "go.mod",
  "Cargo.toml"
] as const;

const repositoryMetadataSchema = z.object({
  name: z.string().min(1).max(100),
  full_name: z.string().min(3).max(201),
  description: z.string().nullable().optional(),
  homepage: z.string().nullable().optional(),
  default_branch: z.string().min(1).max(255),
  language: z.string().nullable().optional(),
  topics: z.array(z.string().max(50)).max(100).default([]),
  private: z.boolean(),
  visibility: z.string().optional()
});

const rootEntrySchema = z.object({
  name: z.string().min(1).max(255),
  path: z.string().min(1).max(255),
  type: z.string(),
  size: z.number().int().nonnegative().optional()
});
const rootEntriesSchema = z.array(rootEntrySchema).max(1_000);

export type GitHubRepositoryFile = {
  path: string;
  content: string;
};

export type GitHubRepositorySnapshot = {
  canonicalUrl: string;
  owner: string;
  repository: string;
  fullName: string;
  name: string;
  description: string;
  homepage: string;
  defaultBranch: string;
  language: string;
  topics: string[];
  files: GitHubRepositoryFile[];
  detectedTechStack: string[];
  warnings: string[];
};

export type GitHubFetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export class GitHubImportError extends Error {
  constructor(
    readonly status: 400 | 404 | 429 | 502,
    readonly code:
      | "INVALID_GITHUB_URL"
      | "REPOSITORY_NOT_FOUND"
      | "GITHUB_RATE_LIMITED"
      | "GITHUB_UNAVAILABLE",
    message: string
  ) {
    super(message);
    this.name = "GitHubImportError";
  }
}

export function parsePublicGitHubRepositoryUrl(value: string): {
  canonicalUrl: string;
  owner: string;
  repository: string;
} {
  const parsed = publicGitHubRepositoryUrlSchema.safeParse(value);
  if (!parsed.success) {
    throw new GitHubImportError(
      400,
      "INVALID_GITHUB_URL",
      "公開GitHubリポジトリのURLを入力してください。"
    );
  }
  const url = new URL(parsed.data);
  const [, owner, repository] = url.pathname.split("/");
  return { canonicalUrl: parsed.data, owner, repository };
}

export async function fetchPublicGitHubRepository(
  githubUrl: string,
  fetchImpl: GitHubFetch = fetch
): Promise<GitHubRepositorySnapshot> {
  const parsedUrl = parsePublicGitHubRepositoryUrl(githubUrl);
  const repositoryPath = `/repos/${encodeURIComponent(parsedUrl.owner)}/${encodeURIComponent(
    parsedUrl.repository
  )}`;
  const metadataResponse = await githubRequest(fetchImpl, repositoryPath);
  const metadata = repositoryMetadataSchema.parse(
    await readJsonWithinLimit(metadataResponse, 128 * 1024)
  );
  if (metadata.private || metadata.visibility === "private" || metadata.visibility === "internal") {
    throw new GitHubImportError(
      404,
      "REPOSITORY_NOT_FOUND",
      "公開リポジトリを確認できませんでした。"
    );
  }

  const [readmeResponse, rootResponse] = await Promise.all([
    githubRequest(fetchImpl, `${repositoryPath}/readme`, {
      accept: "application/vnd.github.raw+json",
      optionalNotFound: true
    }),
    githubRequest(fetchImpl, `${repositoryPath}/contents`)
  ]);
  const rootEntries = rootEntriesSchema.parse(
    await readJsonWithinLimit(rootResponse, 512 * 1024)
  );
  const rootFiles = rootEntries.filter((entry) => entry.type === "file");
  const readmeName =
    rootFiles.find((entry) => /^readme(?:\.|$)/iu.test(entry.name))?.name ?? "README";

  const warnings: string[] = [];
  const files: GitHubRepositoryFile[] = [];
  let totalBytes = 0;

  if (readmeResponse) {
    const readme = await readTextWithinLimit(readmeResponse, README_LIMIT_BYTES, true);
    if (readme.text) {
      files.push({ path: readmeName, content: sanitizeRepositoryText(readme.text) });
      totalBytes += readme.bytesRead;
    }
    if (readme.truncated) {
      warnings.push("READMEは先頭32KiBのみ解析しました。");
    }
  } else {
    warnings.push("READMEを確認できませんでした。");
  }

  const rootFileByName = new Map(rootFiles.map((entry) => [entry.name.toLowerCase(), entry]));
  const selectedEntries = CONFIG_FILE_PRIORITY.flatMap((name) => {
    const entry = rootFileByName.get(name.toLowerCase());
    if (!entry || (entry.size ?? 0) > CONFIG_LIMIT_BYTES * 4) {
      return [];
    }
    return [entry];
  }).slice(0, 4);

  const configResponses = await Promise.all(
    selectedEntries.map(async (entry) => ({
      entry,
      response: await githubRequest(fetchImpl, `${repositoryPath}/contents/${encodeURIComponent(entry.path)}`, {
        accept: "application/vnd.github.raw+json",
        optionalNotFound: true
      })
    }))
  );

  for (const { entry, response } of configResponses) {
    if (!response || totalBytes >= GITHUB_IMPORT_TOTAL_BYTES) {
      continue;
    }
    const remaining = Math.min(CONFIG_LIMIT_BYTES, GITHUB_IMPORT_TOTAL_BYTES - totalBytes);
    const file = await readTextWithinLimit(response, remaining, true);
    if (!file.text || file.text.includes("\0")) {
      warnings.push(`${entry.path}はテキストとして解析できませんでした。`);
      continue;
    }
    files.push({ path: entry.path, content: sanitizeRepositoryText(file.text) });
    totalBytes += file.bytesRead;
    if (file.truncated) {
      warnings.push(`${entry.path}は先頭${remaining}バイトのみ解析しました。`);
    }
  }

  const homepage = validatedHomepage(metadata.homepage);
  const snapshot: GitHubRepositorySnapshot = {
    canonicalUrl: parsedUrl.canonicalUrl,
    owner: parsedUrl.owner,
    repository: parsedUrl.repository,
    fullName: sanitizeRepositoryText(metadata.full_name).slice(0, 201),
    name: sanitizeRepositoryText(metadata.name).slice(0, 100),
    description: sanitizeRepositoryText(metadata.description ?? "").slice(0, 500),
    homepage,
    defaultBranch: sanitizeRepositoryText(metadata.default_branch).slice(0, 255),
    language: sanitizeRepositoryText(metadata.language ?? "").slice(0, 60),
    topics: uniqueStrings((metadata.topics ?? []).map(sanitizeRepositoryText)).slice(0, 10),
    files,
    detectedTechStack: [],
    warnings
  };
  snapshot.detectedTechStack = detectTechStack(snapshot);
  return snapshot;
}

function apiUrl(path: string): string {
  return `${GITHUB_API_ORIGIN}${path}`;
}

async function githubRequest(
  fetchImpl: GitHubFetch,
  path: string,
  options: { accept?: string; optionalNotFound?: boolean } = {}
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetchImpl(apiUrl(path), {
      method: "GET",
      headers: {
        Accept: options.accept ?? "application/vnd.github+json",
        "User-Agent": "PitchForge/0.1",
        "X-GitHub-Api-Version": GITHUB_API_VERSION
      },
      redirect: "error",
      signal: controller.signal
    });
  } catch {
    throw new GitHubImportError(
      502,
      "GITHUB_UNAVAILABLE",
      "GitHubへの接続を完了できませんでした。"
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 404 && options.optionalNotFound) {
    return null;
  }
  if (response.status === 404) {
    throw new GitHubImportError(
      404,
      "REPOSITORY_NOT_FOUND",
      "公開リポジトリを確認できませんでした。"
    );
  }
  if (
    response.status === 429 ||
    response.status === 422 ||
    (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0")
  ) {
    throw new GitHubImportError(
      429,
      "GITHUB_RATE_LIMITED",
      "GitHubの読み取り上限に達しました。時間をおいて再度お試しください。"
    );
  }
  if (!response.ok) {
    throw new GitHubImportError(
      502,
      "GITHUB_UNAVAILABLE",
      "GitHubからリポジトリ情報を取得できませんでした。"
    );
  }
  return response;
}

async function readJsonWithinLimit(response: Response | null, maxBytes: number): Promise<unknown> {
  if (!response) {
    throw new GitHubImportError(
      502,
      "GITHUB_UNAVAILABLE",
      "GitHubの応答を確認できませんでした。"
    );
  }
  const result = await readTextWithinLimit(response, maxBytes, false);
  try {
    return JSON.parse(result.text) as unknown;
  } catch {
    throw new GitHubImportError(
      502,
      "GITHUB_UNAVAILABLE",
      "GitHubの応答形式を確認できませんでした。"
    );
  }
}

async function readTextWithinLimit(
  response: Response,
  maxBytes: number,
  truncate: boolean
): Promise<{ text: string; bytesRead: number; truncated: boolean }> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (!truncate && Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new GitHubImportError(
      502,
      "GITHUB_UNAVAILABLE",
      "GitHubの応答が大きすぎます。"
    );
  }

  if (!response.body) {
    const bytes = new TextEncoder().encode(await response.text());
    if (!truncate && bytes.byteLength > maxBytes) {
      throw new GitHubImportError(502, "GITHUB_UNAVAILABLE", "GitHubの応答が大きすぎます。");
    }
    const selected = bytes.slice(0, maxBytes);
    return decodeBytes(selected, bytes.byteLength > maxBytes);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;
  let truncated = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    const remaining = maxBytes - bytesRead;
    if (value.byteLength > remaining) {
      if (!truncate) {
        await reader.cancel();
        throw new GitHubImportError(502, "GITHUB_UNAVAILABLE", "GitHubの応答が大きすぎます。");
      }
      if (remaining > 0) {
        chunks.push(value.slice(0, remaining));
        bytesRead += remaining;
      }
      truncated = true;
      await reader.cancel();
      break;
    }
    chunks.push(value);
    bytesRead += value.byteLength;
    if (bytesRead === maxBytes) {
      const next = await reader.read();
      truncated = !next.done;
      if (!next.done) {
        await reader.cancel();
      }
      break;
    }
  }

  const joined = new Uint8Array(bytesRead);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return decodeBytes(joined, truncated);
}

function decodeBytes(bytes: Uint8Array, truncated: boolean) {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { text: "", bytesRead: bytes.byteLength, truncated };
  }
  return { text, bytesRead: bytes.byteLength, truncated };
}

function sanitizeRepositoryText(value: string): string {
  return maskPublicRepositorySecrets(value.replace(/\r\n?/gu, "\n")).trim();
}

function validatedHomepage(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password) {
      return "";
    }
    const normalized = url.href;
    return maskPublicRepositorySecrets(normalized) === normalized ? normalized : "";
  } catch {
    return "";
  }
}

function detectTechStack(snapshot: GitHubRepositorySnapshot): string[] {
  const detected = new Set<string>();
  if (snapshot.language) {
    detected.add(snapshot.language);
  }
  const corpus = `${snapshot.topics.join(" ")}\n${snapshot.files
    .map((file) => `${file.path}\n${file.content}`)
    .join("\n")}`;
  const patterns: Array<[RegExp, string]> = [
    [/\bnext(?:\.js)?\b|"next"\s*:/iu, "Next.js"],
    [/\breact\b|"react"\s*:/iu, "React"],
    [/@google\/genai|\bgemini\b/iu, "Gemini"],
    [/\bcloud[ -]?run\b/iu, "Cloud Run"],
    [/\bcloud[ -]?sql\b|\bpostgres(?:ql)?\b|"pg"\s*:/iu, "PostgreSQL"],
    [/\bcloud[ -]?storage\b|@google-cloud\/storage/iu, "Cloud Storage"],
    [/\btypescript\b|"typescript"\s*:/iu, "TypeScript"],
    [/\bpython\b|pyproject\.toml/iu, "Python"],
    [/\bdocker\b|dockerfile/iu, "Docker"],
    [/\bterraform\b/iu, "Terraform"]
  ];
  for (const [pattern, label] of patterns) {
    if (pattern.test(corpus)) {
      detected.add(label);
    }
  }
  return [...detected].slice(0, 20);
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
