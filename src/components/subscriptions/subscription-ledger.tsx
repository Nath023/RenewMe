"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { AccountMenu } from "@/components/account/account-menu";
import { useRouter } from "next/navigation";
import {
  archiveSubscription,
  batchAuditSubscriptions,
  createSubscription,
  deleteSubscription,
  importSubscriptions,
  updateSubscription,
} from "@/app/actions/subscriptions";
import { resendSignupConfirmation, signInAction, signOutAction, signUpAction } from "@/app/actions/auth";
import { useDisplayCurrency, useUsdNgnRate } from "@/lib/preferences/currency";
import { createClient as createBrowserSupabaseClient } from "@/lib/supabase/client";
import { extractInvoiceText, type InvoiceExtraction } from "@/lib/invoices/extract";
import { attachInvoiceFile } from "@/lib/invoices/storage";
import { cacheLedgerSnapshot, syncOfflineCreates } from "@/lib/offline/ledger-cache";
import type { Subscription, SubscriptionDraft, SubscriptionStatus } from "@/lib/subscriptions/types";

type ImportRow = { rowNumber: number; draft: SubscriptionDraft | null; error?: string };
type RenewalHistoryEntry = { id: string; renewal_date: string; amount: number; currency: string; payment_status: string; note: string | null; created_at: string };

function parseCsv(text: string): { rows: ImportRow[]; error?: string } {
  const matrix: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') { cell += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"' && cell.length === 0) quoted = true;
    else if (character === ",") { row.push(cell); cell = ""; }
    else if (character === "\n" || character === "\r") {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell); matrix.push(row); row = []; cell = "";
    } else cell += character;
  }
  if (quoted) return { rows: [], error: "The CSV has an unclosed quoted field." };
  if (cell.length || row.length) { row.push(cell); matrix.push(row); }
  const nonEmpty = matrix.filter((cells) => cells.some((value) => value.trim() !== ""));
  if (nonEmpty.length < 2) return { rows: [], error: "The CSV must include a header and at least one subscription row." };
  if (nonEmpty.length - 1 > 500) return { rows: [], error: "Import up to 500 subscription rows at a time." };

  const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const headers = nonEmpty[0].map(normalize);
  const column = (...aliases: string[]) => headers.findIndex((header) => aliases.includes(header));
  const columns = {
    vendor: column("vendor", "service", "subscription", "service_entity"),
    service_details: column("service_details", "details", "plan", "description"),
    category: column("category", "type"),
    amount: column("amount", "burden_amount", "cost", "price"),
    currency: column("currency", "currency_code"),
    billing_cycle: column("billing_cycle", "cycle", "cadence"),
    renewal_date: column("renewal_date", "renewal", "next_renewal_date"),
    cancel_by: column("cancel_by", "cancellation_date", "cancel_before"),
    payment_instrument: column("payment_instrument", "payment_method", "payment_reference"),
    service_url: column("service_url", "url", "website", "login_url"),
    contract_start_date: column("contract_start_date", "start_date", "contract_start"),
    actual_ngn_amount: column("actual_ngn_amount", "actual_ngn_charged", "ngn_statement_amount"),
    cost_center: column("cost_center", "folio_cost_center"),
    accountable_operator: column("accountable_operator", "owner", "ledger_owner"),
    notes: column("notes", "contract_notes", "accounting_reference"),
    status: column("status", "subscription_status"),
  };
  const missing = ["vendor", "amount", "currency", "renewal_date"].filter((key) => columns[key as keyof typeof columns] < 0);
  if (missing.length) return { rows: [], error: `Missing required CSV columns: ${missing.join(", ")}.` };

  const validDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  const results: ImportRow[] = [];
  nonEmpty.slice(1).forEach((cells, index) => {
    const value = (key: keyof typeof columns) => columns[key] < 0 ? "" : (cells[columns[key]] ?? "").trim();
    const vendor = value("vendor");
    const amountText = value("amount");
    const amount = Number(amountText);
    const currency = value("currency").toUpperCase();
    const renewalDate = value("renewal_date");
    const cancelBy = value("cancel_by") || null;
    const serviceUrl = value("service_url");
    const contractStartDate = value("contract_start_date");
    const actualNgnText = value("actual_ngn_amount");
    const actualNgnAmount = actualNgnText ? Number(actualNgnText) : null;
    const cycleText = value("billing_cycle").toLowerCase() || "monthly";
    const statusText = value("status").toLowerCase() || "active";
    let error: string | undefined;
    if (!vendor) error = "Vendor is required.";
    else if (!amountText || !Number.isFinite(amount) || amount < 0 || amount > 9_999_999_999.99) error = "Amount must be a valid non-negative number.";
    else if (!/^[A-Z]{3}$/.test(currency)) error = "Currency must be a 3-letter code, such as USD or NGN.";
    else if (!validDate(renewalDate)) error = "Renewal date must use YYYY-MM-DD and be a valid date.";
    else if (cancelBy && (!validDate(cancelBy) || cancelBy > renewalDate)) error = "Cancel-by date must be valid and no later than renewal date.";
    else if (contractStartDate && (!validDate(contractStartDate) || contractStartDate > renewalDate)) error = "Contract start date must be valid and no later than renewal date.";
    else if (actualNgnText && (!Number.isFinite(actualNgnAmount) || actualNgnAmount! < 0 || actualNgnAmount! > 9_999_999_999.99)) error = "Actual NGN charge must be a valid non-negative amount.";
    else if (serviceUrl && serviceUrl.length > 2048) error = "Service URL is too long.";
    else if (serviceUrl && (() => { try { const parsed = new URL(serviceUrl); return !/^https?:$/.test(parsed.protocol); } catch { return true; } })()) error = "Service URL must start with https:// or http://.";
    else if (!["monthly", "quarterly", "annual"].includes(cycleText)) error = "Billing cycle must be monthly, quarterly, or annual.";
    else if (!["active", "trial", "needs_review", "archived"].includes(statusText)) error = "Status must be active, trial, needs_review, or archived.";
    const draft: SubscriptionDraft | null = error ? null : {
      vendor,
      service_details: value("service_details") || null,
      category: value("category") || "Other",
      amount,
      currency,
      billing_cycle: cycleText as SubscriptionDraft["billing_cycle"],
      renewal_date: renewalDate,
      cancel_by: cancelBy,
      payment_instrument: value("payment_instrument") || null,
      service_url: serviceUrl || null,
      contract_start_date: contractStartDate || null,
      actual_ngn_amount: actualNgnAmount,
      cost_center: value("cost_center") || null,
      accountable_operator: value("accountable_operator") || null,
      notes: value("notes") || null,
      status: statusText as SubscriptionStatus,
    };
    results.push({ rowNumber: index + 2, draft, error });
  });
  return { rows: results };
}

type LedgerProps = {
  rows: Subscription[];
  userId?: string;
  preview?: boolean;
  accountName?: string;
  error?: string;
  message?: string;
};

const statusLabels: Record<SubscriptionStatus, string> = {
  active: "Active",
  trial: "Trial",
  needs_review: "Needs review",
  archived: "Archived",
};

function Icon({ children, className = "" }: { children: string; className?: string }) {
  return <span aria-hidden="true" className={`material-symbols-outlined ${className}`}>{children}</span>;
}

