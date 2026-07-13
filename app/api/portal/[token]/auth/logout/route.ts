import { NextResponse } from "next/server";
import { destroySession, PORTAL_COOKIE } from "@/lib/portal-auth";

export const runtime = "nodejs";

// POST — encerra a sessão do painel (apaga a linha + limpa o cookie).
export async function POST() {
  await destroySession();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(PORTAL_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
