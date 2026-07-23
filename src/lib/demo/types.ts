export const REASONS = [
  "OFFLINE",
  "BONUS",
  "PROMO",
  "SAMPLE",
  "DAMAGED",
  "EXPIRED",
  "RETURN_RESTOCK",
  "CANCELLATION_REVERSAL",
  "OPNAME_CORRECTION",
  "MANUAL_ENTRY_CORRECTION",
  "OPENING_BALANCE",
  "INCOMING_MAKLON",
] as const;

export type Reason = (typeof REASONS)[number];

export const CHANNELS = ["OFFLINE", "SHOPEE", "TIKTOK", "INTERNAL"] as const;
export type Channel = (typeof CHANNELS)[number];

export interface Product {
  id: string;
  sku: string;
  name: string;
  brandLine?: string;
  isBundle?: boolean;
}

export type BatchOrigin = "MAKLON" | "OPENING" | "RETURN";
export type VerificationStatus = "VERIFIED" | "UNVERIFIED";

export interface Batch {
  id: string;
  code: string;
  productId: string;
  expiryDate: string;
  origin: BatchOrigin;
  verificationStatus: VerificationStatus;
  verifiedBySessionId?: string;
  createdAt: string;
  sellable: boolean;
}

export type ReferenceType =
  | "ORDER"
  | "RETURN"
  | "CLAIM"
  | "OPNAME"
  | "MANUAL"
  | "MAKLON"
  | "OPENING"
  | "CORRECTION";

export interface LedgerEntry {
  id: string;
  createdAt: string;
  productId: string;
  batchId: string;
  qtyDelta: number;
  reason: Reason;
  channel: Channel;
  referenceType: ReferenceType;
  referenceId: string;
  referenceNote?: string;
  actor: string;
  balanceAfter: number;
  allocationGroupId?: string;
  reversesEntryId?: string;
  reversedByEntryId?: string;
  verificationStatus?: VerificationStatus;
}

export interface BalanceSummary {
  batchId: string;
  qtyOnHand: number;
  ledgerEntryId: string;
  updatedAt: string;
}

export interface RecipeComponent {
  productId: string;
  qty: number;
}

export interface BundleRecipeVersion {
  id: string;
  bundleProductId: string;
  version: number;
  effectiveAt: string;
  status: "ACTIVE" | "ARCHIVED";
  items: RecipeComponent[];
  createdBy: string;
}

export interface OrderItem {
  id: string;
  productId: string;
  orderedQty: number;
  reservedQty: number;
  shippedQty: number;
  cancelledQty: number;
  returnedQty: number;
  recipeVersionId?: string;
  componentSnapshot?: RecipeComponent[];
}

export type OrderStatus =
  | "RESERVED"
  | "SHIPPED"
  | "IN_TRANSIT"
  | "PARTIALLY_CANCELLED"
  | "CANCELLED";

export interface ShipmentAllocation {
  id: string;
  orderItemId: string;
  productId: string;
  batchId: string;
  qty: number;
  ledgerEntryId?: string;
}

export interface Order {
  id: string;
  channel: "SHOPEE" | "TIKTOK";
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
  allocations: ShipmentAllocation[];
  sourceEventId: string;
}

export type ReturnCondition = "SELLABLE" | "DAMAGED" | "LOST";
export type InspectionStatus = "PENDING" | "COMPLETED";

export interface ReturnItem {
  id: string;
  orderItemId: string;
  productId: string;
  qty: number;
  condition?: ReturnCondition;
  inspectionNote?: string;
  newBatchId?: string;
  claimId?: string;
}

export interface ReturnCase {
  id: string;
  orderId: string;
  channel: "SHOPEE" | "TIKTOK";
  createdAt: string;
  receivedAt?: string;
  inspectionStatus: InspectionStatus;
  items: ReturnItem[];
}

export type ClaimStatus = "OPEN" | "FILED" | "RESOLVED" | "REJECTED";

export interface ReturnClaim {
  id: string;
  returnId: string;
  returnItemId: string;
  condition: "DAMAGED" | "LOST";
  status: ClaimStatus;
  deadline?: string;
  evidenceReference?: string;
  note: string;
  filedAt?: string;
  resolvedAt?: string;
  resolution?: string;
}

