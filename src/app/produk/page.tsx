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
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-medium">Produk &amp; Batch</h2>
          <p className="mt-0.5 text-[12px] text-muted">
            On-hand, reserved, sellable, expiry, dan status verifikasi dari ledger yang sama.
          </p>
        </div>
        <label className="flex min-h-11 w-full items-center gap-2 rounded-md border border-line bg-surface px-3 text-[12px] text-muted sm:w-72">
          <IconSearch size={13} />
          <span className="sr-only">Cari nama atau SKU</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-ink outline-none"
            placeholder="Cari nama atau SKU…"
          />
        </label>
      </div>

      {selectedProduct ? (
        <Card className="mb-5 overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line-2 px-5 py-4">
            <div>
              <div className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted">Detail produk</div>
              <h3 className="mt-1 text-[16px] font-semibold">{selectedProduct.name}</h3>
              <p className="font-mono text-[10.5px] text-muted">{selectedProduct.sku}</p>
            </div>
            <Link href="/produk" className="min-h-11 rounded-md border border-line px-4 py-3 text-[12px] font-medium">
              Tutup detail
            </Link>
          </div>
          {selectedProduct.isBundle ? (
            <EmptyState title="Bundle tidak memiliki stok" description="Saldo berasal dari komponen produk satuan dan recipe version order." />
          ) : (
            <div className="grid gap-0 lg:grid-cols-[280px_1fr]">
              <div className="grid grid-cols-3 gap-3 border-b border-line-2 p-5 lg:grid-cols-1 lg:border-b-0 lg:border-r">
                <div><SectionLabel>On-hand</SectionLabel><strong className="mt-1 block font-mono text-xl">{fmt(productOnHand(state, selectedProduct.id))}</strong></div>
                <div><SectionLabel>Reserved</SectionLabel><strong className="mt-1 block font-mono text-xl text-amber">{fmt(productReserved(state, selectedProduct.id))}</strong></div>
                <div><SectionLabel>Sellable</SectionLabel><strong className="mt-1 block font-mono text-xl text-green">{fmt(productSellable(state, selectedProduct.id))}</strong></div>
              </div>
              <div className="divide-y divide-line-2">
                {productBatches(state, selectedProduct.id).map((batch) => {
                  const expired = isExpired(state, batch);
                  const selected = batch.id === selectedBatchId;
                  return (
                    <div key={batch.id} className={`grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center ${selected ? "bg-green-soft/60" : ""}`}>
                      <div>
                        <Link href={`/ledger?product=${selectedProduct.id}&batch=${batch.id}`} className="font-mono text-[12px] font-semibold text-green hover:underline">
                          {batch.code}
                        </Link>
                        <div className="mt-1 text-[10.5px] text-muted">exp {dateLabel(batch.expiryDate)} · origin {batch.origin.toLowerCase()}</div>
                      </div>
                      <div><span className="mr-2 text-[10px] text-muted sm:hidden">Saldo</span><strong className="font-mono">{batchQty(state, batch.id)}</strong></div>
                      <PillRect tone={expired ? "red" : "green"}>{expired ? "KEDALUWARSA" : "AKTIF"}</PillRect>
                      <PillRect tone={batch.verificationStatus === "UNVERIFIED" ? "amber" : "neutral"}>
                        {batch.verificationStatus === "UNVERIFIED" ? "BELUM TERVERIFIKASI" : "TERVERIFIKASI"}
                      </PillRect>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      ) : null}

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            title={`Tidak ada produk cocok “${query}”`}
            description="Coba kata kunci atau SKU lain."
            action={<button onClick={() => setQuery("")} className="min-h-11 rounded-md border border-line px-4 text-[12px] font-medium">Hapus pencarian</button>}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-12 gap-3">
          {filtered.map((product) => {
            const batches = productBatches(state, product.id);
            const expiredCount = batches.filter((batch) => isExpired(state, batch)).length;
            const unverified = batches.some((batch) => batch.verificationStatus === "UNVERIFIED");
            return (
              <Card key={product.id} className="col-span-12 p-4 md:col-span-6 xl:col-span-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-green-soft font-mono text-[13px] font-medium text-green">{initials(product.name)}</div>
                  <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-medium">{product.name}</div><div className="font-mono text-[10.5px] text-muted">{product.sku}</div></div>
                  {product.isBundle ? <Pill tone="amber">Bundle</Pill> : null}
                </div>
                {product.isBundle ? (
                  <div className="mt-4 rounded-md bg-line-2 p-3 text-[11.5px] text-muted">Tidak ada angka stok atau batch. <Link href="/bundle" className="font-medium text-green">Lihat resep →</Link></div>
                ) : (
                  <>
                    <div className="mt-4 grid grid-cols-3 border-t border-line-2 pt-3">
                      <div><SectionLabel>On-hand</SectionLabel><strong className="mt-1 block font-mono text-lg">{fmt(productOnHand(state, product.id))}</strong></div>
                      <div className="text-center"><SectionLabel>Reserved</SectionLabel><strong className="mt-1 block font-mono text-lg text-amber">{fmt(productReserved(state, product.id))}</strong></div>
                      <div className="text-right"><SectionLabel>Sellable</SectionLabel><strong className="mt-1 block font-mono text-lg text-green">{fmt(productSellable(state, product.id))}</strong></div>
                    </div>
                    <div className="mt-3 flex min-h-8 flex-wrap items-center gap-1.5">
                      <PillRect tone="neutral">{batches.length} BATCH</PillRect>
                      {expiredCount ? <PillRect tone="red">{expiredCount} EXPIRED</PillRect> : null}
                      {unverified ? <PillRect tone="amber">BELUM TERVERIFIKASI</PillRect> : null}
                    </div>
                    <div className="mt-3 flex gap-3">
                      <Link href={`/produk?product=${product.id}`} className="min-h-11 py-3 text-[12px] font-medium text-green hover:underline">Lihat batch →</Link>
                      <Link href={`/ledger?product=${product.id}`} className="min-h-11 py-3 text-[12px] font-medium text-green hover:underline">Ledger →</Link>
                    </div>
                  </>
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
