"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AccountMenu } from "@/components/account/account-menu";
import { signOutAction } from "@/app/actions/auth";
import type { Subscription } from "@/lib/subscriptions/types";
import { useWeekStart } from "@/lib/preferences/currency";

function Icon({ children }: { children: string }) {
  return <span aria-hidden="true" className="material-symbols-outlined">{children}</span>;
}

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(date: Date, amount: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1));
}

function isoDate(year: number, month: number, day: number) {
  const normalized = new Date(Date.UTC(year, month, day));
  return `${normalized.getUTCFullYear()}-${String(normalized.getUTCMonth() + 1).padStart(2, "0")}-${String(normalized.getUTCDate()).padStart(2, "0")}`;
}

function displayDate(value: string, options: Intl.DateTimeFormatOptions = {}) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", timeZone: "UTC", ...options }).format(date);
}

function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${Number(amount || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

type Renewal = { date: string; subscription: Subscription; kind: "renewal" | "cancel_by" };

function monthRenewals(rows: Subscription[], month: Date): Renewal[] {
  const targetYear = month.getUTCFullYear();
  const targetMonth = month.getUTCMonth();
  const targetIndex = targetYear * 12 + targetMonth;
  const result: Renewal[] = [];

  for (const subscription of rows) {
    if (subscription.status === "archived" || !subscription.renewal_date) continue;
    const [year, monthNumber, day] = subscription.renewal_date.slice(0, 10).split("-").map(Number);
    if (!year || !monthNumber || !day) continue;
    const startIndex = year * 12 + monthNumber - 1;
    const cycle = subscription.billing_cycle === "annual" ? 12 : subscription.billing_cycle === "quarterly" ? 3 : 1;
    const renewalValue = subscription.renewal_date.slice(0, 10);
    const cancellationValue = subscription.cancel_by?.slice(0, 10);
    const renewalBase = new Date(`${renewalValue}T00:00:00Z`).getTime();
    const cancellationBase = cancellationValue ? new Date(`${cancellationValue}T00:00:00Z`).getTime() : Number.NaN;
    const cutoffOffsetDays = Number.isFinite(cancellationBase) ? Math.max(0, Math.round((renewalBase - cancellationBase) / 86_400_000)) : null;
    const finalCycleMonth = targetIndex + (cutoffOffsetDays === null ? 0 : Math.ceil(cutoffOffsetDays / 28) + 1);
    for (let cycleMonth = targetIndex; cycleMonth <= finalCycleMonth; cycleMonth += 1) {
      if (cycleMonth < startIndex || (cycleMonth - startIndex) % cycle !== 0) continue;
      const cycleYear = Math.floor(cycleMonth / 12);
      const cycleMonthOfYear = cycleMonth % 12;
      const lastDay = new Date(Date.UTC(cycleYear, cycleMonthOfYear + 1, 0)).getUTCDate();
      const cycleRenewal = isoDate(cycleYear, cycleMonthOfYear, Math.min(day, lastDay));
      if (cycleMonth === targetIndex) result.push({ date: cycleRenewal, subscription, kind: "renewal" });
      if (cutoffOffsetDays !== null) {
        const projectedCutoff = new Date(new Date(`${cycleRenewal}T00:00:00Z`).getTime() - cutoffOffsetDays * 86_400_000);
        if (projectedCutoff.getUTCFullYear() === targetYear && projectedCutoff.getUTCMonth() === targetMonth) {
          result.push({ date: isoDate(projectedCutoff.getUTCFullYear(), projectedCutoff.getUTCMonth(), projectedCutoff.getUTCDate()), subscription, kind: "cancel_by" });
        }
      }
    }
  }

  return result.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind) || a.subscription.vendor.localeCompare(b.subscription.vendor));
}

