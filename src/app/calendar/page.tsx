import { SubscriptionAuth } from "@/components/subscriptions/subscription-ledger";
import { RenewalCalendar } from "@/components/calendar/renewal-calendar";
import { demoSubscriptions } from "@/lib/subscriptions/types";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { Subscription } from "@/lib/subscriptions/types";

function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function previewRows(monthKey: string): Subscription[] {
  const [year, month] = monthKey.split("-").map(Number);
  return demoSubscriptions.map((row) => {
    const [, , dayValue] = row.renewal_date.split("-").map(Number);
    const day = Math.min(dayValue, new Date(Date.UTC(year, month, 0)).getUTCDate());
    const renewalDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return { ...row, renewal_date: renewalDate };
  });
}

export default async function CalendarPage() {
  const initialMonth = currentMonthKey();
  if (!hasSupabaseConfig()) {
    return <RenewalCalendar accountName="Preview account" initialMonth={initialMonth} rows={previewRows(initialMonth)} />;
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) return <SubscriptionAuth error={authError?.message} />;

  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .order("renewal_date", { ascending: true });

  if (error) {
    return <main className="calendar-load-error"><h1>Calendar unavailable</h1><p>{error.message}</p><a href="/subscriptions">Return to subscriptions</a></main>;
  }

  return <RenewalCalendar accountName={user.email ?? "RenewMe account"} initialMonth={initialMonth} rows={(data ?? []) as Subscription[]} />;
}
