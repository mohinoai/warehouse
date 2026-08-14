import type {
  Anomaly,
  Batch,
  CommandResult,
  DemoCommand,
  DemoState,
  FefoAllocation,
  ImportEvent,
  LedgerEntry,
  Notification,
  OrderItem,
  Reason,
  RecipeComponent,
  ReferenceType,
  ReturnCase,
} from "./types";
import { CLAIM_OUTCOMES_BY_CONDITION } from "./types";

const DAY = 86_400_000;

function cloneState(state: DemoState): DemoState {
  return structuredClone(state);
}

function dateAt(value: string): number {
  return new Date(value).getTime();
}

export function daysUntil(from: string, until: string): number {
  return Math.ceil((dateAt(until) - dateAt(from)) / DAY);
}

export function addDays(value: string, days: number): string {
  return new Date(dateAt(value) + days * DAY).toISOString();
}

export function isExpired(state: DemoState, batch: Batch): boolean {
  return batch.expiryDate < state.demoNow.slice(0, 10);
}

export function batchQty(state: DemoState, batchId: string): number {
  return state.balanceSummary[batchId]?.qtyOnHand ?? 0;
}

export function productBatches(state: DemoState, productId: string): Batch[] {
  return state.batches
    .filter((batch) => batch.productId === productId)
    .toSorted((a, b) => a.expiryDate.localeCompare(b.expiryDate));
}

export function productOnHand(state: DemoState, productId: string): number {
  return productBatches(state, productId).reduce(
    (total, batch) => total + batchQty(state, batch.id),
    0,
  );
}

export function shipmentRequest(
  payload: Record<string, unknown>,
): Map<string, number> | null {
  const rows = payload.items;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const request = new Map<string, number>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const { itemId, qty } = row as { itemId?: unknown; qty?: unknown };
    if (typeof itemId === "string" && itemId) request.set(itemId, Number(qty));
  }
  return request.size > 0 ? request : null;
}

function itemRequirements(item: OrderItem, qty: number): RecipeComponent[] {
  if (item.componentSnapshot?.length) {
    return item.componentSnapshot.map((component) => ({
      productId: component.productId,
      qty: component.qty * qty,
    }));
  }
  return [{ productId: item.productId, qty }];
}

export function productReserved(state: DemoState, productId: string): number {
  return state.orders.reduce((total, order) => {
    if (order.status !== "RESERVED" && order.status !== "PARTIALLY_CANCELLED") {
      return total;
    }
    return (
      total +
      order.items.reduce((itemTotal, item) => {
        const requirement = itemRequirements(item, item.reservedQty).find(
          (component) => component.productId === productId,
        );
        return itemTotal + (requirement?.qty ?? 0);
      }, 0)
    );
  }, 0);
}

export function productSellable(state: DemoState, productId: string): number {
  const validOnHand = productBatches(state, productId).reduce(
    (total, batch) =>
      total +
      (!isExpired(state, batch) && batch.sellable ? batchQty(state, batch.id) : 0),
    0,
  );
  return validOnHand - productReserved(state, productId);
}

export function previewFefo(
  state: DemoState,
  productId: string,
  qty: number,
  options?: { includeExpired?: boolean },
): { allocations: FefoAllocation[]; shortage: number } {
  let remaining = qty;
  const allocations: FefoAllocation[] = [];
  const eligible = productBatches(state, productId).filter((batch) => {
    if (!batch.sellable || batchQty(state, batch.id) <= 0) return false;
    return options?.includeExpired ? isExpired(state, batch) : !isExpired(state, batch);
  });

  for (const batch of eligible) {
    if (remaining <= 0) break;
    const availableBefore = batchQty(state, batch.id);
    const allocated = Math.min(remaining, availableBefore);
    allocations.push({
      batchId: batch.id,
      batchCode: batch.code,
      expiryDate: batch.expiryDate,
      qty: allocated,
      availableBefore,
    });
    remaining -= allocated;
  }

  return { allocations, shortage: remaining };
}

function nextId(state: DemoState, prefix: string): string {
  const id = `${prefix}-${String(state.nextSequence).padStart(4, "0")}`;
  state.nextSequence += 1;
  return id;
}

interface LedgerDraft {
  productId: string;
  batchId: string;
  qtyDelta: number;
  reason: Reason;
  channel: LedgerEntry["channel"];
  referenceType: ReferenceType;
  referenceId: string;
  referenceNote?: string;
  allocationGroupId?: string;
  reversesEntryId?: string;
  verificationStatus?: LedgerEntry["verificationStatus"];
}

function appendLedger(state: DemoState, draft: LedgerDraft): LedgerEntry {
  const id = nextId(state, "led");
  const current = batchQty(state, draft.batchId);
  const entry: LedgerEntry = {
    id,
    createdAt: state.demoNow,
    productId: draft.productId,
    batchId: draft.batchId,
    qtyDelta: draft.qtyDelta,
    reason: draft.reason,
    channel: draft.channel,
    referenceType: draft.referenceType,
    referenceId: draft.referenceId,
    referenceNote: draft.referenceNote,
    actor: state.actor,
    balanceAfter: current + draft.qtyDelta,
    allocationGroupId: draft.allocationGroupId,
    reversesEntryId: draft.reversesEntryId,
    verificationStatus: draft.verificationStatus,
  };
  state.ledgerEntries.unshift(entry);
  state.balanceSummary[draft.batchId] = {
    batchId: draft.batchId,
    qtyOnHand: entry.balanceAfter,
    ledgerEntryId: entry.id,
    updatedAt: entry.createdAt,
  };
  return entry;
}

