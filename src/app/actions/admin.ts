"use server";

import { revalidatePath } from "next/cache";
import { getAdminAccounts, setAdminAccountSuspended } from "@/lib/admin/accounts";

export async function loadAdminAccounts(search: string, page: number) {
  return getAdminAccounts(search, page);
}

export async function changeAdminAccountStatus(userId: string, suspended: boolean) {
  const result = await setAdminAccountSuspended(userId, suspended);
  if (result.ok) revalidatePath("/admin");
  return result;
}
