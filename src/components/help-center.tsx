"use client";

import { Dialog } from "./dialog";

const STEPS: Array<{ title: string; detail: string }> = [
  { title: "Catat stok masuk", detail: "Barang Masuk — maklon/opening manual, atau import CSV (ada tombol Download Template)." },
  { title: "Jalankan pesanan", detail: "Simulasi Marketplace — CREATE order lalu SHIP; stok terpotong otomatis lewat FEFO." },
  { title: "Tangani retur", detail: "Penanganan Retur — inspeksi kondisi: layak jual (restock), rusak, atau hilang (klaim)." },
  { title: "Hitung fisik", detail: "Stok Opname — isi hitungan, finalisasi; selisih jadi koreksi ledger bertaut sesi." },
  { title: "Tindak lanjut anomali", detail: "Worklist Harian — anomali dihitung ulang dari data, tiap item punya deep-link." },
];

const RULES: Array<{ title: string; detail: string }> = [
  { title: "FEFO otomatis", detail: "Batch dipilih sistem berdasar expiry terdekat. Operator tidak pernah memilih batch manual." },
  { title: "Kapan stok terpotong", detail: "Saat SHIPPED (Shopee) / IN_TRANSIT (TikTok). Sebelum itu hanya reservasi — belum menyentuh ledger." },
  { title: "Ledger tak bisa diedit", detail: "Bersifat append-only. Salah input? Pakai Koreksi Entri — menulis reversal berjejak, entri asli tetap utuh." },
  { title: "Retur rusak / hilang", detail: "Tidak memotong stok lagi (sudah terpotong saat kirim) — jadi catatan klaim. Rusak boleh Dikirim ulang; Hilang hanya Diganti rugi / Tulis rugi." },
  { title: "Opening stock", detail: "Berstatus Belum Terverifikasi sampai opname pertama selesai." },
  { title: "Klaim TikTok", detail: "Batas 40 hari dihitung sejak retur diajukan." },
];

export function HelpCenter({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Bantuan & Panduan"
      description="Alur inti dan aturan sistem rekonsiliasi stok."
    >
      <div className="px-5 py-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-2">Mulai cepat</h3>
        <ol className="mt-3 space-y-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-soft font-mono text-[11px] font-semibold text-green">
                {index + 1}
              </span>
              <div className="min-w-0">
                <div className="text-[12.5px] font-medium text-ink">{step.title}</div>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="border-t border-line-2 px-5 py-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-2">Aturan sistem</h3>
        <div className="mt-3 space-y-3">
          {RULES.map((rule) => (
            <div key={rule.title}>
              <div className="text-[12.5px] font-medium text-ink">{rule.title}</div>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">{rule.detail}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-line-2 px-5 py-4">
        <a
          href="https://github.com/mohinoai/warehouse"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[12px] font-medium text-green hover:underline"
        >
          Repo &amp; panduan lengkap →
        </a>
      </div>
    </Dialog>
  );
}
