import { SettingsCenter } from "@/components/settings/settings-center";
import { SubscriptionAuth } from "@/components/subscriptions/subscription-ledger";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { demoSubscriptions, type Subscription } from "@/lib/subscriptions/types";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  if (!hasSupabaseConfig()) return <SettingsCenter accountName="Preview account" preview rows={demoSubscriptions} />;

  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (!user) return <SubscriptionAuth error={error?.message} />;

  const { data, error: recordsError } = await supabase.from("subscriptions").select("*").order("renewal_date", { ascending: true });
  const { data: reminderPreference, error: preferenceError } = await supabase.from("renewme_reminder_preferences").select("email_enabled").maybeSingle();
  const { data: isAdmin } = await supabase.rpc("renewme_is_admin");
  const metadata = user.user_metadata ?? {};
  return <SettingsCenter accountName={user.email ?? "RenewMe account"} workspaceName={typeof metadata.renewme_ledger_name === "string" ? metadata.renewme_ledger_name : "Ledger Register"} initialCurrency={metadata.renewme_reporting_currency === "USD" ? "USD" : "NGN"} emailRemindersEnabled={Boolean(reminderPreference?.email_enabled)} isAdmin={Boolean(isAdmin)} preferenceError={preferenceError ? "Apply the email reminders migration to enable delivery settings." : undefined} rows={(data ?? []) as Subscription[]} settingsError={first(params.settingsError)} settingsMessage={first(params.settingsMessage)} error={recordsError?.message} />;
}
