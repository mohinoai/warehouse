"use server";

import "server-only";

import { redirect } from "next/navigation";
import type { CommandResult, DemoCommand, DemoState } from "@/lib/demo/types";
import { getSupabaseConfig } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { loadAppState } from "@/lib/backend/state";

const COMMAND_TYPES = new Set<DemoCommand["type"]>([
  "MANUAL_STOCK_OUT",
  "RECEIVE_STOCK",
  "INJECT_EVENT",
  "INSPECT_RETURN",
  "FILE_CLAIM",
  "RESOLVE_CLAIM",
  "CORRECT_ENTRY",
  "CREATE_OPNAME",
  "SAVE_OPNAME_COUNT",
  "FINALIZE_OPNAME",
  "CREATE_RECIPE_VERSION",
  "RERUN_RECONCILIATION",
  "MARK_NOTIFICATION_READ",
  "MARK_ALL_NOTIFICATIONS_READ",
]);

interface BackendOutcome {
  state?: DemoState;
  result: CommandResult;
}

function rejected(title: string, description: string): CommandResult {
  return { ok: false, status: "REJECTED", title, description };
}

export async function executeBackendCommand(command: DemoCommand): Promise<BackendOutcome> {
  if (!getSupabaseConfig()) {
    return { result: rejected("Backend belum aktif", "Konfigurasi Supabase belum tersedia.") };
  }
  if (!command || typeof command !== "object" || !COMMAND_TYPES.has(command.type)) {
    return { result: rejected("Command ditolak", "Tipe command tidak valid.") };
  }

  const supabase = await createClient();
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  if (authError || !claims?.claims) {
    return { result: rejected("Sesi berakhir", "Login ulang sebelum mengubah data.") };
  }

  const { data, error } = await supabase.rpc("execute_command", {
    p_command: command,
  });
  if (error) {
    return { result: rejected("Operasi backend gagal", error.message) };
  }

  const result = data as CommandResult;
  if (!result || typeof result.ok !== "boolean") {
    return { result: rejected("Respons backend tidak valid", "Command tidak menghasilkan status.") };
  }

  if (
    result.ok &&
    result.status === "PROCESSED" &&
    ![
      "RERUN_RECONCILIATION",
      "MARK_NOTIFICATION_READ",
      "MARK_ALL_NOTIFICATIONS_READ",
    ].includes(command.type)
  ) {
    await supabase.rpc("execute_command", {
      p_command: { type: "RERUN_RECONCILIATION" },
    });
  }

  return { state: await loadAppState(), result };
}

export interface LoginState {
  error: string;
}

export async function loginAction(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  if (!getSupabaseConfig()) {
    return { error: "Supabase belum dikonfigurasi. Isi environment variable terlebih dahulu." };
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Email dan password wajib diisi." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    await supabase.auth.signOut({ scope: "local" });
    return { error: "Email atau password salah." };
  }
  redirect("/");
}

export async function logoutAction() {
  if (getSupabaseConfig()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
