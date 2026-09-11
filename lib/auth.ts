import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

// Rate limit simples de login (em memória, por e-mail) contra brute force.
// Em processo único (Railway) o estado persiste entre requisições.
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILS = 8;
const loginFails = new Map<string, { count: number; first: number }>();
// Intervalo de reconferência do usuário no banco a partir do JWT (achado D-01).
const REVALIDATE_MS = Number(process.env.AUTH_REVALIDATE_MS || 60_000);
// O Map acima crescia sem limite (uma entrada por e-mail tentado): um atacante mandando
// e-mails aleatórios levava o processo a OOM. Varremos as janelas vencidas.
let lastFailSweep = 0;
function sweepLoginFails(now: number) {
  if (now - lastFailSweep < LOGIN_WINDOW_MS) return;
  lastFailSweep = now;
  for (const [k, v] of loginFails) if (now - v.first > LOGIN_WINDOW_MS) loginFails.delete(k);
}

function isLocked(email: string): boolean {
  const a = loginFails.get(email);
  if (!a) return false;
  if (Date.now() - a.first > LOGIN_WINDOW_MS) { loginFails.delete(email); return false; }
  return a.count >= LOGIN_MAX_FAILS;
}
function recordFail(email: string) {
  const now = Date.now();
  sweepLoginFails(now);
  const a = loginFails.get(email);
  if (!a || now - a.first > LOGIN_WINDOW_MS) loginFails.set(email, { count: 1, first: now });
  else a.count++;
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 hours
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = credentials.email.toLowerCase().trim();

        // Bloqueia após muitas tentativas falhas na janela de tempo
        if (isLocked(email)) return null;

        // O lockout é indexado pelo e-mail NORMALIZADO, mas a busca usava o e-mail cru —
        // em Postgres a comparação é sensível a maiúsculas, então "Joao@x.com" não
        // encontrava o cadastro "joao@x.com" (falha de login legítimo, não de segurança).
        const user = await prisma.user.findFirst({
          where: {
            email: { equals: email, mode: "insensitive" },
            deletedAt: null,
            active: true,
          },
        });

        if (!user) { recordFail(email); return null; }

        const passwordMatch = await bcrypt.compare(
          credentials.password,
          user.password
        );
        if (!passwordMatch) { recordFail(email); return null; }

        loginFails.delete(email); // sucesso limpa o contador

        // Log login event
        await prisma.executionLog.create({
          data: {
            userId: user.id,
            action: "LOGIN",
            details: { email: user.email },
          },
        });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { id: string; role: Role }).role;
        token.rv = Date.now();
        return token;
      }

      // ── Revalidação periódica (achado D-01) ──────────────────────────────────
      // O papel era gravado no JWT no login e NUNCA mais conferido: rebaixar,
      // DESATIVAR ou excluir um usuário não derrubava a sessão — ele seguia operando
      // com o privilégio antigo por até 8h. Agora reconferimos contra o banco no
      // máximo 1× por minuto por usuário (custo desprezível, janela de revogação curta).
      if (!token.id) return token;
      if (Date.now() - (token.rv ?? 0) < REVALIDATE_MS) return token;
      try {
        const u = await prisma.user.findFirst({
          where: { id: token.id, deletedAt: null, active: true },
          select: { role: true },
        });
        if (!u) {
          // Revogado: o token perde identidade e papel. requireAuth passa a devolver 401
          // e o gate de páginas manda para o login.
          delete token.id;
          delete token.role;
          return token;
        }
        token.role = u.role;
        token.rv = Date.now();
      } catch {
        // Banco indisponível: mantém o token como está (não desloga a operação inteira
        // por causa de uma falha de infraestrutura) e tenta de novo no próximo minuto.
      }
      return token;
    },
    async session({ session, token }) {
      if (token?.id && token?.role) {
        session.user.id = token.id;
        session.user.role = token.role;
      }
      return session;
    },
  },
};
