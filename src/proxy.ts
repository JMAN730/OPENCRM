import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// Public paths that should NOT require an authenticated session. Everything
// the matcher allows through is otherwise gated. Adding a new public page or
// API route requires an explicit entry here — the default is "protected", so
// freshly-added routes can't accidentally leak.
const PUBLIC_PATH_PREFIXES = [
  "/auth", // /auth/signin, /auth/register, /auth/forgot-password, /auth/reset-password, /auth/accept-invite
  "/api/auth", // NextAuth's own session endpoints
  "/api/health", // health probe (when/if added)
];

// tRPC procedures we explicitly allow without an authenticated session.
// Anything else under /api/trpc/* must come from a logged-in user.
const PUBLIC_TRPC_PROCEDURES = new Set([
  "auth.register",
  "auth.resetPassword",
  "auth.confirmResetPassword",
]);

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  if (PUBLIC_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return true;
  }
  // /api/trpc/<procedure> or batched /api/trpc/<procedure1,procedure2>
  if (pathname.startsWith("/api/trpc/")) {
    const procedures = pathname.slice("/api/trpc/".length).split(",");
    return procedures.every((p) => PUBLIC_TRPC_PROCEDURES.has(p));
  }
  return false;
}

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });
  if (token) return NextResponse.next();

  // API routes get a 401 instead of a redirect — fetch clients can read it.
  if (pathname.startsWith("/api/")) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const signInUrl = new URL("/auth/signin", req.url);
  signInUrl.searchParams.set("callbackUrl", pathname + search);
  return NextResponse.redirect(signInUrl);
}

// Match everything except Next internals and static assets. The proxy()
// function itself enforces the public/protected boundary so we don't have
// to keep an explicit list of routes here — new pages are protected by
// default.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)",
  ],
};