export interface OpnameCount {
  batchId: string;
  systemQty: number;
  physicalQty?: number;
  exceptionReason?: string;
}

export interface OpnameSession {
  id: string;
  warehouse: string;
  status: "DRAFT" | "FINALIZED";
  startedAt: string;
  finalizedAt?: string;
  createdBy: string;
  counts: OpnameCount[];
  correctionEntryIds: string[];
}

export type AnomalyPriority = "KRITIS" | "PERINGATAN";

export interface Anomaly {
  id: string;
  priority: AnomalyPriority;
  type:
    | "NEGATIVE_STOCK"
    | "MISSING_SHIPMENT_LEDGER"
    | "CLAIM_DEADLINE"
    | "EXPIRY"
    | "MISSING_REFERENCE";
  title: string;
  description: string;
  referenceLabel: string;
  target: string;
  source: string;
  status: "OPEN" | "RESOLVED";
}

export interface Notification {
  id: string;
  type: "EXPIRY" | "TIKTOK_CLAIM";
  title: string;
  description: string;
  createdAt: string;
  target: string;
  readAt?: string;
}

export type ImportEventType =
  | "ORDER_CREATED"
  | "ORDER_SHIPPED"
  | "ORDER_CANCELLED"
  | "RETURN_REQUESTED"
  | "STOCK_RECEIVED";

export interface ImportEvent {
  id: string;
  idempotencyKey: string;
  source: "SIMULATOR" | "CSV" | "WEBHOOK";
  channel: Channel;
  orderId: string;
  occurredAt: string;
  type: ImportEventType;
  payload: Record<string, unknown>;
}

export interface DemoState {
  demoNow: string;
  actor: string;
  products: Product[];
  batches: Batch[];
  balanceSummary: Record<string, BalanceSummary>;
  ledgerEntries: LedgerEntry[];
  orders: Order[];
  returns: ReturnCase[];
  returnClaims: ReturnClaim[];
  bundleRecipes: BundleRecipeVersion[];
  opnameSessions: OpnameSession[];
  anomalies: Anomaly[];
  notifications: Notification[];
  processedEventKeys: string[];
  lastReconciledAt: string;
  nextSequence: number;
  failNextOperation: boolean;
}

export interface FefoAllocation {
  batchId: string;
  batchCode: string;
  expiryDate: string;
  qty: number;
  availableBefore: number;
}

export interface CommandResult {
  ok: boolean;
  status: "PROCESSED" | "DUPLICATE" | "REJECTED";
  title: string;
  description: string;
  entityId?: string;
  ledgerEntryIds?: string[];
}

export type DemoCommand =
  | {
      type: "MANUAL_STOCK_OUT";
      productId: string;
      qty: number;
      reason: Extract<Reason, "OFFLINE" | "BONUS" | "PROMO" | "SAMPLE" | "DAMAGED" | "EXPIRED">;
      channel: Channel;
      referenceNote?: string;
    }
  | {
      type: "RECEIVE_STOCK";
      mode: "MAKLON" | "OPENING";
      productId: string;
      batchCode: string;
      qty: number;
      expiryDate: string;
      reference: string;
    }
  | { type: "INJECT_EVENT"; event: ImportEvent }
  | {
      type: "INSPECT_RETURN";
      returnId: string;
      returnItemId: string;
      condition: ReturnCondition;
      note: string;
      expiryDate?: string;
      batchCode?: string;
      evidenceReference?: string;
    }
  | { type: "FILE_CLAIM"; claimId: string; evidenceReference: string }
  | { type: "RESOLVE_CLAIM"; claimId: string; resolution: string }
  | { type: "CORRECT_ENTRY"; entryId: string; note: string }
  | { type: "CREATE_OPNAME" }
  | {
      type: "SAVE_OPNAME_COUNT";
      sessionId: string;
      batchId: string;
      physicalQty?: number;
      exceptionReason?: string;
    }
  | { type: "FINALIZE_OPNAME"; sessionId: string }
  | {
      type: "CREATE_RECIPE_VERSION";
      bundleProductId: string;
      items: RecipeComponent[];
    }
  | { type: "RERUN_RECONCILIATION" }
  | { type: "MARK_NOTIFICATION_READ"; notificationId: string }
  | { type: "MARK_ALL_NOTIFICATIONS_READ" };
