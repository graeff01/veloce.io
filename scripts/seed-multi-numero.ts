/**
 * Dados de DEMONSTRAÇÃO para validar o multi-WhatsApp.
 *
 * Cria SEIS números — três da consultoria, três da captação —, cada um com uma
 * pessoa responsável, mais conversas e mensagens espalhadas por eles. É o
 * formato da Jardim do Lago, com dados inventados.
 *
 *   npm run db:seed:multi                              cliente de demonstração próprio
 *   npm run db:seed:multi -- --cliente jardim-do-lago  popula um cliente EXISTENTE
 *   npm run db:seed:multi -- --cliente <slug> --remover  desfaz
 *
 * ── O que este script NUNCA faz ─────────────────────────────────────────────
 *  • Não toca em número real: só cria e só apaga conexões cujo `phoneNumberId`
 *    começa com `demo_phone_`. Um número de verdade conectado ao cliente passa
 *    incólume, inclusive no --remover.
 *  • Não apaga acesso, senha nem token de portal existente. Se o cliente já tem
 *    portal, o token dele é mantido; as gerentes só são criadas se faltarem.
 *  • Recusa-se a rodar num cliente que JÁ TEM conversa real — a ideia é povoar
 *    um perfil que ainda não entrou em operação, não misturar o falso com o
 *    verdadeiro. Use --forcar se souber o que está fazendo.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import crypto from "node:crypto";
import { hashPassword } from "@/lib/portal-auth";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as never);

/** Marca de tudo que este script cria. É por ela que o --remover se orienta. */
const PREFIXO = "demo_phone_";
/**
 * Domínio dos e-mails inventados aqui. Só acesso DESTE domínio é apagado —
 * um acesso de verdade, com senha que alguém usa, nunca é tocado.
 */
const DOMINIO = "@exemplo.local";
const SLUG_DEMO = "demo-multi-numero";
const MARCA_DEMO = "★ DEMONSTRAÇÃO — Multi-WhatsApp";
const TOKEN_DEMO = "demo-multi-numero";
/**
 * Senha das gerentes de demonstração. Fraca de propósito e sem problema: o
 * cliente é falso, os dados são inventados e o portal é de validação. Num
 * perfil que vá receber conversa de verdade, passe SENHA_DEMO.
 */
const SENHA = process.env.SENHA_DEMO ?? "12345678";

const DIA = 86_400_000;
const agora = new Date();
const hAgo = (h: number) => new Date(agora.getTime() - h * 3_600_000);
const dAgo = (d: number) => new Date(agora.getTime() - d * DIA);

// ── As pessoas ───────────────────────────────────────────────────────────────
// Nenhuma tem acesso ao portal, de propósito: é o caso real — quem atende
// responde pelo próprio celular e nunca entra no sistema. O vínculo entre a
// conversa e a pessoa é o NÚMERO em que a conversa chegou.
const PESSOAS = [
  { nome: "Ana Prado",    email: "ana.demo@exemplo.local",    equipe: "consultoria", fone: "+55 51 90000-0101" },
  { nome: "Bruno Lemes",  email: "bruno.demo@exemplo.local",  equipe: "consultoria", fone: "+55 51 90000-0102" },
  { nome: "Carla Dias",   email: "carla.demo@exemplo.local",  equipe: "consultoria", fone: "+55 51 90000-0103" },
  { nome: "Diego Rocha",  email: "diego.demo@exemplo.local",  equipe: "captacao",    fone: "+55 51 90000-0201" },
  { nome: "Elisa Mattos", email: "elisa.demo@exemplo.local",  equipe: "captacao",    fone: "+55 51 90000-0202" },
  { nome: "Felipe Cruz",  email: "felipe.demo@exemplo.local", equipe: "captacao",    fone: "+55 51 90000-0203" },
];

const GERENTES = [
  { nome: "Michele", email: "michele@exemplo.local" },
  { nome: "Vitória", email: "vitoria@exemplo.local" },
];

const NOMES = ["Marcos Vieira", "Juliana Reis", "Paulo Andrade", "Renata Lopes", "Tiago Moura",
  "Camila Souza", "Rafael Pinto", "Beatriz Nunes", "Gustavo Alves", "Larissa Campos",
  "Eduardo Bastos", "Patrícia Melo", "Rodrigo Faria", "Vanessa Duarte", "Henrique Sá",
  "Aline Castro", "Otávio Ramos", "Débora Freitas"];

