import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";

// POST { text } — extrai os campos de uma campanha a partir de texto colado
// (relatório do Meta, planilha, anotações) usando a IA. Sem conexão de conta.
export async function POST(req: Request) {
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  const { text } = await req.json().catch(() => ({ text: "" }));
  if (!text || typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "Cole o texto da campanha" }, { status: 400 });
  }

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return NextResponse.json({ error: "GROQ_API_KEY não configurada" }, { status: 500 });

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      temperature: 0,
      max_tokens: 600,
      messages: [
        {
          role: "system",
          content: `Você extrai dados de uma campanha de tráfego pago a partir de um texto (relatório do Meta Ads, planilha ou anotações). Responda APENAS com JSON válido neste formato:
{"name": "nome da campanha", "spend": number, "leads": number, "cpl": number, "ctr": number, "reach": number, "roas": number, "audience": "público-alvo se houver ou null", "whatWorked": "o que funcionou se der pra inferir ou null"}
Regras: valores monetários e números puros (sem R$, sem %, use ponto decimal). ctr em porcentagem. Use 0 quando o número não existir e null para textos ausentes. Não invente dados.`,
        },
        { role: "user", content: text.slice(0, 8000) },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return NextResponse.json({ error: "Falha ao interpretar com a IA", detail }, { status: 502 });
  }

  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  const raw = data.choices?.[0]?.message?.content ?? "";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return NextResponse.json({ error: "Não consegui extrair os dados" }, { status: 502 });

  try {
    return NextResponse.json(JSON.parse(match[0]));
  } catch {
    return NextResponse.json({ error: "Resposta inválida da IA" }, { status: 502 });
  }
}
