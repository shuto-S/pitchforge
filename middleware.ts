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
    return NextResponse.next();
  }

  if (protectedApiPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.json(
      { error: "Authentication required", code: "UNAUTHENTICATED" },
      { status: 401 }
    );
  }

  if (protectedPagePrefixes.some((prefix) => pathname.startsWith(prefix))) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/projects/:path*", "/admin/:path*", "/api/projects/:path*", "/api/admin/:path*"]
};