function money(amount: number, currency: string, selectedCurrency: "USD" | "NGN", currencyRate: number) {
  const value = selectedCurrency === "NGN"
    ? (currency === "NGN" ? amount : amount * currencyRate)
    : (currency === "NGN" ? amount / currencyRate : amount);
  const currencyCode = selectedCurrency;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function monthlyAmount(row: Subscription) {
  if (row.billing_cycle === "annual") return row.amount / 12;
  if (row.billing_cycle === "quarterly") return row.amount / 3;
  return row.amount;
}

function exportCsv(rows: Subscription[]) {
  const columns: (keyof Subscription)[] = ["vendor", "service_details", "category", "amount", "currency", "billing_cycle", "contract_start_date", "renewal_date", "cancel_by", "payment_instrument", "service_url", "actual_ngn_amount", "cost_center", "accountable_operator", "notes", "status"];
  const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [columns.map(quote).join(","), ...rows.map((row) => columns.map((column) => quote(row[column])).join(","))].join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "renewme-subscriptions.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function downloadCsvTemplate() {
  const columns = ["vendor", "service_details", "category", "amount", "currency", "billing_cycle", "contract_start_date", "renewal_date", "cancel_by", "payment_instrument", "service_url", "actual_ngn_amount", "cost_center", "accountable_operator", "notes", "status"];
  const url = URL.createObjectURL(new Blob([`${columns.join(",")}\r\n`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "renewme-import-template.csv";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renewalDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}

function daysUntilDate(today: string, target: string) {
  return Math.round((new Date(`${target.slice(0, 10)}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000);
}

function exactMoney(value: number, currencyCode: string) {
  try { return new Intl.NumberFormat("en", { style: "currency", currency: currencyCode }).format(value); }
  catch { return `${value.toFixed(2)} ${currencyCode}`; }
}

function StatusTag({ status }: { status: SubscriptionStatus }) {
  return <span className={`status-tag status-${status}`}>{statusLabels[status]}</span>;
}

function Sidebar({ count, accountName, authenticated }: { count: number; accountName?: string; authenticated: boolean }) {
  const links = [
    ["Dashboard", "dashboard", "/dashboard"],
    ["Subscriptions", "receipt_long", "/subscriptions"],
    ["Calendar", "calendar_today", "/calendar"],
    ["Reports", "analytics", "/reports"],
    ["Reminders", "notifications", "/reminders"],
    ["Settings", "tune", "/settings"],
  ];

  return (
    <aside className="ledger-sidebar">
      <div>
        <div className="brand-row">
          <span className="brand-name">RenewMe</span>
          <span className="folio-version">FOLIO V2.4</span>
          <span className="sync-dot" title="System active" />
        </div>
        <div className="register-label"><span>Ledger Register</span><span>#04</span></div>
        <nav aria-label="Main navigation" className="sidebar-nav">
          {links.map(([label, icon, href]) => (
            href ? <a aria-current={label === "Subscriptions" ? "page" : undefined} className={label === "Subscriptions" ? "nav-link nav-link-active" : "nav-link"} href={href} key={label}>
              <Icon>{icon}</Icon><span>{label}</span>
              {label === "Subscriptions" && <span className="nav-count">{count}</span>}
            </a> : <span aria-disabled="true" className="nav-link nav-link-disabled" key={label} title={`${label} are coming soon`}>
              <Icon>{icon}</Icon><span>{label}</span>
            </span>
          ))}
        </nav>
      </div>
      <div className="account-card">
        <div><strong>{accountName ?? "Studio Lagos Ltd"}</strong><span>₦ Base Ledger <i /> <b>Synced</b></span></div>
        <div className="account-card-actions"><Link aria-label="Settings" className="account-settings-link" href="/settings"><Icon>settings</Icon></Link>{authenticated && <form action={signOutAction}><button aria-label="Sign out" className="calendar-signout" type="submit"><Icon>logout</Icon></button></form>}</div>
      </div>
    </aside>
  );
}

function Topbar({ accountName, authenticated, query, onQueryChange, onExport }: { accountName?: string; authenticated: boolean; query: string; onQueryChange: (value: string) => void; onExport: () => void }) {
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInput.current?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);
  return (
    <header className="ledger-topbar">
      <div className="topbar-crumb"><span>Workspace</span><Icon>chevron_right</Icon><strong>Register</strong></div>
      <label className="topbar-search"><span aria-hidden="true" className="material-symbols-outlined">search</span><input aria-label="Search subscriptions" onChange={(event) => onQueryChange(event.target.value)} placeholder="Filter ledger records..." ref={searchInput} value={query} /><kbd>Ctrl K</kbd></label>
      <div className="topbar-right"><button aria-label="Export filtered subscriptions as CSV" className="icon-button" onClick={onExport} title="Export filtered subscriptions as CSV" type="button"><Icon>download</Icon></button><Link aria-label="Open renewal reminders" className="icon-button" href="/reminders" title="Open renewal reminders"><Icon>notifications</Icon></Link><AccountMenu accountName={accountName ?? "Preview account"} authenticated={authenticated} /></div>
    </header>
  );
}

function SubscriptionForm({ row, close }: { row?: Subscription; close: () => void }) {
  const action = row ? updateSubscription : createSubscription;
  return (
    <div aria-label={row ? "Edit subscription" : "Add subscription"} aria-modal="true" className="modal-backdrop" role="dialog">
      <form action={action} className="subscription-form">
        <div className="form-heading"><div><p className="eyebrow">Ledger entry</p><h2>{row ? "Edit subscription" : "Record new commitment"}</h2></div><button aria-label="Close" className="icon-button" onClick={close} type="button"><Icon>close</Icon></button></div>
        {row && <input name="id" type="hidden" value={row.id} />}
        <label>Vendor<input autoFocus name="vendor" required defaultValue={row?.vendor ?? ""} placeholder="e.g. Namecheap" /></label>
        <label>Service / entity<input name="service_details" defaultValue={row?.service_details ?? ""} placeholder="Plan, seats, domain, or workspace" /></label>
        <label>Vendor website / login URL<input defaultValue={row?.service_url ?? ""} maxLength={2048} name="service_url" placeholder="https://vendor.example/account" type="url" /></label>
        <div className="form-grid">
          <label>Category<input name="category" defaultValue={row?.category ?? "Other"} /></label>
          <label>Amount<input min="0" name="amount" required step="0.01" type="number" defaultValue={row?.amount ?? ""} /></label>
          <label>Currency<select defaultValue={row?.currency ?? "USD"} name="currency"><option value="USD">USD ($)</option><option value="NGN">NGN (₦)</option></select></label>
          <label>Billing cycle<select defaultValue={row?.billing_cycle ?? "monthly"} name="billing_cycle"><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option></select></label>
          <label>Contract start date<input defaultValue={row?.contract_start_date ?? ""} name="contract_start_date" type="date" /></label>
          <label>Renewal date<input defaultValue={row?.renewal_date ?? ""} name="renewal_date" required type="date" /></label>
          <label>Cancel by<input defaultValue={row?.cancel_by ?? ""} name="cancel_by" type="date" /></label>
          <label>Actual NGN charged<input defaultValue={row?.actual_ngn_amount ?? ""} min="0" name="actual_ngn_amount" placeholder="Optional statement amount" step="0.01" type="number" /></label>
          <label>Cost center<input defaultValue={row?.cost_center ?? ""} maxLength={100} name="cost_center" placeholder="e.g. Engineering" /></label>
          <label>Accountable operator<input defaultValue={row?.accountable_operator ?? ""} maxLength={150} name="accountable_operator" placeholder="Person responsible" /></label>
        </div>
        <label>Payment instrument<input name="payment_instrument" defaultValue={row?.payment_instrument ?? ""} placeholder="Card or account reference" /></label>
        <label>Contract and accounting notes<textarea defaultValue={row?.notes ?? ""} maxLength={2000} name="notes" placeholder="Terms, invoice references, or internal notes" rows={3} /></label>
        <label>Status<select defaultValue={row?.status ?? "active"} name="status"><option value="active">Active</option><option value="trial">Trial</option><option value="needs_review">Needs review</option><option value="archived">Archived</option></select></label>
        <div className="form-actions"><button className="button button-secondary" onClick={close} type="button">Cancel</button><button className="button button-primary" type="submit">{row ? "Save changes" : "Add subscription"}</button></div>
      </form>
    </div>
  );
}

function DeleteSubscriptionForm({ id, disabled = false, details = false }: { id: string; disabled?: boolean; details?: boolean }) {
  return <form action={deleteSubscription} onSubmit={(event: FormEvent<HTMLFormElement>) => {
    if (!window.confirm("Permanently delete this subscription, its invoice files, and renewal history? This cannot be undone.")) event.preventDefault();
  }}><input name="id" type="hidden" value={id} /><button aria-label="Delete subscription permanently" className={details ? "button details-delete" : "row-action row-action-delete"} disabled={disabled} title={disabled ? "Connect to delete this subscription" : "Permanently delete this subscription"} type="submit">{details && <Icon>delete</Icon>}{details ? "Delete permanently" : "Delete"}</button></form>;
}

function SubscriptionRow({ row, selectedCurrency, currencyRate, preview, selected, onSelect, onEdit, onView, isOnline }: { row: Subscription; selectedCurrency: "USD" | "NGN"; currencyRate: number; preview: boolean; selected: boolean; onSelect: (checked: boolean) => void; onEdit: () => void; onView: () => void; isOnline: boolean }) {
  const amount = money(row.amount, row.currency, selectedCurrency, currencyRate);
  const alert = row.status === "needs_review";
  return (
    <tr className={alert ? "subscription-row row-alert" : "subscription-row"}>
      <td className="check-cell"><input aria-label={`Select ${row.vendor}`} checked={selected} onChange={(event) => onSelect(event.target.checked)} type="checkbox" /></td>
      <td className="vendor-cell"><button aria-label={`View ${row.vendor} details`} className="vendor-detail-trigger" onClick={onView} type="button"><strong>{row.vendor}</strong></button><span>{row.service_details || "—"}</span></td>
      <td className="category-cell">{row.category}</td>
      <td className="amount-cell"><strong>{amount}</strong><span>/ {row.billing_cycle === "annual" ? "yr" : row.billing_cycle === "quarterly" ? "qtr" : "mo"}</span>{selectedCurrency === "USD" && row.currency === "USD" && <small>≈ ₦{(row.amount * currencyRate).toLocaleString("en-NG", { maximumFractionDigits: 0 })}</small>}</td>
      <td className="cycle-cell">{row.billing_cycle}</td>
      <td className="date-cell">{renewalDate(row.renewal_date)}</td>
      <td className="cancel-cell">{row.cancel_by ? renewalDate(row.cancel_by) : "—"}{alert && row.cancel_by && <small className="urgent-note"><Icon>warning</Icon>Notice deadline</small>}</td>
      <td className="payment-cell"><Icon>credit_card</Icon><span>{row.payment_instrument || "Not recorded"}</span></td>
      <td className="status-cell"><StatusTag status={row.status} /></td>
      <td className="action-cell">{preview ? <span className="eyebrow">Preview</span> : <><button className="row-action" onClick={onEdit} type="button">Edit</button>{row.status !== "archived" && <form action={archiveSubscription}><input name="id" type="hidden" value={row.id} /><button className="row-action row-action-warn" type="submit">Archive</button></form>}<DeleteSubscriptionForm disabled={!isOnline} id={row.id} /></>}</td>
    </tr>
  );
}

function MobileSubscriptionCard({ row, selectedCurrency, currencyRate, preview, selected, onSelect, onEdit, onView, isOnline }: { row: Subscription; selectedCurrency: "USD" | "NGN"; currencyRate: number; preview: boolean; selected: boolean; onSelect: (checked: boolean) => void; onEdit: () => void; onView: () => void; isOnline: boolean }) {
  return (
    <article className={`mobile-subscription-card${row.status === "needs_review" ? " mobile-subscription-card-review" : ""}`}>
      <header><input aria-label={`Select ${row.vendor}`} checked={selected} onChange={(event) => onSelect(event.target.checked)} type="checkbox" /><div><button aria-label={`View ${row.vendor} details`} className="vendor-detail-trigger" onClick={onView} type="button"><strong>{row.vendor}</strong></button><span>{row.category}</span></div><StatusTag status={row.status} /></header>
      <div className="mobile-subscription-metrics"><div><span>Recurring amount</span><strong>{money(row.amount, row.currency, selectedCurrency, currencyRate)}<small> / {row.billing_cycle === "annual" ? "yr" : row.billing_cycle === "quarterly" ? "qtr" : "mo"}</small></strong></div><div><span>Next renewal</span><strong>{renewalDate(row.renewal_date)}</strong></div></div>
      {row.service_details && <p className="mobile-subscription-details">{row.service_details}</p>}
      <div className="mobile-subscription-meta">{row.cancel_by && <span className={row.status === "needs_review" ? "mobile-cancel-deadline mobile-cancel-deadline-urgent" : "mobile-cancel-deadline"}><Icon>event_busy</Icon>Cancel by {renewalDate(row.cancel_by)}</span>}{row.actual_ngn_amount !== null && row.actual_ngn_amount !== undefined && <span><Icon>receipt</Icon>Actual NGN charge: {money(row.actual_ngn_amount, "NGN", selectedCurrency, currencyRate)}</span>}<span><Icon>credit_card</Icon>{row.payment_instrument || "Payment method not recorded"}</span>{row.service_url && <a href={row.service_url} rel="noreferrer" target="_blank"><Icon>open_in_new</Icon>Open vendor account</a>}</div>
      <footer>{preview ? <span className="eyebrow">Preview record</span> : <><button className="row-action" onClick={onEdit} type="button">Edit</button>{row.status !== "archived" && <form action={archiveSubscription}><input name="id" type="hidden" value={row.id} /><button className="row-action row-action-warn" type="submit">Archive</button></form>}<DeleteSubscriptionForm disabled={!isOnline} id={row.id} /></>}</footer>
    </article>
  );
}

function SubscriptionDetails({ row, selectedCurrency, currencyRate, preview, onClose, onEdit, onPrefill, isOnline }: { row: Subscription; selectedCurrency: "USD" | "NGN"; currencyRate: number; preview: boolean; onClose: () => void; onEdit: () => void; onPrefill: (values: Partial<SubscriptionDraft>) => void; isOnline: boolean }) {
  const monthly = money(monthlyAmount(row), row.currency, selectedCurrency, currencyRate);
  const [today, setToday] = useState("");
  const [renewalHistory, setRenewalHistory] = useState<RenewalHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(!preview);
  const [historyError, setHistoryError] = useState("");
  const [savingRenewal, setSavingRenewal] = useState(false);
  const [deletingRenewalId, setDeletingRenewalId] = useState("");
  const [attachments, setAttachments] = useState<{ id: string; renewal_id: string | null; file_name: string; content_type: string; file_size: number; created_at: string; signedUrl: string }[]>([]);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [invoiceError, setInvoiceError] = useState("");
  const [loadingInvoices, setLoadingInvoices] = useState(!preview);
  const [uploadingInvoice, setUploadingInvoice] = useState(false);
  const [extractingInvoiceId, setExtractingInvoiceId] = useState("");
  const [uploadingRenewalInvoiceId, setUploadingRenewalInvoiceId] = useState("");
  const [renewalInvoiceError, setRenewalInvoiceError] = useState("");
  const [extractionProgress, setExtractionProgress] = useState("");
  const [extraction, setExtraction] = useState<InvoiceExtraction | null>(null);
  const [extractionError, setExtractionError] = useState("");

  useEffect(() => {
    setToday(new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()));
  }, []);

  const daysUntilCutoff = today && row.cancel_by ? daysUntilDate(today, row.cancel_by) : null;

  useEffect(() => {
    if (preview) return;
    let active = true;
    async function loadInvoices() {
      const supabase = createBrowserSupabaseClient();
      const { data, error } = await supabase.from("renewme_subscription_invoices").select("id, renewal_id, file_name, content_type, file_size, file_path, created_at").eq("subscription_id", row.id).order("created_at", { ascending: false });
      if (error) {
        if (active) setInvoiceError("Apply the invoice attachment and renewal history migrations to load private files.");
        if (active) setLoadingInvoices(false);
        return;
      }
      const linked = await Promise.all((data ?? []).map(async (invoice) => {
        const { data: signed } = await supabase.storage.from("renewme-invoices").createSignedUrl(invoice.file_path, 3600);
        return { id: invoice.id, renewal_id: invoice.renewal_id, file_name: invoice.file_name, content_type: invoice.content_type, file_size: invoice.file_size, created_at: invoice.created_at, signedUrl: signed?.signedUrl ?? "" };
      }));
      if (active) { setAttachments(linked); setLoadingInvoices(false); }
    }
    void loadInvoices();
    return () => { active = false; };
  }, [preview, row.id]);

  useEffect(() => {
    if (preview) return;
    let active = true;
    async function loadRenewalHistory() {
      const supabase = createBrowserSupabaseClient();
      const { data, error } = await supabase.from("renewme_subscription_renewals").select("id, renewal_date, amount, currency, payment_status, note, created_at").eq("subscription_id", row.id).order("renewal_date", { ascending: false }).order("created_at", { ascending: false });
      if (error) {
        if (active) setHistoryError("Apply the subscription renewal history migration to enable this timeline.");
        if (active) setHistoryLoading(false);
        return;
      }
      if (active) { setRenewalHistory(data ?? []); setHistoryLoading(false); }
    }
    void loadRenewalHistory();
    return () => { active = false; };
  }, [preview, row.id]);

  const recordedTotals = useMemo(() => {
    const totals = new Map<string, number>();
    renewalHistory.filter((event) => event.payment_status === "paid").forEach((event) => totals.set(event.currency, (totals.get(event.currency) ?? 0) + event.amount));
    return [...totals.entries()].map(([currencyCode, total]) => exactMoney(total, currencyCode));
  }, [renewalHistory]);
  const subscriptionInvoices = attachments.filter((attachment) => !attachment.renewal_id);

  async function recordRenewal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setHistoryError("");
    setSavingRenewal(true);
    const formData = new FormData(form);
    const supabase = createBrowserSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (!user || authError) { setHistoryError("Sign in again to record a renewal."); setSavingRenewal(false); return; }
    const { data, error } = await supabase.from("renewme_subscription_renewals").insert({
      user_id: user.id,
      subscription_id: row.id,
      renewal_date: String(formData.get("renewal_date") ?? ""),
      amount: Number(formData.get("amount")),
      currency: String(formData.get("currency") ?? row.currency),
      payment_status: String(formData.get("payment_status") ?? "paid") as RenewalHistoryEntry["payment_status"],
      note: String(formData.get("note") ?? "").trim() || null,
    }).select("id, renewal_date, amount, currency, payment_status, note, created_at").single();
    if (error) {
      setHistoryError(error.message.includes("renewme_subscription_renewals") ? "Apply the subscription renewal history migration to record cycles." : error.message);
      setSavingRenewal(false);
      return;
    }
    setRenewalHistory((current) => [data, ...current].sort((a, b) => b.renewal_date.localeCompare(a.renewal_date)));
    form.reset();
    setSavingRenewal(false);
  }

  async function removeRenewal(entry: RenewalHistoryEntry) {
    if (!window.confirm(`Remove the renewal record from ${renewalDate(entry.renewal_date)}?`)) return;
    setHistoryError("");
    setDeletingRenewalId(entry.id);
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.from("renewme_subscription_renewals").delete().eq("id", entry.id);
    if (error) setHistoryError(error.message);
    else {
      setRenewalHistory((current) => current.filter((item) => item.id !== entry.id));
      setAttachments((current) => current.map((item) => item.renewal_id === entry.id ? { ...item, renewal_id: null } : item));
    }
    setDeletingRenewalId("");
  }

  async function attachInvoice() {
    if (!invoiceFile || preview) return;
    setInvoiceError("");
    setUploadingInvoice(true);
    const result = await attachInvoiceFile(row.id, invoiceFile);
    if (!result.success) { setInvoiceError(result.error); setUploadingInvoice(false); return; }
    setAttachments((current) => [result.attachment, ...current]);
    setInvoiceFile(null);
    const input = document.getElementById(`invoice-file-${row.id}`) as HTMLInputElement | null;
    if (input) input.value = "";
    setUploadingInvoice(false);
  }

  async function attachInvoiceToRenewal(renewalId: string, file: File) {
    setRenewalInvoiceError("");
    setUploadingRenewalInvoiceId(renewalId);
    const result = await attachInvoiceFile(row.id, file, renewalId);
    if (!result.success) setRenewalInvoiceError(result.error);
    else setAttachments((current) => [result.attachment, ...current]);
    setUploadingRenewalInvoiceId("");
  }

  async function extractInvoice(attachment: typeof attachments[number]) {
    if (!attachment.signedUrl) return;
    setExtraction(null);
    setExtractionError("");
    setExtractingInvoiceId(attachment.id);
    setExtractionProgress("Preparing invoice…");
    try {
      const response = await fetch(attachment.signedUrl);
      if (!response.ok) throw new Error("Could not load the private invoice file. Close and reopen this panel, then try again.");
      const file = new File([await response.blob()], attachment.file_name, { type: attachment.content_type });
      const result = await extractInvoiceText(file, (status, progress) => setExtractionProgress(progress === undefined ? status : `${status} · ${Math.round(progress * 100)}%`));
      if (!result.text) throw new Error("No readable text was found. Try a clearer image or a text-based PDF.");
      setExtraction(result);
    } catch (error) {
      setExtractionError(error instanceof Error ? error.message : "Could not extract text from this invoice.");
    } finally {
      setExtractingInvoiceId("");
      setExtractionProgress("");
    }
  }

  return (
    <div aria-label={`${row.vendor} subscription details`} aria-modal="true" className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} role="dialog">
      <section className="subscription-details-card">
        <header className="details-heading"><div><p className="eyebrow">Subscription record · {row.category}</p><h2>{row.vendor}</h2><p>{row.service_details || "Service details have not been added."}</p></div><button aria-label="Close subscription details" className="icon-button" onClick={onClose} type="button"><Icon>close</Icon></button></header>
        <div className="details-summary"><div><span>Recurring amount</span><strong>{money(row.amount, row.currency, selectedCurrency, currencyRate)}</strong><small>{row.billing_cycle} · approximately {monthly} / month</small></div><StatusTag status={row.status} /></div>
        {daysUntilCutoff !== null && daysUntilCutoff <= 7 && row.status !== "archived" && <aside className="details-cancellation-alert" aria-label="Cancellation cutoff notice"><div><Icon>warning</Icon><div><strong>{daysUntilCutoff < 0 ? `Cancellation cutoff passed ${Math.abs(daysUntilCutoff)} ${Math.abs(daysUntilCutoff) === 1 ? "day" : "days"} ago` : daysUntilCutoff === 0 ? "Cancellation cutoff is today" : `Cancellation cutoff in ${daysUntilCutoff} ${daysUntilCutoff === 1 ? "day" : "days"}`}</strong><span>Cancel by {renewalDate(row.cancel_by!)} to act before the next renewal on {renewalDate(row.renewal_date)} ({money(row.amount, row.currency, selectedCurrency, currencyRate)} / {row.billing_cycle}).</span></div></div>{row.service_url ? <a href={row.service_url} rel="noreferrer" target="_blank"><Icon>open_in_new</Icon>Open vendor account</a> : !preview && <button onClick={onEdit} type="button">Review record</button>}</aside>}
        <div className="details-grid">
          <div><span>Next renewal</span><strong>{renewalDate(row.renewal_date)}</strong></div>
          <div><span>Contract start</span><strong>{row.contract_start_date ? renewalDate(row.contract_start_date) : "No date recorded"}</strong></div>
          <div><span>Cancel by</span><strong>{row.cancel_by ? renewalDate(row.cancel_by) : "No date recorded"}</strong></div>
          <div><span>Billing cycle</span><strong>{row.billing_cycle.charAt(0).toUpperCase() + row.billing_cycle.slice(1)}</strong></div>
          <div><span>Category</span><strong>{row.category}</strong></div>
          <div><span>Payment method</span><strong>{row.payment_instrument || "Not recorded"}</strong></div>
          <div><span>Actual NGN charge</span><strong>{row.actual_ngn_amount === null || row.actual_ngn_amount === undefined ? "Not recorded" : money(row.actual_ngn_amount, "NGN", selectedCurrency, currencyRate)}</strong></div>
          <div><span>Cost center</span><strong>{row.cost_center || "Not recorded"}</strong></div>
          <div><span>Accountable operator</span><strong>{row.accountable_operator || "Not recorded"}</strong></div>
          <div><span>Vendor URL</span><strong>{row.service_url ? <a href={row.service_url} rel="noreferrer" target="_blank">Open vendor account</a> : "Not recorded"}</strong></div>
          <div><span>Record created</span><strong>{renewalDate(row.created_at)}</strong></div>
          <div><span>Last updated</span><strong>{renewalDate(row.updated_at)}</strong></div>
        </div>
        {row.notes && <div className="details-notes"><span>Contract and accounting notes</span><p>{row.notes}</p></div>}
        <section aria-labelledby="renewal-history-heading" className="renewal-history">
          <header className="renewal-history-heading"><div><h3 id="renewal-history-heading">Renewal history</h3><p>Record charges you have confirmed. Nothing is generated automatically.</p></div><span>{renewalHistory.length} {renewalHistory.length === 1 ? "cycle" : "cycles"}</span></header>
          <div className="renewal-history-total"><span>Cumulative settled spend</span><strong>{recordedTotals.length ? recordedTotals.join(" · ") : "No settled charges"}</strong></div>
          {historyError && <p className="notice notice-error" role="alert">{historyError}</p>}
          {!preview && !historyError && <form className="renewal-record-form" onSubmit={(event) => void recordRenewal(event)}>
            <label>Renewal date<input defaultValue={row.renewal_date} name="renewal_date" required type="date" /></label>
            <label>Amount<input defaultValue={row.amount} min="0" name="amount" required step="0.01" type="number" /></label>
            <label>Currency<select defaultValue={row.currency} name="currency">{[...new Set([row.currency, "USD", "NGN"])].map((code) => <option key={code} value={code}>{code}</option>)}</select></label>
            <label>Payment status<select defaultValue="paid" name="payment_status"><option value="paid">Paid / settled</option><option value="pending">Pending</option><option value="failed">Failed</option></select></label>
            <label className="renewal-note-field">Note<input maxLength={500} name="note" placeholder="Optional invoice or transaction note" /></label>
            <button className="button button-secondary" disabled={savingRenewal} type="submit"><Icon>add</Icon>{savingRenewal ? "Saving…" : "Record renewal"}</button>
          </form>}
          {historyLoading && <p className="invoice-empty">Loading renewal history…</p>}
          {!preview && !historyLoading && !historyError && renewalHistory.length === 0 && <p className="invoice-empty">No renewal cycles recorded yet. Add one above when you confirm a charge.</p>}
          {renewalInvoiceError && <p className="notice notice-error" role="alert">{renewalInvoiceError}</p>}
          {renewalHistory.length > 0 && <ol className="renewal-history-list">{renewalHistory.map((entry) => <li key={entry.id}><span className="renewal-timeline-mark" /><div className="renewal-history-event"><div><time dateTime={entry.renewal_date}>{renewalDate(entry.renewal_date)}</time><span className={`renewal-status renewal-status-${entry.payment_status}`}>{entry.payment_status === "paid" ? "Settled" : entry.payment_status === "pending" ? "Pending" : "Failed"}</span></div><strong>{exactMoney(entry.amount, entry.currency)}</strong>{entry.note && <p>{entry.note}</p>}<div className="renewal-event-invoices">{attachments.filter((attachment) => attachment.renewal_id === entry.id).map((attachment) => <div className="renewal-event-invoice" key={attachment.id}><Icon>{attachment.file_name.toLowerCase().endsWith(".pdf") ? "picture_as_pdf" : "image"}</Icon><span>{attachment.file_name}</span>{attachment.signedUrl && <><button className="invoice-extract-button" disabled={Boolean(extractingInvoiceId)} onClick={() => void extractInvoice(attachment)} type="button">{extractingInvoiceId === attachment.id ? "Reading…" : "Extract"}</button><a href={attachment.signedUrl} rel="noreferrer" target="_blank">Open</a></>}</div>)}{!preview && <label className="renewal-attach-invoice">{uploadingRenewalInvoiceId === entry.id ? "Attaching…" : "+ Attach invoice"}<input accept="application/pdf,image/png,image/jpeg,image/webp" disabled={Boolean(uploadingRenewalInvoiceId)} onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ""; if (file) void attachInvoiceToRenewal(entry.id, file); }} type="file" /></label>}</div></div>{!preview && <button aria-label={`Remove renewal record from ${renewalDate(entry.renewal_date)}`} className="renewal-delete-button" disabled={deletingRenewalId === entry.id} onClick={() => void removeRenewal(entry)} type="button"><Icon>delete</Icon></button>}</li>)}</ol>}
        </section>
        <section className="invoice-attachments" aria-labelledby="invoice-attachments-heading">
          <header><div><h3 id="invoice-attachments-heading">Invoice files</h3><p>Cycle-specific files appear in renewal history · up to 25 MB</p></div><Icon>description</Icon></header>
          {!preview && <div className="invoice-upload-row"><label className="invoice-file-picker">{invoiceFile ? invoiceFile.name : "Choose invoice file"}<input accept="application/pdf,image/png,image/jpeg,image/webp" id={`invoice-file-${row.id}`} onChange={(event) => setInvoiceFile(event.target.files?.[0] ?? null)} type="file" /></label><button className="button button-primary" disabled={!invoiceFile || uploadingInvoice} onClick={() => void attachInvoice()} type="button">{uploadingInvoice ? "Uploading…" : "Attach file"}</button></div>}
          {invoiceError && <p className="notice notice-error" role="alert">{invoiceError}</p>}
          {loadingInvoices && <p className="invoice-empty">Loading attached files…</p>}
          {!preview && !loadingInvoices && !invoiceError && attachments.length === 0 && <p className="invoice-empty">No invoices attached to this subscription yet.</p>}
          {attachments.length > 0 && subscriptionInvoices.length === 0 && <p className="invoice-empty">All invoice files are linked to renewal cycles above.</p>}
          {subscriptionInvoices.length > 0 && <ul className="invoice-file-list">{subscriptionInvoices.map((attachment) => <li key={attachment.id}><Icon>{attachment.file_name.toLowerCase().endsWith(".pdf") ? "picture_as_pdf" : "image"}</Icon><span><strong>{attachment.file_name}</strong><small>{(attachment.file_size / 1024 / 1024).toFixed(2)} MB · {renewalDate(attachment.created_at)}</small></span>{attachment.signedUrl ? <><button className="invoice-extract-button" disabled={Boolean(extractingInvoiceId)} onClick={() => void extractInvoice(attachment)} type="button">{extractingInvoiceId === attachment.id ? "Reading…" : "Extract fields"}</button><a href={attachment.signedUrl} rel="noreferrer" target="_blank">Open <Icon>open_in_new</Icon></a></> : <span className="invoice-link-error">Unavailable</span>}</li>)}</ul>}
          {extractingInvoiceId && <p className="invoice-empty" role="status">{extractionProgress || "Reading invoice in this browser…"}</p>}
          {extractionError && <p className="notice notice-error" role="alert">{extractionError}</p>}
          {extraction && <div className="invoice-extraction-review"><div><strong>Extracted candidates · review before applying</strong><small>OCR can misread invoice values. Nothing is saved until you edit and confirm the subscription.</small></div><dl>{([ ["Vendor", extraction.candidates.vendor], ["Amount", extraction.candidates.amount], ["Currency", extraction.candidates.currency], ["Renewal date", extraction.candidates.renewal_date], ["Billing cycle", extraction.candidates.billing_cycle], ["Plan details", extraction.candidates.service_details], ["Category", extraction.candidates.category], ["Payment method", extraction.candidates.payment_instrument], ["Cancel by", extraction.candidates.cancel_by], ["Invoice number · review only", extraction.candidates.invoice_number], ["Billing period · review only", extraction.candidates.billing_period] ] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? "Not found"}</dd></div>)}</dl><details><summary>Review extracted text</summary><pre>{extraction.text.slice(0, 8000)}{extraction.text.length > 8000 ? "\n… text trimmed" : ""}</pre></details><button className="button button-primary" disabled={!Object.keys(extraction.candidates).length} onClick={() => { const { invoice_number: _invoiceNumber, billing_period: _billingPeriod, ...subscriptionFields } = extraction.candidates; onPrefill(subscriptionFields); }} type="button">Review in subscription editor</button></div>}
          <p className="invoice-ocr-note">Text extraction runs in this browser. English OCR data downloads from a public CDN the first time and is then cached by the browser.</p>
        </section>
        <p className="details-footnote"><Icon>info</Icon>RenewMe stores the subscription details you entered. It does not verify charges with the vendor.</p>
        <footer className="details-actions"><button className="button button-secondary" onClick={onClose} type="button">Close</button>{!preview && <><button className="button button-primary" onClick={onEdit} type="button"><Icon>edit</Icon>Edit record</button>{row.status !== "archived" && <form action={archiveSubscription}><input name="id" type="hidden" value={row.id} /><button className="button details-archive" type="submit"><Icon>inventory_2</Icon>Archive</button></form>}<DeleteSubscriptionForm details disabled={!isOnline} id={row.id} /></>}</footer>
      </section>
    </div>
  );
}

function NewSubscriptionForm({ row, close }: { row?: Subscription; close: () => void }) {
  return <SubscriptionForm close={close} row={row} />;
}

export function SubscriptionLedger({ rows, userId, preview = false, accountName, error, message }: LedgerProps) {
  const PAGE_SIZE = 10;
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | SubscriptionStatus>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("renewal_date");
  const [page, setPage] = useState(1);
  const [currency, setCurrency] = useDisplayCurrency("NGN");
  const [currencyRate] = useUsdNgnRate();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Subscription | undefined>();
  const [viewing, setViewing] = useState<Subscription | undefined>();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importError, setImportError] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [isImporting, startImport] = useTransition();
  const [isOnline, setIsOnline] = useState(true);
  const [offlineSyncPending, setOfflineSyncPending] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (preview || !userId) return;
    let disposed = false;
    const synchronize = async () => {
      if (!navigator.onLine) return;
      const supabase = createBrowserSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || user.id !== userId) return;
      const result = await syncOfflineCreates(userId, supabase);
      if (disposed) return;
      setOfflineSyncPending(result.pending);
      if (result.synced) router.refresh();
    };
    const online = () => { setIsOnline(true); void synchronize(); };
    const offline = () => setIsOnline(false);
    setIsOnline(navigator.onLine);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    if (!error) {
      void cacheLedgerSnapshot(userId, rows).then(synchronize).catch(() => undefined);
    }
    void synchronize();
    return () => { disposed = true; window.removeEventListener("online", online); window.removeEventListener("offline", offline); };
  }, [error, preview, router, rows, userId]);

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return rows
      .filter((row) => filter === "all" || row.status === filter)
      .filter((row) => !normalized || `${row.vendor} ${row.service_details ?? ""} ${row.category} ${row.cost_center ?? ""} ${row.accountable_operator ?? ""} ${row.notes ?? ""}`.toLowerCase().includes(normalized))
      .sort((a, b) => sort === "vendor" ? a.vendor.localeCompare(b.vendor) : sort === "amount" ? b.amount - a.amount : a.renewal_date.localeCompare(b.renewal_date));
  }, [filter, query, rows, sort]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const activeRows = rows.filter((row) => row.status !== "archived");
  const usdMonthly = activeRows.reduce((sum, row) => sum + monthlyAmount(row) * (row.currency === "NGN" ? 1 / currencyRate : 1), 0);
  const counts = {
    all: preview ? 14 : rows.length,
    active: preview ? 10 : rows.filter((row) => row.status === "active").length,
    trial: preview ? 1 : rows.filter((row) => row.status === "trial").length,
    needs_review: preview ? 2 : rows.filter((row) => row.status === "needs_review").length,
    archived: preview ? 1 : rows.filter((row) => row.status === "archived").length,
  };
  const displayedMonthly = preview ? 348.5 : usdMonthly;
  const deadlineCount = preview ? 2 : activeRows.filter((row) => row.status === "needs_review").length;

  function handleCsvFile(file?: File) {
    setImportMessage("");
    setImportError("");
    setImportRows([]);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
      setImportError("Choose a .csv file."); setImportOpen(true); return;
    }
    if (file.size > 1_000_000) {
      setImportError("CSV files must be 1 MB or smaller."); setImportOpen(true); return;
    }
    void file.text().then((text) => {
      const parsed = parseCsv(text);
      setImportRows(parsed.rows);
      setImportError(parsed.error ?? "");
      setImportOpen(true);
    }).catch(() => {
      setImportError("Could not read that file. Try saving it as UTF-8 CSV.");
      setImportOpen(true);
    });
  }

  function confirmImport() {
    const drafts = importRows.map((entry) => entry.draft).filter((draft): draft is SubscriptionDraft => Boolean(draft));
    if (!drafts.length || importRows.some((entry) => entry.error)) return;
    setImportError("");
    startImport(async () => {
      const result = await importSubscriptions(drafts);
      if (!result.success) { setImportError(result.error); return; }
      setImportMessage(`${result.count} ${result.count === 1 ? "subscription was" : "subscriptions were"} imported.`);
      setImportOpen(false);
      setPage(1);
      setQuery("");
      setFilter("all");
      router.refresh();
    });
  }

  return (
    <div className="ledger-app">
      <Sidebar accountName={accountName} authenticated={!preview} count={preview ? 24 : rows.length} />
      <div className="ledger-main">
        <Topbar accountName={accountName} authenticated={!preview} onExport={() => exportCsv(filteredRows)} onQueryChange={(value) => { setQuery(value); setPage(1); }} query={query} />
        <nav aria-label="Mobile navigation" className="mobile-nav">
          <a href="/dashboard"><Icon>dashboard</Icon><span>Home</span></a><a aria-current="page" href="/subscriptions"><Icon>receipt_long</Icon><span>Folio</span></a><a href="/calendar"><Icon>calendar_today</Icon><span>Calendar</span></a><a href="/reports"><Icon>analytics</Icon><span>Reports</span></a><a href="/reminders"><Icon>notifications</Icon><span>Reminders</span></a><a href="/settings"><Icon>tune</Icon><span>Settings</span></a>
        </nav>
        <main className="ledger-content">
          {!preview && !isOnline && <div className="offline-banner" role="status"><Icon>cloud_off</Icon><span><strong>You’re offline.</strong> Showing the saved folio. Open the offline folio to add, edit, or archive records; permanent deletion requires a connection.</span><a href="/offline.html">Open offline folio</a></div>}
          {!preview && isOnline && offlineSyncPending > 0 && <div className="offline-banner offline-banner-pending" role="status"><Icon>sync</Icon><span><strong>{offlineSyncPending} queued {offlineSyncPending === 1 ? "entry" : "entries"} not synced.</strong> They remain saved on this device.</span><a href="/offline.html">Review queue</a></div>}
          {preview && <div className="preview-banner"><Icon>visibility</Icon><span><strong>Design preview</strong> · Sample data from the Stitch screen. Add Supabase keys and apply the migration to load your account.</span></div>}
          {error && <p className="notice notice-error" role="alert">{error}</p>}
          {message && <p className="notice notice-success" role="status">{message}</p>}
          {importMessage && <p className="notice notice-success" role="status">{importMessage}</p>}
          <section className="page-heading">
            <div>
              <div className="eyebrow heading-meta"><span>Register</span><span>/</span><strong>Folio 04</strong><span>·</span><span>{preview ? "14 Active Commitments" : `${activeRows.length} Active Commitments`}</span></div>
              <h1>Subscription Obligations</h1>
              <div className="summary-line"><span className="eyebrow">Committed Outflow:</span><strong>{money(displayedMonthly, "USD", currency, currencyRate)} <small>/ mo</small></strong>{currency === "USD" && <span className="summary-conversion">(≈ ₦{Math.round(displayedMonthly * currencyRate).toLocaleString("en-NG")})</span>}<span className="summary-divider" /><span className="eyebrow">Actionable Deadlines:</span><span className="deadline-tag">{deadlineCount} Cutoffs within 7 days</span></div>
            </div>
          <div className="heading-actions"><button className="button button-secondary" onClick={() => exportCsv(filteredRows)} type="button"><Icon>file_download</Icon>Export CSV</button><input accept=".csv,text/csv" aria-label="Choose subscription CSV file" className="sr-only" onChange={(event) => { handleCsvFile(event.target.files?.[0]); event.currentTarget.value = ""; }} ref={fileInput} type="file" /><button className="button button-secondary" disabled={preview} onClick={() => { setImportError(""); setImportRows([]); setImportOpen(true); }} title={preview ? "Connect Supabase to import subscriptions" : undefined} type="button"><Icon>upload_file</Icon>Import CSV</button>{preview ? <button className="button button-secondary" disabled title="Connect Supabase to create a subscription from an invoice" type="button"><Icon>document_scanner</Icon>From invoice</button> : <Link className="button button-secondary" href="/invoices"><Icon>document_scanner</Icon>From invoice</Link>}<form action={batchAuditSubscriptions} className="batch-form">{selectedIds.map((id) => <input key={id} name="id" type="hidden" value={id} />)}<button className="button button-secondary" disabled={preview || selectedIds.length === 0} type="submit"><Icon>checklist_rtl</Icon>Batch Audit{selectedIds.length ? ` (${selectedIds.length})` : ""}</button></form><button className="button button-primary" disabled={preview} onClick={() => { setEditing(undefined); setFormOpen(true); }} title={preview ? "Connect Supabase to save a subscription" : undefined} type="button"><Icon>add</Icon> Add subscription</button></div>
          </section>
          <section aria-label="Subscription filters" className="toolbar">
            <label className="search-field"><Icon>search</Icon><input onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Filter by vendor, domain, seat, or tag..." value={query} /><kbd>/</kbd></label>
            <div aria-label="Filter by status" className="filter-tabs" role="group">
              {(["all", "active", "trial", "needs_review", "archived"] as const).map((status) => <button aria-pressed={filter === status} className={filter === status ? "filter-tab filter-tab-active" : status === "needs_review" ? "filter-tab filter-tab-warning" : "filter-tab"} key={status} onClick={() => { setFilter(status); setPage(1); }} type="button">{status === "needs_review" ? "Needs review" : status === "all" ? "All" : statusLabels[status]} <small>({counts[status]})</small></button>)}
            </div>
            <div className="toolbar-options"><label>Sort:<select onChange={(event) => { setSort(event.target.value); setPage(1); }} value={sort}><option value="renewal_date">Renewal date</option><option value="amount">Outflow</option><option value="vendor">Vendor A–Z</option></select></label><div className="currency-switch"><button aria-pressed={currency === "USD"} onClick={() => setCurrency("USD")} type="button">USD ($)</button><button aria-pressed={currency === "NGN"} onClick={() => setCurrency("NGN")} type="button">NGN (₦)</button></div></div>
          </section>
          <div className="table-scroll">
            <table className="subscription-table">
              <thead><tr><th className="check-cell"><input aria-label="Select all visible subscriptions" checked={pageRows.length > 0 && pageRows.every((row) => selectedIds.includes(row.id))} onChange={(event) => setSelectedIds(event.target.checked ? [...new Set([...selectedIds, ...pageRows.filter((row) => !preview).map((row) => row.id)])] : selectedIds.filter((id) => !pageRows.some((row) => row.id === id)))} type="checkbox" /></th><th>Service / Entity</th><th className="category-cell">Category</th><th className="amount-cell">Burden Amount</th><th className="cycle-cell">Cycle</th><th>Renewal Date</th><th>Cancel By</th><th className="payment-cell">Payment Ledger Instrument</th><th>Status</th><th>Action Docket</th></tr></thead>
              <tbody>
                {pageRows.map((row) => <SubscriptionRow key={row.id} currencyRate={currencyRate} isOnline={isOnline} onEdit={() => { setEditing(row); setFormOpen(true); }} onView={() => setViewing(row)} onSelect={(checked) => setSelectedIds((ids) => checked ? [...new Set([...ids, row.id])] : ids.filter((id) => id !== row.id))} preview={preview} row={row} selected={selectedIds.includes(row.id)} selectedCurrency={currency} />)}
                {filteredRows.length === 0 && <tr><td className={rows.length ? "empty-row" : "empty-row empty-row-first"} colSpan={10}>{rows.length ? <><Icon>filter_list_off</Icon><strong>No entries match this view.</strong><span>Clear the search and status filter to see your subscription records.</span><button className="button button-secondary" onClick={() => { setQuery(""); setFilter("all"); setPage(1); }} type="button">Clear filters</button></> : <><Icon>menu_book</Icon><strong>No subscriptions recorded yet.</strong><span>Add a commitment to keep its renewal date, cost, and cancellation deadline in view.</span>{!preview && <div className="empty-row-actions"><button className="button button-primary" onClick={() => { setEditing(undefined); setFormOpen(true); }} type="button"><Icon>add</Icon>Record first subscription</button><button className="empty-row-import" onClick={() => { setImportError(""); setImportRows([]); setImportOpen(true); }} type="button"><Icon>upload_file</Icon>Or import subscriptions from CSV</button></div>}</>}</td></tr>}
              </tbody>
            </table>
            <div className="table-footer"><span>Showing {filteredRows.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0} to {Math.min(currentPage * PAGE_SIZE, filteredRows.length)} of {filteredRows.length} filtered rows</span><span>Total monthly burden</span><strong>{money(displayedMonthly, "USD", currency, currencyRate)} / mo</strong><div aria-label="Subscription pages" className="pagination"><button disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} type="button">Prev</button><span>Page {currentPage} of {pageCount}</span><button disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} type="button">Next</button></div></div>
          </div>
          <div aria-label="Subscriptions" className="subscription-mobile-list">
            {pageRows.map((row) => <MobileSubscriptionCard key={row.id} currencyRate={currencyRate} isOnline={isOnline} onEdit={() => { setEditing(row); setFormOpen(true); }} onView={() => setViewing(row)} onSelect={(checked) => setSelectedIds((ids) => checked ? [...new Set([...ids, row.id])] : ids.filter((id) => id !== row.id))} preview={preview} row={row} selected={selectedIds.includes(row.id)} selectedCurrency={currency} />)}
            {filteredRows.length === 0 && <div className="mobile-empty-state"><Icon>{rows.length ? "filter_list_off" : "menu_book"}</Icon><strong>{rows.length ? "No entries match this view." : "No subscriptions recorded yet."}</strong><span>{rows.length ? "Clear the search and status filter to see your subscription records." : "Add a commitment to keep its renewal date, cost, and cancellation deadline in view."}</span>{rows.length ? <button className="button button-secondary" onClick={() => { setQuery(""); setFilter("all"); setPage(1); }} type="button">Clear filters</button> : !preview && <div className="empty-row-actions"><button className="button button-primary" onClick={() => { setEditing(undefined); setFormOpen(true); }} type="button"><Icon>add</Icon>Record first subscription</button><button className="empty-row-import" onClick={() => { setImportError(""); setImportRows([]); setImportOpen(true); }} type="button"><Icon>upload_file</Icon>Or import subscriptions from CSV</button></div>}</div>}
            <div className="subscription-mobile-footer"><span>Showing {filteredRows.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0} to {Math.min(currentPage * PAGE_SIZE, filteredRows.length)} of {filteredRows.length}</span><strong>{money(displayedMonthly, "USD", currency, currencyRate)} / mo</strong><div aria-label="Subscription pages" className="pagination"><button disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} type="button">Prev</button><span>Page {currentPage} of {pageCount}</span><button disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} type="button">Next</button></div></div>
          </div>          <footer className="ledger-footer"><span><Icon>account_balance</Icon>Reference Exchange: illustrative benchmark (₦1,550.00 / $1.00 USD).</span><span>Audit trail · Folio In-Sync</span></footer>
        </main>
      </div>
      {formOpen && <NewSubscriptionForm close={() => setFormOpen(false)} row={editing} />}
      {viewing && <SubscriptionDetails currencyRate={currencyRate} isOnline={isOnline} onClose={() => setViewing(undefined)} onEdit={() => { setEditing(viewing); setViewing(undefined); setFormOpen(true); }} onPrefill={(values) => { setEditing({ ...viewing, ...values }); setViewing(undefined); setFormOpen(true); }} preview={preview} row={viewing} selectedCurrency={currency} />}
      {importOpen && <div aria-label="Import subscriptions from CSV" aria-modal="true" className="modal-backdrop" role="dialog"><section className="subscription-form import-preview"><div className="form-heading"><div><p className="eyebrow">Ledger import</p><h2>Review CSV rows</h2></div><button aria-label="Close import preview" className="icon-button" onClick={() => setImportOpen(false)} type="button"><Icon>close</Icon></button></div><p className="import-summary">CSV import adds new records to your ledger; it does not overwrite existing subscriptions. Up to 500 rows are accepted per import. Dates must use YYYY-MM-DD.</p><div className="import-actions"><button className="button button-secondary" onClick={() => fileInput.current?.click()} type="button"><Icon>upload_file</Icon>Choose CSV file</button><button className="button button-secondary" onClick={downloadCsvTemplate} type="button"><Icon>download</Icon>Download template</button></div>{importError && <p className="notice notice-error" role="alert">{importError}</p>}{!importRows.length && !importError && <p className="import-summary">Required columns: vendor, amount, currency, renewal_date. Optional columns default to monthly, active, and Other.</p>}{importRows.length > 0 && <><p className="import-count">{importRows.filter((entry) => entry.draft).length} valid · {importRows.filter((entry) => entry.error).length} need correction</p><div className="import-row-list">{importRows.slice(0, 8).map((entry) => <div key={entry.rowNumber}><strong>Row {entry.rowNumber}: {entry.draft?.vendor ?? "Invalid row"}</strong><span>{entry.error ?? `${entry.draft?.currency} ${entry.draft?.amount} · ${entry.draft?.billing_cycle} · ${entry.draft?.renewal_date}`}</span></div>)}{importRows.length > 8 && <small>And {importRows.length - 8} more rows…</small>}</div></>}<div className="form-actions"><button className="button button-secondary" onClick={() => setImportOpen(false)} type="button">Cancel</button><button className="button button-primary" disabled={isImporting || !importRows.length || Boolean(importError) || importRows.some((entry) => Boolean(entry.error))} onClick={confirmImport} type="button">{isImporting ? "Importing…" : `Import ${importRows.length || "rows"}`}</button></div></section></div>}
    </div>
  );
}

export function SubscriptionAuth({ error, message }: { error?: string; message?: string }) {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-row auth-brand"><span className="brand-name">RenewMe</span><span className="folio-version">FOLIO V2.4</span></div>
        <p className="eyebrow">Subscription ledger</p><h1>Open your ledger.</h1><p className="auth-intro">Sign in to review your commitments and renewal dates.</p>
        {error && <p className="notice notice-error" role="alert">{error}</p>}{message && <p className="notice notice-success" role="status">{message}</p>}
        <form action={signInAction} className="auth-form"><label>Email address<input autoComplete="email" name="email" required type="email" /></label><label>Password<input autoComplete="current-password" minLength={8} name="password" required type="password" /></label><button className="button button-primary" type="submit">Open ledger</button></form>
        <Link className="auth-return-link" href="/forgot-password">Forgot your password?</Link>
        <details className="signup-details"><summary>New to RenewMe? Create an account</summary><form action={signUpAction} className="auth-form"><label>Email address<input autoComplete="email" name="email" required type="email" /></label><label>Password<input autoComplete="new-password" minLength={8} name="password" required type="password" /></label><button className="button button-secondary" type="submit">Create account</button></form><small>We’ll send a confirmation link to your email.</small></details>
        <details className="signup-details"><summary>Already signed up? Resend confirmation</summary><form action={resendSignupConfirmation} className="auth-form"><label>Email address<input autoComplete="email" name="email" required type="email" /></label><button className="button button-secondary" type="submit">Send a new confirmation link</button></form></details>
      </section>
    </main>
  );
}
