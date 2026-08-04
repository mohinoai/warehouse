// Reset the demo dataset to its seeded state before an end-to-end test run.
//
// Usage:
//   node --env-file=.env.local scripts/reset-demo.mjs
//
// public.reset_demo() is granted to `authenticated`, so this signs in first.
// Set TEST_USER_EMAIL and TEST_USER_PASSWORD in .env.local (which is gitignored)
// — never hard-code credentials here, this repository is public.

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const email = process.env.TEST_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or the publishable/anon key.");
  process.exit(1);
}

if (!email || !password) {
  console.error(
    "Missing TEST_USER_EMAIL / TEST_USER_PASSWORD. Add them to .env.local and re-run.",
  );
  process.exit(1);
}

const supabase = createClient(url, key);

const { error: signInError } = await supabase.auth.signInWithPassword({
  email,
  password,
});
if (signInError) {
  console.error(`Sign-in failed for ${email}: ${signInError.message}`);
  process.exit(1);
}

const { error: resetError } = await supabase.rpc("reset_demo");
if (resetError) {
  console.error(`reset_demo failed: ${resetError.message}`);
  process.exit(1);
}

console.log("Demo dataset reset and re-seeded.");
