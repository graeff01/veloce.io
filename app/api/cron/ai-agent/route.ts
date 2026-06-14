import { NextRequest, NextResponse } from "next/server";
import { checkCron } from "@/lib/cron-auth";
import { processDueJobs } from "@/lib/ai-agent/queue";

export const runtime = "nodejs";

// Worker do Veloce AI Agent: rede de segurança da fila durável (AiJob). O caminho
// feliz é processado pelo "nudge" em memória logo após o debounce; este cron recolhe
// jobs órfãos por deploy/restart ou presos por lock vencido. Rode a cada 1 min:
//   curl -X POST https://<app>/api/cron/ai-agent -H "authorization: Bearer $CRON_SECRET"
export async function POST(req: NextRequest) {
  const denied = checkCron(req);
  if (denied) return denied;
  return NextResponse.json(await processDueJobs());
}
