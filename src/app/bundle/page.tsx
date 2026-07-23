"use client";

import { useState } from "react";
import { useDemoStore } from "@/components/demo-store-provider";
import { useToast } from "@/components/toast";
import { Card, EmptyState, InfoNote, PillRect, SectionLabel } from "@/components/ui";
import { IconBundle, IconPlus } from "@/components/icons";

const inputClass = "min-h-11 w-full rounded-md border border-line bg-surface px-3 text-[12.5px] outline-none focus:border-green focus:ring-[3px] focus:ring-green/10";

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
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-[17px] font-medium">Resep Bundle</h2><p className="mt-0.5 text-[12px] text-muted">Versi resep disimpan; order lama tetap memakai component snapshot saat order masuk.</p></div>
        <button onClick={startVersion} className="flex min-h-11 items-center gap-1.5 rounded-md bg-green px-4 text-[12.5px] font-medium text-white"><IconPlus size={13} />Versi Resep Baru</button>
      </div>

      {editing ? (
        <Card className="mb-5 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><SectionLabel>Versi baru</SectionLabel><h3 className="mt-1 text-[14px] font-medium">Pilih komponen produk satuan</h3></div><select value={bundleProductId} onChange={(event) => setBundleProductId(event.target.value)} className={`${inputClass} max-w-xs`}>{bundles.map((bundle) => <option key={bundle.id} value={bundle.id}>{bundle.name}</option>)}</select></div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {units.map((unit) => (
              <label key={unit.id} className={`flex min-h-14 items-center gap-3 rounded-md border px-3 ${quantities[unit.id] ? "border-green bg-green-soft" : "border-line"}`}>
                <span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-medium">{unit.name}</span><span className="font-mono text-[9.5px] text-muted">{unit.sku}</span></span>
                <input type="number" min={0} step={1} aria-label={`Qty ${unit.name}`} value={quantities[unit.id] ?? 0} onChange={(event) => setQuantities({ ...quantities, [unit.id]: Number(event.target.value) })} className="h-10 w-16 rounded-md border border-line bg-surface px-2 text-right font-mono text-[12px]" />
              </label>
            ))}
          </div>
          <div className="mt-4 flex justify-end gap-2 border-t border-line-2 pt-4"><button onClick={() => setEditing(false)} className="min-h-11 rounded-md border border-line px-4 text-[12.5px] font-medium">Batal</button><button onClick={saveVersion} className="min-h-11 rounded-md bg-green px-4 text-[12.5px] font-medium text-white">Simpan sebagai Versi Baru</button></div>
        </Card>
      ) : null}

      {bundles.length === 0 ? <Card><EmptyState title="Belum ada bundle" description="Tambahkan produk bertipe bundle terlebih dahulu." /></Card> : (
        <div className="grid grid-cols-12 gap-4">
          {bundles.map((bundle) => {
            const versions = state.bundleRecipes.filter((item) => item.bundleProductId === bundle.id).toSorted((a, b) => b.version - a.version);
            return (
              <Card key={bundle.id} className="col-span-12 overflow-hidden lg:col-span-6">
                <div className="flex items-center gap-3 border-b border-line-2 p-4"><div className="flex h-11 w-11 items-center justify-center rounded-md bg-green-soft text-green"><IconBundle size={17} /></div><div className="min-w-0 flex-1"><h3 className="truncate text-[13px] font-medium">{bundle.name}</h3><p className="font-mono text-[10.5px] text-muted">{bundle.sku} · tidak punya stok independen</p></div><PillRect tone="neutral">{versions.length} VERSI</PillRect></div>
                <div className="divide-y divide-line-2">
                  {versions.map((version) => (
                    <div key={version.id} className="p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2"><div><strong className="text-[12.5px]">Versi {version.version}</strong><p className="mt-0.5 text-[10.5px] text-muted">Efektif {formatTime(version.effectiveAt)} · {version.createdBy}</p></div><PillRect tone={version.status === "ACTIVE" ? "green" : "ghost"}>{version.status}</PillRect></div>
                      <div className="mt-3 grid gap-1.5">
                        {version.items.map((component) => {
                          const product = state.products.find((item) => item.id === component.productId);
                          return <div key={component.productId} className="flex justify-between rounded-md bg-line-2 px-3 py-2 text-[11.5px]"><span>{product?.name}</span><strong className="font-mono">× {component.qty}</strong></div>;
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
      <Card className="mt-4"><InfoNote>Saat order masuk, recipe version dan komponen disalin ke order item. Mengubah resep hari ini tidak mengubah order lama.</InfoNote></Card>
    </section>
  );
}
