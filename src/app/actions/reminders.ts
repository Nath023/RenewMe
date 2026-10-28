"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function deleteSentReminderHistory(deliveryId: string): Promise<{ success: true } | { success: false; error: string }> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(deliveryId)) {
    return { success: false, error: "Invalid reminder record." };
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { success: false, error: "Sign in to manage reminder history." };

  const { data, error } = await supabase
    .from("renewme_reminder_deliveries")
    .delete()
    .eq("id", deliveryId)
    .eq("user_id", user.id)
    .eq("status", "sent")
    .select("id")
    .maybeSingle();

  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: "Only sent reminders can be deleted from history." };

  revalidatePath("/reminders");
  return { success: true };
}
