import { addDays, deriveAnomalies, deriveNotifications, rebuildSummary } from "./engine";
import type {
  Batch,
  BundleRecipeVersion,
  DemoState,
  LedgerEntry,
  Order,
  Product,
  ReturnCase,
  ReturnClaim,
} from "./types";

export const DEMO_NOW = "2026-07-18T09:30:00.000Z";

const products: Product[] = [
  { id: "p-serum", sku: "SKU-SG-30", name: "Serum Glow 30ml", brandLine: "Aura Hydrogel" },
  { id: "p-toner", sku: "SKU-TC-100", name: "Toner Calming 100ml", brandLine: "Aura Calm" },
  { id: "p-sunscreen", sku: "SKU-SS-50T", name: "Sunscreen SPF50 Travel", brandLine: "Aura Shield" },
  { id: "p-cleanser", sku: "SKU-CG-150", name: "Cleanser Gentle Foam", brandLine: "Aura Pure" },
  { id: "p-moisturizer", sku: "SKU-MN-50", name: "Moisturizer Night 50ml", brandLine: "Aura Hydrogel" },
  { id: "p-sample", sku: "SKU-ST-5", name: "Sampel Serum Trial 5ml", brandLine: "Aura Hydrogel" },
  { id: "p-ampoule", sku: "SKU-BST-31", name: "Boost-8 Ampoule", brandLine: "Aura Clinical" },
  { id: "p-coffee", sku: "SKU-CF-88", name: "Coffee (L) New", brandLine: "Aura Body" },
  { id: "p-bundle-glow", sku: "SKU-BGS-01", name: "Bundle Glow Set", isBundle: true },
];

const batches: Batch[] = [
  {
    id: "b-serum-opening",
    code: "SG-OPEN-01",
    productId: "p-serum",
    expiryDate: "2026-08-06",
    origin: "OPENING",
    verificationStatus: "UNVERIFIED",
    createdAt: addDays(DEMO_NOW, -45),
    sellable: true,
  },
  {
    id: "b-serum-02",
    code: "SG-2606-02",
    productId: "p-serum",
    expiryDate: "2027-02-18",
    origin: "MAKLON",
    verificationStatus: "VERIFIED",
    createdAt: addDays(DEMO_NOW, -25),
    sellable: true,
  },
  {
    id: "b-toner-01",
    code: "TC-2605-01",
    productId: "p-toner",
    expiryDate: "2026-07-28",
    origin: "MAKLON",
    verificationStatus: "VERIFIED",
    createdAt: addDays(DEMO_NOW, -35),
    sellable: true,
  },
  {
    id: "b-sunscreen-01",
    code: "SS-2606-01",
    productId: "p-sunscreen",
    expiryDate: "2026-10-14",
    origin: "MAKLON",
    verificationStatus: "VERIFIED",
    createdAt: addDays(DEMO_NOW, -20),
    sellable: true,
  },
  {
    id: "b-cleanser-expired",
    code: "CG-2512-03",
    productId: "p-cleanser",
    expiryDate: "2026-07-04",
    origin: "MAKLON",
    verificationStatus: "VERIFIED",
    createdAt: addDays(DEMO_NOW, -120),
    sellable: true,
  },
  {
    id: "b-moisturizer-01",
    code: "MN-2605-01",
    productId: "p-moisturizer",
    expiryDate: "2027-01-09",
    origin: "MAKLON",
    verificationStatus: "VERIFIED",
    createdAt: addDays(DEMO_NOW, -30),
    sellable: true,
  },
  {
    id: "b-sample-01",
    code: "ST-2606-01",
    productId: "p-sample",
    expiryDate: "2027-03-30",
    origin: "MAKLON",
    verificationStatus: "VERIFIED",
    createdAt: addDays(DEMO_NOW, -15),
    sellable: true,
  },
  {
    id: "b-ampoule-01",
    code: "BST-31",
    productId: "p-ampoule",
    expiryDate: "2026-08-01",
    origin: "MAKLON",
    verificationStatus: "VERIFIED",
    createdAt: addDays(DEMO_NOW, -80),
    sellable: true,
  },
  {
    id: "b-coffee-01",
    code: "CF-88",
    productId: "p-coffee",
    expiryDate: "2027-05-16",
    origin: "MAKLON",
    verificationStatus: "VERIFIED",
    createdAt: addDays(DEMO_NOW, -50),
    sellable: true,
  },
];

