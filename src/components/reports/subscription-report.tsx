"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AccountMenu } from "@/components/account/account-menu";
import { signOutAction } from "@/app/actions/auth";
import { useDisplayCurrency, useUsdNgnRate } from "@/lib/preferences/currency";
import type { Subscription } from "@/lib/subscriptions/types";

type ReportCurrency = "USD" | "NGN";

function Icon({ children }: { children: string }) {
  return <span aria-hidden="true" className="material-symbols-outlined">{children}</span>;
}

function annualized(row: Subscription) {
  return row.amount * (row.billing_cycle === "annual" ? 1 : row.billing_cycle === "quarterly" ? 4 : 12);
}

function shiftIsoDate(value: string, dayOffset: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + dayOffset));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function monthlyOccurrence(anchor: string, monthOffset: number) {
  const [year, month, day] = anchor.split("-").map(Number);
  const monthStart = new Date(Date.UTC(year, month - 1 + monthOffset, 1));
  const lastDay = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)).getUTCDate();
  const date = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), Math.min(day, lastDay)));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function forecastMonths(rows: Subscription[], today: string, toBase: (amount: number, currency: string) => number) {
  const endDate = shiftIsoDate(today, 89);
  const [startYear, startMonth] = today.split("-").map(Number);
  const [endYear, endMonth] = endDate.split("-").map(Number);
  const months: { key: string; label: string; range: string; total: number; renewals: Subscription[]; reviews: Subscription[]; largest?: Subscription }[] = [];
  let year = startYear;
  let month = startMonth;
  while (year < endYear || (year === endYear && month <= endMonth)) {
    const monthKey = `${year}-${String(month).padStart(2, "0")}`;
    const monthStart = `${monthKey}-01`;
    const monthLastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const firstDay = monthKey === today.slice(0, 7) ? today : monthStart;
    const lastDay = monthKey === endDate.slice(0, 7) ? endDate : `${monthKey}-${String(monthLastDay).padStart(2, "0")}`;
    const label = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${monthStart}T00:00:00Z`));
    months.push({ key: monthKey, label, range: `${displayDate(firstDay)} – ${displayDate(lastDay)}`, total: 0, renewals: [], reviews: [] });
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }

  for (const row of rows) {
    if (row.status === "archived") continue;
    const anchor = row.renewal_date.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor)) continue;
    const [anchorYear, anchorMonth] = anchor.split("-").map(Number);
    const [todayYear, todayMonth] = today.split("-").map(Number);
    const monthStep = row.billing_cycle === "annual" ? 12 : row.billing_cycle === "quarterly" ? 3 : 1;
    const monthDifference = (todayYear - anchorYear) * 12 + todayMonth - anchorMonth;
    let offset = monthDifference > 0 ? Math.floor(monthDifference / monthStep) * monthStep : 0;
    let dueDate = monthlyOccurrence(anchor, offset);
    while (dueDate < today) { offset += monthStep; dueDate = monthlyOccurrence(anchor, offset); }
    while (dueDate <= endDate) {
      const bucket = months.find((entry) => entry.key === dueDate.slice(0, 7));
      if (bucket) {
        bucket.total += toBase(row.amount, row.currency);
        bucket.renewals.push(row);
        if (row.status === "needs_review") bucket.reviews.push(row);
        if (!bucket.largest || toBase(row.amount, row.currency) > toBase(bucket.largest.amount, bucket.largest.currency)) bucket.largest = row;
      }
      offset += monthStep;
      dueDate = monthlyOccurrence(anchor, offset);
    }
  }
  return { months, endDate, total: months.reduce((sum, entry) => sum + entry.total, 0), count: months.reduce((sum, entry) => sum + entry.renewals.length, 0) };
}

function asCurrency(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

function quote(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function downloadCsv(rows: Subscription[], currency: ReportCurrency, FX_RATE: number) {
  const header = ["Vendor", "Service details", "Category", "Billing cycle", "Amount", "Currency", "Annualized estimate", "Report currency", "Renewal date", "Status"];
  const csvRows = rows.filter((row) => row.status !== "archived").map((row) => {
    const converted = currency === "NGN" ? (row.currency === "NGN" ? annualized(row) : annualized(row) * FX_RATE) : (row.currency === "USD" ? annualized(row) : annualized(row) / FX_RATE);
    return [row.vendor, row.service_details, row.category, row.billing_cycle, row.amount, row.currency, converted.toFixed(2), currency, row.renewal_date, row.status];
  });
  const blob = new Blob([[header, ...csvRows].map((line) => line.map(quote).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `renewme-report-${currency.toLowerCase()}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function Sidebar({ count, accountName }: { count: number; accountName: string }) {
  return (
    <aside className="ledger-sidebar">
      <div>
        <div className="brand-row"><Link className="brand-name" href="/subscriptions">RenewMe</Link><span className="folio-version">FOLIO V2.4</span><span className="sync-dot" title="Account connected" /></div>
        <div className="register-label"><span>Ledger Register</span><span>#04</span></div>
        <nav aria-label="Main navigation" className="sidebar-nav">
          <Link className="nav-link" href="/dashboard"><Icon>dashboard</Icon><span>Dashboard</span></Link>
          <Link className="nav-link" href="/subscriptions"><Icon>receipt_long</Icon><span>Subscriptions</span><span className="nav-count">{count}</span></Link>
          <Link className="nav-link" href="/calendar"><Icon>calendar_today</Icon><span>Calendar</span></Link>
          <Link aria-current="page" className="nav-link nav-link-active" href="/reports"><Icon>analytics</Icon><span>Reports</span></Link>
          <Link className="nav-link" href="/reminders"><Icon>notifications</Icon><span>Reminders</span></Link>
          <Link className="nav-link" href="/settings"><Icon>tune</Icon><span>Settings</span></Link>
        </nav>
      </div>
      <div className="account-card"><div><strong>{accountName}</strong><span>Private ledger <i /> <b>Connected</b></span></div><div className="account-card-actions"><Link aria-label="Settings" className="account-settings-link" href="/settings"><Icon>settings</Icon></Link><form action={signOutAction}><button aria-label="Sign out" className="calendar-signout" type="submit"><Icon>logout</Icon></button></form></div></div>
    </aside>
  );
}

export function SubscriptionReport({ rows, accountName, today, preview = false, error }: { rows: Subscription[]; accountName: string; today: string; preview?: boolean; error?: string }) {
  const [baseCurrency, setBaseCurrency] = useDisplayCurrency("NGN");
  const [FX_RATE] = useUsdNgnRate();
  const currentRows = useMemo(() => rows.filter((row) => row.status !== "archived"), [rows]);
  const toBase = (amount: number, currency: string) => baseCurrency === "NGN"
    ? (currency === "NGN" ? amount : amount * FX_RATE)
    : (currency === "USD" ? amount : amount / FX_RATE);

  const annualTotal = currentRows.reduce((sum, row) => sum + toBase(annualized(row), row.currency), 0);
  const annualUsd = currentRows.filter((row) => row.currency === "USD").reduce((sum, row) => sum + annualized(row), 0);
  const annualNgn = currentRows.filter((row) => row.currency === "NGN").reduce((sum, row) => sum + annualized(row), 0);
  const annualUsdInNgn = annualUsd * FX_RATE;
  const totalNgnEquivalent = annualUsdInNgn + annualNgn;
  const usdExposure = totalNgnEquivalent ? annualUsdInNgn / totalNgnEquivalent * 100 : 0;

  const categories = useMemo(() => {
    const grouped = new Map<string, number>();
    currentRows.forEach((row) => grouped.set(row.category || "Other", (grouped.get(row.category || "Other") ?? 0) + toBase(annualized(row), row.currency)));
    return [...grouped.entries()].map(([name, value]) => ({ name, value, share: annualTotal ? value / annualTotal * 100 : 0 })).sort((a, b) => b.value - a.value);
  }, [annualTotal, baseCurrency, currentRows]);

  const topOutflows = [...currentRows].sort((a, b) => toBase(annualized(b), b.currency) - toBase(annualized(a), a.currency)).slice(0, 5);
  const settlementRows = currentRows
    .filter((row) => row.currency === "USD" && row.actual_ngn_amount != null)
    .map((row) => {
      const referenceNgn = row.amount * FX_RATE;
      const varianceNgn = (row.actual_ngn_amount ?? 0) - referenceNgn;
      return { row, referenceNgn, varianceNgn, variancePercent: referenceNgn ? varianceNgn / referenceNgn * 100 : 0 };
    });
  const forecast = useMemo(() => forecastMonths(currentRows, today, toBase), [currentRows, today, baseCurrency, FX_RATE]);
  const monthLabel = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${today.slice(0, 7)}-01T00:00:00Z`));

  return (
    <div className="ledger-app report-app">
      <Sidebar accountName={accountName} count={currentRows.length} />
      <div className="ledger-main">
        <header className="calendar-topbar"><Link href="/subscriptions"><Icon>menu_book</Icon><span><strong>RenewMe</strong> — Reports</span></Link><AccountMenu accountName={accountName} authenticated={!preview} /></header>
        <nav aria-label="Mobile navigation" className="mobile-nav">
          <Link href="/dashboard"><Icon>dashboard</Icon><span>Home</span></Link><Link href="/subscriptions"><Icon>receipt_long</Icon><span>Ledger</span></Link><Link href="/calendar"><Icon>calendar_today</Icon><span>Calendar</span></Link><Link href="/reminders"><Icon>notifications</Icon><span>Reminders</span></Link><Link aria-current="page" href="/reports"><Icon>analytics</Icon><span>Reports</span></Link><Link href="/settings"><Icon>tune</Icon><span>Settings</span></Link>
        </nav>
        <main className="report-content">
          <div className="report-heading">
            <div><div className="calendar-kicker"><span>Folio audit report · Live ledger</span><span>{preview ? "Preview data" : "Account data"}</span></div><h1>Expenditure &amp; Currency Ledger</h1><p>Annualized cost, spending categories, and currency exposure from your non-archived subscriptions.</p></div>
            <div className="report-actions"><label>Report currency<select aria-label="Report currency" onChange={(event) => setBaseCurrency(event.target.value as ReportCurrency)} value={baseCurrency}><option value="NGN">₦ Naira</option><option value="USD">$ US dollars</option></select></label><button className="button button-secondary" onClick={() => window.print()} type="button"><Icon>picture_as_pdf</Icon>Print / Save PDF</button><button className="button button-primary" onClick={() => downloadCsv(currentRows, baseCurrency, FX_RATE)} type="button"><Icon>table_view</Icon>Export CSV</button></div>
          </div>
          {error && <p className="notice notice-error" role="alert">{error}</p>}
          {preview && <div className="preview-banner"><Icon>visibility</Icon><span><strong>Design preview</strong> · Sample ledger data is shown. Sign in with Supabase to report on your own subscriptions.</span></div>}

          <section aria-label="Annual report summary" className="report-metrics">
            <article><span>Annualized commitment</span><strong>{asCurrency(annualTotal, baseCurrency)}</strong><small>{asCurrency(annualTotal, baseCurrency)} estimated across 12 months</small><i /></article>
            <article><span>Average monthly run-rate</span><strong>{asCurrency(annualTotal / 12, baseCurrency)}</strong><small>Annualized amounts divided by 12</small></article>
            <article><span>Active commitments</span><strong>{currentRows.length}</strong><small>{currentRows.filter((row) => row.status === "needs_review").length} flagged for review</small></article>
            <article><span>USD exposure</span><strong className="report-risk">{usdExposure.toFixed(1)}%</strong><small>Estimated share of combined outflow</small></article>
          </section>

          <section aria-label="Subscription charge forecast for the next 90 days" className="report-panel report-forecast-panel">
            <div className="report-panel-heading"><div><span className="report-forecast-kicker">Forward horizon · Schedule D</span><h2><Icon>event_available</Icon>90-day liquidity forecast</h2></div><span>{displayDate(today)} – {displayDate(forecast.endDate)}</span></div>
            <div className="report-forecast-total"><span>Scheduled renewals · {forecast.count} charges</span><strong>{asCurrency(forecast.total, baseCurrency)}</strong><small>Projected across the next 90 days · {baseCurrency}</small></div>
            <div className="report-forecast-months">{forecast.months.map((month) => {
              const alternateCurrency: ReportCurrency = baseCurrency === "NGN" ? "USD" : "NGN";
              const alternateTotal = baseCurrency === "NGN" ? month.total / FX_RATE : month.total * FX_RATE;
              return <article className="report-forecast-month" key={month.key}>
                <div className="report-forecast-month-heading"><strong>{month.label}</strong><span>{month.renewals.length} {month.renewals.length === 1 ? "renewal" : "renewals"}</span></div>
                <strong className="report-forecast-amount">{asCurrency(month.total, baseCurrency)}</strong>
                <small className="report-forecast-alternate">≈ {asCurrency(alternateTotal, alternateCurrency)}</small>
                <div className="report-forecast-facts"><div><span>Contract reviews</span><strong className={month.reviews.length ? "report-forecast-alert" : ""}>{month.reviews.length ? month.reviews.map((row) => row.vendor).join(", ") : "None scheduled"}</strong></div><div><span>Largest bill</span><strong>{month.largest ? `${month.largest.vendor} · ${asCurrency(month.largest.amount, month.largest.currency)}` : "No renewals"}</strong></div><div><span>Annual renewals</span><strong>{month.renewals.filter((row) => row.billing_cycle === "annual").length}</strong></div></div>
                <small className="report-forecast-range">{month.range}</small>
              </article>;
            })}</div>
            <p className="report-forecast-note"><Icon>info</Icon>Projection uses each saved renewal date and billing cycle. Currency conversion uses the illustrative {baseCurrency === "NGN" ? `₦${FX_RATE.toLocaleString("en-NG")} per $1` : `$1 = ₦${FX_RATE.toLocaleString("en-NG")}`} benchmark; actual charges may differ.</p>
          </section>

          <section aria-label="NGN settlement reconciliation" className="report-panel report-top-panel">
            <div className="report-panel-heading"><div><span className="report-forecast-kicker">Recorded charge comparison</span><h2><Icon>compare_arrows</Icon>USD settlement reconciliation</h2></div><span>{settlementRows.length} {settlementRows.length === 1 ? "record" : "records"}</span></div>
            {settlementRows.length ? <div className="report-table-wrap"><table className="report-table"><thead><tr><th>Service</th><th>Contract amount</th><th>Reference estimate · NGN</th><th>Actual charge · NGN</th><th>Variance</th></tr></thead><tbody>{settlementRows.map(({ row, referenceNgn, varianceNgn, variancePercent }) => <tr key={row.id}><td><strong>{row.vendor}</strong><small>{row.billing_cycle} charge</small></td><td>{asCurrency(row.amount, "USD")}</td><td>{asCurrency(referenceNgn, "NGN")}</td><td><strong>{asCurrency(row.actual_ngn_amount ?? 0, "NGN")}</strong></td><td><span className={varianceNgn > 0 ? "report-variance report-variance-high" : "report-variance"}>{varianceNgn > 0 ? "+" : ""}{asCurrency(varianceNgn, "NGN")} ({variancePercent > 0 ? "+" : ""}{variancePercent.toFixed(1)}%)</span></td></tr>)}</tbody></table></div> : <p className="report-empty">Add a recorded actual NGN charge to a USD subscription to compare it with the current FX reference. <Link href="/subscriptions">Update subscription details</Link></p>}
            <p className="report-forecast-note"><Icon>info</Icon>Each actual is the charge recorded on that subscription. The reference uses the current illustrative rate of ₦{FX_RATE.toLocaleString("en-NG")} per $1; card and bank settlement rates can differ. This comparison does not change forecast totals.</p>
          </section>

          <div className="report-detail-grid">
            <section className="report-panel report-currency-panel">
              <div className="report-panel-heading"><h2><Icon>currency_exchange</Icon>Currency distribution</h2><span>Annualized · {baseCurrency}</span></div>
              <div className="report-currency-row"><div><i className="currency-swatch swatch-usd" /><span><strong>USD commitments</strong><small>{currentRows.filter((row) => row.currency === "USD").length} services</small></span></div><strong>{asCurrency(annualUsd, "USD")}<small> / yr</small></strong></div>
              <div className="report-currency-row"><div><i className="currency-swatch swatch-ngn" /><span><strong>NGN commitments</strong><small>{currentRows.filter((row) => row.currency === "NGN").length} services</small></span></div><strong>{asCurrency(annualNgn, "NGN")}<small> / yr</small></strong></div>
              <div className="report-currency-bar" aria-label={`${usdExposure.toFixed(1)} percent USD and ${(100 - usdExposure).toFixed(1)} percent NGN exposure`}><span style={{ width: `${usdExposure}%` }} /><span style={{ width: `${100 - usdExposure}%` }} /></div>
              <div className="report-currency-legend"><span>USD {usdExposure.toFixed(1)}%</span><span>NGN {(100 - usdExposure).toFixed(1)}%</span></div>
              <p className="report-fx-note"><Icon>info</Icon>USD comparisons use an illustrative benchmark of ₦{FX_RATE.toLocaleString("en-NG")} per $1. Actual settlement rates may differ.</p>
            </section>

            <section className="report-panel">
              <div className="report-panel-heading"><h2><Icon>pie_chart</Icon>Spend by category</h2><span>Annualized</span></div>
              {categories.length ? <div className="report-category-list">{categories.map((category) => <div className="report-category" key={category.name}><div><strong>{category.name}</strong><span>{category.share.toFixed(1)}% share</span></div><b>{asCurrency(category.value, baseCurrency)}</b><div className="report-progress"><span style={{ width: `${category.share}%` }} /></div></div>)}</div> : <p className="report-empty">Add subscriptions to see category totals.</p>}
              <p className="report-total-line"><span>Total annualized outflow</span><strong>{asCurrency(annualTotal, baseCurrency)}</strong></p>
            </section>
          </div>

          <section className="report-panel report-top-panel">
            <div className="report-panel-heading"><h2><Icon>format_list_numbered</Icon>Top annualized outflows</h2><span>{topOutflows.length} {topOutflows.length === 1 ? "record" : "records"}</span></div>
            {topOutflows.length ? <div className="report-table-wrap"><table className="report-table"><thead><tr><th>Rank</th><th>Service / category</th><th>Cycle</th><th>Recorded amount</th><th>Annualized estimate · {baseCurrency}</th><th>Status</th></tr></thead><tbody>{topOutflows.map((row, index) => <tr key={row.id}><td>#{String(index + 1).padStart(2, "0")}</td><td><strong>{row.vendor}</strong><small>{row.category}</small></td><td>{row.billing_cycle}</td><td>{asCurrency(row.amount, row.currency)} / {row.billing_cycle === "annual" ? "yr" : row.billing_cycle === "quarterly" ? "qtr" : "mo"}</td><td><strong>{asCurrency(toBase(annualized(row), row.currency), baseCurrency)}</strong></td><td><span className={`report-status report-status-${row.status}`}>{row.status === "needs_review" ? "Needs review" : row.status}</span></td></tr>)}</tbody></table></div> : <p className="report-empty">No non-archived subscriptions to report yet.</p>}
            <div className="report-reconciliation"><span><Icon>verified</Icon>Based on {currentRows.length} non-archived ledger records</span><span>Report period: {monthLabel} · 12-month annualized view</span></div>
          </section>
          <footer className="calendar-footer"><span><Icon>info</Icon>Annualized figures project the saved billing cycle forward; they are estimates, not posted transactions.</span><Link href="/subscriptions">Review subscription records</Link></footer>
        </main>
      </div>
    </div>
  );
}
