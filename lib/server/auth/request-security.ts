import { AuthError } from "@/lib/server/auth";

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin && !requestOriginCandidates(request).has(normalizedOrigin(origin))) {
    throw new AuthError(403, "FORBIDDEN", "Invalid request origin");
  }
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new AuthError(403, "FORBIDDEN", "Invalid request origin");
  }
}

function requestOriginCandidates(request: Request): Set<string | null> {
  const requestUrl = new URL(request.url);
  const candidates = new Set<string | null>([requestUrl.origin]);
  const host = singleHeaderValue(request.headers.get("host"));
  const requestProtocol = normalizedProtocol(requestUrl.protocol);
  const forwardedProto = normalizedProtocol(
    singleHeaderValue(request.headers.get("x-forwarded-proto"))
  );

  if (host && requestProtocol) {
    candidates.add(originFromHost(host, requestProtocol));
    if (forwardedProto) {
      candidates.add(originFromHost(host, forwardedProto));
    }
  }

  // Cloud Run terminates the public connection at a trusted proxy and sets
  // K_SERVICE. Only inside that boundary do we use forwarded host information;
  // accepting an arbitrary client-supplied X-Forwarded-Host would bypass CSRF checks.
  if (process.env.K_SERVICE && forwardedProto) {
    const forwardedHost = singleHeaderValue(request.headers.get("x-forwarded-host"));
    if (forwardedHost) {
      candidates.add(originFromHost(forwardedHost, forwardedProto));
    }
  }

  candidates.delete(null);
  return candidates;
}

function singleHeaderValue(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const values = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return values.length === 1 ? values[0] : null;
}

function normalizedProtocol(value: string | null): "http:" | "https:" | null {
  if (value === "http" || value === "http:") {
    return "http:";
  }
  if (value === "https" || value === "https:") {
    return "https:";
  }
  return null;
}

function originFromHost(host: string, protocol: "http:" | "https:"): string | null {
  if (/[/\\@\s]/u.test(host)) {
    return null;
  }
  try {
    const url = new URL(`${protocol}//${host}`);
    return url.pathname === "/" && !url.search && !url.hash ? url.origin : null;
  } catch {
    return null;
  }
}

function normalizedOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}
