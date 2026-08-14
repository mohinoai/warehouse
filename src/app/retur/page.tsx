"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDemoStore } from "@/components/demo-store-provider";
import { useToast } from "@/components/toast";
import { Card, EmptyState, Pill, PillRect, SectionLabel, Skeleton } from "@/components/ui";
import { SuccessPanel } from "@/components/async-state";
import { CustomSelect } from "@/components/custom-select";
import { addDays, daysUntil, productOnHand } from "@/lib/demo/engine";
import { CLAIM_OUTCOMES_BY_CONDITION } from "@/lib/demo/types";
import type { ClaimOutcome, ReturnClaim, ReturnCondition } from "@/lib/demo/types";

// Damaged and lost returns follow different claim processes: damaged goods go to
// a marketplace compensation claim (replacement possible), lost goods to a
// courier-loss claim (only reimbursement or write-off).
const CLAIM_KIND: Record<"DAMAGED" | "LOST", { label: string; evidenceLabel: string; evidencePlaceholder: string }> = {
  DAMAGED: { label: "Ganti Rugi · marketplace", evidenceLabel: "Foto / bukti kerusakan", evidencePlaceholder: "mis. Foto kerusakan / tiket seller center" },
  LOST: { label: "Klaim Kehilangan · kurir", evidenceLabel: "Nomor resi / laporan kurir", evidencePlaceholder: "mis. Resi JNE / tiket investigasi kurir" },
};
const OUTCOME_LABEL: Record<ClaimOutcome, string> = {
  REPLACED: "Dikirim ulang",
  REIMBURSED: "Diganti rugi",
  WRITE_OFF: "Tulis rugi",
};

