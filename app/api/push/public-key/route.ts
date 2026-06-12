import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";

// Chave pública VAPID (serve para o navegador se inscrever). É pública por design.
export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;
  const key = process.env.VAPID_PUBLIC_KEY ?? null;
  return NextResponse.json({ publicKey: key, available: !!key });
}
