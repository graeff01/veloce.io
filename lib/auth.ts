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

function isLocked(email: string): boolean {
  const a = loginFails.get(email);
  if (!a) return false;
  if (Date.now() - a.first > LOGIN_WINDOW_MS) { loginFails.delete(email); return false; }
  return a.count >= LOGIN_MAX_FAILS;
}
function recordFail(email: string) {
  const a = loginFails.get(email);
  if (!a || Date.now() - a.first > LOGIN_WINDOW_MS) loginFails.set(email, { count: 1, first: Date.now() });
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

        const user = await prisma.user.findFirst({
          where: {
            email: credentials.email,
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
          clientId: user.clientId ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { id: string; role: Role }).role;
        token.clientId = (user as { clientId: string | null }).clientId ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
        session.user.clientId = (token.clientId as string | null) ?? null;
      }
      return session;
    },
  },
};
