"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { batchQty, isExpired, productBatches, productOnHand, productReserved, productSellable } from "@/lib/demo/engine";
import { useDemoStore } from "@/components/demo-store-provider";
import { Card, EmptyState, Pill, PillRect, SectionLabel, Skeleton } from "@/components/ui";
import { IconSearch } from "@/components/icons";
import { fmt, initials } from "@/lib/format";

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function ProductsScreen() {
  const { state } = useDemoStore();
  const params = useSearchParams();
  const [query, setQuery] = useState("");
  const selectedProductId = params.get("product");
  const selectedBatchId = params.get("batch");
  const selectedProduct = state.products.find((item) => item.id === selectedProductId);
  const filtered = state.products.filter(
    (product) =>
      product.name.toLowerCase().includes(query.toLowerCase()) ||
      product.sku.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <section className="mx-auto max-w-[1720px] animate-fade-in px-4 py-6 sm:px-7">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-[18px] font-semibold tracking-tight text-ink">Produk &amp; Batch</h2>
          <p className="mt-1 text-[12px] text-muted-2">
            On-hand, reserved, sellable, expiry, dan status verifikasi dari ledger yang sama.
          </p>
        </div>
        <label className="flex min-h-[44px] w-full items-center gap-2 rounded-lg border border-black/[0.1] bg-black/[0.015] px-3.5 text-[12.5px] text-muted-2 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] outline-none transition-all focus-within:border-[#6cc795] focus-within:bg-white focus-within:ring-[3px] focus-within:ring-[#6cc795]/20 sm:w-80">
          <IconSearch size={14} className="text-muted-2/80" />
          <span className="sr-only">Cari nama atau SKU</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-muted-2/70"
            placeholder="Cari nama atau SKU…"
          />
        </label>
      </div>

      {selectedProduct ? (
        <Card className="mb-6 overflow-hidden border-black/[0.06] shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black/[0.06] bg-[#fcfdfc] px-6 py-5">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-2">Detail produk</div>
              <h3 className="mt-1.5 text-[16px] font-semibold text-ink">{selectedProduct.name}</h3>
              <p className="mt-0.5 font-mono text-[11px] text-muted-2">{selectedProduct.sku}</p>
            </div>
            <Link href="/produk" className="min-h-[44px] flex items-center rounded-lg border border-black/[0.08] bg-white px-5 text-[12.5px] font-semibold text-ink-2 shadow-sm transition-all hover:bg-black/[0.02]">
              Tutup detail
            </Link>
          </div>
          {selectedProduct.isBundle ? (
            <div className="p-2">
              <EmptyState title="Bundle tidak memiliki stok" description="Saldo berasal dari komponen produk satuan dan recipe version order." />
            </div>
          ) : (
            <div className="grid gap-0 lg:grid-cols-[300px_1fr]">
              <div className="grid grid-cols-3 gap-4 border-b border-black/[0.06] bg-black/[0.015] p-6 lg:grid-cols-1 lg:border-b-0 lg:border-r">
                <div><SectionLabel>On-hand</SectionLabel><strong className="mt-2 block font-mono text-2xl text-ink">{fmt(productOnHand(state, selectedProduct.id))}</strong></div>
                <div><SectionLabel>Reserved</SectionLabel><strong className="mt-2 block font-mono text-2xl text-[#b07012]">{fmt(productReserved(state, selectedProduct.id))}</strong></div>
                <div><SectionLabel>Sellable</SectionLabel><strong className="mt-2 block font-mono text-2xl text-[#1f6b43]">{fmt(productSellable(state, selectedProduct.id))}</strong></div>
              </div>
              <div className="divide-y divide-black/[0.04]">
                {productBatches(state, selectedProduct.id).map((batch) => {
                  const expired = isExpired(state, batch);
                  const selected = batch.id === selectedBatchId;
                  return (
                    <div key={batch.id} className={`grid gap-3 px-6 py-4 transition-colors sm:grid-cols-[1fr_auto_auto_auto] sm:items-center ${selected ? "bg-[#e6f2ec]/60" : "hover:bg-black/[0.01]"}`}>
                      <div>
                        <Link href={`/ledger?product=${selectedProduct.id}&batch=${batch.id}`} className="font-mono text-[13px] font-semibold text-[#1f6b43] hover:text-[#17623c] hover:underline">
                          {batch.code}
                        </Link>
                        <div className="mt-1 font-mono text-[10px] text-muted-2">exp {dateLabel(batch.expiryDate)} · origin {batch.origin.toLowerCase()}</div>
                      </div>
                      <div className="flex justify-between sm:block sm:text-right">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-2 sm:hidden">Saldo</span>
                        <strong className="font-mono text-[14px] text-ink">{batchQty(state, batch.id)}</strong>
                      </div>
                      <div className="flex justify-end sm:block"><PillRect tone={expired ? "red" : "green"}>{expired ? "KEDALUWARSA" : "AKTIF"}</PillRect></div>
                      <div className="flex justify-end sm:block">
                        <PillRect tone={batch.verificationStatus === "UNVERIFIED" ? "amber" : "neutral"}>
                          {batch.verificationStatus === "UNVERIFIED" ? "BELUM TERVERIFIKASI" : "TERVERIFIKASI"}
                        </PillRect>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      ) : null}

      {filtered.length === 0 ? (
        <Card className="border-black/[0.06] shadow-sm p-4">
          <EmptyState
            title={`Tidak ada produk cocok “${query}”`}
            description="Coba kata kunci atau SKU lain."
            action={<button onClick={() => setQuery("")} className="min-h-[44px] rounded-lg border border-black/[0.08] bg-white px-5 text-[12.5px] font-semibold text-ink-2 shadow-sm transition-all hover:bg-black/[0.02]">Hapus pencarian</button>}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-12 gap-5">
          {filtered.map((product) => {
            const batches = productBatches(state, product.id);
            const expiredCount = batches.filter((batch) => isExpired(state, batch)).length;
            const unverified = batches.some((batch) => batch.verificationStatus === "UNVERIFIED");
            return (
              <Card key={product.id} className="col-span-12 flex flex-col p-5 border-black/[0.06] shadow-sm transition-all hover:border-black/[0.15] md:col-span-6 xl:col-span-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#e6f2ec]/80 border border-[#6cc795]/30 font-mono text-[14px] font-semibold text-[#1f6b43]">{initials(product.name)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold text-ink">{product.name}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-muted-2">{product.sku}</div>
                  </div>
                  {product.isBundle ? <Pill tone="amber">Bundle</Pill> : null}
                </div>
                
                {product.isBundle ? (
                  <div className="mt-5 flex-1 rounded-xl border border-black/[0.05] bg-black/[0.02] p-4">
                    <p className="text-[12px] text-muted-2">Tidak ada angka stok atau batch.</p>
                    <Link href="/bundle" className="mt-2 inline-block font-medium text-[#1f6b43] hover:text-[#17623c] hover:underline">Lihat resep →</Link>
                  </div>
                ) : (
                  <div className="flex flex-col flex-1">
                    <div className="mt-5 grid grid-cols-3 border-t border-black/[0.06] pt-4">
                      <div><SectionLabel>On-hand</SectionLabel><strong className="mt-1 block font-mono text-xl text-ink">{fmt(productOnHand(state, product.id))}</strong></div>
                      <div className="text-center"><SectionLabel>Reserved</SectionLabel><strong className="mt-1 block font-mono text-xl text-[#b07012]">{fmt(productReserved(state, product.id))}</strong></div>
                      <div className="text-right"><SectionLabel>Sellable</SectionLabel><strong className="mt-1 block font-mono text-xl text-[#1f6b43]">{fmt(productSellable(state, product.id))}</strong></div>
                    </div>
                    <div className="mt-4 flex min-h-[32px] flex-wrap items-center gap-2">
                      <PillRect tone="neutral">{batches.length} BATCH</PillRect>
                      {expiredCount ? <PillRect tone="red">{expiredCount} EXPIRED</PillRect> : null}
                      {unverified ? <PillRect tone="amber">BELUM TERVERIFIKASI</PillRect> : null}
                    </div>
                    <div className="mt-5 flex gap-3 pt-1">
                      <Link href={`/produk?product=${product.id}`} className="min-h-[40px] flex-1 flex items-center justify-center rounded-lg bg-[#e6f2ec]/50 border border-[#6cc795]/20 text-[12.5px] font-semibold text-[#1f6b43] transition-colors hover:bg-[#d1e8db] hover:border-[#6cc795]/40">Lihat batch</Link>
                      <Link href={`/ledger?product=${product.id}`} className="min-h-[40px] flex-1 flex items-center justify-center rounded-lg border border-black/[0.08] bg-white text-[12.5px] font-semibold text-ink-2 shadow-sm transition-all hover:bg-black/[0.02]">Ledger</Link>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function ProdukPage() {
  return (
    <Suspense fallback={<div className="p-7"><Skeleton className="h-72" /></div>}>
      <ProductsScreen />
    </Suspense>
  );
}
