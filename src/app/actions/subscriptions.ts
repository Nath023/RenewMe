"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { BillingCycle, SubscriptionDraft, SubscriptionStatus } from "@/lib/subscriptions/types";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";

function stringValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

async function requireUser() {
  if (!hasSupabaseConfig()) {
    redirect("/subscriptions?formError=Configure%20Supabase%20before%20saving%20subscriptions");
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/subscriptions?authError=Sign%20in%20to%20manage%20subscriptions");
  return supabase;
}

function readDraft(formData: FormData) {
  const vendor = stringValue(formData, "vendor");
  const amount = Number(formData.get("amount"));
  const renewalDate = stringValue(formData, "renewal_date");
  const cycle = stringValue(formData, "billing_cycle");
  const status = stringValue(formData, "status");
  const serviceUrl = stringValue(formData, "service_url");
  const startDate = stringValue(formData, "contract_start_date");
  const actualNgnText = stringValue(formData, "actual_ngn_amount");
  const actualNgnAmount = actualNgnText ? Number(actualNgnText) : null;
  const costCenter = stringValue(formData, "cost_center");
  const accountableOperator = stringValue(formData, "accountable_operator");
  const notes = stringValue(formData, "notes");
  const isDate = (date: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const parsed = new Date(`${date}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
  };
  if (!vendor || !Number.isFinite(amount) || amount < 0 || !renewalDate) {
    redirect("/subscriptions?formError=Add%20a%20vendor%2C%20valid%20amount%2C%20and%20renewal%20date");
  }
  if (serviceUrl) {
    try {
      const parsedUrl = new URL(serviceUrl);
      if (!/^https?:$/.test(parsedUrl.protocol) || serviceUrl.length > 2048) throw new Error("invalid URL");
    } catch {
      redirect("/subscriptions?formError=Enter%20a%20valid%20service%20URL%20starting%20with%20https%3A%2F%2F");
    }
  }
  if (startDate && (!isDate(startDate) || startDate > renewalDate)) redirect("/subscriptions?formError=Contract%20start%20date%20must%20be%20valid%20and%20no%20later%20than%20renewal");
  if (actualNgnText && (!Number.isFinite(actualNgnAmount) || actualNgnAmount! < 0 || actualNgnAmount! > 9_999_999_999.99)) redirect("/subscriptions?formError=Enter%20a%20valid%20actual%20NGN%20charge");
  if (costCenter.length > 100 || accountableOperator.length > 150 || notes.length > 2000) redirect("/subscriptions?formError=Cost%20center%2C%20owner%2C%20or%20notes%20exceed%20the%20allowed%20length");

  return {
    vendor,
    amount,
    renewal_date: renewalDate,
    category: stringValue(formData, "category") || "Other",
    service_details: stringValue(formData, "service_details") || null,
    currency: stringValue(formData, "currency") || "USD",
    billing_cycle: (cycle || "monthly") as BillingCycle,
    cancel_by: stringValue(formData, "cancel_by") || null,
    payment_instrument: stringValue(formData, "payment_instrument") || null,
    service_url: serviceUrl || null,
    contract_start_date: startDate || null,
    actual_ngn_amount: actualNgnAmount,
    cost_center: costCenter || null,
    accountable_operator: accountableOperator || null,
    notes: notes || null,
    status: (status || "active") as SubscriptionStatus,
  };
}

export async function createSubscription(formData: FormData) {
  const supabase = await requireUser();
  const { error } = await supabase.from("subscriptions").insert(readDraft(formData));
  if (error) redirect(`/subscriptions?formError=${encodeURIComponent(error.message)}`);
  revalidatePath("/subscriptions");
}

export async function createSubscriptionFromInvoice(formData: FormData): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const supabase = await requireUser();
  const { data, error } = await supabase.from("subscriptions").insert(readDraft(formData)).select("id").single();
  if (error) return { success: false, error: error.message };
  for (const path of ["/subscriptions", "/dashboard", "/calendar", "/reports", "/reminders", "/invoices"]) revalidatePath(path);
  return { success: true, id: data.id };
}

export async function updateSubscription(formData: FormData) {
  const supabase = await requireUser();
  const id = stringValue(formData, "id");
  if (!id) redirect("/subscriptions?formError=Subscription%20ID%20is%20missing");
  const { data, error } = await supabase
    .from("subscriptions")
    .update({ ...readDraft(formData), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) redirect(`/subscriptions?formError=${encodeURIComponent(error.message)}`);
  if (!data) redirect("/subscriptions?formError=Subscription%20not%20found%20or%20you%20do%20not%20have%20access");

  for (const path of ["/subscriptions", "/dashboard", "/calendar", "/reminders", "/reports", "/settings"]) {
    revalidatePath(path);
  }
  redirect("/subscriptions?authMessage=Subscription%20updated%20successfully");
}

export async function archiveSubscription(formData: FormData) {
  const supabase = await requireUser();
  const id = stringValue(formData, "id");
  if (!id) redirect("/subscriptions?formError=Subscription%20ID%20is%20missing");
  const { error } = await supabase
    .from("subscriptions")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) redirect(`/subscriptions?formError=${encodeURIComponent(error.message)}`);
  revalidatePath("/subscriptions");
}

export async function batchAuditSubscriptions(formData: FormData) {
  const supabase = await requireUser();
  const ids = formData.getAll("id").map(String).filter(Boolean);
  if (!ids.length) redirect("/subscriptions?formError=Select%20at%20least%20one%20subscription");
  const { error } = await supabase
    .from("subscriptions")
    .update({ status: "needs_review", updated_at: new Date().toISOString() })
    .in("id", ids);
  if (error) redirect(`/subscriptions?formError=${encodeURIComponent(error.message)}`);
  revalidatePath("/subscriptions");
}

const validCycles = new Set<BillingCycle>(["monthly", "quarterly", "annual"]);
const validStatuses = new Set<SubscriptionStatus>(["active", "trial", "needs_review", "archived"]);

function importDraft(value: unknown): SubscriptionDraft | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const vendor = typeof row.vendor === "string" ? row.vendor.trim() : "";
  const amount = Number(row.amount);
  const currency = typeof row.currency === "string" ? row.currency.trim().toUpperCase() : "";
  const renewalDate = typeof row.renewal_date === "string" ? row.renewal_date.trim() : "";
  const cycle = typeof row.billing_cycle === "string" ? row.billing_cycle : "monthly";
  const status = typeof row.status === "string" ? row.status : "active";
  const cancelBy = typeof row.cancel_by === "string" && row.cancel_by.trim() ? row.cancel_by.trim() : null;
  const serviceUrl = typeof row.service_url === "string" ? row.service_url.trim() : "";
  const contractStartDate = typeof row.contract_start_date === "string" ? row.contract_start_date.trim() : "";
  const actualNgnAmount = row.actual_ngn_amount === null || row.actual_ngn_amount === undefined || row.actual_ngn_amount === "" ? null : Number(row.actual_ngn_amount);
  const isDate = (date: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const parsed = new Date(`${date}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
  };

  if (!vendor || vendor.length > 250 || !Number.isFinite(amount) || amount < 0 || amount > 9_999_999_999.99 || !/^[A-Z]{3}$/.test(currency)) return null;
  if (!isDate(renewalDate) || (cancelBy && (!isDate(cancelBy) || cancelBy > renewalDate))) return null;
  if ((contractStartDate && (!isDate(contractStartDate) || contractStartDate > renewalDate)) || (actualNgnAmount !== null && (!Number.isFinite(actualNgnAmount) || actualNgnAmount < 0 || actualNgnAmount > 9_999_999_999.99))) return null;
  if (serviceUrl) { try { const parsed = new URL(serviceUrl); if (!/^https?:$/.test(parsed.protocol) || serviceUrl.length > 2048) return null; } catch { return null; } }
  if (!validCycles.has(cycle as BillingCycle) || !validStatuses.has(status as SubscriptionStatus)) return null;

  const optionalText = (key: string, max: number) => {
    const text = typeof row[key] === "string" ? (row[key] as string).trim() : "";
    return text ? text.slice(0, max) : null;
  };
  return {
    vendor,
    amount,
    currency,
    renewal_date: renewalDate,
    billing_cycle: cycle as BillingCycle,
    status: status as SubscriptionStatus,
    category: (optionalText("category", 100) ?? "Other"),
    service_details: optionalText("service_details", 500),
    cancel_by: cancelBy,
    payment_instrument: optionalText("payment_instrument", 250),
    service_url: serviceUrl || null,
    contract_start_date: contractStartDate || null,
    actual_ngn_amount: actualNgnAmount,
    cost_center: optionalText("cost_center", 100),
    accountable_operator: optionalText("accountable_operator", 150),
    notes: optionalText("notes", 2000),
  };
}

export async function importSubscriptions(values: unknown): Promise<{ success: true; count: number } | { success: false; error: string }> {
  const supabase = await requireUser();
  if (!Array.isArray(values) || values.length < 1 || values.length > 500) {
    return { success: false, error: "Import between 1 and 500 subscription rows at a time." };
  }

  const drafts = values.map(importDraft);
  if (drafts.some((draft) => draft === null)) {
    return { success: false, error: "The import contains invalid values. Review the CSV rows and try again." };
  }

  const { error } = await supabase.from("subscriptions").insert(drafts as SubscriptionDraft[]);
  if (error) return { success: false, error: error.message };
  revalidatePath("/subscriptions");
  return { success: true, count: drafts.length };
}
