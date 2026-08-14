"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDemoStore } from "@/components/demo-store-provider";
import { useToast } from "@/components/toast";
import { Card, EmptyState, Pill, PillRect, SectionLabel, Skeleton } from "@/components/ui";
import { SuccessPanel } from "@/components/async-state";
import { fmtDelta } from "@/lib/format";

const inputClass = "min-h-[44px] w-full rounded-lg border border-black/[0.1] bg-black/[0.015] px-3.5 text-[12.5px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] outline-none transition-all focus:border-[#6cc795] focus:bg-white focus:ring-[3px] focus:ring-[#6cc795]/20 disabled:bg-black/[0.04] disabled:opacity-70 disabled:cursor-not-allowed";

function formatTime(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(value));
}

function valuesFromSession(session: ReturnType<typeof useDemoStore>["state"]["opnameSessions"][number] | undefined) {
  return Object.fromEntries((session?.counts ?? []).map((count) => [count.batchId, count.physicalQty === undefined ? "" : String(count.physicalQty)]));
}

function exceptionsFromSession(session: ReturnType<typeof useDemoStore>["state"]["opnameSessions"][number] | undefined) {
  return Object.fromEntries((session?.counts ?? []).map((count) => [count.batchId, count.exceptionReason ?? ""]));
}

function OpnameScreen() {
  const { state, execute } = useDemoStore();
  const toast = useToast();
  const params = useSearchParams();
  const router = useRouter();
  const deepLinked = state.opnameSessions.find((item) => item.id === params.get("session"));
  const initial = deepLinked ?? state.opnameSessions[0];
  const [selectedId, setSelectedId] = useState(initial?.id ?? "");
  const selected = state.opnameSessions.find((item) => item.id === selectedId) ?? state.opnameSessions[0];
  const [values, setValues] = useState<Record<string, string>>(() => valuesFromSession(initial));
  const [exceptions, setExceptions] = useState<Record<string, string>>(() => exceptionsFromSession(initial));
  const [previewOpen, setPreviewOpen] = useState(false);
  const [lastResult, setLastResult] = useState("");
  const [creating, setCreating] = useState(false);

  function chooseSession(id: string) {
    const session = state.opnameSessions.find((item) => item.id === id);
    setSelectedId(id);
    setValues(valuesFromSession(session));
    setExceptions(exceptionsFromSession(session));
    setPreviewOpen(false);
    router.replace(`/opname?session=${id}`);
  }

  async function saveDraft() {
    if (!selected || selected.status !== "DRAFT") return false;
    for (const count of selected.counts) {
      const raw = values[count.batchId];
      const result = await execute({
        type: "SAVE_OPNAME_COUNT",
        sessionId: selected.id,
        batchId: count.batchId,
        physicalQty: raw === "" ? undefined : Number(raw),
        exceptionReason: raw === "" ? exceptions[count.batchId] : undefined,
      });
      if (!result.ok) {
        toast({ title: result.title, description: result.description, tone: "error" });
        return false;
      }
    }
    toast({ title: "Draft opname tersimpan", description: `${selected.counts.length} batch diperbarui.` });
    setLastResult(`Draft ${selected.id} tersimpan.`);
    return true;
  }

  async function reviewFinalization() {
    if (missing > 0) {
      toast({
        title: "Scope belum lengkap",
        description: `${missing} batch harus dihitung atau diberi alasan pengecualian.`,
        tone: "error",
      });
      return;
    }
    if (await saveDraft()) setPreviewOpen(true);
  }

  async function finalize() {
    if (!selected) return;
    const result = await execute({ type: "FINALIZE_OPNAME", sessionId: selected.id });
    toast({ title: result.title, description: result.description, tone: result.ok ? "success" : "error" });
    if (result.ok) {
      setLastResult(`${result.title}: ${result.description}`);
      setPreviewOpen(false);
    }
  }

  async function createSession() {
    if (creating) return;
    setCreating(true);
    try {
      const result = await execute({ type: "CREATE_OPNAME" });
      toast({ title: result.title, description: result.description, tone: result.ok ? "success" : "error" });
      if (result.ok && result.entityId) {
        setSelectedId(result.entityId);
        setValues({});
        setExceptions({});
        router.replace(`/opname?session=${result.entityId}`);
      }
    } finally {
      setCreating(false);
    }
  }

  if (!selected) return <section className="p-7"><Card><EmptyState title="Belum ada sesi opname" action={<button onClick={createSession} disabled={creating} aria-busy={creating} className="min-h-[44px] rounded-lg bg-gradient-to-b from-[#2a8757] to-[#17623c] px-5 text-[12.5px] font-semibold text-white shadow-[0_4px_14px_rgba(31,107,67,0.25)] transition-all disabled:opacity-40 hover:from-[#319c65] hover:to-[#1a7044]">{creating ? "Membuat sesi…" : "Sesi Opname Baru"}</button>} /></Card></section>;

  const counted = selected.counts.filter((count) => values[count.batchId] !== "" || exceptions[count.batchId]).length;
  const previewRows = selected.counts
    .map((count) => ({ ...count, physical: values[count.batchId] === "" ? undefined : Number(values[count.batchId]), exception: exceptions[count.batchId] }))
    .filter((count) => count.physical !== undefined && count.physical !== count.systemQty);
  const totalImpact = previewRows.reduce((total, count) => total + (count.physical! - count.systemQty), 0);
  const missing = selected.counts.length - counted;

  return (
    <section className="mx-auto max-w-[1720px] animate-fade-in px-4 py-6 sm:px-7">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-semibold tracking-tight text-ink">Stok Opname</h2>
          <p className="mt-1 text-[12px] text-muted-2">Hitung fisik per batch, preview koreksi, lalu kunci sesi.</p>
        </div>
        <button onClick={createSession} disabled={creating} aria-busy={creating} className="min-h-[44px] rounded-lg bg-gradient-to-b from-[#2a8757] to-[#17623c] px-5 text-[12.5px] font-semibold text-white shadow-[0_4px_14px_rgba(31,107,67,0.25)] transition-all disabled:opacity-40 hover:from-[#319c65] hover:to-[#1a7044]">{creating ? "Membuat sesi…" : "Sesi Opname Baru"}</button>
      </div>
      
      {lastResult ? <div className="mb-5"><SuccessPanel>{lastResult}</SuccessPanel></div> : null}
      
      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-12 space-y-3 lg:col-span-4 xl:col-span-3">
          <div className="mb-2 px-1">
            <h3 className="text-[13px] font-semibold text-ink">Daftar sesi</h3>
          </div>
          {state.opnameSessions.map((session) => {
            const completed = session.counts.filter((count) => count.physicalQty !== undefined || count.exceptionReason).length;
            return (
              <button key={session.id} onClick={() => chooseSession(session.id)} className={`group block w-full rounded-xl border p-5 text-left transition-colors ${selected.id === session.id ? "border-[#6cc795]/50 bg-[#e6f2ec]/60 shadow-[0_2px_10px_rgba(108,199,149,0.1)]" : "border-black/[0.06] bg-white hover:border-black/[0.15] hover:bg-[#f6f7f5]/80 shadow-sm"}`}>
                <div className="flex items-center justify-between gap-2">
                  <strong className="font-mono text-[12.5px] text-ink">{session.id}</strong>
                  <PillRect tone={session.status === "DRAFT" ? "amber" : "green"}>{session.status}</PillRect>
                </div>
                <p className="mt-2 text-[11px] text-muted-2">{session.warehouse} · {formatTime(session.startedAt)}</p>
                <p className="mt-1.5 font-mono text-[10px] text-muted-2">{completed}/{session.counts.length} batch · {session.createdBy}</p>
              </button>
            );
          })}
        </div>

        <div className="col-span-12 lg:col-span-8 xl:col-span-9">
          <Card className="overflow-hidden border-black/[0.06] shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black/[0.06] bg-[#fcfdfc] p-6">
              <div>
                <SectionLabel>Sesi terpilih</SectionLabel>
                <h3 className="mt-2 font-mono text-[15px] font-semibold text-ink">{selected.id}</h3>
                <p className="mt-1.5 text-[11px] text-muted-2">Mulai {formatTime(selected.startedAt)} · final {formatTime(selected.finalizedAt)}</p>
              </div>
              <Pill tone={selected.status === "DRAFT" ? "amber" : "green"}>{selected.status === "DRAFT" ? `${counted}/${selected.counts.length} dihitung` : "Terkunci"}</Pill>
            </div>
            
            <div className="hidden grid-cols-[1.4fr_90px_140px_1.2fr_100px] border-b border-black/[0.06] bg-black/[0.015] px-6 py-3 text-[10px] font-semibold uppercase tracking-wide text-muted-2 xl:grid">
              <span>Produk/batch</span>
              <span className="text-right">Sistem</span>
              <span className="text-right pr-2">Fisik</span>
              <span>Pengecualian</span>
              <span className="text-right">Selisih</span>
            </div>
            
            <div className="divide-y divide-black/[0.04]">
              {selected.counts.map((count) => {
                const batch = state.batches.find((item) => item.id === count.batchId);
                const product = state.products.find((item) => item.id === batch?.productId);
                const physical = values[count.batchId] === "" ? undefined : Number(values[count.batchId]);
                const delta = physical === undefined ? undefined : physical - count.systemQty;
                return (
                  <div key={count.batchId} className="grid gap-4 px-6 py-4 xl:grid-cols-[1.4fr_90px_140px_1.2fr_100px] xl:items-center">
                    <div>
                      <strong className="text-[12.5px] text-ink">{product?.name}</strong>
                      <div className="mt-1 font-mono text-[10.5px] text-muted-2">{batch?.code} · {batch?.origin}{batch?.verificationStatus === "UNVERIFIED" ? " · BELUM TERVERIFIKASI" : ""}</div>
                    </div>
                    <div className="flex justify-between xl:block xl:text-right">
                      <span className="text-[10px] font-semibold uppercase text-muted-2 xl:hidden">Stok sistem</span>
                      <strong className="font-mono text-[13px] text-ink">{count.systemQty}</strong>
                    </div>
                    <label>
                      <span className="text-[10px] font-semibold uppercase text-muted-2 xl:hidden mb-2 block">Stok fisik</span>
                      <input disabled={selected.status === "FINALIZED"} type="number" min={0} step={1} value={values[count.batchId] ?? ""} onChange={(event) => setValues({ ...values, [count.batchId]: event.target.value })} className={`${inputClass} text-right font-mono text-[13px] font-semibold`} aria-label={`Hitungan fisik ${batch?.code}`} />
                    </label>
                    <label>
                      <span className="text-[10px] font-semibold uppercase text-muted-2 xl:hidden mb-2 block">Alasan pengecualian</span>
                      <input disabled={selected.status === "FINALIZED" || values[count.batchId] !== ""} value={exceptions[count.batchId] ?? ""} onChange={(event) => setExceptions({ ...exceptions, [count.batchId]: event.target.value })} placeholder="Jika tidak dihitung…" className={`${inputClass}`} aria-label={`Pengecualian ${batch?.code}`} />
                    </label>
                    <div className="text-right">
                      {delta === undefined ? <PillRect tone={exceptions[count.batchId] ? "neutral" : "ghost"}>{exceptions[count.batchId] ? "DIKECUALIKAN" : "BELUM"}</PillRect> : <strong className={`font-mono text-[14px] ${delta === 0 ? "text-[#1f6b43]" : delta < 0 ? "text-[#b91c1c]" : "text-[#b07012]"}`}>{fmtDelta(delta)}</strong>}
                    </div>
                  </div>
                );
              })}
            </div>
            
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-black/[0.06] bg-[#fcfdfc] p-6 shadow-[inset_0_2px_10px_rgba(0,0,0,0.01)]">
              <div>
                <strong className="text-[12.5px] text-ink">Progress {counted}/{selected.counts.length}</strong>
                <p className="mt-1 text-[11px] text-muted-2">{missing ? `${missing} batch belum dihitung atau dikecualikan` : "Scope lengkap, siap ditinjau"}</p>
              </div>
              {selected.status === "DRAFT" ? (
                <div className="flex flex-wrap gap-3">
                  <button onClick={saveDraft} className="min-h-[44px] rounded-lg border border-black/[0.08] bg-white px-5 text-[12.5px] font-semibold text-ink-2 shadow-sm transition-all hover:bg-black/[0.02]">Simpan Draft</button>
                  <button onClick={reviewFinalization} className="min-h-[44px] rounded-lg bg-gradient-to-b from-[#2a8757] to-[#17623c] px-5 text-[12.5px] font-semibold text-white shadow-[0_4px_14px_rgba(31,107,67,0.25)] transition-all hover:from-[#319c65] hover:to-[#1a7044]">Tinjau Finalisasi</button>
                </div>
              ) : (
                <div className="text-right">
                  <PillRect tone="green">FINAL · LOCKED</PillRect>
                  <p className="mt-1.5 text-[11px] text-muted-2">{selected.correctionEntryIds.length} koreksi tertaut</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {previewOpen ? (
        <Card className="mt-6 overflow-hidden border-[#6cc795]/50 shadow-[0_4px_24px_rgba(108,199,149,0.15)]">
          <div className="border-b border-black/[0.06] bg-[#e6f2ec]/60 px-6 py-5">
            <SectionLabel>Preview finalisasi opname</SectionLabel>
            <h3 className="mt-1 text-[15px] font-semibold text-ink">Konfirmasi dampak sebelum sesi dikunci</h3>
          </div>
          <div className="grid gap-4 p-6 sm:grid-cols-4">
            <div><SectionLabel>Total batch</SectionLabel><strong className="mt-2 block font-mono text-2xl text-ink">{selected.counts.length}</strong></div>
            <div><SectionLabel>Daftar selisih</SectionLabel><strong className="mt-2 block font-mono text-2xl text-ink">{previewRows.length}</strong></div>
            <div><SectionLabel>Total dampak</SectionLabel><strong className={`mt-2 block font-mono text-2xl ${totalImpact < 0 ? "text-[#b91c1c]" : "text-[#1f6b43]"}`}>{fmtDelta(totalImpact)}</strong></div>
            <div><SectionLabel>Ledger baru</SectionLabel><strong className="mt-2 block font-mono text-2xl text-ink">{previewRows.length}</strong></div>
          </div>
          <div className="divide-y divide-black/[0.04] border-y border-black/[0.06] bg-black/[0.01]">
            {previewRows.map((count) => {
              const batch = state.batches.find((item) => item.id === count.batchId);
              const product = state.products.find((item) => item.id === batch?.productId);
              return (
                <div key={count.batchId} className="flex items-center justify-between gap-4 px-6 py-4 text-[12.5px]">
                  <div>
                    <strong className="text-ink">{product?.name}</strong>
                    <div className="mt-1 font-mono text-[10.5px] text-muted-2">{batch?.code}</div>
                  </div>
                  <strong className="font-mono text-[13px] text-ink">{count.systemQty} → {count.physical} <span className={count.physical! - count.systemQty < 0 ? "text-[#b91c1c]" : "text-[#1f6b43]"}>({fmtDelta(count.physical! - count.systemQty)})</span></strong>
                </div>
              );
            })}
            {previewRows.length === 0 ? <div className="px-6 py-5 text-[12.5px] text-muted-2">Tidak ada selisih; finalisasi tetap memverifikasi opening balance dalam scope.</div> : null}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 p-6">
            <p className="max-w-xl text-[11.5px] text-muted-2 leading-relaxed">Setelah finalisasi, sesi tidak dapat diedit atau difinalisasi ulang. Opening balance dalam scope menjadi terverifikasi dan tertaut ke sesi ini.</p>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => setPreviewOpen(false)} className="min-h-[44px] rounded-lg border border-black/[0.08] bg-white px-5 text-[12.5px] font-semibold text-ink-2 shadow-sm transition-all hover:bg-black/[0.02]">Kembali</button>
              <button onClick={finalize} className="min-h-[44px] rounded-lg bg-gradient-to-b from-[#2a8757] to-[#17623c] px-5 text-[12.5px] font-semibold text-white shadow-[0_4px_14px_rgba(31,107,67,0.25)] transition-all hover:from-[#319c65] hover:to-[#1a7044]">Finalisasi &amp; Buat Koreksi</button>
            </div>
          </div>
        </Card>
      ) : null}

      {selected.status === "FINALIZED" && selected.correctionEntryIds.length ? (
        <Card className="mt-6 border-black/[0.06] p-6 shadow-sm">
          <SectionLabel>Ledger correction</SectionLabel>
          <div className="mt-3 flex flex-wrap gap-2">
            {selected.correctionEntryIds.map((id) => (
              <Link key={id} href={`/ledger?entry=${id}`} className="min-h-11 rounded-lg bg-[#e6f2ec]/60 border border-[#6cc795]/30 px-4 py-3 font-mono text-[11.5px] text-[#1f6b43] transition-colors hover:bg-[#d1e8db] hover:border-[#6cc795]/50">
                {id} →
              </Link>
            ))}
          </div>
        </Card>
      ) : null}
    </section>
  );
}

export default function OpnamePage() {
  return <Suspense fallback={<div className="p-7"><Skeleton className="h-96" /></div>}><OpnameScreen /></Suspense>;
}
