import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { isPlatformAdmin } from "@/lib/platform-admin";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/campaigns",
  "/automations",
  "/accounts",
  "/logs",
  "/settings",
  "/admin",
];

// The admin area (operators in ADMIN_EMAILS only), Diagnostics included.
function isAdminPath(pathname: string): boolean {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return true;
  return pathname.startsWith("/api/admin/");
}

async function adminEmailFromSession(request: NextRequest): Promise<string | null> {
  try {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
      secureCookie: request.cookies.has("__Secure-authjs.session-token"),
    });
    const email = typeof token?.email === "string" ? token.email : null;
    return isPlatformAdmin(email) ? email : null;
  } catch {
    return null;
  }
}

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
export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Admin area: a signed-in non-admin gets 403 here, before the page or API
  // runs. Every admin page and API checks again on the server (lib/admin/auth.ts),
  // against the database-validated session.
  if (isAdminPath(pathname) && hasSessionCookie(request) && !(await adminEmailFromSession(request))) {
    return pathname.startsWith("/api/")
      ? NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
      : new NextResponse("403 — Acesso restrito / Restricted access", {
          status: 403,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
  }
  if (pathname.startsWith("/api/admin/") && !hasSessionCookie(request)) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }
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
    "/campaigns",
    "/campaigns/:path*",
    "/automations",
    "/automations/:path*",
    "/accounts",
    "/accounts/:path*",
    "/logs",
    "/logs/:path*",
    "/settings",
    "/settings/:path*",
    "/admin",
    "/admin/:path*",
    "/api/admin/:path*",
  ],
};
