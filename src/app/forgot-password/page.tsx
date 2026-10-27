import Link from "next/link";
import { requestPasswordReset } from "@/app/actions/auth";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ForgotPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-row auth-brand"><Link className="brand-name" href="/">RenewMe</Link><span className="folio-version">FOLIO V2.4</span></div>
        <p className="eyebrow">Account recovery</p>
        <h1>Reset your access key.</h1>
        <p className="auth-intro">Enter the email address for your ledger. We’ll send a secure link to choose a new password.</p>
        {first(params.error) && <p className="notice notice-error" role="alert">{first(params.error)}</p>}
        {first(params.message) && <p className="notice notice-success" role="status">{first(params.message)}</p>}
        <form action={requestPasswordReset} className="auth-form">
          <label>Email address<input autoComplete="email" name="email" required type="email" /></label>
          <button className="button button-primary" type="submit">Send reset link</button>
        </form>
        <Link className="auth-return-link" href="/subscriptions">Return to sign in</Link>
      </section>
    </main>
  );
}
