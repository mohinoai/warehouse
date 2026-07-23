# Jejak

Sistem rekonsiliasi stok brand skincare. Implementasi memakai Next.js 16, React 19, TypeScript, Tailwind CSS 4, dan Supabase/Postgres.

## Menjalankan aplikasi

```bash
npm install
npm run dev
```

Buka `http://localhost:3000`.

Tanpa environment variable Supabase, development memakai shared demo store lokal. Production gagal tertutup ke halaman login kecuali `ALLOW_DEMO_MODE=true` diaktifkan secara eksplisit. Dengan konfigurasi Supabase, seluruh baca/tulis beralih ke backend persisten.

## Menjalankan backend lokal

Docker wajib tersedia untuk Supabase CLI.

```bash
cp .env.example .env.local
npm run db:start
npm run db:reset
```

Salin API URL dan publishable key dari output `supabase start` ke `.env.local`. Buat satu user Admin melalui Supabase Studio, lalu login di `/login`. Login pertama menjalankan bootstrap data demo secara transaksional bila database masih kosong.

Migrasi tersedia di `supabase/migrations/` dan mencakup:

- Auth-only RLS untuk satu role Admin.
- `stock_ledger` append-only dengan trigger penolak `UPDATE`/`DELETE`.
- `stock_balance_summary` O(1), diperbarui dalam transaksi ledger.
- RPC command untuk FEFO row locking, idempotency import, order, retur, klaim, koreksi, opname, bundle, notifikasi, dan rekonsiliasi.
- `pg_cron` rekonsiliasi harian pukul 00:15 UTC.

## Verifikasi

```bash
npm run test
npm run lint
npm run build
npm run db:test
```

## Mode demo lokal

- Navigasi antarhalaman mempertahankan perubahan state.
- Refresh browser mengembalikan seed data.
- `Reset Demo` tersedia pada sidebar.
- `Gagalkan berikutnya` menguji failure state operasi permanen berikutnya.
- Demo clock ditetapkan pada 18 Juli 2026 agar expiry dan H-40 deterministik.

Semua mutasi stok demo menambahkan entry ledger baru dan memperbarui balance summary. Retur rusak atau hilang hanya membuat claim/loss record, tanpa movement ledger kedua.
