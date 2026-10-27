import { SubscriptionAuth } from "@/components/subscriptions/subscription-ledger";
import { SubscriptionReport } from "@/components/reports/subscription-report";
import { demoSubscriptions, type Subscription } from "@/lib/subscriptions/types";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

function todayInLagos() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export default async function ReportsPage() {
  const today = todayInLagos();
  if (!hasSupabaseConfig()) {
    return <SubscriptionReport accountName="Preview account" preview rows={demoSubscriptions} today={today} />;
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return <SubscriptionAuth error={authError?.message} />;

  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .order("vendor", { ascending: true });

  return <SubscriptionReport accountName={user.email ?? "RenewMe account"} error={error?.message} rows={(data ?? []) as Subscription[]} today={today} />;
}
