import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Reminder = {
  result_delivery_id: string;
  result_recipient_email: string | null;
  result_vendor: string;
  result_service_details: string | null;
  result_amount: number;
  result_currency: string;
  result_billing_cycle: string;
  result_reminder_type: string;
  result_due_date: string;
  result_attempt_count: number;
};

function htmlText(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function getReminderLabel(type: string) {
  const deadline = type.startsWith("cancellation") ? "cancellation cutoff" : "renewal";
  const timing = type.endsWith("7_days") ? "in 7 days" : "tomorrow";
  return { deadline, timing };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function formatAmount(amount: number, currency: string, cycle: string) {
  let total: string;
  try { total = new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount); }
  catch { total = `${currency} ${amount.toFixed(2)}`; }
  const cadence = cycle === "annual" ? "year" : cycle === "quarterly" ? "quarter" : "month";
  return `${total} per ${cadence}`;
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return Response.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!resendKey || !from) return Response.json({ error: "Email delivery is not configured." }, { status: 503 });
  const supabase = createAdminClient();
  if (!supabase) return Response.json({ error: "SUPABASE_SECRET_KEY is not configured." }, { status: 503 });

  const today = new Date().toISOString().slice(0, 10);
  let claim;
  try {
    claim = await supabase.rpc("renewme_claim_due_reminders", { p_today: today });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Supabase request failed.";
    console.error("Reminder claim request failed:", message);
    return Response.json({
      error: "Could not contact Supabase to claim reminder emails.",
      ...(process.env.NODE_ENV === "development" ? { debug: message } : {}),
    }, { status: 502 });
  }
  const { data, error } = claim;
  if (error) {
    console.error("Could not claim due reminder emails:", error.code, error.message);
    return Response.json({
      error: "Could not claim due reminder emails.",
      ...(process.env.NODE_ENV === "development" ? { debug: { code: error.code, message: error.message } } : {}),
    }, { status: 500 });
  }

  let sent = 0;
  let failed = 0;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  for (const reminder of (data ?? []) as Reminder[]) {
    let providerMessageId: string | null = null;
    let deliveryError: string | null = null;
    try {
      if (!reminder.result_recipient_email) throw new Error("The account has no email address.");
      const { deadline, timing } = getReminderLabel(reminder.result_reminder_type);
      const vendor = htmlText(reminder.result_vendor);
      const detail = reminder.result_service_details ? `<p>${htmlText(reminder.result_service_details)}</p>` : "";
      const amount = formatAmount(reminder.result_amount, reminder.result_currency, reminder.result_billing_cycle);
      const due = formatDate(reminder.result_due_date);
      const subject = `${reminder.result_vendor}: ${deadline} ${timing}`;
      const text = `${reminder.result_vendor} ${deadline} is due ${timing} (${due}). Amount: ${amount}. Review your subscription: ${siteUrl}/subscriptions`;
      const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:24px auto;padding:24px;color:#1c1b18;border:1px solid #ddd8cb"><p style="color:#1f4d3a;font-size:12px;letter-spacing:.08em;text-transform:uppercase">RenewMe reminder</p><h1 style="font-size:24px">${vendor} ${htmlText(deadline)} ${htmlText(timing)}</h1>${detail}<p><strong>${htmlText(due)}</strong></p><p>${htmlText(amount)}</p><p><a href="${htmlText(siteUrl)}/subscriptions" style="display:inline-block;background:#1f4d3a;color:#fff;padding:12px 16px;text-decoration:none">Open your ledger</a></p><p style="color:#6b675e;font-size:12px">Manage reminder emails in <a href="${htmlText(siteUrl)}/settings">RenewMe settings</a>.</p></div>`;
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `renewme-reminder-${reminder.result_delivery_id}`,
        },
        body: JSON.stringify({ from, to: reminder.result_recipient_email, subject, html, text }),
        cache: "no-store",
      });
      const providerResponse: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = providerResponse && typeof providerResponse === "object" && "message" in providerResponse
          ? String(providerResponse.message)
          : `Email provider returned ${response.status}.`;
        throw new Error(message);
      }
      if (providerResponse && typeof providerResponse === "object" && "id" in providerResponse) providerMessageId = String(providerResponse.id);
    } catch (caught) {
      deliveryError = caught instanceof Error ? caught.message : "Email delivery failed.";
    }

    const { error: finishError } = await supabase.rpc("renewme_finish_reminder", {
      p_delivery_id: reminder.result_delivery_id,
      p_sent: deliveryError === null,
      p_provider_message_id: providerMessageId,
      p_error: deliveryError,
    });
    if (finishError || deliveryError) failed += 1;
    else sent += 1;
  }

  return Response.json({ processed: sent + failed, sent, failed });
}
