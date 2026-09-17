/**
 * Aponta a JR para os recortes do catálogo.
 *
 * ⚠️ RODAR SÓ DEPOIS DO DEPLOY. Os PDFs são servidos de public/catalogo/, então
 * as URLs só existem depois que o código sobe. Apontar antes faria a IA mandar
 * um link 404 para o cliente — e a Meta busca o arquivo por conta dela, então o
 * envio falha em silêncio.
 *
 * O script confere cada URL com HEAD antes de gravar e aborta se alguma não
 * responder 200 com content-type de PDF.
 */
import "dotenv/config";
import { prismaUnscoped } from "@/lib/prisma";

const CLIENTE = "cmrjao9n700dg5vudg1zlymk9";
const BASE = process.env.CATALOGO_BASE_URL ?? "https://veloceio-production.up.railway.app/catalogo";

const RECORTES = [
  { chave: "conjunto_fogao", rotulo: "conjuntos: churrasqueira + fogão ou forno, já montados", arquivo: "jr-conjuntos-com-fogao.pdf" },
  { chave: "churrasqueiras",  rotulo: "só as churrasqueiras, sem conjunto",                     arquivo: "jr-churrasqueiras.pdf" },
  { chave: "fogoes",          rotulo: "só os fogões campeiros e fornos, avulsos",               arquivo: "jr-fogoes-e-fornos.pdf" },
  { chave: "complementos",    rotulo: "pias, balcão e bancada gourmet",                         arquivo: "jr-complementos.pdf" },
];

async function main() {
  const catalogos: { chave: string; rotulo: string; url: string }[] = [];
  console.log("conferindo as URLs antes de gravar:\n");
  let falhou = false;
  for (const r of RECORTES) {
    const url = `${BASE}/${r.arquivo}`;
    let ok = false, detalhe = "";
    try {
      const res = await fetch(url, { method: "HEAD" });
      const ct = res.headers.get("content-type") ?? "";
      const len = Number(res.headers.get("content-length") ?? 0);
      ok = res.ok && /pdf/i.test(ct) && len > 10000;
      detalhe = `${res.status} · ${ct || "sem content-type"} · ${(len / 1048576).toFixed(1)} MB`;
    } catch (e) { detalhe = String((e as Error)?.message ?? e).slice(0, 60); }
    console.log(`  ${ok ? "✓" : "✗"} ${r.chave.padEnd(16)} ${detalhe}`);
    if (!ok) falhou = true;
    catalogos.push({ chave: r.chave, rotulo: r.rotulo, url });
  }
  if (falhou) {
    console.log("\nABORTADO: alguma URL não respondeu como PDF. O deploy já subiu?");
    process.exit(1);
  }

  const pc = await prismaUnscoped.pricingConfig.findUnique({ where: { clientId: CLIENTE }, select: { rules: true } });
  if (!pc) { console.log("ABORTADO: sem PricingConfig"); process.exit(1); }
  const rules = (pc.rules ?? {}) as Record<string, unknown>;
  const antes = JSON.stringify(rules.catalogos ?? null);

  // Preserva o resto das rules (frete, base, opções, lareirasPdfUrl…).
  const r = await prismaUnscoped.pricingConfig.updateMany({
    where: { clientId: CLIENTE, rules: rules as object },
    data: { rules: { ...rules, catalogos } as object },
  });
  if (r.count !== 1) { console.log("NÃO gravado — as rules mudaram desde a leitura"); process.exit(1); }

  const depois = await prismaUnscoped.pricingConfig.findUnique({ where: { clientId: CLIENTE }, select: { rules: true } });
  const d = (depois?.rules ?? {}) as Record<string, unknown>;
  console.log(`\n✓ gravado · antes: ${antes} · agora: ${(d.catalogos as unknown[])?.length} recortes`);
  for (const k of ["freight", "lareirasPdfUrl"]) console.log(`  ${k} preservado:`, k in d);
  await prismaUnscoped.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