const PERGUNTAS = [
  "Oi, vi o anúncio de vocês. Ainda tem disponível?",
  "Bom dia! Queria saber o valor e as condições.",
  "Vocês entregam aqui na zona sul?",
  "Consigo parcelar? Em quantas vezes?",
  "Qual o prazo de entrega mais ou menos?",
  "Tem como me mandar mais fotos?",
];
const RESPOSTAS = [
  "Oi! Tudo bem? Temos sim, vou te passar os detalhes.",
  "Bom dia! O valor é a partir de R$ 2.480, com condições especiais esta semana.",
  "Entregamos sim! Me passa o bairro que eu confirmo o frete.",
  "Parcelamos em até 10x sem juros no cartão.",
  "O prazo é de 7 a 12 dias úteis depois da confirmação.",
];

const ETAPAS = ["recebido", "respondido", "qualificado", "negociacao", "convertido", "perdido"] as const;

const arg = (nome: string) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
};
const tem = (nome: string) => process.argv.includes(`--${nome}`);

/** Apaga SÓ o que este script criou. Número e acesso reais não são tocados. */
async function removerDemo(clientId: string): Promise<number> {
  const { count } = await prisma.waConnection.deleteMany({
    where: { clientId, phoneNumberId: { startsWith: PREFIXO } },
  }); // cascata leva contatos, mensagens e conversas dessas conexões
  // Acessos inventados por este script. Sem isto, rodar de novo depois de mudar
  // um e-mail deixa o anterior órfão — e ele aparece como uma linha a mais,
  // vazia, no ranking da equipe.
  const antigos = await prisma.portalAccess.findMany({
    where: { clientId, email: { endsWith: DOMINIO } }, select: { email: true },
  });
  if (antigos.length) {
    await prisma.portalSession.deleteMany({ where: { clientId, email: { in: antigos.map((a) => a.email) } } });
    await prisma.portalAccess.deleteMany({ where: { clientId, email: { endsWith: DOMINIO } } });
  }
  return count;
}

async function acharCliente(slug: string) {
  const exato = await prisma.client.findUnique({ where: { slug }, select: { id: true, name: true, slug: true } });
  if (exato) return exato;
  const parecidos = await prisma.client.findMany({
    where: { OR: [{ slug: { contains: slug, mode: "insensitive" } }, { name: { contains: slug, mode: "insensitive" } }] },
    select: { id: true, name: true, slug: true },
  });
  if (parecidos.length === 1) return parecidos[0]!;
  if (parecidos.length > 1) {
    throw new Error(`"${slug}" casa com mais de um cliente:\n` + parecidos.map((c) => `  ${c.slug}  (${c.name})`).join("\n") + "\nRode de novo com o slug exato.");
  }
  return null;
}

