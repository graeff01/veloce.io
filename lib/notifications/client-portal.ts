import crypto from "crypto";
import { prisma } from "@/lib/prisma";

const APP_URL = (process.env.NEXTAUTH_URL || "https://veloceio-production.up.railway.app").replace(/\/$/, "");

export interface PortalState { token: string; link: string; accentColor: string | null; mode: string; active: boolean; requireLogin: boolean; maxUsers: number }

// Garante o portal do cliente (cria token na 1ª vez). Token = capability URL.
export async function getOrCreatePortal(clientId: string): Promise<PortalState> {
  let portal = await prisma.clientPortal.findUnique({ where: { clientId } });
  if (!portal) {
    const token = crypto.randomBytes(18).toString("base64url");
    portal = await prisma.clientPortal.create({ data: { clientId, token } });
  }
  return { token: portal.token, link: `${APP_URL}/r/${portal.token}`, accentColor: portal.accentColor, mode: portal.mode, active: portal.active, requireLogin: portal.requireLogin, maxUsers: portal.maxUsers };
}

// Resolve o token (capability) → cliente + tema, só se ativo.
export async function resolvePortal(token: string): Promise<{ clientId: string; accentColor: string | null; mode: string } | null> {
  const portal = await prisma.clientPortal.findUnique({ where: { token } });
  if (!portal || !portal.active) return null;
  return { clientId: portal.clientId, accentColor: portal.accentColor, mode: portal.mode };
}

export async function updatePortal(clientId: string, data: { accentColor?: string | null; mode?: string; active?: boolean; requireLogin?: boolean; maxUsers?: number }): Promise<void> {
  await prisma.clientPortal.updateMany({ where: { clientId }, data });
}

// Rotaciona o token (invalida o link antigo).
export async function rotatePortalToken(clientId: string): Promise<string> {
  const token = crypto.randomBytes(18).toString("base64url");
  await prisma.clientPortal.update({ where: { clientId }, data: { token } });
  return token;
}
