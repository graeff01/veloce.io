import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getPortalUser } from "@/lib/portal-auth";

const APP_URL = (process.env.NEXTAUTH_URL || "https://veloceio-production.up.railway.app").replace(/\/$/, "");

// Seções do portal que dá pra ligar/desligar por cliente (conversas é obrigatória).
export const PORTAL_SECTIONS = ["painel", "fechamento", "conversas", "equipe", "anuncios", "ia", "funil", "objecoes"] as const;
export type PortalSection = (typeof PORTAL_SECTIONS)[number];
// null (não configurado) = todas ligadas. Conversas sempre entra.
export function parseSections(csv: string | null | undefined): PortalSection[] {
  if (csv == null) return [...PORTAL_SECTIONS];
  const set = new Set(csv.split(",").map((s) => s.trim()).filter(Boolean));
  set.add("conversas");
  return PORTAL_SECTIONS.filter((s) => set.has(s));
}

export interface PortalState { token: string; link: string; accentColor: string | null; mode: string; active: boolean; requireLogin: boolean; maxUsers: number; sections: PortalSection[] }

// Dados da CASCA do portal (menu por seção + conta logada + aba de teste da IA),
// resolvidos no SERVIDOR para o PortalShell já pintar CERTO no 1º render. Antes vinham
// de um fetch client-side: como o shell re-monta a cada navegação, o menu piscava (com
// `sections=null` mostrava TODAS, inclusive as que o cliente não tem) e o nome/Sair
// sumiam até o fetch voltar. Com isto o servidor entrega tudo pronto — sem flash.
export async function getPortalShellData(clientId: string): Promise<{ sections: PortalSection[]; aiTest: boolean; account: { email: string; name: string | null; role: string } | null }> {
  const [cp, account] = await Promise.all([
    prisma.clientPortal.findUnique({ where: { clientId }, select: { sections: true } }),
    getPortalUser(clientId),
  ]);
  const aiTest = (cp?.sections ?? "").split(",").map((s) => s.trim()).includes("teste");
  return { sections: parseSections(cp?.sections), aiTest, account };
}

// Uma seção está habilitada no portal deste cliente? (para gate por URL nas páginas.)
export async function sectionEnabled(clientId: string, key: PortalSection): Promise<boolean> {
  const cp = await prisma.clientPortal.findUnique({ where: { clientId }, select: { sections: true } });
  return parseSections(cp?.sections).includes(key);
}

// Garante o portal do cliente (cria token na 1ª vez). Token = capability URL.
export async function getOrCreatePortal(clientId: string): Promise<PortalState> {
  let portal = await prisma.clientPortal.findUnique({ where: { clientId } });
  if (!portal) {
    const token = crypto.randomBytes(18).toString("base64url");
    portal = await prisma.clientPortal.create({ data: { clientId, token } });
  }
  return { token: portal.token, link: `${APP_URL}/r/${portal.token}`, accentColor: portal.accentColor, mode: portal.mode, active: portal.active, requireLogin: portal.requireLogin, maxUsers: portal.maxUsers, sections: parseSections(portal.sections) };
}

// Resolve o token (capability) → cliente + tema, só se ativo.
export async function resolvePortal(token: string): Promise<{ clientId: string; accentColor: string | null; mode: string } | null> {
  const portal = await prisma.clientPortal.findUnique({ where: { token } });
  if (!portal || !portal.active) return null;
  return { clientId: portal.clientId, accentColor: portal.accentColor, mode: portal.mode };
}

export async function updatePortal(clientId: string, data: { accentColor?: string | null; mode?: string; active?: boolean; requireLogin?: boolean; maxUsers?: number; sections?: string | null }): Promise<void> {
  await prisma.clientPortal.updateMany({ where: { clientId }, data });
}

// Rotaciona o token (invalida o link antigo).
export async function rotatePortalToken(clientId: string): Promise<string> {
  const token = crypto.randomBytes(18).toString("base64url");
  await prisma.clientPortal.update({ where: { clientId }, data: { token } });
  return token;
}
