"use client";

import { useState, type ChangeEvent } from "react";
import { useDemoStore } from "@/components/demo-store-provider";
import { useToast } from "@/components/toast";
import { Card, EmptyState, PillRect, SectionLabel } from "@/components/ui";
import { SuccessPanel } from "@/components/async-state";
import { productOnHand } from "@/lib/demo/engine";
import { buildCsv, downloadCsv } from "@/lib/csv";
import { fmtDelta } from "@/lib/format";
import { CustomSelect } from "@/components/custom-select";

type Mode = "MAKLON" | "OPENING" | "IMPORT";
type CsvField = "sku" | "batch" | "qty" | "expiry" | "reference" | "mode";

interface CsvPreview {
  headers: string[];
  rows: Record<string, string>[];
}

const inputClass = "min-h-[44px] w-full rounded-lg border border-black/[0.1] bg-black/[0.015] px-3.5 text-[12.5px] font-medium text-ink shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] outline-none transition-all focus-within:border-[#6cc795] focus-within:bg-white focus-within:ring-[3px] focus-within:ring-[#6cc795]/20 focus:border-[#6cc795] focus:bg-white focus:ring-[3px] focus:ring-[#6cc795]/20 disabled:bg-black/[0.04] disabled:opacity-70";

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"' && quoted) {
      value += '"';
      index += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      cells.push(value.trim());
      value = "";
    } else value += char;
  }
  cells.push(value.trim());
  return cells;
}