function Sidebar({ activeCount, accountName }: { activeCount: number; accountName: string }) {
  return (
    <aside className="ledger-sidebar">
      <div>
        <div className="brand-row"><Link className="brand-name" href="/subscriptions">RenewMe</Link><span className="folio-version">FOLIO V2.4</span><span className="sync-dot" title="Account connected" /></div>
        <div className="register-label"><span>Ledger Register</span><span>#04</span></div>
        <nav aria-label="Main navigation" className="sidebar-nav">
          <Link className="nav-link" href="/dashboard"><Icon>dashboard</Icon><span>Dashboard</span></Link>
          <Link className="nav-link" href="/subscriptions"><Icon>receipt_long</Icon><span>Subscriptions</span><span className="nav-count">{activeCount}</span></Link>
          <Link aria-current="page" className="nav-link nav-link-active" href="/calendar"><Icon>calendar_today</Icon><span>Calendar</span></Link>
          <Link className="nav-link" href="/reports"><Icon>analytics</Icon><span>Reports</span></Link>
          <Link className="nav-link" href="/reminders"><Icon>notifications</Icon><span>Reminders</span></Link>
          <Link className="nav-link" href="/settings"><Icon>tune</Icon><span>Settings</span></Link>
        </nav>
      </div>
      <div className="account-card"><div><strong>{accountName}</strong><span>Private ledger <i /> <b>Connected</b></span></div><div className="account-card-actions"><Link aria-label="Settings" className="account-settings-link" href="/settings"><Icon>settings</Icon></Link><form action={signOutAction}><button aria-label="Sign out" className="calendar-signout" type="submit"><Icon>logout</Icon></button></form></div></div>
    </aside>
  );
}