const inputClass = "min-h-[44px] w-full rounded-lg border border-black/[0.1] bg-black/[0.015] px-3.5 text-[12.5px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] outline-none transition-all focus:border-[#6cc795] focus:bg-white focus:ring-[3px] focus:ring-[#6cc795]/20";

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
  const firstPendingReturn = state.returns.find((returnCase) =>
    returnCase.items.some((item) => !item.condition),
  );
  const [selectedId, setSelectedId] = useState(deepLinked?.id ?? firstPendingReturn?.id ?? state.returns[0]?.id ?? "");
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
  const [claimOutcome, setClaimOutcome] = useState<Record<string, ClaimOutcome>>({});
  const [claimResolution, setClaimResolution] = useState<Record<string, string>>({});
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

  async function resolveClaim(claim: ReturnClaim) {
    const outcome = claimOutcome[claim.id] ?? CLAIM_OUTCOMES_BY_CONDITION[claim.condition][0];
    const resolution = (claimResolution[claim.id] ?? "").trim() || `Klaim ${claim.condition} diselesaikan`;
    const result = await execute({ type: "RESOLVE_CLAIM", claimId: claim.id, resolution, outcome });
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
      <div className="mb-6">
        <h2 className="text-[18px] font-semibold tracking-tight text-ink">Penanganan Retur &amp; Klaim</h2>
        <p className="mt-1 text-[12px] text-muted-2">Kondisi diputuskan per produk satuan setelah inspeksi fisik.</p>
      </div>
      {lastResult ? <div className="mb-5"><SuccessPanel>{lastResult}</SuccessPanel></div> : null}
      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-12 space-y-3 lg:col-span-5">
          {state.returns.map((returnCase) => {
            const pending = returnCase.items.filter((candidate) => !candidate.condition).length;
            return (
              <button key={returnCase.id} onClick={() => chooseReturn(returnCase.id)} className={`group block w-full rounded-xl border p-5 text-left transition-colors ${selected.id === returnCase.id ? "border-[#6cc795]/50 bg-[#e6f2ec]/60 shadow-[0_2px_10px_rgba(108,199,149,0.1)]" : "border-black/[0.06] bg-white hover:border-black/[0.15] hover:bg-[#f6f7f5]/80 shadow-sm"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <strong className="font-mono text-[13px] text-ink">{returnCase.id}</strong>
                    <div className="mt-1.5 text-[11px] text-muted-2">Order {returnCase.orderId} · diajukan {dateLabel(returnCase.createdAt)}</div>
                  </div>
                  <PillRect tone={returnCase.channel === "TIKTOK" ? "red" : "neutral"}>{returnCase.channel}</PillRect>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2.5">
                  <Pill tone={pending ? "amber" : "green"}>{pending ? `${pending} menunggu inspeksi` : "Inspeksi selesai"}</Pill>
                  <span className="text-[11px] text-muted-2">{returnCase.items.length} produk satuan</span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="col-span-12 space-y-5 lg:col-span-7">
          <Card className="overflow-hidden border-black/[0.06] shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black/[0.06] bg-[#fcfdfc] p-6">
              <div>
                <SectionLabel>Retur terpilih</SectionLabel>
                <h3 className="mt-2 font-mono text-[15px] font-semibold text-ink">{selected.id}</h3>
                <p className="mt-1.5 text-[11px] text-muted-2">Diajukan {dateLabel(selected.createdAt)} · diterima {dateLabel(selected.receivedAt)}</p>
              </div>
              <Pill tone={selected.inspectionStatus === "PENDING" ? "amber" : "green"}>{processedItems}/{selected.items.length} diperiksa</Pill>
            </div>
            {selected.channel === "TIKTOK" ? (
              <div className={`border-b border-black/[0.06] px-6 py-4 ${remaining !== undefined && remaining <= 3 ? "bg-[#fef2f2] text-[#b91c1c]" : "bg-[#fffbeb] text-[#b45309]"}`}>
                <strong className="text-[12.5px] font-semibold">Klaim TikTok H-40 · {remaining !== undefined && remaining < 0 ? `lewat ${Math.abs(remaining)} hari` : `sisa ${remaining} hari`}</strong>
                <p className="mt-1.5 text-[11px]">Dihitung dari created_at {dateLabel(selected.createdAt)} · deadline {dateLabel(deadline)}</p>
              </div>
            ) : null}

            <div className="p-6">
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted-2">
                Produk/qty yang diperiksa
                <CustomSelect value={item?.id ?? ""} onChange={(val) => { setItemId(val); setCondition(""); setNote(""); setStep("INPUT"); }} className={`${inputClass} mt-2 font-normal normal-case tracking-normal text-ink`} options={selected.items.map((candidate) => { const itemProduct = state.products.find((productItem) => productItem.id === candidate.productId); return { label: `${itemProduct?.name} · ${candidate.qty} unit · ${candidate.condition ?? "PENDING"}`, value: candidate.id }; })} />
              </label>
              
              {item?.condition ? (
                <div className="mt-5 rounded-xl border border-black/[0.05] bg-black/[0.02] p-5">
                  <div className="flex items-center gap-3">
                    <PillRect tone={item.condition === "SELLABLE" ? "green" : "red"}>{item.condition}</PillRect>
                  </div>
                  <p className="mt-3 text-[12.5px] text-ink-2">{item.inspectionNote}</p>
                  {item.newBatchId ? <p className="mt-2 font-mono text-[11.5px] font-medium text-[#1f6b43]">Batch baru: {state.batches.find((batch) => batch.id === item.newBatchId)?.code}</p> : null}
                  {item.claimId ? <p className="mt-2 font-mono text-[11.5px] font-medium text-[#b07012]">Claim: {item.claimId}</p> : null}
                </div>
              ) : step === "INPUT" ? (
                <div className="mt-6 space-y-5">
                  <fieldset>
                    <legend className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-2">Kondisi barang</legend>
                    <div className="grid gap-3 sm:grid-cols-3">
                      {([
                        ["SELLABLE", "Layak Jual", "Batch retur baru + ledger"],
                        ["DAMAGED", "Rusak", "Claim/loss, tanpa ledger"],
                        ["LOST", "Hilang", "Claim terpisah, tanpa ledger"],
                      ] as Array<[ReturnCondition, string, string]>).map(([value, label, description]) => (
                        <button key={value} onClick={() => setCondition(value)} className={`flex min-h-[90px] flex-col justify-center rounded-xl border p-4 text-left transition-all ${condition === value ? "border-[#6cc795] bg-[#e6f2ec]/50 shadow-[0_2px_8px_rgba(108,199,149,0.15)]" : "border-black/[0.08] bg-white hover:border-black/[0.15] hover:bg-black/[0.01]"}`}>
                          <strong className={`text-[13px] ${condition === value ? "text-[#1f6b43]" : "text-ink"}`}>{label}</strong>
                          <span className={`mt-1.5 block font-mono text-[10px] ${condition === value ? "text-[#2a8757]" : "text-muted-2"}`}>{value}</span>
                          <span className={`mt-1 block text-[10.5px] ${condition === value ? "text-[#1f6b43]/80" : "text-muted-2"}`}>{description}</span>
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  {condition === "SELLABLE" ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted-2">Kode batch retur baru<input value={batchCode} onChange={(event) => setBatchCode(event.target.value)} className={`${inputClass} mt-2 font-mono text-ink`} /></label>
                      <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted-2">Expiry terverifikasi<input type="date" value={expiry} onChange={(event) => setExpiry(event.target.value)} className={`${inputClass} mt-2 text-ink`} /></label>
                    </div>
                  ) : null}

                  {condition === "DAMAGED" || condition === "LOST" ? (
                    <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted-2">
                      {CLAIM_KIND[condition].evidenceLabel}
                      <span className="ml-2 font-mono text-[9.5px] normal-case tracking-normal text-muted-2">{CLAIM_KIND[condition].label}</span>
                      <input value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder={CLAIM_KIND[condition].evidencePlaceholder} className={`${inputClass} mt-2 text-ink`} />
                    </label>
                  ) : null}

                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted-2">Catatan inspeksi<textarea value={note} onChange={(event) => setNote(event.target.value)} className="mt-2 min-h-[100px] w-full rounded-xl border border-black/[0.1] bg-black/[0.015] p-3.5 text-[12.5px] text-ink shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] outline-none transition-all focus:border-[#6cc795] focus:bg-white focus:ring-[3px] focus:ring-[#6cc795]/20" placeholder="Kondisi fisik, kemasan, dan hasil inspeksi…" /></label>
                  
                  {error ? <p role="alert" className="rounded-lg bg-[#fef2f2] px-4 py-3 text-[12px] font-medium text-[#b91c1c]">{error}</p> : null}

                  <div className="mt-6 flex flex-wrap justify-end gap-3 pt-2">
                    <button onClick={() => resetForm(selected.id)} className="min-h-[44px] rounded-lg border border-black/[0.08] bg-white px-5 text-[12.5px] font-semibold text-ink-2 shadow-sm transition-all hover:bg-black/[0.02]">Lewati Dulu</button>
                    <button onClick={review} className="min-h-[44px] rounded-lg bg-gradient-to-b from-[#2a8757] to-[#17623c] px-5 text-[12.5px] font-semibold text-white shadow-[0_4px_14px_rgba(31,107,67,0.25)] transition-all hover:from-[#319c65] hover:to-[#1a7044]">Tinjau Keputusan</button>
                  </div>
                </div>
              ) : (
                <div className="mt-6 space-y-5">
                  <SectionLabel>Preview keputusan permanen</SectionLabel>
                  <div className="rounded-xl border border-black/[0.05] bg-black/[0.02] p-5 text-[12.5px]">
                    <div className="flex justify-between gap-3"><span className="text-muted-2">Produk / qty</span><strong className="text-ink">{product?.name} · {item?.qty}</strong></div>
                    <div className="mt-3 flex items-center justify-between gap-3"><span className="text-muted-2">Kondisi</span><PillRect tone={condition === "SELLABLE" ? "green" : "red"}>{condition}</PillRect></div>
                    <div className="mt-3 flex justify-between gap-3"><span className="text-muted-2">Dampak stok</span><strong className="text-ink">{condition === "SELLABLE" ? `${productOnHand(state, item!.productId)} → ${productOnHand(state, item!.productId) + item!.qty}` : "Tidak berubah kedua kali"}</strong></div>
                    {condition === "SELLABLE" ? <div className="mt-3 flex justify-between gap-3"><span className="text-muted-2">Batch baru</span><strong className="font-mono text-ink">{batchCode} · exp {expiry}</strong></div> : null}
                  </div>
                  <p className={`rounded-lg px-4 py-3 text-[12px] font-medium ${condition === "SELLABLE" ? "bg-[#e6f2ec]/60 text-[#1f6b43]" : "bg-[#fffbeb] text-[#b45309]"}`}>{condition === "SELLABLE" ? "Commit membuat RETURN_RESTOCK pada batch origin retur." : "Commit hanya membuat return_claim. Tidak ada movement ledger kedua."}</p>
                  
                  <div className="mt-6 flex flex-wrap justify-end gap-3 pt-2">
                    <button onClick={() => setStep("INPUT")} className="min-h-[44px] rounded-lg border border-black/[0.08] bg-white px-5 text-[12.5px] font-semibold text-ink-2 shadow-sm transition-all hover:bg-black/[0.02]">Kembali</button>
                    <button onClick={commit} className="min-h-[44px] rounded-lg bg-gradient-to-b from-[#2a8757] to-[#17623c] px-5 text-[12.5px] font-semibold text-white shadow-[0_4px_14px_rgba(31,107,67,0.25)] transition-all hover:from-[#319c65] hover:to-[#1a7044]">{condition === "SELLABLE" ? "Konfirmasi & Buat Batch Retur" : condition === "DAMAGED" ? "Simpan Kondisi & Buat Catatan Klaim/Loss" : "Simpan sebagai Hilang & Buat Catatan Klaim"}</button>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {claims.length ? (
            <Card className="overflow-hidden border-black/[0.06] shadow-sm">
              <div className="border-b border-black/[0.06] bg-[#fcfdfc] px-6 py-4">
                <h3 className="text-[14px] font-semibold text-ink">Lifecycle klaim/loss</h3>
              </div>
              <div className="divide-y divide-black/[0.04]">
                {claims.map((claim) => {
                  const outcomes = CLAIM_OUTCOMES_BY_CONDITION[claim.condition];
                  const chosen = claimOutcome[claim.id] ?? outcomes[0];
                  return (
                  <div key={claim.id} className="p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <strong className="font-mono text-[13px] text-ink">{claim.id}</strong>
                        <p className="mt-1.5 text-[11px] text-muted-2">{claim.condition} · deadline {dateLabel(claim.deadline)}</p>
                        <PillRect tone={claim.condition === "LOST" ? "red" : "amber"}>{CLAIM_KIND[claim.condition].label}</PillRect>
                      </div>
                      <PillRect tone={claim.status === "RESOLVED" ? "green" : claim.status === "FILED" ? "amber" : "red"}>{claim.status}</PillRect>
                    </div>
                    <p className="mt-3 text-[12.5px] text-ink-2">{claim.note}</p>
                    {claim.status === "RESOLVED" && claim.outcome ? (
                      <p className="mt-3 text-[11.5px] font-medium text-[#1f6b43]">Hasil: {OUTCOME_LABEL[claim.outcome]} ({claim.outcome})</p>
                    ) : null}
                    {claim.status === "OPEN" ? (
                      <div className="mt-4"><button onClick={() => fileClaim(claim.id)} className="min-h-[38px] rounded-lg bg-gradient-to-b from-[#2a8757] to-[#17623c] px-4 text-[11.5px] font-semibold text-white shadow-[0_2px_8px_rgba(31,107,67,0.25)] transition-all hover:from-[#319c65] hover:to-[#1a7044]">Ajukan {CLAIM_KIND[claim.condition].label}</button></div>
                    ) : null}
                    {claim.status === "FILED" ? (
                      <div className="mt-4 space-y-3">
                        <div>
                          <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-2">Hasil penyelesaian</span>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {outcomes.map((option) => (
                              <button key={option} onClick={() => setClaimOutcome((prev) => ({ ...prev, [claim.id]: option }))} aria-pressed={chosen === option} className={`min-h-[36px] rounded-lg border px-3 text-[11px] font-semibold transition-colors ${chosen === option ? "border-[#6cc795] bg-[#e6f2ec]/60 text-[#1f6b43]" : "border-black/[0.1] bg-white text-ink-2 hover:bg-black/[0.02]"}`}>{OUTCOME_LABEL[option]}</button>
                            ))}
                          </div>
                        </div>
                        <input value={claimResolution[claim.id] ?? ""} onChange={(event) => setClaimResolution((prev) => ({ ...prev, [claim.id]: event.target.value }))} placeholder="Catatan resolution (nomor kompensasi / hasil kurir)…" className={`${inputClass} text-ink`} />
                        <button onClick={() => resolveClaim(claim)} className="min-h-[38px] rounded-lg bg-gradient-to-b from-[#2a8757] to-[#17623c] px-4 text-[11.5px] font-semibold text-white shadow-[0_2px_8px_rgba(31,107,67,0.25)] transition-all hover:from-[#319c65] hover:to-[#1a7044]">Simpan Resolution</button>
                      </div>
                    ) : null}
                  </div>
                  );
                })}
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default function ReturPage() {
  return <Suspense fallback={<div className="p-7"><Skeleton className="h-96" /></div>}><ReturnScreen /></Suspense>;
}
