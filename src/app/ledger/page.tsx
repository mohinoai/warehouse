"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDemoStore } from "@/components/demo-store-provider";
import { useToast } from "@/components/toast";
import { Card, EmptyState, PillRect, SectionLabel, Skeleton } from "@/components/ui";
import { SuccessPanel } from "@/components/async-state";
import { batchQty, productOnHand, productReserved, productSellable } from "@/lib/demo/engine";
import { CHANNELS, REASONS } from "@/lib/demo/types";
import { fmt, fmtDelta } from "@/lib/format";

const inputClass = "min-h-11 rounded-md border border-line bg-surface px-3 text-[11.5px] outline-none focus:border-green focus:ring-[3px] focus:ring-green/10";
const PAGE_SIZE = 8;

function formatTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

function referenceTarget(type: string, id: string) {
  if (type === "ORDER") return `/simulasi?order=${id}`;
  if (type === "RETURN") return `/retur?return=${id}`;
  if (type === "OPNAME") return `/opname?session=${id}`;
  if (type === "CORRECTION") return `/ledger?entry=${id}`;
  return "";
}

function LedgerScreen() {
  const { state, execute } = useDemoStore();
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [productId, setProductId] = useState(params.get("product") ?? "ALL");
  const [batchId, setBatchId] = useState(params.get("batch") ?? "ALL");
  const [reason, setReason] = useState("ALL");
  const [channel, setChannel] = useState("ALL");
  const [range, setRange] = useState("ALL");
  const [reversal, setReversal] = useState("ALL");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState(params.get("entry") ?? "");
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionStep, setCorrectionStep] = useState<"INPUT" | "PREVIEW">("INPUT");
  const [correctionNote, setCorrectionNote] = useState("");
  const [lastResult, setLastResult] = useState("");
  const selected = state.ledgerEntries.find((entry) => entry.id === selectedId);
  const selectedProduct = state.products.find((item) => item.id === (selected?.productId ?? (productId === "ALL" ? "" : productId)));
  const now = new Date(state.demoNow).getTime();
  const days = range === "ALL" ? Infinity : Number(range);
  const normalized = query.trim().toLowerCase();
  const filtered = state.ledgerEntries.filter((entry) => {
    const product = state.products.find((item) => item.id === entry.productId);
    const batch = state.batches.find((item) => item.id === entry.batchId);
    const age = (now - new Date(entry.createdAt).getTime()) / 86_400_000;
    const matchesSearch = !normalized || [entry.id, entry.referenceId, entry.referenceNote, product?.name, batch?.code].some((value) => value?.toLowerCase().includes(normalized));
    const matchesReversal = reversal === "ALL" || (reversal === "REVERSIBLE" ? !entry.reversedByEntryId && entry.reason !== "MANUAL_ENTRY_CORRECTION" : Boolean(entry.reversedByEntryId || entry.reversesEntryId));
    return matchesSearch && (productId === "ALL" || entry.productId === productId) && (batchId === "ALL" || entry.batchId === batchId) && (reason === "ALL" || entry.reason === reason) && (channel === "ALL" || entry.channel === channel) && age <= days && matchesReversal;
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const availableBatches = state.batches.filter((batch) => productId === "ALL" || batch.productId === productId);
  const allocationGroup = selected?.allocationGroupId ? state.ledgerEntries.filter((entry) => entry.allocationGroupId === selected.allocationGroupId) : [];
  const linkedOriginal = selected?.reversesEntryId ? state.ledgerEntries.find((entry) => entry.id === selected.reversesEntryId) : undefined;
  const linkedReversal = selected?.reversedByEntryId ? state.ledgerEntries.find((entry) => entry.id === selected.reversedByEntryId) : undefined;

  function selectEntry(id: string) {
    setSelectedId(id);
    setCorrectionOpen(false);
    setCorrectionNote("");
    router.replace(`/ledger?entry=${id}`);
  }

  async function correct() {
    if (!selected) return;
    const result = await execute({ type: "CORRECT_ENTRY", entryId: selected.id, note: correctionNote });
    toast({ title: result.title, description: result.description, tone: result.ok ? "success" : "error" });
    if (result.ok) {
      setLastResult(`${result.title}: ${result.description}`);
      setCorrectionOpen(false);
      setCorrectionStep("INPUT");
      if (result.entityId) selectEntry(result.entityId);
    }
  }

  const selectedBatch = state.batches.find((item) => item.id === selected?.batchId);
  const expiredBatch = Boolean(selectedBatch && selectedBatch.expiryDate < state.demoNow.slice(0, 10));
  const canCorrect = selected && !selected.reversedByEntryId && selected.reason !== "MANUAL_ENTRY_CORRECTION";

  return (
    <section className="mx-auto max-w-[1720px] animate-fade-in px-4 py-6 sm:px-7">
      <div className="mb-5"><h2 className="text-[17px] font-medium">Stock Ledger</h2><p className="mt-0.5 text-[12px] text-muted">Append-only traceability dengan reason dan channel sebagai dimensi terpisah.</p></div>
      {lastResult ? <div className="mb-4"><SuccessPanel>{lastResult}</SuccessPanel></div> : null}

      {selectedProduct && !selectedProduct.isBundle ? (
        <div className="mb-4 grid grid-cols-3 gap-3">
          <Card className="p-4"><SectionLabel>On-hand</SectionLabel><strong className="mt-1 block font-mono text-2xl">{fmt(productOnHand(state, selectedProduct.id))}</strong></Card>
          <Card className="p-4"><SectionLabel>Reserved</SectionLabel><strong className="mt-1 block font-mono text-2xl text-amber">{fmt(productReserved(state, selectedProduct.id))}</strong></Card>
          <Card className="p-4"><SectionLabel>Sellable</SectionLabel><strong className="mt-1 block font-mono text-2xl text-green">{fmt(productSellable(state, selectedProduct.id))}</strong></Card>
        </div>
      ) : null}

      <Card className="mb-4 p-4">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted">Search<input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="ID, reference, produk…" className={`${inputClass} mt-1.5 w-full normal-case tracking-normal text-ink`} /></label>
          <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted">Produk<select value={productId} onChange={(event) => { setProductId(event.target.value); setBatchId("ALL"); setPage(1); }} className={`${inputClass} mt-1.5 w-full normal-case tracking-normal text-ink`}><option value="ALL">Semua produk</option>{state.products.filter((item) => !item.isBundle).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
          <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted">Batch<select value={batchId} onChange={(event) => { setBatchId(event.target.value); setPage(1); }} className={`${inputClass} mt-1.5 w-full normal-case tracking-normal text-ink`}><option value="ALL">Semua batch</option>{availableBatches.map((batch) => <option key={batch.id} value={batch.id}>{batch.code}</option>)}</select></label>
          <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted">Reason<select value={reason} onChange={(event) => { setReason(event.target.value); setPage(1); }} className={`${inputClass} mt-1.5 w-full normal-case tracking-normal text-ink`}><option value="ALL">Semua reason</option>{REASONS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted">Channel<select value={channel} onChange={(event) => { setChannel(event.target.value); setPage(1); }} className={`${inputClass} mt-1.5 w-full normal-case tracking-normal text-ink`}><option value="ALL">Semua channel</option>{CHANNELS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted">Tanggal<select value={range} onChange={(event) => { setRange(event.target.value); setPage(1); }} className={`${inputClass} mt-1.5 w-full normal-case tracking-normal text-ink`}><option value="ALL">Semua waktu</option><option value="7">7 hari</option><option value="30">30 hari</option><option value="90">90 hari</option></select></label>
          <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted">Reversal<select value={reversal} onChange={(event) => { setReversal(event.target.value); setPage(1); }} className={`${inputClass} mt-1.5 w-full normal-case tracking-normal text-ink`}><option value="ALL">Semua status</option><option value="REVERSIBLE">Dapat dikoreksi</option><option value="LINKED">Sudah tertaut</option></select></label>
        </div>
      </Card>

      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 overflow-hidden xl:col-span-8">
          <div className="hidden grid-cols-[130px_1.2fr_1fr_1fr_1.2fr_70px_70px] border-b border-line-2 bg-line-2/50 px-4 py-2 text-[9.5px] font-medium uppercase tracking-[0.08em] text-muted md:grid"><span>Waktu</span><span>Produk/batch</span><span>Reason</span><span>Channel</span><span>Reference</span><span className="text-right">Delta</span><span className="text-right">Saldo</span></div>
          {rows.length === 0 ? <EmptyState title="Tidak ada entry" description="Ubah filter atau catat transaksi baru." /> : (
            <div className="divide-y divide-line-2">
              {rows.map((entry) => {
                const product = state.products.find((item) => item.id === entry.productId);
                const batch = state.batches.find((item) => item.id === entry.batchId);
                const missingReference = ["BONUS", "PROMO", "SAMPLE"].includes(entry.reason) && !entry.referenceNote;
                return (
                  <button key={entry.id} onClick={() => selectEntry(entry.id)} className={`grid min-h-16 w-full gap-2 px-4 py-3 text-left transition-colors md:grid-cols-[130px_1.2fr_1fr_1fr_1.2fr_70px_70px] md:items-center ${selectedId === entry.id ? "bg-green-soft" : "hover:bg-line-2"}`}>
                    <div><span className="mr-2 text-[9px] uppercase text-muted md:hidden">Waktu</span><span className="font-mono text-[10px] text-muted">{formatTime(entry.createdAt)}</span></div>
                    <div><strong className="text-[11.5px]">{product?.name}</strong><div className="font-mono text-[9.5px] text-muted">{batch?.code} · {entry.id}</div></div>
                    <div><PillRect tone={entry.reason.includes("CORRECTION") ? "amber" : entry.qtyDelta > 0 ? "green" : "neutral"}>{entry.reason}</PillRect></div>
                    <div><span className="mr-2 text-[9px] uppercase text-muted md:hidden">Channel</span><span className="text-[11px]">{entry.channel}</span></div>
                    <div><span className="font-mono text-[10px] text-green">{entry.referenceId}</span>{missingReference ? <div className="mt-1 text-[9.5px] text-red">Referensi campaign kosong</div> : entry.referenceNote ? <div className="mt-1 truncate text-[9.5px] text-muted">{entry.referenceNote}</div> : null}</div>
                    <strong className={`font-mono text-right text-[12px] ${entry.qtyDelta > 0 ? "text-green" : "text-red"}`}>{fmtDelta(entry.qtyDelta)}</strong>
                    <strong className="font-mono text-right text-[12px]">{entry.balanceAfter}</strong>
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-2 px-4 py-3"><span className="text-[10.5px] text-muted">{filtered.length} entry · halaman {page}/{pageCount}</span><div className="flex gap-1"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="min-h-11 rounded-md border border-line px-4 text-[12px] disabled:opacity-35">Sebelumnya</button><button disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)} className="min-h-11 rounded-md border border-line px-4 text-[12px] disabled:opacity-35">Berikutnya</button></div></div>
        </Card>

        <Card className="col-span-12 h-fit overflow-hidden xl:col-span-4 xl:sticky xl:top-24">
          {!selected ? <EmptyState title="Pilih entry ledger" description="Detail, allocation, dan Koreksi Entri muncul di sini." /> : (
            <>
              <div className="border-b border-line-2 p-5"><div className="flex flex-wrap items-start justify-between gap-2"><div><SectionLabel>Detail entry</SectionLabel><h3 className="mt-1 font-mono text-[13px] font-semibold">{selected.id}</h3></div><PillRect tone={selected.qtyDelta > 0 ? "green" : "neutral"}>{selected.reason}</PillRect></div><p className="mt-3 text-[11.5px] text-muted">Dibuat {formatTime(selected.createdAt)} oleh {selected.actor}</p></div>
              <div className="space-y-2 p-5 text-[11.5px]">
                <div className="flex justify-between gap-3"><span className="text-muted">Produk</span><strong>{selectedProduct?.name}</strong></div>
                <div className="flex justify-between gap-3"><span className="text-muted">Batch</span><strong className="font-mono">{selectedBatch?.code ?? "—"}</strong></div>
                <div className="flex justify-between gap-3"><span className="text-muted">Expiry batch</span><strong className={`font-mono ${expiredBatch ? "text-red" : ""}`}>{selectedBatch ? formatDate(selectedBatch.expiryDate) : "—"}{expiredBatch ? " · kedaluwarsa" : ""}</strong></div>
                <div className="flex justify-between gap-3"><span className="text-muted">Reason / channel</span><strong>{selected.reason} / {selected.channel}</strong></div>
                <div className="flex justify-between gap-3"><span className="text-muted">Qty / saldo after</span><strong className="font-mono">{fmtDelta(selected.qtyDelta)} / {selected.balanceAfter}</strong></div>
                <div className="flex justify-between gap-3"><span className="text-muted">Reference</span>{referenceTarget(selected.referenceType, selected.referenceId) ? <Link href={referenceTarget(selected.referenceType, selected.referenceId)} className="font-mono font-medium text-green hover:underline">{selected.referenceId} →</Link> : <strong className="font-mono">{selected.referenceId}</strong>}</div>
                <div className="flex justify-between gap-3"><span className="text-muted">Status opening</span><strong>{selected.verificationStatus ?? "—"}</strong></div>
              </div>
              {allocationGroup.length > 1 ? <div className="border-t border-line-2 p-5"><SectionLabel>Allocation breakdown</SectionLabel><div className="mt-2 space-y-1.5">{allocationGroup.map((entry) => <button key={entry.id} onClick={() => selectEntry(entry.id)} className="flex min-h-11 w-full items-center justify-between rounded-md bg-line-2 px-3 text-[10.5px]"><span className="font-mono">{state.batches.find((batch) => batch.id === entry.batchId)?.code}</span><strong className="font-mono">{fmtDelta(entry.qtyDelta)}</strong></button>)}</div></div> : null}
              {linkedOriginal || linkedReversal ? <div className="border-t border-line-2 p-5"><SectionLabel>Reversal link</SectionLabel>{linkedOriginal ? <button onClick={() => selectEntry(linkedOriginal.id)} className="mt-2 min-h-11 w-full rounded-md bg-amber-soft px-3 text-left font-mono text-[10.5px] text-amber">Membalik {linkedOriginal.id} →</button> : null}{linkedReversal ? <button onClick={() => selectEntry(linkedReversal.id)} className="mt-2 min-h-11 w-full rounded-md bg-amber-soft px-3 text-left font-mono text-[10.5px] text-amber">Dikoreksi oleh {linkedReversal.id} →</button> : null}</div> : null}
              {correctionOpen ? (
                <div className="border-t border-line-2 p-5">
                  {correctionStep === "INPUT" ? <><SectionLabel>Alasan koreksi</SectionLabel><textarea value={correctionNote} onChange={(event) => setCorrectionNote(event.target.value)} className="mt-2 min-h-24 w-full rounded-md border border-line p-3 text-[12px] outline-none focus:border-green" placeholder="Jelaskan kesalahan entry asli…" /><button disabled={!correctionNote.trim()} onClick={() => setCorrectionStep("PREVIEW")} className="mt-3 min-h-11 w-full rounded-md bg-green text-[12px] font-medium text-white disabled:opacity-40">Tinjau Reversal</button></> : <><SectionLabel>Preview reversal</SectionLabel><div className="mt-2 rounded-md bg-line-2 p-3 text-[11.5px]"><div className="flex justify-between"><span>Entry asli</span><strong className="font-mono">{fmtDelta(selected.qtyDelta)}</strong></div><div className="mt-2 flex justify-between"><span>Reversal baru</span><strong className="font-mono text-amber">{fmtDelta(-selected.qtyDelta)}</strong></div><div className="mt-2 flex justify-between"><span>Saldo batch</span><strong className="font-mono">{batchQty(state, selected.batchId)} → {batchQty(state, selected.batchId) - selected.qtyDelta}</strong></div></div><div className="mt-3 flex gap-2"><button onClick={() => setCorrectionStep("INPUT")} className="min-h-11 flex-1 rounded-md border border-line text-[12px] font-medium">Kembali</button><button onClick={correct} className="min-h-11 flex-1 rounded-md bg-green text-[12px] font-medium text-white">Konfirmasi &amp; Buat Reversal</button></div></>}
                </div>
              ) : canCorrect ? <div className="border-t border-line-2 p-5"><button onClick={() => setCorrectionOpen(true)} className="min-h-11 w-full rounded-md bg-amber px-4 text-[12px] font-medium text-white">Koreksi Entri</button><p className="mt-2 text-[10.5px] text-muted">Entry asli tidak diedit atau dihapus.</p></div> : null}
            </>
          )}
        </Card>
      </div>
      <div className="mt-4 rounded-md border border-line bg-surface px-4 py-3 text-[11.5px] text-muted">Saldo dibaca dari <strong className="text-ink">stock balance summary O(1)</strong> dan dapat diverifikasi ulang dari seluruh ledger entry.</div>
    </section>
  );
}

export default function LedgerPage() {
  return <Suspense fallback={<div className="p-7"><Skeleton className="h-96" /></div>}><LedgerScreen /></Suspense>;
}