function createLedger(): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  const balances: Record<string, number> = {};
  function add(
    entry: Omit<LedgerEntry, "balanceAfter" | "actor">,
  ) {
    balances[entry.batchId] = (balances[entry.batchId] ?? 0) + entry.qtyDelta;
    entries.push({ ...entry, actor: "Rara Admin", balanceAfter: balances[entry.batchId] });
  }

  add({
    id: "led-opening-serum",
    createdAt: addDays(DEMO_NOW, -45),
    productId: "p-serum",
    batchId: "b-serum-opening",
    qtyDelta: 120,
    reason: "OPENING_BALANCE",
    channel: "INTERNAL",
    referenceType: "OPENING",
    referenceId: "OPEN-260601-01",
    referenceNote: "Saldo awal migrasi spreadsheet",
    verificationStatus: "UNVERIFIED",
  });
  const incoming: Array<[string, string, string, number, number]> = [
    ["led-in-serum", "p-serum", "b-serum-02", 220, -25],
    ["led-in-toner", "p-toner", "b-toner-01", 90, -35],
    ["led-in-sunscreen", "p-sunscreen", "b-sunscreen-01", 75, -20],
    ["led-in-cleanser", "p-cleanser", "b-cleanser-expired", 36, -120],
    ["led-in-moist", "p-moisturizer", "b-moisturizer-01", 80, -30],
    ["led-in-sample", "p-sample", "b-sample-01", 240, -15],
    ["led-in-ampoule", "p-ampoule", "b-ampoule-01", 64, -80],
    ["led-in-coffee", "p-coffee", "b-coffee-01", 100, -50],
  ];
  for (const [id, productId, batchId, qtyDelta, days] of incoming) {
    add({
      id,
      createdAt: addDays(DEMO_NOW, days),
      productId,
      batchId,
      qtyDelta,
      reason: "INCOMING_MAKLON",
      channel: "INTERNAL",
      referenceType: "MAKLON",
      referenceId: `PO-${id.toUpperCase()}`,
      referenceNote: "Surat jalan maklon terverifikasi",
      verificationStatus: "VERIFIED",
    });
  }
  add({
    id: "led-bonus-missing-ref",
    createdAt: addDays(DEMO_NOW, -4),
    productId: "p-sample",
    batchId: "b-sample-01",
    qtyDelta: -5,
    reason: "BONUS",
    channel: "INTERNAL",
    referenceType: "MANUAL",
    referenceId: "MAN-260714-01",
  });
  add({
    id: "led-ship-serum",
    createdAt: addDays(DEMO_NOW, -2),
    productId: "p-serum",
    batchId: "b-serum-opening",
    qtyDelta: -2,
    reason: "OFFLINE",
    channel: "SHOPEE",
    referenceType: "ORDER",
    referenceId: "SHP-260716-001",
    referenceNote: "Shipment SHOPEE",
    allocationGroupId: "alloc-seed-1",
  });
  add({
    id: "led-bundle-serum",
    createdAt: addDays(DEMO_NOW, -8),
    productId: "p-serum",
    batchId: "b-serum-opening",
    qtyDelta: -1,
    reason: "OFFLINE",
    channel: "SHOPEE",
    referenceType: "ORDER",
    referenceId: "SHP-260710-007",
    referenceNote: "Bundle recipe v1",
    allocationGroupId: "alloc-seed-bundle",
  });
  add({
    id: "led-bundle-toner",
    createdAt: addDays(DEMO_NOW, -8),
    productId: "p-toner",
    batchId: "b-toner-01",
    qtyDelta: -1,
    reason: "OFFLINE",
    channel: "SHOPEE",
    referenceType: "ORDER",
    referenceId: "SHP-260710-007",
    referenceNote: "Bundle recipe v1",
    allocationGroupId: "alloc-seed-bundle",
  });
  add({
    id: "led-tiktok-coffee",
    createdAt: addDays(DEMO_NOW, -38),
    productId: "p-coffee",
    batchId: "b-coffee-01",
    qtyDelta: -1,
    reason: "OFFLINE",
    channel: "TIKTOK",
    referenceType: "ORDER",
    referenceId: "TT-260610-004",
    referenceNote: "Shipment TIKTOK",
    allocationGroupId: "alloc-seed-coffee",
  });
  add({
    id: "led-shopee-sunscreen",
    createdAt: addDays(DEMO_NOW, -6),
    productId: "p-sunscreen",
    batchId: "b-sunscreen-01",
    qtyDelta: -2,
    reason: "OFFLINE",
    channel: "SHOPEE",
    referenceType: "ORDER",
    referenceId: "SHP-260712-008",
    referenceNote: "Shipment SHOPEE",
    allocationGroupId: "alloc-seed-sun",
  });
  return entries.toReversed();
}

