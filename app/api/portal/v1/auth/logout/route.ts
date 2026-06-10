import { NextRequest, NextResponse } from "next/server";
import { requirePortalAuth, logPortalAccess } from "@/lib/portal-helpers";

export async function POST(req: NextRequest) {
  const auth = await requirePortalAuth(req);

  if (auth.error === null) {
    await logPortalAccess(auth.session.clientId, auth.session.credentialId, "LOGOUT", req);
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("portal-token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });

  return res;
}
