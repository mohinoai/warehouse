"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { fmtShortDate, greetingForHour } from "@/lib/format";
import { useDemoStore } from "./demo-store-provider";
import { IconBell, IconInfo, IconMenu, IconPlus, IconSearch } from "./icons";
import { MovementModal } from "./movement-modal";
import { NotificationCenter } from "./notification-center";
import { HelpCenter } from "./help-center";
import { Dialog } from "./dialog";
import { useLocalHour } from "./use-local-hour";

const routeTitles: Record<string, [crumb: string, title: string]> = {
  "/simulasi": ["Simulasi · API-ready", "Simulasi Pesanan Marketplace"],
  "/ledger": ["Traceability · per produk & batch", "Drill-down Stock Ledger"],
  "/retur": ["Inspeksi & keputusan kondisi", "Penanganan Retur"],
  "/opname": ["Hitung fisik vs catatan sistem", "Stok Opname"],
  "/produk": ["Master Data", "Produk & Batch"],
  "/bundle": ["Master Data", "Resep Bundle"],
  "/masuk": ["Master Data", "Barang Masuk & Opening Stock"],
};

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const [modalOpen, setModalOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { state } = useDemoStore();
  const demoDate = new Date(state.demoNow);
  const localHour = useLocalHour(demoDate.getUTCHours());
  const homeCrumb = `Worklist Harian · Rekonsiliasi ${fmtShortDate(demoDate)}`;
  const homeTitle = `${greetingForHour(localHour)}, ${state.actor}.`;
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const [crumb, title] = routeTitles[pathname] ?? [homeCrumb, homeTitle];
  const normalizedQuery = query.trim().toLowerCase();
  const searchResults = normalizedQuery.length < 2
    ? []
    : [
        ...state.products
          .filter(
            (item) =>
              item.name.toLowerCase().includes(normalizedQuery) ||
              item.sku.toLowerCase().includes(normalizedQuery),
          )
          .map((item) => ({
            key: `product-${item.id}`,
            label: item.name,
            meta: item.sku,
            href: `/produk?product=${item.id}`,
          })),
        ...state.batches
          .filter((item) => item.code.toLowerCase().includes(normalizedQuery))
          .map((item) => ({
            key: `batch-${item.id}`,
            label: item.code,
            meta: "Batch",
            href: `/produk?product=${item.productId}&batch=${item.id}`,
          })),
        ...state.orders
          .filter((item) => item.id.toLowerCase().includes(normalizedQuery))
          .map((item) => ({
            key: `order-${item.id}`,
            label: item.id,
            meta: `${item.channel} · ${item.status}`,
            href: `/simulasi?order=${item.id}`,
          })),
        ...state.returns
          .filter((item) => item.id.toLowerCase().includes(normalizedQuery))
          .map((item) => ({
            key: `return-${item.id}`,
            label: item.id,
            meta: `${item.channel} · Retur`,
            href: `/retur?return=${item.id}`,
          })),
        ...state.ledgerEntries
          .filter(
            (item) =>
              item.id.toLowerCase().includes(normalizedQuery) ||
              item.referenceId.toLowerCase().includes(normalizedQuery),
          )
          .map((item) => ({
            key: `ledger-${item.id}`,
            label: item.referenceId,
            meta: `${item.reason} · ${item.id}`,
            href: `/ledger?entry=${item.id}`,
          })),
      ].slice(0, 8);
  const unread = state.notifications.filter((item) => !item.readAt).length;

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-[rgba(246,247,245,0.85)] backdrop-blur-md">
      <div className="flex items-center gap-2 px-3 py-3.5 sm:gap-4 sm:px-7">
        <button
          onClick={onMenu}
          aria-label="Buka menu"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-line bg-surface lg:hidden"
        >
          <IconMenu size={16} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="hidden truncate text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted sm:block">
            {crumb}
          </div>
          <h1 className="truncate text-[16px] font-medium leading-tight sm:mt-0.5 sm:text-[19px]">
            {title}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2.5">
          <div className="relative hidden w-72 md:block">
            <div className="flex min-h-11 items-center gap-2 rounded-md border border-line bg-surface px-3 text-[12px] text-muted">
            <IconSearch size={13} />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Cari produk, batch, order, retur, atau ledger"
              className="flex-1 bg-transparent text-ink outline-none placeholder:text-muted-2"
              placeholder="Cari produk, batch, order…"
            />
            <span className="rounded-[3px] border border-line px-[5px] py-px font-mono text-[10px] text-muted">
              ⌘K
            </span>
            </div>
            {normalizedQuery.length >= 2 ? (
              <div className="absolute right-0 top-[calc(100%+0.4rem)] z-30 w-full overflow-hidden rounded-lg border border-line bg-surface shadow-[0_12px_36px_-12px_rgba(22,32,27,0.28)]">
                {searchResults.length ? (
                  searchResults.map((result) => (
                    <Link
                      key={result.key}
                      href={result.href}
                      onClick={() => setQuery("")}
                      className="block border-b border-line-2 px-3 py-2.5 last:border-0 hover:bg-line-2"
                    >
                      <div className="truncate text-[12px] font-medium">{result.label}</div>
                      <div className="truncate font-mono text-[10px] text-muted">{result.meta}</div>
                    </Link>
                  ))
                ) : (
                  <div className="px-3 py-4 text-center text-[11.5px] text-muted">Tidak ada hasil.</div>
                )}
              </div>
            ) : null}
          </div>
          <button
            aria-label="Buka aksi cepat"
            onClick={() => setMobileSearchOpen(true)}
            className="flex h-11 w-11 items-center justify-center gap-1.5 rounded-md bg-green text-white sm:w-auto sm:px-3"
          >
            <IconPlus size={15} />
            <span className="hidden text-[12px] font-medium sm:inline">Aksi Cepat</span>
          </button>
          <button
            aria-label="Bantuan & panduan"
            onClick={() => setHelpOpen(true)}
            className="hidden h-11 w-11 items-center justify-center rounded-md border border-line bg-surface transition-colors hover:bg-line-2 sm:flex"
          >
            <IconInfo size={15} />
          </button>
          <button
            aria-label="Notifikasi"
            onClick={() => setNotificationsOpen(true)}
            className="relative flex h-11 w-11 items-center justify-center rounded-md border border-line bg-surface transition-colors hover:bg-line-2"
          >
            <IconBell size={15} />
            {unread ? (
              <span className="absolute right-1 top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red px-1 font-mono text-[9px] text-white">
                {unread}
              </span>
            ) : null}
          </button>
        </div>
      </div>
      {modalOpen ? <MovementModal onClose={() => setModalOpen(false)} /> : null}
      <NotificationCenter open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
      <HelpCenter open={helpOpen} onClose={() => setHelpOpen(false)} />
      <Dialog
        open={mobileSearchOpen}
        onClose={() => {
          setMobileSearchOpen(false);
          setQuery("");
        }}
        title="Aksi cepat"
        description="Cari data, buka notifikasi, atau catat stok keluar."
        size="sm"
      >
        <div className="p-4">
          <div className="mb-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                setMobileSearchOpen(false);
                setNotificationsOpen(true);
              }}
              className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-line text-[11.5px] font-medium"
            >
              <IconBell size={14} />
              Notifikasi {unread ? `(${unread})` : ""}
            </button>
            <button
              onClick={() => {
                setMobileSearchOpen(false);
                setModalOpen(true);
              }}
              className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-green text-[11.5px] font-medium text-white"
            >
              <IconPlus size={14} />
              Stok Keluar
            </button>
            <button
              onClick={() => {
                setMobileSearchOpen(false);
                setHelpOpen(true);
              }}
              className="col-span-2 flex min-h-11 items-center justify-center gap-2 rounded-md border border-line text-[11.5px] font-medium"
            >
              <IconInfo size={14} />
              Bantuan & Panduan
            </button>
          </div>
          <label className="flex min-h-11 items-center gap-2 rounded-md border border-line px-3">
            <IconSearch size={14} className="text-muted" />
            <span className="sr-only">Kata kunci</span>
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ketik minimal 2 karakter…"
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
            />
          </label>
          <div className="mt-3 overflow-hidden rounded-md border border-line">
            {normalizedQuery.length < 2 ? (
              <div className="p-4 text-center text-[11.5px] text-muted">Ketik minimal 2 karakter.</div>
            ) : searchResults.length ? (
              searchResults.map((result) => (
                <Link
                  key={`mobile-${result.key}`}
                  href={result.href}
                  onClick={() => {
                    setMobileSearchOpen(false);
                    setQuery("");
                  }}
                  className="block min-h-14 border-b border-line-2 px-3 py-2.5 last:border-0"
                >
                  <div className="truncate text-[12px] font-medium">{result.label}</div>
                  <div className="truncate font-mono text-[10px] text-muted">{result.meta}</div>
                </Link>
              ))
            ) : (
              <div className="p-4 text-center text-[11.5px] text-muted">Tidak ada hasil.</div>
            )}
          </div>
        </div>
      </Dialog>
    </header>
  );
}
