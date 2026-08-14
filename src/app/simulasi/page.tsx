"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDemoStore } from "@/components/demo-store-provider";
import { useToast } from "@/components/toast";
import { Card, EmptyState, Pill, PillRect, SectionLabel, Skeleton } from "@/components/ui";
import { CustomSelect } from "@/components/custom-select";
import { LoadingRows, SuccessPanel } from "@/components/async-state";
import { previewFefo, productOnHand, productReserved, productSellable } from "@/lib/demo/engine";
import type { ImportEvent, OrderItem, RecipeComponent } from "@/lib/demo/types";

type Channel = "SHOPEE" | "TIKTOK";
type DraftAction = "CREATE" | "SHIP" | "CANCEL" | "RETURN";

const inputClass = "min-h-[44px] w-full rounded-lg border border-black/[0.1] bg-black/[0.015] px-3.5 text-[13px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] outline-none transition-all duration-200 focus:border-[#6cc795] focus:bg-white focus:ring-[3px] focus:ring-[#6cc795]/20";

// Each marketplace has a distinct stock rule: Shopee deducts on SHIPPED, TikTok
// on IN_TRANSIT and carries a 40-day return-claim window. Give them separate
// color identities so switching channel is visibly different, not just a label.
const CHANNEL_THEME: Record<Channel, {
  active: string;
  dot: string;
  strip: string;
  shipStatus: string;
  rule: string;
}> = {
  SHOPEE: {
    active: "bg-[#fff3ed] text-[#d9480f] shadow-[0_1px_4px_rgba(217,72,15,0.18)]",
    dot: "bg-[#ee5a29]",
    strip: "border-[#ee5a29]/25 bg-[#fff6f0] text-[#c2410c]",
    shipStatus: "SHIPPED",
    rule: "Stok terpotong saat SHIPPED. Tanpa jendela klaim retur khusus.",
  },
  TIKTOK: {
    active: "bg-[#fff1f2] text-[#be123c] shadow-[0_1px_4px_rgba(190,18,60,0.18)]",
    dot: "bg-[#f43f5e]",
    strip: "border-[#f43f5e]/25 bg-[#fff5f6] text-[#be123c]",
    shipStatus: "IN_TRANSIT",
    rule: "Stok terpotong saat IN_TRANSIT. Klaim retur H-40 sejak retur diajukan.",
  },
};

function itemComponents(item: OrderItem, qty: number): RecipeComponent[] {
  return item.componentSnapshot?.length
    ? item.componentSnapshot.map((component) => ({ productId: component.productId, qty: component.qty * qty }))
    : [{ productId: item.productId, qty }];
}

function remainingQty(item: OrderItem): number {
  return Math.max(0, item.orderedQty - item.cancelledQty - item.shippedQty);
}

function statusTone(status: string): "green" | "amber" | "red" | "neutral" {
  if (status === "SHIPPED" || status === "IN_TRANSIT") return "green";
  if (status === "CANCELLED") return "red";
  if (status === "RESERVED") return "amber";
  return "neutral";
}

