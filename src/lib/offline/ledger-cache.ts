import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { Subscription } from "@/lib/subscriptions/types";
import { supabaseEnvironment } from "@/lib/supabase/config";

type OfflineLedger = {
  userId: string;
  rows: Subscription[];
  pendingWrites: Subscription[];
  pendingCreates?: Subscription[];
  apiUrl: string;
  anonKey: string;
  updatedAt: string;
};

const databaseName = "renewme-offline";
const storeName = "ledgers";

function openLedgerDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: "userId" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Offline storage is unavailable."));
  });
}

async function getLedger(userId: string): Promise<OfflineLedger | null> {
  const db = await openLedgerDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).get(userId);
    request.onsuccess = () => resolve((request.result as OfflineLedger | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("Could not read the saved ledger."));
    request.addEventListener("loadend", () => db.close(), { once: true });
  });
}

async function putLedger(value: OfflineLedger): Promise<void> {
  const db = await openLedgerDb();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(storeName, "readwrite").objectStore(storeName).put(value);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Could not save the offline ledger."));
    request.addEventListener("loadend", () => db.close(), { once: true });
  });
}

export async function cacheLedgerSnapshot(userId: string, rows: Subscription[]) {
  const previous = await getLedger(userId);
  const { url, key } = supabaseEnvironment();
  const pendingWrites = previous?.pendingWrites ?? previous?.pendingCreates ?? [];
  const byId = new Map(rows.map((row) => [row.id, row]));
  pendingWrites.forEach((row) => byId.set(row.id, row));
  await putLedger({
    userId,
    rows: [...byId.values()],
    pendingWrites,
    pendingCreates: undefined,
    apiUrl: url,
    anonKey: key,
    updatedAt: new Date().toISOString(),
  });
}

export async function queueOfflineCreate(userId: string, draft: Omit<Subscription, "id" | "user_id" | "created_at" | "updated_at">) {
  const previous = await getLedger(userId);
  if (!previous) throw new Error("Open the subscriptions page online once to prepare an offline ledger.");
  const now = new Date().toISOString();
  const row: Subscription = { ...draft, id: crypto.randomUUID(), user_id: userId, created_at: now, updated_at: now };
  await putLedger({
    ...previous,
    rows: [row, ...previous.rows],
    pendingWrites: [...(previous.pendingWrites ?? previous.pendingCreates ?? []), row],
    updatedAt: now,
  });
  return row;
}

export async function syncOfflineCreates(userId: string, supabase: SupabaseClient<Database>) {
  const ledger = await getLedger(userId);
  const pendingWrites = ledger?.pendingWrites ?? ledger?.pendingCreates ?? [];
  if (!ledger || pendingWrites.length === 0) return { synced: 0, pending: 0 };
  let synced = 0;
  for (const row of pendingWrites) {
    const { error } = await supabase.from("subscriptions").upsert({ ...row, id: row.id, user_id: userId }, { onConflict: "id" });
    if (error) break;
    synced += 1;
  }
  if (synced) {
    await putLedger({ ...ledger, pendingWrites: pendingWrites.slice(synced), pendingCreates: undefined, updatedAt: new Date().toISOString() });
  }
  return { synced, pending: pendingWrites.length - synced };
}
