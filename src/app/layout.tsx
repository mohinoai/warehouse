import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { loadAppState } from "@/lib/backend/state";
import { getSupabaseConfig } from "@/lib/supabase/env";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Jejak — Sistem Rekonsiliasi Stok",
  description:
    "Tidak ada angka stok yang berubah tanpa jejak. Stock Ledger append-only, alokasi FEFO, rekonsiliasi harian & opname untuk brand skincare.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialState = await loadAppState();
  const backendEnabled = Boolean(getSupabaseConfig());

  return (
    <html
      lang="id"
      className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">
        <a
          href="#main-content"
          className="fixed left-3 top-3 z-[60] -translate-y-20 rounded-md bg-ink px-3 py-2 text-sm text-white focus:translate-y-0"
        >
          Lewati ke konten
        </a>
        <AppShell initialState={initialState} backendEnabled={backendEnabled}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
