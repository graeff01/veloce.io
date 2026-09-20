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
import { execSync } from "node:child_process";

const CLIENTE = "cmrjao9n700dg5vudg1zlymk9";

async function main() {
  const validadas = lerRegras({ roteador: REGRAS_JR });
  if (validadas.length !== REGRAS_JR.length) {
    console.log(`ABORTADO: ${REGRAS_JR.length - validadas.length} regra(s) inválida(s) — o leitor descartaria em produção`);
    process.exit(1);
  }
  console.log(`regras válidas: ${validadas.map((r) => r.id).join(", ")}`);

  // ── O código de PRODUÇÃO entende estes campos? ─────────────────────────
  // Regra é DADO e sobe na hora; o suporte a ela é CÓDIGO e passa por PR e
  // deploy. Aconteceu: gravei uma regra com `sóSeJáDito` e `garantirArgs`
  // enquanto o deploy ainda tinha o leitor antigo. Produção descartou os dois
  // campos e MANTEVE a regra — resultado: qualquer "ok" ou "sim" do cliente
  // forçaria o catálogo inteiro, sem a trava de contexto.
  //
  // Validar contra o leitor LOCAL não pega isso: local já tem os campos.
  const usados = new Set<string>();
  for (const r of REGRAS_JR as Record<string, unknown>[]) for (const k of Object.keys(r)) usados.add(k);
  const emProducao = execSync("git show origin/master:lib/ai-agent/roteador.ts", { encoding: "utf8" });
  const faltando = [...usados].filter((k) => !emProducao.includes(k));
  if (faltando.length) {
    console.log(`\nABORTADO: produção não conhece ${faltando.join(", ")}.`);
    console.log(`O código que suporta esses campos ainda não foi deployado. Suba a PR primeiro —`);
    console.log(`gravar agora deixa a regra ATIVA e sem as travas, que é pior que não ter regra.`);
    process.exit(1);
  }
  console.log(`produção entende todos os campos usados ✓`);

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
