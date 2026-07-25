import { NextRequest, NextResponse } from "next/server";
import { checkCron } from "@/lib/cron-auth";
import { runConversationEvals } from "@/lib/ai-agent/eval/conversation-eval-run";

export const runtime = "nodejs";
export const maxDuration = 60;

// Camada de Inteligência (Fase 1): avalia conversas FECHADAS (determinístico,
// observacional, zero custo de modelo). Não afeta o atendimento. Rode a cada ~30 min:
//   curl -X POST https://<app>/api/cron/intelligence -H "authorization: Bearer $CRON_SECRET"
export async function POST(req: NextRequest) {
  const denied = checkCron(req);
  if (denied) return denied;
  const conversations = await runConversationEvals().catch(() => ({ evaluated: 0 }));
  return NextResponse.json({ ok: true, conversations });
}
