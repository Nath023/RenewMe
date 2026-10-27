"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AccountMenu } from "@/components/account/account-menu";
import { signOutAction } from "@/app/actions/auth";
import type { Subscription } from "@/lib/subscriptions/types";
import { useReminderHorizon } from "@/lib/preferences/currency";

type Deadline = {
  subscription: Subscription;
  date: string;
  daysUntil: number;
  kind: "Cancellation cutoff" | "Renewal date";
};

type ReminderDelivery = {
  id: string;
  subscription_id: string | null;
  reminder_type: string;
  due_date: string;
  status: string;
  attempt_count: number;
  last_attempt_at: string | null;
  sent_at: string | null;
  created_at: string;
};

function Icon({ children }: { children: string }) {
  return <span aria-hidden="true" className="material-symbols-outlined">{children}</span>;
}

function isoDay(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDay(date);
}

function shiftCycle(value: string, months: number) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const targetMonth = month - 1 + months;
  const lastDay = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate();
  return isoDay(new Date(Date.UTC(year, targetMonth, Math.min(day, lastDay))));
}

function nextRenewal(row: Subscription, today: string) {
  const monthStep = row.billing_cycle === "annual" ? 12 : row.billing_cycle === "quarterly" ? 3 : 1;
  let candidate = row.renewal_date.slice(0, 10);
  for (let count = 0; candidate < today && count < 240; count += 1) candidate = shiftCycle(candidate, monthStep);
  return candidate;
}

