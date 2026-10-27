import { createClient } from "@/lib/supabase/client";

export type SavedInvoiceAttachment = {
  id: string;
  renewal_id: string | null;
  file_name: string;
  content_type: string;
  file_size: number;
  created_at: string;
  signedUrl: string;
};

export async function attachInvoiceFile(subscriptionId: string, file: File, renewalId?: string): Promise<{ success: true; attachment: SavedInvoiceAttachment } | { success: false; error: string }> {
  if (file.size < 1 || file.size > 25 * 1024 * 1024) return { success: false, error: "Choose a file smaller than 25 MB." };
  const extensionByType: Record<string, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
  const extension = extensionByType[file.type];
  if (!extension) return { success: false, error: "Use a PDF, PNG, JPG, or WebP file." };

  const supabase = createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (!user || userError) return { success: false, error: "Sign in again to attach an invoice." };

  const filePath = `${user.id}/${subscriptionId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from("renewme-invoices").upload(filePath, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    return { success: false, error: uploadError.message.includes("Bucket not found") ? "Apply the subscription invoice attachments migration to create private file storage." : uploadError.message };
  }

  const { data: record, error: recordError } = await supabase.from("renewme_subscription_invoices").insert({
    user_id: user.id,
    subscription_id: subscriptionId,
    renewal_id: renewalId ?? null,
    file_path: filePath,
    file_name: file.name.slice(0, 255),
    content_type: file.type,
    file_size: file.size,
  }).select("id, renewal_id, file_name, content_type, file_size, created_at").single();
  if (recordError) {
    await supabase.storage.from("renewme-invoices").remove([filePath]);
    return { success: false, error: recordError.message.includes("renewme_subscription_invoices") ? "Apply the subscription invoice attachments migration to enable invoice records." : recordError.message };
  }

  const { data: signed } = await supabase.storage.from("renewme-invoices").createSignedUrl(filePath, 3600);
  return { success: true, attachment: { ...record, signedUrl: signed?.signedUrl ?? "" } };
}
