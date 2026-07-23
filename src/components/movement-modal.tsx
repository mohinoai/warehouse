"use client";

import { useState } from "react";
import { previewFefo, productSellable } from "@/lib/demo/engine";
import type { Channel, DemoCommand } from "@/lib/demo/types";
import { useDemoStore } from "./demo-store-provider";
import { Dialog } from "./dialog";
import { useToast } from "./toast";
import { PillRect } from "./ui";

type ManualReason = Extract<
  DemoCommand,
  { type: "MANUAL_STOCK_OUT" }
>["reason"];

const MANUAL_REASONS: Array<{ value: ManualReason; label: string }> = [
  { value: "OFFLINE", label: "Jual Offline" },
  { value: "BONUS", label: "Bonus" },
  { value: "PROMO", label: "Promo" },
  { value: "SAMPLE", label: "Sampel" },
  { value: "DAMAGED", label: "Rusak" },
  { value: "EXPIRED", label: "Kedaluwarsa" },
];

const CHANNEL_OPTIONS: Array<{ value: Channel; label: string }> = [
  { value: "OFFLINE", label: "Offline" },
  { value: "SHOPEE", label: "Shopee" },
  { value: "TIKTOK", label: "TikTok" },
  { value: "INTERNAL", label: "Internal" },
];

const inputClass =
  "min-h-11 w-full rounded-md border border-line bg-surface px-3 text-[12.5px] outline-none focus:border-green focus:ring-[3px] focus:ring-green/10";

