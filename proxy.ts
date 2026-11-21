import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/overview",
  "/inbox",
  "/campaigns",
  "/automations",
  "/logs",
  "/settings",
  "/integrations",
  "/diagnostics",
];

function hasSessionCookie(request: NextRequest): boolean {
  return (
    request.cookies.has("authjs.session-token") ||
    request.cookies.has("__Secure-authjs.session-token")
  );
}

// Cheap pre-check only: the real session validation happens in the dashboard
// layout via auth(). A signed-in user visiting /login is redirected by the
// login page itself, after validating the session — redirecting here on the
// mere presence of a cookie would loop forever on a revoked session (e.g.
// after a password change in another browser).
export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (isProtected && !hasSessionCookie(request)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

// Must be literal values: Next.js analyzes the matcher at build time. Keep in
// sync with PROTECTED_PREFIXES.
export const config = {
  matcher: [
    "/dashboard",
    "/dashboard/:path*",
    "/overview",
    "/overview/:path*",
    "/inbox",
    "/inbox/:path*",
    "/campaigns",
    "/campaigns/:path*",
    "/automations",
    "/automations/:path*",
    "/logs",
    "/logs/:path*",
    "/settings",
    "/settings/:path*",
    "/integrations",
    "/integrations/:path*",
    "/diagnostics",
    "/diagnostics/:path*",
  ],
};