const recipes: BundleRecipeVersion[] = [
  {
    id: "recipe-glow-v2",
    bundleProductId: "p-bundle-glow",
    version: 2,
    effectiveAt: addDays(DEMO_NOW, -5),
    status: "ACTIVE",
    items: [
      { productId: "p-serum", qty: 1 },
      { productId: "p-toner", qty: 1 },
      { productId: "p-moisturizer", qty: 1 },
    ],
    createdBy: "Rara Admin",
  },
  {
    id: "recipe-glow-v1",
    bundleProductId: "p-bundle-glow",
    version: 1,
    effectiveAt: addDays(DEMO_NOW, -60),
    status: "ARCHIVED",
    items: [
      { productId: "p-serum", qty: 1 },
      { productId: "p-toner", qty: 1 },
    ],
    createdBy: "Rara Admin",
  },
];

const orders: Order[] = [
  {
    id: "SHP-260718-002",
    channel: "SHOPEE",
    status: "RESERVED",
    createdAt: addDays(DEMO_NOW, -1),
    updatedAt: addDays(DEMO_NOW, -1),
    sourceEventId: "evt-seed-reserved-shopee",
    allocations: [],
    items: [
      {
        id: "SHP-260718-002-item-1",
        productId: "p-serum",
        orderedQty: 3,
        reservedQty: 3,
        shippedQty: 0,
        cancelledQty: 0,
        returnedQty: 0,
      },
      {
        id: "SHP-260718-002-item-2",
        productId: "p-sunscreen",
        orderedQty: 1,
        reservedQty: 1,
        shippedQty: 0,
        cancelledQty: 0,
        returnedQty: 0,
      },
    ],
  },
  {
    id: "TT-260718-003",
    channel: "TIKTOK",
    status: "RESERVED",
    createdAt: addDays(DEMO_NOW, -1),
    updatedAt: addDays(DEMO_NOW, -1),
    sourceEventId: "evt-seed-reserved-tiktok",
    allocations: [],
    items: [
      {
        id: "TT-260718-003-item-1",
        productId: "p-bundle-glow",
        orderedQty: 1,
        reservedQty: 1,
        shippedQty: 0,
        cancelledQty: 0,
        returnedQty: 0,
        recipeVersionId: "recipe-glow-v2",
        componentSnapshot: recipes[0].items,
      },
    ],
  },
  {
    id: "SHP-260716-001",
    channel: "SHOPEE",
    status: "SHIPPED",
    createdAt: addDays(DEMO_NOW, -3),
    updatedAt: addDays(DEMO_NOW, -2),
    sourceEventId: "evt-seed-shipped-ok",
    items: [
      {
        id: "SHP-260716-001-item-1",
        productId: "p-serum",
        orderedQty: 2,
        reservedQty: 0,
        shippedQty: 2,
        cancelledQty: 0,
        returnedQty: 0,
      },
    ],
    allocations: [
      {
        id: "ship-seed-serum",
        orderItemId: "SHP-260716-001-item-1",
        productId: "p-serum",
        batchId: "b-serum-opening",
        qty: 2,
        ledgerEntryId: "led-ship-serum",
      },
    ],
  },
  {
    id: "TT-260716-009",
    channel: "TIKTOK",
    status: "IN_TRANSIT",
    createdAt: addDays(DEMO_NOW, -3),
    updatedAt: addDays(DEMO_NOW, -2),
    sourceEventId: "evt-seed-shipped-missing-ledger",
    items: [
      {
        id: "TT-260716-009-item-1",
        productId: "p-toner",
        orderedQty: 2,
        reservedQty: 0,
        shippedQty: 2,
        cancelledQty: 0,
        returnedQty: 0,
      },
    ],
    allocations: [],
  },
  {
    id: "SHP-260710-007",
    channel: "SHOPEE",
    status: "SHIPPED",
    createdAt: addDays(DEMO_NOW, -10),
    updatedAt: addDays(DEMO_NOW, -8),
    sourceEventId: "evt-seed-old-bundle",
    items: [
      {
        id: "SHP-260710-007-item-1",
        productId: "p-bundle-glow",
        orderedQty: 1,
        reservedQty: 0,
        shippedQty: 1,
        cancelledQty: 0,
        returnedQty: 1,
        recipeVersionId: "recipe-glow-v1",
        componentSnapshot: recipes[1].items,
      },
    ],
    allocations: [
      {
        id: "ship-seed-bundle-serum",
        orderItemId: "SHP-260710-007-item-1",
        productId: "p-serum",
        batchId: "b-serum-opening",
        qty: 1,
        ledgerEntryId: "led-bundle-serum",
      },
      {
        id: "ship-seed-bundle-toner",
        orderItemId: "SHP-260710-007-item-1",
        productId: "p-toner",
        batchId: "b-toner-01",
        qty: 1,
        ledgerEntryId: "led-bundle-toner",
      },
    ],
  },
  {
    id: "TT-260610-004",
    channel: "TIKTOK",
    status: "IN_TRANSIT",
    createdAt: addDays(DEMO_NOW, -40),
    updatedAt: addDays(DEMO_NOW, -38),
    sourceEventId: "evt-seed-tiktok-coffee",
    items: [
      {
        id: "TT-260610-004-item-1",
        productId: "p-coffee",
        orderedQty: 1,
        reservedQty: 0,
        shippedQty: 1,
        cancelledQty: 0,
        returnedQty: 1,
      },
    ],
    allocations: [
      {
        id: "ship-seed-coffee",
        orderItemId: "TT-260610-004-item-1",
        productId: "p-coffee",
        batchId: "b-coffee-01",
        qty: 1,
        ledgerEntryId: "led-tiktok-coffee",
      },
    ],
  },
  {
    id: "SHP-260712-008",
    channel: "SHOPEE",
    status: "SHIPPED",
    createdAt: addDays(DEMO_NOW, -8),
    updatedAt: addDays(DEMO_NOW, -6),
    sourceEventId: "evt-seed-shopee-sun",
    items: [
      {
        id: "SHP-260712-008-item-1",
        productId: "p-sunscreen",
        orderedQty: 2,
        reservedQty: 0,
        shippedQty: 2,
        cancelledQty: 0,
        returnedQty: 1,
      },
    ],
    allocations: [
      {
        id: "ship-seed-sun",
        orderItemId: "SHP-260712-008-item-1",
        productId: "p-sunscreen",
        batchId: "b-sunscreen-01",
        qty: 2,
        ledgerEntryId: "led-shopee-sunscreen",
      },
    ],
  },
];

