"use client";

import Link from "next/link";
import { useState } from "react";
import { createSubscription } from "@/app/actions/subscriptions";
import { saveOnboardingProfile } from "@/app/actions/settings";
import { useDisplayCurrency } from "@/lib/preferences/currency";

type Currency = "NGN" | "USD";

export function OnboardingFlow({ email, initialName, initialCurrency, error }: { email: string; initialName: string; initialCurrency: Currency; error?: string }) {
  const [step, setStep] = useState(1);
  const [ledgerName, setLedgerName] = useState(initialName);
  const [currency, setCurrency] = useState<Currency>(initialCurrency);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [, setDisplayCurrency] = useDisplayCurrency(initialCurrency);

  return (
    <main className="auth-shell onboarding-shell">
      <section className="auth-card onboarding-card">
        <header className="onboarding-header">
          <Link className="brand-name" href="/">RenewMe</Link>
          <span className="folio-version">ACCOUNT SETUP</span>
        </header>
        <div className="onboarding-progress" aria-label={`Step ${step} of 3`}>
          <div className="onboarding-progress-label"><span>STEP 0{step} OF 03 · LEDGER SETUP</span><span>{Math.round(step / 3 * 100)}%</span></div>
          <div className="onboarding-progress-track"><span style={{ width: `${step / 3 * 100}%` }} /></div>
        </div>
        {error && <p className="notice notice-error" role="alert">{error}</p>}

        {step === 1 && <section>
          <p className="eyebrow">A clear place to begin</p>
          <h1>Name your ledger.</h1>
          <p className="auth-intro">Choose a name for your records and the currency you use most. You can change the display currency later in Settings.</p>
          <label className="onboarding-field">Ledger name<input maxLength={100} onChange={(event) => setLedgerName(event.target.value)} placeholder="e.g. Adebayo Studio" value={ledgerName} /></label>
          <fieldset className="onboarding-currencies"><legend>Reporting currency</legend>
            <label className={currency === "NGN" ? "onboarding-currency selected" : "onboarding-currency"}><input checked={currency === "NGN"} name="currency-choice" onChange={() => setCurrency("NGN")} type="radio" /><span className="currency-symbol">₦</span><span><strong>NGN</strong><small>Nigerian naira</small></span>{currency === "NGN" && <b>SELECTED</b>}</label>
            <label className={currency === "USD" ? "onboarding-currency selected" : "onboarding-currency"}><input checked={currency === "USD"} name="currency-choice" onChange={() => setCurrency("USD")} type="radio" /><span className="currency-symbol">$</span><span><strong>USD</strong><small>US dollar</small></span>{currency === "USD" && <b>SELECTED</b>}</label>
          </fieldset>
          <div className="onboarding-actions"><button className="button button-primary" onClick={() => setStep(2)} type="button">Continue <span aria-hidden="true">→</span></button><Link href="/subscriptions">Skip setup</Link></div>
        </section>}

        {step === 2 && <section>
          <p className="eyebrow">Step two · Your first entry</p>
          <h1>Start with one subscription.</h1>
          <p className="auth-intro">Add a service now so RenewMe can put its cost and next renewal on your ledger. You can add more later.</p>
          <form className="subscription-form onboarding-subscription-form" action={async (formData) => { await createSubscription(formData); setStep(3); }}>
            <label>Service or vendor<input autoComplete="organization" name="vendor" placeholder="e.g. Adobe Creative Cloud" required /></label>
            <div className="form-grid"><label>Amount<input min="0" name="amount" placeholder="0.00" required step="0.01" type="number" /></label><label>Currency<select defaultValue={currency} name="currency"><option value="NGN">NGN</option><option value="USD">USD</option></select></label></div>
            <div className="form-grid"><label>Billing cycle<select defaultValue="monthly" name="billing_cycle"><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annually</option></select></label><label>Next renewal<input name="renewal_date" required type="date" /></label></div>
            <input name="status" type="hidden" value="active" />
            <div className="onboarding-actions"><button className="button button-primary" type="submit">Add subscription <span aria-hidden="true">→</span></button><button className="button button-secondary" onClick={() => setStep(3)} type="button">I’ll do this later</button></div>
          </form>
          <button className="onboarding-back" onClick={() => setStep(1)} type="button">← Back</button>
        </section>}

        {step === 3 && <section>
          <p className="eyebrow">Step three · Renewal alerts</p>
          <h1>Keep renewals in view.</h1>
          <p className="auth-intro">Choose whether RenewMe should email <strong>{email}</strong> before a subscription renews. Email reminders arrive 7 days and 1 day before renewal.</p>
          <label className="onboarding-reminder-toggle"><span><strong>Email renewal reminders</strong><small>Two notices for upcoming renewals: 7 days and 1 day before.</small></span><input checked={emailEnabled} onChange={(event) => setEmailEnabled(event.target.checked)} type="checkbox" /></label>
          <form action={async (formData) => { setDisplayCurrency(currency); await saveOnboardingProfile(formData); }}>
            <input name="ledger_name" type="hidden" value={ledgerName} />
            <input name="reporting_currency" type="hidden" value={currency} />
            <input name="email_enabled" type="hidden" value={String(emailEnabled)} />
            <div className="onboarding-actions"><button className="button button-primary" type="submit">Finish setup <span aria-hidden="true">→</span></button><Link href="/subscriptions">Skip setup</Link></div>
          </form>
          <button className="onboarding-back" onClick={() => setStep(2)} type="button">← Back</button>
        </section>}
        <footer className="onboarding-footer"><span>PRIVATE LEDGER · YOUR DATA STAYS WITH YOUR ACCOUNT</span><span>ACCOUNT · {email}</span></footer>
      </section>
    </main>
  );
}
