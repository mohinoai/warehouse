"use client";

import Link from "next/link";
import { useState } from "react";
import { useDemoStore } from "@/components/demo-store-provider";
import { useToast } from "@/components/toast";
import { Card, Dot, EmptyState, Pill, PillRect, StatCard } from "@/components/ui";
import { LoadingRows, SuccessPanel } from "@/components/async-state";
import { IconRefresh } from "@/components/icons";
import { batchQty, daysUntil, isExpired, productOnHand, productReserved, productSellable } from "@/lib/demo/engine";
import { fmt, fmtDelta } from "@/lib/format";

type Filter = "OPEN" | "KRITIS" | "PERINGATAN" | "RESOLVED";

function formatTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(value));
}

export default function DashboardPage() {
  const { state, execute } = useDemoStore();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("OPEN");
  const [rerunning, setRerunning] = useState(false);
  const [lastResult, setLastResult] = useState("");
  const stockProducts = state.products.filter((item) => !item.isBundle);
  const physical = stockProducts.reduce((total, product) => total + productOnHand(state, product.id), 0);
  const reserved = stockProducts.reduce((total, product) => total + productReserved(state, product.id), 0);
  const sellable = stockProducts.reduce((total, product) => total + productSellable(state, product.id), 0);
  const openAnomalies = state.anomalies.filter((item) => item.status === "OPEN");
  const critical = openAnomalies.filter((item) => item.priority === "KRITIS").length;
  const consistency = Math.max(0, 100 - (critical / Math.max(1, state.ledgerEntries.length)) * 100).toFixed(1).replace(".", ",");
  const expiring = state.batches.filter((batch) => batchQty(state, batch.id) > 0 && daysUntil(state.demoNow, `${batch.expiryDate}T23:59:59Z`) <= 30 && !isExpired(state, batch)).length;
  const rows = state.anomalies.filter((item) =>
    filter === "OPEN" ? item.status === "OPEN" : filter === "RESOLVED" ? item.status === "RESOLVED" : item.status === "OPEN" && item.priority === filter,
  );
  const movement = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(new Date(state.demoNow).getTime() - (13 - index) * 86_400_000);
    const key = date.toISOString().slice(0, 10);
    const entries = state.ledgerEntries.filter((entry) => entry.createdAt.slice(0, 10) === key);
    return {
      key,
      label: new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" }).format(date),
      incoming: entries.filter((entry) => entry.qtyDelta > 0).reduce((total, entry) => total + entry.qtyDelta, 0),
      outgoing: Math.abs(entries.filter((entry) => entry.qtyDelta < 0).reduce((total, entry) => total + entry.qtyDelta, 0)),
    };
  });
  const chartMax = Math.max(1, ...movement.map((item) => Math.max(item.incoming, item.outgoing)));
  const channels = ["SHOPEE", "TIKTOK", "OFFLINE", "INTERNAL"].map((channel) => ({
    channel,
    qty: Math.abs(state.ledgerEntries.filter((entry) => entry.channel === channel && entry.qtyDelta < 0).reduce((total, entry) => total + entry.qtyDelta, 0)),
  }));
  const channelMax = Math.max(1, ...channels.map((item) => item.qty));

  async function rerun() {
    setRerunning(true);
    await new Promise((resolve) => setTimeout(resolve, 650));
    const result = await execute({ type: "RERUN_RECONCILIATION" });
    setRerunning(false);
    setLastResult(`${result.title}: ${result.description}`);
    toast({ title: result.title, description: result.description, tone: result.ok ? "success" : "error" });
  }

  return (
    <section className="mx-auto max-w-[1720px] animate-fade-in px-4 pb-8 pt-6 sm:px-7">
      {lastResult ? <div className="mb-4"><SuccessPanel>{lastResult}</SuccessPanel></div> : null}
      <div className="mb-6 grid grid-cols-12 gap-3">
        <div className="col-span-12 sm:col-span-6 lg:col-span-3"><StatCard label="Stok Fisik" value={fmt(physical)} foot={<span className="text-muted">Dibentuk dari {state.batches.length} batch ledger</span>} /></div>
        <div className="col-span-12 sm:col-span-6 lg:col-span-3"><StatCard label="Sellable" value={fmt(sellable)} foot={<span className="text-muted">{fmt(reserved)} reserved · expired dikecualikan</span>} /></div>
        <div className="col-span-12 sm:col-span-6 lg:col-span-3"><StatCard label="Konsistensi Ledger" value={consistency} suffix={<span className="text-[16px] text-muted">%</span>} badge={<Pill tone={critical ? "amber" : "green"}>{critical ? "Perlu cek" : "Sehat"}</Pill>} foot={<span className="text-muted">{state.ledgerEntries.length} entry · {openAnomalies.length} anomali</span>} /></div>
        <div className="col-span-12 sm:col-span-6 lg:col-span-3"><StatCard label="Batch Mendekati Expiry" value={String(expiring)} valueClassName="text-amber" foot={<span className="text-muted">30 hari · batch expired tidak sellable</span>} /></div>
      </div>

      <div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-[16px] font-medium">Worklist Anomali Harian</h2><p className="mt-0.5 text-[12px] text-muted">Terakhir dijalankan {formatTime(state.lastReconciledAt)} · setiap item punya exact deep-link</p></div><div className="worklist-controls"><div className="worklist-tabs rounded-md bg-[#E9ECE7] p-0.5">{(["OPEN", "KRITIS", "PERINGATAN", "RESOLVED"] as Filter[]).map((item) => <button key={item} onClick={() => setFilter(item)} className={`min-h-11 min-w-0 truncate rounded px-1 text-[9.5px] font-medium sm:px-3 sm:text-[10.5px] ${filter === item ? "bg-surface shadow-sm" : "text-muted"}`}>{item === "OPEN" ? "Terbuka" : item === "RESOLVED" ? "Selesai" : item === "KRITIS" ? "Kritis" : "Peringatan"}</button>)}</div><button onClick={rerun} disabled={rerunning} className="flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-line bg-surface px-3 text-[12px] font-medium disabled:opacity-50"><IconRefresh size={13} className={rerunning ? "animate-spin" : undefined} />{rerunning ? "Menjalankan…" : "Jalankan Ulang"}</button></div></div>

      <Card className="overflow-hidden">
        {rerunning ? <LoadingRows count={4} /> : rows.length === 0 ? <EmptyState title={filter === "RESOLVED" ? "Belum ada item selesai" : "Tidak ada anomali pada filter ini"} description="Worklist dihitung dari ledger, order, return, batch, dan claim." /> : <div className="divide-y divide-line-2">{rows.map((anomaly) => <div key={anomaly.id} className="grid gap-3 px-4 py-4 md:grid-cols-[120px_1.4fr_1fr_110px] md:items-center"><div><Pill tone={anomaly.status === "RESOLVED" ? "green" : anomaly.priority === "KRITIS" ? "red" : "amber"}>{anomaly.status === "RESOLVED" ? "Selesai" : anomaly.priority === "KRITIS" ? "Kritis" : "Peringatan"}</Pill></div><div><strong className="text-[12.5px]">{anomaly.title}</strong><p className="mt-1 text-[11px] leading-relaxed text-muted">{anomaly.description}</p></div><div><strong className="text-[11.5px]">{anomaly.referenceLabel}</strong><div className="mt-1"><PillRect tone="neutral">{anomaly.source}</PillRect></div></div><Link href={anomaly.target} className="min-h-11 py-3 text-right text-[12px] font-medium text-green hover:underline">Tindak lanjut →</Link></div>)}</div>}
      </Card>

      <div className="mt-5 grid grid-cols-12 gap-3">
        <Card className="col-span-12 p-5 lg:col-span-7">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-[14px] font-medium">Pergerakan ledger · 14 hari</h3><p className="mt-1 text-[11px] text-muted">Nilai tersedia permanen untuk touch dan keyboard, bukan hanya hover.</p></div><div className="flex gap-3 text-[10.5px]"><span className="flex items-center gap-1.5"><Dot className="bg-chart-in" />Masuk</span><span className="flex items-center gap-1.5"><Dot className="bg-chart-out" />Keluar</span></div></div>
          <div className="grid grid-cols-7 gap-x-2 gap-y-4 sm:grid-cols-[repeat(14,minmax(0,1fr))]">{movement.map((item) => <div key={item.key} className="min-w-0 text-center"><div className="flex h-28 items-end justify-center gap-1 border-b border-line"><div title={`${item.incoming} masuk`} className="w-2 rounded-t bg-chart-in" style={{ height: `${Math.max(item.incoming ? 4 : 0, (item.incoming / chartMax) * 100)}%` }} /><div title={`${item.outgoing} keluar`} className="w-2 rounded-t bg-chart-out" style={{ height: `${Math.max(item.outgoing ? 4 : 0, (item.outgoing / chartMax) * 100)}%` }} /></div><div className="mt-1 truncate font-mono text-[8px] text-muted">{item.label}</div><div className="mt-1 font-mono text-[8px]"><span className="text-green">+{item.incoming}</span><span className="ml-1 text-red">−{item.outgoing}</span></div></div>)}</div>
        </Card>
        <Card className="col-span-12 p-5 lg:col-span-5"><h3 className="text-[14px] font-medium">Distribusi keluar per kanal</h3><p className="mt-1 text-[11px] text-muted">Reason dan channel tetap terpisah pada setiap entry.</p><div className="mt-5 space-y-4">{channels.map((item) => <div key={item.channel}><div className="mb-1.5 flex justify-between text-[11.5px]"><strong>{item.channel}</strong><span className="font-mono">{item.qty} unit</span></div><div className="h-2 rounded-full bg-line-2"><div className="h-full rounded-full bg-green" style={{ width: `${(item.qty / channelMax) * 100}%` }} /></div></div>)}</div><div className="mt-5 border-t border-line-2 pt-4 text-[11px] text-muted">Net ledger saat ini: <strong className="font-mono text-ink">{fmtDelta(state.ledgerEntries.reduce((total, entry) => total + entry.qtyDelta, 0))}</strong></div></Card>
      </div>
    </section>
  );
}
