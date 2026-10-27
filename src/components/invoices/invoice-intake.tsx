"use client";

import Link from "next/link";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { createSubscriptionFromInvoice } from "@/app/actions/subscriptions";
import { extractInvoiceText, type InvoiceExtraction } from "@/lib/invoices/extract";
import { attachInvoiceFile } from "@/lib/invoices/storage";

const acceptedTypes = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);

export function InvoiceIntake({ accountName }: { accountName: string }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [extraction, setExtraction] = useState<InvoiceExtraction | null>(null);
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [renewalDate, setRenewalDate] = useState("");
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [category, setCategory] = useState("Other");
  const [serviceDetails, setServiceDetails] = useState("");
  const [cancelBy, setCancelBy] = useState("");
  const [paymentInstrument, setPaymentInstrument] = useState("");
  const [progress, setProgress] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAttaching, setIsAttaching] = useState(false);
  const [subscriptionId, setSubscriptionId] = useState("");
  const [invoiceAttached, setInvoiceAttached] = useState(false);
  const [error, setError] = useState("");

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0] ?? null;
    event.target.value = "";
    setError("");
    setExtraction(null);
    if (!chosen) return;
    if (!acceptedTypes.has(chosen.type)) { setError("Choose a PDF, PNG, JPG, or WebP invoice."); return; }
    if (chosen.size < 1 || chosen.size > 25 * 1024 * 1024) { setError("Invoice files must be smaller than 25 MB."); return; }
    setFile(chosen);
    setIsExtracting(true);
    setProgress("Preparing invoice…");
    try {
      const result = await extractInvoiceText(chosen, (status, fraction) => setProgress(fraction === undefined ? status : `${status} · ${Math.round(fraction * 100)}%`));
      if (!result.text) throw new Error("No readable text was found. You can still enter the subscription details manually.");
      setExtraction(result);
      if (result.candidates.vendor) setVendor((current) => current || result.candidates.vendor || "");
      if (result.candidates.amount !== undefined) setAmount((current) => current || String(result.candidates.amount));
      if (result.candidates.currency) setCurrency(result.candidates.currency);
      if (result.candidates.renewal_date) setRenewalDate((current) => current || result.candidates.renewal_date || "");
      if (result.candidates.billing_cycle) setBillingCycle(result.candidates.billing_cycle);
      if (result.candidates.service_details) setServiceDetails((current) => current || result.candidates.service_details || "");
      if (result.candidates.category) setCategory((current) => current === "Other" ? result.candidates.category || current : current);
      if (result.candidates.cancel_by) setCancelBy((current) => current || result.candidates.cancel_by || "");
      if (result.candidates.payment_instrument) setPaymentInstrument((current) => current || result.candidates.payment_instrument || "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read this invoice. Enter the subscription details manually.");
    } finally {
      setIsExtracting(false);
      setProgress("");
    }
  }

  async function attachInvoice(id: string) {
    if (!file) return;
    setIsAttaching(true);
    setError("");
    const result = await attachInvoiceFile(id, file);
    if (!result.success) setError(`Subscription saved, but the invoice could not be attached: ${result.error}`);
    else setInvoiceAttached(true);
    setIsAttaching(false);
  }

  async function saveSubscription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) { setError("Choose an invoice file before creating the subscription."); return; }
    setIsSaving(true);
    setError("");
    const result = await createSubscriptionFromInvoice(new FormData(event.currentTarget));
    if (!result.success) {
      setError(result.error);
      setIsSaving(false);
      return;
    }
    setSubscriptionId(result.id);
    await attachInvoice(result.id);
    setIsSaving(false);
  }

  if (subscriptionId) {
    return (
      <main className="invoice-intake-page">
        <header className="invoice-intake-topbar"><Link className="brand-name" href="/dashboard">RenewMe</Link><span>{accountName}</span></header>
        <section className="invoice-complete-card">
          <span className="invoice-complete-icon material-symbols-outlined">{invoiceAttached ? "task_alt" : "save"}</span>
          <p className="eyebrow">Invoice ledger entry</p>
          <h1>{invoiceAttached ? "Subscription recorded." : "Subscription saved."}</h1>
          <p>{invoiceAttached ? "The subscription and its invoice are now in your ledger." : "The subscription is saved. Attach the invoice again to retry; the file was not stored."}</p>
          {error && <p className="notice notice-error" role="alert">{error}</p>}
          {!invoiceAttached && <button className="button button-primary" disabled={isAttaching} onClick={() => void attachInvoice(subscriptionId)} type="button">{isAttaching ? "Attaching…" : "Retry invoice attachment"}</button>}
          <div className="invoice-complete-links"><Link className="button button-primary" href="/subscriptions">Open subscriptions</Link><Link href="/dashboard">Go to dashboard</Link></div>
        </section>
      </main>
    );
  }

  return (
    <main className="invoice-intake-page">
      <header className="invoice-intake-topbar"><Link className="brand-name" href="/dashboard">RenewMe</Link><span>{accountName}</span></header>
      <div className="invoice-intake-content">
        <Link className="invoice-back-link" href="/subscriptions"><span aria-hidden="true">←</span> Back to subscriptions</Link>
        <div className="invoice-intake-heading"><div><p className="eyebrow">Invoice ingestion · Ledger entry</p><h1>Create from invoice.</h1><p>Upload an invoice, review the suggested subscription details, and save the file with the new ledger entry.</p></div><span className="invoice-protocol-tag"><i /> PRIVATE · REVIEW BEFORE SAVING</span></div>
        {error && <p className="notice notice-error" role="alert">{error}</p>}
        <div className="invoice-intake-grid">
          <section className="invoice-intake-source">
            <div className="invoice-section-label"><span>REGISTER 01 · SOURCE DOCUMENT</span><span>PDF / IMAGE</span></div>
            <button className="invoice-dropzone" onClick={() => fileInput.current?.click()} type="button"><span className="material-symbols-outlined">{file?.type === "application/pdf" ? "picture_as_pdf" : "upload_file"}</span><strong>{file ? file.name : "Choose an invoice or receipt"}</strong><small>PDF, PNG, JPG, or WebP · up to 25 MB</small><span className="button button-secondary">{file ? "Choose a different file" : "Browse files"}</span></button>
            <input accept="application/pdf,image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => void chooseFile(event)} ref={fileInput} type="file" />
            {isExtracting && <p className="invoice-progress" role="status"><span className="material-symbols-outlined">progress_activity</span>{progress || "Reading invoice in this browser…"}</p>}
            <div className="invoice-privacy-note"><span className="material-symbols-outlined">verified_user</span><span><strong>Private document handling</strong><small>Invoice contents are read in this browser. No OCR service receives the file.</small></span></div>
            {extraction && <div className="invoice-extraction-review intake-extraction"><div><strong>Extracted candidates</strong><small>These are suggestions. Confirm them against the original invoice.</small></div><dl>{([ ["Vendor", extraction.candidates.vendor], ["Amount", extraction.candidates.amount], ["Currency", extraction.candidates.currency], ["Renewal date", extraction.candidates.renewal_date], ["Billing cycle", extraction.candidates.billing_cycle], ["Plan details", extraction.candidates.service_details], ["Category", extraction.candidates.category], ["Payment method", extraction.candidates.payment_instrument], ["Cancel by", extraction.candidates.cancel_by], ["Invoice number · review only", extraction.candidates.invoice_number], ["Billing period · review only", extraction.candidates.billing_period] ] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? "Not found"}</dd></div>)}</dl><details><summary>Review extracted text</summary><pre>{extraction.text.slice(0, 8000)}{extraction.text.length > 8000 ? "\n… text trimmed" : ""}</pre></details></div>}
          </section>
          <section className="invoice-intake-form-section">
            <div className="invoice-section-label"><span>REGISTER 02 · REVIEW DETAILS</span><span>NOT SAVED YET</span></div>
            <form className="invoice-draft-form" onSubmit={(event) => void saveSubscription(event)}>
              <p className="invoice-form-intro">Check each field before creating the subscription. OCR suggestions can be incomplete or incorrect.</p>
              <label>Vendor / service<input autoComplete="organization" maxLength={250} name="vendor" onChange={(event) => setVendor(event.target.value)} required value={vendor} /></label>
              <label>Service details<input maxLength={500} name="service_details" onChange={(event) => setServiceDetails(event.target.value)} placeholder="Plan, seats, domain, or workspace" value={serviceDetails} /></label>
              <div className="form-grid"><label>Billing amount<input min="0" name="amount" onChange={(event) => setAmount(event.target.value)} required step="0.01" type="number" value={amount} /></label><label>Currency<select name="currency" onChange={(event) => setCurrency(event.target.value)} value={currency}><option value="USD">USD ($)</option><option value="NGN">NGN (₦)</option></select></label></div>
              <div className="form-grid"><label>Billing cycle<select name="billing_cycle" onChange={(event) => setBillingCycle(event.target.value)} value={billingCycle}><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option></select></label><label>Next renewal<input name="renewal_date" onChange={(event) => setRenewalDate(event.target.value)} required type="date" value={renewalDate} /></label></div>
              <div className="form-grid"><label>Category<input maxLength={100} name="category" onChange={(event) => setCategory(event.target.value)} value={category} /></label><label>Cancel by<input name="cancel_by" onChange={(event) => setCancelBy(event.target.value)} type="date" value={cancelBy} /></label></div>
              <label>Payment method<input maxLength={250} name="payment_instrument" onChange={(event) => setPaymentInstrument(event.target.value)} placeholder="Card or account reference" value={paymentInstrument} /></label>
              <div className="invoice-form-warning"><span className="material-symbols-outlined">edit_note</span><span>Only fields you review and submit are saved. Your invoice is attached to the new subscription after it is created.</span></div>
              <button className="button button-primary invoice-create-button" disabled={!file || isSaving || isAttaching} type="submit"><span className="material-symbols-outlined">{isSaving || isAttaching ? "progress_activity" : "add_circle"}</span>{isSaving || isAttaching ? "Saving subscription…" : "Create subscription and attach invoice"}</button>
              <Link className="invoice-cancel-link" href="/subscriptions">Cancel</Link>
            </form>
          </section>
        </div>
        <footer className="invoice-intake-footer"><span>ACCOUNT · {accountName}</span><span>RENEWME · PRIVATE SUBSCRIPTION LEDGER</span></footer>
      </div>
    </main>
  );
}
