import { ReminderCenter } from "@/components/reminders/reminder-center";
import { SubscriptionAuth } from "@/components/subscriptions/subscription-ledger";
import { demoSubscriptions, type Subscription } from "@/lib/subscriptions/types";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

export default async function RemindersPage() {
  const today = todayUtc();
  if (!hasSupabaseConfig()) {
    return <ReminderCenter accountName="Preview account" preview rows={demoSubscriptions} today={today} />;
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return <SubscriptionAuth error={authError?.message} />;

  const [{ data, error }, { data: deliveries, error: deliveryError }] = await Promise.all([
    supabase.from("subscriptions").select("*").order("renewal_date", { ascending: true }),
    supabase
      .from("renewme_reminder_deliveries")
      .select("id,subscription_id,reminder_type,due_date,status,attempt_count,last_attempt_at,sent_at,created_at")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return <ReminderCenter
    accountName={user.email ?? "RenewMe account"}
    deliveryError={deliveryError ? "Apply the reminder history migration to view email delivery history." : undefined}
    deliveries={deliveries ?? []}
    error={error?.message}
    rows={(data ?? []) as Subscription[]}
    today={today}
  />;
}