function SimulatorScreen() {
  const { state, execute } = useDemoStore();
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const deepLinkedOrder = state.orders.find((item) => item.id === params.get("order"));
  const [channel, setChannel] = useState<Channel>(deepLinkedOrder?.channel ?? "SHOPEE");
  const channelOrders = state.orders.filter((item) => item.channel === channel);
  const [selectedId, setSelectedId] = useState(deepLinkedOrder?.id ?? channelOrders[0]?.id ?? "");
  const selected = state.orders.find((item) => item.id === selectedId && item.channel === channel) ?? channelOrders[0];
  const [draftAction, setDraftAction] = useState<DraftAction>("CREATE");
  const [newProductId, setNewProductId] = useState(state.products[0]?.id ?? "");
  const [newQty, setNewQty] = useState("1");
  const [actionItemId, setActionItemId] = useState(selected?.items[0]?.id ?? "");
  const [actionQty, setActionQty] = useState("1");
  const [shipPlan, setShipPlan] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [lastEvent, setLastEvent] = useState<ImportEvent | null>(null);
  const [lastResult, setLastResult] = useState("");
  const products = state.products;
  const selectedItem = selected?.items.find((item) => item.id === actionItemId) ?? selected?.items[0];
  const actionQuantity = Number(actionQty);
  const repairingMissingLedger = Boolean(
    selected &&
      (selected.status === "SHIPPED" || selected.status === "IN_TRANSIT") &&
      selected.allocations.length === 0,
  );

  function planQty(item: OrderItem): number {
    const raw = shipPlan[item.id];
    return raw === undefined ? remainingQty(item) : Number(raw);
  }

  function shipQty(item: OrderItem): number {
    return repairingMissingLedger ? item.shippedQty : planQty(item);
  }

  function chooseChannel(next: Channel) {
    setChannel(next);
    const first = state.orders.find((order) => order.channel === next);
    setSelectedId(first?.id ?? "");
    setActionItemId(first?.items[0]?.id ?? "");
    setShipPlan({});
    setDraftAction("CREATE");
    router.replace(first ? `/simulasi?order=${first.id}` : "/simulasi");
  }

  function chooseOrder(orderId: string) {
    const order = state.orders.find((item) => item.id === orderId);
    setSelectedId(orderId);
    setActionItemId(order?.items[0]?.id ?? "");
    setActionQty("1");
    setShipPlan({});
    setDraftAction("SHIP");
    router.replace(`/simulasi?order=${orderId}`);
  }

  function makeEvent(type: ImportEvent["type"], payload: Record<string, unknown>, orderId: string): ImportEvent {
    const suffix = String(state.nextSequence).padStart(4, "0");
    return {
      id: `evt-${channel.toLowerCase()}-${suffix}`,
      idempotencyKey: `${channel}:${type}:${orderId}:${suffix}`,
      source: "SIMULATOR",
      channel,
      orderId,
      occurredAt: state.demoNow,
      type,
      payload,
    };
  }

  function currentDraft(): ImportEvent | null {
    if (draftAction === "CREATE") {
      const qty = Number(newQty);
      const orderId = `${channel === "SHOPEE" ? "SHP" : "TT"}-260718-${String(state.nextSequence).padStart(3, "0")}`;
      const items = Number.isInteger(qty) && qty > 0
        ? Array.from({ length: qty }, () => ({ productId: newProductId, qty: 1 }))
        : [];
      return makeEvent("ORDER_CREATED", { items }, orderId);
    }
    if (!selected) return null;
    if (draftAction === "SHIP") {
      const payload = repairingMissingLedger
        ? {}
        : { items: selected.items.map((item) => ({ itemId: item.id, qty: planQty(item) })) };
      return makeEvent("ORDER_SHIPPED", payload, selected.id);
    }
    if (!selectedItem) return null;
    return makeEvent(
      draftAction === "CANCEL" ? "ORDER_CANCELLED" : "RETURN_REQUESTED",
      { itemId: selectedItem.id, qty: actionQuantity },
      selected.id,
    );
  }

  async function inject(event: ImportEvent | null) {
    if (!event) return;
    setPending(true);
    await new Promise((resolve) => setTimeout(resolve, 450));
    const result = await execute({ type: "INJECT_EVENT", event });
    setPending(false);
    setLastEvent(event);
    setLastResult(`${result.status}: ${result.description}`);
    toast({ title: result.title, description: result.description, tone: result.ok ? (result.status === "DUPLICATE" ? "info" : "success") : "error" });
    if (result.ok && event.type === "ORDER_SHIPPED") setShipPlan({});
    if (result.ok && result.entityId && event.type === "ORDER_CREATED") {
      setSelectedId(result.entityId);
      setActionItemId(`${result.entityId}-item-1`);
      setDraftAction("SHIP");
      router.replace(`/simulasi?order=${result.entityId}`);
    }
  }

  const draft = currentDraft();
  const shipmentPreview = selected
    ? selected.items.flatMap((item) => {
        const qtyToShip = shipQty(item);
        if (!Number.isInteger(qtyToShip) || qtyToShip <= 0) return [];
        return itemComponents(item, qtyToShip).map((requirement) => ({
          ...requirement,
          preview: previewFefo(state, requirement.productId, requirement.qty),
        }));
      })
    : [];
  const shipmentShortage = shipmentPreview.reduce((total, item) => total + item.preview.shortage, 0);
  const shipPlanTotal = selected && !repairingMissingLedger
    ? selected.items.reduce((total, item) => total + (Number.isFinite(planQty(item)) ? planQty(item) : 0), 0)
    : 0;
  const shipPlanError = selected && !repairingMissingLedger
    ? selected.items.find((item) => {
        const qty = planQty(item);
        if (!Number.isInteger(qty) || qty < 0) return true;
        return qty > remainingQty(item);
      })
    : undefined;
  const shipmentOutstanding = selected && !repairingMissingLedger
    ? selected.items.reduce((total, item) => total + Math.max(0, remainingQty(item) - planQty(item)), 0)
    : 0;
  const draftError =
    draftAction === "CREATE" && (!Number.isInteger(Number(newQty)) || Number(newQty) <= 0)
      ? "Qty order harus bilangan bulat positif."
      : draftAction === "CREATE" && Number(newQty) > 100
        ? "Maksimal 100 line item per event simulator."
      : draftAction === "SHIP" && shipPlanError
        ? `Qty kirim ${shipPlanError.id} harus bilangan bulat 0–${remainingQty(shipPlanError)}.`
      : draftAction === "SHIP" && !repairingMissingLedger && shipPlanTotal <= 0
        ? "Minimal satu item harus memiliki qty kirim di atas nol."
      : draftAction === "SHIP" && shipmentShortage > 0
        ? `Shipment diblokir: kurang ${shipmentShortage} unit valid.`
        : (draftAction === "CANCEL" || draftAction === "RETURN") &&
            (!Number.isInteger(actionQuantity) || actionQuantity <= 0)
          ? "Qty aksi harus bilangan bulat positif."
          : "";

  return (
    <section className="mx-auto max-w-[1720px] animate-fade-in px-4 py-6 sm:px-7">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-[18px] font-semibold tracking-tight text-ink">Simulasi Marketplace / Import</h2>
          <p className="mt-1 text-[12px] text-muted-2">Simulator mengirim envelope yang sama dengan adapter CSV dan webhook final.</p>
        </div>
        <div className="inline-flex rounded-lg bg-black/[0.04] p-1 shadow-inner">
          {(["SHOPEE", "TIKTOK"] as Channel[]).map((item) => (
            <button
              key={item}
              onClick={() => chooseChannel(item)}
              className={`flex min-h-[40px] items-center gap-2 rounded-md px-5 text-[11.5px] font-semibold tracking-wide uppercase transition-all duration-200 ${
                channel === item ? CHANNEL_THEME[item].active : "text-muted hover:text-ink-2"
              }`}
            >
              <span className={`size-1.5 rounded-full ${channel === item ? CHANNEL_THEME[item].dot : "bg-current opacity-40"}`} />
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className={`mb-5 flex flex-wrap items-center gap-2.5 rounded-lg border px-4 py-3 text-[12px] font-medium ${CHANNEL_THEME[channel].strip}`}>
        <span className={`size-2 rounded-full ${CHANNEL_THEME[channel].dot}`} />
        <strong className="uppercase tracking-wide">{channel}</strong>
        <span className="opacity-70">·</span>
        <span>{CHANNEL_THEME[channel].rule}</span>
      </div>
      {lastResult ? <div className="mb-5"><SuccessPanel>{lastResult}</SuccessPanel></div> : null}

      <div className="grid grid-cols-12 gap-5">
        <Card className="col-span-12 overflow-hidden xl:col-span-7">
          <div className="flex items-center justify-between border-b border-black/[0.06] px-5 py-4">
            <h3 className="flex items-center gap-2 text-[14px] font-semibold tracking-tight text-ink"><span className={`size-2 rounded-full ${CHANNEL_THEME[channel].dot}`} />Order {channel}</h3>
            <PillRect>{channelOrders.length} ORDER</PillRect>
          </div>
          {pending ? (
            <LoadingRows count={4} />
          ) : channelOrders.length === 0 ? (
            <EmptyState title="Belum ada order" description="Buat event ORDER_CREATED dari panel kanan." />
          ) : (
            <div className="divide-y divide-black/[0.04]">
              {channelOrders.map((order) => (
                <button
                  key={order.id}
                  onClick={() => chooseOrder(order.id)}
                  className={`group grid min-h-[72px] w-full gap-3 px-5 py-4 text-left transition-all duration-200 sm:grid-cols-[1fr_auto_auto] sm:items-center ${
                    selected?.id === order.id ? "bg-[#e6f2ec]/60" : "hover:bg-[#f6f7f5]/80"
                  }`}
                >
                  <div>
                    <strong className={`font-mono text-[12px] transition-colors ${selected?.id === order.id ? "text-[#1f6b43]" : "text-ink group-hover:text-[#1f6b43]"}`}>
                      {order.id}
                    </strong>
                    <div className="mt-1.5 text-[11px] text-muted-2">{order.items.length} item · event {order.sourceEventId}</div>
                  </div>
                  <Pill tone={statusTone(order.status)}>{order.status}</Pill>
                  <span className="font-mono text-[11.5px] font-medium text-muted">{order.items.reduce((total, item) => total + item.orderedQty, 0)} unit</span>
                </button>
              ))}
            </div>
          )}
        </Card>

        <div className="col-span-12 space-y-5 xl:col-span-5">
          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionLabel>Event composer</SectionLabel>
              <PillRect tone="green">ADAPTER CONTRACT</PillRect>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(["CREATE", "SHIP", "CANCEL", "RETURN"] as DraftAction[]).map((action) => {
                const disabled = action !== "CREATE" && !selected;
                return (
                  <button
                    key={action}
                    disabled={disabled}
                    onClick={() => setDraftAction(action)}
                    className={`min-h-[44px] rounded-lg border text-[11px] font-semibold tracking-wide transition-all duration-200 disabled:opacity-40 ${
                      draftAction === action
                        ? "border-[#1f6b43]/20 bg-[#e6f2ec] text-[#1f6b43] shadow-sm"
                        : "border-black/[0.08] bg-white text-muted hover:bg-black/[0.02] hover:text-ink-2"
                    }`}
                  >
                    {action}
                  </button>
                );
              })}
            </div>
            {draftAction === "CREATE" ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_90px]">
                <label className="text-[11px] font-medium tracking-wide text-muted-2">
                  Produk
                  <CustomSelect value={newProductId} onChange={(val) => setNewProductId(val)} className={`${inputClass} mt-2 font-normal text-ink`} options={products.map((product) => ({ label: product.name, value: product.id }))} />
                </label>
                <label className="text-[11px] font-medium tracking-wide text-muted-2">
                  Qty
                  <input type="number" min={1} max={100} step={1} value={newQty} onChange={(event) => setNewQty(event.target.value)} className={`${inputClass} mt-2 text-right font-mono font-medium text-ink`} />
                </label>
              </div>
            ) : selected ? (
              <div className="mt-5">
                <div className="rounded-lg bg-black/[0.02] border border-black/[0.05] px-4 py-3 shadow-sm">
                  <strong className="font-mono text-[12px] text-ink">{selected.id}</strong>
                  <div className="mt-1 text-[11px] font-medium text-muted-2">{selected.channel} · {selected.status}</div>
                </div>
                {draftAction === "CANCEL" || draftAction === "RETURN" ? (
                  <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_90px]">
                    <label className="text-[11px] font-medium tracking-wide text-muted-2">
                      Item
                      <CustomSelect value={selectedItem?.id ?? ""} onChange={(val) => setActionItemId(val)} className={`${inputClass} mt-2 font-normal text-ink`} options={selected.items.map((item) => ({ label: `${item.id} · ${state.products.find((product) => product.id === item.productId)?.name}`, value: item.id }))} />
                    </label>
                    <label className="text-[11px] font-medium tracking-wide text-muted-2">
                      Qty parsial
                      <input type="number" min={1} step={1} value={actionQty} onChange={(event) => setActionQty(event.target.value)} className={`${inputClass} mt-2 text-right font-mono font-medium text-ink`} />
                    </label>
                  </div>
                ) : null}
              </div>
            ) : null}
            {draftAction === "SHIP" && selected ? (
              <div className="mt-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <SectionLabel>Qty kirim per item</SectionLabel>
                  {repairingMissingLedger ? <PillRect tone="amber">REPAIR LEDGER</PillRect> : shipmentOutstanding > 0 ? <PillRect tone="amber">PARSIAL · {shipmentOutstanding} SISA</PillRect> : <PillRect tone="green">KIRIM PENUH</PillRect>}
                </div>
                {repairingMissingLedger ? (
                  <p className="mt-3 rounded-lg bg-amber-soft px-4 py-3 text-[11.5px] leading-relaxed text-amber">Order sudah berstatus {selected.status} tanpa allocation; event ini menulis ulang ledger sebesar qty terkirim dan tidak dapat diubah.</p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {selected.items.map((item) => {
                      const product = state.products.find((candidate) => candidate.id === item.productId);
                      const remaining = remainingQty(item);
                      const qty = planQty(item);
                      const components = Number.isInteger(qty) && qty > 0 ? itemComponents(item, qty) : [];
                      return (
                        <div key={item.id} className="rounded-xl border border-black/[0.08] bg-white px-4 py-3 shadow-sm transition-shadow hover:shadow">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <strong className="text-[12px] text-ink">{product?.name}</strong>
                              <div className="mt-1 font-mono text-[10px] text-muted-2">{item.id} · sisa {remaining} dari {item.orderedQty}</div>
                            </div>
                            <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-2">
                              Qty
                              <input
                                type="number"
                                min={0}
                                max={remaining}
                                step={1}
                                value={shipPlan[item.id] ?? String(remaining)}
                                onChange={(event) => setShipPlan({ ...shipPlan, [item.id]: event.target.value })}
                                aria-label={`Qty kirim ${item.id}`}
                                className={`${inputClass} mt-1.5 w-24 text-right font-mono font-medium text-ink`}
                              />
                            </label>
                          </div>
                          {product?.isBundle && components.length > 0 ? (
                            <div className="mt-3 border-t border-black/[0.04] pt-3 text-[10.5px] text-muted-2">
                              Komponen: <span className="text-ink">{components.map((component) => `${state.products.find((candidate) => candidate.id === component.productId)?.name} ×${component.qty}`).join(" · ")}</span>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="mt-6"><SectionLabel>Preview FEFO</SectionLabel></div>
                <div className="mt-3 space-y-2">
                  {shipmentPreview.flatMap((requirement) => requirement.preview.allocations.map((allocation, index) => {
                    const product = state.products.find((item) => item.id === requirement.productId);
                    return (
                      <div key={`${requirement.productId}-${allocation.batchId}`} className="flex items-center justify-between rounded-lg border border-black/[0.06] bg-black/[0.01] px-4 py-3 text-[11.5px]">
                        <div>
                          <strong className="text-ink">{product?.name}</strong>
                          <div className="mt-1 font-mono text-[10px] text-muted-2">{allocation.batchCode} · exp {allocation.expiryDate}</div>
                        </div>
                        <div className="text-right">
                          <PillRect tone={index === 0 ? "green" : "neutral"}>FEFO #{index + 1}</PillRect>
                          <div className="mt-1.5 font-mono font-medium text-ink">−{allocation.qty}</div>
                        </div>
                      </div>
                    );
                  }))}
                </div>
              </div>
            ) : null}
            <div className="mt-6 rounded-[1rem] border border-black/[0.06] bg-[#fcfdfc] p-5 shadow-[inset_0_2px_10px_rgba(0,0,0,0.015)]">
              <div className="grid gap-2 text-[11px] sm:grid-cols-2">
                <span><span className="text-muted-2">Event ID:</span> <strong className="font-mono text-ink">{draft?.id}</strong></span>
                <span><span className="text-muted-2">Idempotency:</span> <strong className="font-mono text-ink">{draft?.idempotencyKey}</strong></span>
                <span><span className="text-muted-2">Order:</span> <strong className="font-mono text-ink">{draft?.orderId}</strong></span>
                <span><span className="text-muted-2">Waktu:</span> <strong className="font-mono text-ink">{draft?.occurredAt}</strong></span>
              </div>
              <pre className="mt-4 overflow-x-auto whitespace-pre-wrap border-t border-black/[0.05] pt-4 font-mono text-[10.5px] leading-relaxed text-muted-2">{JSON.stringify(draft?.payload ?? {}, null, 2)}</pre>
            </div>
            {draftError ? <p role="alert" className="mt-4 rounded-lg bg-red-soft px-4 py-3 text-[11.5px] font-medium text-red shadow-sm">{draftError}</p> : null}
            
            <button
              disabled={pending || Boolean(draftError) || !draft}
              onClick={() => inject(draft)}
              className="mt-5 flex min-h-[48px] w-full items-center justify-center rounded-[1rem] bg-gradient-to-b from-[#2a8757] to-[#17623c] px-5 text-[14px] font-semibold text-white shadow-[0_4px_14px_rgba(31,107,67,0.25)] transition-all duration-300 hover:-translate-y-0.5 hover:from-[#319c65] hover:to-[#1a7044] hover:shadow-[0_6px_20px_rgba(31,107,67,0.4)] active:translate-y-0 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 border border-[#3fb075]/30"
            >
              {pending ? (
                <span className="flex items-center gap-2">
                  <span className="size-4 animate-spin rounded-full border-2 border-white/35 border-t-white" aria-hidden="true" />
                  Memproses event…
                </span>
              ) : draftAction !== "SHIP" ? (
                "Injeksi Event"
              ) : !repairingMissingLedger && shipmentOutstanding > 0 ? (
                `Kirim Parsial ${shipPlanTotal} Unit & Tulis Ledger`
              ) : (
                `Konfirmasi ${CHANNEL_THEME[channel].shipStatus} & Tulis Ledger`
              )}
            </button>
            {lastEvent ? <button onClick={() => inject(lastEvent)} className="mt-3 min-h-[44px] w-full rounded-[1rem] border border-black/[0.08] bg-transparent text-[12px] font-medium text-muted transition-all hover:bg-black/[0.02] hover:text-ink-2">Kirim ulang event terakhir · uji duplicate</button> : null}
          </Card>

          {selected ? (
            <Card className="overflow-hidden mb-6">
              <div className="border-b border-black/[0.06] px-5 py-4"><h3 className="text-[14px] font-semibold tracking-tight text-ink">Detail item order</h3></div>
              <div className="divide-y divide-black/[0.04]">
                {selected.items.map((item) => {
                  const product = state.products.find((candidate) => candidate.id === item.productId);
                  const itemStatus = item.returnedQty > 0 ? "RETURNED" : item.cancelledQty > 0 ? "CANCELLED" : "UNAFFECTED";
                  return (
                    <div key={item.id} className="p-5 transition-colors hover:bg-black/[0.01]">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <strong className="text-[13px] text-ink">{product?.name}</strong>
                          <div className="mt-1 font-mono text-[10px] text-muted-2">{item.id}{item.recipeVersionId ? ` · ${item.recipeVersionId}` : ""}</div>
                        </div>
                        <div className="flex flex-wrap justify-end gap-2">
                          {product?.isBundle ? <PillRect tone="amber">BUNDLE SNAPSHOT</PillRect> : null}
                          <PillRect tone={itemStatus === "UNAFFECTED" ? "neutral" : itemStatus === "RETURNED" ? "amber" : "red"}>{itemStatus}</PillRect>
                        </div>
                      </div>
                      <div className="mt-5 grid grid-cols-5 gap-3 rounded-xl bg-black/[0.02] p-4 text-center border border-black/[0.04]">
                        <div><SectionLabel className="!text-[9px]">Ordered</SectionLabel><strong className="mt-1 block font-mono text-[14px] text-ink">{item.orderedQty}</strong></div>
                        <div><SectionLabel className="!text-[9px]">Reserved</SectionLabel><strong className="mt-1 block font-mono text-[14px] text-amber">{item.reservedQty}</strong></div>
                        <div><SectionLabel className="!text-[9px]">Shipped</SectionLabel><strong className="mt-1 block font-mono text-[14px] text-green">{item.shippedQty}</strong></div>
                        <div><SectionLabel className="!text-[9px]">Cancelled</SectionLabel><strong className="mt-1 block font-mono text-[14px] text-ink">{item.cancelledQty}</strong></div>
                        <div><SectionLabel className="!text-[9px]">Returned</SectionLabel><strong className="mt-1 block font-mono text-[14px] text-ink">{item.returnedQty}</strong></div>
                      </div>
                      {item.componentSnapshot ? (
                        <div className="mt-4 border-t border-black/[0.04] pt-3 text-[11px] text-muted-2">
                          Dipecah: <span className="text-ink">{item.componentSnapshot.map((component) => `${state.products.find((candidate) => candidate.id === component.productId)?.name} ×${component.qty}`).join(" · ")}</span>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-3 gap-3 border-t border-black/[0.08] bg-[#fcfdfc] p-5 text-center">
                <div><SectionLabel className="!text-[10px]">On-hand item</SectionLabel><strong className="mt-1 block font-mono text-[15px] text-ink">{selectedItem ? productOnHand(state, selectedItem.productId) : "—"}</strong></div>
                <div><SectionLabel className="!text-[10px]">Reserved</SectionLabel><strong className="mt-1 block font-mono text-[15px] text-amber">{selectedItem ? productReserved(state, selectedItem.productId) : "—"}</strong></div>
                <div><SectionLabel className="!text-[10px]">Sellable</SectionLabel><strong className="mt-1 block font-mono text-[15px] text-[#1f6b43]">{selectedItem ? productSellable(state, selectedItem.productId) : "—"}</strong></div>
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default function SimulasiPage() {
  return <Suspense fallback={<div className="p-7"><Skeleton className="h-96" /></div>}><SimulatorScreen /></Suspense>;
}
