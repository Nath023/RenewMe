import Link from "next/link";
import { resendSignupConfirmation, signInAction, signUpAction } from "@/app/actions/auth";

type AuthPageProps = {
  mode: "sign-in" | "sign-up";
  error?: string;
  message?: string;
};

export function AuthPage({ mode, error, message }: AuthPageProps) {
  const signingUp = mode === "sign-up";

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-row auth-brand"><Link className="brand-name" href="/">RenewMe</Link><span className="folio-version">FOLIO V2.4</span></div>
        <p className="eyebrow">{signingUp ? "Create your private folio" : "Subscription ledger"}</p>
        <h1>{signingUp ? "Start tracking." : "Open your ledger."}</h1>
        <p className="auth-intro">{signingUp ? "Create an account to keep your renewal dates and subscription records in one place." : "Sign in to review your commitments and renewal dates."}</p>
        {error && <p className="notice notice-error" role="alert">{error}</p>}
        {message && <p className="notice notice-success" role="status">{message}</p>}

        {signingUp ? (
          <>
            <form action={signUpAction} className="auth-form">
              <label>Email address<input autoComplete="email" name="email" required type="email" /></label>
              <label>Password<input autoComplete="new-password" minLength={8} name="password" required type="password" /></label>
              <small>Use at least 8 characters. We’ll send a confirmation link to your email.</small>
              <button className="button button-primary" type="submit">Create account</button>
            </form>
            <details className="signup-details">
              <summary>Already signed up? Resend confirmation</summary>
              <form action={resendSignupConfirmation} className="auth-form">
                <label>Email address<input autoComplete="email" name="email" required type="email" /></label>
                <button className="button button-secondary" type="submit">Send a new confirmation link</button>
              </form>
            </details>
            <Link className="auth-return-link" href="/sign-in">Already have an account? Sign in</Link>
          </>
        ) : (
          <>
            <form action={signInAction} className="auth-form">
              <label>Email address<input autoComplete="email" name="email" required type="email" /></label>
              <label>Password<input autoComplete="current-password" minLength={8} name="password" required type="password" /></label>
              <button className="button button-primary" type="submit">Open ledger</button>
            </form>
            <details className="signup-details">
              <summary>Still being asked to confirm your email?</summary>
              <form action={resendSignupConfirmation} className="auth-form">
                <input name="return_to" type="hidden" value="/sign-in" />
                <label>Email address<input autoComplete="email" name="email" required type="email" /></label>
                <button className="button button-secondary" type="submit">Resend confirmation email</button>
              </form>
            </details>
            <Link className="auth-return-link" href="/forgot-password">Forgot your password?</Link>
            <p className="auth-switch-note">New to RenewMe? <Link href="/sign-up">Create an account</Link></p>
          </>
        )}
        <Link className="auth-home-link" href="/">Back to RenewMe</Link>
      </section>
    </main>
  );
}
