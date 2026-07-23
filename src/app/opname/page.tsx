"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDemoStore } from "@/components/demo-store-provider";
import { useToast } from "@/components/toast";
import { Card, EmptyState, Pill, PillRect, SectionLabel, Skeleton } from "@/components/ui";
import { SuccessPanel } from "@/components/async-state";
import { fmtDelta } from "@/lib/format";

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
    const result = await execute({ type: "CREATE_OPNAME" });
    toast({ title: result.title, description: result.description, tone: result.ok ? "success" : "error" });
    if (result.ok && result.entityId) {
      setSelectedId(result.entityId);
      setValues({});
      setExceptions({});
      router.replace(`/opname?session=${result.entityId}`);
    }
  }

  if (!selected) return <section className="p-7"><Card><EmptyState title="Belum ada sesi opname" action={<button onClick={createSession} className="min-h-11 rounded-md bg-green px-4 text-[12px] font-medium text-white">Sesi Opname Baru</button>} /></Card></section>;

  const counted = selected.counts.filter((count) => values[count.batchId] !== "" || exceptions[count.batchId]).length;
  const previewRows = selected.counts
    .map((count) => ({ ...count, physical: values[count.batchId] === "" ? undefined : Number(values[count.batchId]), exception: exceptions[count.batchId] }))
    .filter((count) => count.physical !== undefined && count.physical !== count.systemQty);
  const totalImpact = previewRows.reduce((total, count) => total + (count.physical! - count.systemQty), 0);
  const missing = selected.counts.length - counted;

  return (
    <section className="mx-auto max-w-[1720px] animate-fade-in px-4 py-6 sm:px-7">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-[17px] font-medium">Stok Opname</h2><p className="mt-0.5 text-[12px] text-muted">Hitung fisik per batch, preview koreksi, lalu kunci sesi.</p></div><button onClick={createSession} className="min-h-11 rounded-md bg-green px-4 text-[12.5px] font-medium text-white">Sesi Opname Baru</button></div>
      {lastResult ? <div className="mb-4"><SuccessPanel>{lastResult}</SuccessPanel></div> : null}
      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 h-fit overflow-hidden lg:col-span-3">
          <div className="border-b border-line-2 px-4 py-3"><h3 className="text-[13px] font-medium">Daftar sesi</h3></div>
          <div className="divide-y divide-line-2">{state.opnameSessions.map((session) => { const completed = session.counts.filter((count) => count.physicalQty !== undefined || count.exceptionReason).length; return <button key={session.id} onClick={() => chooseSession(session.id)} className={`w-full p-4 text-left ${selected.id === session.id ? "bg-green-soft" : "hover:bg-line-2"}`}><div className="flex items-center justify-between gap-2"><strong className="font-mono text-[11px]">{session.id}</strong><PillRect tone={session.status === "DRAFT" ? "amber" : "green"}>{session.status}</PillRect></div><p className="mt-2 text-[10.5px] text-muted">{session.warehouse} · {formatTime(session.startedAt)}</p><p className="mt-1 font-mono text-[10px] text-muted">{completed}/{session.counts.length} batch · {session.createdBy}</p></button>; })}</div>
        </Card>

        <Card className="col-span-12 overflow-hidden lg:col-span-9">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line-2 p-4"><div><SectionLabel>Sesi terpilih</SectionLabel><h3 className="mt-1 font-mono text-[14px] font-semibold">{selected.id}</h3><p className="mt-1 text-[10.5px] text-muted">Mulai {formatTime(selected.startedAt)} · final {formatTime(selected.finalizedAt)}</p></div><Pill tone={selected.status === "DRAFT" ? "amber" : "green"}>{selected.status === "DRAFT" ? `${counted}/${selected.counts.length} dihitung` : "Terkunci"}</Pill></div>
          <div className="hidden grid-cols-[1.4fr_100px_130px_1fr_100px] border-b border-line-2 bg-line-2/50 px-4 py-2 text-[9.5px] font-medium uppercase tracking-[0.08em] text-muted md:grid"><span>Produk/batch</span><span className="text-right">Sistem</span><span className="text-right">Fisik</span><span>Pengecualian</span><span className="text-right">Selisih</span></div>
          <div className="divide-y divide-line-2">
            {selected.counts.map((count) => {
              const batch = state.batches.find((item) => item.id === count.batchId);
              const product = state.products.find((item) => item.id === batch?.productId);
              const physical = values[count.batchId] === "" ? undefined : Number(values[count.batchId]);
              const delta = physical === undefined ? undefined : physical - count.systemQty;
              return (
                <div key={count.batchId} className="grid gap-3 px-4 py-3 md:grid-cols-[1.4fr_100px_130px_1fr_100px] md:items-center">
                  <div><strong className="text-[11.5px]">{product?.name}</strong><div className="font-mono text-[9.5px] text-muted">{batch?.code} · {batch?.origin}{batch?.verificationStatus === "UNVERIFIED" ? " · BELUM TERVERIFIKASI" : ""}</div></div>
                  <div className="flex justify-between md:block md:text-right"><span className="text-[10px] text-muted md:hidden">Stok sistem</span><strong className="font-mono text-[12px]">{count.systemQty}</strong></div>
                  <label><span className="text-[10px] text-muted md:hidden">Stok fisik</span><input disabled={selected.status === "FINALIZED"} type="number" min={0} step={1} value={values[count.batchId] ?? ""} onChange={(event) => setValues({ ...values, [count.batchId]: event.target.value })} className="min-h-11 w-full rounded-md border border-line px-3 text-right font-mono text-[12px] disabled:bg-line-2" aria-label={`Hitungan fisik ${batch?.code}`} /></label>
                  <label><span className="text-[10px] text-muted md:hidden">Alasan pengecualian</span><input disabled={selected.status === "FINALIZED" || values[count.batchId] !== ""} value={exceptions[count.batchId] ?? ""} onChange={(event) => setExceptions({ ...exceptions, [count.batchId]: event.target.value })} placeholder="Jika tidak dihitung…" className="min-h-11 w-full rounded-md border border-line px-3 text-[11px] disabled:bg-line-2" aria-label={`Pengecualian ${batch?.code}`} /></label>
                  <div className="text-right">{delta === undefined ? <PillRect tone={exceptions[count.batchId] ? "neutral" : "ghost"}>{exceptions[count.batchId] ? "DIKECUALIKAN" : "BELUM"}</PillRect> : <strong className={`font-mono text-[12px] ${delta === 0 ? "text-green" : delta < 0 ? "text-red" : "text-amber"}`}>{fmtDelta(delta)}</strong>}</div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-2 p-4"><div><strong className="text-[11.5px]">Progress {counted}/{selected.counts.length}</strong><p className="mt-1 text-[10.5px] text-muted">{missing ? `${missing} batch belum dihitung atau dikecualikan` : "Scope lengkap, siap ditinjau"}</p></div>{selected.status === "DRAFT" ? <div className="flex gap-2"><button onClick={saveDraft} className="min-h-11 rounded-md border border-line px-4 text-[12px] font-medium">Simpan Draft</button><button onClick={reviewFinalization} className="min-h-11 rounded-md bg-green px-4 text-[12px] font-medium text-white">Tinjau Finalisasi</button></div> : <div className="text-right"><PillRect tone="green">FINAL · LOCKED</PillRect><p className="mt-1 text-[10px] text-muted">{selected.correctionEntryIds.length} koreksi tertaut</p></div>}</div>
        </Card>
      </div>

      {previewOpen ? (
        <Card className="mt-4 overflow-hidden border-green/30"><div className="border-b border-line-2 bg-green-soft px-5 py-4"><SectionLabel>Preview finalisasi opname</SectionLabel><h3 className="mt-1 text-[14px] font-semibold">Konfirmasi dampak sebelum sesi dikunci</h3></div><div className="grid gap-3 p-5 sm:grid-cols-4"><div><SectionLabel>Total batch</SectionLabel><strong className="mt-1 block font-mono text-xl">{selected.counts.length}</strong></div><div><SectionLabel>Daftar selisih</SectionLabel><strong className="mt-1 block font-mono text-xl">{previewRows.length}</strong></div><div><SectionLabel>Total dampak</SectionLabel><strong className={`mt-1 block font-mono text-xl ${totalImpact < 0 ? "text-red" : "text-green"}`}>{fmtDelta(totalImpact)}</strong></div><div><SectionLabel>Ledger baru</SectionLabel><strong className="mt-1 block font-mono text-xl">{previewRows.length}</strong></div></div><div className="divide-y divide-line-2 border-y border-line-2">{previewRows.map((count) => { const batch = state.batches.find((item) => item.id === count.batchId); const product = state.products.find((item) => item.id === batch?.productId); return <div key={count.batchId} className="flex items-center justify-between gap-3 px-5 py-3 text-[11.5px]"><div><strong>{product?.name}</strong><div className="font-mono text-[9.5px] text-muted">{batch?.code}</div></div><strong className="font-mono">{count.systemQty} → {count.physical} ({fmtDelta(count.physical! - count.systemQty)})</strong></div>; })}{previewRows.length === 0 ? <div className="px-5 py-4 text-[11.5px] text-muted">Tidak ada selisih; finalisasi tetap memverifikasi opening balance dalam scope.</div> : null}</div><div className="flex flex-wrap items-center justify-between gap-3 p-5"><p className="max-w-xl text-[11px] text-muted">Setelah finalisasi, sesi tidak dapat diedit atau difinalisasi ulang. Opening balance dalam scope menjadi terverifikasi dan tertaut ke sesi ini.</p><div className="flex gap-2"><button onClick={() => setPreviewOpen(false)} className="min-h-11 rounded-md border border-line px-4 text-[12px] font-medium">Kembali</button><button onClick={finalize} className="min-h-11 rounded-md bg-green px-4 text-[12px] font-medium text-white">Finalisasi &amp; Buat Koreksi</button></div></div></Card>
      ) : null}

      {selected.status === "FINALIZED" && selected.correctionEntryIds.length ? <Card className="mt-4 p-4"><SectionLabel>Ledger correction</SectionLabel><div className="mt-2 flex flex-wrap gap-2">{selected.correctionEntryIds.map((id) => <Link key={id} href={`/ledger?entry=${id}`} className="min-h-11 rounded-md bg-line-2 px-3 py-3 font-mono text-[10.5px] text-green">{id} →</Link>)}</div></Card> : null}
    </section>
  );
}

export default function OpnamePage() {
  return <Suspense fallback={<div className="p-7"><Skeleton className="h-96" /></div>}><OpnameScreen /></Suspense>;
}
