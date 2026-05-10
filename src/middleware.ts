import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/leads",
  "/dialer",
  "/tasks",
  "/scraper",
  "/outreach",
  "/analytics",
  "/settings",
];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (!PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });
  if (token) return NextResponse.next();

  const signInUrl = new URL("/auth/signin", req.url);
  signInUrl.searchParams.set("callbackUrl", pathname + search);
  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/leads/:path*",
    "/dialer/:path*",
    "/tasks/:path*",
    "/scraper/:path*",
    "/outreach/:path*",
    "/analytics/:path*",
    "/settings/:path*",
  ],
};
