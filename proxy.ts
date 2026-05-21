import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const adminOnlyRoutes = ["/settings"];

// Set DISABLE_AUTH=true in .env to bypass auth locally (no database needed)
// Remove this variable before deploying to Railway
const DISABLE_AUTH = process.env.DISABLE_AUTH === "true";

export async function proxy(req: NextRequest) {
  if (DISABLE_AUTH) return NextResponse.next();

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (adminOnlyRoutes.some((r) => req.nextUrl.pathname.startsWith(r))) {
    if (token.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!login|api/auth|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