async function main() {
  const slugPedido = arg("cliente");
  const apagar = tem("remover");
  const forcar = tem("forcar");
  const alvoEhDemo = !slugPedido || slugPedido === SLUG_DEMO;

  // ── 1. Que cliente é o alvo ────────────────────────────────────────────────
  let cliente = await acharCliente(slugPedido ?? SLUG_DEMO);
  if (!cliente && !alvoEhDemo) {
    throw new Error(`Cliente "${slugPedido}" não encontrado. Confira o slug no painel interno.`);
  }

  if (apagar) {
    if (!cliente) { console.log("Nada para remover."); return; }
    const n = await removerDemo(cliente.id);
    // O cliente de demonstração some inteiro; um cliente REAL fica de pé.
    if (cliente.slug === SLUG_DEMO && cliente.name.startsWith("★ DEMONSTRAÇÃO")) {
      await prisma.portalSession.deleteMany({ where: { clientId: cliente.id } });
      await prisma.portalAccess.deleteMany({ where: { clientId: cliente.id } });
      await prisma.clientPortal.deleteMany({ where: { clientId: cliente.id } });
      await prisma.client.delete({ where: { id: cliente.id } });
      console.log(`Removido: ${cliente.name} (${n} números de demonstração).`);
    } else {
      console.log(`Removidos ${n} números de demonstração de "${cliente.name}". Números reais, acessos reais e o portal ficaram como estavam.`);
    }
    return;
  }

  // ── 2. Trava: não misturar demonstração com operação de verdade ───────────
  if (cliente && !alvoEhDemo) {
    const reais = await prisma.waMessage.count({
      where: { connection: { clientId: cliente.id, phoneNumberId: { not: { startsWith: PREFIXO } } } },
    });
    if (reais > 0 && !forcar) {
      throw new Error(
        `"${cliente.name}" já tem ${reais} mensagens em números REAIS.\n` +
        `Este script é para povoar um perfil que ainda não entrou em operação.\n` +
        `Se mesmo assim for o que você quer, repita com --forcar.`,
      );
    }
  }

  // ── 3. Cliente de demonstração, quando não há alvo ────────────────────────
  if (!cliente) {
    cliente = await prisma.client.create({
      data: { name: MARCA_DEMO, slug: SLUG_DEMO, status: "ACTIVE" },
      select: { id: true, name: true, slug: true },
    });
  }
  const clientId = cliente.id;
  await removerDemo(clientId); // rodar duas vezes não duplica nada

  // ── 4. Portal ─────────────────────────────────────────────────────────────
  // Num cliente que já existe, o token é PRESERVADO: ele é a credencial de
  // acesso que já pode ter sido enviada a alguém. Só as seções são ajustadas,
  // e só quando pedido, porque é isso que se quer validar.
  const portalAtual = await prisma.clientPortal.findUnique({ where: { clientId }, select: { token: true, sections: true } });
  const SECOES = "conversas,funil,equipe";
  if (!portalAtual) {
    await prisma.clientPortal.create({
      data: {
        clientId,
        token: alvoEhDemo ? TOKEN_DEMO : crypto.randomBytes(18).toString("base64url"),
        active: true, requireLogin: true, accentColor: "#1FA855", mode: "light", sections: SECOES,
      },
    });
  } else if (portalAtual.sections == null || tem("secoes")) {
    // Portal sem seções definidas = "todas as abas": ajustar é o que se quer.
    // Já havendo uma configuração de verdade, só mexe se pedirem (--secoes):
    // sobrescrever em silêncio o que alguém configurou seria destrutivo.
    await prisma.clientPortal.update({ where: { clientId }, data: { sections: SECOES } });
  }
  const portal = await prisma.clientPortal.findUnique({ where: { clientId }, select: { token: true, sections: true } });

  // Gerentes de demonstração. O `removerDemo` acima já tirou as da rodada
  // anterior, então recriar não duplica. Acesso REAL do cliente (qualquer
  // e-mail fora do domínio de demonstração) continua onde está, com a senha
  // que tinha.
  const criadas: string[] = [];
  for (const g of GERENTES) {
    await prisma.portalAccess.create({
      data: { clientId, email: g.email, name: g.nome, role: "admin", passwordHash: await hashPassword(SENHA) },
    });
    criadas.push(g.email);
  }

  // ── 5. Seis números, cada um com dono e equipe ────────────────────────────
  const conexoes = [];
  for (const p of PESSOAS) {
    conexoes.push(await prisma.waConnection.create({
      data: {
        clientId,
        wabaId: "demo_waba_multi",
        phoneNumberId: `${PREFIXO}${p.email.split("@")[0]}`,
        accessToken: "demo-sem-credencial-real",
        displayPhone: p.fone,
        name: p.nome,
        ownerEmail: p.email,
        equipe: p.equipe,
        lastEventAt: hAgo(1 + Math.random() * 20),
      },
    }));
  }

  // ── 6. Conversas espalhadas pelos seis ────────────────────────────────────
  let seq = 0, totalMsgs = 0, totalConvs = 0;
  for (let i = 0; i < conexoes.length; i++) {
    const conn = conexoes[i]!;
    const quantas = 6 + (i % 3); // 6 a 8 por número, para o ranking não empatar

    for (let k = 0; k < quantas; k++) {
      const nome = NOMES[(i * 3 + k) % NOMES.length]!;
      const etapa = ETAPAS[(i + k) % ETAPAS.length]!;
      const diasAtras = (k * 2 + i) % 20;
      const inicio = dAgo(diasAtras);
      // Uma em cada quatro fica ESPERANDO: o lead falou por último e ninguém
      // respondeu. É o que pinta a lista e enche o contador da barra.
      const esperando = k % 4 === 0;
      // Uma em cada número é atribuída NA MÃO a outra pessoa, para provar que a
      // atribuição manual tem prioridade sobre o dono do número.
      const manual = k === 5 ? PESSOAS[(i + 1) % PESSOAS.length]!.email : null;

      const contact = await prisma.waContact.create({
        data: {
          connectionId: conn.id,
          waId: `5551${String(900000 + seq).padStart(6, "0")}`,
          name: nome, displayName: nome, lastMessageAt: inicio,
        },
      });

      const msgs: { dir: "in" | "out"; texto: string }[] = [
        { dir: "in", texto: PERGUNTAS[(i + k) % PERGUNTAS.length]! },
      ];
      if (!esperando || k % 2 === 1) {
        msgs.push({ dir: "out", texto: RESPOSTAS[(i + k) % RESPOSTAS.length]! });
        msgs.push({ dir: "in", texto: "Perfeito, e a garantia?" });
        msgs.push({ dir: "out", texto: "São 12 meses direto com a fábrica." });
      }
      if (esperando) msgs.push({ dir: "in", texto: "Oi? Consegue me responder?" });

      let ultimaIn: Date | null = null, ultimaOut: Date | null = null, entrada = 0, saida = 0;
      for (let j = 0; j < msgs.length; j++) {
        const m = msgs[j]!;
        const ts = new Date(inicio.getTime() + j * 11 * 60_000);
        await prisma.waMessage.create({
          data: {
            connectionId: conn.id, contactId: contact.id,
            waMessageId: `demo_multi_${seq}_${j}`,
            direction: m.dir, type: "text", text: m.texto, timestamp: ts,
            // Saída SEM autor e SEM IA = resposta enviada do próprio celular
            // (coexistência). É exatamente o sinal que vira "respostas" da dona
            // do número nas métricas — o caso que se quer validar.
            aiGenerated: false,
          },
        });
        if (m.dir === "in") { entrada++; ultimaIn = ts; } else { saida++; ultimaOut = ts; }
        totalMsgs++;
      }

      const ultima = ultimaIn && ultimaOut ? (ultimaIn > ultimaOut ? ultimaIn : ultimaOut) : (ultimaIn ?? ultimaOut);
      await prisma.waConversation.create({
        data: {
          connectionId: conn.id, contactId: contact.id,
          status: esperando ? "waiting" : "open",
          funnelStage: etapa,
          ...(etapa === "convertido" ? { saleValue: 1800 + ((i * 7 + k) % 9) * 320, saleConfirmedAt: dAgo(Math.max(0, diasAtras - 1)) } : {}),
          ...(manual ? { assignedEmail: manual, assignedAt: dAgo(diasAtras) } : {}),
          firstInboundAt: inicio,
          ...(saida > 0 ? { firstResponseAt: new Date(inicio.getTime() + 11 * 60_000), firstResponseSec: (3 + ((i + k) % 9)) * 60 } : {}),
          lastInboundAt: ultimaIn, lastOutboundAt: ultimaOut, lastMessageAt: ultima,
          inboundCount: entrada, outboundCount: saida, createdAt: inicio,
        },
      });
      await prisma.waContact.update({ where: { id: contact.id }, data: { lastMessageAt: ultima } });
      seq++; totalConvs++;
    }
  }

  const url = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  console.log(`
Pronto — ${cliente.name}

  ${conexoes.length} números · 2 equipes · ${totalConvs} conversas · ${totalMsgs} mensagens
  Números: ${PESSOAS.map((p) => p.nome.split(" ")[0]).join(", ")}

  Portal: ${url ? `${url}/r/${portal!.token}` : `/r/${portal!.token}`}
  Seções: ${portal!.sections ?? "(todas)"}${portalAtual && portalAtual.sections != null && !tem("secoes") ? "  ← mantidas; use --secoes para trocar por WhatsApp/Funil/Equipe" : ""}
  ${criadas.length ? `Acessos: ${criadas.join("  ou  ")}\n  Senha:   ${SENHA}` : "Acessos: os que já existiam, intocados"}

  Desfazer:  npm run db:seed:multi${slugPedido ? ` -- --cliente ${slugPedido} --remover` : " -- --remover"}
  (apaga só os ${conexoes.length} números de demonstração; número real fica)
`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error("\n" + (e instanceof Error ? e.message : String(e)) + "\n"); process.exit(1); })
  .finally(() => void prisma.$disconnect());
