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
      className="login-backdrop relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-sidebar px-4 py-8 sm:px-6 lg:px-8"
    >
      <div className="login-glow login-glow-top" aria-hidden="true" />
      <div className="login-glow login-glow-bottom" aria-hidden="true" />

      <div className="relative z-10 w-full max-w-[26rem] login-entry login-entry-delay-1">
        <section className="login-card relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-white/[0.025] p-8 shadow-[0_32px_90px_rgba(4,17,10,0.8)] backdrop-blur-2xl sm:p-10">
          {/* Subtle inner reflection */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.06] to-transparent pointer-events-none" aria-hidden="true" />
          
          <div className="relative mb-10 flex justify-center">
            <LogoLockup />
          </div>

          <div className="relative text-center mb-10">
            <h1 className="text-[1.6rem] font-semibold tracking-[-0.03em] text-white">
              Selamat datang
            </h1>
            <p className="mt-2.5 text-[13px] text-[#aebbb2]">
              Masuk dengan akun Admin untuk melanjutkan
            </p>
          </div>

          <form action={action} className="relative space-y-6">
            <div>
              <label htmlFor="email" className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-[#aebbb2] mb-2.5 ml-1">
                Email
              </label>
              <div
                className={`flex min-h-[3.25rem] items-center gap-3 rounded-[1rem] border bg-black/20 px-4 shadow-[inset_0_1px_3px_rgba(0,0,0,0.2)] transition-all duration-300 focus-within:border-[#6cc795] focus-within:bg-black/40 focus-within:shadow-[0_0_0_3px_rgba(108,199,149,0.15),inset_0_1px_3px_rgba(0,0,0,0.2)] ${hasError ? "border-red/45" : "border-white/10 hover:border-white/20"}`}
              >
                <span className="text-white/40" aria-hidden="true">
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
                  className="min-w-0 flex-1 bg-transparent py-3 text-[14px] text-white outline-none placeholder:text-white/25"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-[#aebbb2] mb-2.5 ml-1">
                Password
              </label>
              <div
                className={`flex min-h-[3.25rem] items-center gap-3 rounded-[1rem] border bg-black/20 px-4 shadow-[inset_0_1px_3px_rgba(0,0,0,0.2)] transition-all duration-300 focus-within:border-[#6cc795] focus-within:bg-black/40 focus-within:shadow-[0_0_0_3px_rgba(108,199,149,0.15),inset_0_1px_3px_rgba(0,0,0,0.2)] ${hasError ? "border-red/45" : "border-white/10 hover:border-white/20"}`}
              >
                <span className="text-white/40" aria-hidden="true">
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
                  className="min-w-0 flex-1 bg-transparent py-3 text-[14px] text-white outline-none placeholder:text-white/25"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="-mr-1.5 flex size-9 shrink-0 items-center justify-center rounded-lg text-white/40 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                  aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            {state.error ? (
              <p
                id="login-error"
                role="alert"
                className="flex items-start gap-2.5 rounded-[1rem] border border-red/20 bg-red/10 px-4 py-3.5 text-xs leading-5 text-[#fbe7e3] backdrop-blur-md"
              >
                <span className="mt-0.5 shrink-0 text-red" aria-hidden="true">
                  <AlertIcon />
                </span>
                {state.error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={pending}
              className="group mt-6 flex min-h-[3.25rem] w-full items-center justify-center gap-2 rounded-[1rem] bg-gradient-to-b from-[#2a8757] to-[#17623c] px-4 text-[14px] font-semibold text-white shadow-[0_0_20px_rgba(31,107,67,0.3)] transition-all duration-300 hover:-translate-y-0.5 hover:from-[#319c65] hover:to-[#1a7044] hover:shadow-[0_8px_30px_rgba(31,107,67,0.45)] active:translate-y-0 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60 border border-[#3fb075]/30"
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

          <div className="relative mt-9 flex items-start gap-3 border-t border-white/[0.08] pt-6 text-[10px] leading-5 text-[#75867d]">
            <span className="mt-0.5 text-[#6cc795]" aria-hidden="true">
              <ShieldIcon />
            </span>
            Gunakan akun Admin yang terdaftar untuk akses portal internal.
          </div>
        </section>
      </div>
    </main>
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
