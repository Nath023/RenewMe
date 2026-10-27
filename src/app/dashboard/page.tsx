import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { SubscriptionAuth } from "@/components/subscriptions/subscription-ledger";
import { demoSubscriptions, type Subscription } from "@/lib/subscriptions/types";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

export default async function DashboardPage() {
  const today = todayUtc();
  if (!hasSupabaseConfig()) {
    return <DashboardOverview accountName="Preview account" preview rows={demoSubscriptions} today={today} />;
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return <SubscriptionAuth error={authError?.message} />;

  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .order("renewal_date", { ascending: true });

  return <DashboardOverview accountName={user.email ?? "RenewMe account"} error={error?.message} rows={(data ?? []) as Subscription[]} today={today} />;
}