function processed(
  title: string,
  description: string,
  extra?: Partial<CommandResult>,
): CommandResult {
  return { ok: true, status: "PROCESSED", title, description, ...extra };
}

function rejected(title: string, description: string): CommandResult {
  return { ok: false, status: "REJECTED", title, description };
}

function duplicate(event: ImportEvent): CommandResult {
  return {
    ok: true,
    status: "DUPLICATE",
    title: "Event sudah diproses",
    description: `${event.idempotencyKey} tidak mengubah state untuk kedua kalinya.`,
    entityId: event.orderId,
  };
}

function activeRecipe(state: DemoState, bundleProductId: string) {
  return state.bundleRecipes.find(
    (recipe) =>
      recipe.bundleProductId === bundleProductId && recipe.status === "ACTIVE",
  );
}

function orderStatusAfterCancellation(order: DemoState["orders"][number]) {
  const remaining = order.items.reduce(
    (total, item) => total + item.orderedQty - item.cancelledQty,
    0,
  );
  return remaining === 0 ? "CANCELLED" : "PARTIALLY_CANCELLED";
}

function injectEvent(state: DemoState, event: ImportEvent): CommandResult {
  if (state.processedEventKeys.includes(event.idempotencyKey)) return duplicate(event);

  function markProcessed() {
    state.processedEventKeys.push(event.idempotencyKey);
    state.nextSequence += 1;
  }

  if (event.type === "STOCK_RECEIVED") {
    const productId = String(event.payload.productId ?? "");
    const batchCode = String(event.payload.batchCode ?? "").trim();
    const qty = Number(event.payload.qty);
    const expiryDate = String(event.payload.expiryDate ?? "");
    const reference = String(event.payload.reference ?? "").trim();
    const mode = event.payload.mode === "OPENING" ? "OPENING" : "MAKLON";
    const product = state.products.find((item) => item.id === productId && !item.isBundle);
    if (
      !product ||
      !batchCode ||
      !reference ||
      !Number.isInteger(qty) ||
      qty <= 0 ||
      !expiryDate ||
      expiryDate <= state.demoNow.slice(0, 10)
    ) {
      return rejected("Baris import ditolak", "Produk, batch, qty, expiry, atau reference tidak valid.");
    }
    if (state.batches.some((batch) => batch.code === batchCode)) {
      return {
        ok: true,
        status: "DUPLICATE",
        title: "Batch sudah diproses",
        description: `${batchCode} tidak diimpor dua kali.`,
      };
    }
    const batchId = nextId(state, "batch");
    state.batches.push({
      id: batchId,
      code: batchCode,
      productId,
      expiryDate,
      origin: mode,
      verificationStatus: mode === "OPENING" ? "UNVERIFIED" : "VERIFIED",
      createdAt: event.occurredAt,
      sellable: true,
    });
    const entry = appendLedger(state, {
      productId,
      batchId,
      qtyDelta: qty,
      reason: mode === "OPENING" ? "OPENING_BALANCE" : "INCOMING_MAKLON",
      channel: "INTERNAL",
      referenceType: mode === "OPENING" ? "OPENING" : "MAKLON",
      referenceId: reference,
      referenceNote: `Import CSV · ${event.id}`,
      verificationStatus: mode === "OPENING" ? "UNVERIFIED" : "VERIFIED",
    });
    markProcessed();
    return processed("Baris import diproses", `${batchCode} menambah ${qty} unit.`, {
      entityId: batchId,
      ledgerEntryIds: [entry.id],
    });
  }

  if (event.type === "ORDER_CREATED") {
    if (event.channel !== "SHOPEE" && event.channel !== "TIKTOK") {
      return rejected("Channel ditolak", "Order marketplace harus memakai SHOPEE atau TIKTOK.");
    }
    if (state.orders.some((order) => order.id === event.orderId)) return duplicate(event);
    const rawItems = event.payload.items as
      | Array<{ productId: string; qty: number }>
      | undefined;
    if (!rawItems?.length) return rejected("Payload ditolak", "Order harus memiliki item.");
    const items: OrderItem[] = [];
    for (const raw of rawItems) {
      const product = state.products.find((candidate) => candidate.id === raw.productId);
      if (!product || !Number.isInteger(raw.qty) || raw.qty <= 0) {
        return rejected("Payload ditolak", "Produk atau qty order tidak valid.");
      }
      const recipe = product.isBundle ? activeRecipe(state, product.id) : undefined;
      if (product.isBundle && !recipe) {
        return rejected("Resep bundle tidak tersedia", `${product.name} tidak punya versi aktif.`);
      }
      const components = recipe?.items ?? [{ productId: product.id, qty: 1 }];
      for (const component of components) {
        if (productSellable(state, component.productId) < component.qty * raw.qty) {
          const componentProduct = state.products.find((p) => p.id === component.productId);
          return rejected(
            "Stok tidak cukup",
            `${componentProduct?.name ?? component.productId} tidak cukup untuk reservasi.`,
          );
        }
      }
      items.push({
        id: `${event.orderId}-item-${items.length + 1}`,
        productId: product.id,
        orderedQty: raw.qty,
        reservedQty: raw.qty,
        shippedQty: 0,
        cancelledQty: 0,
        returnedQty: 0,
        recipeVersionId: recipe?.id,
        componentSnapshot: recipe ? structuredClone(recipe.items) : undefined,
      });
    }
    state.orders.unshift({
      id: event.orderId,
      channel: event.channel,
      status: "RESERVED",
      createdAt: event.occurredAt,
      updatedAt: event.occurredAt,
      items,
      allocations: [],
      sourceEventId: event.id,
    });
    markProcessed();
    return processed(
      "Pesanan menjadi reservasi",
      `${event.orderId} mengurangi sellable tanpa mengubah on-hand.`,
      { entityId: event.orderId },
    );
  }

  const order = state.orders.find((candidate) => candidate.id === event.orderId);
  if (!order) return rejected("Order tidak ditemukan", event.orderId);

  if (event.type === "ORDER_SHIPPED") {
    const repairingMissingLedger =
      (order.status === "SHIPPED" || order.status === "IN_TRANSIT") &&
      order.allocations.length === 0;
    if (
      order.status !== "RESERVED" &&
      order.status !== "PARTIALLY_CANCELLED" &&
      !repairingMissingLedger
    ) {
      return rejected("Shipment tidak dapat diproses", `Status order saat ini ${order.status}.`);
    }
    const requestedQty = shipmentRequest(event.payload);
    const plan = new Map<string, number>();
    for (const item of order.items) {
      const remaining = item.orderedQty - item.cancelledQty - item.shippedQty;
      if (repairingMissingLedger) {
        plan.set(item.id, item.shippedQty);
        continue;
      }
      const requested = requestedQty ? requestedQty.get(item.id) ?? 0 : remaining;
      if (!Number.isInteger(requested) || requested < 0) {
        return rejected("Qty shipment tidak valid", `${item.id} harus bilangan bulat nol atau lebih.`);
      }
      if (requested > Math.max(0, remaining)) {
        return rejected("Qty shipment melebihi sisa item", `${item.id} hanya menyisakan ${Math.max(0, remaining)} unit.`);
      }
      plan.set(item.id, requested);
    }
    const plannedTotal = [...plan.values()].reduce((total, qty) => total + qty, 0);
    if (!repairingMissingLedger && plannedTotal <= 0) {
      return rejected("Shipment kosong", "Minimal satu item harus memiliki qty kirim di atas nol.");
    }

    const ledgerIds: string[] = [];
    const allocationGroupId = nextId(state, "alloc");
    for (const item of order.items) {
      const qtyToShip = plan.get(item.id) ?? 0;
      if (qtyToShip <= 0) continue;
      const requirements = itemRequirements(item, qtyToShip);
      for (const requirement of requirements) {
        const preview = previewFefo(state, requirement.productId, requirement.qty);
        if (preview.shortage > 0) {
          const product = state.products.find((p) => p.id === requirement.productId);
          return rejected(
            "Shipment diblokir",
            `${product?.name ?? requirement.productId} kurang ${preview.shortage} unit valid.`,
          );
        }
        for (const allocation of preview.allocations) {
          const entry = appendLedger(state, {
            productId: requirement.productId,
            batchId: allocation.batchId,
            qtyDelta: -allocation.qty,
            reason: "OFFLINE",
            channel: order.channel,
            referenceType: "ORDER",
            referenceId: order.id,
            referenceNote: `Shipment ${order.channel}`,
            allocationGroupId,
          });
          ledgerIds.push(entry.id);
          order.allocations.push({
            id: nextId(state, "ship"),
            orderItemId: item.id,
            productId: requirement.productId,
            batchId: allocation.batchId,
            qty: allocation.qty,
            ledgerEntryId: entry.id,
          });
        }
      }
      if (!repairingMissingLedger) {
        item.shippedQty += qtyToShip;
        item.reservedQty = Math.max(0, item.reservedQty - qtyToShip);
      }
    }
    const outstanding = order.items.reduce(
      (total, item) => total + Math.max(0, item.orderedQty - item.cancelledQty - item.shippedQty),
      0,
    );
    const shipmentComplete = repairingMissingLedger || outstanding === 0;
    if (shipmentComplete) {
      order.status = order.channel === "SHOPEE" ? "SHIPPED" : "IN_TRANSIT";
    }
    order.updatedAt = event.occurredAt;
    markProcessed();
    return processed(
      shipmentComplete
        ? `${order.channel === "SHOPEE" ? "SHIPPED" : "IN_TRANSIT"} diproses`
        : "Shipment parsial diproses",
      shipmentComplete
        ? `${ledgerIds.length} entry ledger dibuat melalui alokasi FEFO.`
        : `${ledgerIds.length} entry ledger dibuat; ${outstanding} unit belum dikirim.`,
      { entityId: order.id, ledgerEntryIds: ledgerIds },
    );
  }

  if (event.type === "ORDER_CANCELLED") {
    const itemId = String(event.payload.itemId ?? "");
    const qty = Number(event.payload.qty);
    const item = order.items.find((candidate) => candidate.id === itemId);
    if (!item || !Number.isInteger(qty) || qty <= 0) {
      return rejected("Pembatalan ditolak", "Item atau qty tidak valid.");
    }
    if (qty > item.orderedQty - item.cancelledQty) {
      return rejected("Pembatalan ditolak", "Qty melebihi sisa item order.");
    }
    const ledgerIds: string[] = [];
    if (order.status === "SHIPPED" || order.status === "IN_TRANSIT") {
      const requirements = itemRequirements(item, qty);
      for (const requirement of requirements) {
        let remaining = requirement.qty;
        const original = order.allocations.filter(
          (allocation) =>
            allocation.orderItemId === item.id &&
            allocation.productId === requirement.productId,
        );
        for (const allocation of original) {
          if (remaining <= 0) break;
          const reversedQty = Math.min(remaining, allocation.qty);
          const entry = appendLedger(state, {
            productId: allocation.productId,
            batchId: allocation.batchId,
            qtyDelta: reversedQty,
            reason: "CANCELLATION_REVERSAL",
            channel: order.channel,
            referenceType: "ORDER",
            referenceId: order.id,
            referenceNote: `Pembatalan ${qty} item setelah shipment`,
          });
          ledgerIds.push(entry.id);
          remaining -= reversedQty;
        }
      }
    } else {
      item.reservedQty = Math.max(0, item.reservedQty - qty);
    }
    item.cancelledQty += qty;
    order.status = orderStatusAfterCancellation(order);
    order.updatedAt = event.occurredAt;
    markProcessed();
    return processed(
      ledgerIds.length ? "Pembatalan menulis reversal" : "Reservasi dilepas",
      ledgerIds.length
        ? `${ledgerIds.length} CANCELLATION_REVERSAL dibuat.`
        : `${qty} unit dilepas tanpa movement ledger.`,
      { entityId: order.id, ledgerEntryIds: ledgerIds },
    );
  }

  if (event.type === "RETURN_REQUESTED") {
    const itemId = String(event.payload.itemId ?? "");
    const qty = Number(event.payload.qty);
    const item = order.items.find((candidate) => candidate.id === itemId);
    if (!item || !Number.isInteger(qty) || qty <= 0) {
      return rejected("Retur ditolak", "Item atau qty tidak valid.");
    }
    if (qty > item.shippedQty - item.returnedQty - item.cancelledQty) {
      return rejected("Retur ditolak", "Qty melebihi item yang sudah dikirim.");
    }
    const returnId = nextId(state, "ret");
    const returnItems = itemRequirements(item, qty).map((component, index) => ({
      id: `${returnId}-item-${index + 1}`,
      orderItemId: item.id,
      productId: component.productId,
      qty: component.qty,
    }));
    const returnCase: ReturnCase = {
      id: returnId,
      orderId: order.id,
      channel: order.channel,
      createdAt: event.occurredAt,
      inspectionStatus: "PENDING",
      items: returnItems,
    };
    state.returns.unshift(returnCase);
    item.returnedQty += qty;
    markProcessed();
    return processed(
      "Retur diajukan",
      `${returnItems.length} produk satuan menunggu inspeksi.`,
      { entityId: returnId },
    );
  }

  return rejected("Event tidak didukung", event.type);
}

