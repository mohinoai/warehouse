import Link from "next/link";

export default function NotFound() {
  return (
    <section className="flex min-h-[70dvh] items-center justify-center px-6 py-12">
      <div className="max-w-md text-center">
        <div className="font-mono text-[11px] font-semibold tracking-[0.16em] text-green">404 · JEJAK TIDAK DITEMUKAN</div>
        <h2 className="mt-4 text-3xl font-semibold tracking-[-0.03em]">Halaman ini tidak tercatat.</h2>
        <p className="mt-3 text-[13px] leading-relaxed text-muted">Tautan mungkin sudah berubah. Kembali ke worklist untuk melanjutkan dari referensi yang valid.</p>
        <Link href="/" className="mt-6 inline-flex min-h-11 items-center rounded-md bg-green px-5 text-[12.5px] font-medium text-white">Kembali ke Worklist</Link>
      </div>
    </section>
  );
}