const returns: ReturnCase[] = [
  {
    id: "RET-TT-260611-01",
    orderId: "TT-260610-004",
    channel: "TIKTOK",
    createdAt: addDays(DEMO_NOW, -37),
    receivedAt: addDays(DEMO_NOW, -2),
    inspectionStatus: "PENDING",
    items: [
      {
        id: "RET-TT-260611-01-item-1",
        orderItemId: "TT-260610-004-item-1",
        productId: "p-coffee",
        qty: 1,
      },
    ],
  },
  {
    id: "RET-SHP-260713-02",
    orderId: "SHP-260712-008",
    channel: "SHOPEE",
    createdAt: addDays(DEMO_NOW, -5),
    receivedAt: addDays(DEMO_NOW, -1),
    inspectionStatus: "PENDING",
    items: [
      {
        id: "RET-SHP-260713-02-item-1",
        orderItemId: "SHP-260712-008-item-1",
        productId: "p-sunscreen",
        qty: 1,
      },
    ],
  },
  {
    id: "RET-SHP-BUNDLE-01",
    orderId: "SHP-260710-007",
    channel: "SHOPEE",
    createdAt: addDays(DEMO_NOW, -6),
    receivedAt: addDays(DEMO_NOW, -1),
    inspectionStatus: "PENDING",
    items: [
      {
        id: "RET-SHP-BUNDLE-01-item-1",
        orderItemId: "SHP-260710-007-item-1",
        productId: "p-serum",
        qty: 1,
      },
      {
        id: "RET-SHP-BUNDLE-01-item-2",
        orderItemId: "SHP-260710-007-item-1",
        productId: "p-toner",
        qty: 1,
      },
    ],
  },
];

