const HTTP_PROTOCOLS = new Set(["http:", "https:"]);
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;
const CREDENTIAL_BEARING_HTTP_URL_PATTERN =
  /\bhttps?:\/\/[^\s/?#@]+(?::[^\s/?#@]*)?@[^\s<>"']+/giu;

export const HIDDEN_EXTERNAL_URL_TEXT = "安全でないURLを非表示";

/**
 * Returns a canonical external HTTP(S) URL that is safe to expose as a link.
 */
export function safeExternalHttpUrl(value: string): string | null {
  const candidate = value.trim();
  if (!candidate || CONTROL_CHARACTER_PATTERN.test(candidate)) {
    return null;
  }

  try {
    const url = new URL(candidate);
    if (!HTTP_PROTOCOLS.has(url.protocol) || url.username || url.password) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

/**
 * Removes credential-bearing HTTP(S) URLs from arbitrary persisted or AI-generated text.
 * The fixed replacement must not contain any part of the original URL.
 */
export function redactCredentialBearingHttpUrls(value: string): string {
  return value.replace(CREDENTIAL_BEARING_HTTP_URL_PATTERN, HIDDEN_EXTERNAL_URL_TEXT);
}

/**
 * Clones JSON-like data while redacting credential-bearing URLs in every string value.
 */
export function sanitizeCredentialBearingUrls<T>(value: T): T {
  if (typeof value === "string") {
    return redactCredentialBearingHttpUrls(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeCredentialBearingUrls(item)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeCredentialBearingUrls(item)])
    ) as T;
  }
  return value;
}

export function externalHttpUrlDisplayText(value: string): string {
  return safeExternalHttpUrl(value) ?? HIDDEN_EXTERNAL_URL_TEXT;
}
