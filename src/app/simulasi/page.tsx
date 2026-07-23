"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDemoStore } from "@/components/demo-store-provider";
import { useToast } from "@/components/toast";
import { Card, EmptyState, Pill, PillRect, SectionLabel, Skeleton } from "@/components/ui";
import { LoadingRows, SuccessPanel } from "@/components/async-state";
import { previewFefo, productOnHand, productReserved, productSellable } from "@/lib/demo/engine";
import type { ImportEvent, OrderItem, RecipeComponent } from "@/lib/demo/types";

type Channel = "SHOPEE" | "TIKTOK";
type DraftAction = "CREATE" | "SHIP" | "CANCEL" | "RETURN";

const inputClass = "min-h-11 w-full rounded-md border border-line bg-surface px-3 text-[12px] outline-none focus:border-green focus:ring-[3px] focus:ring-green/10";

function itemComponents(item: OrderItem, qty: number): RecipeComponent[] {
  return item.componentSnapshot?.length
    ? item.componentSnapshot.map((component) => ({ productId: component.productId, qty: component.qty * qty }))
    : [{ productId: item.productId, qty }];
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
  const [pending, setPending] = useState(false);
  const [lastEvent, setLastEvent] = useState<ImportEvent | null>(null);
  const [lastResult, setLastResult] = useState("");
  const products = state.products;
  const selectedItem = selected?.items.find((item) => item.id === actionItemId) ?? selected?.items[0];
  const actionQuantity = Number(actionQty);

  function chooseChannel(next: Channel) {
    setChannel(next);
    const first = state.orders.find((order) => order.channel === next);
    setSelectedId(first?.id ?? "");
    setActionItemId(first?.items[0]?.id ?? "");
    setDraftAction("CREATE");
    router.replace(first ? `/simulasi?order=${first.id}` : "/simulasi");
  }

  function chooseOrder(orderId: string) {
    const order = state.orders.find((item) => item.id === orderId);
    setSelectedId(orderId);
    setActionItemId(order?.items[0]?.id ?? "");
    setActionQty("1");
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
      return makeEvent("ORDER_CREATED", { items: [{ productId: newProductId, qty }] }, orderId);
    }
    if (!selected) return null;
    if (draftAction === "SHIP") return makeEvent("ORDER_SHIPPED", {}, selected.id);
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
        const repairingMissingLedger =
          (selected.status === "SHIPPED" || selected.status === "IN_TRANSIT") &&
          selected.allocations.length === 0;
        const qtyToShip = repairingMissingLedger
          ? item.shippedQty
          : item.orderedQty - item.cancelledQty - item.shippedQty;
        return itemComponents(item, Math.max(0, qtyToShip)).map((requirement) => ({
          ...requirement,
          preview: previewFefo(state, requirement.productId, requirement.qty),
        }));
      })
    : [];
  const shipmentShortage = shipmentPreview.reduce((total, item) => total + item.preview.shortage, 0);
  const draftError =
    draftAction === "CREATE" && (!Number.isInteger(Number(newQty)) || Number(newQty) <= 0)
      ? "Qty order harus bilangan bulat positif."
      : draftAction === "SHIP" && shipmentShortage > 0
        ? `Shipment diblokir: kurang ${shipmentShortage} unit valid.`
        : (draftAction === "CANCEL" || draftAction === "RETURN") &&
            (!Number.isInteger(actionQuantity) || actionQuantity <= 0)
          ? "Qty aksi harus bilangan bulat positif."
          : "";

  return (
    <section className="mx-auto max-w-[1720px] animate-fade-in px-4 py-6 sm:px-7">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-[17px] font-medium">Simulasi Marketplace / Import</h2><p className="mt-0.5 text-[12px] text-muted">Simulator mengirim envelope yang sama dengan adapter CSV dan webhook final.</p></div>
        <div className="inline-flex rounded-md bg-[#E9ECE7] p-0.5">
          {(["SHOPEE", "TIKTOK"] as Channel[]).map((item) => <button key={item} onClick={() => chooseChannel(item)} className={`min-h-11 rounded px-4 text-[11.5px] font-medium ${channel === item ? "bg-surface shadow-sm" : "text-muted"}`}>{item}</button>)}
        </div>
      </div>
      {lastResult ? <div className="mb-4"><SuccessPanel>{lastResult}</SuccessPanel></div> : null}

      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 overflow-hidden xl:col-span-7">
          <div className="flex items-center justify-between border-b border-line-2 px-4 py-3"><h3 className="text-[13px] font-medium">Order {channel}</h3><PillRect>{channelOrders.length} ORDER</PillRect></div>
          {pending ? <LoadingRows count={4} /> : channelOrders.length === 0 ? <EmptyState title="Belum ada order" description="Buat event ORDER_CREATED dari panel kanan." /> : (
            <div className="divide-y divide-line-2">
              {channelOrders.map((order) => (
                <button key={order.id} onClick={() => chooseOrder(order.id)} className={`grid min-h-16 w-full gap-2 px-4 py-3 text-left transition-colors sm:grid-cols-[1fr_auto_auto] sm:items-center ${selected?.id === order.id ? "bg-green-soft" : "hover:bg-line-2"}`}>
                  <div><strong className="font-mono text-[11.5px]">{order.id}</strong><div className="mt-1 text-[10.5px] text-muted">{order.items.length} item · event {order.sourceEventId}</div></div>
                  <Pill tone={statusTone(order.status)}>{order.status}</Pill>
                  <span className="font-mono text-[11px] text-muted">{order.items.reduce((total, item) => total + item.orderedQty, 0)} unit</span>
                </button>
              ))}
            </div>
          )}
        </Card>

        <div className="col-span-12 space-y-4 xl:col-span-5">
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2"><SectionLabel>Event composer</SectionLabel><PillRect tone="green">ADAPTER CONTRACT</PillRect></div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(["CREATE", "SHIP", "CANCEL", "RETURN"] as DraftAction[]).map((action) => {
                const disabled = action !== "CREATE" && !selected;
                return <button key={action} disabled={disabled} onClick={() => setDraftAction(action)} className={`min-h-11 rounded-md border text-[10.5px] font-medium disabled:opacity-35 ${draftAction === action ? "border-green bg-green-soft text-green" : "border-line"}`}>{action}</button>;
              })}
            </div>
            {draftAction === "CREATE" ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_90px]"><label className="text-[10.5px] font-medium text-muted">Produk<select value={newProductId} onChange={(event) => setNewProductId(event.target.value)} className={`${inputClass} mt-1.5 text-ink`}>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label><label className="text-[10.5px] font-medium text-muted">Qty<input type="number" min={1} step={1} value={newQty} onChange={(event) => setNewQty(event.target.value)} className={`${inputClass} mt-1.5 text-right font-mono text-ink`} /></label></div>
            ) : selected ? (
              <div className="mt-4">
                <div className="rounded-md bg-line-2 px-3 py-2.5"><strong className="font-mono text-[11.5px]">{selected.id}</strong><div className="text-[10.5px] text-muted">{selected.channel} · {selected.status}</div></div>
                {draftAction === "CANCEL" || draftAction === "RETURN" ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_90px]"><label className="text-[10.5px] font-medium text-muted">Item<select value={selectedItem?.id ?? ""} onChange={(event) => setActionItemId(event.target.value)} className={`${inputClass} mt-1.5 text-ink`}>{selected.items.map((item) => <option key={item.id} value={item.id}>{state.products.find((product) => product.id === item.productId)?.name}</option>)}</select></label><label className="text-[10.5px] font-medium text-muted">Qty parsial<input type="number" min={1} step={1} value={actionQty} onChange={(event) => setActionQty(event.target.value)} className={`${inputClass} mt-1.5 text-right font-mono text-ink`} /></label></div>
                ) : null}
              </div>
            ) : null}
            {draftAction === "SHIP" && selected ? (
              <div className="mt-4">
                <SectionLabel>Preview FEFO</SectionLabel>
                <div className="mt-2 space-y-2">
                  {shipmentPreview.flatMap((requirement) => requirement.preview.allocations.map((allocation, index) => {
                    const product = state.products.find((item) => item.id === requirement.productId);
                    return <div key={`${requirement.productId}-${allocation.batchId}`} className="flex items-center justify-between rounded-md border border-line px-3 py-2.5 text-[11px]"><div><strong>{product?.name}</strong><div className="font-mono text-[9.5px] text-muted">{allocation.batchCode} · exp {allocation.expiryDate}</div></div><div className="text-right"><PillRect tone={index === 0 ? "green" : "neutral"}>FEFO #{index + 1}</PillRect><div className="mt-1 font-mono">−{allocation.qty}</div></div></div>;
                  }))}
                </div>
              </div>
            ) : null}
            <div className="mt-4 rounded-md border border-line bg-canvas p-3 text-[10.5px]">
              <div className="grid gap-1 sm:grid-cols-2"><span><span className="text-muted">Event ID:</span> <strong className="font-mono">{draft?.id}</strong></span><span><span className="text-muted">Idempotency:</span> <strong className="font-mono">{draft?.idempotencyKey}</strong></span><span><span className="text-muted">Order:</span> <strong className="font-mono">{draft?.orderId}</strong></span><span><span className="text-muted">Waktu:</span> <strong className="font-mono">{draft?.occurredAt}</strong></span></div>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap border-t border-line pt-2 font-mono text-[9.5px] text-muted">{JSON.stringify(draft?.payload ?? {}, null, 2)}</pre>
            </div>
            {draftError ? <p role="alert" className="mt-3 rounded-md bg-red-soft px-3 py-2 text-[11.5px] text-red">{draftError}</p> : null}
            <button disabled={pending || Boolean(draftError) || !draft} onClick={() => inject(draft)} className="mt-4 min-h-11 w-full rounded-md bg-green px-4 text-[12.5px] font-medium text-white disabled:opacity-40">{pending ? "Memproses event…" : draftAction === "SHIP" ? `Konfirmasi ${channel === "SHOPEE" ? "SHIPPED" : "IN_TRANSIT"} & Tulis Ledger` : "Injeksi Event"}</button>
            {lastEvent ? <button onClick={() => inject(lastEvent)} className="mt-2 min-h-11 w-full rounded-md border border-line text-[11.5px] font-medium">Kirim ulang event terakhir · uji duplicate</button> : null}
          </Card>

          {selected ? (
            <Card className="overflow-hidden">
              <div className="border-b border-line-2 px-4 py-3"><h3 className="text-[13px] font-medium">Detail item order</h3></div>
              <div className="divide-y divide-line-2">
                {selected.items.map((item) => {
                  const product = state.products.find((candidate) => candidate.id === item.productId);
                  return <div key={item.id} className="p-4"><div className="flex items-start justify-between gap-3"><div><strong className="text-[12px]">{product?.name}</strong><div className="mt-1 font-mono text-[9.5px] text-muted">{item.id}{item.recipeVersionId ? ` · ${item.recipeVersionId}` : ""}</div></div>{product?.isBundle ? <PillRect tone="amber">BUNDLE SNAPSHOT</PillRect> : null}</div><div className="mt-3 grid grid-cols-5 gap-2 text-center"><div><SectionLabel>Ordered</SectionLabel><strong className="font-mono">{item.orderedQty}</strong></div><div><SectionLabel>Reserved</SectionLabel><strong className="font-mono">{item.reservedQty}</strong></div><div><SectionLabel>Shipped</SectionLabel><strong className="font-mono">{item.shippedQty}</strong></div><div><SectionLabel>Cancelled</SectionLabel><strong className="font-mono">{item.cancelledQty}</strong></div><div><SectionLabel>Returned</SectionLabel><strong className="font-mono">{item.returnedQty}</strong></div></div>{item.componentSnapshot ? <div className="mt-3 text-[10.5px] text-muted">Dipecah: {item.componentSnapshot.map((component) => `${state.products.find((candidate) => candidate.id === component.productId)?.name} ×${component.qty}`).join(" · ")}</div> : null}</div>;
                })}
              </div>
              <div className="grid grid-cols-3 gap-2 border-t border-line-2 bg-canvas p-4 text-center"><div><SectionLabel>On-hand item</SectionLabel><strong className="font-mono">{selectedItem ? productOnHand(state, selectedItem.productId) : "—"}</strong></div><div><SectionLabel>Reserved</SectionLabel><strong className="font-mono text-amber">{selectedItem ? productReserved(state, selectedItem.productId) : "—"}</strong></div><div><SectionLabel>Sellable</SectionLabel><strong className="font-mono text-green">{selectedItem ? productSellable(state, selectedItem.productId) : "—"}</strong></div></div>
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
