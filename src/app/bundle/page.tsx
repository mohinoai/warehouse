"use client";

import { useState } from "react";
import { useDemoStore } from "@/components/demo-store-provider";
import { useToast } from "@/components/toast";
import { Card, EmptyState, InfoNote, PillRect, SectionLabel } from "@/components/ui";
import { IconBundle, IconPlus } from "@/components/icons";
import { CustomSelect } from "@/components/custom-select";

const inputClass = "min-h-[44px] w-full rounded-lg border border-black/[0.1] bg-black/[0.015] px-3.5 text-[12.5px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] outline-none transition-all focus:border-[#6cc795] focus:bg-white focus:ring-[3px] focus:ring-[#6cc795]/20";

function formatTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(value));
}

export default function BundlePage() {
  const { state, execute } = useDemoStore();
  const toast = useToast();
  const bundles = state.products.filter((item) => item.isBundle);
  const units = state.products.filter((item) => !item.isBundle);
  const [editing, setEditing] = useState(false);
  const [bundleProductId, setBundleProductId] = useState(bundles[0]?.id ?? "");
  const active = state.bundleRecipes.find((item) => item.bundleProductId === bundleProductId && item.status === "ACTIVE");
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries((active?.items ?? []).map((item) => [item.productId, item.qty])),
  );

  function startVersion() {
    const current = state.bundleRecipes.find((item) => item.bundleProductId === bundleProductId && item.status === "ACTIVE");
    setQuantities(Object.fromEntries((current?.items ?? []).map((item) => [item.productId, item.qty])));
    setEditing(true);
  }

  async function saveVersion() {
    const items = Object.entries(quantities)
      .filter(([, qty]) => Number.isInteger(qty) && qty > 0)
      .map(([productId, qty]) => ({ productId, qty }));
    const result = await execute({ type: "CREATE_RECIPE_VERSION", bundleProductId, items });
    toast({ title: result.title, description: result.description, tone: result.ok ? "success" : "error" });
    if (result.ok) setEditing(false);
  }

  return (
    <section className="mx-auto max-w-[1720px] animate-fade-in px-4 py-6 sm:px-7">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-[18px] font-semibold tracking-tight text-ink">Resep Bundle</h2>
          <p className="mt-1 text-[12px] text-muted-2">Versi resep disimpan; order lama tetap memakai component snapshot saat order masuk.</p>
        </div>
        <button onClick={startVersion} className="flex min-h-[44px] items-center gap-2 rounded-lg bg-gradient-to-b from-[#2a8757] to-[#17623c] px-5 text-[12.5px] font-semibold text-white shadow-[0_4px_14px_rgba(31,107,67,0.25)] transition-all hover:from-[#319c65] hover:to-[#1a7044]">
          <IconPlus size={14} />Versi Resep Baru
        </button>
      </div>

      {editing ? (
        <Card className="mb-6 border-[#6cc795]/50 shadow-[0_4px_24px_rgba(108,199,149,0.15)] overflow-hidden">
          <div className="border-b border-black/[0.06] bg-[#e6f2ec]/60 px-6 py-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <SectionLabel>Versi baru</SectionLabel>
                <h3 className="mt-1 text-[15px] font-semibold text-ink">Pilih komponen produk satuan</h3>
              </div>
              <div className="w-full sm:w-72">
                <CustomSelect value={bundleProductId} onChange={(val) => setBundleProductId(val)} className={`${inputClass} font-semibold`} options={bundles.map((bundle) => ({label: bundle.name, value: bundle.id}))} />
              </div>
            </div>
          </div>
          
          <div className="p-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {units.map((unit) => (
                <label key={unit.id} className={`flex min-h-[64px] items-center gap-3 rounded-xl border px-4 transition-all ${quantities[unit.id] ? "border-[#6cc795] bg-[#e6f2ec]/50 shadow-[0_2px_8px_rgba(108,199,149,0.15)]" : "border-black/[0.08] bg-white hover:border-black/[0.15] hover:bg-black/[0.01]"}`}>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[13px] font-semibold ${quantities[unit.id] ? "text-[#1f6b43]" : "text-ink"}`}>{unit.name}</span>
                    <span className={`mt-0.5 block font-mono text-[10.5px] ${quantities[unit.id] ? "text-[#2a8757]" : "text-muted-2"}`}>{unit.sku}</span>
                  </span>
                  <input type="number" min={0} step={1} aria-label={`Qty ${unit.name}`} value={quantities[unit.id] ?? 0} onChange={(event) => setQuantities({ ...quantities, [unit.id]: Number(event.target.value) })} className="h-[40px] w-16 rounded-lg border border-black/[0.1] bg-white px-2 text-right font-mono text-[13px] font-semibold text-ink shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] outline-none transition-all focus:border-[#6cc795] focus:ring-[3px] focus:ring-[#6cc795]/20" />
                </label>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-3 pt-2">
              <button onClick={() => setEditing(false)} className="min-h-[44px] rounded-lg border border-black/[0.08] bg-white px-5 text-[12.5px] font-semibold text-ink-2 shadow-sm transition-all hover:bg-black/[0.02]">Batal</button>
              <button onClick={saveVersion} className="min-h-[44px] rounded-lg bg-gradient-to-b from-[#2a8757] to-[#17623c] px-5 text-[12.5px] font-semibold text-white shadow-[0_4px_14px_rgba(31,107,67,0.25)] transition-all hover:from-[#319c65] hover:to-[#1a7044]">Simpan sebagai Versi Baru</button>
            </div>
          </div>
        </Card>
      ) : null}

      {bundles.length === 0 ? <Card className="border-black/[0.06] shadow-sm"><EmptyState title="Belum ada bundle" description="Tambahkan produk bertipe bundle terlebih dahulu." /></Card> : (
        <div className="grid grid-cols-12 gap-5">
          {bundles.map((bundle) => {
            const versions = state.bundleRecipes.filter((item) => item.bundleProductId === bundle.id).toSorted((a, b) => b.version - a.version);
            return (
              <Card key={bundle.id} className="col-span-12 overflow-hidden border-black/[0.06] shadow-sm lg:col-span-6">
                <div className="flex items-center gap-4 border-b border-black/[0.06] bg-[#fcfdfc] px-6 py-5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#e6f2ec]/80 border border-[#6cc795]/30 text-[#1f6b43]">
                    <IconBundle size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[14px] font-semibold text-ink">{bundle.name}</h3>
                    <p className="mt-0.5 font-mono text-[11px] text-muted-2">{bundle.sku} · tidak punya stok independen</p>
                  </div>
                  <PillRect tone="neutral">{versions.length} VERSI</PillRect>
                </div>
                <div className="divide-y divide-black/[0.04]">
                  {versions.map((version) => (
                    <div key={version.id} className="p-6">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <strong className="text-[13px] text-ink">Versi {version.version}</strong>
                          <p className="mt-1 text-[11px] text-muted-2">Efektif {formatTime(version.effectiveAt)} · {version.createdBy}</p>
                        </div>
                        <PillRect tone={version.status === "ACTIVE" ? "green" : "ghost"}>{version.status}</PillRect>
                      </div>
                      <div className="mt-4 grid gap-2">
                        {version.items.map((component) => {
                          const product = state.products.find((item) => item.id === component.productId);
                          return (
                            <div key={component.productId} className="flex justify-between items-center rounded-lg border border-black/[0.05] bg-black/[0.02] px-4 py-2.5 text-[12px]">
                              <span className="text-ink-2 font-medium">{product?.name}</span>
                              <strong className="font-mono text-ink">× {component.qty}</strong>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <Card className="mt-6 border-black/[0.06] shadow-sm overflow-hidden">
        <InfoNote>Saat order masuk, recipe version dan komponen disalin ke order item. Mengubah resep hari ini tidak mengubah order lama.</InfoNote>
      </Card>
    </section>
  );
}
