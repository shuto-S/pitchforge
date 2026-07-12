const githubOwnerPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/u;
const githubRepositoryPattern = /^[A-Za-z0-9._-]{1,100}$/u;

export function normalizePublicGitHubRepositoryUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    const pathMatch = url.pathname.match(/^\/([^/]+)\/([^/]+)\/?$/u);
    const owner = pathMatch?.[1] ?? "";
    const repositoryWithSuffix = pathMatch?.[2] ?? "";
    const repository = repositoryWithSuffix.endsWith(".git")
      ? repositoryWithSuffix.slice(0, -4)
      : repositoryWithSuffix;
    const isPublicRepositoryUrl =
      url.protocol === "https:" &&
      url.hostname.toLowerCase() === "github.com" &&
      url.port === "" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      Boolean(pathMatch) &&
      githubOwnerPattern.test(owner) &&
      githubRepositoryPattern.test(repository) &&
      repository !== "." &&
      repository !== "..";

    return isPublicRepositoryUrl
      ? `https://github.com/${owner}/${repository}`
      : null;
  } catch {
    return null;
  }
}
