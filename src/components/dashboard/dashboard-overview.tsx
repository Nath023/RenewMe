"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AccountMenu } from "@/components/account/account-menu";
import { signOutAction } from "@/app/actions/auth";
import { useDisplayCurrency, useUsdNgnRate } from "@/lib/preferences/currency";
import type { Subscription } from "@/lib/subscriptions/types";

type Currency = "USD" | "NGN";

function Icon({ children }: { children: string }) {
  return <span aria-hidden="true" className="material-symbols-outlined">{children}</span>;
}

function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${Number(amount || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

function compactMoney(amount: number, currency: Currency) {
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(amount);
  } catch {
    return money(amount, currency);
  }
}

function monthlyAmount(row: Subscription) {
  return row.billing_cycle === "annual" ? row.amount / 12 : row.billing_cycle === "quarterly" ? row.amount / 3 : row.amount;
}

function shiftMonth(value: string, monthStep: number) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const targetMonth = month - 1 + monthStep;
  const finalDay = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate();
  const date = new Date(Date.UTC(year, targetMonth, Math.min(day, finalDay)));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function nextRenewal(row: Subscription, today: string) {
  const step = row.billing_cycle === "annual" ? 12 : row.billing_cycle === "quarterly" ? 3 : 1;
  let date = row.renewal_date.slice(0, 10);
  for (let count = 0; date < today && count < 240; count += 1) date = shiftMonth(date, step);
  return date;
}

function daysUntil(today: string, date: string) {
  return Math.round((new Date(`${date}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000);
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function SideNav({ accountName, count }: { accountName: string; count: number }) {
  return (
    <aside className="ledger-sidebar">
      <div>
        <div className="brand-row"><Link className="brand-name" href="/dashboard">RenewMe</Link><span className="folio-version">FOLIO V2.4</span><span className="sync-dot" title="Account connected" /></div>
        <div className="register-label"><span>Ledger Register</span><span>#04</span></div>
        <nav aria-label="Main navigation" className="sidebar-nav">
          <Link aria-current="page" className="nav-link nav-link-active" href="/dashboard"><Icon>dashboard</Icon><span>Dashboard</span></Link>
          <Link className="nav-link" href="/subscriptions"><Icon>receipt_long</Icon><span>Subscriptions</span><span className="nav-count">{count}</span></Link>
          <Link className="nav-link" href="/calendar"><Icon>calendar_today</Icon><span>Calendar</span></Link>
          <Link className="nav-link" href="/reports"><Icon>analytics</Icon><span>Reports</span></Link>
          <Link className="nav-link" href="/reminders"><Icon>notifications</Icon><span>Reminders</span></Link>
          <Link className="nav-link" href="/settings"><Icon>tune</Icon><span>Settings</span></Link>
        </nav>
      </div>
      <div className="account-card"><div><strong>{accountName}</strong><span>Private ledger <i /> <b>Connected</b></span></div><div className="account-card-actions"><Link aria-label="Settings" className="account-settings-link" href="/settings"><Icon>settings</Icon></Link><form action={signOutAction}><button aria-label="Sign out" className="calendar-signout" type="submit"><Icon>logout</Icon></button></form></div></div>
    </aside>
  );
}

export function DashboardOverview({ rows, accountName, today, preview = false, error }: { rows: Subscription[]; accountName: string; today: string; preview?: boolean; error?: string }) {
  const [currency, setCurrency] = useDisplayCurrency("NGN");
  const [FX_RATE] = useUsdNgnRate();
  const activeRows = useMemo(() => rows.filter((row) => row.status !== "archived"), [rows]);
  const convert = (amount: number, from: string) => currency === "NGN" ? (from === "NGN" ? amount : amount * FX_RATE) : (from === "USD" ? amount : amount / FX_RATE);
  const monthlyTotal = activeRows.reduce((total, row) => total + convert(monthlyAmount(row), row.currency), 0);
  const upcoming = useMemo(() => activeRows.map((subscription) => ({ subscription, date: nextRenewal(subscription, today) }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.subscription.vendor.localeCompare(b.subscription.vendor)), [activeRows, today]);
  const weekCount = upcoming.filter((entry) => daysUntil(today, entry.date) >= 0 && daysUntil(today, entry.date) <= 7).length;
  const needsReview = activeRows.filter((row) => row.status === "needs_review").length;
  const categories = useMemo(() => {
    const grouped = new Map<string, number>();
    activeRows.forEach((row) => grouped.set(row.category || "Other", (grouped.get(row.category || "Other") ?? 0) + convert(monthlyAmount(row), row.currency)));
    return [...grouped.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount).slice(0, 5);
  }, [activeRows, currency]);
  const categoryMax = Math.max(1, ...categories.map((category) => category.amount));
  const projection = useMemo(() => {
    const baseDate = new Date(`${today}T00:00:00Z`);
    return Array.from({ length: 12 }, (_, offset) => {
      const month = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth() + offset, 1));
      const monthIndex = month.getUTCFullYear() * 12 + month.getUTCMonth();
      const amount = activeRows.reduce((sum, row) => {
        const firstDue = nextRenewal(row, today);
        const [year, monthNumber] = firstDue.split("-").map(Number);
        const firstDueIndex = year * 12 + monthNumber - 1;
        const interval = row.billing_cycle === "annual" ? 12 : row.billing_cycle === "quarterly" ? 3 : 1;
        return monthIndex >= firstDueIndex && (monthIndex - firstDueIndex) % interval === 0
          ? sum + convert(row.amount, row.currency)
          : sum;
      }, 0);
      return {
        label: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(month),
        fullLabel: new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(month),
        amount,
      };
    });
  }, [activeRows, currency, today]);
  const projectionMax = Math.max(1, ...projection.map((month) => month.amount));

  return (
    <div className="ledger-app dashboard-app">
      <SideNav accountName={accountName} count={activeRows.length} />
      <div className="ledger-main">
        <header className="calendar-topbar"><Link href="/dashboard"><Icon>menu_book</Icon><span><strong>RenewMe</strong> — Dashboard</span></Link><AccountMenu accountName={accountName} authenticated={!preview} /></header>
        <nav aria-label="Mobile navigation" className="mobile-nav">
          <Link aria-current="page" href="/dashboard"><Icon>dashboard</Icon><span>Home</span></Link><Link href="/subscriptions"><Icon>receipt_long</Icon><span>Ledger</span></Link><Link href="/calendar"><Icon>calendar_today</Icon><span>Calendar</span></Link><Link href="/reminders"><Icon>notifications</Icon><span>Reminders</span></Link><Link href="/reports"><Icon>analytics</Icon><span>Reports</span></Link><Link href="/settings"><Icon>tune</Icon><span>Settings</span></Link>
        </nav>
        <main className="dashboard-content">
          <div className="dashboard-intro"><div><div className="calendar-kicker"><span>Folio workspace · Overview</span><span>{preview ? "Preview data" : "Live ledger"}</span></div><h1>Your subscription overview</h1><p>Current commitments, upcoming renewals, and where recurring costs are concentrated.</p></div><div className="dashboard-intro-actions"><label>Display currency<select aria-label="Display currency" onChange={(event) => setCurrency(event.target.value as Currency)} value={currency}><option value="NGN">₦ NGN</option><option value="USD">$ USD</option></select></label><Link className="button button-primary" href="/subscriptions"><Icon>add</Icon>Add subscription</Link></div></div>
          {error && <p className="notice notice-error" role="alert">{error}</p>}
          {preview && <div className="preview-banner"><Icon>visibility</Icon><span><strong>Design preview</strong> · Sample ledger data is shown. Sign in with Supabase to see your account overview.</span></div>}

          <section aria-label="Subscription overview metrics" className="dashboard-metrics">
            <article><span>Committed monthly run-rate</span><strong>{money(monthlyTotal, currency)}<small> / mo</small></strong><a href="/reports">View expenditure report <Icon>arrow_forward</Icon></a></article>
            <article><span>Active commitments</span><strong>{activeRows.length}</strong><a href="/subscriptions">Review ledger <Icon>arrow_forward</Icon></a></article>
            <article><span>Renewals · next 7 days</span><strong className={weekCount ? "dashboard-metric-alert" : ""}>{weekCount}</strong><a href="/calendar">Open calendar <Icon>arrow_forward</Icon></a></article>
            <article><span>Needs review</span><strong className={needsReview ? "dashboard-metric-alert" : ""}>{needsReview}</strong><a href="/reminders">Check deadlines <Icon>arrow_forward</Icon></a></article>
          </section>

          <section aria-label="Projected subscription payments for the next 12 months" className="dashboard-panel dashboard-trend-panel">
            <div className="dashboard-panel-heading"><div><span className="calendar-eyebrow">Forward schedule</span><h2>Projected subscription charges</h2></div><span className="dashboard-panel-unit">Next 12 months · {currency}</span></div>
            {activeRows.length ? <div aria-label={`Projected recurring charges by month, in ${currency}`} className="dashboard-chart" role="img">{projection.map((month) => <div className="dashboard-chart-column" key={month.fullLabel} title={`${month.fullLabel}: ${money(month.amount, currency)}`}><strong>{month.amount ? compactMoney(month.amount, currency) : "—"}</strong><div className="dashboard-chart-track"><span style={{ height: `${Math.max(month.amount ? 5 : 0, month.amount / projectionMax * 100)}%` }} /></div><small>{month.label}</small></div>)}</div> : <div className="dashboard-empty"><Icon>bar_chart</Icon><strong>No subscription charges to project.</strong><span>Add subscriptions with a billing cycle and renewal date.</span></div>}
            <p className="dashboard-chart-note"><Icon>info</Icon>Projected from each saved renewal date and billing cycle. Currency comparison uses the illustrative ₦{FX_RATE.toLocaleString("en-NG")} per $1 benchmark.</p>
          </section>

          <div className="dashboard-panels">
            <section className="dashboard-panel dashboard-upcoming"><div className="dashboard-panel-heading"><div><span className="calendar-eyebrow">Chronological register</span><h2>Upcoming renewals</h2></div><Link href="/calendar">Full calendar <Icon>arrow_forward</Icon></Link></div>
              {upcoming.length ? <div className="dashboard-renewal-list">{upcoming.slice(0, 6).map(({ subscription, date }) => {
                const remaining = daysUntil(today, date);
                return <article className={subscription.status === "needs_review" || remaining <= 1 ? "dashboard-renewal dashboard-renewal-alert" : "dashboard-renewal"} key={subscription.id}>
                  <span className="dashboard-renewal-date"><strong>{dateLabel(date)}</strong><small>{remaining === 0 ? "Today" : remaining === 1 ? "Tomorrow" : `In ${remaining} days`}</small></span>
                  <span className="dashboard-renewal-vendor"><strong>{subscription.vendor}</strong><small>{subscription.service_details || subscription.category}</small></span>
                  <span className="dashboard-renewal-amount"><strong>{money(subscription.amount, subscription.currency as Currency)}</strong><small>/ {subscription.billing_cycle === "annual" ? "yr" : subscription.billing_cycle === "quarterly" ? "qtr" : "mo"}</small></span>
                  {subscription.status === "needs_review" && <span className="dashboard-review-label">Needs review</span>}
                </article>;
              })}</div> : <div className="dashboard-empty"><Icon>event_available</Icon><strong>No upcoming renewals yet.</strong><span>Add a subscription with a renewal date to see it here.</span></div>}
            </section>

            <section className="dashboard-panel dashboard-category-panel"><div className="dashboard-panel-heading"><div><span className="calendar-eyebrow">Recurring costs</span><h2>Monthly by category</h2></div><span className="dashboard-panel-unit">{currency} / month</span></div>
              {categories.length ? <div className="dashboard-category-list">{categories.map((category) => <div className="dashboard-category" key={category.name}><div><strong>{category.name}</strong><span>{money(category.amount, currency)}</span></div><div className="dashboard-category-track"><span style={{ width: `${category.amount / categoryMax * 100}%` }} /></div></div>)}</div> : <div className="dashboard-empty"><Icon>bar_chart</Icon><strong>No category totals yet.</strong><span>Subscription categories will be summarized here.</span></div>}
              <Link className="dashboard-category-link" href="/reports">See full breakdown <Icon>arrow_forward</Icon></Link>
            </section>
          </div>

          <section className="dashboard-quick-links"><Link href="/subscriptions"><Icon>receipt_long</Icon><span><strong>Manage subscriptions</strong><small>Edit, archive, or add records</small></span><Icon>arrow_forward</Icon></Link><Link href="/reminders"><Icon>notifications</Icon><span><strong>Review reminder deadlines</strong><small>Check upcoming cancellation cutoffs</small></span><Icon>arrow_forward</Icon></Link><Link href="/reports"><Icon>analytics</Icon><span><strong>Open expenditure report</strong><small>Compare cost by category and currency</small></span><Icon>arrow_forward</Icon></Link></section>
          <footer className="calendar-footer"><span><Icon>info</Icon>Currency comparisons use an illustrative benchmark of ₦{FX_RATE.toLocaleString("en-NG")} per $1.</span><span>Updated from your subscription ledger</span></footer>
        </main>
      </div>
    </div>
  );
}
