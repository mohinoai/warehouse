"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="flex min-h-[60vh] flex-col items-center justify-center gap-2 px-6 text-center">
      <div className="text-[15px] font-medium">Terjadi kesalahan tak terduga</div>
      <p className="max-w-sm text-[12px] leading-relaxed text-muted">
        Data di ledger aman — tidak ada baris yang berubah. Coba muat ulang
        halaman ini.
      </p>
      {error.digest ? (
        <p className="font-mono text-[10.5px] text-muted-2">ref: {error.digest}</p>
      ) : null}
      <button
        onClick={reset}
        className="mt-3 rounded-md bg-green px-4 py-2 text-[12.5px] font-medium text-white transition-all hover:brightness-110"
      >
        Muat ulang
      </button>
    </section>
  );
}
