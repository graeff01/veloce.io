import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const adminOnlyRoutes = ["/settings"];

// Set DISABLE_AUTH=true in .env to bypass auth locally (no database needed).
// Fail-secure: NUNCA bypassa auth em produção, mesmo que a env vaze.
const DISABLE_AUTH = process.env.NODE_ENV !== "production" && process.env.DISABLE_AUTH === "true";

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
  // Gate de borda só para PÁGINAS internas. Fora do gate:
  //  • /api — rotas se protegem com requireAuth (401 JSON, não redirect HTML);
  //  • /r/ — PAINEL DO CLIENTE (capability link público, sem login);
  //  • /privacy — política de privacidade pública (URL do app da Meta);
  //  • assets do Next e arquivos com extensão.
  matcher: [
    "/((?!api|login|privacy|r/|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
