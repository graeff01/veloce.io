/**
 * Mede, em produção, a diferença de confiabilidade entre:
 *   (a) travas de CÓDIGO — determinísticas, o modelo não tem como desobedecer
 *   (b) regras de PROMPT — o modelo pode não seguir
 *
 * Cada linha é uma regra que existe hoje, medida contra o histórico real.
 */
import "dotenv/config";
import { prismaUnscoped as db } from "@/lib/prisma";

const C = "cmrjao9n700dg5vudg1zlymk9";

async function main() {
  const conns = (await db.waConnection.findMany({ where: { clientId: C }, select: { id: true } })).map((c) => c.id);
  const contatos = await db.waContact.findMany({ where: { connectionId: { in: conns } }, select: { id: true } });
  const ids = contatos.map((c) => c.id);
  console.log(`base: ${ids.length} contatos da JR\n`);

  // ── (a) TRAVA DE CÓDIGO: vídeo vai UMA vez por contato ───────────────────────
  // tools.ts:510 — busca no banco antes de enviar. O modelo não tem como furar.
  const videos = await db.waMessage.groupBy({
    by: ["contactId"],
    where: { contactId: { in: ids }, direction: "out", type: "video", aiGenerated: true },
    _count: { _all: true },
  });
  const comVideo = videos.length;
  const duplicados = videos.filter((v) => v._count._all > 1);
  console.log(`[CÓDIGO] vídeo uma vez por contato`);
  console.log(`   ${comVideo} contatos receberam vídeo · ${duplicados.length} receberam 2+ → ${duplicados.length === 0 ? "0 violações" : "FUROU"}`);

  // ── (a) TRAVA DE CÓDIGO: catálogo uma vez por categoria ──────────────────────
  const docs = await db.waMessage.groupBy({
    by: ["contactId", "text"],
    where: { contactId: { in: ids }, direction: "out", type: "document", aiGenerated: true, text: { contains: "catálogo" } },
    _count: { _all: true },
  });
  const dupDoc = docs.filter((d) => d._count._all > 1);
  console.log(`\n[CÓDIGO] catálogo uma vez por categoria`);
  console.log(`   ${docs.length} envios distintos · ${dupDoc.length} repetidos → ${dupDoc.length === 0 ? "0 violações" : "FUROU"}`);

  // ── (b) REGRA DE PROMPT: perguntar "primeiro contato?" ANTES do vídeo ────────
  // Existe trava parcial (o vídeo exige a pergunta no histórico), mas QUEM FAZ a
  // pergunta é o prompt. Mede quantos receberam vídeo sem a pergunta ter saído.
  let semPergunta = 0;
  for (const v of videos) {
    const perg = await db.waMessage.findFirst({
      where: { contactId: v.contactId, direction: "out", text: { contains: "primeiro contato", mode: "insensitive" } },
      select: { id: true },
    });
    if (!perg) semPergunta++;
  }
  console.log(`\n[CÓDIGO+PROMPT] vídeo só depois de perguntar "primeiro contato?"`);
  console.log(`   ${comVideo} com vídeo · ${semPergunta} sem a pergunta → ${semPergunta === 0 ? "0 violações" : `${semPergunta} furos`}`);

  // ── (b) REGRA DE PROMPT PURA: nunca pedir permissão pra enviar ───────────────
  // "É PROIBIDO perguntar 'posso te enviar o orçamento?'" — não há código nenhum
  // impedindo. Mede quantas vezes a IA pediu permissão mesmo assim.
  const permissao = await db.waMessage.count({
    where: { contactId: { in: ids }, direction: "out", aiGenerated: true,
      OR: [
        { text: { contains: "posso te enviar", mode: "insensitive" } },
        { text: { contains: "posso enviar", mode: "insensitive" } },
        { text: { contains: "quer que eu envie o orçamento", mode: "insensitive" } },
      ] },
  });
  const totIA = await db.waMessage.count({ where: { contactId: { in: ids }, direction: "out", aiGenerated: true } });
  console.log(`\n[PROMPT PURO] "É PROIBIDO pedir permissão pra enviar"`);
  console.log(`   ${totIA} respostas da IA · ${permissao} pediram permissão → ${permissao === 0 ? "0 violações" : `${permissao} furos (${(permissao/totIA*100).toFixed(1)}%)`}`);

  // ── (b) REGRA DE PROMPT PURA: não re-anunciar o vídeo ───────────────────────
  const reanuncio = await db.waMessage.count({
    where: { contactId: { in: ids }, direction: "out", aiGenerated: true, type: { not: "video" },
      OR: [{ text: { contains: "te mandei um vídeo", mode: "insensitive" } }, { text: { contains: "vou te mostrar o vídeo", mode: "insensitive" } }, { text: { contains: "assistir ao vídeo", mode: "insensitive" } }] },
  });
  console.log(`\n[PROMPT PURO] "NUNCA re-anuncie o vídeo depois de enviar"`);
  console.log(`   ${reanuncio} respostas re-anunciaram → ${reanuncio === 0 ? "0 violações" : `${reanuncio} furos`}`);

  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
