"use client";

import Link from "next/link";
import { useState } from "react";
import { useDemoStore } from "@/components/demo-store-provider";
import { useToast } from "@/components/toast";
import { Card, Dot, EmptyState, Pill, PillRect, StatCard } from "@/components/ui";
import { LoadingRows, SuccessPanel } from "@/components/async-state";
import { IconRefresh } from "@/components/icons";
import { batchQty, daysUntil, isExpired, productOnHand, productReserved, productSellable } from "@/lib/demo/engine";
import { buildCsv, downloadCsv } from "@/lib/csv";
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

  function exportWorklist() {
    const csvRows = rows.map((anomaly) => [anomaly.priority, anomaly.status, anomaly.type, anomaly.title, anomaly.description, anomaly.referenceLabel, anomaly.source, anomaly.target, anomaly.id]);
    downloadCsv(
      `jejak-worklist-${state.demoNow.slice(0, 10)}.csv`,
      buildCsv(["Prioritas", "Status", "Tipe", "Judul", "Deskripsi", "Referensi", "Sumber", "Target", "ID"], csvRows),
    );
  }

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

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight text-ink">Worklist Anomali Harian</h2>
          <p className="mt-1 text-[12px] text-muted-2">Terakhir dijalankan {formatTime(state.lastReconciledAt)} · setiap item punya exact deep-link</p>
        </div>
        <div className="worklist-controls">
          <div className="worklist-tabs rounded-lg bg-black/[0.04] p-1 shadow-inner">
            {(["OPEN", "KRITIS", "PERINGATAN", "RESOLVED"] as Filter[]).map((item) => (
              <button
                key={item}
                onClick={() => setFilter(item)}
                className={`min-h-10 min-w-0 truncate rounded-md px-2 text-[10px] font-semibold tracking-wide uppercase transition-all duration-200 sm:px-4 sm:text-[10.5px] ${
                  filter === item
                    ? "bg-white text-ink shadow-[0_1px_4px_rgba(0,0,0,0.06)]"
                    : "text-muted hover:text-ink-2"
                }`}
              >
                {item === "OPEN" ? "Terbuka" : item === "RESOLVED" ? "Selesai" : item === "KRITIS" ? "Kritis" : "Peringatan"}
              </button>
            ))}
          </div>
          <button
            onClick={exportWorklist}
            disabled={rows.length === 0}
            className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 text-[12px] font-semibold tracking-wide shadow-sm transition-all duration-200 hover:bg-black/[0.02] hover:shadow disabled:opacity-40"
          >
            Export CSV ({rows.length})
          </button>
          <button
            onClick={rerun}
            disabled={rerunning}
            className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 text-[12px] font-semibold tracking-wide shadow-sm transition-all duration-200 hover:bg-black/[0.02] hover:shadow disabled:opacity-50"
          >
            <IconRefresh size={14} className={rerunning ? "animate-spin" : undefined} />
            {rerunning ? "Menjalankan…" : "Jalankan Ulang"}
          </button>
        </div>
      </div>

      <Card className="overflow-hidden mb-6">
        {rerunning ? (
          <LoadingRows count={4} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={filter === "RESOLVED" ? "Belum ada item selesai" : "Tidak ada anomali pada filter ini"}
            description="Worklist dihitung dari ledger, order, return, batch, dan claim."
          />
        ) : (
          <div className="divide-y divide-black/[0.04]">
            {rows.map((anomaly) => (
              <div
                key={anomaly.id}
                className="group grid gap-3 px-5 py-4 transition-colors duration-200 hover:bg-[#f6f7f5]/60 md:grid-cols-[130px_1.4fr_1fr_120px] md:items-center"
              >
                <div>
                  <Pill tone={anomaly.status === "RESOLVED" ? "green" : anomaly.priority === "KRITIS" ? "red" : "amber"}>
                    {anomaly.status === "RESOLVED" ? "Selesai" : anomaly.priority === "KRITIS" ? "Kritis" : "Peringatan"}
                  </Pill>
                </div>
                <div>
                  <strong className="text-[13px] font-semibold text-ink group-hover:text-green-2 transition-colors">{anomaly.title}</strong>
                  <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-2">{anomaly.description}</p>
                </div>
                <div>
                  <strong className="text-[12px] font-medium text-ink-2">{anomaly.referenceLabel}</strong>
                  <div className="mt-1.5">
                    <PillRect tone="neutral">{anomaly.source}</PillRect>
                  </div>
                </div>
                <Link
                  href={anomaly.target}
                  className="flex h-11 items-center justify-end text-[12.5px] font-semibold text-[#1f6b43] transition-all hover:text-[#17623c] hover:translate-x-0.5"
                >
                  Tindak lanjut →
                </Link>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="mt-6 grid grid-cols-12 gap-4">
        <Card className="col-span-12 p-6 lg:col-span-7">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-semibold tracking-tight text-ink">Pergerakan ledger · 14 hari</h3>
              <p className="mt-1.5 text-[11.5px] text-muted-2">Nilai tersedia permanen untuk touch dan keyboard, bukan hanya hover.</p>
            </div>
            <div className="flex gap-4 text-[11px] font-medium text-muted-2">
              <span className="flex items-center gap-2">
                <Dot className="bg-chart-in" />
                Masuk
              </span>
              <span className="flex items-center gap-2">
                <Dot className="bg-chart-out" />
                Keluar
              </span>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-x-2 gap-y-4 sm:grid-cols-[repeat(14,minmax(0,1fr))]">
            {movement.map((item) => (
              <div key={item.key} className="group min-w-0 text-center">
                <div className="flex h-[120px] items-end justify-center gap-1 border-b border-black/[0.06] pb-1 transition-all duration-300 group-hover:border-line">
                  <div
                    title={`${item.incoming} masuk`}
                    className="w-2.5 rounded-t-sm bg-chart-in/90 transition-all duration-300 group-hover:bg-chart-in"
                    style={{ height: `${Math.max(item.incoming ? 4 : 0, (item.incoming / chartMax) * 100)}%` }}
                  />
                  <div
                    title={`${item.outgoing} keluar`}
                    className="w-2.5 rounded-t-sm bg-chart-out/90 transition-all duration-300 group-hover:bg-chart-out"
                    style={{ height: `${Math.max(item.outgoing ? 4 : 0, (item.outgoing / chartMax) * 100)}%` }}
                  />
                </div>
                <div className="mt-2 truncate font-mono text-[9px] font-medium text-muted">{item.label}</div>
                <div className="mt-1 font-mono text-[9px] font-medium">
                  <span className="text-[#1f6b43]">+{item.incoming}</span>
                  <span className="ml-1 text-[#b07012]">−{item.outgoing}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card className="col-span-12 p-6 lg:col-span-5">
          <h3 className="text-[15px] font-semibold tracking-tight text-ink">Distribusi keluar per kanal</h3>
          <p className="mt-1.5 text-[11.5px] text-muted-2">Reason dan channel tetap terpisah pada setiap entry.</p>
          <div className="mt-6 space-y-5">
            {channels.map((item) => (
              <div key={item.channel}>
                <div className="mb-2 flex justify-between text-[12px]">
                  <strong className="text-ink-2 font-medium tracking-wide">{item.channel}</strong>
                  <span className="font-mono font-medium">{item.qty} unit</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-black/[0.04]">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#1f6b43] to-[#34a269] shadow-sm" style={{ width: `${(item.qty / channelMax) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 border-t border-black/[0.06] pt-5 text-[11.5px] text-muted-2">
            Net ledger saat ini: <strong className="font-mono text-[13px] text-ink">{fmtDelta(state.ledgerEntries.reduce((total, entry) => total + entry.qtyDelta, 0))}</strong>
          </div>
        </Card>
      </div>
    </section>
  );
}