const returnClaims: ReturnClaim[] = [
  {
    id: "claim-history-01",
    returnId: "RET-HISTORY-01",
    returnItemId: "RET-HISTORY-01-item-1",
    condition: "DAMAGED",
    status: "RESOLVED",
    deadline: addDays(DEMO_NOW, -8),
    evidenceReference: "DRV/claim-history-01",
    note: "Kemasan pecah saat transit",
    filedAt: addDays(DEMO_NOW, -15),
    resolvedAt: addDays(DEMO_NOW, -9),
    resolution: "Klaim diterima marketplace",
  },
];

export function createDemoState(): DemoState {
  const ledgerEntries = createLedger();
  const state: DemoState = {
    demoNow: DEMO_NOW,
    actor: "Rara Admin",
    products: structuredClone(products),
    batches: structuredClone(batches),
    balanceSummary: rebuildSummary(ledgerEntries),
    ledgerEntries,
    orders: structuredClone(orders),
    returns: structuredClone(returns),
    returnClaims: structuredClone(returnClaims),
    bundleRecipes: structuredClone(recipes),
    opnameSessions: [],
    anomalies: [],
    notifications: [],
    processedEventKeys: orders.map((order) => order.sourceEventId),
    lastReconciledAt: addDays(DEMO_NOW, -1),
    nextSequence: 1000,
    failNextOperation: false,
  };
  state.opnameSessions.push({
    id: "OPN-260718-01",
    warehouse: "Gudang Utama",
    status: "DRAFT",
    startedAt: addDays(DEMO_NOW, -0.05),
    createdBy: state.actor,
    counts: state.batches.map((batch, index) => ({
      batchId: batch.id,
      systemQty: state.balanceSummary[batch.id]?.qtyOnHand ?? 0,
      physicalQty: index < 3 ? state.balanceSummary[batch.id]?.qtyOnHand ?? 0 : undefined,
    })),
    correctionEntryIds: [],
  });
  state.anomalies = deriveAnomalies(state);
  state.notifications = deriveNotifications(state);
  return state;
}
