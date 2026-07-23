"use client";

import { useActionState, useState } from "react";
import { loginAction, type LoginState } from "@/app/actions";
import { LogoLockup } from "@/components/logo";

const initialState: LoginState = { error: "" };

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);
  const hasError = Boolean(state.error);

  return (
    <main
      id="main-content"
      className="login-backdrop relative isolate min-h-dvh overflow-hidden bg-sidebar px-4 py-4 sm:px-6 sm:py-6 lg:px-10 lg:py-8"
    >
      <div className="login-glow login-glow-top" aria-hidden="true" />
      <div className="login-glow login-glow-bottom" aria-hidden="true" />

      <div className="relative z-10 mx-auto grid min-h-[calc(100dvh-2rem)] w-full max-w-[1240px] items-center gap-10 sm:min-h-[calc(100dvh-3rem)] lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-[minmax(0,1fr)_28rem] lg:gap-16 xl:gap-24">
        <section className="hidden min-w-0 self-stretch py-5 lg:flex lg:flex-col lg:justify-between">
          <LogoLockup />

          <div className="my-12 max-w-[670px]">
            <div className="login-entry flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#b9c9bf]">
              <span className="size-2 rounded-full bg-[#e9b44c] shadow-[0_0_0_5px_rgba(233,180,76,0.09)]" />
              Sistem rekonsiliasi stok
            </div>
            <h2 className="login-entry login-entry-delay-1 mt-7 max-w-[640px] text-[clamp(2.8rem,4.8vw,4.75rem)] font-semibold leading-[0.98] tracking-[-0.055em] text-white text-balance">
              Setiap perubahan stok meninggalkan jejak.
            </h2>
            <p className="login-entry login-entry-delay-2 mt-7 max-w-[540px] text-base leading-7 text-[#aebbb2] text-pretty">
              Satu ruang kerja untuk memeriksa ledger, menelusuri selisih,
              dan menutup rekonsiliasi tanpa kehilangan konteks.
            </p>

            <div className="login-entry login-entry-delay-3 mt-10 max-w-[620px] overflow-hidden rounded-[1.35rem] border border-white/10 bg-white/[0.045] shadow-[0_24px_70px_rgba(6,18,12,0.22)] backdrop-blur-sm">
              <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
                <div>
                  <p className="text-xs font-semibold text-white">Ledger hari ini</p>
                  <p className="mt-1 text-[11px] text-[#819188]">Pembaruan terakhir 18.42 WIB</p>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-[#b9c9bf]">
                  <span className="size-1.5 rounded-full bg-[#6cc795] shadow-[0_0_8px_rgba(108,199,149,0.8)]" />
                  Sinkron
                </div>
              </div>

              <ol className="divide-y divide-white/[0.07] px-5">
                <LedgerRow
                  time="18.42"
                  title="Stok masuk dicatat"
                  detail="Brightening Serum · Batch BS-0726"
                  value="+48 unit"
                  tone="green"
                />
                <LedgerRow
                  time="17.18"
                  title="Retur selesai diperiksa"
                  detail="RET-2026-0718 · kondisi baik"
                  value="+2 unit"
                  tone="amber"
                />
                <LedgerRow
                  time="15.06"
                  title="Pesanan dialokasikan FEFO"
                  detail="ORD-1842 · 3 batch terpilih"
                  value="−12 unit"
                  tone="muted"
                />
              </ol>
            </div>
          </div>

          <div className="flex items-center gap-3 text-[10px] font-medium uppercase tracking-[0.16em] text-[#75867d]">
            <span>Ledger append-only</span>
            <span className="h-px w-5 bg-white/15" />
            <span>Alokasi FEFO</span>
            <span className="h-px w-5 bg-white/15" />
            <span>Audit siap telusur</span>
          </div>
        </section>

        <section className="login-card login-entry login-entry-delay-1 mx-auto w-full max-w-[28rem] rounded-[1.75rem] border border-white/50 bg-[#f8f7f2] p-6 shadow-[0_32px_90px_rgba(4,17,10,0.35)] sm:p-8 lg:p-9">
          <div className="mb-9 inline-block rounded-xl bg-sidebar px-4 py-3 lg:hidden">
            <LogoLockup />
          </div>

          <div className="flex items-center justify-between gap-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-green">
              Portal internal
            </p>
            <div className="flex size-9 items-center justify-center rounded-full border border-line bg-white text-green" aria-hidden="true">
              <LockIcon />
            </div>
          </div>

          <h1 className="mt-7 text-[2rem] font-semibold leading-[1.08] tracking-[-0.04em] text-ink text-balance">
            Selamat datang kembali.
          </h1>
          <p className="mt-3 max-w-sm text-sm leading-6 text-muted">
            Masuk dengan akun Admin untuk melanjutkan pekerjaan.
          </p>

          <form action={action} className="mt-8 space-y-5">
            <label htmlFor="email" className="block text-xs font-semibold text-ink-2">
              Email
            </label>
            <div
              className={`-mt-3 flex min-h-12 items-center gap-3 rounded-[0.7rem] border bg-white px-3.5 shadow-[0_1px_0_rgba(22,32,27,0.02)] transition-[border-color,box-shadow] duration-200 focus-within:border-green focus-within:shadow-[0_0_0_3px_rgba(31,107,67,0.1)] ${hasError ? "border-red/45" : "border-line"}`}
            >
              <span className="text-muted-2" aria-hidden="true">
                <MailIcon />
              </span>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="admin@perusahaan.com"
                required
                aria-invalid={hasError}
                aria-describedby={hasError ? "login-error" : undefined}
                className="min-w-0 flex-1 bg-transparent py-3 text-sm text-ink outline-none placeholder:text-muted-2"
              />
            </div>

            <label htmlFor="password" className="block text-xs font-semibold text-ink-2">
              Password
            </label>
            <div
              className={`-mt-3 flex min-h-12 items-center gap-3 rounded-[0.7rem] border bg-white px-3.5 shadow-[0_1px_0_rgba(22,32,27,0.02)] transition-[border-color,box-shadow] duration-200 focus-within:border-green focus-within:shadow-[0_0_0_3px_rgba(31,107,67,0.1)] ${hasError ? "border-red/45" : "border-line"}`}
            >
              <span className="text-muted-2" aria-hidden="true">
                <KeyIcon />
              </span>
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Masukkan password"
                required
                aria-invalid={hasError}
                aria-describedby={hasError ? "login-error" : undefined}
                className="min-w-0 flex-1 bg-transparent py-3 text-sm text-ink outline-none placeholder:text-muted-2"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                className="-mr-1 flex size-9 shrink-0 items-center justify-center rounded-md text-muted transition-colors duration-200 hover:bg-green-soft hover:text-green focus-visible:outline-offset-0"
                aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>

            {state.error ? (
              <p
                id="login-error"
                role="alert"
                className="flex items-start gap-2.5 rounded-[0.7rem] border border-red/15 bg-red-soft px-3.5 py-3 text-xs leading-5 text-red"
              >
                <span className="mt-0.5 shrink-0" aria-hidden="true">
                  <AlertIcon />
                </span>
                {state.error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={pending}
              className="group flex min-h-12 w-full items-center justify-center gap-2 rounded-[0.7rem] bg-green px-4 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(31,107,67,0.2)] transition-[background-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:bg-green-2 hover:shadow-[0_12px_28px_rgba(31,107,67,0.28)] active:translate-y-0 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60"
            >
              {pending ? (
                <>
                  <span className="size-4 animate-spin rounded-full border-2 border-white/35 border-t-white" aria-hidden="true" />
                  Memverifikasi
                </>
              ) : (
                <>
                  Masuk ke dashboard
                  <ArrowIcon />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 flex items-start gap-2.5 border-t border-line pt-5 text-[11px] leading-5 text-muted">
            <span className="mt-0.5 text-green" aria-hidden="true">
              <ShieldIcon />
            </span>
            Gunakan akun Admin yang terdaftar. Setiap aktivitas perubahan stok tercatat di ledger.
          </div>
        </section>
      </div>
    </main>
  );
}

function LedgerRow({
  time,
  title,
  detail,
  value,
  tone,
}: {
  time: string;
  title: string;
  detail: string;
  value: string;
  tone: "green" | "amber" | "muted";
}) {
  const toneClass = {
    green: "bg-[#6cc795]",
    amber: "bg-[#e9b44c]",
    muted: "bg-[#71847a]",
  }[tone];

  return (
    <li className="grid grid-cols-[2.8rem_0.7rem_minmax(0,1fr)_auto] items-center gap-3 py-4">
      <span className="font-mono text-[10px] text-[#71847a]">{time}</span>
      <span className={`size-1.5 rounded-full ${toneClass}`} aria-hidden="true" />
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-[#edf3ef]">{title}</p>
        <p className="mt-1 truncate text-[10px] text-[#75867d]">{detail}</p>
      </div>
      <span className="font-mono text-[11px] font-medium text-[#c8d5cd]">{value}</span>
    </li>
  );
}

function MailIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 8-8M15 8l3 3M17 6l2 2" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m3 3 18 18M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 5.2A10 10 0 0 1 12 5c6 0 9.5 7 9.5 7a16 16 0 0 1-2.1 3M6.6 6.6C4 8.3 2.5 12 2.5 12s3.5 7 9.5 7a9.8 9.8 0 0 0 3.1-.5" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5M12 16h.01" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg className="transition-transform duration-200 group-hover:translate-x-0.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
