/**
 * Importa SOMENTE os leads de anúncio (referral Meta Ads) de um export CSV do Kommo
 * para o veloce.io. Não traz contatos orgânicos nem mensagens (o export não as contém).
 *
 * - Identifica leads de anúncio pela tag ("Meta Ads" / "Taos Highline").
 * - Deduplica por telefone (o Kommo gera linha "Autolead" duplicada).
 * - Marca WaLead.imported = true (auditável e reversível: basta apagar imported=true).
 * - Idempotente: não recria leads/contatos já existentes.
 *
 * Uso:
 *   railway run --service Postgres npx tsx scripts/import-kommo-ad-leads.ts <csv> <clientId> [--commit]
 * Sem --commit roda em modo simulação (dry-run) e só imprime o que faria.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { readFileSync } from "node:fs";

// ── Args ──────────────────────────────────────────────────────────────────────
const csvPath = process.argv[2];
const clientId = process.argv[3] ?? "cmph8j12n002k3hql3pfc3j5b";
const commit = process.argv.includes("--commit");
if (!csvPath) { console.error("Uso: tsx import-kommo-ad-leads.ts <csv> <clientId> [--commit]"); process.exit(1); }

const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_PUBLIC_URL/DATABASE_URL ausente"); process.exit(1); }

const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: url })) });

// ── CSV parser (lida com aspas e vírgulas dentro de campo) ───────────────────
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\r") { /* skip */ }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function digits(s: string): string { return (s || "").replace(/\D/g, ""); }

// "08.06.2026 14:49:04" (horário de Brasília) → instante UTC.
function parseKommoDate(s: string): Date | null {
  const m = (s || "").trim().match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, mi, ss] = m;
  return new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}-03:00`);
}

async function main() {
  const conn = await prisma.waConnection.findUnique({ where: { clientId } });
  if (!conn) { console.error(`WaConnection não encontrada para clientId=${clientId}`); process.exit(1); }

  const raw = readFileSync(csvPath, "utf8");
  const rows = parseCsv(raw);
  const header = rows[0];
  const col = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
  const iCreated = col("Criado em");
  const iTags = col("Tags");
  const iName = col("Nome completo");
  const iPhone = col("Telefone comercial");
  if (iCreated < 0 || iTags < 0 || iPhone < 0) { console.error("Colunas esperadas não encontradas no CSV."); process.exit(1); }

  // Filtra leads de anúncio e deduplica por telefone (mantém o mais antigo).
  type Lead = { phone: string; name: string | null; enteredAt: Date; model: string };
  const byPhone = new Map<string, Lead>();
  let scanned = 0, adRows = 0, badPhone = 0, badDate = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length < header.length - 2) continue;
    scanned++;
    const tags = (row[iTags] || "").toLowerCase();
    const isAd = tags.includes("taos highline") || tags.includes("meta ads");
    if (!isAd) continue;
    adRows++;
    const phone = digits(row[iPhone]);
    if (phone.length < 12 || phone.length > 13) { badPhone++; continue; }
    const enteredAt = parseKommoDate(row[iCreated]);
    if (!enteredAt) { badDate++; continue; }
    const name = (row[iName] || "").trim() || null;
    const model = tags.includes("taos highline") ? "Taos Highline" : "Meta Ads";
    const prev = byPhone.get(phone);
    if (!prev || enteredAt < prev.enteredAt) byPhone.set(phone, { phone, name, enteredAt, model });
  }

  const leads = [...byPhone.values()].sort((a, b) => a.enteredAt.getTime() - b.enteredAt.getTime());
  console.log(`\nLinhas lidas: ${scanned} · linhas de anúncio: ${adRows} · telefones inválidos: ${badPhone} · datas inválidas: ${badDate}`);
  console.log(`Leads de anúncio únicos (dedup por telefone): ${leads.length}\n`);

  let created = 0, skipped = 0;
  for (const l of leads) {
    let contact = await prisma.waContact.findUnique({ where: { connectionId_waId: { connectionId: conn.id, waId: l.phone } } });
    const existingLead = contact ? await prisma.waLead.findUnique({ where: { contactId: contact.id } }) : null;
    const tag = existingLead ? "JÁ EXISTE" : "NOVO";
    console.log(`  [${tag}] ${l.enteredAt.toISOString().slice(0, 16).replace("T", " ")}  +${l.phone}  ${l.name ?? "(sem nome)"}  · ${l.model}`);
    if (existingLead) { skipped++; continue; }
    if (!commit) { created++; continue; }

    if (!contact) {
      contact = await prisma.waContact.create({
        data: { connectionId: conn.id, waId: l.phone, name: l.name, lastMessageAt: l.enteredAt },
      });
    }
    await prisma.waLead.create({
      data: {
        connectionId: conn.id, contactId: contact.id, waId: l.phone, name: l.name,
        adModel: l.model, adTitle: l.model, sourceType: "ad",
        enteredAt: l.enteredAt, imported: true,
      },
    });
    created++;
  }

  console.log(`\n${commit ? "IMPORTADOS" : "(dry-run) seriam importados"}: ${created} · já existentes (pulados): ${skipped}`);
  if (!commit) console.log("Rode novamente com --commit para gravar.\n");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
