import { NextRequest, NextResponse } from "next/server";

const protectedPagePrefixes = ["/projects", "/admin"];
const protectedApiPrefixes = ["/api/projects", "/api/admin"];

export function middleware(request: NextRequest) {
  if (process.env.AUTH_BYPASS_FOR_TEST === "true" && process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }

  const pathname = request.nextUrl.pathname;
  const cookieName = process.env.SESSION_COOKIE_NAME ?? "__session";
  if (request.cookies.has(cookieName)) {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

  if (protectedApiPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.json(
      { error: "Authentication required", code: "UNAUTHENTICATED" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (protectedPagePrefixes.some((prefix) => pathname.startsWith(prefix))) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    const response = NextResponse.redirect(loginUrl);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/projects/:path*", "/admin/:path*", "/api/projects/:path*", "/api/admin/:path*"]
};