function inspectReturn(
  state: DemoState,
  command: Extract<DemoCommand, { type: "INSPECT_RETURN" }>,
): CommandResult {
  const returnCase = state.returns.find((item) => item.id === command.returnId);
  const item = returnCase?.items.find((candidate) => candidate.id === command.returnItemId);
  if (!returnCase || !item || item.condition) {
    return rejected("Inspeksi tidak dapat disimpan", "Item retur tidak tersedia atau sudah diproses.");
  }
  item.condition = command.condition;
  item.inspectionNote = command.note;
  const ledgerIds: string[] = [];

  if (command.condition === "SELLABLE") {
    if (!command.expiryDate || command.expiryDate <= state.demoNow.slice(0, 10)) {
      item.condition = undefined;
      return rejected("Expiry wajib diverifikasi", "Batch retur harus punya expiry mendatang yang terbaca.");
    }
    if (!command.batchCode?.trim()) {
      item.condition = undefined;
      return rejected("Kode batch wajib", "Gunakan kode batch baru origin retur.");
    }
    if (state.batches.some((batch) => batch.code === command.batchCode?.trim())) {
      item.condition = undefined;
      return rejected("Kode batch sudah dipakai", command.batchCode.trim());
    }
    const batchId = nextId(state, "batch-ret");
    state.batches.push({
      id: batchId,
      code: command.batchCode.trim(),
      productId: item.productId,
      expiryDate: command.expiryDate,
      origin: "RETURN",
      verificationStatus: "VERIFIED",
      createdAt: state.demoNow,
      sellable: true,
    });
    const entry = appendLedger(state, {
      productId: item.productId,
      batchId,
      qtyDelta: item.qty,
      reason: "RETURN_RESTOCK",
      channel: returnCase.channel,
      referenceType: "RETURN",
      referenceId: returnCase.id,
      referenceNote: command.note,
    });
    item.newBatchId = batchId;
    ledgerIds.push(entry.id);
  } else {
    const claimId = nextId(state, "claim");
    state.returnClaims.unshift({
      id: claimId,
      returnId: returnCase.id,
      returnItemId: item.id,
      condition: command.condition,
      status: "OPEN",
      deadline:
        returnCase.channel === "TIKTOK" ? addDays(returnCase.createdAt, 40) : undefined,
      evidenceReference: command.evidenceReference,
      note: command.note,
    });
    item.claimId = claimId;
  }
  returnCase.receivedAt ??= state.demoNow;
  returnCase.inspectionStatus = returnCase.items.every((candidate) => candidate.condition)
    ? "COMPLETED"
    : "PENDING";
  return processed(
    command.condition === "SELLABLE"
      ? "Batch retur baru dibuat"
      : "Catatan klaim/loss dibuat",
    command.condition === "SELLABLE"
      ? `${item.qty} unit masuk melalui RETURN_RESTOCK.`
      : "Tidak ada movement ledger kedua.",
    { entityId: returnCase.id, ledgerEntryIds: ledgerIds },
  );
}

