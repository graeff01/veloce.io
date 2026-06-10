import { NextRequest, NextResponse } from "next/server";
import { requirePortalAuth } from "@/lib/portal-helpers";

export async function GET(req: NextRequest) {
  const auth = await requirePortalAuth(req);
  if (auth.error) return auth.error;

  const { credentialId, clientId, email, role } = auth.session;
  return NextResponse.json({ credentialId, clientId, email, role });
}