export default function MasukPage() {
  const { state, execute } = useDemoStore();
  const toast = useToast();
  const products = state.products.filter((item) => !item.isBundle);
  const [mode, setMode] = useState<Mode>("MAKLON");
  const [step, setStep] = useState<"INPUT" | "PREVIEW">("INPUT");
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [batchCode, setBatchCode] = useState("");
  const [qty, setQty] = useState("50");
  const [expiry, setExpiry] = useState("2027-07-18");
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [lastResult, setLastResult] = useState("");
  const [csv, setCsv] = useState<CsvPreview | null>(null);
  const [mapping, setMapping] = useState<Record<CsvField, string>>({
    sku: "sku",
    batch: "batch_code",
    qty: "qty",
    expiry: "expiry",
    reference: "reference",
    mode: "mode",
  });
  const [importResult, setImportResult] = useState<{ processed: number; duplicate: number; rejected: number } | null>(null);
  const quantity = Number(qty);
  const before = productOnHand(state, productId);
  const incoming = state.ledgerEntries.filter((entry) => entry.reason === "INCOMING_MAKLON" || entry.reason === "OPENING_BALANCE");

  function review() {
    if (!productId || !batchCode.trim() || !reference.trim() || !expiry || !Number.isInteger(quantity) || quantity <= 0) {
      setError("Produk, batch, qty bulat positif, expiry, dan referensi wajib diisi.");
      return;
    }
    if (expiry <= state.demoNow.slice(0, 10)) {
      setError("Expiry harus berada setelah demo clock.");
      return;
    }
    setError("");
    setStep("PREVIEW");
  }

  async function commit() {
    const result = await execute({
      type: "RECEIVE_STOCK",
      mode: mode === "OPENING" ? "OPENING" : "MAKLON",
      productId,
      batchCode,
      qty: quantity,
      expiryDate: expiry,
      reference,
    });
    toast({ title: result.title, description: result.description, tone: result.ok ? "success" : "error" });
    if (result.ok) {
      setLastResult(`${result.title}: ${result.description}`);
      setReference("");
      setBatchCode("");
      setStep("INPUT");
    } else {
      setError(`${result.title}: ${result.description}`);
      setStep("INPUT");
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setStep("INPUT");
    setError("");
    setReference("");
    setBatchCode("");
  }

  function downloadTemplate() {
    const year = Number(state.demoNow.slice(0, 4)) + 1;
    const sample = products.slice(0, 2);
    const exampleRows = sample.length
      ? sample.map((product, index) => [
          product.sku,
          `TMPL-${String(index + 1).padStart(2, "0")}`,
          50,
          `${year}-07-18`,
          `PO-TEMPLATE-${index + 1}`,
          index === 1 ? "OPENING" : "MAKLON",
        ])
      : [["SKU-CONTOH", "TMPL-01", 50, `${year}-07-18`, "PO-TEMPLATE-1", "MAKLON"]];
    // Column order matches the default mapping so an untouched upload just works.
    downloadCsv(
      "jejak-template-barang-masuk.csv",
      buildCsv(["sku", "batch_code", "qty", "expiry", "reference", "mode"], exampleRows),
    );
  }

  function loadCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result ?? "").split(/\r?\n/).filter(Boolean);
      const headers = parseCsvLine(lines[0] ?? "");
      const rows = lines.slice(1).map((line) => {
        const values = parseCsvLine(line);
        return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
      });
      setCsv({ headers, rows });
      setImportResult(null);
    };
    reader.onerror = () => setError("File CSV gagal dibaca. Coba file lain.");
    reader.readAsText(file);
  }

  function mappedRows() {
    return (csv?.rows ?? []).map((row) => {
      const product = state.products.find((item) => item.sku === row[mapping.sku]);
      const rowMode: "OPENING" | "MAKLON" =
        row[mapping.mode]?.toUpperCase() === "OPENING" ? "OPENING" : "MAKLON";
      const quantityValue = Number(row[mapping.qty]);
      const valid = Boolean(
        product &&
          !product.isBundle &&
          row[mapping.batch] &&
          row[mapping.expiry] &&
          row[mapping.reference] &&
          Number.isInteger(quantityValue) &&
          quantityValue > 0,
      );
      return { row, product, rowMode, quantityValue, valid };
    });
  }

  async function importCsv() {
    let processed = 0;
    let duplicate = 0;
    let rejected = 0;
    for (const item of mappedRows()) {
      if (!item.valid || !item.product) {
        rejected += 1;
        continue;
      }
      const rowReference = item.row[mapping.reference];
      const result = await execute({
        type: "INJECT_EVENT",
        event: {
          id: `csv-${state.nextSequence}-${processed + duplicate + rejected}`,
          idempotencyKey: `CSV:${rowReference}:${item.row[mapping.batch]}`,
          source: "CSV",
          channel: "INTERNAL",
          orderId: rowReference,
          occurredAt: state.demoNow,
          type: "STOCK_RECEIVED",
          payload: {
            mode: item.rowMode,
            productId: item.product.id,
            batchCode: item.row[mapping.batch],
            qty: item.quantityValue,
            expiryDate: item.row[mapping.expiry],
            reference: rowReference,
          },
        },
      });
      if (result.status === "DUPLICATE") duplicate += 1;
      else if (result.ok) processed += 1;
      else rejected += 1;
    }
    setImportResult({ processed, duplicate, rejected });
    toast({
      title: "Import CSV selesai",
      description: `${processed} diproses · ${duplicate} duplikat · ${rejected} ditolak`,
      tone: rejected ? "info" : "success",
    });
  }

  const rows = mappedRows();
  const validRows = rows.filter((item) => item.valid).length;

  return (
    <section className="mx-auto max-w-[1720px] animate-fade-in px-4 py-6 sm:px-7">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-[18px] font-semibold tracking-tight text-ink">Barang Masuk &amp; Opening Stock</h2>
          <p className="mt-1 text-[12px] text-muted-2">Manual dan CSV memakai command adapter yang sama.</p>
        </div>
        <div className="inline-flex rounded-lg bg-black/[0.04] p-1 shadow-[inset_0_1px_3px_rgba(0,0,0,0.03)] border border-black/[0.05]">
          {(["MAKLON", "OPENING", "IMPORT"] as Mode[]).map((item) => (
            <button
              key={item}
              onClick={() => switchMode(item)}
              className={`min-h-[36px] rounded-md px-4 text-[12px] font-medium transition-all ${mode === item ? "bg-white shadow-[0_1px_4px_rgba(0,0,0,0.08)] text-ink" : "text-muted-2 hover:text-ink-2"}`}
            >
              {item === "MAKLON" ? "Maklon" : item === "OPENING" ? "Opening Stock" : "Import CSV"}
            </button>
          ))}
        </div>
      </div>

      {lastResult ? <div className="mb-5"><SuccessPanel>{lastResult}</SuccessPanel></div> : null}

      {mode === "IMPORT" ? (
        <Card className="overflow-hidden border-black/[0.06] shadow-sm">
          <div className="border-b border-black/[0.06] bg-[#fcfdfc] p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-semibold text-ink">Import file CSV</h3>
                <p className="mt-1 text-[12px] text-muted-2">Upload, petakan kolom, periksa error per baris, lalu konfirmasi.</p>
              </div>
              <button onClick={downloadTemplate} className="min-h-[40px] rounded-lg border border-black/[0.08] bg-white px-4 text-[12px] font-semibold text-ink-2 shadow-sm transition-all hover:bg-black/[0.02]">Download Template</button>
            </div>
            <label className="mt-5 flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#6cc795]/60 bg-[#e6f2ec]/20 px-4 text-center transition-all hover:bg-[#e6f2ec]/50 hover:border-[#6cc795]">
              <span className="text-[13px] font-semibold text-[#1f6b43]">Pilih file CSV</span>
              <span className="text-[11px] text-muted-2">Atau seret dan lepas file di sini</span>
              <input type="file" accept=".csv,text/csv" onChange={loadCsv} className="sr-only" />
            </label>
          </div>
          {csv ? (
            <>
              <div className="grid gap-4 border-b border-black/[0.06] bg-black/[0.015] p-6 sm:grid-cols-3 lg:grid-cols-6">
                {(Object.keys(mapping) as CsvField[]).map((field) => (
                  <label key={field} className="block text-[10.5px] font-semibold uppercase tracking-wide text-muted-2">
                    {field}
                    <CustomSelect value={mapping[field]} onChange={(val) => setMapping({ ...mapping, [field]: val })} className={`${inputClass} mt-2 text-ink`} options={[{label: "Tidak dipetakan", value: ""}, ...csv.headers.map(h => ({label: h, value: h}))]} />
                  </label>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-[12px]">
                  <thead className="bg-[#fcfdfc] text-[10px] font-semibold uppercase tracking-wide text-muted-2 border-b border-black/[0.06]">
                    <tr>
                      <th className="px-6 py-4">Baris</th>
                      <th className="py-4">SKU</th>
                      <th className="py-4">Batch</th>
                      <th className="py-4">Qty</th>
                      <th className="py-4">Expiry</th>
                      <th className="py-4">Mode</th>
                      <th className="px-6 py-4 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.04]">
                    {rows.map((item, index) => (
                      <tr key={index} className="transition-colors hover:bg-black/[0.01]">
                        <td className="px-6 py-3 font-mono text-muted-2">{index + 2}</td>
                        <td className="py-3 font-medium text-ink">{item.row[mapping.sku] || "—"}</td>
                        <td className="py-3 font-mono text-muted-2">{item.row[mapping.batch] || "—"}</td>
                        <td className="py-3 font-mono font-medium text-ink">{item.row[mapping.qty] || "—"}</td>
                        <td className="py-3 font-mono text-muted-2">{item.row[mapping.expiry] || "—"}</td>
                        <td className="py-3 text-muted-2">{item.rowMode}</td>
                        <td className="px-6 py-3 text-right"><PillRect tone={item.valid ? "green" : "red"}>{item.valid ? "VALID" : "INVALID"}</PillRect></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-black/[0.06] bg-[#fcfdfc] p-6 shadow-[inset_0_2px_10px_rgba(0,0,0,0.01)]">
                <span className="text-[12.5px] font-medium text-muted-2"><strong className="text-ink">{validRows}</strong> valid · <span className={rows.length - validRows > 0 ? "text-[#b91c1c]" : ""}>{rows.length - validRows} invalid</span></span>
                <button onClick={importCsv} disabled={!validRows} className="min-h-[44px] rounded-lg bg-gradient-to-b from-[#2a8757] to-[#17623c] px-6 text-[12.5px] font-semibold text-white shadow-[0_4px_14px_rgba(31,107,67,0.25)] transition-all disabled:opacity-40 hover:from-[#319c65] hover:to-[#1a7044]">Konfirmasi Import</button>
              </div>
              {importResult ? <div className="border-t border-black/[0.06] p-6 bg-[#e6f2ec]/30"><SuccessPanel>{importResult.processed} processed · {importResult.duplicate} duplicate · {importResult.rejected} rejected</SuccessPanel></div> : null}
            </>
          ) : (
            <div className="p-2"><EmptyState title="Belum ada file" description="Header: sku, batch_code, qty, expiry, reference, mode. Klik Download Template untuk contoh siap pakai." /></div>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-12 gap-5">
          <Card className="col-span-12 h-fit p-6 border-black/[0.06] shadow-sm lg:col-span-6 xl:col-span-5">
            {step === "INPUT" ? (
              <div className="space-y-5">
                <div>
                  <SectionLabel>{mode === "OPENING" ? "Opening balance baru" : "Penerimaan maklon baru"}</SectionLabel>
                  {mode === "OPENING" ? <p className="mt-3 rounded-lg bg-[#fffbeb] px-4 py-3 text-[12px] font-medium text-[#b45309] border border-[#f59e0b]/20">Akan berstatus Belum Terverifikasi sampai opname pertama selesai.</p> : null}
                </div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted-2">
                  Produk
                  <CustomSelect value={productId} onChange={(val) => setProductId(val)} className={`${inputClass} mt-2 text-ink`} options={[{label: "Pilih produk", value: ""}, ...products.map(p => ({label: `${p.name} · ${p.sku}`, value: p.id}))]} />
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-2">
                    Kode batch
                    <input value={batchCode} onChange={(event) => setBatchCode(event.target.value)} placeholder={mode === "OPENING" ? "SG-OPEN-02" : "SG-2607-03"} className={`${inputClass} mt-2 font-mono placeholder:text-muted-2/50`} />
                  </label>
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-2">
                    Jumlah
                    <input type="number" min={1} step={1} value={qty} onChange={(event) => setQty(event.target.value)} className={`${inputClass} mt-2 text-right font-mono font-medium`} />
                  </label>
                </div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted-2">
                  Tanggal kedaluwarsa
                  <input type="date" value={expiry} onChange={(event) => setExpiry(event.target.value)} className={`${inputClass} mt-2`} />
                </label>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted-2">
                  Referensi dokumen
                  <input value={reference} onChange={(event) => setReference(event.target.value)} placeholder={mode === "OPENING" ? "OPEN-260718-02" : "PO-MAK-260718-12"} className={`${inputClass} mt-2 font-mono placeholder:text-muted-2/50`} />
                </label>
                {error ? <p role="alert" className="rounded-lg bg-[#fef2f2] px-4 py-3 text-[12px] font-medium text-[#b91c1c]">{error}</p> : null}
                <div className="pt-2">
                  <button onClick={review} className="min-h-[44px] w-full rounded-lg bg-gradient-to-b from-[#2a8757] to-[#17623c] px-5 text-[12.5px] font-semibold text-white shadow-[0_4px_14px_rgba(31,107,67,0.25)] transition-all hover:from-[#319c65] hover:to-[#1a7044]">Tinjau Penerimaan</button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <SectionLabel>Preview commit</SectionLabel>
                <div className="space-y-3 rounded-xl border border-black/[0.05] bg-black/[0.02] p-5 text-[12.5px]">
                  <div className="flex justify-between gap-3"><span className="text-muted-2">Produk</span><strong className="text-ink">{state.products.find((item) => item.id === productId)?.name}</strong></div>
                  <div className="flex justify-between gap-3"><span className="text-muted-2">Batch / expiry</span><strong className="font-mono text-ink">{batchCode} · {expiry}</strong></div>
                  <div className="flex justify-between gap-3"><span className="text-muted-2">On-hand sebelum</span><strong className="font-mono text-ink">{before}</strong></div>
                  <div className="flex justify-between gap-3"><span className="text-muted-2">Dampak</span><strong className="font-mono text-[#1f6b43]">+{quantity}</strong></div>
                  <div className="flex justify-between gap-3"><span className="text-muted-2">On-hand sesudah</span><strong className="font-mono text-ink">{before + quantity}</strong></div>
                  <div className="flex justify-between gap-3"><span className="text-muted-2">Referensi</span><strong className="font-mono text-ink">{reference}</strong></div>
                  <div className="flex justify-between gap-3"><span className="text-muted-2">Reason / status</span><strong className="font-mono text-ink">{mode === "OPENING" ? "OPENING_BALANCE · UNVERIFIED" : "INCOMING_MAKLON · VERIFIED"}</strong></div>
                </div>
                <div className="flex flex-wrap gap-3 pt-2">
                  <button onClick={() => setStep("INPUT")} className="min-h-[44px] flex-1 rounded-lg border border-black/[0.08] bg-white px-5 text-[12.5px] font-semibold text-ink-2 shadow-sm transition-all hover:bg-black/[0.02]">Kembali</button>
                  <button onClick={commit} className="min-h-[44px] flex-[2] rounded-lg bg-gradient-to-b from-[#2a8757] to-[#17623c] px-5 text-[12.5px] font-semibold text-white shadow-[0_4px_14px_rgba(31,107,67,0.25)] transition-all hover:from-[#319c65] hover:to-[#1a7044]">Konfirmasi &amp; Tulis Ledger</button>
                </div>
              </div>
            )}
          </Card>
          <Card className="col-span-12 overflow-hidden border-black/[0.06] shadow-sm lg:col-span-6 xl:col-span-7">
            <div className="border-b border-black/[0.06] bg-[#fcfdfc] px-6 py-5">
              <h3 className="text-[14px] font-semibold text-ink">Penerimaan terakhir</h3>
            </div>
            <div className="divide-y divide-black/[0.04]">
              {incoming.slice(0, 10).map((entry) => {
                const product = state.products.find((item) => item.id === entry.productId);
                const batch = state.batches.find((item) => item.id === entry.batchId);
                return (
                  <div key={entry.id} className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-black/[0.01]">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold text-ink">{product?.name}</div>
                      <div className="mt-1 font-mono text-[10.5px] text-muted-2">{batch?.code} · {entry.referenceId}</div>
                    </div>
                    <PillRect tone={entry.reason === "OPENING_BALANCE" ? "amber" : "green"}>{entry.reason}</PillRect>
                    <strong className="w-[60px] text-right font-mono text-[14px] text-[#1f6b43]">{fmtDelta(entry.qtyDelta)}</strong>
                  </div>
                );
              })}
              {incoming.length === 0 ? <div className="px-6 py-5 text-[12.5px] text-muted-2">Belum ada history penerimaan.</div> : null}
            </div>
          </Card>
        </div>
      )}
    </section>
  );
}