export function deriveAnomalies(state: DemoState): Anomaly[] {
  const open: Anomaly[] = [];
  for (const batch of state.batches) {
    const qty = batchQty(state, batch.id);
    const product = state.products.find((item) => item.id === batch.productId);
    if (qty < 0) {
      open.push({
        id: `anomaly-negative-${batch.id}`,
        priority: "KRITIS",
        type: "NEGATIVE_STOCK",
        title: "Stok negatif terdeteksi",
        description: `Saldo ${qty} unit perlu ditelusuri sebelum transaksi berikutnya.`,
        referenceLabel: `${product?.name} · ${batch.code}`,
        target: `/ledger?product=${batch.productId}&batch=${batch.id}`,
        source: "Cron harian",
        status: "OPEN",
      });
    }
    const remaining = daysUntil(state.demoNow, `${batch.expiryDate}T23:59:59.000Z`);
    if (qty > 0 && remaining <= 30) {
      open.push({
        id: `anomaly-expiry-${batch.id}`,
        priority: remaining <= 0 ? "KRITIS" : "PERINGATAN",
        type: "EXPIRY",
        title: remaining <= 0 ? "Batch sudah kedaluwarsa" : "Batch mendekati kedaluwarsa",
        description:
          remaining <= 0
            ? `${Math.abs(remaining)} hari lewat expiry dan tidak dihitung sellable.`
            : `${remaining} hari menuju expiry; FEFO memprioritaskan batch ini.`,
        referenceLabel: `${product?.name} · ${batch.code}`,
        target: `/produk?product=${batch.productId}&batch=${batch.id}`,
        source: "Notifikasi",
        status: "OPEN",
      });
    }
  }

  for (const order of state.orders) {
    if (
      (order.status === "SHIPPED" || order.status === "IN_TRANSIT") &&
      order.allocations.length === 0
    ) {
      open.push({
        id: `anomaly-order-${order.id}`,
        priority: "KRITIS",
        type: "MISSING_SHIPMENT_LEDGER",
        title: "Shipment tanpa ledger entry",
        description: `${order.status} terdeteksi tanpa hasil alokasi FEFO.`,
        referenceLabel: order.id,
        target: `/simulasi?order=${order.id}`,
        source: "Cron harian",
        status: "OPEN",
      });
    }
  }

  for (const returnCase of state.returns) {
    if (returnCase.channel !== "TIKTOK") continue;
    const deadline = addDays(returnCase.createdAt, 40);
    const remaining = daysUntil(state.demoNow, deadline);
    const unresolved = returnCase.items.some((item) => {
      if (!item.claimId) return !item.condition;
      return state.returnClaims.find((claim) => claim.id === item.claimId)?.status !== "RESOLVED";
    });
    if (unresolved && remaining <= 7) {
      open.push({
        id: `anomaly-claim-${returnCase.id}`,
        priority: remaining <= 3 ? "KRITIS" : "PERINGATAN",
        type: "CLAIM_DEADLINE",
        title: remaining < 0 ? "Klaim TikTok melewati H-40" : "Klaim TikTok mendekati H-40",
        description:
          remaining < 0
            ? `${Math.abs(remaining)} hari melewati batas sejak retur diajukan.`
            : `Sisa ${remaining} hari dari tanggal retur diajukan.`,
        referenceLabel: returnCase.id,
        target: `/retur?return=${returnCase.id}`,
        source: "Reminder",
        status: "OPEN",
      });
    }
  }

  for (const entry of state.ledgerEntries) {
    if (
      ["BONUS", "PROMO", "SAMPLE"].includes(entry.reason) &&
      !entry.referenceNote?.trim() &&
      !entry.reversedByEntryId
    ) {
      open.push({
        id: `anomaly-reference-${entry.id}`,
        priority: "PERINGATAN",
        type: "MISSING_REFERENCE",
        title: `${entry.reason} tanpa referensi`,
        description: "Campaign atau catatan approval belum tersedia.",
        referenceLabel: entry.id,
        target: `/ledger?entry=${entry.id}`,
        source: "Audit",
        status: "OPEN",
      });
    }
  }

  const openIds = new Set(open.map((item) => item.id));
  const resolved = state.anomalies
    .filter((item) => item.status === "OPEN" && !openIds.has(item.id))
    .map((item) => ({ ...item, status: "RESOLVED" as const }));
  return [...open, ...resolved, ...state.anomalies.filter((item) => item.status === "RESOLVED")]
    .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index);
}

