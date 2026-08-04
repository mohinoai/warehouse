"use client";

import { useState, type ChangeEvent } from "react";
import { useDemoStore } from "@/components/demo-store-provider";
import { useToast } from "@/components/toast";
import { Card, EmptyState, PillRect, SectionLabel } from "@/components/ui";
import { SuccessPanel } from "@/components/async-state";
import { productOnHand } from "@/lib/demo/engine";
import { fmtDelta } from "@/lib/format";

type Mode = "MAKLON" | "OPENING" | "IMPORT";
type CsvField = "sku" | "batch" | "qty" | "expiry" | "reference" | "mode";

interface CsvPreview {
  headers: string[];
  rows: Record<string, string>[];
}

const inputClass =
  "min-h-11 w-full rounded-md border border-line bg-surface px-3 text-[12.5px] text-ink outline-none focus:border-green focus:ring-[3px] focus:ring-green/10";

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
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-medium">Barang Masuk &amp; Opening Stock</h2>
          <p className="mt-0.5 text-[12px] text-muted">Manual dan CSV memakai command adapter yang sama.</p>
        </div>
        <div className="inline-flex rounded-md bg-[#E9ECE7] p-0.5">
          {(["MAKLON", "OPENING", "IMPORT"] as Mode[]).map((item) => (
            <button
              key={item}
              onClick={() => switchMode(item)}
              className={`min-h-11 rounded px-3 text-[11.5px] font-medium ${mode === item ? "bg-surface shadow-sm" : "text-muted"}`}
            >
              {item === "MAKLON" ? "Maklon" : item === "OPENING" ? "Opening Stock" : "Import CSV"}
            </button>
          ))}
        </div>
      </div>

      {lastResult ? <div className="mb-4"><SuccessPanel>{lastResult}</SuccessPanel></div> : null}

      {mode === "IMPORT" ? (
        <Card className="overflow-hidden">
          <div className="border-b border-line-2 p-5">
            <h3 className="text-[14px] font-medium">Import file CSV</h3>
            <p className="mt-1 text-[11.5px] text-muted">Upload, petakan kolom, periksa error per baris, lalu konfirmasi.</p>
            <label className="mt-4 flex min-h-24 cursor-pointer items-center justify-center rounded-lg border border-dashed border-line bg-canvas px-4 text-center text-[12px] font-medium text-green hover:border-green">
              Pilih file CSV
              <input type="file" accept=".csv,text/csv" onChange={loadCsv} className="sr-only" />
            </label>
          </div>
          {csv ? (
            <>
              <div className="grid gap-3 border-b border-line-2 p-5 sm:grid-cols-3 lg:grid-cols-6">
                {(Object.keys(mapping) as CsvField[]).map((field) => (
                  <label key={field} className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">
                    {field}
                    <select value={mapping[field]} onChange={(event) => setMapping({ ...mapping, [field]: event.target.value })} className={`${inputClass} mt-1.5 normal-case tracking-normal`}>
                      <option value="">Tidak dipetakan</option>
                      {csv.headers.map((header) => <option key={header} value={header}>{header}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-[11.5px]">
                  <thead className="bg-line-2 text-[10px] uppercase tracking-[0.08em] text-muted"><tr><th className="p-3">Baris</th><th>SKU</th><th>Batch</th><th>Qty</th><th>Expiry</th><th>Mode</th><th>Status</th></tr></thead>
                  <tbody className="divide-y divide-line-2">
                    {rows.map((item, index) => (
                      <tr key={index}><td className="p-3 font-mono">{index + 2}</td><td>{item.row[mapping.sku] || "—"}</td><td className="font-mono">{item.row[mapping.batch] || "—"}</td><td>{item.row[mapping.qty] || "—"}</td><td>{item.row[mapping.expiry] || "—"}</td><td>{item.rowMode}</td><td><PillRect tone={item.valid ? "green" : "red"}>{item.valid ? "VALID" : "INVALID"}</PillRect></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-2 p-4">
                <span className="text-[11.5px] text-muted">{validRows} valid · {rows.length - validRows} invalid</span>
                <button onClick={importCsv} disabled={!validRows} className="min-h-11 rounded-md bg-green px-4 text-[12.5px] font-medium text-white disabled:opacity-40">Konfirmasi Import</button>
              </div>
              {importResult ? <div className="border-t border-line-2 p-4"><SuccessPanel>{importResult.processed} processed · {importResult.duplicate} duplicate · {importResult.rejected} rejected</SuccessPanel></div> : null}
            </>
          ) : (
            <EmptyState title="Belum ada file" description="Header yang disarankan: sku, batch_code, qty, expiry, reference, mode." />
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-12 gap-4">
          <Card className="col-span-12 h-fit p-5 lg:col-span-5">
            {step === "INPUT" ? (
              <div className="space-y-4">
                <div>
                  <SectionLabel>{mode === "OPENING" ? "Opening balance baru" : "Penerimaan maklon baru"}</SectionLabel>
                  {mode === "OPENING" ? <p className="mt-2 rounded-md bg-amber-soft px-3 py-2 text-[11.5px] text-amber">Akan berstatus Belum Terverifikasi sampai opname pertama selesai.</p> : null}
                </div>
                <label className="block text-[11px] font-medium text-muted">Produk<select value={productId} onChange={(event) => setProductId(event.target.value)} className={`${inputClass} mt-1.5`}><option value="">Pilih produk</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}</select></label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-[11px] font-medium text-muted">Kode batch<input value={batchCode} onChange={(event) => setBatchCode(event.target.value)} placeholder={mode === "OPENING" ? "SG-OPEN-02" : "SG-2607-03"} className={`${inputClass} mt-1.5 font-mono`} /></label>
                  <label className="text-[11px] font-medium text-muted">Jumlah<input type="number" min={1} step={1} value={qty} onChange={(event) => setQty(event.target.value)} className={`${inputClass} mt-1.5 text-right font-mono`} /></label>
                </div>
                <label className="block text-[11px] font-medium text-muted">Tanggal kedaluwarsa<input type="date" value={expiry} onChange={(event) => setExpiry(event.target.value)} className={`${inputClass} mt-1.5`} /></label>
                <label className="block text-[11px] font-medium text-muted">Referensi dokumen<input value={reference} onChange={(event) => setReference(event.target.value)} placeholder={mode === "OPENING" ? "OPEN-260718-02" : "PO-MAK-260718-12"} className={`${inputClass} mt-1.5 font-mono`} /></label>
                {error ? <p role="alert" className="rounded-md bg-red-soft px-3 py-2 text-[11.5px] text-red">{error}</p> : null}
                <button onClick={review} className="min-h-11 w-full rounded-md bg-green px-4 text-[12.5px] font-medium text-white">Tinjau Penerimaan</button>
              </div>
            ) : (
              <div className="space-y-4">
                <SectionLabel>Preview commit</SectionLabel>
                <div className="space-y-2 rounded-lg bg-line-2 p-4 text-[12px]">
                  <div className="flex justify-between gap-3"><span className="text-muted">Produk</span><strong>{state.products.find((item) => item.id === productId)?.name}</strong></div>
                  <div className="flex justify-between gap-3"><span className="text-muted">Batch / expiry</span><strong className="font-mono">{batchCode} · {expiry}</strong></div>
                  <div className="flex justify-between gap-3"><span className="text-muted">On-hand sebelum</span><strong className="font-mono">{before}</strong></div>
                  <div className="flex justify-between gap-3"><span className="text-muted">Dampak</span><strong className="font-mono text-green">+{quantity}</strong></div>
                  <div className="flex justify-between gap-3"><span className="text-muted">On-hand sesudah</span><strong className="font-mono">{before + quantity}</strong></div>
                  <div className="flex justify-between gap-3"><span className="text-muted">Referensi</span><strong className="font-mono">{reference}</strong></div>
                  <div className="flex justify-between gap-3"><span className="text-muted">Reason / status</span><strong className="font-mono">{mode === "OPENING" ? "OPENING_BALANCE · UNVERIFIED" : "INCOMING_MAKLON · VERIFIED"}</strong></div>
                </div>
                <div className="flex gap-2"><button onClick={() => setStep("INPUT")} className="min-h-11 flex-1 rounded-md border border-line text-[12.5px] font-medium">Kembali</button><button onClick={commit} className="min-h-11 flex-1 rounded-md bg-green text-[12.5px] font-medium text-white">Konfirmasi &amp; Tulis Ledger</button></div>
              </div>
            )}
          </Card>
          <Card className="col-span-12 overflow-hidden lg:col-span-7">
            <div className="border-b border-line-2 px-4 py-3"><h3 className="text-[13px] font-medium">Penerimaan terakhir</h3></div>
            <div className="divide-y divide-line-2">
              {incoming.slice(0, 10).map((entry) => {
                const product = state.products.find((item) => item.id === entry.productId);
                const batch = state.batches.find((item) => item.id === entry.batchId);
                return <div key={entry.id} className="flex items-center gap-3 px-4 py-3"><div className="min-w-0 flex-1"><div className="truncate text-[12.5px] font-medium">{product?.name}</div><div className="font-mono text-[10.5px] text-muted">{batch?.code} · {entry.referenceId}</div></div><PillRect tone={entry.reason === "OPENING_BALANCE" ? "amber" : "green"}>{entry.reason}</PillRect><strong className="font-mono text-green">{fmtDelta(entry.qtyDelta)}</strong></div>;
              })}
            </div>
          </Card>
        </div>
      )}
    </section>
  );
}
