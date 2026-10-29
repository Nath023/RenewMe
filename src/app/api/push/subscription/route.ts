import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

type PushSubscriptionInput = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

function validKey(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,512}$/.test(value);
}

export async function POST(request: Request) {
  if (!hasSupabaseConfig()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in to enable browser reminders." }, { status: 401 });

  let input: PushSubscriptionInput;
  try { input = await request.json() as PushSubscriptionInput; }
  catch { return Response.json({ error: "Invalid subscription payload." }, { status: 400 }); }
  if (typeof input.endpoint !== "string" || input.endpoint.length > 2048 || !validKey(input.keys?.p256dh) || !validKey(input.keys?.auth)) {
    return Response.json({ error: "The browser returned an invalid push subscription." }, { status: 400 });
  }
  let endpoint: URL;
  try { endpoint = new URL(input.endpoint); }
  catch { return Response.json({ error: "Invalid push endpoint." }, { status: 400 }); }
  if (endpoint.protocol !== "https:") return Response.json({ error: "Push endpoints must use HTTPS." }, { status: 400 });

  const { error: preferenceError } = await supabase.from("renewme_reminder_preferences").upsert({
    user_id: user.id,
    email_enabled: false,
  }, { onConflict: "user_id", ignoreDuplicates: true });
  if (preferenceError) return Response.json({ error: "Could not prepare reminder preferences." }, { status: 500 });

  const { error } = await supabase.from("renewme_push_subscriptions").upsert({
    user_id: user.id,
    endpoint: endpoint.toString(),
    p256dh: input.keys.p256dh,
    auth_secret: input.keys.auth,
  }, { onConflict: "endpoint" });
  if (error) {
    console.error("Could not save push subscription:", error.code, error.message);
    return Response.json({ error: "Could not save the browser push subscription." }, { status: 500 });
  }
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  if (!hasSupabaseConfig()) return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in to change browser reminders." }, { status: 401 });

  let endpoint: unknown;
  try { endpoint = (await request.json() as { endpoint?: unknown }).endpoint; }
  catch { return Response.json({ error: "Invalid subscription payload." }, { status: 400 }); }
  if (typeof endpoint !== "string" || endpoint.length > 2048) return Response.json({ error: "Invalid push endpoint." }, { status: 400 });
  const { error } = await supabase.from("renewme_push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", endpoint);
  if (error) return Response.json({ error: "Could not remove the browser push subscription." }, { status: 500 });
  return Response.json({ ok: true });
}