export function deriveNotifications(state: DemoState): Notification[] {
  const generated: Notification[] = [];
  for (const batch of state.batches) {
    const remaining = daysUntil(state.demoNow, `${batch.expiryDate}T23:59:59.000Z`);
    if (batchQty(state, batch.id) <= 0 || remaining > 30) continue;
    const product = state.products.find((item) => item.id === batch.productId);
    generated.push({
      id: `notification-expiry-${batch.id}`,
      type: "EXPIRY",
      title: remaining <= 0 ? "Batch kedaluwarsa" : "Batch mendekati expiry",
      description: `${product?.name} · ${batch.code} · ${remaining <= 0 ? "lewat" : "sisa"} ${Math.abs(remaining)} hari`,
      createdAt: state.lastReconciledAt,
      target: `/produk?product=${batch.productId}&batch=${batch.id}`,
    });
  }
  for (const returnCase of state.returns) {
    if (returnCase.channel !== "TIKTOK") continue;
    const remaining = daysUntil(state.demoNow, addDays(returnCase.createdAt, 40));
    if (remaining > 7) continue;
    generated.push({
      id: `notification-claim-${returnCase.id}`,
      type: "TIKTOK_CLAIM",
      title: remaining < 0 ? "Klaim TikTok terlambat" : "Deadline klaim TikTok",
      description: `${returnCase.id} · ${remaining < 0 ? "lewat" : "sisa"} ${Math.abs(remaining)} hari`,
      createdAt: state.lastReconciledAt,
      target: `/retur?return=${returnCase.id}`,
    });
  }
  return generated.map((item) => ({
    ...item,
    readAt: state.notifications.find((existing) => existing.id === item.id)?.readAt,
  }));
}

