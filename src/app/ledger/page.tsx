"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDemoStore } from "@/components/demo-store-provider";
import { useToast } from "@/components/toast";
import { Card, EmptyState, PillRect, SectionLabel, Skeleton } from "@/components/ui";
import { CustomSelect } from "@/components/custom-select";
import { SuccessPanel } from "@/components/async-state";
import { batchQty, productOnHand, productReserved, productSellable } from "@/lib/demo/engine";
import { CHANNELS, REASONS } from "@/lib/demo/types";
import { buildCsv, downloadCsv } from "@/lib/csv";
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

  function exportCsv() {
    const csvRows = filtered.map((entry) => {
      const product = state.products.find((item) => item.id === entry.productId);
      const batch = state.batches.find((item) => item.id === entry.batchId);
      return [entry.createdAt, product?.name ?? "", batch?.code ?? "", entry.reason, entry.channel, entry.referenceType, entry.referenceId, entry.referenceNote ?? "", entry.qtyDelta, entry.balanceAfter, entry.actor, entry.id];
    });
    downloadCsv(
      `jejak-ledger-${state.demoNow.slice(0, 10)}.csv`,
      buildCsv(["Waktu", "Produk", "Batch", "Reason", "Channel", "Reference Type", "Reference", "Catatan", "Delta", "Saldo", "Aktor", "Entry ID"], csvRows),
    );
  }

  const selectedBatch = state.batches.find((item) => item.id === selected?.batchId);
  const expiredBatch = Boolean(selectedBatch && selectedBatch.expiryDate < state.demoNow.slice(0, 10));
  const canCorrect = selected && !selected.reversedByEntryId && selected.reason !== "MANUAL_ENTRY_CORRECTION";

  return (
    <section className="mx-auto max-w-[1720px] animate-fade-in px-4 py-6 sm:px-7">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-semibold tracking-tight text-ink">Stock Ledger</h2>
          <p className="mt-1 text-[12px] text-muted-2">Append-only traceability dengan reason dan channel sebagai dimensi terpisah.</p>
        </div>
        <button onClick={exportCsv} disabled={filtered.length === 0} className="min-h-[40px] rounded-lg border border-black/[0.08] bg-white px-4 text-[12px] font-semibold text-ink-2 shadow-sm transition-all hover:bg-black/[0.02] disabled:opacity-40">Export CSV ({filtered.length})</button>
      </div>
      {lastResult ? <div className="mb-5"><SuccessPanel>{lastResult}</SuccessPanel></div> : null}

      {selectedProduct && !selectedProduct.isBundle ? (
        <div className="mb-5 grid grid-cols-3 gap-4">
          <Card className="p-5"><SectionLabel className="!text-[10px]">On-hand</SectionLabel><strong className="mt-1 block font-mono text-2xl text-ink">{fmt(productOnHand(state, selectedProduct.id))}</strong></Card>
          <Card className="p-5"><SectionLabel className="!text-[10px]">Reserved</SectionLabel><strong className="mt-1 block font-mono text-2xl text-amber">{fmt(productReserved(state, selectedProduct.id))}</strong></Card>
          <Card className="p-5"><SectionLabel className="!text-[10px]">Sellable</SectionLabel><strong className="mt-1 block font-mono text-2xl text-[#1f6b43]">{fmt(productSellable(state, selectedProduct.id))}</strong></Card>
        </div>
      ) : null}

      <Card className="mb-5 p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-2">Search<input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="ID, reference, produk…" className={`${inputClass} mt-2 w-full normal-case tracking-normal text-ink`} /></label>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-2">Produk<CustomSelect value={productId} onChange={(val) => { setProductId(val); setBatchId("ALL"); setPage(1); }} className={`${inputClass} mt-2 font-normal normal-case tracking-normal text-ink`} options={[{label: "Semua produk", value: "ALL"}, ...state.products.filter(item => !item.isBundle).map(p => ({label: p.name, value: p.id}))]} /></label>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-2">Batch<CustomSelect value={batchId} onChange={(val) => { setBatchId(val); setPage(1); }} className={`${inputClass} mt-2 font-normal normal-case tracking-normal text-ink`} options={[{label: "Semua batch", value: "ALL"}, ...availableBatches.map(b => ({label: b.code, value: b.id}))]} /></label>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-2">Reason<CustomSelect value={reason} onChange={(val) => { setReason(val); setPage(1); }} className={`${inputClass} mt-2 font-normal normal-case tracking-normal text-ink`} options={[{label: "Semua reason", value: "ALL"}, ...REASONS.map(r => ({label: r, value: r}))]} /></label>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-2">Channel<CustomSelect value={channel} onChange={(val) => { setChannel(val); setPage(1); }} className={`${inputClass} mt-2 font-normal normal-case tracking-normal text-ink`} options={[{label: "Semua channel", value: "ALL"}, ...CHANNELS.map(c => ({label: c, value: c}))]} /></label>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-2">Tanggal<CustomSelect value={range} onChange={(val) => { setRange(val); setPage(1); }} className={`${inputClass} mt-2 font-normal normal-case tracking-normal text-ink`} options={[{label: "Semua waktu", value: "ALL"}, {label: "7 hari", value: "7"}, {label: "30 hari", value: "30"}, {label: "90 hari", value: "90"}]} /></label>
          <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-2">Reversal<CustomSelect value={reversal} onChange={(val) => { setReversal(val); setPage(1); }} className={`${inputClass} mt-2 font-normal normal-case tracking-normal text-ink`} options={[{label: "Semua status", value: "ALL"}, {label: "Dapat dikoreksi", value: "REVERSIBLE"}, {label: "Sudah tertaut", value: "LINKED"}]} /></label>
        </div>
      </Card>

      <div className="grid grid-cols-12 gap-5">
        <Card className="col-span-12 overflow-hidden xl:col-span-8">
          <div className="hidden grid-cols-[130px_1.2fr_1fr_1fr_1.2fr_70px_70px] border-b border-black/[0.06] bg-black/[0.015] px-5 py-3 text-[10px] font-semibold uppercase tracking-wide text-muted-2 md:grid"><span>Waktu</span><span>Produk/batch</span><span>Reason</span><span>Channel</span><span>Reference</span><span className="text-right">Delta</span><span className="text-right">Saldo</span></div>
          {rows.length === 0 ? <EmptyState title="Tidak ada entry" description="Ubah filter atau catat transaksi baru." /> : (
            <div className="divide-y divide-black/[0.04]">
              {rows.map((entry) => {
                const product = state.products.find((item) => item.id === entry.productId);
                const batch = state.batches.find((item) => item.id === entry.batchId);
                const missingReference = ["BONUS", "PROMO", "SAMPLE"].includes(entry.reason) && !entry.referenceNote;
                return (
                  <button key={entry.id} onClick={() => selectEntry(entry.id)} className={`group grid min-h-[72px] w-full gap-3 px-5 py-4 text-left transition-colors md:grid-cols-[130px_1.2fr_1fr_1fr_1.2fr_70px_70px] md:items-center ${selectedId === entry.id ? "bg-[#e6f2ec]/60" : "hover:bg-[#f6f7f5]/80"}`}>
                    <div><span className="mr-2 text-[10px] font-semibold uppercase text-muted-2 md:hidden">Waktu</span><span className="font-mono text-[10.5px] text-muted-2 transition-colors group-hover:text-ink">{formatTime(entry.createdAt)}</span></div>
                    <div><strong className="text-[12px] text-ink">{product?.name}</strong><div className="mt-1 font-mono text-[10px] text-muted-2">{batch?.code} · {entry.id}</div></div>
                    <div><PillRect tone={entry.reason.includes("CORRECTION") ? "amber" : entry.qtyDelta > 0 ? "green" : "neutral"}>{entry.reason}</PillRect></div>
                    <div><span className="mr-2 text-[10px] font-semibold uppercase text-muted-2 md:hidden">Channel</span><span className="text-[11.5px] text-ink-2">{entry.channel}</span></div>
                    <div><span className={`font-mono text-[10.5px] ${entry.qtyDelta > 0 ? "text-[#1f6b43]" : "text-ink-2"}`}>{entry.referenceId}</span>{missingReference ? <div className="mt-1.5 text-[10px] font-medium text-red">Referensi campaign kosong</div> : entry.referenceNote ? <div className="mt-1.5 truncate text-[10px] text-muted-2">{entry.referenceNote}</div> : null}</div>
                    <strong className={`font-mono text-right text-[13px] ${entry.qtyDelta > 0 ? "text-[#1f6b43]" : "text-[#b07012]"}`}>{fmtDelta(entry.qtyDelta)}</strong>
                    <strong className="font-mono text-right text-[13px] text-ink">{entry.balanceAfter}</strong>
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.06] bg-[#fcfdfc] px-5 py-3 shadow-[inset_0_2px_10px_rgba(0,0,0,0.01)]"><span className="text-[11px] font-medium text-muted-2">{filtered.length} entry · halaman {page}/{pageCount}</span><div className="flex gap-2"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="min-h-[36px] rounded-md border border-black/[0.08] bg-white px-4 text-[11.5px] font-semibold text-ink-2 shadow-sm transition-all hover:bg-black/[0.02] disabled:opacity-40">Sebelumnya</button><button disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)} className="min-h-[36px] rounded-md border border-black/[0.08] bg-white px-4 text-[11.5px] font-semibold text-ink-2 shadow-sm transition-all hover:bg-black/[0.02] disabled:opacity-40">Berikutnya</button></div></div>
        </Card>

        <Card className="col-span-12 h-fit overflow-hidden xl:col-span-4 xl:sticky xl:top-24">
          {!selected ? <EmptyState title="Pilih entry ledger" description="Detail, allocation, dan Koreksi Entri muncul di sini." /> : (
            <>
              <div className="border-b border-black/[0.06] p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><SectionLabel>Detail entry</SectionLabel><h3 className="mt-2 font-mono text-[14px] font-semibold text-ink">{selected.id}</h3></div><PillRect tone={selected.qtyDelta > 0 ? "green" : "neutral"}>{selected.reason}</PillRect></div><p className="mt-4 text-[11.5px] text-muted-2">Dibuat {formatTime(selected.createdAt)} oleh <strong className="text-ink-2">{selected.actor}</strong></p></div>
              <div className="space-y-3 p-6 text-[12px]">
                <div className="flex justify-between gap-3"><span className="text-muted-2">Produk</span><strong className="text-ink">{selectedProduct?.name}</strong></div>
                <div className="flex justify-between gap-3"><span className="text-muted-2">Batch</span><strong className="font-mono text-ink">{selectedBatch?.code ?? "—"}</strong></div>
                <div className="flex justify-between gap-3"><span className="text-muted-2">Expiry batch</span><strong className={`font-mono ${expiredBatch ? "text-red" : "text-ink"}`}>{selectedBatch ? formatDate(selectedBatch.expiryDate) : "—"}{expiredBatch ? " · kedaluwarsa" : ""}</strong></div>
                <div className="flex justify-between gap-3"><span className="text-muted-2">Reason / channel</span><strong className="text-ink">{selected.reason} / {selected.channel}</strong></div>
                <div className="flex justify-between gap-3"><span className="text-muted-2">Qty / saldo after</span><strong className="font-mono text-ink">{fmtDelta(selected.qtyDelta)} / {selected.balanceAfter}</strong></div>
                <div className="flex justify-between gap-3"><span className="text-muted-2">Reference</span>{referenceTarget(selected.referenceType, selected.referenceId) ? <Link href={referenceTarget(selected.referenceType, selected.referenceId)} className="font-mono font-medium text-[#1f6b43] transition-colors hover:text-[#17623c] hover:underline">{selected.referenceId} →</Link> : <strong className="font-mono text-ink">{selected.referenceId}</strong>}</div>
                <div className="flex justify-between gap-3"><span className="text-muted-2">Status opening</span><strong className="text-ink">{selected.verificationStatus ?? "—"}</strong></div>
              </div>
              {allocationGroup.length > 1 ? <div className="border-t border-black/[0.06] p-6"><SectionLabel>Allocation breakdown</SectionLabel><div className="mt-3 space-y-2">{allocationGroup.map((entry) => <button key={entry.id} onClick={() => selectEntry(entry.id)} className="flex min-h-[44px] w-full items-center justify-between rounded-lg bg-black/[0.02] border border-black/[0.05] px-4 text-[11px] transition-colors hover:bg-black/[0.04]"><span className="font-mono text-ink-2">{state.batches.find((batch) => batch.id === entry.batchId)?.code}</span><strong className="font-mono text-ink">{fmtDelta(entry.qtyDelta)}</strong></button>)}</div></div> : null}
              {linkedOriginal || linkedReversal ? <div className="border-t border-black/[0.06] p-6"><SectionLabel>Reversal link</SectionLabel>{linkedOriginal ? <button onClick={() => selectEntry(linkedOriginal.id)} className="mt-3 min-h-[44px] w-full rounded-lg bg-amber-soft px-4 text-left font-mono text-[11px] font-medium text-amber transition-colors hover:bg-[#fae7c8]">Membalik {linkedOriginal.id} →</button> : null}{linkedReversal ? <button onClick={() => selectEntry(linkedReversal.id)} className="mt-3 min-h-[44px] w-full rounded-lg bg-amber-soft px-4 text-left font-mono text-[11px] font-medium text-amber transition-colors hover:bg-[#fae7c8]">Dikoreksi oleh {linkedReversal.id} →</button> : null}</div> : null}
              {correctionOpen ? (
                <div className="border-t border-black/[0.06] p-6">
                  {correctionStep === "INPUT" ? <><SectionLabel>Alasan koreksi</SectionLabel><textarea value={correctionNote} onChange={(event) => setCorrectionNote(event.target.value)} className="mt-3 min-h-24 w-full rounded-lg border border-black/[0.1] bg-black/[0.015] p-3.5 text-[12.5px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] outline-none transition-all focus:border-[#6cc795] focus:bg-white focus:ring-[3px] focus:ring-[#6cc795]/20" placeholder="Jelaskan kesalahan entry asli…" /><button disabled={!correctionNote.trim()} onClick={() => setCorrectionStep("PREVIEW")} className="mt-4 min-h-[44px] w-full rounded-lg bg-gradient-to-b from-[#2a8757] to-[#17623c] text-[13px] font-semibold text-white shadow-[0_4px_14px_rgba(31,107,67,0.25)] transition-all disabled:opacity-40 hover:from-[#319c65] hover:to-[#1a7044]">Tinjau Reversal</button></> : <><SectionLabel>Preview reversal</SectionLabel><div className="mt-3 rounded-lg border border-black/[0.05] bg-black/[0.02] p-4 text-[12px]"><div className="flex justify-between"><span className="text-muted-2">Entry asli</span><strong className="font-mono text-ink">{fmtDelta(selected.qtyDelta)}</strong></div><div className="mt-3 flex justify-between"><span className="text-muted-2">Reversal baru</span><strong className="font-mono text-amber">{fmtDelta(-selected.qtyDelta)}</strong></div><div className="mt-3 flex justify-between"><span className="text-muted-2">Saldo batch</span><strong className="font-mono text-ink">{batchQty(state, selected.batchId)} → {batchQty(state, selected.batchId) - selected.qtyDelta}</strong></div></div><div className="mt-4 flex gap-3"><button onClick={() => setCorrectionStep("INPUT")} className="min-h-[44px] flex-1 rounded-lg border border-black/[0.08] bg-white text-[12.5px] font-semibold text-ink-2 shadow-sm transition-all hover:bg-black/[0.02]">Kembali</button><button onClick={correct} className="min-h-[44px] flex-1 rounded-lg bg-gradient-to-b from-[#2a8757] to-[#17623c] text-[12.5px] font-semibold text-white shadow-[0_4px_14px_rgba(31,107,67,0.25)] transition-all hover:from-[#319c65] hover:to-[#1a7044]">Konfirmasi &amp; Reversal</button></div></>}
                </div>
              ) : canCorrect ? <div className="border-t border-black/[0.06] p-6"><button onClick={() => setCorrectionOpen(true)} className="min-h-[44px] w-full rounded-lg bg-gradient-to-b from-[#d97706] to-[#b45309] px-4 text-[13px] font-semibold text-white shadow-[0_4px_14px_rgba(217,119,6,0.25)] transition-all hover:from-[#f59e0b] hover:to-[#d97706] hover:shadow-[0_6px_20px_rgba(217,119,6,0.4)]">Koreksi Entri</button><p className="mt-3 text-center text-[11px] text-muted-2">Entry asli tidak diedit atau dihapus.</p></div> : null}
            </>
          )}
        </Card>
      </div>
      <div className="mt-5 rounded-lg border border-black/[0.06] bg-black/[0.02] px-5 py-4 text-[12px] text-muted-2">Saldo dibaca dari <strong className="text-ink">stock balance summary O(1)</strong> dan dapat diverifikasi ulang dari seluruh ledger entry.</div>
    </section>
  );
}

export default function LedgerPage() {
  return <Suspense fallback={<div className="p-7"><Skeleton className="h-96" /></div>}><LedgerScreen /></Suspense>;
}