export function RenewalCalendar({ rows, accountName, initialMonth }: { rows: Subscription[]; accountName: string; initialMonth: string }) {
  const [weekStart] = useWeekStart();
  const [month, setMonth] = useState(() => {
    const parsedMonth = new Date(`${initialMonth}-01T00:00:00Z`);
    return Number.isNaN(parsedMonth.getTime()) ? new Date(Date.UTC(2000, 0, 1)) : parsedMonth;
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"month" | "agenda">("month");
  const renewals = useMemo(() => monthRenewals(rows, month), [rows, month]);
  const activeRows = rows.filter((row) => row.status !== "archived");
  const monthStart = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
  const startIndex = weekStart === "sunday" ? 0 : 1;
  const firstWeekday = (monthStart.getUTCDay() - startIndex + 7) % 7;
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const orderedWeekdays = [...weekdays.slice(startIndex), ...weekdays.slice(0, startIndex)];
  const daysInMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
  const previousDays = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((firstWeekday + daysInMonth) / 7) * 7 }, (_, index) => {
    const dayNumber = index - firstWeekday + 1;
    if (dayNumber < 1) return { date: isoDate(month.getUTCFullYear(), month.getUTCMonth() - 1, previousDays + dayNumber), day: previousDays + dayNumber, outside: true };
    if (dayNumber > daysInMonth) return { date: isoDate(month.getUTCFullYear(), month.getUTCMonth() + 1, dayNumber - daysInMonth), day: dayNumber - daysInMonth, outside: true };
    return { date: isoDate(month.getUTCFullYear(), month.getUTCMonth(), dayNumber), day: dayNumber, outside: false };
  });
  const renewalsByDate = new Map<string, Renewal[]>();
  renewals.forEach((renewal) => renewalsByDate.set(renewal.date, [...(renewalsByDate.get(renewal.date) ?? []), renewal]));
  const selectedRenewals = renewals.filter((renewal) => selectedDate ? renewal.date === selectedDate : true);
  const scheduledRenewals = renewals.filter((entry) => entry.kind === "renewal");
  const cancellationCutoffs = renewals.filter((entry) => entry.kind === "cancel_by");
  const summaryUsd = scheduledRenewals.filter((entry) => entry.subscription.currency === "USD").reduce((sum, entry) => sum + entry.subscription.amount, 0);
  const summaryNgn = scheduledRenewals.filter((entry) => entry.subscription.currency === "NGN").reduce((sum, entry) => sum + entry.subscription.amount, 0);
  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(month);

  return (
    <div className="ledger-app calendar-app">
      <Sidebar accountName={accountName} activeCount={activeRows.length} />
      <div className="ledger-main">
        <header className="calendar-topbar"><Link href="/subscriptions"><Icon>menu_book</Icon><span><strong>RenewMe</strong> — Calendar</span></Link><AccountMenu accountName={accountName} authenticated={accountName !== "Preview account"} /></header>
        <nav aria-label="Mobile navigation" className="mobile-nav">
          <Link href="/dashboard"><Icon>dashboard</Icon><span>Home</span></Link><Link href="/subscriptions"><Icon>receipt_long</Icon><span>Ledger</span></Link><Link aria-current="page" href="/calendar"><Icon>calendar_today</Icon><span>Calendar</span></Link><Link href="/reminders"><Icon>notifications</Icon><span>Reminders</span></Link><Link href="/reports"><Icon>analytics</Icon><span>Reports</span></Link><Link href="/settings"><Icon>tune</Icon><span>Settings</span></Link>
        </nav>
        <main className="calendar-content">
          <div className="calendar-kicker"><span>Fiscal folio · Private account</span><span>Calendar view</span></div>
          <div className="calendar-title-row"><div><h1>{monthLabel} Renewal Schedule</h1><p>{scheduledRenewals.length} scheduled {scheduledRenewals.length === 1 ? "charge" : "charges"} · {cancellationCutoffs.length} cancellation {cancellationCutoffs.length === 1 ? "cutoff" : "cutoffs"}</p></div><Link className="button button-primary" href="/subscriptions"><Icon>add</Icon>Add subscription</Link></div>

          <section aria-label="Monthly renewal summary" className="calendar-summary">
            <div><span>Scheduled renewals</span><strong>{scheduledRenewals.length}</strong><small>{scheduledRenewals.length === 1 ? "charge" : "charges"}</small></div>
            <div><span>Cancel-by cutoffs</span><strong>{cancellationCutoffs.length}</strong><small>advance notice dates</small></div>
            <div><span>Needs review</span><strong>{scheduledRenewals.filter((entry) => entry.subscription.status === "needs_review").length}</strong><small>subscription flags</small></div>
            <div><span>Listed charges</span><strong>{money(summaryUsd, "USD")}</strong><small>{money(summaryNgn, "NGN")} recorded in NGN</small></div>
          </section>

          <section aria-label={`${monthLabel} calendar`} className="calendar-grid-card">
            <div className="calendar-grid-heading"><div><Icon>{viewMode === "month" ? "calendar_month" : "view_agenda"}</Icon><span>{monthLabel} {viewMode === "month" ? "calendar" : "agenda"}</span></div><div className="calendar-grid-tools"><div aria-label="Calendar view" className="calendar-view-switch" role="group"><button aria-pressed={viewMode === "month"} onClick={() => setViewMode("month")} type="button"><Icon>calendar_view_month</Icon>Month Grid</button><button aria-pressed={viewMode === "agenda"} onClick={() => { setViewMode("agenda"); setSelectedDate(null); }} type="button"><Icon>view_agenda</Icon>Agenda List</button></div><div className="calendar-month-controls"><button aria-label="Previous month" onClick={() => { setMonth((value) => shiftMonth(value, -1)); setSelectedDate(null); }} type="button"><Icon>chevron_left</Icon></button><button aria-label="Next month" onClick={() => { setMonth((value) => shiftMonth(value, 1)); setSelectedDate(null); }} type="button"><Icon>chevron_right</Icon></button></div></div></div>
            {viewMode === "month" ? <>
            <div className="calendar-weekdays" aria-hidden="true">{orderedWeekdays.map((day) => <span key={day}>{day}</span>)}</div>
            <div className="calendar-days">{cells.map((cell) => {
              const dayRenewals = renewalsByDate.get(cell.date) ?? [];
              const hasReview = dayRenewals.some((entry) => entry.kind === "renewal" && entry.subscription.status === "needs_review");
              const hasCutoff = dayRenewals.some((entry) => entry.kind === "cancel_by");
              const renewalCount = dayRenewals.filter((entry) => entry.kind === "renewal").length;
              const cutoffCount = dayRenewals.filter((entry) => entry.kind === "cancel_by").length;
              const eventSummary = [renewalCount ? `${renewalCount} renewal${renewalCount === 1 ? "" : "s"}` : "", cutoffCount ? `${cutoffCount} cancellation cutoff${cutoffCount === 1 ? "" : "s"}` : ""].filter(Boolean).join(" and ");
              return <button aria-label={`${displayDate(cell.date, { weekday: "long" })}${eventSummary ? `, ${eventSummary}` : ""}`} aria-pressed={selectedDate === cell.date} className={`calendar-day${cell.outside ? " calendar-day-outside" : ""}${dayRenewals.length ? " calendar-day-has-renewal" : ""}${hasReview ? " calendar-day-review" : ""}${hasCutoff ? " calendar-day-has-cutoff" : ""}`} key={cell.date} onClick={() => setSelectedDate(cell.date)} type="button"><span>{cell.day}</span>{dayRenewals.length > 0 && <i aria-hidden="true" />}</button>;
            })}</div>
            <div className="calendar-legend"><span><i className="legend-dot" /> Scheduled renewal</span><span><i className="legend-dot legend-dot-cutoff" /> Cancellation cutoff</span><span><i className="legend-dot legend-dot-review" /> Needs review</span></div>
            </> : renewals.length ? <div className="calendar-agenda-list">{renewals.map(({ date, subscription, kind }) => <article className={`calendar-agenda-item${kind === "cancel_by" ? " calendar-agenda-item-cutoff" : subscription.status === "needs_review" ? " calendar-agenda-item-review" : ""}`} key={`${date}-${subscription.id}-${kind}`}><time dateTime={date}>{displayDate(date, { weekday: "short", day: "2-digit", month: "short" })}<small>{kind === "cancel_by" ? "Cancel by" : "Renewal"}</small></time><div><strong>{subscription.vendor}</strong><span>{subscription.service_details || subscription.category}</span></div><b>{money(subscription.amount, subscription.currency)}<small> / {subscription.billing_cycle === "annual" ? "yr" : subscription.billing_cycle === "quarterly" ? "qtr" : "mo"}</small></b></article>)}</div> : <div className="calendar-empty"><Icon>event_available</Icon><strong>No upcoming renewals.</strong><span>There are no renewals scheduled for this month.</span><Link className="button button-primary" href="/subscriptions"><Icon>add</Icon>Add subscription</Link></div>}
          </section>

          {viewMode === "month" && <section className="calendar-register" aria-label="Renewal register">
            <div className="calendar-register-heading"><div><span className="calendar-eyebrow">Chronological register</span><h2>{selectedDate ? `Schedule on ${displayDate(selectedDate, { weekday: "short" })}` : `${monthLabel} schedule`}</h2></div>{selectedDate && <button className="calendar-clear-selection" onClick={() => setSelectedDate(null)} type="button">Show all dates</button>}</div>
            {selectedRenewals.length ? <div className="calendar-renewal-list">{selectedRenewals.map(({ date, subscription, kind }) => <article className={`${subscription.status === "needs_review" && kind === "renewal" ? "calendar-renewal calendar-renewal-review" : "calendar-renewal"}${kind === "cancel_by" ? " calendar-renewal-cutoff" : ""}`} key={`${date}-${subscription.id}-${kind}`}>
              <div className="calendar-renewal-bar"><strong>{displayDate(date, { weekday: "short" })}</strong><span>{kind === "cancel_by" ? "Cancellation cutoff" : subscription.status === "needs_review" ? "Needs review" : subscription.status === "trial" ? "Trial renewal" : "Scheduled renewal"}</span></div>
              <div className="calendar-renewal-main"><div><h3>{subscription.vendor}</h3>{subscription.service_details && <p>{subscription.service_details}</p>}</div><strong>{money(subscription.amount, subscription.currency)}<small> / {subscription.billing_cycle === "annual" ? "yr" : subscription.billing_cycle === "quarterly" ? "qtr" : "mo"}</small></strong></div>
              <div className="calendar-renewal-foot"><span><Icon>{kind === "cancel_by" ? "event_busy" : "credit_card"}</Icon>{kind === "cancel_by" ? "Cancellation deadline" : subscription.payment_instrument || "Payment method not recorded"}</span>{kind === "renewal" && subscription.cancel_by && <span>Cancel by {displayDate(subscription.cancel_by)}</span>}</div>
            </article>)}</div> : <div className="calendar-empty"><Icon>event_available</Icon><strong>{selectedDate ? "No renewals on this date." : "No renewals scheduled this month."}</strong><span>Try another month or add a subscription with a renewal date.</span>{selectedDate && <button onClick={() => setSelectedDate(null)} type="button">Show all dates</button>}</div>}
          </section>}
          <footer className="calendar-footer"><span><Icon>info</Icon>Recurring dates are projected from each subscription’s next renewal and billing cycle.</span><span>{rows.length} records in ledger</span></footer>
        </main>
      </div>
    </div>
  );
}