function refreshDerived(state: DemoState) {
  state.anomalies = deriveAnomalies(state);
  state.notifications = deriveNotifications(state);
}

export function rebuildSummary(entries: LedgerEntry[]): Record<string, DemoState["balanceSummary"][string]> {
  const summary: DemoState["balanceSummary"] = {};
  for (const entry of entries.toReversed()) {
    summary[entry.batchId] = {
      batchId: entry.batchId,
      qtyOnHand: (summary[entry.batchId]?.qtyOnHand ?? 0) + entry.qtyDelta,
      ledgerEntryId: entry.id,
      updatedAt: entry.createdAt,
    };
  }
  return summary;
}

export function checkInvariants(state: DemoState): string[] {
  const problems: string[] = [];
  const rebuilt = rebuildSummary(state.ledgerEntries);
  for (const batch of state.batches) {
    const expected = rebuilt[batch.id]?.qtyOnHand ?? 0;
    const actual = batchQty(state, batch.id);
    if (expected !== actual) problems.push(`${batch.code}: ledger ${expected}, summary ${actual}`);
  }
  for (const product of state.products.filter((item) => item.isBundle)) {
    if (state.batches.some((batch) => batch.productId === product.id)) {
      problems.push(`${product.sku}: bundle tidak boleh memiliki batch`);
    }
  }
  return problems;
}

