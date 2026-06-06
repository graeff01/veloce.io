import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { getAccessToken, getLeadDetail, kommoGet, KommoError } from "@/lib/kommo";

// GET — despeja as NOTAS cruas de um lead e do seu contato, p/ ver se as
// mensagens do WhatsApp estão acessíveis (e em qual note_type/params).
// ?leadId=NUMERO (de um lead de anúncio).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const conn = await prisma.kommoConnection.findUnique({ where: { clientId: id } });
  if (!conn) return NextResponse.json({ error: "Conexão Kommo não configurada" }, { status: 404 });

  const url = new URL(req.url);
  const leadId = Number(url.searchParams.get("leadId"));
  if (!Number.isFinite(leadId)) return NextResponse.json({ error: "passe ?leadId=NUMERO" }, { status: 400 });

  const cx = conn;
  try {
    const token = await getAccessToken(conn);
    const detail = await getLeadDetail(conn, token, leadId);

    // Resumo das notas: agrupa por note_type e mostra as chaves de params + amostra
    function summarize(notes: Array<{ note_type: string; params?: Record<string, unknown> | null }> | undefined) {
      const byType: Record<string, { count: number; paramKeys: string[]; sample: unknown }> = {};
      for (const n of notes ?? []) {
        const t = n.note_type;
        if (!byType[t]) byType[t] = { count: 0, paramKeys: Object.keys(n.params ?? {}), sample: n.params };
        byType[t].count++;
      }
      return byType;
    }

    const leadNotes = await kommoGet<{ _embedded?: { notes?: Array<{ note_type: string; params?: Record<string, unknown> | null }> } }>(
      cx, token, `/api/v4/leads/${leadId}/notes?limit=50&order[created_at]=asc`,
    ).catch((e) => ({ erro: String(e) } as unknown));

    let contactNotes: unknown = "sem contato";
    if (detail?.contactId) {
      contactNotes = await kommoGet<{ _embedded?: { notes?: Array<{ note_type: string; params?: Record<string, unknown> | null }> } }>(
        cx, token, `/api/v4/contacts/${detail.contactId}/notes?limit=50&order[created_at]=asc`,
      ).catch((e) => ({ erro: String(e) } as unknown));
    }

    return NextResponse.json({
      leadId,
      contactId: detail?.contactId ?? null,
      resumoNotasLead: summarize((leadNotes as { _embedded?: { notes?: Array<{ note_type: string; params?: Record<string, unknown> | null }> } })?._embedded?.notes),
      resumoNotasContato: summarize((contactNotes as { _embedded?: { notes?: Array<{ note_type: string; params?: Record<string, unknown> | null }> } })?._embedded?.notes),
      rawNotasLead: leadNotes,
    });
  } catch (e) {
    if (e instanceof KommoError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
