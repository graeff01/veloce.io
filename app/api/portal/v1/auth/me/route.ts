import { NextRequest, NextResponse } from "next/server";
import { requirePortalAuth } from "@/lib/portal-helpers";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const auth = await requirePortalAuth(req);
  if (auth.error) return auth.error;

  const { credentialId, clientId, email, role } = auth.session;

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { name: true },
  });

  return NextResponse.json({
    credentialId,
    clientId,
    clientName: client?.name ?? "",
    email,
    role,
  });
}
