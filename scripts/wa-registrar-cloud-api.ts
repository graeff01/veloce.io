/**
 * Registra um número no Cloud API — tira-o da tubulação antiga (On-Premise).
 *
 * POR QUE EXISTE. O número da JR parou em 10/10/2026. Diagnóstico completo:
 *   · webhook do app: ativo, URL certa, campo `messages` assinado      ✓
 *   · app inscrito na WABA, token válido e sem expiração               ✓
 *   · número: status CONNECTED, qualidade GREEN, empresa verificada    ✓
 *   · MAS: platform_type=ON_PREMISE, throughput=NOT_APPLICABLE,
 *     sem messaging_limit_tier  → ele NUNCA esteve no Cloud API.
 * Tudo do nosso lado está certo. O que falta é o registro na Meta.
 *
 * ⚠️ O QUE ISTO MUDA NO MUNDO REAL
 * O número está em uso no WhatsApp Business do celular (is_on_biz_app=true).
 * Registrar no Cloud API SEM onboarding de coexistência (que exige um parceiro
 * credenciado, o que a Veloce não é) pode DESCONECTAR o número do aparelho.
 * Só rode se a decisão de mover o atendimento para o painel já estiver tomada,
 * e depois do backup das conversas no celular.
 *
 * O PIN: o número está com is_pin_enabled=false, então não há PIN antigo para
 * conflitar. O que você passar vira o PIN de verificação em duas etapas —
 * ANOTE, porque é pedido em qualquer registro futuro.
 *
 * Limite da Meta: 10 tentativas por número a cada 72h (erro 133016). Não fique
 * repetindo: leia o erro e resolva antes de tentar de novo.
 *
 * Uso (confere e NÃO grava):
 *   railway run --service veloce.io bash -c 'railway run --service Postgres bash -c "
 *     export DATABASE_URL=\$DATABASE_PUBLIC_URL; npx tsx scripts/wa-registrar-cloud-api.ts --cliente jr"'
 *   ...e de novo com --commit --pin 123456 para registrar de verdade.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { decryptSecret } from "../lib/crypto";

const G = "https://graph.facebook.com/v21.0";
const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL ausente"); process.exit(1); }
const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: url })) });

const arg = (n: string, d = "") => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const commit = process.argv.includes("--commit");
const pin = arg("pin");

(async () => {
  const nome = arg("cliente", "jr");
  const c = await prisma.client.findFirst({ where: { name: { contains: nome, mode: "insensitive" } }, select: { id: true, name: true } });
  if (!c) { console.error(`cliente "${nome}" não encontrado`); process.exit(1); }
  const conn = await prisma.waConnection.findFirst({ where: { clientId: c.id }, select: { phoneNumberId: true, displayPhone: true, accessToken: true } });
  if (!conn) { console.error("sem conexão"); process.exit(1); }
  const tok = decryptSecret(conn.accessToken);

  // ANTES: fotografa o estado, para dar para comparar depois.
  const antes = await fetch(`${G}/${conn.phoneNumberId}?fields=display_phone_number,status,platform_type,throughput,messaging_limit_tier,is_on_biz_app,quality_rating&access_token=${tok}`).then(r => r.json());
  console.log(`\n══ ${c.name} · ${conn.displayPhone ?? conn.phoneNumberId} ══`);
  console.log(`  ANTES: ${JSON.stringify(antes)}`);

  if (antes.platform_type === "CLOUD_API") {
    console.log(`\n  ✅ Já está no CLOUD_API. Nada a fazer.\n`);
    return;
  }
  if (antes.is_on_biz_app) {
    console.log(`\n  ⚠️  O número está EM USO no WhatsApp Business do celular.`);
    console.log(`      Registrar pode desconectá-lo do aparelho. Confirme que:`);
    console.log(`        1. a decisão de atender pelo painel está tomada;`);
    console.log(`        2. o backup das conversas do celular foi feito;`);
    console.log(`        3. alguém da ${c.name} está junto agora.`);
  }

  if (!commit) {
    console.log(`\n  (CONFERÊNCIA — nada foi enviado à Meta)`);
    console.log(`  Para registrar: --commit --pin <6 dígitos>\n`);
    return;
  }
  if (!/^\d{6}$/.test(pin)) { console.error(`\n  PIN inválido: precisa de exatamente 6 dígitos.\n`); process.exit(1); }

  const res = await fetch(`${G}/${conn.phoneNumberId}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
    body: JSON.stringify({ messaging_product: "whatsapp", pin }),
  });
  const body = await res.json();
  console.log(`\n  RESPOSTA (${res.status}): ${JSON.stringify(body)}`);

  const depois = await fetch(`${G}/${conn.phoneNumberId}?fields=display_phone_number,status,platform_type,throughput,messaging_limit_tier,is_on_biz_app,quality_rating&access_token=${tok}`).then(r => r.json());
  console.log(`  DEPOIS: ${JSON.stringify(depois)}`);
  console.log(depois.platform_type === "CLOUD_API"
    ? `\n  ✅ Agora é CLOUD_API. Mande uma mensagem de teste ao número e confirme que ela chega no painel.\n`
    : `\n  ⚠️  Ainda não virou CLOUD_API. NÃO repita às cegas — são 10 tentativas por 72h. Leia o erro acima.\n`);
  await prisma.$disconnect();
})().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
