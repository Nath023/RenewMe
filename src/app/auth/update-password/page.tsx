import Link from "next/link";
import { redirect } from "next/navigation";
import { updatePasswordAction } from "@/app/actions/auth";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function UpdatePasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  if (!hasSupabaseConfig()) redirect("/forgot-password?error=Supabase%20is%20not%20configured");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/forgot-password?error=Open%20the%20password%20reset%20link%20from%20your%20email%20first");

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-row auth-brand"><Link className="brand-name" href="/">RenewMe</Link><span className="folio-version">FOLIO V2.4</span></div>
        <p className="eyebrow">Account recovery</p>
        <h1>Choose a new password.</h1>
        <p className="auth-intro">Use at least 8 characters. You’ll use this password the next time you sign in.</p>
        {first(params.error) && <p className="notice notice-error" role="alert">{first(params.error)}</p>}
        <form action={updatePasswordAction} className="auth-form">
          <label>New password<input autoComplete="new-password" minLength={8} name="password" required type="password" /></label>
          <label>Confirm new password<input autoComplete="new-password" minLength={8} name="confirmPassword" required type="password" /></label>
          <button className="button button-primary" type="submit">Save new password</button>
        </form>
      </section>
    </main>
  );
}
