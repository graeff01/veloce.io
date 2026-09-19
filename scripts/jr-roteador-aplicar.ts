/**
 * Grava as regras do roteador em PricingConfig.rules.roteador.
 * Regras são DADO: mudar uma não pede deploy, e nenhum nome de produto de
 * cliente entra no motor.
 */
import "dotenv/config";
import { prismaUnscoped } from "@/lib/prisma";
import { lerRegras } from "@/lib/ai-agent/roteador";
import { REGRAS_JR } from "./jr-roteador-regras";
import { writeFileSync } from "node:fs";

const CLIENTE = "cmrjao9n700dg5vudg1zlymk9";

async function main() {
  const validadas = lerRegras({ roteador: REGRAS_JR });
  if (validadas.length !== REGRAS_JR.length) {
    console.log(`ABORTADO: ${REGRAS_JR.length - validadas.length} regra(s) inválida(s) — o leitor descartaria em produção`);
    process.exit(1);
  }
  console.log(`regras válidas: ${validadas.map((r) => r.id).join(", ")}`);

  const pc = await prismaUnscoped.pricingConfig.findUnique({ where: { clientId: CLIENTE }, select: { rules: true } });
  if (!pc) { console.log("ABORTADO: sem PricingConfig"); process.exit(1); }
  const rules = (pc.rules ?? {}) as Record<string, unknown>;
  writeFileSync(`${process.env.HOME}/Downloads/jr-pricing-rules-backup-2026-09-19.json`, JSON.stringify(rules, null, 1));

  const r = await prismaUnscoped.pricingConfig.updateMany({
    where: { clientId: CLIENTE, rules: { equals: rules as object } },
    data: { rules: { ...rules, roteador: REGRAS_JR } as object },
  });
  if (r.count !== 1) { console.log("NÃO gravado — as rules mudaram desde a leitura"); process.exit(1); }

  const d = ((await prismaUnscoped.pricingConfig.findUnique({ where: { clientId: CLIENTE }, select: { rules: true } }))?.rules ?? {}) as Record<string, unknown>;
  console.log(`✓ gravado · ${(d.roteador as unknown[])?.length} regra(s)`);
  for (const k of ["freight", "catalogos", "lareirasPdfUrl"]) console.log(`  ${k} preservado:`, k in d);
  await prismaUnscoped.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
