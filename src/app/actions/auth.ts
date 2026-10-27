"use server";

import { redirect } from "next/navigation";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export async function signInAction(formData: FormData) {
  if (!hasSupabaseConfig()) redirect("/sign-in?error=Supabase%20is%20not%20configured");
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) redirect("/sign-in?error=Enter%20your%20email%20and%20password");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/sign-in?error=${encodeURIComponent(error.message)}`);
  redirect("/dashboard");
}

export async function signUpAction(formData: FormData) {
  if (!hasSupabaseConfig()) redirect("/sign-up?error=Supabase%20is%20not%20configured");
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || password.length < 8) {
    redirect("/sign-up?error=Use%20a%20valid%20email%20and%20a%20password%20of%20at%20least%208%20characters");
  }

  const supabase = await createClient();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/callback?next=/onboarding` },
  });
  if (error) redirect(`/sign-up?error=${encodeURIComponent(error.message)}`);
  const { data: { session } } = await supabase.auth.getSession();
  if (session) redirect("/onboarding");
  redirect("/sign-up?message=Check%20your%20email%20to%20confirm%20your%20account");
}

export async function resendSignupConfirmation(formData: FormData) {
  const returnTo = String(formData.get("return_to") ?? "/sign-up");
  const destination = returnTo === "/sign-in" ? "/sign-in" : "/sign-up";
  if (!hasSupabaseConfig()) redirect(`${destination}?error=Supabase%20is%20not%20configured`);
  const email = String(formData.get("email") ?? "").trim();
  if (!email) redirect(`${destination}?error=Enter%20your%20email%20address`);

  const supabase = await createClient();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${origin}/auth/callback?next=/onboarding` },
  });
  if (error) redirect(`${destination}?error=${encodeURIComponent(error.message)}`);
  redirect(`${destination}?message=If%20confirmation%20is%20still%20needed%2C%20a%20fresh%20email%20has%20been%20sent`);
}

export async function requestPasswordReset(formData: FormData) {
  if (!hasSupabaseConfig()) redirect("/forgot-password?error=Supabase%20is%20not%20configured");
  const email = String(formData.get("email") ?? "").trim();
  if (!email) redirect("/forgot-password?error=Enter%20your%20email%20address");

  const supabase = await createClient();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const redirectTo = new URL("/auth/callback?next=%2Fauth%2Fupdate-password&flow=reset", origin).toString();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) redirect(`/forgot-password?error=${encodeURIComponent(error.message)}`);
  redirect("/forgot-password?message=If%20an%20account%20exists%20for%20that%20email%2C%20a%20password%20reset%20link%20has%20been%20sent");
}

export async function updatePasswordAction(formData: FormData) {
  if (!hasSupabaseConfig()) redirect("/subscriptions?authError=Supabase%20is%20not%20configured");
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmPassword") ?? "");
  if (password.length < 8) redirect("/auth/update-password?error=Choose%20a%20password%20with%20at%20least%208%20characters");
  if (password !== confirmation) redirect("/auth/update-password?error=The%20passwords%20do%20not%20match");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/forgot-password?error=Open%20the%20password%20reset%20link%20from%20your%20email%20first");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect(`/auth/update-password?error=${encodeURIComponent(error.message)}`);
  redirect("/sign-in?message=Your%20password%20has%20been%20updated.%20Sign%20in%20with%20your%20new%20password.");
}

export async function signOutAction() {
  if (hasSupabaseConfig()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/subscriptions");
}
