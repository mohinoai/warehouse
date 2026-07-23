"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/app/actions";
import { LogoLockup } from "@/components/logo";

const initialState: LoginState = { error: "" };

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, initialState);

  return (
    <main className="grid min-h-dvh place-items-center bg-sidebar px-4 py-10">
      <section className="w-full max-w-sm rounded-xl border border-white/10 bg-surface p-6 shadow-2xl">
        <div className="mb-6 inline-block rounded-lg bg-sidebar px-4 py-3">
          <LogoLockup />
        </div>
        <h1 className="text-xl font-semibold text-ink">Masuk sebagai Admin</h1>
        <p className="mt-1 text-sm text-muted">Akses ledger, rekonsiliasi, retur, dan opname.</p>
        <form action={action} className="mt-6 space-y-4">
          <label className="block text-xs font-medium text-muted">
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              className="mt-1.5 min-h-11 w-full rounded-md border border-line px-3 text-sm text-ink outline-none focus:border-green"
            />
          </label>
          <label className="block text-xs font-medium text-muted">
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="mt-1.5 min-h-11 w-full rounded-md border border-line px-3 text-sm text-ink outline-none focus:border-green"
            />
          </label>
          {state.error ? (
            <p role="alert" className="rounded-md bg-red-soft px-3 py-2.5 text-xs text-red">
              {state.error}
            </p>
          ) : null}
          <button
            disabled={pending}
            className="min-h-11 w-full rounded-md bg-green px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? "Memverifikasi…" : "Masuk"}
          </button>
        </form>
      </section>
    </main>
  );
}
