import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// ── Barreira de borda (defesa em profundidade) ───────────────────────────────
// A autorização real é feita nas rotas (requireAuth / requireClientAuth). Aqui
// só evitamos que o papel CLIENT alcance qualquer rota interna, e que a equipe
// caia na área do cliente. Não derruba sessões da equipe (mantém o comportamento
// atual onde cada página valida a própria sessão).

// Prefixos exclusivos do CLIENTE (UI + API executiva).
const CLIENT_PREFIXES = ["/c", "/api/client"];
// Sempre liberados.
const PUBLIC_PREFIXES = ["/login", "/api/auth", "/logout"];

function startsWithAny(path: string, prefixes: string[]): boolean {
  return prefixes.some((p) => path === p || path.startsWith(`${p}/`));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (startsWithAny(pathname, PUBLIC_PREFIXES)) return NextResponse.next();

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const role = token?.role as string | undefined;

  const isClientArea = startsWithAny(pathname, CLIENT_PREFIXES);

  // Sem sessão: só protegemos a área do cliente (o resto segue como hoje,
  // validado por página). Área do cliente sem token → login.
  if (!token) {
    if (isClientArea) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (role === "CLIENT") {
    // Cliente só acessa a própria área + rotas públicas.
    if (!isClientArea) {
      const url = req.nextUrl.clone();
      url.pathname = "/c";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Equipe interna não usa a área do cliente.
  if (isClientArea) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Roda em tudo, exceto estáticos do Next e assets de imagem.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png).*)"],
};
