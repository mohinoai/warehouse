export interface SupabaseConfig {
  url: string;
  publishableKey: string;
}

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return url && publishableKey ? { url, publishableKey } : null;
}

export function isDemoModeEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_DEMO_MODE === "true";
}
