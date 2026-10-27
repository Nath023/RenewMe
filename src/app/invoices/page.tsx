import { InvoiceIntake } from "@/components/invoices/invoice-intake";
import { SubscriptionAuth } from "@/components/subscriptions/subscription-ledger";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export default async function InvoicesPage() {
  if (!hasSupabaseConfig()) return <SubscriptionAuth error="Connect Supabase to create a subscription from an invoice." />;
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (!user) return <SubscriptionAuth error={error?.message} />;
  return <InvoiceIntake accountName={user.email ?? "RenewMe account"} />;
}
