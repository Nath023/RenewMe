import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: { id?: number; type?: string };
  };
};

async function reply(token: string, chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
    cache: "no-store",
  });
}

export async function POST(request: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!token || !webhookSecret) return Response.json({ error: "Telegram bot is not configured." }, { status: 503 });
  if (request.headers.get("x-telegram-bot-api-secret-token") !== webhookSecret) return Response.json({ error: "Unauthorized." }, { status: 401 });

  let update: TelegramUpdate;
  try { update = await request.json() as TelegramUpdate; }
  catch { return Response.json({ ok: true }); }

  const message = update.message;
  const chatId = message?.chat?.id;
  const text = message?.text?.trim() ?? "";
  if (message?.chat?.type !== "private" || typeof chatId !== "number" || !Number.isSafeInteger(chatId)) return Response.json({ ok: true });
  if (text === "/start" || text === "/help") {
    await reply(token, chatId, "Connect RenewMe from Settings → Telegram reminders, then use the one-time link sent by RenewMe.");
    return Response.json({ ok: true });
  }

  const match = text.match(/^\/start(?:@[A-Za-z0-9_]+)?\s+([a-f0-9]{48})$/i);
  if (!match) return Response.json({ ok: true });
  const supabase = createAdminClient();
  if (!supabase) return Response.json({ error: "Telegram linking is not configured." }, { status: 503 });

  const { data, error } = await supabase.rpc("renewme_link_telegram_chat", { p_code: match[1], p_chat_id: String(chatId) });
  if (error) {
    console.error("Telegram account linking failed:", error.code, error.message);
    return Response.json({ error: "Could not link Telegram." }, { status: 500 });
  }
  await reply(token, chatId, data ? "Your Telegram account is connected to RenewMe. Renewal and cancellation reminders will arrive here." : "That connection link has expired or is invalid. Create a new link in RenewMe Settings.");
  return Response.json({ ok: true });
}
