export const defaultLoginRedirect = "/projects/new";

const allowedReturnPaths = [
  /^\/projects\/(?:new|[a-zA-Z0-9_-]+)\/?$/,
  /^\/admin\/invites\/?$/
];

export function safeLoginRedirect(
  candidate: string | string[] | null | undefined
): string {
  if (typeof candidate !== "string" || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return defaultLoginRedirect;
  }
  if (candidate.includes("\\") || /[\u0000-\u001f\u007f]/.test(candidate)) {
    return defaultLoginRedirect;
  }

  const rawPath = candidate.split(/[?#]/, 1)[0] ?? "";
  if (!allowedReturnPaths.some((pattern) => pattern.test(rawPath))) {
    return defaultLoginRedirect;
  }

  try {
    const baseUrl = new URL("https://pitchforge.invalid");
    const parsed = new URL(candidate, baseUrl);
    if (
      parsed.origin !== baseUrl.origin ||
      !allowedReturnPaths.some((pattern) => pattern.test(parsed.pathname))
    ) {
      return defaultLoginRedirect;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return defaultLoginRedirect;
  }
}
