import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const requestedType = request.nextUrl.searchParams.get("type");
  const otpTypes = new Set<EmailOtpType>(["signup", "invite", "magiclink", "recovery", "email_change", "email"]);
  const requestedNext = request.nextUrl.searchParams.get("next") ?? "/onboarding";
  const isPasswordReset = request.nextUrl.searchParams.get("flow") === "reset";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//")
    ? requestedNext
    : "/subscriptions";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  } else if (tokenHash && requestedType && otpTypes.has(requestedType as EmailOtpType)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: requestedType as EmailOtpType });
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }

  const failurePath = isPasswordReset
    ? "/forgot-password?error=Password%20reset%20link%20is%20invalid%20or%20expired.%20Request%20a%20new%20one."
    : "/sign-in?error=That%20email%20link%20is%20invalid%20or%20expired.%20Request%20a%20fresh%20confirmation%20email.";
  return NextResponse.redirect(new URL(failurePath, request.url));
}
