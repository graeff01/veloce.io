import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { makeLinkToken, telegramAvailable } from "@/lib/notifications/telegram";

// GET — deep link para vincular o Telegram do usuário atual.
export async function GET() {
  const { error, session } = await requireAuth();
  if (error) return error;

  const botUser = process.env.TELEGRAM_BOT_USERNAME;
  if (!telegramAvailable() || !botUser) {
    return NextResponse.json({ available: false });
  }

  const token = await makeLinkToken(session!.user.id);
  return NextResponse.json({
    available: true,
    link: `https://t.me/${botUser}?start=${token}`,
  });
}
