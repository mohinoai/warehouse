"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDemoStore } from "@/components/demo-store-provider";
import { useToast } from "@/components/toast";
import { Card, EmptyState, Pill, PillRect, SectionLabel, Skeleton } from "@/components/ui";
import { SuccessPanel } from "@/components/async-state";
import { addDays, daysUntil, productOnHand } from "@/lib/demo/engine";
import type { ReturnCondition } from "@/lib/demo/types";

const inputClass = "min-h-11 w-full rounded-md border border-line bg-surface px-3 text-[12px] outline-none focus:border-green focus:ring-[3px] focus:ring-green/10";

function dateLabel(value?: string) {
  if (!value) return "Belum diterima";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

function ReturnScreen() {
  const { state, execute } = useDemoStore();
  const toast = useToast();
  const params = useSearchParams();
  const router = useRouter();
  const deepLinked = state.returns.find((item) => item.id === params.get("return"));
  const [selectedId, setSelectedId] = useState(deepLinked?.id ?? state.returns[0]?.id ?? "");
  const selected = state.returns.find((item) => item.id === selectedId) ?? state.returns[0];
  const firstPending = selected?.items.find((item) => !item.condition);
  const [itemId, setItemId] = useState(firstPending?.id ?? selected?.items[0]?.id ?? "");
  const item = selected?.items.find((candidate) => candidate.id === itemId) ?? firstPending ?? selected?.items[0];
  const [condition, setCondition] = useState<ReturnCondition | "">("");
  const [note, setNote] = useState("");
  const [expiry, setExpiry] = useState("2027-01-18");
  const [batchCode, setBatchCode] = useState(`RET-${String(state.nextSequence).padStart(4, "0")}`);
  const [evidence, setEvidence] = useState("");
  const [step, setStep] = useState<"INPUT" | "PREVIEW">("INPUT");
  const [error, setError] = useState("");
  const [lastResult, setLastResult] = useState("");
  const product = state.products.find((candidate) => candidate.id === item?.productId);

  function resetForm(nextReturnId?: string) {
    const nextReturn = state.returns.find((candidate) => candidate.id === nextReturnId);
    setCondition("");
    setNote("");
    setEvidence("");
    setExpiry("2027-01-18");
    setBatchCode(`RET-${String(state.nextSequence).padStart(4, "0")}`);
    setStep("INPUT");
    setError("");
    setItemId(nextReturn?.items.find((candidate) => !candidate.condition)?.id ?? nextReturn?.items[0]?.id ?? "");
  }

  function chooseReturn(returnId: string) {
    setSelectedId(returnId);
    resetForm(returnId);
    router.replace(`/retur?return=${returnId}`);
  }

  function review() {
    if (!condition || !note.trim()) {
      setError("Kondisi dan catatan inspeksi wajib diisi.");
      return;
    }
    if (condition === "SELLABLE" && (!expiry || expiry <= state.demoNow.slice(0, 10) || !batchCode.trim())) {
      setError("Layak jual membutuhkan kode batch retur baru dan expiry mendatang yang terverifikasi.");
      return;
    }
    setError("");
    setStep("PREVIEW");
  }

  async function commit() {
    if (!selected || !item || !condition) return;
    const result = await execute({
      type: "INSPECT_RETURN",
      returnId: selected.id,
      returnItemId: item.id,
      condition,
      note,
      expiryDate: condition === "SELLABLE" ? expiry : undefined,
      batchCode: condition === "SELLABLE" ? batchCode : undefined,
      evidenceReference: evidence || undefined,
    });
    toast({ title: result.title, description: result.description, tone: result.ok ? "success" : "error" });
    if (result.ok) {
      const nextPendingId = selected.items.find(
        (candidate) => candidate.id !== item.id && !candidate.condition,
      )?.id;
      setLastResult(`${result.title}: ${result.description}`);
      resetForm(selected.id);
      setItemId(nextPendingId ?? item.id);
    }
  }

  async function fileClaim(claimId: string) {
    const claim = state.returnClaims.find((candidate) => candidate.id === claimId);
    const result = await execute({
      type: "FILE_CLAIM",
      claimId,
      evidenceReference: evidence || claim?.evidenceReference || "",
    });
    toast({ title: result.title, description: result.description, tone: result.ok ? "success" : "error" });
  }

  async function resolveClaim(claimId: string) {
    const result = await execute({ type: "RESOLVE_CLAIM", claimId, resolution: note || "Klaim selesai dan terdokumentasi" });
    toast({ title: result.title, description: result.description, tone: result.ok ? "success" : "error" });
  }

  if (!selected) {
    return <section className="p-7"><Card><EmptyState title="Belum ada retur" description="Retur baru muncul setelah event RETURN_REQUESTED dari simulator." /></Card></section>;
  }

  const deadline = selected.channel === "TIKTOK" ? addDays(selected.createdAt, 40) : undefined;
  const remaining = deadline ? daysUntil(state.demoNow, deadline) : undefined;
  const claims = state.returnClaims.filter((claim) => claim.returnId === selected.id);
  const processedItems = selected.items.filter((candidate) => candidate.condition).length;

  return (
    <section className="mx-auto max-w-[1720px] animate-fade-in px-4 py-6 sm:px-7">
      <div className="mb-5"><h2 className="text-[17px] font-medium">Penanganan Retur &amp; Klaim</h2><p className="mt-0.5 text-[12px] text-muted">Kondisi diputuskan per produk satuan setelah inspeksi fisik.</p></div>
      {lastResult ? <div className="mb-4"><SuccessPanel>{lastResult}</SuccessPanel></div> : null}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 space-y-2 lg:col-span-5">
          {state.returns.map((returnCase) => {
            const pending = returnCase.items.filter((candidate) => !candidate.condition).length;
            return (
              <button key={returnCase.id} onClick={() => chooseReturn(returnCase.id)} className={`w-full rounded-lg border p-4 text-left transition-colors ${selected.id === returnCase.id ? "border-green bg-green-soft" : "border-line bg-surface hover:border-green/40"}`}>
                <div className="flex items-start justify-between gap-3"><div><strong className="font-mono text-[11.5px]">{returnCase.id}</strong><div className="mt-1 text-[10.5px] text-muted">Order {returnCase.orderId} · diajukan {dateLabel(returnCase.createdAt)}</div></div><PillRect tone={returnCase.channel === "TIKTOK" ? "red" : "neutral"}>{returnCase.channel}</PillRect></div>
                <div className="mt-3 flex flex-wrap items-center gap-2"><Pill tone={pending ? "amber" : "green"}>{pending ? `${pending} menunggu inspeksi` : "Inspeksi selesai"}</Pill><span className="text-[10.5px] text-muted">{returnCase.items.length} produk satuan</span></div>
              </button>
            );
          })}
        </div>

        <div className="col-span-12 space-y-4 lg:col-span-7">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line-2 p-5"><div><SectionLabel>Retur terpilih</SectionLabel><h3 className="mt-1 font-mono text-[14px] font-semibold">{selected.id}</h3><p className="mt-1 text-[10.5px] text-muted">Diajukan {dateLabel(selected.createdAt)} · diterima {dateLabel(selected.receivedAt)}</p></div><Pill tone={selected.inspectionStatus === "PENDING" ? "amber" : "green"}>{processedItems}/{selected.items.length} diperiksa</Pill></div>
            {selected.channel === "TIKTOK" ? (
              <div className={`border-b border-line-2 px-5 py-3 ${remaining !== undefined && remaining <= 3 ? "bg-red-soft text-red" : "bg-amber-soft text-amber"}`}>
                <strong className="text-[12px]">Klaim TikTok H-40 · {remaining !== undefined && remaining < 0 ? `lewat ${Math.abs(remaining)} hari` : `sisa ${remaining} hari`}</strong>
                <p className="mt-1 text-[10.5px]">Dihitung dari created_at {dateLabel(selected.createdAt)} · deadline {dateLabel(deadline)}</p>
              </div>
            ) : null}

            <div className="p-5">
              <label className="block text-[10.5px] font-medium text-muted">Produk/qty yang diperiksa<select value={item?.id ?? ""} onChange={(event) => { setItemId(event.target.value); setCondition(""); setNote(""); setStep("INPUT"); }} className={`${inputClass} mt-1.5 text-ink`}>{selected.items.map((candidate) => { const itemProduct = state.products.find((productItem) => productItem.id === candidate.productId); return <option key={candidate.id} value={candidate.id}>{itemProduct?.name} · {candidate.qty} unit · {candidate.condition ?? "PENDING"}</option>; })}</select></label>
              {item?.condition ? (
                <div className="mt-4 rounded-lg bg-line-2 p-4"><PillRect tone={item.condition === "SELLABLE" ? "green" : "red"}>{item.condition}</PillRect><p className="mt-2 text-[11.5px] text-muted">{item.inspectionNote}</p>{item.newBatchId ? <p className="mt-1 font-mono text-[10.5px] text-green">Batch baru: {state.batches.find((batch) => batch.id === item.newBatchId)?.code}</p> : null}{item.claimId ? <p className="mt-1 font-mono text-[10.5px] text-amber">Claim: {item.claimId}</p> : null}</div>
              ) : step === "INPUT" ? (
                <div className="mt-4 space-y-4">
                  <fieldset><legend className="mb-2 text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted">Kondisi barang</legend><div className="grid gap-2 sm:grid-cols-3">{([
                    ["SELLABLE", "Layak Jual", "Batch retur baru + ledger"],
                    ["DAMAGED", "Rusak", "Claim/loss, tanpa ledger"],
                    ["LOST", "Hilang", "Claim terpisah, tanpa ledger"],
                  ] as Array<[ReturnCondition, string, string]>).map(([value, label, description]) => <button key={value} onClick={() => setCondition(value)} className={`min-h-20 rounded-md border p-3 text-left ${condition === value ? "border-green bg-green-soft" : "border-line"}`}><strong className="text-[12px]">{label}</strong><span className="mt-1 block text-[10px] text-muted">{description}</span></button>)}</div></fieldset>
                  {condition === "SELLABLE" ? <div className="grid gap-3 sm:grid-cols-2"><label className="text-[10.5px] font-medium text-muted">Kode batch retur baru<input value={batchCode} onChange={(event) => setBatchCode(event.target.value)} className={`${inputClass} mt-1.5 font-mono text-ink`} /></label><label className="text-[10.5px] font-medium text-muted">Expiry terverifikasi<input type="date" value={expiry} onChange={(event) => setExpiry(event.target.value)} className={`${inputClass} mt-1.5 text-ink`} /></label></div> : null}
                  {condition === "DAMAGED" || condition === "LOST" ? <label className="block text-[10.5px] font-medium text-muted">Evidence reference<input value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="Foto/drive/tiket marketplace" className={`${inputClass} mt-1.5 text-ink`} /></label> : null}
                  <label className="block text-[10.5px] font-medium text-muted">Catatan inspeksi<textarea value={note} onChange={(event) => setNote(event.target.value)} className="mt-1.5 min-h-24 w-full rounded-md border border-line bg-surface p-3 text-[12px] text-ink outline-none focus:border-green" placeholder="Kondisi fisik, kemasan, dan hasil inspeksi…" /></label>
                  {error ? <p role="alert" className="rounded-md bg-red-soft px-3 py-2 text-[11.5px] text-red">{error}</p> : null}
                  <div className="flex flex-wrap justify-end gap-2"><button onClick={() => resetForm(selected.id)} className="min-h-11 rounded-md border border-line px-4 text-[12px] font-medium">Lewati Dulu</button><button onClick={review} className="min-h-11 rounded-md bg-green px-4 text-[12px] font-medium text-white">Tinjau Keputusan</button></div>
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  <SectionLabel>Preview keputusan permanen</SectionLabel>
                  <div className="rounded-lg bg-line-2 p-4 text-[12px]"><div className="flex justify-between gap-3"><span className="text-muted">Produk / qty</span><strong>{product?.name} · {item?.qty}</strong></div><div className="mt-2 flex justify-between gap-3"><span className="text-muted">Kondisi</span><PillRect tone={condition === "SELLABLE" ? "green" : "red"}>{condition}</PillRect></div><div className="mt-2 flex justify-between gap-3"><span className="text-muted">Dampak stok</span><strong>{condition === "SELLABLE" ? `${productOnHand(state, item!.productId)} → ${productOnHand(state, item!.productId) + item!.qty}` : "Tidak berubah kedua kali"}</strong></div>{condition === "SELLABLE" ? <div className="mt-2 flex justify-between gap-3"><span className="text-muted">Batch baru</span><strong className="font-mono">{batchCode} · exp {expiry}</strong></div> : null}</div>
                  <p className={`rounded-md px-3 py-2.5 text-[11.5px] ${condition === "SELLABLE" ? "bg-green-soft text-green" : "bg-amber-soft text-amber"}`}>{condition === "SELLABLE" ? "Commit membuat RETURN_RESTOCK pada batch origin retur." : "Commit hanya membuat return_claim. Tidak ada movement ledger kedua."}</p>
                  <div className="flex flex-wrap justify-end gap-2"><button onClick={() => setStep("INPUT")} className="min-h-11 rounded-md border border-line px-4 text-[12px] font-medium">Kembali</button><button onClick={commit} className="min-h-11 rounded-md bg-green px-4 text-[12px] font-medium text-white">{condition === "SELLABLE" ? "Konfirmasi & Buat Batch Retur" : condition === "DAMAGED" ? "Simpan Kondisi & Buat Catatan Klaim/Loss" : "Simpan sebagai Hilang & Buat Catatan Klaim"}</button></div>
                </div>
              )}
            </div>
          </Card>

          {claims.length ? (
            <Card className="overflow-hidden"><div className="border-b border-line-2 px-4 py-3"><h3 className="text-[13px] font-medium">Lifecycle klaim/loss</h3></div><div className="divide-y divide-line-2">{claims.map((claim) => <div key={claim.id} className="p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><strong className="font-mono text-[11.5px]">{claim.id}</strong><p className="mt-1 text-[10.5px] text-muted">{claim.condition} · deadline {dateLabel(claim.deadline)}</p></div><PillRect tone={claim.status === "RESOLVED" ? "green" : claim.status === "FILED" ? "amber" : "red"}>{claim.status}</PillRect></div><p className="mt-2 text-[11.5px] text-muted">{claim.note}</p><div className="mt-3 flex flex-wrap gap-2">{claim.status === "OPEN" ? <button onClick={() => fileClaim(claim.id)} className="min-h-11 rounded-md bg-green px-4 text-[11.5px] font-medium text-white">Ajukan dengan Evidence</button> : null}{claim.status === "FILED" ? <button onClick={() => resolveClaim(claim.id)} className="min-h-11 rounded-md bg-green px-4 text-[11.5px] font-medium text-white">Simpan Resolution</button> : null}</div></div>)}</div></Card>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default function ReturPage() {
  return <Suspense fallback={<div className="p-7"><Skeleton className="h-96" /></div>}><ReturnScreen /></Suspense>;
}
