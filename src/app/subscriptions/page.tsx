import { SubscriptionAuth, SubscriptionLedger } from "@/components/subscriptions/subscription-ledger";
import type { Subscription } from "@/lib/subscriptions/types";
import { demoSubscriptions } from "@/lib/subscriptions/types";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

  if (!hasSupabaseConfig()) {
    return <SubscriptionLedger error={first(params.formError)} message={first(params.authMessage)} preview rows={demoSubscriptions} />;
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) {
    return <SubscriptionAuth error={first(params.authError) ?? authError?.message} message={first(params.authMessage)} />;
  }

  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .order("renewal_date", { ascending: true });

  return (
    <SubscriptionLedger
      accountName={user.email ?? "RenewMe account"}
      error={first(params.formError) ?? error?.message}
      message={first(params.authMessage)}
      rows={(data ?? []) as Subscription[]}
      userId={user.id}
    />
  );
}
