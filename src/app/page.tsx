import Link from "next/link";

const commitments = [
  { name: "Namecheap DNS", amount: "$14.50", cycle: "/yr", naira: "≈ ₦22,475", date: "Cancel by 14 Nov", urgent: true },
  { name: "Google Workspace", amount: "$36.00", cycle: "/mo", naira: "≈ ₦55,800", date: "Thu 12 Nov" },
  { name: "Vercel Pro", amount: "$20.00", cycle: "/mo", naira: "≈ ₦31,000", date: "Tue 17 Nov" },
  { name: "Canva Pro", amount: "$12.99", cycle: "/mo", naira: "≈ ₦20,135", date: "Fri 20 Nov" },
  { name: "Zoom Pro", amount: "$149.90", cycle: "/yr", naira: "≈ ₦232,345", date: "Sun 29 Nov" },
];

const concerns = [
  ["public_off", "Expired domains taking websites offline", "Missed registrar renewals can interrupt a site or leave a domain at risk."],
  ["person_cancel", "Forgotten seats for departed team members", "Keep track of software seats and workspaces that still appear on the bill."],
  ["trending_up", "Unexpected USD exchange rate spikes", "See foreign currency commitments alongside their naira estimates."],
];

const steps = [
  ["01", "Record your subscriptions", "Add the vendor, billing cycle, renewal date, and payment details to your ledger."],
  ["02", "See your recurring costs", "Review monthly exposure and compare USD and NGN amounts in one place."],
  ["03", "Keep the details current", "Search, edit, archive, and export your subscription records as your tools change."],
];

function Icon({ children }: { children: string }) {
  return <span aria-hidden="true" className="material-symbols-outlined">{children}</span>;
}

export default function HomePage() {
  return (
    <div className="landing-page">
      <header className="landing-header">
        <Link className="landing-brand" href="/">RenewMe</Link>
        <nav aria-label="Main navigation" className="landing-nav">
          <a href="#how-it-works">How it works</a>
          <a href="#features">Features</a>
        </nav>
        <div className="landing-header-actions">
          <Link className="landing-signin" href="/sign-in">Sign in</Link>
          <Link className="landing-cta landing-cta-small" href="/sign-up">Start tracking</Link>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <p className="landing-eyebrow"><span /> Folio system · Subscription tracker</p>
            <h1>Know what renews before it costs you.</h1>
            <p className="landing-intro">Track domains, software licences, and hosting in one place, with your subscriptions shown in naira and dollars.</p>
            <div className="landing-actions">
              <Link className="landing-cta" href="/sign-up">Start tracking free <Icon>arrow_forward</Icon></Link>
              <span>No card required · Your account data stays yours</span>
            </div>
            <div className="landing-proof"><Icon>verified_user</Icon><span>Private by account · Built for clear subscription records</span></div>
          </div>

          <section aria-label="Example subscription ledger" className="landing-ledger-card">
            <div className="landing-ledger-heading"><span><Icon>menu_book</Icon> Upcoming renewals</span><small>FOLIO 04</small></div>
            {commitments.map((item) => (
              <div className="landing-commitment" key={item.name}>
                <div className="landing-commitment-top"><strong>{item.name}</strong><span>{item.amount}<small>{item.cycle}</small></span></div>
                <div className="landing-commitment-bottom"><span>{item.naira}</span><span className={item.urgent ? "landing-deadline landing-deadline-urgent" : "landing-deadline"}>{item.date}</span></div>
              </div>
            ))}
            <div className="landing-ledger-total"><span>Estimated rolling outflow</span><strong>₦341,755</strong></div>
            <p className="landing-demo-note">Illustrative sample figures</p>
          </section>
        </section>

        <section className="landing-value-strip">
          <Icon>currency_exchange</Icon>
          <div><span className="landing-eyebrow">Multi-currency overview</span><p>Keep USD and NGN commitments visible together.</p></div>
          <Link href="/sign-in">Open the ledger <Icon>arrow_forward</Icon></Link>
        </section>

        <section className="landing-section landing-problem">
          <div className="landing-section-heading"><span className="landing-eyebrow">01 / The problem</span><h2>Subscriptions don’t announce themselves until the card is charged.</h2><p>RenewMe gives recurring costs a clear home, so important dates and billing details are easier to find.</p></div>
          <div className="landing-concern-grid">{concerns.map(([icon, title, text], index) => <article className="landing-concern" key={title}><span className="landing-concern-meta">Incident 0{index + 1}<Icon>{icon}</Icon></span><h3>{title}</h3><p>{text}</p></article>)}</div>
        </section>

        <section className="landing-section" id="how-it-works">
          <div className="landing-section-heading"><span className="landing-eyebrow">02 / The process</span><h2>A calmer way to keep the details straight.</h2></div>
          <div className="landing-steps">{steps.map(([number, title, text]) => <article className="landing-step" key={number}><span>{number}</span><div><h3>{title}</h3><p>{text}</p></div></article>)}</div>
        </section>

        <section className="landing-section landing-features" id="features">
          <div className="landing-section-heading"><span className="landing-eyebrow">03 / In your folio</span><h2>The essentials for a useful subscription register.</h2></div>
          <div className="landing-feature-grid">
            <article><Icon>event</Icon><h3>Renewal dates</h3><p>Store renewal and cancellation dates alongside each subscription.</p></article>
            <article><Icon>currency_exchange</Icon><h3>Two currencies</h3><p>Record USD or NGN costs and view a comparative estimate.</p></article>
            <article><Icon>manage_search</Icon><h3>Search and sort</h3><p>Find records by vendor, service, category, date, or amount.</p></article>
            <article><Icon>download</Icon><h3>Portable records</h3><p>Export the filtered ledger as a CSV whenever you need it.</p></article>
          </div>
        </section>

        <section className="landing-final-cta"><span className="landing-eyebrow">Your subscription folio</span><h2>Start with a clearer view of what you pay for.</h2><p>Create an account or sign in to open your private ledger.</p><Link className="landing-cta" href="/sign-up">Create your account <Icon>arrow_forward</Icon></Link><Link className="landing-final-signin" href="/sign-in">Already have an account? Sign in</Link></section>
      </main>

      <footer className="landing-footer"><Link className="landing-brand" href="/">RenewMe</Link><span>Subscription records, kept in one place.</span><Link href="/sign-in">Sign in</Link></footer>
    </div>
  );
}