export function applyCommand(
  current: DemoState,
  command: DemoCommand,
): { state: DemoState; result: CommandResult } {
  const state = cloneState(current);
  let result: CommandResult;

  if (state.failNextOperation) {
    state.failNextOperation = false;
    return {
      state,
      result: rejected(
        "Operasi demo gagal",
        "Kegagalan tersimulasi. Data tidak berubah; silakan coba lagi.",
      ),
    };
  }

  if (command.type === "MANUAL_STOCK_OUT") {
    if (!Number.isInteger(command.qty) || command.qty <= 0) {
      result = rejected("Jumlah tidak valid", "Qty harus bilangan bulat positif.");
    } else {
      const preview = previewFefo(state, command.productId, command.qty, {
        includeExpired: command.reason === "EXPIRED",
      });
      if (preview.shortage > 0) {
        result = rejected("Stok tidak cukup", `Kekurangan ${preview.shortage} unit batch valid.`);
      } else {
        const referenceId = nextId(state, "manual");
        const ledgerIds = preview.allocations.map((allocation) =>
          appendLedger(state, {
            productId: command.productId,
            batchId: allocation.batchId,
            qtyDelta: -allocation.qty,
            reason: command.reason,
            channel: command.channel,
            referenceType: "MANUAL",
            referenceId,
            referenceNote: command.referenceNote,
          }).id,
        );
        result = processed(
          "Pergerakan ditulis ke ledger",
          `${ledgerIds.length} batch dialokasikan tanpa mengubah entry lama.`,
          { entityId: referenceId, ledgerEntryIds: ledgerIds },
        );
      }
    }
  } else if (command.type === "RECEIVE_STOCK") {
    const product = state.products.find((item) => item.id === command.productId && !item.isBundle);
    if (
      !product ||
      !Number.isInteger(command.qty) ||
      command.qty <= 0 ||
      !command.batchCode.trim() ||
      !command.reference.trim() ||
      !command.expiryDate
    ) {
      result = rejected("Data penerimaan belum lengkap", "Produk, batch, qty, expiry, dan referensi wajib.");
    } else if (command.expiryDate <= state.demoNow.slice(0, 10)) {
      result = rejected("Expiry tidak valid", "Barang masuk harus memiliki expiry mendatang.");
    } else if (state.batches.some((batch) => batch.code === command.batchCode.trim())) {
      result = rejected("Kode batch sudah dipakai", command.batchCode.trim());
    } else {
      const batchId = nextId(state, "batch");
      state.batches.push({
        id: batchId,
        code: command.batchCode.trim(),
        productId: command.productId,
        expiryDate: command.expiryDate,
        origin: command.mode,
        verificationStatus: command.mode === "OPENING" ? "UNVERIFIED" : "VERIFIED",
        createdAt: state.demoNow,
        sellable: true,
      });
      const entry = appendLedger(state, {
        productId: command.productId,
        batchId,
        qtyDelta: command.qty,
        reason: command.mode === "OPENING" ? "OPENING_BALANCE" : "INCOMING_MAKLON",
        channel: "INTERNAL",
        referenceType: command.mode === "OPENING" ? "OPENING" : "MAKLON",
        referenceId: command.reference.trim(),
        verificationStatus: command.mode === "OPENING" ? "UNVERIFIED" : "VERIFIED",
      });
      result = processed(
        command.mode === "OPENING" ? "Opening balance dicatat" : "Barang masuk dicatat",
        `${command.qty} unit masuk ke ${command.batchCode}.`,
        { entityId: batchId, ledgerEntryIds: [entry.id] },
      );
    }
  } else if (command.type === "INJECT_EVENT") {
    result = injectEvent(state, command.event);
  } else if (command.type === "INSPECT_RETURN") {
    result = inspectReturn(state, command);
  } else if (command.type === "FILE_CLAIM") {
    const claim = state.returnClaims.find((item) => item.id === command.claimId);
    if (!claim || claim.status !== "OPEN" || !command.evidenceReference.trim()) {
      result = rejected("Klaim belum dapat diajukan", "Evidence reference wajib dan klaim harus terbuka.");
    } else {
      claim.status = "FILED";
      claim.filedAt = state.demoNow;
      claim.evidenceReference = command.evidenceReference.trim();
      result = processed("Klaim diajukan", `${claim.id} kini berstatus FILED.`, { entityId: claim.id });
    }
  } else if (command.type === "RESOLVE_CLAIM") {
    const claim = state.returnClaims.find((item) => item.id === command.claimId);
    if (!claim || claim.status !== "FILED" || !command.resolution.trim()) {
      result = rejected("Klaim belum dapat diselesaikan", "Resolution wajib dan klaim harus FILED.");
    } else if (!CLAIM_OUTCOMES_BY_CONDITION[claim.condition].includes(command.outcome)) {
      result = rejected(
        "Hasil penyelesaian tidak valid",
        `${command.outcome} tidak berlaku untuk klaim ${claim.condition}.`,
      );
    } else {
      claim.status = "RESOLVED";
      claim.resolvedAt = state.demoNow;
      claim.resolution = command.resolution.trim();
      claim.outcome = command.outcome;
      result = processed(
        "Klaim diselesaikan",
        `${claim.id} · ${command.outcome} · tidak lagi memicu reminder.`,
        { entityId: claim.id },
      );
    }
  } else if (command.type === "CORRECT_ENTRY") {
    const original = state.ledgerEntries.find((entry) => entry.id === command.entryId);
    if (!original || original.reversedByEntryId || original.reason === "MANUAL_ENTRY_CORRECTION") {
      result = rejected("Entry tidak dapat dikoreksi", "Entry sudah direversal atau bukan entry yang valid.");
    } else if (!command.note.trim()) {
      result = rejected("Alasan koreksi wajib", "Catatan menjelaskan kenapa reversal dibuat.");
    } else {
      const reversal = appendLedger(state, {
        productId: original.productId,
        batchId: original.batchId,
        qtyDelta: -original.qtyDelta,
        reason: "MANUAL_ENTRY_CORRECTION",
        channel: "INTERNAL",
        referenceType: "CORRECTION",
        referenceId: original.id,
        referenceNote: command.note.trim(),
        reversesEntryId: original.id,
      });
      original.reversedByEntryId = reversal.id;
      result = processed(
        "Reversal koreksi dibuat",
        `${reversal.id} tertaut ke ${original.id}.`,
        { entityId: reversal.id, ledgerEntryIds: [reversal.id] },
      );
    }
  } else if (command.type === "CREATE_OPNAME") {
    const id = nextId(state, "opn");
    state.opnameSessions.unshift({
      id,
      warehouse: "Gudang Utama",
      status: "DRAFT",
      startedAt: state.demoNow,
      createdBy: state.actor,
      counts: state.batches.map((batch) => ({
        batchId: batch.id,
        systemQty: batchQty(state, batch.id),
      })),
      correctionEntryIds: [],
    });
    result = processed("Sesi opname baru dibuat", `${id} memiliki ${state.batches.length} batch dalam scope.`, {
      entityId: id,
    });
  } else if (command.type === "SAVE_OPNAME_COUNT") {
    const session = state.opnameSessions.find((item) => item.id === command.sessionId);
    const count = session?.counts.find((item) => item.batchId === command.batchId);
    if (!session || session.status !== "DRAFT" || !count) {
      result = rejected("Draft tidak dapat disimpan", "Sesi atau batch tidak tersedia.");
    } else if (
      command.physicalQty !== undefined &&
      (!Number.isInteger(command.physicalQty) || command.physicalQty < 0)
    ) {
      result = rejected("Hitungan tidak valid", "Stok fisik harus bilangan bulat nol atau lebih.");
    } else {
      count.physicalQty = command.physicalQty;
      count.exceptionReason = command.exceptionReason?.trim();
      result = processed("Draft tersimpan", `Batch ${command.batchId} diperbarui.`, {
        entityId: session.id,
      });
    }
  } else if (command.type === "FINALIZE_OPNAME") {
    const session = state.opnameSessions.find((item) => item.id === command.sessionId);
    if (!session || session.status !== "DRAFT") {
      result = rejected("Sesi tidak dapat difinalisasi", "Sesi tidak ditemukan atau sudah terkunci.");
    } else if (session.counts.some((count) => count.physicalQty === undefined && !count.exceptionReason)) {
      result = rejected("Scope belum lengkap", "Semua batch harus dihitung atau diberi alasan pengecualian.");
    } else {
      const ledgerIds: string[] = [];
      for (const count of session.counts) {
        if (count.physicalQty === undefined) continue;
        const delta = count.physicalQty - count.systemQty;
        const batch = state.batches.find((item) => item.id === count.batchId);
        if (delta !== 0 && batch) {
          ledgerIds.push(
            appendLedger(state, {
              productId: batch.productId,
              batchId: batch.id,
              qtyDelta: delta,
              reason: "OPNAME_CORRECTION",
              channel: "INTERNAL",
              referenceType: "OPNAME",
              referenceId: session.id,
            }).id,
          );
        }
        if (batch?.verificationStatus === "UNVERIFIED") {
          batch.verificationStatus = "VERIFIED";
          batch.verifiedBySessionId = session.id;
          state.ledgerEntries
            .filter((entry) => entry.batchId === batch.id && entry.reason === "OPENING_BALANCE")
            .forEach((entry) => {
              entry.verificationStatus = "VERIFIED";
            });
        }
      }
      session.status = "FINALIZED";
      session.finalizedAt = state.demoNow;
      session.correctionEntryIds = ledgerIds;
      result = processed(
        "Sesi opname difinalisasi",
        `${ledgerIds.length} OPNAME_CORRECTION dibuat; sesi kini terkunci.`,
        { entityId: session.id, ledgerEntryIds: ledgerIds },
      );
    }
  } else if (command.type === "CREATE_RECIPE_VERSION") {
    const product = state.products.find((item) => item.id === command.bundleProductId);
    if (!product?.isBundle || !command.items.length || command.items.some((item) => item.qty <= 0)) {
      result = rejected("Resep tidak valid", "Bundle dan minimal satu komponen positif wajib dipilih.");
    } else {
      const versions = state.bundleRecipes.filter(
        (item) => item.bundleProductId === command.bundleProductId,
      );
      versions.forEach((version) => {
        version.status = "ARCHIVED";
      });
      const version = Math.max(0, ...versions.map((item) => item.version)) + 1;
      const id = nextId(state, "recipe");
      state.bundleRecipes.unshift({
        id,
        bundleProductId: command.bundleProductId,
        version,
        effectiveAt: state.demoNow,
        status: "ACTIVE",
        items: command.items,
        createdBy: state.actor,
      });
      result = processed("Versi resep baru aktif", `Versi ${version} dibuat; order lama tetap memakai snapshot lama.`, {
        entityId: id,
      });
    }
  } else if (command.type === "RERUN_RECONCILIATION") {
    state.lastReconciledAt = state.demoNow;
    result = processed("Rekonsiliasi selesai", "Worklist dan notifikasi dihitung ulang dari sumber data.");
  } else if (command.type === "MARK_NOTIFICATION_READ") {
    const notification = state.notifications.find((item) => item.id === command.notificationId);
    if (!notification) result = rejected("Notifikasi tidak ditemukan", command.notificationId);
    else {
      notification.readAt = state.demoNow;
      result = processed("Notifikasi dibaca", notification.title, { entityId: notification.id });
    }
  } else {
    state.notifications.forEach((notification) => {
      notification.readAt = state.demoNow;
    });
    result = processed("Semua notifikasi dibaca", `${state.notifications.length} item diperbarui.`);
  }

  if (!result.ok) return { state: current, result };
  if (result.status === "PROCESSED") refreshDerived(state);
  const invariantProblems = checkInvariants(state);
  if (invariantProblems.length) {
    return {
      state: current,
      result: rejected("Invariant ledger gagal", invariantProblems.join("; ")),
    };
  }
  return { state, result };
}
