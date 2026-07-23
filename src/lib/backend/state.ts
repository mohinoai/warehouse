import "server-only";

import { createDemoState } from "@/lib/demo/seed";
import type { DemoState } from "@/lib/demo/types";
import { getSupabaseConfig } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

function isDemoState(value: unknown): value is DemoState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<DemoState>;
  return (
    Array.isArray(state.products) &&
    Array.isArray(state.batches) &&
    Array.isArray(state.ledgerEntries) &&
    typeof state.balanceSummary === "object"
  );
}

export async function loadAppState(): Promise<DemoState> {
  if (!getSupabaseConfig()) return createDemoState();

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return createDemoState();

  const { error: bootstrapError } = await supabase.rpc("bootstrap_demo");
  if (bootstrapError) throw new Error(`Gagal menyiapkan backend: ${bootstrapError.message}`);

  const { data, error } = await supabase.rpc("get_app_state");
  if (error) throw new Error(`Gagal memuat backend: ${error.message}`);
  if (!isDemoState(data)) throw new Error("Backend mengembalikan state tidak valid");
  return data;
}
