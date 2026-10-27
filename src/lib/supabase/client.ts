import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { supabaseEnvironment } from "./config";

let browserClient: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function createClient() {
  if (!browserClient) {
    const { url, key } = supabaseEnvironment();
    browserClient = createBrowserClient<Database>(url, key);
  }
  return browserClient;
}