export function MovementModal({ onClose }: { onClose: () => void }) {
  const { state, execute } = useDemoStore();
  const toast = useToast();
  const products = state.products.filter((item) => !item.isBundle);
  const [step, setStep] = useState<"INPUT" | "PREVIEW">("INPUT");
  const [reason, setReason] = useState<ManualReason>("OFFLINE");
  const [channel, setChannel] = useState<Channel>("OFFLINE");
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [qty, setQty] = useState("1");
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const quantity = Number(qty);
  const product = state.products.find((item) => item.id === productId);
  const includeExpired = reason === "EXPIRED";
  const fefo = previewFefo(state, productId, Number.isFinite(quantity) ? quantity : 0, {
    includeExpired,
  });
  const before = productSellable(state, productId);
  const needsReference = ["BONUS", "PROMO", "SAMPLE"].includes(reason);

  function review() {
    if (!productId || !Number.isInteger(quantity) || quantity <= 0) {
      setError("Produk dan qty bilangan bulat positif wajib diisi.");
      return;
    }
    if (fefo.shortage > 0) {
      setError(`Stok batch valid kurang ${fefo.shortage} unit.`);
      return;
    }
    if (!includeExpired && quantity > before) {
      setError(`Qty melebihi sellable. Tersedia ${before} unit setelah reservasi.`);
      return;
    }
    setError("");
    setStep("PREVIEW");
  }

  async function commit() {
    const result = await execute({
      type: "MANUAL_STOCK_OUT",
      productId,
      qty: quantity,
      reason,
      channel,
      referenceNote: reference.trim() || undefined,
    });
    toast({
      title: result.title,
      description: result.description,
      tone: result.ok ? "success" : "error",
    });
    if (result.ok) onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={step === "INPUT" ? "Catat pergerakan manual" : "Tinjau pergerakan"}
      description="Setiap commit membuat baris ledger baru. Batch dipilih otomatis melalui FEFO."
      size="md"
    >
      {step === "INPUT" ? (
        <div className="space-y-4 p-5">
          <fieldset>
            <legend className="mb-2 text-[11px] font-medium uppercase tracking-[0.1em] text-muted">
              Alasan
            </legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {MANUAL_REASONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setReason(option.value);
                    if (option.value === "OFFLINE") setChannel("OFFLINE");
                  }}
                  aria-pressed={reason === option.value}
                  className={`min-h-11 rounded-md border px-2 text-[12px] font-medium transition-colors ${
                    reason === option.value
                      ? "border-green bg-green-soft text-green"
                      : "border-line hover:bg-line-2"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-[11px] font-medium text-muted">
              Kanal
              <select
                value={channel}
                onChange={(event) => setChannel(event.target.value as Channel)}
                className={`${inputClass} mt-1.5 text-ink`}
              >
                {CHANNEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] font-medium text-muted">
              Jumlah
              <input
                type="number"
                min={1}
                step={1}
                value={qty}
                onChange={(event) => setQty(event.target.value)}
                className={`${inputClass} mt-1.5 text-right font-mono text-ink`}
              />
            </label>
          </div>
          <label className="block text-[11px] font-medium text-muted">
            Produk
            <select
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
              className={`${inputClass} mt-1.5 text-ink`}
            >
              {products.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.sku}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[11px] font-medium text-muted">
            Referensi {needsReference ? "campaign / approval" : "transaksi"}
            <input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="mis. CAMP-RAMADAN-26 / approval Rara"
              className={`${inputClass} mt-1.5 text-ink`}
            />
          </label>
          {needsReference && !reference.trim() ? (
            <div className="rounded-md border border-amber/20 bg-amber-soft px-3 py-2.5 text-[11.5px] text-amber">
              Referensi sangat disarankan. Commit tetap boleh dilanjutkan, tetapi akan muncul sebagai worklist audit.
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="rounded-md bg-red-soft px-3 py-2.5 text-[11.5px] text-red">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 border-t border-line-2 pt-4">
            <button type="button" onClick={onClose} className="min-h-11 rounded-md border border-line px-4 text-[12.5px] font-medium">
              Batal
            </button>
            <button type="button" onClick={review} className="min-h-11 rounded-md bg-green px-4 text-[12.5px] font-medium text-white">
              Tinjau Pergerakan
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-line-2 p-4 text-[12px] sm:grid-cols-3">
            <div><span className="block text-muted">Produk</span><strong>{product?.name}</strong></div>
            <div><span className="block text-muted">Alasan</span><PillRect>{reason}</PillRect></div>
            <div><span className="block text-muted">Kanal</span><strong>{channel}</strong></div>
            <div><span className="block text-muted">Sellable sebelum</span><strong className="font-mono">{before}</strong></div>
            <div><span className="block text-muted">Dampak</span><strong className="font-mono text-red">−{quantity}</strong></div>
            <div><span className="block text-muted">Sellable sesudah</span><strong className="font-mono">{before - quantity}</strong></div>
          </div>
          <div>
            <h3 className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted">
              {includeExpired ? "Batch expired untuk write-off" : "Ringkasan alokasi FEFO"}
            </h3>
            <div className="mt-2 divide-y divide-line-2 overflow-hidden rounded-lg border border-line">
              {fefo.allocations.map((allocation, index) => (
                <div key={allocation.batchId} className="flex items-center justify-between gap-3 px-3 py-3 text-[12px]">
                  <div><strong className="font-mono">{allocation.batchCode}</strong><div className="text-[10.5px] text-muted">exp {allocation.expiryDate} · tersedia {allocation.availableBefore}</div></div>
                  <div className="text-right"><PillRect tone={index === 0 ? "green" : "neutral"}>FEFO #{index + 1}</PillRect><div className="mt-1 font-mono font-semibold text-red">−{allocation.qty}</div></div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-md border border-line px-3 py-2.5 text-[11.5px] text-muted">
            Referensi: <span className="font-mono text-ink">{reference.trim() || "Tidak diisi"}</span>
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-line-2 pt-4">
            <button type="button" onClick={() => setStep("INPUT")} className="min-h-11 rounded-md border border-line px-4 text-[12.5px] font-medium">
              Kembali
            </button>
            <button type="button" onClick={commit} className="min-h-11 rounded-md bg-green px-4 text-[12.5px] font-medium text-white">
              Konfirmasi &amp; Tulis Ledger
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