function daysBetween(from: string, to: string) {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function deliveryLabel(type: string) {
  const deadline = type.startsWith("cancellation") ? "Cancellation cutoff" : "Renewal";
  const timing = type.endsWith("7_days") ? "7-day reminder" : "1-day reminder";
  return `${deadline} · ${timing}`;
}

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${Number(amount || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

function calendarText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function downloadCalendar(deadlines: Deadline[]) {
  const upcoming = deadlines.filter((deadline) => deadline.daysUntil >= 0);
  if (!upcoming.length) return;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const events = upcoming.map(({ subscription, date, kind }) => {
    const endDate = addDays(date, 1).replace(/-/g, "");
    const startDate = date.replace(/-/g, "");
    const summary = `${kind}: ${subscription.vendor}`;
    const description = `${kind} for ${subscription.vendor}. ${formatMoney(subscription.amount, subscription.currency)} per ${subscription.billing_cycle} subscription.`;
    return [
      "BEGIN:VEVENT",
      `UID:${subscription.id}-${date}-${kind.toLowerCase().replace(/\s/g, "-")}@renewme`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${startDate}`,
      `DTEND;VALUE=DATE:${endDate}`,
      `SUMMARY:${calendarText(summary)}`,
      `DESCRIPTION:${calendarText(description)}`,
      "END:VEVENT",
    ].join("\r\n");
  });
  const content = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//RenewMe//Subscription Reminders//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", ...events, "END:VCALENDAR"].join("\r\n");
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "renewme-reminders.ics";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Sidebar({ accountName, count }: { accountName: string; count: number }) {
  return (
    <aside className="ledger-sidebar">
      <div>
        <div className="brand-row"><Link className="brand-name" href="/subscriptions">RenewMe</Link><span className="folio-version">FOLIO V2.4</span><span className="sync-dot" title="Account connected" /></div>
        <div className="register-label"><span>Ledger Register</span><span>#04</span></div>
        <nav aria-label="Main navigation" className="sidebar-nav">
          <Link className="nav-link" href="/dashboard"><Icon>dashboard</Icon><span>Dashboard</span></Link>
          <Link className="nav-link" href="/subscriptions"><Icon>receipt_long</Icon><span>Subscriptions</span><span className="nav-count">{count}</span></Link>
          <Link className="nav-link" href="/calendar"><Icon>calendar_today</Icon><span>Calendar</span></Link>
          <Link className="nav-link" href="/reports"><Icon>analytics</Icon><span>Reports</span></Link>
          <Link aria-current="page" className="nav-link nav-link-active" href="/reminders"><Icon>notifications</Icon><span>Reminders</span></Link>
          <Link className="nav-link" href="/settings"><Icon>tune</Icon><span>Settings</span></Link>
        </nav>
      </div>
      <div className="account-card"><div><strong>{accountName}</strong><span>Private ledger <i /> <b>Connected</b></span></div><div className="account-card-actions"><Link aria-label="Settings" className="account-settings-link" href="/settings"><Icon>settings</Icon></Link><form action={signOutAction}><button aria-label="Sign out" className="calendar-signout" type="submit"><Icon>logout</Icon></button></form></div></div>
    </aside>
  );
}

export function ReminderCenter({ rows, accountName, today, preview = false, error, deliveryError, deliveries = [] }: { rows: Subscription[]; accountName: string; today: string; preview?: boolean; error?: string; deliveryError?: string; deliveries?: ReminderDelivery[] }) {
  const [filter, setFilter] = useState<"upcoming" | "seven_days" | "review" | "overdue">("upcoming");
  const [horizon] = useReminderHorizon();
  const activeRows = useMemo(() => rows.filter((row) => row.status !== "archived"), [rows]);
  const deadlines = useMemo(() => activeRows.map((subscription): Deadline => {
    const renewal = nextRenewal(subscription, today);
    const originalRenewal = subscription.renewal_date.slice(0, 10);
    const originalCutoff = subscription.cancel_by?.slice(0, 10);
    const noticeOffset = originalCutoff ? Math.max(0, daysBetween(originalCutoff, originalRenewal)) : 0;
    const date = originalCutoff ? addDays(renewal, -noticeOffset) : renewal;
    return { subscription, date, daysUntil: daysBetween(today, date), kind: originalCutoff ? "Cancellation cutoff" : "Renewal date" };
  }).sort((a, b) => a.date.localeCompare(b.date) || a.subscription.vendor.localeCompare(b.subscription.vendor)), [activeRows, today]);
  const overdueCount = deadlines.filter((deadline) => deadline.daysUntil < 0).length;
  const upcomingCount = deadlines.filter((deadline) => deadline.daysUntil >= 0 && deadline.daysUntil <= horizon).length;
  const reviewCount = deadlines.filter((deadline) => deadline.subscription.status === "needs_review" && deadline.daysUntil <= horizon).length;
  const shown = deadlines.filter((deadline) => {
    if (filter === "overdue") return deadline.daysUntil < 0;
    if (filter === "review") return deadline.subscription.status === "needs_review" && deadline.daysUntil <= horizon;
    if (filter === "seven_days") return deadline.daysUntil >= 0 && deadline.daysUntil <= 7;
    return deadline.daysUntil >= 0 && deadline.daysUntil <= horizon;
  });

  return (
    <div className="ledger-app reminders-app">
      <Sidebar accountName={accountName} count={activeRows.length} />
      <div className="ledger-main">
        <header className="calendar-topbar"><Link href="/subscriptions"><Icon>menu_book</Icon><span><strong>RenewMe</strong> — Reminders</span></Link><AccountMenu accountName={accountName} authenticated={!preview} /></header>
        <nav aria-label="Mobile navigation" className="mobile-nav">
          <Link href="/dashboard"><Icon>dashboard</Icon><span>Home</span></Link><Link href="/subscriptions"><Icon>receipt_long</Icon><span>Ledger</span></Link><Link href="/calendar"><Icon>calendar_today</Icon><span>Calendar</span></Link><Link aria-current="page" href="/reminders"><Icon>notifications</Icon><span>Reminders</span></Link><Link href="/reports"><Icon>analytics</Icon><span>Reports</span></Link><Link href="/settings"><Icon>tune</Icon><span>Settings</span></Link>
        </nav>
        <main className="reminders-content">
          <div className="calendar-kicker"><span>Folio workspace · Deadlines &amp; notices</span><span>{preview ? "Preview data" : "Live ledger"}</span></div>
          <div className="reminders-heading"><div><h1>Reminders &amp; Renewal Deadlines</h1><p>Upcoming cancellation cutoffs and renewal dates from your subscription ledger.</p></div><Link className="button button-primary" href="/subscriptions"><Icon>add</Icon>Record subscription</Link></div>
          {error && <p className="notice notice-error" role="alert">{error}</p>}
          {preview && <div className="preview-banner"><Icon>visibility</Icon><span><strong>Design preview</strong> · Example records are shown until this app is connected to Supabase.</span></div>}

          <div className="reminders-notice"><Icon>info</Icon><span>Upcoming deadlines are shown from your ledger. Email reminders are controlled in Settings; this page records recent email delivery status.</span><Link href="/settings">Manage email reminders</Link></div>

          <section aria-label="Reminder summary" className="reminder-metrics">
            <article><span>Upcoming · {horizon} days</span><strong>{upcomingCount}</strong><small>cancellation or renewal dates</small></article>
            <article className={reviewCount ? "reminder-metric-warn" : ""}><span>Needs review</span><strong>{reviewCount}</strong><small>flagged subscription records</small></article>
            <article className={overdueCount ? "reminder-metric-overdue" : ""}><span>Past deadline</span><strong>{overdueCount}</strong><small>check or update these records</small></article>
          </section>

          <section aria-label="Upcoming deadlines" className="reminders-panel">
            <div className="reminders-panel-heading"><div><span className="calendar-eyebrow">Deadline register</span><h2>Subscription notice schedule</h2></div><button className="button button-primary reminder-calendar-export" disabled={!deadlines.some((deadline) => deadline.daysUntil >= 0)} onClick={() => downloadCalendar(deadlines)} type="button"><Icon>event</Icon>Export to calendar</button></div>
            <div aria-label="Filter reminders" className="reminder-filters" role="group">
              <button aria-pressed={filter === "upcoming"} onClick={() => setFilter("upcoming")} type="button">Next {horizon} days <small>{upcomingCount}</small></button>
              <button aria-pressed={filter === "seven_days"} onClick={() => setFilter("seven_days")} type="button">Next 7 days <small>{deadlines.filter((deadline) => deadline.daysUntil >= 0 && deadline.daysUntil <= 7).length}</small></button>
              <button aria-pressed={filter === "review"} onClick={() => setFilter("review")} type="button">Needs review <small>{reviewCount}</small></button>
              <button aria-pressed={filter === "overdue"} onClick={() => setFilter("overdue")} type="button">Past deadline <small>{overdueCount}</small></button>
            </div>
            {shown.length ? <div className="reminder-list">{shown.map((deadline) => {
              const urgency = deadline.daysUntil < 0 ? "overdue" : deadline.daysUntil <= 1 ? "critical" : deadline.daysUntil <= 7 ? "soon" : "normal";
              const when = deadline.daysUntil < 0 ? `${Math.abs(deadline.daysUntil)} days past` : deadline.daysUntil === 0 ? "Today" : deadline.daysUntil === 1 ? "Tomorrow" : `In ${deadline.daysUntil} days`;
              return <article className={`reminder-row reminder-row-${urgency}`} key={deadline.subscription.id}>
                <div className="reminder-date"><strong>{formatDate(deadline.date)}</strong><span>{when}</span></div>
                <div className="reminder-service"><h3>{deadline.subscription.vendor}</h3><p>{deadline.subscription.service_details || deadline.subscription.category}</p></div>
                <div className="reminder-cost"><strong>{formatMoney(deadline.subscription.amount, deadline.subscription.currency)}</strong><span>/ {deadline.subscription.billing_cycle === "annual" ? "yr" : deadline.subscription.billing_cycle === "quarterly" ? "qtr" : "mo"}</span></div>
                <div className="reminder-meta"><span className={`reminder-kind reminder-kind-${urgency}`}>{deadline.kind}</span><span className={`reminder-status reminder-status-${deadline.subscription.status}`}>{deadline.subscription.status === "needs_review" ? "Needs review" : deadline.subscription.status === "trial" ? "Trial" : "Active"}</span></div>
                <Link className="reminder-open-link" href="/subscriptions">Open ledger <Icon>arrow_forward</Icon></Link>
              </article>;
            })}</div> : <div className="reminders-empty"><Icon>{activeRows.length ? "event_available" : "notifications_off"}</Icon><strong>{activeRows.length ? "No deadlines match this view." : "No active subscriptions yet."}</strong><span>{activeRows.length ? "Try another filter or check the calendar for later renewal dates." : "Add a subscription and its renewal dates will appear here."}</span><Link href="/subscriptions">Go to subscriptions</Link></div>}
          </section>

          <section aria-label="Email delivery history" className="reminders-panel email-history-panel">
            <div className="reminders-panel-heading"><div><span className="calendar-eyebrow">Email register</span><h2>Recent delivery history</h2></div><span className="delivery-history-count">Latest {deliveries.length} of 20</span></div>
            {deliveryError && <p className="notice notice-error delivery-history-notice" role="alert">{deliveryError}</p>}
            {!deliveryError && deliveries.length > 0 ? <div className="delivery-history-list">{deliveries.map((delivery) => {
              const vendor = rows.find((row) => row.id === delivery.subscription_id)?.vendor ?? "Saved subscription";
              const status = delivery.status === "sent" ? "Sent" : delivery.status === "failed" ? "Failed" : delivery.status === "processing" ? "Sending" : "Queued";
              const statusClass = delivery.status === "sent" ? "sent" : delivery.status === "failed" ? "failed" : "pending";
              const resultTime = delivery.sent_at ?? delivery.last_attempt_at ?? delivery.created_at;
              return <article className="delivery-history-row" key={delivery.id}>
                <div className="delivery-history-service"><strong>{vendor}</strong><span>{deliveryLabel(delivery.reminder_type)}</span></div>
                <div className="delivery-history-date"><small>Deadline</small><strong>{formatDate(delivery.due_date)}</strong></div>
                <span className={`delivery-history-status delivery-history-status-${statusClass}`}><i />{status}</span>
                <div className="delivery-history-time"><small>{delivery.sent_at ? "Sent" : delivery.last_attempt_at ? "Last attempt" : "Queued"}</small><span>{formatTimestamp(resultTime)}</span></div>
              </article>;
            })}</div> : !deliveryError ? <div className="delivery-history-empty"><Icon>mail</Icon><strong>No email deliveries yet</strong><span>When a scheduled email reminder is processed, its status will appear here.</span></div> : null}
          </section>

          <footer className="calendar-footer"><span><Icon>schedule</Icon>Renewal dates repeat according to each saved billing cycle; cancellation cutoffs keep their original lead time.</span><span>{activeRows.length} active records</span></footer>
        </main>
      </div>
    </div>
  );
}
