"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";

export async function saveEmailReminderPreference(formData: FormData) {
  if (!hasSupabaseConfig()) redirect("/subscriptions?formError=Configure%20Supabase%20before%20saving%20preferences");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/subscriptions?authError=Sign%20in%20to%20change%20reminder%20settings");

  const emailEnabled = formData.get("email_enabled") === "true";
  const { error } = await supabase
    .from("renewme_reminder_preferences")
    .upsert({ user_id: user.id, email_enabled: emailEnabled }, { onConflict: "user_id" });
  if (error) redirect(`/settings?settingsError=${encodeURIComponent(error.message)}`);

  revalidatePath("/settings");
  redirect(`/settings?settingsMessage=${encodeURIComponent(emailEnabled ? "Email renewal reminders enabled." : "Email renewal reminders turned off.")}`);
}

export async function saveOnboardingProfile(formData: FormData) {
  if (!hasSupabaseConfig()) redirect("/onboarding?error=Configure%20Supabase%20before%20saving%20your%20setup");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?error=Sign%20in%20to%20finish%20setup");

  const ledgerName = String(formData.get("ledger_name") ?? "").trim().slice(0, 100) || "My ledger";
  const currency = String(formData.get("reporting_currency") ?? "NGN");
  const emailEnabled = formData.get("email_enabled") === "true";
  if (currency !== "NGN" && currency !== "USD") redirect("/onboarding?error=Choose%20NGN%20or%20USD%20as%20your%20display%20currency");

  const { error: profileError } = await supabase.auth.updateUser({
    data: { renewme_ledger_name: ledgerName, renewme_reporting_currency: currency, renewme_onboarding_complete: true },
  });
  if (profileError) redirect(`/onboarding?error=${encodeURIComponent(profileError.message)}`);

  const { error: preferenceError } = await supabase.from("renewme_reminder_preferences").upsert(
    { user_id: user.id, email_enabled: emailEnabled },
    { onConflict: "user_id" },
  );
  if (preferenceError) redirect(`/onboarding?error=${encodeURIComponent(preferenceError.message)}`);
  redirect("/dashboard?authMessage=Your%20RenewMe%20ledger%20is%20ready");
}

export async function sendTestReminderEmail() {
  if (!hasSupabaseConfig()) redirect("/settings?settingsError=Configure%20Supabase%20before%20sending%20a%20test");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect("/subscriptions?authError=Sign%20in%20with%20an%20email%20account%20to%20send%20a%20test");

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) redirect("/settings?settingsError=Add%20RESEND_API_KEY%20and%20RESEND_FROM_EMAIL%20to%20the%20server%20environment");

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `renewme-test-${user.id}-${Date.now()}` },
    body: JSON.stringify({
      from,
      to: user.email,
      subject: "RenewMe email reminders are connected",
      text: `This is a test email from RenewMe. Your reminder emails will link to ${origin}/settings.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:24px auto;padding:24px;color:#1c1b18;border:1px solid #ddd8cb"><p style="color:#1f4d3a;font-size:12px;letter-spacing:.08em;text-transform:uppercase">RenewMe test</p><h1 style="font-size:24px">Email delivery is connected.</h1><p>This test confirms RenewMe can send email to your signed-in address.</p><p><a href="${origin}/settings">Manage reminder settings</a></p></div>`,
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const providerMessage = body && typeof body === "object" && "message" in body ? String(body.message) : `Email provider returned ${response.status}.`;
    redirect(`/settings?settingsError=${encodeURIComponent(providerMessage)}`);
  }
  revalidatePath("/settings");
  redirect("/settings?settingsMessage=Test%20email%20sent%20to%20your%20signed-in%20address.");
}
