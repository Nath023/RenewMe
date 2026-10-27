import Link from "next/link";
import { AccountMenu } from "@/components/account/account-menu";
import { redirect } from "next/navigation";
import { signOutAction } from "@/app/actions/auth";
import { SubscriptionAuth } from "@/components/subscriptions/subscription-ledger";
import { AdminUserDirectory } from "@/components/admin/admin-user-directory";
import { getAdminAccounts } from "@/lib/admin/accounts";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

function Icon({ children }: { children: string }) {
  return <span aria-hidden="true" className="material-symbols-outlined">{children}</span>;
}

function AccessMessage({ email, reason }: { email: string; reason: "not_admin" | "not_configured" | "failed" }) {
  const message = reason === "not_configured"
    ? "The admin database migration has not been applied yet."
    : reason === "failed"
      ? "Could not verify admin access. Check that the admin migration is applied in Supabase."
      : "This account has not been granted admin access.";
  return <main className="admin-access-page"><section className="admin-access-card"><span className="admin-access-icon"><Icon>admin_panel_settings</Icon></span><p className="calendar-eyebrow">RenewMe · Admin area</p><h1>Admin access required</h1><p>{message}</p><div className="admin-identity"><span>Signed in as</span><strong>{email}</strong></div><div className="admin-access-actions"><Link className="button button-primary" href="/dashboard">Return to app</Link><form action={signOutAction}><button className="button button-secondary" type="submit">Sign out</button></form></div><details><summary>Set up an admin account</summary><p>Apply <code>supabase/migrations/202610230001_add_admin_overview.sql</code>, then add your existing account to <code>public.renewme_admins</code> from the Supabase SQL editor. The role table does not allow users to grant themselves access.</p></details></section></main>;
}

export default async function AdminPage() {
  if (!hasSupabaseConfig()) return <AccessMessage email="No account" reason="not_configured" />;

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user) {
    if (authError) redirect(`/subscriptions?authError=${encodeURIComponent(authError.message)}`);
    return <SubscriptionAuth />;
  }

  const { data: isAdmin, error: roleError } = await supabase.rpc("renewme_is_admin");
  if (roleError) return <AccessMessage email={user.email ?? "RenewMe account"} reason="not_configured" />;
  if (!isAdmin) return <AccessMessage email={user.email ?? "RenewMe account"} reason="not_admin" />;

  const { data, error } = await supabase.rpc("renewme_admin_summary");
  const summary = data?.[0];
  const directory = await getAdminAccounts();
  return (
    <div className="ledger-app admin-app">
      <aside className="ledger-sidebar"><div><div className="brand-row"><Link className="brand-name" href="/dashboard">RenewMe</Link><span className="folio-version">ADMIN</span></div><div className="register-label"><span>Platform</span><span>#00</span></div><nav aria-label="Admin navigation" className="sidebar-nav"><Link className="nav-link nav-link-active" href="/admin"><Icon>admin_panel_settings</Icon><span>Overview</span></Link><Link className="nav-link" href="/dashboard"><Icon>dashboard</Icon><span>Customer app</span></Link><Link className="nav-link" href="/settings"><Icon>tune</Icon><span>Settings</span></Link></nav></div><div className="account-card"><div><strong>{user.email ?? "Admin account"}</strong><span>Admin access <i /> <b>Verified</b></span></div><form action={signOutAction}><button aria-label="Sign out" className="calendar-signout" type="submit"><Icon>logout</Icon></button></form></div></aside>
      <div className="ledger-main"><header className="calendar-topbar"><Link href="/dashboard"><Icon>menu_book</Icon><span><strong>RenewMe</strong> · Admin</span></Link><AccountMenu accountName={user.email ?? "Admin account"} /></header><main className="admin-content"><div className="calendar-kicker"><span>Platform oversight · Admin console</span><span>Account management</span></div><div className="admin-heading"><div><h1>Admin overview</h1><p>Review platform totals and manage account sign-in access. Customer subscription details remain private.</p></div><Link className="button button-secondary" href="/dashboard">Open customer app</Link></div>{error ? <p className="notice notice-error" role="alert">Could not load admin summary: {error.message}</p> : summary ? <section aria-label="Platform totals" className="admin-metrics"><article><span>Registered accounts</span><strong>{summary.account_count.toLocaleString()}</strong><small>Supabase Auth accounts</small></article><article><span>Subscription records</span><strong>{summary.subscription_count.toLocaleString()}</strong><small>Across all accounts</small></article><article><span>Active subscriptions</span><strong>{summary.active_subscription_count.toLocaleString()}</strong><small>Currently marked active</small></article><article><span>Needs review</span><strong>{summary.review_count.toLocaleString()}</strong><small>Marked for follow-up</small></article></section> : <p className="admin-empty">No platform statistics are available.</p>}<AdminUserDirectory initialAccounts={directory.accounts} initialError={directory.error} initialPage={directory.page} initialHasMore={directory.hasMore} initialTotalCount={directory.totalCount} /><section className="admin-scope-note"><Icon>shield_lock</Icon><div><strong>Access scope</strong><p>This console only manages authentication accounts. It does not expose customer payment references or subscription details.</p></div></section><footer className="calendar-footer"><span><Icon>verified_user</Icon>Admin role checked by Supabase on the server</span><Link href="/settings">Settings</Link></footer></main></div>
    </div>
  );
}
