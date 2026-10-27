import "server-only";

import { createClient as createSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type AdminAccount = {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  emailConfirmedAt: string | null;
  bannedUntil: string | null;
  isAdmin: boolean;
  canManage: boolean;
};

async function getAdminContext() {
  const sessionClient = await createSupabaseClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return { error: "Sign in with an administrator account.", userId: null, admin: null, sessionClient };

  const { data: isAdmin, error } = await sessionClient.rpc("renewme_is_admin");
  if (error) return { error: "Could not verify administrator access. Confirm the admin migration is applied.", userId: user.id, admin: null, sessionClient };
  if (!isAdmin) return { error: "Administrator access is required.", userId: user.id, admin: null, sessionClient };

  const admin = createAdminClient();
  if (!admin) return { error: "Add SUPABASE_SECRET_KEY to .env.local and restart Next.js to enable account management.", userId: user.id, admin: null, sessionClient };
  return { error: null, userId: user.id, admin, sessionClient };
}

export async function getAdminAccounts(search = "", page = 1) {
  const context = await getAdminContext();
  if (context.error || !context.admin || !context.userId || !context.sessionClient) return { accounts: [] as AdminAccount[], error: context.error, page, hasMore: false, totalCount: 0 };
  const safePage = Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1;
  const perPage = 25;
  const searchTerm = search.trim().slice(0, 200);
  const { data, error } = await context.sessionClient.rpc("renewme_admin_search_accounts", {
    p_search: searchTerm,
    p_page: safePage,
    p_page_size: perPage,
  });
  if (error) return { accounts: [] as AdminAccount[], error: "Could not search the admin directory. Apply the global account search migration.", page: safePage, hasMore: false, totalCount: 0 };
  const totalCount = data[0]?.total_count ?? 0;
  const accounts = data.map((user) => {
    const bannedUntil = user.banned_until;
    const suspended = bannedUntil ? new Date(bannedUntil).getTime() > Date.now() : false;
    const isAdmin = user.is_admin;
    return {
      id: user.id,
      email: user.email ?? "No email address",
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at,
      emailConfirmedAt: user.email_confirmed_at,
      bannedUntil,
      isAdmin,
      canManage: user.id !== context.userId && (!isAdmin || suspended),
    };
  });

  return { accounts, error: null, page: safePage, hasMore: totalCount > safePage * perPage, totalCount };
}

export async function setAdminAccountSuspended(userId: string, suspended: boolean) {
  const context = await getAdminContext();
  if (context.error || !context.admin || !context.userId || !context.sessionClient) return { ok: false, error: context.error ?? "Administrator access is required." };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) return { ok: false, error: "Invalid account ID." };
  if (userId === context.userId) return { ok: false, error: "You cannot suspend your own administrator account." };

  const { data: targetIsAdmin, error: roleCheckError } = await context.sessionClient.rpc("renewme_is_admin_user", { target_user_id: userId });
  if (roleCheckError) return { ok: false, error: "Could not verify the target account’s admin status. Apply the admin protection migration." };
  if (targetIsAdmin && suspended) return { ok: false, error: "Administrator accounts are protected from suspension here." };

  const { error } = await context.admin.auth.admin.updateUserById(userId, { ban_duration: suspended ? "876000h" : "none" });
  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}
