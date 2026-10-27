import { SubscriptionAuth } from "@/components/subscriptions/subscription-ledger";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function OnboardingPage({ searchParams }: { searchParams: SearchParams }) {
  if (!hasSupabaseConfig()) return <SubscriptionAuth error="Connect Supabase to set up your RenewMe account." />;
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (!user) return <SubscriptionAuth error={error?.message} />;
  const params = await searchParams;
  const errorValue = params.error;
  const pageError = Array.isArray(errorValue) ? errorValue[0] : errorValue;
  const metadata = user.user_metadata ?? {};
  return <OnboardingFlow email={user.email ?? ""} initialName={typeof metadata.renewme_ledger_name === "string" ? metadata.renewme_ledger_name : ""} initialCurrency={metadata.renewme_reporting_currency === "USD" ? "USD" : "NGN"} error={pageError} />;
}
