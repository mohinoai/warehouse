import { describe, expect, it } from "vitest";
import {
  applyCommand,
  checkInvariants,
  isExpired,
  productOnHand,
  productSellable,
} from "./engine";
import { createDemoState } from "./seed";
import type { DemoState, ImportEvent } from "./types";

function event(
  state: DemoState,
  type: ImportEvent["type"],
  orderId: string,
  payload: Record<string, unknown> = {},
): ImportEvent {
  return {
    id: `test-${type}-${orderId}`,
    idempotencyKey: `test:${type}:${orderId}`,
    source: "SIMULATOR",
    channel: orderId.startsWith("TT") ? "TIKTOK" : "SHOPEE",
    orderId,
    occurredAt: state.demoNow,
    type,
    payload,
  };
}

describe("demo stock domain", () => {
  it("reconstructs every summary balance from append-only ledger", () => {
    const state = createDemoState();
    expect(checkInvariants(state)).toEqual([]);
  });

  it("creates reservation without changing on-hand or ledger", () => {
    const state = createDemoState();
    const beforeOnHand = productOnHand(state, "p-serum");
    const beforeSellable = productSellable(state, "p-serum");
    const beforeLedger = state.ledgerEntries.length;
    const created = applyCommand(state, {
      type: "INJECT_EVENT",
      event: event(state, "ORDER_CREATED", "SHP-TEST-RESERVE", {
        items: [{ productId: "p-serum", qty: 2 }],
      }),
    });

    expect(created.result.ok).toBe(true);
    expect(productOnHand(created.state, "p-serum")).toBe(beforeOnHand);
    expect(productSellable(created.state, "p-serum")).toBe(beforeSellable - 2);
    expect(created.state.ledgerEntries).toHaveLength(beforeLedger);
  });

  it("ships through FEFO and never allocates expired batches", () => {
    const state = createDemoState();
    const beforeLedger = state.ledgerEntries.length;
    const shipped = applyCommand(state, {
      type: "INJECT_EVENT",
      event: event(state, "ORDER_SHIPPED", "SHP-260718-002"),
    });

    expect(shipped.result.ok).toBe(true);
    expect(shipped.state.ledgerEntries.length).toBeGreaterThan(beforeLedger);
    const order = shipped.state.orders.find((item) => item.id === "SHP-260718-002");
    expect(order?.status).toBe("SHIPPED");
    expect(order?.allocations.every((allocation) => {
      const batch = shipped.state.batches.find((item) => item.id === allocation.batchId);
      return batch ? !isExpired(shipped.state, batch) : false;
    })).toBe(true);
    expect(checkInvariants(shipped.state)).toEqual([]);
  });

  it("ignores duplicate event without changing state twice", () => {
    const state = createDemoState();
    const shipment = event(state, "ORDER_SHIPPED", "SHP-260718-002");
    const first = applyCommand(state, { type: "INJECT_EVENT", event: shipment });
    const ledgerCount = first.state.ledgerEntries.length;
    const second = applyCommand(first.state, { type: "INJECT_EVENT", event: shipment });

    expect(second.result.status).toBe("DUPLICATE");
    expect(second.state.ledgerEntries).toHaveLength(ledgerCount);
  });

  it("repairs imported shipment that is missing its ledger allocation", () => {
    const state = createDemoState();
    const repaired = applyCommand(state, {
      type: "INJECT_EVENT",
      event: event(state, "ORDER_SHIPPED", "TT-260716-009"),
    });
    const order = repaired.state.orders.find((item) => item.id === "TT-260716-009");

    expect(repaired.result.ok).toBe(true);
    expect(order?.allocations.length).toBeGreaterThan(0);
    expect(repaired.state.anomalies.find((item) => item.id === "anomaly-order-TT-260716-009")?.status).toBe("RESOLVED");
  });

  it("routes CSV stock receipt through idempotent import event", () => {
    const state = createDemoState();
    const importEvent: ImportEvent = {
      id: "csv-test-1",
      idempotencyKey: "CSV:PO-TEST:CSV-TEST-01",
      source: "CSV",
      channel: "INTERNAL",
      orderId: "PO-TEST",
      occurredAt: state.demoNow,
      type: "STOCK_RECEIVED",
      payload: {
        mode: "MAKLON",
        productId: "p-serum",
        batchCode: "CSV-TEST-01",
        qty: 25,
        expiryDate: "2027-04-01",
        reference: "PO-TEST",
      },
    };
    const first = applyCommand(state, { type: "INJECT_EVENT", event: importEvent });
    const second = applyCommand(first.state, { type: "INJECT_EVENT", event: importEvent });

    expect(first.result.status).toBe("PROCESSED");
    expect(first.state.batches.find((batch) => batch.code === "CSV-TEST-01")).toBeTruthy();
    expect(second.result.status).toBe("DUPLICATE");
    expect(second.state.ledgerEntries).toHaveLength(first.state.ledgerEntries.length);
  });

  it("rejects incoming stock without a product", () => {
    const state = createDemoState();
    const beforeBatches = state.batches.length;
    const beforeLedger = state.ledgerEntries.length;
    const result = applyCommand(state, {
      type: "RECEIVE_STOCK",
      mode: "OPENING",
      productId: "",
      batchCode: "OPEN-NO-PRODUCT",
      qty: 1,
      expiryDate: "2027-02-01",
      reference: "OPEN-MISSING-PRODUCT",
    });

    expect(result.result.ok).toBe(false);
    expect(result.state.batches).toHaveLength(beforeBatches);
    expect(result.state.ledgerEntries).toHaveLength(beforeLedger);
  });

  it("cancels reservation without ledger and shipped item with reversal", () => {
    const state = createDemoState();
    const before = state.ledgerEntries.length;
    const preShipment = applyCommand(state, {
      type: "INJECT_EVENT",
      event: event(state, "ORDER_CANCELLED", "TT-260718-003", {
        itemId: "TT-260718-003-item-1",
        qty: 1,
      }),
    });
    expect(preShipment.state.ledgerEntries).toHaveLength(before);

    const postShipment = applyCommand(preShipment.state, {
      type: "INJECT_EVENT",
      event: event(preShipment.state, "ORDER_CANCELLED", "SHP-260716-001", {
        itemId: "SHP-260716-001-item-1",
        qty: 1,
      }),
    });
    expect(postShipment.result.ok).toBe(true);
    expect(postShipment.state.ledgerEntries[0].reason).toBe("CANCELLATION_REVERSAL");
    expect(postShipment.state.ledgerEntries[0].qtyDelta).toBe(1);
  });

  it("keeps unaffected order lines visible after a partial cancellation", () => {
    const state = createDemoState();
    const orderId = "SHP-TEST-PARTIAL";
    const created = applyCommand(state, {
      type: "INJECT_EVENT",
      event: event(state, "ORDER_CREATED", orderId, {
        items: Array.from({ length: 5 }, () => ({ productId: "p-sunscreen", qty: 1 })),
      }),
    });
    const cancelled = applyCommand(created.state, {
      type: "INJECT_EVENT",
      event: event(created.state, "ORDER_CANCELLED", orderId, {
        itemId: `${orderId}-item-1`,
        qty: 1,
      }),
    });
    const order = cancelled.state.orders.find((item) => item.id === orderId);

    expect(order?.items.map((item) => item.id)).toEqual([
      `${orderId}-item-1`,
      `${orderId}-item-2`,
      `${orderId}-item-3`,
      `${orderId}-item-4`,
      `${orderId}-item-5`,
    ]);
    expect(order?.items[0].cancelledQty).toBe(1);
    expect(order?.items.slice(1).every((item) => item.cancelledQty === 0)).toBe(true);
  });

  it("expands partial bundle return into product units", () => {
    const state = createDemoState();
    const shipped = applyCommand(state, {
      type: "INJECT_EVENT",
      event: event(state, "ORDER_SHIPPED", "TT-260718-003"),
    });
    const returned = applyCommand(shipped.state, {
      type: "INJECT_EVENT",
      event: event(shipped.state, "RETURN_REQUESTED", "TT-260718-003", {
        itemId: "TT-260718-003-item-1",
        qty: 1,
      }),
    });
    const returnCase = returned.state.returns.find(
      (item) => item.id === returned.result.entityId,
    );

    expect(returnCase?.items.map((item) => item.productId)).toEqual([
      "p-serum",
      "p-toner",
      "p-moisturizer",
    ]);
  });

  it("restocks sellable return into a new return batch", () => {
    const state = createDemoState();
    const before = productOnHand(state, "p-sunscreen");
    const result = applyCommand(state, {
      type: "INSPECT_RETURN",
      returnId: "RET-SHP-260713-02",
      returnItemId: "RET-SHP-260713-02-item-1",
      condition: "SELLABLE",
      note: "Kemasan utuh dan expiry terbaca",
      expiryDate: "2027-02-01",
      batchCode: "RET-TEST-SELLABLE",
    });

    expect(result.result.ok).toBe(true);
    expect(result.state.batches.find((batch) => batch.code === "RET-TEST-SELLABLE")?.origin).toBe("RETURN");
    expect(productOnHand(result.state, "p-sunscreen")).toBe(before + 1);
    expect(result.state.ledgerEntries[0].reason).toBe("RETURN_RESTOCK");
  });

  it("records damaged and lost returns as claims without second ledger movement", () => {
    const state = createDemoState();
    const before = state.ledgerEntries.length;
    const damaged = applyCommand(state, {
      type: "INSPECT_RETURN",
      returnId: "RET-SHP-BUNDLE-01",
      returnItemId: "RET-SHP-BUNDLE-01-item-1",
      condition: "DAMAGED",
      note: "Botol pecah",
    });
    const lost = applyCommand(damaged.state, {
      type: "INSPECT_RETURN",
      returnId: "RET-SHP-BUNDLE-01",
      returnItemId: "RET-SHP-BUNDLE-01-item-2",
      condition: "LOST",
      note: "Tidak ditemukan di paket retur",
    });

    expect(lost.state.ledgerEntries).toHaveLength(before);
    expect(lost.state.returnClaims.slice(0, 2).map((claim) => claim.condition)).toEqual([
      "LOST",
      "DAMAGED",
    ]);
  });

  it("creates linked manual correction instead of editing original", () => {
    const state = createDemoState();
    const original = state.ledgerEntries.find((entry) => entry.id === "led-bonus-missing-ref")!;
    const originalDelta = original.qtyDelta;
    const result = applyCommand(state, {
      type: "CORRECT_ENTRY",
      entryId: original.id,
      note: "Qty bonus salah input",
    });
    const reversal = result.state.ledgerEntries[0];
    const updatedOriginal = result.state.ledgerEntries.find((entry) => entry.id === original.id);

    expect(reversal.reason).toBe("MANUAL_ENTRY_CORRECTION");
    expect(reversal.qtyDelta).toBe(-originalDelta);
    expect(reversal.reversesEntryId).toBe(original.id);
    expect(updatedOriginal?.reversedByEntryId).toBe(reversal.id);
  });

  it("creates a new opname session while another draft is active", () => {
    const state = createDemoState();
    const existingId = state.opnameSessions[0].id;
    const created = applyCommand(state, { type: "CREATE_OPNAME" });

    expect(created.result.ok).toBe(true);
    expect(created.result.entityId).not.toBe(existingId);
    expect(created.state.opnameSessions).toHaveLength(2);
    expect(created.state.opnameSessions.every((session) => session.status === "DRAFT")).toBe(true);
  });

  it("finalizes opname once and verifies opening balance", () => {
    let state = createDemoState();
    const session = state.opnameSessions[0];
    for (const count of session.counts) {
      state = applyCommand(state, {
        type: "SAVE_OPNAME_COUNT",
        sessionId: session.id,
        batchId: count.batchId,
        physicalQty: count.systemQty,
      }).state;
    }
    const finalized = applyCommand(state, {
      type: "FINALIZE_OPNAME",
      sessionId: session.id,
    });
    const secondFinalize = applyCommand(finalized.state, {
      type: "FINALIZE_OPNAME",
      sessionId: session.id,
    });

    expect(finalized.result.ok).toBe(true);
    expect(finalized.state.opnameSessions[0].status).toBe("FINALIZED");
    expect(finalized.state.batches.find((batch) => batch.id === "b-serum-opening")?.verificationStatus).toBe("VERIFIED");
    expect(secondFinalize.result.ok).toBe(false);
  });
});
