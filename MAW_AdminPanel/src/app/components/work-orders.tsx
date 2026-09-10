import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from "react";
import { useSearchParams, useNavigate } from "react-router";
import { Search, Plus, Eye, Edit, ClipboardList, FileText, History as HistoryIcon, ListTodo, X, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, AlertCircle, AlertTriangle, Clock, Camera, Car, Truck, Building2, MapPin, Users, Check, CheckCircle2, Wrench, Save, CalendarClock, UserRound, Trash2, PackageSearch, Package, RefreshCw, Zap, Undo2, ArrowLeft, PhoneCall, Send, Download, SlidersHorizontal, Pencil, Calendar, User, Printer, Receipt, Upload, RotateCcw, Loader2 } from "lucide-react";
import { useLanguage } from "../contexts/language-context";
import { postApi, apiAssetUrl, apiRequest } from "../lib/api";
import { DesktopDatePicker } from "./ui/desktop-date-picker";
import { DesktopDateTimePicker } from "./ui/desktop-date-time-picker";
import { AdminSelect } from "./ui/admin-select";
import { AdminPagination } from "./ui/admin-pagination";
import type { StaffMember } from "./staff";
import { getSignedInAdmin, hasAdminPermission } from "../lib/admin-permissions";
import { WorkOrderQuotationDialog } from "./work-order-quotation-dialog";
import { DocumentItemCatalogSelect, type DocumentCatalogPart } from "./ui/document-item-catalog-select";
import { toast } from "sonner";
import { PageLoading } from "./ui/page-loading";

import { SortableHeader } from "./ui/sortable-header";

export function isRescueWorkOrder(wo?: { intakeType?: string; serviceType?: string; requestChannel?: string; reportedProblem?: string } | null) {
  if (!wo) return false;
  const intake = (wo.intakeType || "").toLowerCase();
  const channel = (wo.requestChannel || "").toLowerCase();
  const service = (wo.serviceType || "").toLowerCase();
  const problem = (wo.reportedProblem || "").toLowerCase();
  return (
    intake === "rescue" ||
    channel.includes("rescue") ||
    service.includes("rescue") ||
    service.includes("emergency") ||
    problem.startsWith("🚨") ||
    problem.includes("roadside rescue") ||
    problem.includes("emergency breakdown") ||
    problem.includes("道路救援") ||
    problem.includes("救援")
  );
}

type AssignedStaff = Pick<StaffMember, "id" | "name" | "role">;
type RelatedVehicle = { id: number; vehicleNo: string; relationship: string };
type WorkOrderPhoto = {
  id: number;
  category: string;
  caption: string;
  uploadedBy: string;
  customerVisible: boolean;
  takenAt: string | null;
  createdAt: string | null;
};

type WorkOrderPartOverviewItem = {
  inventoryPartId: number | null;
  code: string;
  description: string;
  uom: string;
  requiredQuantity: number;
  stockOnHand: number;
  shortageQuantity: number;
  orderedQuantity: number;
  receivedQuantity: number;
  outstandingOrderQuantity: number;
  projectedStock: number;
  availability: "ready" | "incoming" | "shortage";
  purchaseOrderNumbers: string[];
  isNewlyAdded?: boolean;
  isQtyIncreased?: boolean;
  originalQuotationQty?: number;
  inOriginalQuotation?: boolean;
};

type WorkOrderPartsOverview = {
  source: string;
  quotationNo: string | null;
  items: WorkOrderPartOverviewItem[];
  removedItems?: Array<{
    inventoryPartId: number | null;
    code: string;
    description: string;
    uom: string;
    originalQuantity: number;
    stockOnHand: number;
    isRemoved: boolean;
  }>;
  purchaseOrders: Array<{
    id: number;
    number: string;
    supplierName: string;
    status: string;
    estimatedArrivalDate: string;
    orderedQuantity: number;
    receivedQuantity: number;
  }>;
  summary: {
    totalItems: number;
    readyItems: number;
    incomingItems: number;
    shortageItems: number;
    canStartRepair: boolean;
  };
};

type InspectionPartRequirement = { id?: number; partId: number | null; code: string; description: string; uom: string; quantity: number; unitPrice: number };
const blankInspectionPart = (): InspectionPartRequirement => ({ partId: null, code: "", description: "", uom: "", quantity: 1, unitPrice: 0 });

const INSPECTION_SYSTEMS = [
  "Brakes & Pneumatics",
  "Engine & Cooling",
  "Hydraulics & Crane",
  "Transmission & Axles",
  "Suspension & Steering",
  "Electrical & Lighting",
  "Chassis & Trailer",
  "Periodic PMS",
] as const;

const INSPECTION_DEFECT_TAGS = [
  "Normal Wear & Tear",
  "Air / Fluid Leakage",
  "Component Cracked",
  "Brake Lining Worn",
  "Electrical Fault",
  "Requires Replacement",
  "Excessive Clearance / Play",
  "Hydraulic Pressure Drop",
  "Oil Seepage",
] as const;

const WORKSHOP_BAYS = [
  "Bay 1",
  "Bay 2",
  "Bay 3",
  "Bay 4",
  "Engine Bay",
  "Trailer Bay",
] as const;

async function loadWorkOrderPartsOverview(workOrderId: number): Promise<WorkOrderPartsOverview> {
  try {
    return await apiRequest<WorkOrderPartsOverview>(`admin-work-order-parts-overview&id=${workOrderId}`);
  } catch {
    type InventoryPart = { id: number; sku: string; name: string; stock: number; uom?: string };
    type Quote = { quotationNo?: string; items?: Array<{ type: string; code: string; description: string; quantity: number }> } | null;
    type PurchaseOrder = { id: number; internalRef: string; autocountPoNo: string; workOrderId: number | null; supplierName: string; status: string; estimatedArrivalDate: string; items: Array<{ partId: number | null; itemCode: string; description: string; uom: string; quantity: number; receivedQuantity: number }> };
    const [inventory, quotation, allOrders] = await Promise.all([
      apiRequest<InventoryPart[]>("admin-parts"),
      apiRequest<Quote>(`admin-get-work-order-quotation&id=${workOrderId}`),
      apiRequest<PurchaseOrder[]>("admin-purchase-orders"),
    ]);
    const inventoryByCode = new Map(inventory.map((part) => [part.sku.trim().toUpperCase(), part]));
    const inventoryById = new Map(inventory.map((part) => [part.id, part]));
    const lines = new Map<string, { code: string; description: string; uom: string; required: number; ordered: number; received: number; purchaseOrders: Set<string> }>();
    const keyFor = (code: string, description: string) => code.trim() ? `code:${code.trim().toUpperCase()}` : `description:${description.trim().toUpperCase()}`;
    const lineFor = (code: string, description: string, uom = "") => {
      const key = keyFor(code, description);
      const existing = lines.get(key);
      if (existing) return existing;
      const created = { code: code.trim(), description: description.trim(), uom, required: 0, ordered: 0, received: 0, purchaseOrders: new Set<string>() };
      lines.set(key, created);
      return created;
    };
    quotation?.items?.filter((item) => item.type === "part").forEach((item) => { lineFor(item.code, item.description).required += Number(item.quantity || 0); });
    const purchaseOrders = allOrders.filter((order) => order.workOrderId === workOrderId && order.status !== "cancelled").map((order) => {
      const number = order.autocountPoNo || order.internalRef;
      order.items.forEach((item) => {
        const inventoryPart = item.partId ? inventoryById.get(item.partId) : undefined;
        const line = lineFor(item.itemCode || inventoryPart?.sku || "", item.description || inventoryPart?.name || "", item.uom || inventoryPart?.uom || "");
        line.ordered += Number(item.quantity || 0);
        line.received += Number(item.receivedQuantity || 0);
        line.purchaseOrders.add(number);
      });
      return { id: order.id, number, supplierName: order.supplierName, status: order.status, estimatedArrivalDate: order.estimatedArrivalDate, orderedQuantity: order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0), receivedQuantity: order.items.reduce((sum, item) => sum + Number(item.receivedQuantity || 0), 0) };
    });
    const items: WorkOrderPartOverviewItem[] = Array.from(lines.values()).map((line) => {
      const inventoryPart = inventoryByCode.get(line.code.toUpperCase());
      const requiredQuantity = line.required > 0 ? line.required : line.ordered;
      const stockOnHand = Number(inventoryPart?.stock || 0);
      const outstandingOrderQuantity = Math.max(0, line.ordered - line.received);
      const shortageQuantity = Math.max(0, requiredQuantity - stockOnHand);
      const availability: WorkOrderPartOverviewItem["availability"] = shortageQuantity <= 0 ? "ready" : stockOnHand + outstandingOrderQuantity >= requiredQuantity ? "incoming" : "shortage";
      return { inventoryPartId: inventoryPart?.id || null, code: line.code, description: line.description || inventoryPart?.name || "Unnamed part", uom: line.uom || inventoryPart?.uom || "", requiredQuantity, stockOnHand, shortageQuantity, orderedQuantity: line.ordered, receivedQuantity: line.received, outstandingOrderQuantity, projectedStock: stockOnHand + outstandingOrderQuantity, availability, purchaseOrderNumbers: Array.from(line.purchaseOrders) };
    }).sort((left, right) => ({ shortage: 0, incoming: 1, ready: 2 }[left.availability] - { shortage: 0, incoming: 1, ready: 2 }[right.availability]));
    const readyItems = items.filter((item) => item.availability === "ready").length;
    const incomingItems = items.filter((item) => item.availability === "incoming").length;
    const shortageItems = items.filter((item) => item.availability === "shortage").length;
    return { source: quotation ? "quotation_and_purchase_orders" : "purchase_orders", quotationNo: quotation?.quotationNo || null, items, purchaseOrders, summary: { totalItems: items.length, readyItems, incomingItems, shortageItems, canStartRepair: items.length === 0 || (incomingItems === 0 && shortageItems === 0) } };
  }
}

type WorkOrder = {
  id: number;
  workOrderNo: string;
  legacyStatus: number;
  canonicalStatus: string;
  vehicleId: number;
  vehicleNo: string;
  unitNo?: string;
  regNo?: string;
  brand: string;
  model: string;
  equipmentType: string;
  companyId: number;
  companyName: string;
  customerId: number | null;
  contactName: string;
  contactType: string;
  customerPhone: string;
  serviceType: string;
  serviceCentre: string;
  reportedProblem: string;
  actualIssue?: string | null;
  customerNotes: string;
  intakeType: string;
  requestChannel: string;
  broughtByDriverId: number | null;
  broughtByDriverName: string;
  foremanId: number | null;
  foremanName: string;
  checkinMileage: number | null;
  autocountJobNo: string;
  relatedVehicles: RelatedVehicle[];
  bay: string | null;
  priority: string;
  checkinAt: string | null;
  inspectedAt: string | null;
  quotationIssuedAt: string | null;
  approvedAt: string | null;
  partsReadyAt: string | null;
  partsStatus: string | null;
  partsExpectedDate: string | null;
  partsReference: string | null;
  partsNotes: string | null;
  partsStatusUpdatedAt: string | null;
  partsStatusUpdatedBy: number | null;
  partsAcknowledgedAt?: string | null;
  partsAcknowledgedBy?: number | null;
  hasUnacknowledgedParts?: boolean;
  underRepairAt: string | null;
  completedAt: string | null;
  collectedAt: string | null;
  estimatedOut: string | null;
  sourceBookingId: number | null;
  isBackOrder?: boolean;
  technicians: AssignedStaff[];
  photos: WorkOrderPhoto[];
  createdAt?: string | null;
  updatedAt?: string | null;
  notes?: string | null;
  poNumber?: string | null;
  mileage?: number | string | null;
};

type Company = {
  id: number;
  name: string;
  autocountDebtorCode?: string | null;
};

type Vehicle = {
  id: number;
  vecNo?: string;
  unitNo?: string;
  regNo: string;
  brand: string;
  model: string;
  equipment?: string;
  equipmentType?: string;
  companyId: number;
  mileage?: number | string | null;
  vehicleStatus?: string;
  verificationStatus?: string;
  activeWorkOrder?: {
    id: number;
    workOrderNo: string;
    canonicalStatus: string;
    statusLabel?: string;
    checkinAt?: string | null;
  } | null;
};

type Customer = {
  id: number;
  name: string;
  type: string;
  companyId: number;
};

const BAYS = ['Bay 1', 'Bay 2', 'Bay 3', 'Bay 4', 'Engine Bay', 'Trailer Bay'];
const PRIORITIES = ['Normal', 'High', 'Urgent'];
const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2 };
const PRIME_MOVER_COMMON_ISSUES = [
  "Wear and Tear",
  "Air Pressure",
  "Wiring",
  "Body Work",
  "Suspension",
  "Engine",
  "Gearbox",
];
const TRAILER_COMMON_ISSUES = [
  "Wear and Tear",
  "Brake and Suspension",
  "Body Work",
];
const COMMON_SERVICE_ISSUES = PRIME_MOVER_COMMON_ISSUES;

function isTrailerVehicle(v?: { equipment?: string; equipmentType?: string; brand?: string; model?: string } | null): boolean {
  if (!v) return false;
  const eq = `${v.equipment || ""} ${v.equipmentType || ""} ${v.brand || ""} ${v.model || ""}`.toLowerCase();
  return (
    eq.includes("trailer") ||
    eq.includes("chassis") ||
    eq.includes("skeletal") ||
    eq.includes("sidelifter") ||
    eq.includes("side loader") ||
    eq.includes("flatbed") ||
    eq.includes("curtain") ||
    eq.includes("lowbed") ||
    eq.includes("box trailer")
  );
}
const SERVICE_TYPES = [
  "Spare Part",
  "Repair",
  "Maintenance",
  "Rescue",
];
const REQUEST_CHANNELS = ['Customer App', 'Walk-in Desk', 'Rescue Hotline'];
const PARTS_STATUSES = [
  { value: "not_required", label: "Not Required" },
  { value: "pending_parts", label: "Pending Parts" },
  { value: "partially_arrived", label: "Partially Arrived" },
  { value: "parts_ready", label: "Parts Ready" },
] as const;

function calculatePartsStatus(overview: WorkOrderPartsOverview | null, fallback = "not_required", isBackOrder = false) {
  if (isBackOrder) return "parts_ready";
  if (!overview) return fallback;
  if (overview.summary.totalItems === 0) return "not_required";
  if (overview.summary.canStartRepair) return "parts_ready";
  if (overview.items.some((item) => item.receivedQuantity > 0)) return "partially_arrived";
  return "pending_parts";
}
const STATUSES = ['scheduled', 'checked_in', 'inspected', 'quotation_issued', 'approved', 'pending_parts', 'parts_ready', 'under_repair', 'ready_for_collection', 'collected'];
const WORK_ORDER_TRANSITIONS: Record<string, string[]> = {
  scheduled: ["checked_in"],
  checked_in: ["inspected"],
  inspected: [], // Next step requires reviewing and preparing quotation
  quotation_issued: [],
  approved: ["parts_ready", "pending_parts", "under_repair"],
  pending_parts: ["parts_ready"],
  parts_ready: ["under_repair"],
  under_repair: ["ready_for_collection"],
  ready_for_collection: ["collected"],
  collected: [],
};

const HEAD_MANAGER_LIFECYCLE_STATUSES = new Set([
  "checked_in", "inspected", "quotation_issued", "approved", "pending_parts", "parts_ready", "under_repair", "ready_for_collection", "collected",
]);
const TECHNICIAN_LIFECYCLE_STATUSES = new Set([
  "inspected", "under_repair", "ready_for_collection",
]);

const WORK_ORDER_STAGES = [
  { key: "scheduled", label: "Scheduled", optional: false },
  { key: "checked_in", label: "Checked In", optional: false },
  { key: "inspected", label: "Inspected", optional: false },
  { key: "quotation_issued", label: "Quotation Issued", optional: true },
  { key: "approved", label: "Approved", optional: false },
  { key: "parts_ready", label: "Parts Ready", optional: true },
  { key: "under_repair", label: "Under Repair", optional: false },
  { key: "ready_for_collection", label: "Ready for Collection", optional: false },
  { key: "collected", label: "Collected", optional: false },
] as const;

const QUOTATION_ACCESSIBLE_STATUSES = new Set([
  "inspected",
  "quotation_issued",
  "approved",
  "pending_parts",
  "parts_ready",
  "under_repair",
  "ready_for_collection",
  "collected",
]);

function shouldShowQuotationAction(wo?: WorkOrder | null): boolean {
  if (!wo) return false;
  return QUOTATION_ACCESSIBLE_STATUSES.has(wo.canonicalStatus);
}

type WorkOrderStage = (typeof WORK_ORDER_STAGES)[number];
type StageState = "completed" | "current" | "future" | "optional-history";

function getWorkOrderStageKey(status?: string | null): string {
  if (status === "pending_parts") return "parts_ready";
  return status || "scheduled";
}

function getWorkOrderStageIndex(status?: string | null): number {
  const key = getWorkOrderStageKey(status);
  const idx = WORK_ORDER_STAGES.findIndex((item) => item.key === key);
  return idx >= 0 ? idx : 0;
}

function getStageState(workOrder: WorkOrder, stage: WorkOrderStage, stageIndex: number): StageState {
  const currentKey = getWorkOrderStageKey(workOrder.canonicalStatus);
  const currentIndex = getWorkOrderStageIndex(workOrder.canonicalStatus);
  if (stage.key === currentKey) return "current";
  return stageIndex < currentIndex ? "completed" : "future";
}

function getStageTimestamp(workOrder: WorkOrder, stageKey: string) {
  const isPendingParts = workOrder.canonicalStatus === "pending_parts" || workOrder.partsStatus === "pending_parts";
  const partsTime = isPendingParts
    ? (workOrder.partsStatusUpdatedAt || workOrder.approvedAt || workOrder.updatedAt || null)
    : (workOrder.partsReadyAt || workOrder.partsStatusUpdatedAt || null);

  const timestamps: Record<string, string | null> = {
    scheduled: workOrder.createdAt || workOrder.checkinAt || null,
    checked_in: workOrder.checkinAt,
    inspected: workOrder.inspectedAt,
    quotation_issued: workOrder.quotationIssuedAt,
    approved: workOrder.approvedAt,
    parts_ready: partsTime,
    under_repair: workOrder.underRepairAt,
    ready_for_collection: workOrder.completedAt,
    collected: workOrder.collectedAt,
  };
  return timestamps[stageKey] || null;
}

function formatCreatedDateTime(value?: string | null) {
  if (!value) return "-";
  try {
    const date = new Date(value.includes("T") ? value : value.replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return value;
    const datePart = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
    const timePart = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(date);
    return `${datePart} · ${timePart}`;
  } catch {
    return value;
  }
}

function formatEtaDisplay(value?: string | null) {
  if (!value) return "No ETA";
  try {
    const date = new Date(value.includes("T") ? value : value.replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return value;
    const datePart = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
    }).format(date);
    const timePart = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(date);
    return `${datePart} · ${timePart}`;
  } catch {
    return value;
  }
}

function formatTimelineStageTime(value?: string | null) {
  if (!value) return { date: "—", time: "" };
  try {
    const date = new Date(value.includes("T") ? value : value.replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return { date: value, time: "" };
    const datePart = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
    const timePart = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(date);
    return { date: datePart, time: timePart };
  } catch {
    return { date: value, time: "" };
  }
}

function renderWorkOrderStatusPill(status: string) {
  const configs: Record<string, { label: string; bg: string; dot: string }> = {
    scheduled: { label: "Scheduled", bg: "bg-sky-50 text-sky-700 border-sky-200", dot: "bg-sky-500" },
    checked_in: { label: "Checked In", bg: "bg-slate-100 text-slate-700 border-slate-200", dot: "bg-slate-500" },
    inspected: { label: "Inspected", bg: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-500" },
    quotation_issued: { label: "Quotation Issued", bg: "bg-purple-50 text-purple-700 border-purple-200", dot: "bg-purple-500" },
    approved: { label: "Approved", bg: "bg-teal-50 text-teal-700 border-teal-200", dot: "bg-teal-500" },
    pending_parts: { label: "Pending Parts", bg: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500" },
    parts_ready: { label: "Parts Ready", bg: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
    under_repair: { label: "Under Repair", bg: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-500" },
    ready_for_collection: { label: "Ready for Collection", bg: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
    collected: { label: "Collected", bg: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-400" },
  };
  const c = configs[status] || { label: status, bg: "bg-slate-50 text-slate-700 border-slate-200", dot: "bg-slate-400" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full border ${c.bg}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

function formatStageTimestamp(value: string | null) {
  if (!value) return "";
  const date = new Date(value.includes("T") ? value : value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-MY", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getStageNodeClasses(state: StageState, isPendingPartsCurrent = false, isPartsReadyCurrent = false) {
  if (state === "current") {
    if (isPendingPartsCurrent) {
      return "maw-stage-current-node border-amber-400 bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-xs";
    }
    if (isPartsReadyCurrent) {
      return "maw-stage-current-node border-emerald-500 bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-xs";
    }
    return "maw-stage-current-node border-sky-400 bg-gradient-to-br from-sky-400 to-blue-600 text-white";
  }
  if (state === "completed") return "border-blue-700 bg-[#1d4f91] text-white shadow-[0_4px_10px_rgba(29,79,145,0.18)]";
  if (state === "optional-history") return "border-dashed border-amber-400 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-white text-slate-400 shadow-sm";
}

function getStageConnectorClasses(state: StageState) {
  if (state === "completed") return "bg-[#1d4f91]";
  if (state === "optional-history") return "bg-gradient-to-r from-amber-300 to-blue-700";
  return "bg-slate-200";
}

function getPartsStatusConfig(status: string | null | undefined, isBackOrder = false) {
  if (isBackOrder) {
    return {
      label: "Parts: Ready (Back Order)",
      className: "border-purple-200 bg-purple-50 text-purple-700"
    };
  }
  const configs: Record<string, { label: string; className: string }> = {
    not_required: { label: "Parts: Not Required", className: "border-slate-200 bg-slate-50 text-slate-600" },
    pending_parts: { label: "Parts: Pending", className: "border-amber-200 bg-amber-50 text-amber-700" },
    partially_arrived: { label: "Parts: Partially Arrived", className: "border-amber-200 bg-amber-50 text-amber-700" },
    parts_ready: { label: "Parts: Ready", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  };
  const item = configs[status || ""] || { label: "Parts: Not Set", className: "border-slate-200 bg-slate-50 text-slate-600" };
  return item;
}

type ActiveDateGroup = "overdue" | "today" | "upcoming" | "no_eta";

function getActiveDateGroup(workOrder: WorkOrder): ActiveDateGroup {
  if (!workOrder.estimatedOut) return "no_eta";
  const dateKey = workOrder.estimatedOut.slice(0, 10);
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (dateKey < todayKey) return "overdue";
  if (dateKey === todayKey) return "today";
  return "upcoming";
}

function getActiveDateBadge(group: ActiveDateGroup) {
  const badges: Record<ActiveDateGroup, { label: string; className: string }> = {
    overdue: { label: "Overdue", className: "border-rose-200 bg-rose-50 text-rose-700" },
    today: { label: "Today", className: "border-teal-200 bg-teal-50 text-teal-700" },
    upcoming: { label: "Upcoming", className: "border-sky-200 bg-sky-50 text-sky-700" },
    no_eta: { label: "No ETA", className: "border-slate-200 bg-slate-50 text-slate-500" },
  };
  return badges[group];
}

function getVehicleWorkshopStatus(
  v?: Vehicle | null,
  activeWorkOrders?: WorkOrder[]
): { isUnderMaintenance: boolean; workOrderNo?: string; statusLabel?: string } {
  if (!v) return { isUnderMaintenance: false };
  if (v.activeWorkOrder) {
    return {
      isUnderMaintenance: true,
      workOrderNo: v.activeWorkOrder.workOrderNo,
      statusLabel: v.activeWorkOrder.statusLabel || v.activeWorkOrder.canonicalStatus?.replace(/_/g, " ") || "In Workshop",
    };
  }
  if (v.vehicleStatus === "Under Maintenance") {
    const matched = activeWorkOrders?.find(
      (wo) => wo.vehicleId === v.id && wo.canonicalStatus !== "collected" && wo.canonicalStatus !== "cancelled" && wo.canonicalStatus !== "scheduled"
    );
    return {
      isUnderMaintenance: true,
      workOrderNo: matched?.workOrderNo,
      statusLabel: matched ? matched.canonicalStatus.replace(/_/g, " ") : "Under Maintenance",
    };
  }
  if (activeWorkOrders && activeWorkOrders.length > 0) {
    const matched = activeWorkOrders.find(
      (wo) => wo.vehicleId === v.id && wo.canonicalStatus !== "collected" && wo.canonicalStatus !== "cancelled" && wo.canonicalStatus !== "scheduled"
    );
    if (matched) {
      return {
        isUnderMaintenance: true,
        workOrderNo: matched.workOrderNo,
        statusLabel: matched.canonicalStatus.replace(/_/g, " "),
      };
    }
  }
  return { isUnderMaintenance: false };
}

function SearchableVehicleSelect({
  vehicles,
  companies,
  value,
  onChange,
  selectedCompanyId,
  placeholder,
  workOrders,
}: {
  vehicles: Vehicle[];
  companies: { id: number; name: string }[];
  value: number | "";
  onChange: (vehicleId: number | "") => void;
  selectedCompanyId?: number | "";
  placeholder?: string;
  workOrders?: WorkOrder[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("available");
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedVehicle = useMemo(
    () => (value ? vehicles.find((v) => v.id === value) : null),
    [value, vehicles],
  );

  const selectedCompany = useMemo(
    () => (selectedVehicle?.companyId ? companies.find((c) => c.id === selectedVehicle.companyId) : null),
    [selectedVehicle, companies],
  );

  const lockedCompany = useMemo(
    () => (selectedCompanyId ? companies.find((c) => c.id === selectedCompanyId) : null),
    [selectedCompanyId, companies],
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Split vehicles into available vs in-workshop (deducting occupied ones)
  const { availableVehicles, inWorkshopVehicles, statusMap } = useMemo(() => {
    const map = new Map<number, { isUnderMaintenance: boolean; workOrderNo?: string; statusLabel?: string }>();
    const avail: Vehicle[] = [];
    const inShop: Vehicle[] = [];

    vehicles.forEach((v) => {
      const status = getVehicleWorkshopStatus(v, workOrders);
      map.set(v.id, status);
      if (status.isUnderMaintenance) {
        inShop.push(v);
      } else if (v.vehicleStatus !== "Inactive" && v.vehicleStatus !== "Out of Service" && v.vehicleStatus !== "Disposed") {
        avail.push(v);
      }
    });

    return { availableVehicles: avail, inWorkshopVehicles: inShop, statusMap: map };
  }, [vehicles, workOrders]);

  // Category counts for filter pills (strictly aligned with the system's 4 official equipment types: Prime Mover, Trailers/Chassis, Side Loader, Other)
  const categories = useMemo(() => {
    const counts: Record<string, number> = { available: availableVehicles.length };
    availableVehicles.forEach((v) => {
      const eq = `${v.equipment || ""} ${v.equipmentType || ""}`.toLowerCase();
      let key = "other";
      if (eq.includes("prime") || eq.includes("mover") || eq.includes("head") || eq.includes("tractor")) {
        key = "prime_mover";
      } else if (eq.includes("sidelifter") || eq.includes("side loader")) {
        key = "sidelifter";
      } else if (eq.includes("trailer") || eq.includes("chassis") || eq.includes("skeletal") || eq.includes("lowbed")) {
        key = "trailer";
      }
      counts[key] = (counts[key] || 0) + 1;
    });

    return [
      { id: "available", label: "Available Vehicles", count: counts.available || 0 },
      ...(counts.prime_mover ? [{ id: "prime_mover", label: "Prime Movers", count: counts.prime_mover }] : []),
      ...(counts.trailer ? [{ id: "trailer", label: "Trailers / Chassis", count: counts.trailer }] : []),
      ...(counts.sidelifter ? [{ id: "sidelifter", label: "Side Lifters", count: counts.sidelifter }] : []),
      ...(counts.other ? [{ id: "other", label: "Other", count: counts.other }] : []),
      ...(inWorkshopVehicles.length > 0
        ? [{ id: "in_workshop", label: "In Workshop", count: inWorkshopVehicles.length, isWarning: true }]
        : []),
    ];
  }, [availableVehicles, inWorkshopVehicles]);

  // Relevance weighted search algorithm for commercial fleets
  const filtered = useMemo(() => {
    let pool: Vehicle[];

    if (categoryFilter === "in_workshop") {
      pool = inWorkshopVehicles;
    } else if (categoryFilter === "prime_mover") {
      pool = availableVehicles.filter((v) => {
        const eq = `${v.equipment || ""} ${v.equipmentType || ""}`.toLowerCase();
        return eq.includes("prime") || eq.includes("mover") || eq.includes("head") || eq.includes("tractor");
      });
    } else if (categoryFilter === "trailer") {
      pool = availableVehicles.filter((v) => {
        const eq = `${v.equipment || ""} ${v.equipmentType || ""}`.toLowerCase();
        return eq.includes("trailer") || eq.includes("chassis") || eq.includes("skeletal") || eq.includes("lowbed");
      });
    } else if (categoryFilter === "sidelifter") {
      pool = availableVehicles.filter((v) => {
        const eq = `${v.equipment || ""} ${v.equipmentType || ""}`.toLowerCase();
        return eq.includes("sidelifter") || eq.includes("side loader");
      });
    } else if (categoryFilter === "other") {
      pool = availableVehicles.filter((v) => {
        const eq = `${v.equipment || ""} ${v.equipmentType || ""}`.toLowerCase();
        const isPrime = eq.includes("prime") || eq.includes("mover") || eq.includes("head") || eq.includes("tractor");
        const isTrailer = eq.includes("trailer") || eq.includes("chassis") || eq.includes("skeletal") || eq.includes("lowbed");
        const isSidelifter = eq.includes("sidelifter") || eq.includes("side loader");
        return !isPrime && !isTrailer && !isSidelifter;
      });
    } else {
      pool = availableVehicles;
    }

    const q = query.trim().toLowerCase();
    if (!q) return pool;

    // When searching by keyword: search available vehicles first; also match in-workshop vehicles so user sees why they are locked
    const searchPool = categoryFilter === "in_workshop"
      ? inWorkshopVehicles
      : [...availableVehicles, ...inWorkshopVehicles];

    type Scored = { item: Vehicle; score: number };
    const scored: Scored[] = [];
    const cleanQ = q.replace(/[\s\-_.]/g, "");

    for (const v of searchPool) {
      const isBusy = statusMap.get(v.id)?.isUnderMaintenance;
      const unit = (v.unitNo || v.vecNo || "").trim().toLowerCase();
      const cleanUnit = unit.replace(/[\s\-_.]/g, "");
      const reg = (v.regNo || "").trim().toLowerCase();
      const cleanReg = reg.replace(/[\s\-_.]/g, "");
      const brand = (v.brand || "").toLowerCase();
      const model = (v.model || "").toLowerCase();
      const equip = (v.equipment || v.equipmentType || "").toLowerCase();
      const comp = companies.find((c) => c.id === v.companyId);
      const compName = (comp?.name || "").toLowerCase();

      let score = 0;
      // 1. HIGHEST PRIORITY: Unit No
      if (unit === q || cleanUnit === cleanQ) score = Math.max(score, 100);
      else if (unit.startsWith(q) || cleanUnit.startsWith(cleanQ)) score = Math.max(score, 90);
      else if (unit.includes(q) || cleanUnit.includes(cleanQ)) score = Math.max(score, 80);

      // 2. Secondary priority: Plate No
      if (reg === q || cleanReg === cleanQ) score = Math.max(score, 75);
      else if (reg.startsWith(q) || cleanReg.startsWith(cleanQ)) score = Math.max(score, 65);
      else if (reg.includes(q) || cleanReg.includes(cleanQ)) score = Math.max(score, 55);

      // 3. Medium priority: Brand / Model / Equipment
      if (`${brand} ${model}`.includes(q)) score = Math.max(score, 45);
      else if (equip.includes(q)) score = Math.max(score, 35);

      // 4. Low priority: Company name
      if (compName.includes(q)) score = Math.max(score, 25);

      if (score > 0) {
        // Demote occupied vehicles in general search so available ones appear on top
        if (isBusy && categoryFilter !== "in_workshop") {
          score -= 30;
        }
        scored.push({ item: v, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.item);
  }, [availableVehicles, inWorkshopVehicles, statusMap, companies, query, categoryFilter]);

  const MAX_DOM_RENDER = 35;
  const displayItems = useMemo(() => filtered.slice(0, MAX_DOM_RENDER), [filtered]);

  // Handle keyboard arrow navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev < displayItems.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : displayItems.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < displayItems.length) {
        const item = displayItems[activeIndex];
        const status = statusMap.get(item.id);
        if (status?.isUnderMaintenance) {
          toast.warning(`Vehicle ${item.unitNo || item.regNo} has an active work order (${status.workOrderNo || "In Workshop"}) and cannot be selected.`);
          return;
        }
        onChange(item.id);
        setOpen(false);
        setQuery("");
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const getEquipmentMeta = (equipmentName?: string) => {
    const eq = (equipmentName || "").toLowerCase();
    if (eq.includes("prime") || eq.includes("mover") || eq.includes("head") || eq.includes("tractor")) {
      return {
        badgeBg: "bg-blue-50 text-blue-700 border-blue-200/80",
        avatarBg: "bg-blue-600 text-white",
        label: "Prime Mover",
      };
    }
    if (eq.includes("sidelifter") || eq.includes("side loader")) {
      return {
        badgeBg: "bg-purple-50 text-purple-700 border-purple-200/80",
        avatarBg: "bg-purple-600 text-white",
        label: "Side Loader",
      };
    }
    if (eq.includes("trailer") || eq.includes("chassis") || eq.includes("skeletal") || eq.includes("lowbed")) {
      return {
        badgeBg: "bg-amber-50 text-amber-800 border-amber-200/80",
        avatarBg: "bg-amber-500 text-white",
        label: "Trailer / Chassis",
      };
    }
    return {
      badgeBg: "bg-slate-100 text-slate-700 border-slate-200",
      avatarBg: "bg-slate-700 text-white",
      label: equipmentName || "Other",
    };
  };

  const dynamicPlaceholder = placeholder || (
    lockedCompany
      ? `Search ${lockedCompany.name} fleet (${availableVehicles.length} available) by Plate or Unit No...`
      : `Search ${availableVehicles.length} available vehicles by Plate (e.g. AKL, JXY) or Unit No (e.g. V-45)...`
  );

  return (
    <div ref={containerRef} className="relative z-40">
      {/* Search Input Bar */}
      <div className="relative flex items-center">
        <input
          type="text"
          value={
            open
              ? query
              : selectedVehicle
                ? `${selectedVehicle.regNo || selectedVehicle.vecNo}${selectedVehicle.unitNo && selectedVehicle.unitNo !== selectedVehicle.regNo ? ` (${selectedVehicle.unitNo})` : ""} · ${selectedVehicle.equipment || selectedVehicle.equipmentType || "Vehicle"}${selectedCompany ? ` — ${selectedCompany.name}` : ""}`
                : ""
          }
          placeholder={dynamicPlaceholder}
          onFocus={() => {
            setOpen(true);
            setQuery("");
            setActiveIndex(-1);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
            setActiveIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-10 text-sm font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 shadow-xs transition-all"
        />
        <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-slate-400" />
        {value ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
              setQuery("");
              setActiveIndex(-1);
            }}
            className="absolute right-2.5 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            title="Clear selected vehicle"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <ChevronDown className="pointer-events-none absolute right-3.5 h-4 w-4 text-slate-400" />
        )}
      </div>

      {/* Dropdown Panel */}
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 rounded-2xl border border-slate-200/90 bg-white p-2.5 shadow-2xl animate-in fade-in-50">
          {/* Quick Category Filter Pills */}
          {categories.length > 1 && (
            <div className="flex items-center gap-1.5 pb-2.5 mb-2 border-b border-slate-100 overflow-x-auto">
              {categories.map((cat) => {
                const isActive = categoryFilter === cat.id;
                const isWarn = Boolean((cat as any).isWarning);
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoryFilter(cat.id)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-colors shrink-0 ${
                      isActive
                        ? isWarn
                          ? "bg-amber-600 text-white shadow-2xs"
                          : "bg-blue-600 text-white shadow-2xs"
                        : isWarn
                        ? "bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200/70"
                    }`}
                  >
                    <span>{cat.label}</span>
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                        isActive
                          ? isWarn
                            ? "bg-amber-700 text-white"
                            : "bg-blue-700 text-white"
                          : isWarn
                          ? "bg-amber-200 text-amber-900"
                          : "bg-white/80 text-slate-600"
                      }`}
                    >
                      {cat.count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Column Header */}
          <div className="hidden sm:grid grid-cols-12 gap-3 px-3 py-2 text-[11px] font-extrabold uppercase tracking-wider text-slate-400 bg-slate-50/90 rounded-xl mb-1.5 border border-slate-100">
            <div className="col-span-4 sm:col-span-3 lg:col-span-2">Plate No</div>
            <div className="col-span-4 sm:col-span-3 lg:col-span-2">Unit No</div>
            <div className="col-span-4 sm:col-span-3 lg:col-span-3">Equipment / Status</div>
            <div className="hidden lg:block lg:col-span-2">Model / Spec</div>
            <div className="hidden sm:block sm:col-span-2 lg:col-span-2">Company</div>
            <div className="hidden sm:block sm:col-span-1 text-right">Action</div>
          </div>

          {/* Results List */}
          <div ref={listRef} className="max-h-96 overflow-y-auto space-y-1 pr-0.5 divide-y divide-slate-100/60">
            {displayItems.length === 0 ? (
              <div className="p-6 text-center">
                <Truck className="mx-auto h-8 w-8 text-slate-300 mb-2 stroke-[1.5]" />
                <p className="text-sm font-bold text-slate-800">No matching vehicle found</p>
                <p className="text-xs text-slate-500 mt-1">
                  Try searching by Plate (e.g. <span className="font-mono font-semibold">AKL, JXY</span>), Unit No (e.g. <span className="font-mono font-semibold">V-45</span>), or Model.
                </p>
              </div>
            ) : (
              displayItems.map((v, idx) => {
                const comp = companies.find((c) => c.id === v.companyId);
                const statusInfo = statusMap.get(v.id);
                const isUnderMaintenance = Boolean(statusInfo?.isUnderMaintenance);
                const isSelected = v.id === value;
                const isFocused = idx === activeIndex;
                const plateNo = v.regNo || v.vecNo || "-";
                const primaryUnit = v.unitNo || v.vecNo;
                const hasDistinctUnit = Boolean(primaryUnit && primaryUnit !== v.regNo);
                const equip = v.equipment || v.equipmentType || "Vehicle";
                const meta = getEquipmentMeta(equip);
                const makeModel = [v.brand, v.model].filter(Boolean).join(" ");

                return (
                  <button
                    key={v.id}
                    type="button"
                    disabled={isUnderMaintenance}
                    onClick={() => {
                      if (isUnderMaintenance) {
                        toast.warning(
                          `Vehicle ${plateNo} is currently under maintenance (${statusInfo?.workOrderNo || "Active Work Order"}). It cannot have multiple ongoing workshop jobs.`
                        );
                        return;
                      }
                      onChange(v.id);
                      setOpen(false);
                      setQuery("");
                    }}
                    onMouseEnter={() => !isUnderMaintenance && setActiveIndex(idx)}
                    className={`group w-full rounded-xl p-2.5 text-left transition-all ${
                      isUnderMaintenance
                        ? "opacity-60 bg-amber-50/40 border border-dashed border-amber-200 cursor-not-allowed text-slate-600"
                        : isSelected
                        ? "bg-blue-50/90 text-blue-950 ring-1 ring-blue-300 shadow-2xs cursor-pointer"
                        : isFocused
                        ? "bg-slate-100/90 text-slate-900 cursor-pointer"
                        : "text-slate-800 hover:bg-slate-50/90 cursor-pointer"
                    }`}
                  >
                    <div className="grid grid-cols-12 gap-3 items-center">
                      {/* Column 1: Plate No + Avatar Icon */}
                      <div className="col-span-4 sm:col-span-3 lg:col-span-2 flex items-center gap-2 min-w-0">
                        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg shadow-2xs ${meta.avatarBg}`}>
                          <Truck className="h-4 w-4" />
                        </div>
                        <span className="font-mono text-sm font-black text-slate-950 tracking-tight truncate">
                          {plateNo}
                        </span>
                      </div>

                      {/* Column 2: Unit No */}
                      <div className="col-span-4 sm:col-span-3 lg:col-span-2 flex items-center min-w-0">
                        {hasDistinctUnit ? (
                          <span className="font-mono text-sm font-bold text-slate-800 tracking-wide truncate">
                            {primaryUnit}
                          </span>
                        ) : (
                          <span className="font-mono text-xs text-slate-400">-</span>
                        )}
                      </div>

                      {/* Column 3: Equipment / Status badge */}
                      <div className="col-span-4 sm:col-span-3 lg:col-span-3 flex items-center min-w-0">
                        {isUnderMaintenance ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-900 truncate">
                            <AlertTriangle className="h-3 w-3 text-amber-700 shrink-0" />
                            In Workshop {statusInfo?.workOrderNo ? `(${statusInfo.workOrderNo})` : ""}
                          </span>
                        ) : (
                          <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-extrabold truncate ${meta.badgeBg}`}>
                            {equip}
                          </span>
                        )}
                      </div>

                      {/* Column 4: Make & Model */}
                      <div className="hidden lg:flex lg:col-span-2 items-center text-xs text-slate-600 truncate">
                        <span className="truncate" title={makeModel || "-"}>
                          {makeModel || "-"}
                        </span>
                      </div>

                      {/* Column 5: Company */}
                      <div className="hidden sm:flex sm:col-span-2 lg:col-span-2 items-center gap-1 text-xs text-slate-500 min-w-0">
                        {comp ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-slate-600 truncate" title={comp.name}>
                            <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{comp.name}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </div>

                      {/* Column 6: Action */}
                      <div className="hidden sm:flex sm:col-span-1 justify-end items-center">
                        {isUnderMaintenance ? (
                          <span className="rounded bg-amber-100 border border-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                            Occupied
                          </span>
                        ) : isSelected ? (
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white shadow-2xs">
                            <Check className="h-3.5 w-3.5 stroke-[3]" />
                          </div>
                        ) : (
                          <span className="text-xs font-bold text-slate-300 group-hover:text-blue-600 transition-colors">
                            <ChevronRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer Status Bar */}
          <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2 px-1 text-[11px] font-medium text-slate-400">
            <span>
              Showing {displayItems.length} of {filtered.length} vehicles · <span className="font-bold text-slate-700">{availableVehicles.length} Available</span>
              {inWorkshopVehicles.length > 0 ? (
                <span className="text-amber-700 font-semibold ml-1">({inWorkshopVehicles.length} in workshop deducted)</span>
              ) : null}
            </span>
            <span className="hidden sm:inline">
              Use <kbd className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px] text-slate-600 border border-slate-200">↑</kbd> <kbd className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px] text-slate-600 border border-slate-200">↓</kbd> to navigate, <kbd className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px] text-slate-600 border border-slate-200">Enter</kbd> to select
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function StaffSelect({
  staff,
  selectedIds,
  onChange,
}: {
  staff: StaffMember[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}) {
  const selectedId = selectedIds[0] || "";
  return (
    staff.length === 0 ? (
      <p className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-center text-xs text-gray-500">No active technical staff. Add one under Staff.</p>
    ) : (
      <AdminSelect
        value={selectedId}
        onChange={(event) => onChange(event.target.value ? [Number(event.target.value)] : [])}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="">-- Select Repair Person / Technician --</option>
        {staff.map((member) => (
          <option key={member.id} value={member.id}>{member.name} ({member.role})</option>
        ))}
      </AdminSelect>
    )
  );
}

function WorkOrderViewPartsSection({ workOrderId }: { workOrderId: number }) {
  const [overview, setOverview] = useState<WorkOrderPartsOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadWorkOrderPartsOverview(workOrderId)
      .then((data) => {
        if (active) setOverview(data);
      })
      .catch(() => { })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [workOrderId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-100 bg-slate-50/70 py-6 text-xs text-slate-500">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin text-blue-600" />
        Loading spare parts requirements...
      </div>
    );
  }

  const items = overview?.items || [];

  return (
    <div className="rounded-xl border border-blue-100 bg-[#f8fbff] p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100/70 text-[#1e3a8a]">
            <Package className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              Required / Used Spare Parts ({items.length})
            </h3>
            <p className="text-[11px] text-slate-500">Parts requested from workshop inventory</p>
          </div>
        </div>
        {overview?.summary.canStartRepair && items.length > 0 ? (
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 ring-1 ring-emerald-300">
            🟢 Parts Ready (In Stock)
          </span>
        ) : overview && overview.summary.shortageItems > 0 ? (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-800 ring-1 ring-amber-300">
            🟡 Shortage ({overview.summary.shortageItems} item{overview.summary.shortageItems > 1 ? "s" : ""})
          </span>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-blue-200/60 bg-white p-4 text-center text-xs text-slate-500">
          No spare parts requested for this work order.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xs">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50/80 text-[10px] font-bold uppercase text-slate-500">
              <tr>
                <th className="px-3.5 py-2.5 text-left">Part &amp; Code</th>
                <th className="px-3.5 py-2.5 text-left">Qty Required</th>
                <th className="px-3.5 py-2.5 text-left">Stock on Hand</th>
                <th className="px-3.5 py-2.5 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item, idx) => {
                const isShortage = item.availability === "shortage";
                return (
                  <tr key={idx} className="hover:bg-slate-50/60">
                    <td className="px-3.5 py-2.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-bold text-slate-900">{item.description}</p>
                        {item.isNewlyAdded ? (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 border border-amber-300 px-1.5 py-0.5 text-[9px] font-extrabold text-amber-900 shadow-xs">
                            ✨ New
                          </span>
                        ) : null}
                      </div>
                      {item.code ? (
                        <span className="font-mono text-[10px] text-slate-500">{item.code}</span>
                      ) : null}
                    </td>
                    <td className="px-3.5 py-2.5 text-left font-extrabold text-slate-800">
                      {item.requiredQuantity} {item.uom}
                    </td>
                    <td className="px-3.5 py-2.5 text-left font-medium text-slate-600">
                      {item.stockOnHand} {item.uom}
                    </td>
                    <td className="px-3.5 py-2.5 text-left">
                      {isShortage ? (
                        <span className="h-6 px-2.5 inline-flex items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-xs">
                          Shortage (-{item.shortageQuantity})
                        </span>
                      ) : (
                        <span className="h-6 px-2.5 inline-flex items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white shadow-xs">
                          Ready
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function WorkOrderReviewPartsDialog({
  workOrder,
  catalog,
  onClose,
  onSuccess,
}: {
  workOrder: WorkOrder;
  catalog: DocumentCatalogPart[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [items, setItems] = useState<{
    code: string;
    description: string;
    quantity: number;
    stock: number;
    uom: string;
    isNewlyAdded?: boolean;
    isQtyIncreased?: boolean;
    originalQuotationQty?: number;
  }[]>([]);
  const [removedItems, setRemovedItems] = useState<Array<{
    code: string;
    description: string;
    uom: string;
    originalQuantity: number;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [internalCatalog, setInternalCatalog] = useState<DocumentCatalogPart[]>(catalog && catalog.length > 0 ? catalog : []);

  useEffect(() => {
    if (catalog && catalog.length > 0) {
      setInternalCatalog(catalog);
    } else {
      apiRequest<DocumentCatalogPart[]>("admin-parts")
        .then((data) => {
          if (Array.isArray(data)) setInternalCatalog(data);
        })
        .catch(() => { });
    }
  }, [catalog]);

  const catalogBySku = useMemo(() => {
    const map = new Map<string, DocumentCatalogPart>();
    internalCatalog.forEach((p) => {
      if (p.sku) map.set(p.sku.trim().toUpperCase(), p);
    });
    return map;
  }, [internalCatalog]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadWorkOrderPartsOverview(workOrder.id)
      .then((data) => {
        if (!active) return;
        const mapped = (data?.items || []).map((item) => ({
          code: item.code || "",
          description: item.description || "",
          quantity: Math.max(1, Number(item.requiredQuantity) || 1),
          stock: Number(item.stockOnHand) || 0,
          uom: item.uom || "PCS",
          isNewlyAdded: Boolean(item.isNewlyAdded),
          isQtyIncreased: Boolean(item.isQtyIncreased),
          originalQuotationQty: item.originalQuotationQty,
        }));
        setItems(mapped);
        const removed = (data?.removedItems || []).map((r) => ({
          code: r.code || "",
          description: r.description || "",
          uom: r.uom || "",
          originalQuantity: Number(r.originalQuantity) || 1,
        }));
        setRemovedItems(removed);
      })
      .catch(() => { })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [workOrder.id]);

  const handleQtyChange = (index: number, delta: number) => {
    setItems((current) =>
      current.map((item, idx) => {
        if (idx !== index) return item;
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty };
      })
    );
  };

  const handleQtyInput = (index: number, val: number) => {
    const newQty = Math.max(1, isNaN(val) ? 1 : val);
    setItems((current) =>
      current.map((item, idx) => (idx === index ? { ...item, quantity: newQty } : item))
    );
  };

  const [partToRemove, setPartToRemove] = useState<{ index: number; name: string; code?: string } | null>(null);

  const confirmRemove = () => {
    if (partToRemove !== null) {
      setItems((current) => current.filter((_, idx) => idx !== partToRemove.index));
      setPartToRemove(null);
    }
  };

  const handleAddPart = () => {
    setItems((current) => [
      ...current,
      { code: "", description: "", quantity: 1, stock: 0, uom: "PCS", isNewlyAdded: true },
    ]);
  };

  const handleSelectCatalogPart = (index: number, selection: { code: string; description: string; unitPrice: number }) => {
    const catPart = catalogBySku.get((selection.code || "").trim().toUpperCase());
    setItems((current) =>
      current.map((item, idx) => {
        if (idx !== index) return item;
        return {
          ...item,
          code: selection.code,
          description: selection.description,
          stock: Number(catPart?.stock) || 0,
          uom: catPart?.uom || "PCS",
        };
      })
    );
  };

  const totalShortages = items.filter((i) => i.code && i.stock < i.quantity).length;
  const isReady = items.length > 0 && totalShortages === 0;

  const handleConfirmAndSave = async () => {
    try {
      setSaving(true);
      const validItems = items.filter((i) => (i.code || "").trim() || (i.description || "").trim());
      const payload = validItems.map((i) => ({
        code: i.code,
        itemCode: i.code,
        description: i.description || i.code,
        quantity: Math.max(1, Number(i.quantity) || 1),
      }));

      // 1. Save updated parts list to backend
      const saveRes: any = await postApi("admin-save-work-order-part-requirements", {
        workOrderId: workOrder.id,
        items: payload,
      });

      // 2. Acknowledge parts update
      await postApi("admin-acknowledge-work-order-parts", {
        workOrderId: workOrder.id,
      });

      if (saveRes?.quotationRevised) {
        toast.success(`Parts updated. Quotation revised to Rev ${saveRes.newRevision || 2} and reverted to Quotation status for price re-approval.`);
      } else {
        toast.success("Parts updated and acknowledged successfully.");
      }
      window.dispatchEvent(new CustomEvent("work-order-parts-updated"));
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update and acknowledge parts.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm transition-opacity">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-amber-50/90 via-white to-blue-50/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800 ring-1 ring-amber-200">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 sm:text-lg">
                Review Mid-Repair Added Parts — {workOrder.workOrderNo}
              </h2>
              <p className="text-xs text-gray-500">
                {workOrder.vehicleNo} · {workOrder.companyName} · Added from Workshop Floor
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
            <div>
              <p className="font-bold">Workshop team added or updated spare parts for this job during repair.</p>
              <p className="mt-0.5 text-amber-800/90">
                You can review, adjust quantities, add, or remove parts below before confirming. Clicking &ldquo;Confirm &amp; Acknowledge Parts&rdquo; will save your changes and allow the repair workflow to proceed.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-blue-100 bg-[#f8fbff] p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3.5 border-b border-blue-100/80 mb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100/70 text-[#1e3a8a]">
                  <Package className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                    Required / Used Spare Parts ({items.length})
                  </h3>
                  <p className="text-[11px] text-slate-500">Parts requested from workshop inventory</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isReady ? (
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 ring-1 ring-emerald-300">
                    🟢 Parts Ready (In Stock)
                  </span>
                ) : totalShortages > 0 ? (
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-800 ring-1 ring-amber-300">
                    🟡 Shortage ({totalShortages} item{totalShortages > 1 ? "s" : ""})
                  </span>
                ) : null}

                <button
                  type="button"
                  onClick={handleAddPart}
                  className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-bold text-blue-700 shadow-xs hover:bg-blue-50 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Part
                </button>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8 text-xs text-slate-500">
                <RefreshCw className="mr-2 h-4 w-4 animate-spin text-blue-600" />
                Loading spare parts requirements...
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-8">
                <PackageSearch className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                <p className="text-xs font-bold text-slate-600">No spare parts listed for this work order.</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Click &ldquo;Add Part&rdquo; above to add spare parts from inventory.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {items.map((item, idx) => {
                  const catPart = catalogBySku.get((item.code || "").trim().toUpperCase());
                  const stock = Number(catPart?.stock ?? item.stock) || 0;
                  const qty = Number(item.quantity) || 1;
                  const hasShortage = item.code && stock < qty;
                  const isReadyItem = item.code && stock >= qty;

                  return (
                    <div
                      key={idx}
                      className={`rounded-xl border p-3.5 shadow-xs transition-all flex flex-col gap-2.5 ${item.isNewlyAdded
                          ? "border-amber-300 bg-amber-50/40 ring-1 ring-amber-200/60"
                          : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-extrabold uppercase text-slate-400">
                            #{String(idx + 1).padStart(2, "0")}
                          </span>
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${!item.code
                                ? "bg-slate-100 text-slate-500"
                                : isReadyItem
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-rose-100 text-rose-800"
                              }`}
                          >
                            {!item.code
                              ? "Select Part"
                              : isReadyItem
                                ? `Ready (Stock: ${stock})`
                                : `Shortage (-${qty - stock}) · Stock: ${stock}`}
                          </span>

                          {item.isNewlyAdded ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-extrabold text-amber-900 shadow-xs">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-600 animate-pulse" />
                              ✨ New Added
                            </span>
                          ) : item.isQtyIncreased ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 border border-blue-300 px-2 py-0.5 text-[10px] font-extrabold text-blue-900 shadow-xs">
                              📈 Qty Increased (Quoted: {item.originalQuotationQty})
                            </span>
                          ) : null}
                        </div>

                        <button
                          type="button"
                          onClick={() => setPartToRemove({ index: idx, name: item.description || item.code || `Item #${idx + 1}`, code: item.code })}
                          className="inline-flex items-center text-xs font-semibold text-rose-600 hover:text-rose-700 p-1 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Remove part"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          Delete
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                        <div className="sm:col-span-8">
                          <DocumentItemCatalogSelect
                            compact
                            itemType="part"
                            code={item.code}
                            description={item.description}
                            parts={internalCatalog}
                            services={[]}
                            onSelect={(selection) => handleSelectCatalogPart(idx, selection)}
                          />
                        </div>

                        <div className="sm:col-span-4 flex items-center justify-end gap-2">
                          <span className="text-xs font-bold text-slate-500">Qty:</span>
                          <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                            <button
                              type="button"
                              onClick={() => handleQtyChange(idx, -1)}
                              disabled={qty <= 1}
                              className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-100 active:scale-95 disabled:opacity-30"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="1"
                              value={qty}
                              onChange={(e) => handleQtyInput(idx, parseInt(e.target.value, 10))}
                              className="h-7 w-12 text-center text-xs font-extrabold text-slate-900 bg-transparent outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => handleQtyChange(idx, 1)}
                              className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-100 active:scale-95"
                            >
                              +
                            </button>
                          </div>
                          <span className="text-[11px] font-semibold text-slate-400 min-w-8">
                            {item.uom || "PCS"}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Removed Parts Section */}
            {removedItems.length > 0 ? (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2 pt-1">
                  <span className="h-px flex-1 bg-rose-200" />
                  <span className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-rose-500">
                    <Trash2 className="h-3 w-3" />
                    Removed by Manager ({removedItems.length})
                  </span>
                  <span className="h-px flex-1 bg-rose-200" />
                </div>
                {removedItems.map((removed, ridx) => (
                  <div
                    key={ridx}
                    className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50/60 px-3.5 py-2.5 opacity-70"
                  >
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                      <Trash2 className="h-3 w-3" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-rose-900 line-through decoration-rose-400">
                        {removed.description || removed.code}
                      </p>
                      {removed.code ? (
                        <span className="font-mono text-[10px] text-rose-600 line-through">{removed.code}</span>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1 rounded-lg bg-rose-100 px-2 py-1">
                      <span className="text-[10px] font-extrabold text-rose-700">Qty: {removed.originalQuantity}</span>
                      {removed.uom ? <span className="text-[10px] text-rose-500">{removed.uom}</span> : null}
                    </div>
                    <span className="inline-flex rounded-full border border-rose-300 bg-white px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-rose-600">
                      Deleted
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => void handleConfirmAndSave()}
            className="inline-flex items-center rounded-xl bg-[#1e3a8a] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-800 active:scale-98 transition-all disabled:opacity-50"
          >
            {saving ? (
              <RefreshCw className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-1.5 h-4 w-4" />
            )}
            Confirm &amp; Acknowledge Parts
          </button>
        </div>
      </div>

      {/* Confirmation Modal for Removing Part */}
      {partToRemove && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-100">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5 border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600 ring-1 ring-rose-200">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Remove Spare Part?</h3>
                <p className="text-xs text-slate-500">Confirm removing this required part</p>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 mb-4">
              <p className="text-xs font-bold text-slate-900">{partToRemove.name}</p>
              {partToRemove.code ? (
                <span className="mt-1 inline-block font-mono text-[10px] font-bold text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                  {partToRemove.code}
                </span>
              ) : null}
            </div>
            <p className="text-xs text-slate-600 mb-4">
              Are you sure you want to remove this item from the required parts list?
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPartToRemove(null)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRemove}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-rose-700 active:scale-95 transition-all"
              >
                Confirm Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function WorkOrders() {
  const navigate = useNavigate();
  const canView = hasAdminPermission("workOrder.view");
  const canCreate = hasAdminPermission("workOrder.create");
  const canUpdateDetails = hasAdminPermission("workOrder.updateDetails");
  const canUpdateStatus = hasAdminPermission("workOrder.updateStatus");
  const canViewQuotation = hasAdminPermission("workOrder.viewQuotation");
  const canManageQuotation = hasAdminPermission("workOrder.manageQuotation");
  const signedInRole = (getSignedInAdmin().role || "").toLowerCase();
  const isAdminRole = ["admin", "super admin", "superadmin", "administrator"].includes(signedInRole);
  const isHeadManagerRole = ["head manager", "headmanager"].includes(signedInRole);
  const { t } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();

  // Filters from searchParams
  const initialWoNo = (searchParams.get("wo") || "").trim();
  const initialWoId = (searchParams.get("id") || "").trim();
  const initialStatus = searchParams.get("status") || "";
  const initialVehicleId = searchParams.get("vehicleId") || "";
  const initialRecordScope = searchParams.get("view") === "history" || initialStatus === "collected" ? "history" : "active";

  // Core list states
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [recordScope, setRecordScope] = useState<"active" | "history">(initialRecordScope);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("created_desc");
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState("");
  const [expandedWorkOrderIds, setExpandedWorkOrderIds] = useState<Set<number>>(() => new Set());

  const toggleRowExpanded = (id: number) => {
    setExpandedWorkOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const displayedWorkOrders = useMemo(() => {
    const list = [...workOrders];
    list.sort((a, b) => {
      if (sortBy === "created_desc") {
        const timeA = new Date(a.createdAt || a.checkinAt || 0).getTime();
        const timeB = new Date(b.createdAt || b.checkinAt || 0).getTime();
        if (timeA !== timeB) return timeB - timeA;
        return b.id - a.id;
      }
      if (sortBy === "created_asc") {
        const timeA = new Date(a.createdAt || a.checkinAt || 0).getTime();
        const timeB = new Date(b.createdAt || b.checkinAt || 0).getTime();
        if (timeA !== timeB) return timeA - timeB;
        return a.id - b.id;
      }
      if (sortBy === "priority_desc") {
        const rankA = PRIORITY_RANK[a.priority?.trim().toLowerCase()] ?? PRIORITY_RANK.normal;
        const rankB = PRIORITY_RANK[b.priority?.trim().toLowerCase()] ?? PRIORITY_RANK.normal;
        if (rankA !== rankB) return rankA - rankB;
        const timeA = new Date(a.createdAt || a.checkinAt || 0).getTime();
        const timeB = new Date(b.createdAt || b.checkinAt || 0).getTime();
        if (timeA !== timeB) return timeB - timeA;
        return b.id - a.id;
      }
      if (sortBy === "priority_asc") {
        const rankA = PRIORITY_RANK[a.priority?.trim().toLowerCase()] ?? PRIORITY_RANK.normal;
        const rankB = PRIORITY_RANK[b.priority?.trim().toLowerCase()] ?? PRIORITY_RANK.normal;
        if (rankA !== rankB) return rankB - rankA;
        const timeA = new Date(a.createdAt || a.checkinAt || 0).getTime();
        const timeB = new Date(b.createdAt || b.checkinAt || 0).getTime();
        if (timeA !== timeB) return timeB - timeA;
        return b.id - a.id;
      }
      if (sortBy === "wo_asc") return (a.workOrderNo || "").localeCompare(b.workOrderNo || "");
      if (sortBy === "wo_desc") return (b.workOrderNo || "").localeCompare(a.workOrderNo || "");
      if (sortBy === "company_asc") return (a.companyName || "").localeCompare(b.companyName || "");
      if (sortBy === "company_desc") return (b.companyName || "").localeCompare(a.companyName || "");
      if (sortBy === "vehicle_asc") return (a.vehicleNo || "").localeCompare(b.vehicleNo || "");
      if (sortBy === "vehicle_desc") return (b.vehicleNo || "").localeCompare(a.vehicleNo || "");
      if (sortBy === "status_asc") return (a.canonicalStatus || "").localeCompare(b.canonicalStatus || "");
      if (sortBy === "status_desc") return (b.canonicalStatus || "").localeCompare(a.canonicalStatus || "");
      if (sortBy === "bay_asc") return (a.bay || "").localeCompare(b.bay || "");
      if (sortBy === "bay_desc") return (b.bay || "").localeCompare(a.bay || "");
      if (sortBy === "eta_asc") {
        const timeA = a.estimatedOut ? new Date(a.estimatedOut.replace(" ", "T")).getTime() : 9999999999999;
        const timeB = b.estimatedOut ? new Date(b.estimatedOut.replace(" ", "T")).getTime() : 9999999999999;
        if (timeA !== timeB) return timeA - timeB;
        return a.id - b.id;
      }
      if (sortBy === "eta_desc") {
        const timeA = a.estimatedOut ? new Date(a.estimatedOut.replace(" ", "T")).getTime() : 0;
        const timeB = b.estimatedOut ? new Date(b.estimatedOut.replace(" ", "T")).getTime() : 0;
        if (timeA !== timeB) return timeB - timeA;
        return b.id - a.id;
      }
      return b.id - a.id;
    });
    return list;
  }, [workOrders, sortBy]);

  const activeSortKey = sortBy.startsWith("wo_")
    ? "wo"
    : sortBy.startsWith("priority_")
    ? "priority"
    : sortBy.startsWith("vehicle_")
    ? "vehicle"
    : sortBy.startsWith("company_")
    ? "company"
    : sortBy.startsWith("status_")
    ? "status"
    : sortBy.startsWith("bay_")
    ? "bay"
    : sortBy.startsWith("eta_")
    ? "eta"
    : null;
  const activeSortDirection = sortBy.endsWith("_asc") ? "asc" : sortBy.endsWith("_desc") ? "desc" : null;

  const handleHeaderSort = (key: string) => {
    setPage(1);
    if (key === "wo") {
      setSortBy((prev) => (prev === "wo_asc" ? "wo_desc" : "wo_asc"));
    } else if (key === "priority") {
      setSortBy((prev) => (prev === "priority_desc" ? "priority_asc" : "priority_desc"));
    } else if (key === "vehicle") {
      setSortBy((prev) => (prev === "vehicle_asc" ? "vehicle_desc" : "vehicle_asc"));
    } else if (key === "company") {
      setSortBy((prev) => (prev === "company_asc" ? "company_desc" : "company_asc"));
    } else if (key === "status") {
      setSortBy((prev) => (prev === "status_asc" ? "status_desc" : "status_asc"));
    } else if (key === "bay") {
      setSortBy((prev) => (prev === "bay_asc" ? "bay_desc" : "bay_asc"));
    } else if (key === "eta") {
      setSortBy((prev) => (prev === "eta_desc" ? "eta_asc" : "eta_desc"));
    }
  };

  // Filters
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [companyFilter, setCompanyFilter] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState(initialVehicleId);
  const [searchTerm, setSearchTerm] = useState(initialWoNo);
  const [historyDateFrom, setHistoryDateFrom] = useState("");
  const [historyDateTo, setHistoryDateTo] = useState("");
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});

  // Lookup options
  const [companies, setCompanies] = useState<Company[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);

  // Modals & form state
  const [selectedWO, setSelectedWO] = useState<WorkOrder | null>(null);
  const isSelectedWOCompleted = selectedWO?.canonicalStatus === "collected";
  const isSelectedWOPartsLocked = selectedWO?.canonicalStatus === "ready_for_collection" || selectedWO?.canonicalStatus === "collected";
  const canManagePartsStatus = (isAdminRole || isHeadManagerRole) && !isSelectedWOPartsLocked;
  const canRollbackStatus = (isAdminRole || isHeadManagerRole) && !isSelectedWOCompleted;
  const [selectedPhoto, setSelectedPhoto] = useState<WorkOrderPhoto | null>(null);
  const [modalMode, setModalMode] = useState<"view" | "create" | "edit" | "status" | "quotation" | "review_parts" | null>(null);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Creation form state
  const [formIntakeType, setFormIntakeType] = useState<"walk_in" | "rescue">("walk_in");
  const [formCompanyId, setFormCompanyId] = useState<number | "">("");
  const [formVehicleId, setFormVehicleId] = useState<number | "">("");
  const selectedFormVehicle = useMemo(
    () => (formVehicleId ? vehicles.find((v) => v.id === formVehicleId) : null),
    [formVehicleId, vehicles]
  );
  const activeWoForFormVehicle = useMemo(() => {
    if (!formVehicleId) return null;
    return workOrders.find(
      (wo) => wo.vehicleId === formVehicleId && wo.canonicalStatus !== "collected" && wo.canonicalStatus !== "scheduled"
    );
  }, [formVehicleId, workOrders]);
  const isSelectedVehicleTrailer = useMemo(() => isTrailerVehicle(selectedFormVehicle), [selectedFormVehicle]);
  const activeCommonIssues = useMemo(
    () => (isSelectedVehicleTrailer ? TRAILER_COMMON_ISSUES : PRIME_MOVER_COMMON_ISSUES),
    [isSelectedVehicleTrailer]
  );
  const [formRelatedVehicleIds, setFormRelatedVehicleIds] = useState<number[]>([]);
  const [formCustomerId, setFormCustomerId] = useState<number | "">("");
  const [formForemanId, setFormForemanId] = useState<number | "">("");
  const [formRequestChannel, setFormRequestChannel] = useState("Walk-in");
  const [formReportedProblem, setFormReportedProblem] = useState("");
  const [formCommonIssue, setFormCommonIssue] = useState<string>("");
  const [formServiceType, setFormServiceType] = useState<string>("Repair");
  const [formCheckinMileage, setFormCheckinMileage] = useState("");
  const [formCheckinAt, setFormCheckinAt] = useState("");
  const [formPriority, setFormPriority] = useState<string>("Normal");
  const [formBay, setFormBay] = useState<string>("");
  const [formEstimatedOut, setFormEstimatedOut] = useState<string>("");
  const [formTechnicianIds, setFormTechnicianIds] = useState<number[]>([]);
  const [formIsBackOrder, setFormIsBackOrder] = useState<boolean>(false);

  // Edit details form state
  const [detailWO, setDetailWO] = useState<WorkOrder | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<{
    id: number;
    name: string;
    url: string;
    type: string;
    size?: string;
    time?: string;
    by?: string;
  } | null>(null);
  const [isDetailEditing, setIsDetailEditing] = useState(false);
  const [detailNotes, setDetailNotes] = useState("");
  const [editActualIssue, setEditActualIssue] = useState("");
  const [inspectionActualIssue, setInspectionActualIssue] = useState("");
  const [detailReference, setDetailReference] = useState("");
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editPriority, setEditPriority] = useState<string>("Normal");
  const [editBay, setEditBay] = useState<string>("");
  const [editEstimatedOut, setEditEstimatedOut] = useState<string>("");
  const [editTechnicianIds, setEditTechnicianIds] = useState<number[]>([]);
  const [editCheckinMileage, setEditCheckinMileage] = useState<string>("");
  const [editIsBackOrder, setEditIsBackOrder] = useState<boolean>(false);
  const [partsStatus, setPartsStatus] = useState<string>("not_required");
  const [partsExpectedDate, setPartsExpectedDate] = useState("");
  const [partsReference, setPartsReference] = useState("");
  const [partsNotes, setPartsNotes] = useState("");
  const [partsOverrideEnabled, setPartsOverrideEnabled] = useState(false);
  const [partsOverrideReason, setPartsOverrideReason] = useState("");
  const [rollbackConfirmOpen, setRollbackConfirmOpen] = useState(false);
  const [rollbackReason, setRollbackReason] = useState("");
  const [partsOverview, setPartsOverview] = useState<WorkOrderPartsOverview | null>(null);
  const [partsOverviewLoading, setPartsOverviewLoading] = useState(false);
  const [partsOverviewError, setPartsOverviewError] = useState("");
  const [inspectionPartCatalog, setInspectionPartCatalog] = useState<DocumentCatalogPart[]>([]);
  const [inspectionParts, setInspectionParts] = useState<InspectionPartRequirement[]>([]);
  const [inspectionPartsConfirmed, setInspectionPartsConfirmed] = useState(false);
  const [inspectionPartsLoading, setInspectionPartsLoading] = useState(false);
  const [initialInspectionPartsJson, setInitialInspectionPartsJson] = useState("");
  const [partToRemoveModal, setPartToRemoveModal] = useState<{ index: number; name: string; code?: string } | null>(null);
  const [isEditingParts, setIsEditingParts] = useState(false);

  const isInspectionPartsModified = useMemo(() => {
    if (inspectionPartsLoading || !initialInspectionPartsJson) return false;
    const currentValidParts = inspectionParts.filter(
      (r) => Boolean((r.code || "").trim() || (r.description || "").trim() || r.partId)
    );
    const currentJson = JSON.stringify(
      currentValidParts.map((r) => ({
        code: (r.code || "").trim().toUpperCase(),
        description: (r.description || "").trim(),
        quantity: Number(r.quantity) || 1,
      }))
    );
    return currentJson !== initialInspectionPartsJson;
  }, [inspectionParts, initialInspectionPartsJson, inspectionPartsLoading]);

  const inspectionCatalogBySku = useMemo(() => {
    const map = new Map<string, DocumentCatalogPart>();
    for (const part of inspectionPartCatalog) {
      if (part.sku) {
        map.set(part.sku, part);
        map.set(part.sku.trim().toUpperCase(), part);
        map.set(part.sku.trim().toLowerCase(), part);
      }
      if (part.id) {
        map.set(String(part.id), part);
      }
    }
    return map;
  }, [inspectionPartCatalog]);

  const calculatedPartsStatus = useMemo(() => {
    if (selectedWO?.isBackOrder) return "parts_ready";
    if (inspectionPartsLoading || partsOverviewLoading) {
      return selectedWO?.partsStatus || (selectedWO?.partsReadyAt ? "parts_ready" : "not_required");
    }
    const validParts = inspectionParts.filter(
      (item) => Boolean((item.code || "").trim() || item.partId || (item.description || "").trim())
    );
    if (validParts.length === 0) {
      return calculatePartsStatus(
        partsOverview,
        selectedWO?.partsStatus || (selectedWO?.partsReadyAt ? "parts_ready" : "not_required"),
        Boolean(selectedWO?.isBackOrder)
      );
    }
    const specifiedParts = validParts.filter((item) => Boolean((item.code || "").trim() || item.partId));
    if (specifiedParts.length === 0) {
      return "parts_ready";
    }
    const hasShortage = specifiedParts.some((item) => {
      const code = (item.code || "").trim().toUpperCase();
      const catPart = (code ? inspectionCatalogBySku.get(code) : null) || (item.partId ? inspectionCatalogBySku.get(String(item.partId)) : null);
      const stock = Number(catPart?.stock || 0);
      return Number(item.quantity || 0) > stock;
    });
    return hasShortage ? "pending_parts" : "parts_ready";
  }, [selectedWO?.isBackOrder, selectedWO?.partsReadyAt, selectedWO?.partsStatus, inspectionPartsLoading, partsOverviewLoading, inspectionParts, inspectionCatalogBySku, partsOverview]);

  const effectivePartsStatus = partsOverrideEnabled ? partsStatus : calculatedPartsStatus;
  const calculatedPartsStatusConfig = getPartsStatusConfig(calculatedPartsStatus, Boolean(selectedWO?.isBackOrder));
  const effectivePartsStatusConfig = getPartsStatusConfig(effectivePartsStatus, Boolean(selectedWO?.isBackOrder));

  const requestSeqRef = useRef(0);
  const isClearingRef = useRef(false);

  // Sync state with URL params
  useEffect(() => {
    if (isClearingRef.current) return;
    setStatusFilter(searchParams.get("status") || "");
    setVehicleFilter(searchParams.get("vehicleId") || "");
    setRecordScope(searchParams.get("view") === "history" || searchParams.get("status") === "collected" ? "history" : "active");
    const wo = (searchParams.get("wo") || "").trim();
    if (wo) {
      setSearchTerm(wo);
    }
  }, [searchParams]);

  // Fetch Lookup Data once
  useEffect(() => {
    if (!canCreate && !canUpdateDetails) return;
    async function loadLookups() {
      try {
        const [comps, vehs, custs, staffMembers] = await Promise.all([
          apiRequest<Company[]>("admin-companies"),
          apiRequest<Vehicle[]>("admin-vehicles"),
          apiRequest<Customer[]>("admin-customers"),
          apiRequest<StaffMember[]>("admin-staff"),
        ]);
        setCompanies(comps || []);
        setVehicles(vehs || []);
        setCustomers(custs || []);
        setStaff(staffMembers || []);
      } catch (err) {
        console.error("Error loading lookup lists", err);
      }
    }
    loadLookups();
  }, [canCreate, canUpdateDetails]);

  // Fetch Work Orders on filter/page change
  const fetchWorkOrders = async (overrides?: {
    statusFilter?: string;
    recordScope?: "active" | "history";
    companyFilter?: string;
    vehicleFilter?: string;
    searchTerm?: string;
    historyDateFrom?: string;
    historyDateTo?: string;
    page?: number;
    pageSize?: number;
  }) => {
    const reqStatus = overrides?.statusFilter !== undefined ? overrides.statusFilter : statusFilter;
    const reqScope = overrides?.recordScope !== undefined ? overrides.recordScope : recordScope;
    const reqCompany = overrides?.companyFilter !== undefined ? overrides.companyFilter : companyFilter;
    const reqVehicle = overrides?.vehicleFilter !== undefined ? overrides.vehicleFilter : vehicleFilter;
    const reqSearch = overrides?.searchTerm !== undefined ? overrides.searchTerm : searchTerm;
    const reqDateFrom = overrides?.historyDateFrom !== undefined ? overrides.historyDateFrom : historyDateFrom;
    const reqDateTo = overrides?.historyDateTo !== undefined ? overrides.historyDateTo : historyDateTo;
    const reqPage = overrides?.page !== undefined ? overrides.page : page;
    const reqLimit = overrides?.pageSize !== undefined ? overrides.pageSize : pageSize;

    const seq = ++requestSeqRef.current;
    setIsLoading(true);
    setError("");
    try {
      const response = await postApi<{
        workOrders: WorkOrder[];
        statusCounts?: Record<string, number>;
        pagination?: { total: number; page: number; limit: number; pages: number };
        total?: number;
        totalPages?: number;
      }>("admin-work-orders", {
        canonicalStatus: reqStatus,
        recordScope: reqScope,
        historyDateFrom: reqScope === "history" ? reqDateFrom : "",
        historyDateTo: reqScope === "history" ? reqDateTo : "",
        companyId: parseInt(reqCompany) || 0,
        vehicleId: parseInt(reqVehicle) || 0,
        searchTerm: reqSearch.trim(),
        page: reqPage,
        limit: reqLimit,
      });

      if (seq !== requestSeqRef.current) {
        return;
      }

      setWorkOrders(response.workOrders || []);
      if (response.statusCounts && Object.keys(response.statusCounts).length > 0) {
        setStatusCounts(response.statusCounts);
      } else if (!reqStatus && (response.workOrders || []).length >= (response.pagination?.total ?? response.total ?? 0)) {
        const counts: Record<string, number> = {
          all: response.pagination?.total ?? response.total ?? response.workOrders.length,
        };
        for (const wo of response.workOrders) {
          const st = wo.canonicalStatus || "";
          if (st) counts[st] = (counts[st] || 0) + 1;
        }
        setStatusCounts(counts);
      }
      setTotal(response.pagination?.total ?? response.total ?? 0);
      setTotalPages(response.pagination?.pages ?? response.totalPages ?? 1);
    } catch (err) {
      if (seq !== requestSeqRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load work orders");
      setWorkOrders([]);
    } finally {
      if (seq === requestSeqRef.current) {
        setIsLoading(false);
        setHasLoaded(true);
      }
    }
  };

  // Fetch overall status summary for tabs (with fallback to client-side aggregation if backend doesn't return statusCounts)
  const fetchStatusSummary = useCallback(async (
    scope: "active" | "history" = recordScope,
    compId: string = companyFilter,
    vehId: string = vehicleFilter,
    search: string = searchTerm,
    dateFrom: string = historyDateFrom,
    dateTo: string = historyDateTo
  ) => {
    try {
      const summary = await postApi<{
        workOrders: WorkOrder[];
        statusCounts?: Record<string, number>;
        pagination?: { total: number };
        total?: number;
      }>("admin-work-orders", {
        canonicalStatus: "",
        recordScope: scope,
        historyDateFrom: scope === "history" ? dateFrom : "",
        historyDateTo: scope === "history" ? dateTo : "",
        companyId: parseInt(compId) || 0,
        vehicleId: parseInt(vehId) || 0,
        searchTerm: search.trim(),
        page: 1,
        limit: 100,
      });

      if (summary.statusCounts && Object.keys(summary.statusCounts).length > 0) {
        setStatusCounts(summary.statusCounts);
      } else if (summary.workOrders) {
        const counts: Record<string, number> = {
          all: summary.pagination?.total ?? summary.total ?? summary.workOrders.length,
        };
        for (const wo of summary.workOrders) {
          const st = wo.canonicalStatus || "";
          if (st) {
            counts[st] = (counts[st] || 0) + 1;
          }
        }
        setStatusCounts(counts);
      }
    } catch {
      // Keep previous counts on error
    }
  }, [recordScope, companyFilter, vehicleFilter, searchTerm, historyDateFrom, historyDateTo]);

  useEffect(() => {
    if (isClearingRef.current) {
      isClearingRef.current = false;
      return;
    }
    fetchWorkOrders();
  }, [statusFilter, companyFilter, vehicleFilter, historyDateFrom, historyDateTo, recordScope, page, pageSize]);

  useEffect(() => {
    if (isClearingRef.current) return;
    fetchStatusSummary(recordScope, companyFilter, vehicleFilter, searchTerm, historyDateFrom, historyDateTo);
  }, [companyFilter, vehicleFilter, historyDateFrom, historyDateTo, recordScope, fetchStatusSummary]);

  // Debounced search trigger
  useEffect(() => {
    if (isClearingRef.current) return;
    const delayDebounce = setTimeout(() => {
      setPage(1);
      fetchWorkOrders({ searchTerm, page: 1 });
      fetchStatusSummary(recordScope, companyFilter, vehicleFilter, searchTerm, historyDateFrom, historyDateTo);
    }, 400);
    return () => clearTimeout(delayDebounce);
  }, [searchTerm]);

  // Clear filters helper
  const handleClearFilters = () => {
    isClearingRef.current = true;
    setStatusFilter("");
    setCompanyFilter("");
    setVehicleFilter("");
    setSearchTerm("");
    setHistoryDateFrom("");
    setHistoryDateTo("");
    setPage(1);
    setSearchParams(recordScope === "history" ? { view: "history" } : {});
    fetchWorkOrders({
      statusFilter: "",
      companyFilter: "",
      vehicleFilter: "",
      searchTerm: "",
      historyDateFrom: "",
      historyDateTo: "",
      page: 1,
    });
    fetchStatusSummary(recordScope, "", "", "", "", "");
  };

  const changeRecordScope = (scope: "active" | "history") => {
    setRecordScope(scope);
    setStatusFilter("");
    setPage(1);
    setSearchParams(scope === "history" ? { view: "history" } : {});
    fetchStatusSummary(scope, companyFilter, vehicleFilter, searchTerm, historyDateFrom, historyDateTo);
  };

  const activeStatusTabs = useMemo(() => {
    const allCount = statusCounts.all ?? (recordScope === "active" ? total : 0);
    return [
      { id: "", label: "All Active", count: allCount },
      { id: "checked_in", label: "Checked In", count: statusCounts.checked_in ?? 0, badgeColor: (statusCounts.checked_in ?? 0) > 0 ? "bg-slate-100 text-slate-700" : undefined },
      { id: "inspected", label: "Inspected", count: statusCounts.inspected ?? 0, badgeColor: (statusCounts.inspected ?? 0) > 0 ? "bg-blue-100 text-blue-800" : undefined },
      { id: "quotation_issued", label: "Quotation Issued", count: statusCounts.quotation_issued ?? 0, badgeColor: (statusCounts.quotation_issued ?? 0) > 0 ? "bg-purple-100 text-purple-800" : undefined },
      { id: "approved", label: "Approved", count: statusCounts.approved ?? 0, badgeColor: (statusCounts.approved ?? 0) > 0 ? "bg-teal-100 text-teal-800" : undefined },
      { id: "parts_ready", label: "Parts Ready", count: statusCounts.parts_ready ?? 0, badgeColor: (statusCounts.parts_ready ?? 0) > 0 ? "bg-emerald-100 text-emerald-800" : undefined },
      { id: "under_repair", label: "Under Repair", count: statusCounts.under_repair ?? 0, badgeColor: (statusCounts.under_repair ?? 0) > 0 ? "bg-blue-100 text-blue-800" : undefined },
      { id: "ready_for_collection", label: "Ready for Collection", count: statusCounts.ready_for_collection ?? 0, badgeColor: (statusCounts.ready_for_collection ?? 0) > 0 ? "bg-emerald-100 text-emerald-800" : undefined },
    ];
  }, [statusCounts, total, recordScope]);

  const historyStatusTabs = useMemo(() => {
    const allCount = statusCounts.all ?? (recordScope === "history" ? total : 0);
    return [
      { id: "", label: "All History", count: allCount },
      { id: "collected", label: "Collected", count: statusCounts.collected ?? allCount, badgeColor: "bg-slate-100 text-slate-700" },
    ];
  }, [statusCounts, total, recordScope]);

  const currentStatusTabs = recordScope === "history" ? historyStatusTabs : activeStatusTabs;

  // Filter vehicles dropdown in Create Form
  const formFilteredVehicles = useMemo(() => {
    if (!formCompanyId) return vehicles;
    return vehicles.filter(v => v.companyId === formCompanyId);
  }, [formCompanyId, vehicles]);

  // Filter company contacts in Create Form
  const formFilteredCustomers = useMemo(() => {
    if (!formCompanyId) return [];
    return customers.filter(c => c.companyId === formCompanyId);
  }, [formCompanyId, customers]);

  const assignableStaff = useMemo(
    () => staff.filter((member) =>
      member.status === "Active" && ["Foreman", "Technician"].includes(member.role)
    ),
    [staff],
  );

  const activeForemen = useMemo(
    () => staff.filter((member) => member.status === "Active" && member.role === "Foreman"),
    [staff],
  );

  const defaultForemanId = useMemo(
    () => activeForemen[0]?.id || 0,
    [activeForemen],
  );

  const defaultTechnicianId = assignableStaff.find((member) => member.id === 1)?.id
    || assignableStaff[0]?.id
    || 0;

  useEffect(() => {
    if (!defaultTechnicianId) return;
    if (modalMode === "edit" && editTechnicianIds.length === 0) {
      setEditTechnicianIds([defaultTechnicianId]);
    }
  }, [defaultTechnicianId, editTechnicianIds.length, modalMode]);

  const currentLocalDateTime = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60_000;
    return new Date(now.getTime() - offset).toISOString().slice(0, 16);
  };

  const openCreateModal = () => {
    setFormIntakeType("walk_in");
    setFormCompanyId("");
    setFormVehicleId("");
    setFormRelatedVehicleIds([]);
    setFormCustomerId("");
    setFormForemanId("");
    setFormRequestChannel("Walk-in");
    setFormReportedProblem("");
    setFormCommonIssue("");
    setFormServiceType("Repair");
    setFormCheckinMileage("");
    setFormCheckinAt(currentLocalDateTime());
    setFormPriority("Normal");
    setFormBay("");
    setFormEstimatedOut("");
    setFormTechnicianIds([]);
    setFormIsBackOrder(false);
    setFormError("");
    setModalMode("create");
  };

  const openDetailView = (wo: WorkOrder, editMode: boolean = false) => {
    setDetailWO(wo);
    setSelectedWO(wo);
    setIsDetailEditing(editMode);
    setIsSaving(false);
    setEditPriority(wo.priority || "Normal");
    setEditBay(wo.bay || "");
    setEditEstimatedOut(wo.estimatedOut || "");
    setEditCheckinMileage(wo.checkinMileage !== null && wo.checkinMileage !== undefined ? String(wo.checkinMileage) : "");
    const existingTechnicianId = wo.technicians?.[0]?.id || defaultTechnicianId;
    setEditTechnicianIds(existingTechnicianId ? [existingTechnicianId] : []);
    setEditIsBackOrder(Boolean(wo.isBackOrder));
    setDetailNotes(wo.reportedProblem || wo.notes || "");
    setEditActualIssue(wo.actualIssue || "");
    setDetailReference(wo.partsReference || wo.poNumber || "");
    setFormError("");
    setMoreMenuOpen(false);
  };

  const openEditModal = (wo: WorkOrder) => {
    openDetailView(wo, true);
  };

  const openViewModal = (wo: WorkOrder) => {
    openDetailView(wo, false);
  };

  // Auto-open work order detail if ?wo=... or ?id=... is present in URL
  const lastAutoOpenedTargetRef = useRef<string>("");
  useEffect(() => {
    const targetWoNo = (searchParams.get("wo") || "").trim();
    const targetWoId = (searchParams.get("id") || "").trim();
    const key = `${targetWoId}:${targetWoNo}`;
    if (!targetWoNo && !targetWoId) {
      lastAutoOpenedTargetRef.current = "";
      return;
    }
    if (lastAutoOpenedTargetRef.current === key) return;

    // 1. Try finding in loaded workOrders list
    const found = workOrders.find((w) => {
      if (targetWoId && String(w.id) === targetWoId) return true;
      if (
        targetWoNo &&
        (w.workOrderNo?.toLowerCase() === targetWoNo.toLowerCase() ||
          w.autocountJobNo?.toLowerCase() === targetWoNo.toLowerCase())
      ) {
        return true;
      }
      return false;
    });

    if (found) {
      lastAutoOpenedTargetRef.current = key;
      if (found.canonicalStatus === "collected" && recordScope !== "history") {
        setRecordScope("history");
      }
      openDetailView(found, false);
      return;
    }

    // 2. If list finished loading and not found in current scope, query across all records
    if (!isLoading) {
      postApi<{ workOrders: WorkOrder[] }>("admin-work-orders", {
        recordScope: "all",
        searchTerm: targetWoNo,
        limit: 10,
      })
        .then((res) => {
          const match = (res.workOrders || []).find((w) => {
            if (targetWoId && String(w.id) === targetWoId) return true;
            if (
              targetWoNo &&
              (w.workOrderNo?.toLowerCase() === targetWoNo.toLowerCase() ||
                w.autocountJobNo?.toLowerCase() === targetWoNo.toLowerCase())
            ) {
              return true;
            }
            return false;
          });
          if (match) {
            lastAutoOpenedTargetRef.current = key;
            if (match.canonicalStatus === "collected" && recordScope !== "history") {
              setRecordScope("history");
            }
            openDetailView(match, false);
          }
        })
        .catch(() => {});
    }
  }, [workOrders, isLoading, searchParams, recordScope]);

  const openStatusModal = (wo: WorkOrder) => {
    if (wo.hasUnacknowledgedParts) {
      openPartsReviewModal(wo);
      return;
    }
    setSelectedWO(wo);
    setInspectionActualIssue(wo.actualIssue || "");
    setEditBay(wo.bay || "");
    setEditEstimatedOut(wo.estimatedOut ? (wo.estimatedOut.includes(" ") ? wo.estimatedOut.replace(" ", "T").slice(0, 16) : wo.estimatedOut.slice(0, 16)) : "");
    setPartsStatus(wo.partsStatus || (wo.partsReadyAt ? "parts_ready" : "not_required"));
    setPartsExpectedDate(wo.partsExpectedDate || "");
    setPartsReference(wo.partsReference || "");
    setPartsNotes(wo.partsNotes || "");
    setPartsOverrideEnabled(false);
    setPartsOverrideReason("");
    setEditIsBackOrder(Boolean(wo.isBackOrder));
    setRollbackConfirmOpen(false);
    setRollbackReason("");
    setInitialInspectionPartsJson("");
    setIsEditingParts(false);

    if (["ready_for_collection", "collected"].includes(wo.canonicalStatus)) {
      setPartsOverview(null);
      setPartsOverviewError("");
      setPartsOverviewLoading(false);
      setInspectionPartsLoading(false);
      setInspectionParts([]);
    } else {
      setPartsOverview(null);
      setPartsOverviewError("");
      setPartsOverviewLoading(true);
      loadWorkOrderPartsOverview(wo.id)
        .then((overview) => {
          setPartsOverview(overview);
          setPartsStatus(calculatePartsStatus(overview, wo.partsStatus || (wo.partsReadyAt ? "parts_ready" : "not_required"), Boolean(wo.isBackOrder)));
        })
        .catch((caught) => setPartsOverviewError(caught instanceof Error ? caught.message : "Unable to load stock availability."))
        .finally(() => setPartsOverviewLoading(false));

      setInspectionPartsConfirmed(wo.canonicalStatus !== "checked_in");
      setInspectionParts([]);
      setInspectionPartsLoading(true);
      Promise.all([
        apiRequest<DocumentCatalogPart[]>("admin-parts").catch(() => []),
        apiRequest<InspectionPartRequirement[]>(`admin-get-work-order-part-requirements&id=${wo.id}`).catch(() => []),
      ]).then(([catalog, requirements]) => {
        setInspectionPartCatalog(catalog);
        const validRequirements = requirements.filter((item) => Boolean(item.code?.trim() || item.description?.trim() || item.partId));
        setInspectionParts(validRequirements);
        setInitialInspectionPartsJson(
          JSON.stringify(
            validRequirements.map((r) => ({
              code: (r.code || "").trim().toUpperCase(),
              description: (r.description || "").trim(),
              quantity: Number(r.quantity) || 1,
            }))
          )
        );
      }).finally(() => setInspectionPartsLoading(false));
    }
    setFormError("");
    setModalMode("status");
  };

  const openPartsReviewModal = (wo: WorkOrder) => {
    setSelectedWO(wo);
    setFormError("");
    setModalMode("review_parts");
    if (!inspectionPartCatalog || inspectionPartCatalog.length === 0) {
      apiRequest<DocumentCatalogPart[]>("admin-parts")
        .then((catalog) => {
          if (Array.isArray(catalog)) setInspectionPartCatalog(catalog);
        })
        .catch(() => { });
    }
  };

  const handleAcknowledgeParts = async () => {
    if (!selectedWO) return;
    try {
      await postApi("admin-acknowledge-work-order-parts", { workOrderId: selectedWO.id });
      setWorkOrders((current) =>
        current.map((wo) =>
          wo.id === selectedWO.id
            ? { ...wo, hasUnacknowledgedParts: false, partsAcknowledgedAt: new Date().toISOString() }
            : wo
        )
      );
      window.dispatchEvent(new CustomEvent("work-order-parts-updated"));
      toast.success("Parts update acknowledged successfully.");
      closeModal();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to acknowledge parts update.");
    }
  };

  const openQuotationModal = (wo: WorkOrder) => {
    setSelectedWO(wo);
    setFormError("");
    setModalMode("quotation");
  };

  const closeModal = () => {
    setSelectedPhoto(null);
    if (!detailWO) {
      setSelectedWO(null);
    }
    setModalMode(null);
    setFormError("");
  };

  const handleSaveDetailChanges = async () => {
    if (!detailWO) return;
    setIsSaving(true);
    setFormError("");
    try {
      await postApi("admin-update-work-order", {
        id: detailWO.id,
        priority: editPriority,
        bay: editBay || null,
        estimatedOut: editEstimatedOut || null,
        technicianIds: editTechnicianIds,
        checkinMileage: editCheckinMileage !== "" ? Number(editCheckinMileage) : null,
        isBackOrder: editIsBackOrder,
        reportedProblem: detailNotes,
        notes: detailNotes,
        actualIssue: editActualIssue,
        reference: detailReference,
        partsReference: detailReference,
      });
      const updatedTechs = assignableStaff.filter((s) => editTechnicianIds.includes(s.id));
      const updatedWO: WorkOrder = {
        ...detailWO,
        priority: editPriority,
        bay: editBay || null,
        estimatedOut: editEstimatedOut || null,
        technicians: updatedTechs,
        checkinMileage: editCheckinMileage !== "" ? Number(editCheckinMileage) : null,
        isBackOrder: editIsBackOrder,
        reportedProblem: detailNotes,
        notes: detailNotes,
        actualIssue: editActualIssue,
        partsReference: detailReference,
      };
      setDetailWO(updatedWO);
      setSelectedWO(updatedWO);
      setWorkOrders((current) =>
        current.map((item) => (item.id === updatedWO.id ? { ...item, ...updatedWO } : item))
      );
      setIsDetailEditing(false);
      toast.success("Work order updated successfully.");
      fetchWorkOrders();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update work order details.";
      setFormError(msg);
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!detailWO || !e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append("file", file);
    formData.append("workOrderId", String(detailWO.id));
    formData.append("category", "inspection");
    formData.append("caption", file.name);
    try {
      const uploadRes = await fetch(`/api/admin-upload-work-order-photo`, {
        method: "POST",
        body: formData,
      });
      if (!uploadRes.ok) throw new Error("Failed to upload photo");
      const resJson = await uploadRes.json();
      if (resJson.photo) {
        setDetailWO((prev) => prev ? { ...prev, photos: [...(prev.photos || []), resJson.photo] } : null);
        toast.success("Attachment uploaded successfully.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload attachment.");
    }
  };

  useEffect(() => {
    if (!selectedPhoto) return;
    const closePhotoOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedPhoto(null);
    };
    window.addEventListener("keydown", closePhotoOnEscape);
    return () => window.removeEventListener("keydown", closePhotoOnEscape);
  }, [selectedPhoto]);

  // Form submit handlers
  const handleCreateWorkOrder = async () => {
    setFormError("");
    if (!formCompanyId) {
      setFormError("Company selection is required.");
      return;
    }
    if (!formVehicleId) {
      setFormError("Vehicle selection is required.");
      return;
    }
    if (!formServiceType) {
      setFormError("Service type selection is required.");
      return;
    }
    if (!formReportedProblem.trim()) {
      setFormError("Common issue selection is required.");
      return;
    }
    if (!formCheckinAt) {
      setFormError("Check-in date and time are required.");
      return;
    }

    setIsSaving(true);
    try {
      const resolvedCustomerId =
        formCustomerId ||
        formFilteredCustomers[0]?.id ||
        customers.find((c) => c.companyId === formCompanyId)?.id ||
        null;

      if (activeWoForFormVehicle) {
        setFormError(`This vehicle already has an active work order (${activeWoForFormVehicle.workOrderNo} - ${activeWoForFormVehicle.canonicalStatus.replace(/_/g, " ")}). A vehicle cannot have multiple ongoing workshop jobs.`);
        setIsSaving(false);
        return;
      }

      const targetVehicle = vehicles.find((v) => v.id === formVehicleId);
      const vehicleCurrentMileage = targetVehicle ? Number(String(targetVehicle.mileage || 0).replace(/[^0-9]/g, "")) : 0;
      if (formCheckinMileage !== "" && vehicleCurrentMileage > 0 && Number(formCheckinMileage) < vehicleCurrentMileage) {
        setFormError(`Check-in mileage (${Number(formCheckinMileage).toLocaleString()} km) cannot be less than the vehicle's current recorded mileage (${vehicleCurrentMileage.toLocaleString()} km).`);
        setIsSaving(false);
        return;
      }

      await postApi("admin-create-work-order", {
        companyId: formCompanyId,
        vehicleId: formVehicleId,
        relatedVehicleIds: formRelatedVehicleIds,
        customerId: resolvedCustomerId,
        intakeType: formIntakeType,
        serviceType: formServiceType,
        foremanId: formForemanId || null,
        requestChannel: formRequestChannel,
        reportedProblem: formReportedProblem.trim(),
        checkinMileage: formCheckinMileage === "" ? null : Number(formCheckinMileage),
        checkinAt: formCheckinAt,
        priority: formPriority,
        bay: formBay || null,
        estimatedOut: null,
        technicianIds: formTechnicianIds,
        isBackOrder: false,
      });
      fetchWorkOrders();
      closeModal();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create work order.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateWorkOrderDetails = async () => {
    if (!selectedWO) return;
    setFormError("");

    setIsSaving(true);
    try {
      await postApi("admin-update-work-order", {
        id: selectedWO.id,
        priority: editPriority,
        bay: editBay || null,
        estimatedOut: editEstimatedOut || null,
        technicianIds: editTechnicianIds,
        checkinMileage: editCheckinMileage !== "" ? Number(editCheckinMileage) : null,
        isBackOrder: editIsBackOrder,
      });
      fetchWorkOrders();
      closeModal();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to update work order details.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateStatus = async (targetStatus: string) => {
    if (!selectedWO) return;
    if (targetStatus !== "inspected" && selectedWO.hasUnacknowledgedParts) {
      const msg = "Please review and acknowledge newly added parts before updating work order status.";
      setFormError(msg);
      toast.error(msg);
      return;
    }
    if (targetStatus === "under_repair") {
      if (!editBay || !editEstimatedOut) {
        const msg = "Please select a Workshop Bay and Expected Handover (ETA) before starting repair.";
        setFormError(msg);
        toast.error(msg);
        return;
      }
    }
    setFormError("");

    setIsSaving(true);
    try {
      const statusUpdate: Record<string, unknown> = {
        id: selectedWO.id,
        canonicalStatus: targetStatus,
        partsStatus: calculatedPartsStatus,
      };
      if (inspectionActualIssue !== undefined && inspectionActualIssue !== "") {
        statusUpdate.actualIssue = inspectionActualIssue.trim();
      }
      if (editBay) {
        statusUpdate.bay = editBay;
      }
      if (editEstimatedOut) {
        statusUpdate.estimatedOut = editEstimatedOut.includes("T")
          ? editEstimatedOut.replace("T", " ") + (editEstimatedOut.length === 16 ? ":00" : "")
          : editEstimatedOut;
      }
      if (editCheckinMileage !== "") {
        statusUpdate.checkinMileage = Number(editCheckinMileage);
      }
      await postApi("admin-update-work-order", statusUpdate);
      setDetailWO((prev) => prev ? ({
        ...prev,
        canonicalStatus: targetStatus,
        partsStatus: calculatedPartsStatus,
        actualIssue: inspectionActualIssue.trim() || prev.actualIssue,
        bay: editBay || prev.bay,
        estimatedOut: (statusUpdate.estimatedOut as string) || prev.estimatedOut,
        checkinMileage: editCheckinMileage !== "" ? Number(editCheckinMileage) : prev.checkinMileage,
      }) : null);
      setSelectedWO((prev) => prev ? ({
        ...prev,
        canonicalStatus: targetStatus,
        partsStatus: calculatedPartsStatus,
        actualIssue: inspectionActualIssue.trim() || prev.actualIssue,
        bay: editBay || prev.bay,
        estimatedOut: (statusUpdate.estimatedOut as string) || prev.estimatedOut,
        checkinMileage: editCheckinMileage !== "" ? Number(editCheckinMileage) : prev.checkinMileage,
      }) : null);
      fetchWorkOrders();
      closeModal();
      toast.success(`Work order status updated to ${t(`status_${targetStatus}`)}.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update work order status.";
      setFormError(msg);
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const [updatingWorkOrderId, setUpdatingWorkOrderId] = useState<number | null>(null);

  const handleQuickStatusChange = async (wo: WorkOrder, targetStatus: string) => {
    if (!targetStatus || targetStatus === wo.canonicalStatus) return;
    setUpdatingWorkOrderId(wo.id);
    try {
      await postApi("admin-update-work-order", {
        id: wo.id,
        canonicalStatus: targetStatus,
      });
      setDetailWO((prev) => prev && prev.id === wo.id ? ({ ...prev, canonicalStatus: targetStatus }) : prev);
      toast.success(`Status updated to ${t(`status_${targetStatus}`)}.`);
      await fetchWorkOrders();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update status.";
      toast.error(msg);
    } finally {
      setUpdatingWorkOrderId(null);
    }
  };

  const handleUpdatePartsStatus = async () => {
    if (!selectedWO || !canManagePartsStatus) return;
    setFormError("");
    setIsSaving(true);
    try {
      if (!partsOverview) throw new Error("Wait for live stock availability to load before saving Parts Status.");
      if (partsOverrideEnabled && partsOverrideReason.trim().length < 5) {
        throw new Error("Enter a clear override reason of at least 5 characters.");
      }
      await postApi("admin-update-work-order", {
        id: selectedWO.id,
        partsStatus: calculatedPartsStatus,
        partsExpectedDate: ["pending_parts", "partially_arrived"].includes(calculatedPartsStatus) ? partsExpectedDate || null : null,
        partsStatusOverride: partsOverrideEnabled || ["not_required", "parts_ready"].includes(calculatedPartsStatus),
        partsStatusOverrideReason: partsOverrideEnabled ? partsOverrideReason : `Parts status confirmed as ${calculatedPartsStatus}`,
      });
      await fetchWorkOrders();
      closeModal();
      toast.success("Parts status updated successfully.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update Parts Status.";
      setFormError(msg);
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleBackOrder = async (enable: boolean) => {
    if (!selectedWO || !canManagePartsStatus) return;
    setFormError("");
    setIsSaving(true);
    try {
      await postApi("admin-update-work-order", {
        id: selectedWO.id,
        isBackOrder: enable,
      });
      const updated: WorkOrder = {
        ...selectedWO,
        isBackOrder: enable,
      };
      setSelectedWO(updated);
      setEditIsBackOrder(enable);
      setDetailWO((prev) => prev && prev.id === selectedWO.id ? { ...prev, isBackOrder: enable } : prev);
      setWorkOrders((cur) => cur.map((w) => w.id === selectedWO.id ? { ...w, isBackOrder: enable } : w));
      toast.success(enable ? "Back Order enabled. Stock shortage bypass active." : "Back Order disabled. Stock verification restored.");
      await fetchWorkOrders();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update Back Order setting.";
      setFormError(msg);
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveRequiredParts = async () => {
    if (!selectedWO || !canManagePartsStatus) return;
    setFormError("");
    setIsSaving(true);
    try {
      const validParts = inspectionParts.filter((item) => (item.description || "").trim() || (item.code || "").trim() || item.partId);
      if (validParts.length === 0) {
        throw new Error("Please select or specify at least one valid part before saving.");
      }
      if (validParts.some((item) => !(item.description || "").trim() || Number(item.quantity) <= 0)) {
        throw new Error("Every required part needs a description and quantity greater than zero.");
      }
      const res: any = await postApi("admin-save-work-order-part-requirements", { workOrderId: selectedWO.id, items: validParts });
      setInitialInspectionPartsJson(
        JSON.stringify(
          validParts.map((r) => ({
            code: (r.code || "").trim().toUpperCase(),
            description: (r.description || "").trim(),
            quantity: Number(r.quantity) || 1,
          }))
        )
      );
      setIsEditingParts(false);
      setPartsOverviewLoading(true);
      const overview = await loadWorkOrderPartsOverview(selectedWO.id);
      setPartsOverview(overview);
      const newCalculatedStatus = calculatePartsStatus(overview, selectedWO.partsStatus || (selectedWO.partsReadyAt ? "parts_ready" : "not_required"), Boolean(selectedWO.isBackOrder));
      setPartsStatus(newCalculatedStatus);

      if (res?.quotationRevised) {
        const nextStatus = res.canonicalStatus || "quotation_issued";
        const updatedWO = {
          ...selectedWO,
          canonicalStatus: nextStatus,
          status: 3,
          quotationIssuedAt: new Date().toISOString(),
          underRepairAt: null,
          approvedAt: null,
          partsReadyAt: null,
        };
        setSelectedWO(updatedWO);
        setDetailWO((prev) => prev && prev.id === selectedWO.id ? { ...prev, canonicalStatus: nextStatus, underRepairAt: null, approvedAt: null } : prev);
        setWorkOrders((current) => current.map((item) => item.id === selectedWO.id ? { ...item, canonicalStatus: nextStatus } : item));
        toast.success(`Quotation revised to Rev ${res.newRevision || 2}. Reverted to Quotation stage for price review.`);
        await fetchWorkOrders();
        // Automatically open the Quotation modal for immediate review and re-approval
        openQuotationModal(updatedWO);
      } else {
        toast.success("Required parts updated.");
        await fetchWorkOrders();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save required parts.";
      setFormError(msg);
      toast.error(msg);
    } finally {
      setPartsOverviewLoading(false);
      setIsSaving(false);
    }
  };

  const handleRollbackStatus = async () => {
    if (!selectedWO || !canRollbackStatus) return;
    if (rollbackReason.trim().length < 1) {
      const msg = "Enter a rollback reason (at least 1 character).";
      setFormError(msg);
      toast.error(msg);
      return;
    }
    setFormError("");
    setIsSaving(true);
    try {
      const res: any = await postApi("admin-rollback-work-order", { id: selectedWO.id, reason: rollbackReason.trim() });
      const targetStatus = res?.toStatus;
      if (targetStatus) {
        setDetailWO((prev) => prev && prev.id === selectedWO.id ? ({ ...prev, canonicalStatus: targetStatus }) : prev);
        setSelectedWO((prev) => prev ? ({ ...prev, canonicalStatus: targetStatus }) : null);
      }
      await fetchWorkOrders();
      closeModal();
      toast.success(res?.message || "Work order status rolled back successfully.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to roll back work order status.";
      setFormError(msg);
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const getAllowedNextStatuses = (currentStatus: string, currentPartsStatus = "not_required", isBackOrder = false) => {
    let nextStatuses = WORK_ORDER_TRANSITIONS[currentStatus] || [];
    const isPartsPending = !isBackOrder && ["pending_parts", "partially_arrived"].includes(currentPartsStatus);

    if (currentStatus === "approved") {
      const validParts = inspectionParts.filter(
        (item) => Boolean((item.code || "").trim() || (item.description || "").trim() || item.partId)
      );
      const isLabourOnly = currentPartsStatus === "not_required" || validParts.length === 0;
      if (isLabourOnly) {
        nextStatuses = ["under_repair"];
      } else if (isPartsPending) {
        nextStatuses = ["pending_parts"];
      } else {
        nextStatuses = ["parts_ready"];
      }
    } else if (currentStatus === "pending_parts") {
      if (isPartsPending) {
        // Parts still have shortage and Back Order is not active: Cannot confirm parts ready
        nextStatuses = [];
      } else {
        nextStatuses = ["parts_ready"];
      }
    } else if (currentStatus === "parts_ready") {
      if (isPartsPending) {
        // If work order is at parts_ready but has shortage and no Back Order: Cannot start repair
        nextStatuses = [];
      } else {
        nextStatuses = ["under_repair"];
      }
    }

    const availableStatuses = isPartsPending
      ? nextStatuses.filter((status) => !["parts_ready", "under_repair", "ready_for_collection", "collected"].includes(status))
      : nextStatuses;
    if (["manager", "head manager", "service advisor", "receptionist"].includes(signedInRole)) {
      return availableStatuses.filter((status) => HEAD_MANAGER_LIFECYCLE_STATUSES.has(status));
    }
    if (["foreman", "technician", "mechanic", "editor"].includes(signedInRole)) {
      return availableStatuses.filter((status) => TECHNICIAN_LIFECYCLE_STATUSES.has(status));
    }
    return availableStatuses;
  };

  // Badge styler helper
  const getStatusBadge = (status: string) => {
    const config: Record<string, string> = {
      scheduled: "border-sky-200 bg-sky-50 text-sky-700",
      checked_in: "border-indigo-200 bg-indigo-50 text-indigo-700",
      inspected: "border-purple-200 bg-purple-50 text-purple-700",
      quotation_issued: "border-cyan-200 bg-cyan-50 text-cyan-700",
      approved: "border-teal-200 bg-teal-50 text-teal-700",
      pending_parts: "border-amber-200 bg-amber-50 text-amber-700",
      parts_ready: "border-emerald-200 bg-emerald-50 text-emerald-700",
      under_repair: "border-blue-200 bg-blue-50 text-blue-700",
      ready_for_collection: "border-emerald-200 bg-emerald-50 text-emerald-700",
      collected: "border-slate-200 bg-slate-100 text-slate-600"
    };
    return config[status] || "border-slate-200 bg-slate-50 text-slate-700";
  };

  const getPriorityBadge = (priority: string) => {
    const config: Record<string, string> = {
      Normal: "border-slate-200 bg-slate-50 text-slate-700",
      High: "border-amber-200 bg-amber-50 text-amber-700",
      Urgent: "border-rose-200 bg-rose-50 text-rose-700"
    };
    return config[priority] || "border-slate-200 bg-slate-50 text-slate-700";
  };

  const getPriorityCardAccent = (priority: string) => {
    const config: Record<string, string> = {
      Normal: "maw-priority-card maw-priority-normal bg-white",
      High: "maw-priority-card maw-priority-high bg-[#fffaf0]",
      Urgent: "maw-priority-card maw-priority-urgent bg-[#fff5f5]",
    };
    return config[priority] || config.Normal;
  };

  if (isLoading && !hasLoaded) {
    return (
      <PageLoading
        title="Loading Work Orders..."
        description="Fetching workshop repair jobs and active lifecycle stages..."
      />
    );
  }

  if (modalMode === "quotation" && selectedWO) {
    return (
      <WorkOrderQuotationDialog
        workOrder={selectedWO}
        canManage={canManageQuotation}
        onClose={closeModal}
        onChanged={fetchWorkOrders}
      />
    );
  }

  if (modalMode === "create") {
    return (
      <div className="space-y-4">
        {/* Header with Back Button */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={closeModal}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Work Orders
            </button>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900">
                New Work Order
              </h1>
              <p className="mt-0.5 text-xs text-slate-500">
                Check in an unscheduled vehicle and create its work order directly in the workshop.
              </p>
            </div>
          </div>
        </div>

        {formError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-600">
            {formError}
          </div>
        )}

        <div className="space-y-5 pb-6">
          <section className="relative z-30 rounded-2xl border border-slate-200 bg-white shadow-2xs">
            <div className="flex items-center gap-3.5 rounded-t-2xl border-b border-blue-100/80 bg-gradient-to-r from-blue-50/70 via-slate-50/50 to-white px-5 py-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-500/20">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-md bg-blue-100 px-2 py-0.5 text-[10px] font-black tracking-wider uppercase text-blue-800">
                  Step 01
                </span>
                <h3 className="text-base font-extrabold text-slate-900">Vehicle &amp; Company</h3>
              </div>
            </div>
            <div className="space-y-4 p-4 sm:p-5">
              {/* Vehicle (Unit No / Reg No) Select */}
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-700">
                  Vehicle (Unit No / Reg No) *
                </label>
                <SearchableVehicleSelect
                  vehicles={vehicles}
                  companies={companies}
                  value={formVehicleId}
                  workOrders={workOrders}
                  onChange={(nextVehicleId) => {
                    setFormVehicleId(nextVehicleId);
                    if (nextVehicleId) {
                      setFormRelatedVehicleIds((current) => current.filter((id) => id !== nextVehicleId));
                      const chosenVeh = vehicles.find((v) => v.id === nextVehicleId);
                      if (chosenVeh && chosenVeh.companyId) {
                        setFormCompanyId(chosenVeh.companyId);
                        const matchedCustomer = customers.find((c) => c.companyId === chosenVeh.companyId);
                        if (matchedCustomer) {
                          setFormCustomerId(matchedCustomer.id);
                        }
                      }
                      const isTrailer = isTrailerVehicle(chosenVeh);
                      const allowedIssues = isTrailer ? TRAILER_COMMON_ISSUES : PRIME_MOVER_COMMON_ISSUES;
                      if (formReportedProblem && !allowedIssues.includes(formReportedProblem)) {
                        setFormReportedProblem("");
                        setFormCommonIssue("");
                      }
                    } else {
                      setFormCompanyId("");
                      setFormCustomerId("");
                      setFormRelatedVehicleIds([]);
                    }
                  }}
                />
                {activeWoForFormVehicle ? (
                  <div className="mt-2.5 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <div>
                      <p className="font-bold">Active Work Order In Progress ({activeWoForFormVehicle.workOrderNo})</p>
                      <p className="mt-0.5 text-[11px] text-amber-700 leading-normal">
                        This vehicle currently has an ongoing job with status: <span className="font-bold uppercase tracking-wider">{activeWoForFormVehicle.canonicalStatus.replace(/_/g, " ")}</span>. A vehicle cannot have multiple ongoing workshop jobs simultaneously. Please complete or update the existing order.
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Vehicle Type & Company details */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-700">
                    Vehicle Type (Automatic)
                  </label>
                  {selectedFormVehicle ? (
                    <div className="flex h-10 w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Truck className="h-4 w-4 text-blue-700 shrink-0" />
                        <span className="font-bold text-gray-900">
                          {selectedFormVehicle.equipment || selectedFormVehicle.equipmentType || "Prime Mover"}
                        </span>
                      </div>
                      <span className="text-[11px] font-semibold text-emerald-700 shrink-0">✓ Auto-filled</span>
                    </div>
                  ) : (
                    <div className="flex h-10 w-full items-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-3 py-2 text-xs text-gray-400">
                      <Truck className="mr-2 h-4 w-4 text-gray-300 shrink-0" />
                      Automatically filled once a vehicle is selected above.
                    </div>
                  )}
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-700">
                    Company (Automatic)
                  </label>
                  {formCompanyId ? (
                    <div className="flex h-10 w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-blue-700 shrink-0" />
                        <span className="font-bold text-gray-900">
                          {companies.find((c) => c.id === formCompanyId)?.name || `Company #${formCompanyId}`}
                        </span>
                        {companies.find((c) => c.id === formCompanyId)?.autocountDebtorCode ? (
                          <span className="rounded bg-blue-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-blue-800">
                            {companies.find((c) => c.id === formCompanyId)?.autocountDebtorCode}
                          </span>
                        ) : null}
                      </div>
                      <span className="text-[11px] font-semibold text-emerald-700 shrink-0">✓ Auto-identified</span>
                    </div>
                  ) : (
                    <div className="flex h-10 w-full items-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-3 py-2 text-xs text-gray-400">
                      <Building2 className="mr-2 h-4 w-4 text-gray-300 shrink-0" />
                      Automatically identified once a vehicle is selected above.
                    </div>
                  )}
                </div>
              </div>

              {/* Check-in Mileage */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-700">
                    Check-in Mileage {isSelectedVehicleTrailer ? "(Optional / Trailer)" : "(KM)"}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={formCheckinMileage}
                    onChange={(e) => setFormCheckinMileage(e.target.value)}
                    placeholder={
                      isSelectedVehicleTrailer
                        ? "N/A (Chassis / Trailer)"
                        : selectedFormVehicle && Number(String(selectedFormVehicle.mileage || "").replace(/\D/g, "")) > 0
                        ? `Min ${Number(String(selectedFormVehicle.mileage || "").replace(/\D/g, "")).toLocaleString()} km`
                        : "e.g. 125000"
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  {!isSelectedVehicleTrailer && selectedFormVehicle && Number(String(selectedFormVehicle.mileage || "").replace(/\D/g, "")) > 0 && (
                    <p className="mt-1 text-xs text-slate-500">
                      Last recorded: <span className="font-semibold text-slate-700">{Number(String(selectedFormVehicle.mileage || "").replace(/\D/g, "")).toLocaleString()} km</span> (Odometer cannot decrease)
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="relative z-20 rounded-2xl border border-slate-200 bg-white shadow-2xs">
            <div className="flex items-center gap-3.5 rounded-t-2xl border-b border-amber-100/80 bg-gradient-to-r from-amber-50/70 via-slate-50/50 to-white px-5 py-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm shadow-amber-500/20">
                <Wrench className="h-5 w-5" />
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-black tracking-wider uppercase text-amber-800">
                  Step 02
                </span>
                <h3 className="text-base font-extrabold text-slate-900">Service Request</h3>
              </div>
            </div>
            <div className="space-y-4 p-4 sm:p-5">
              <div className="relative z-30 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* 1. Service Type */}
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-700">
                    Service Type *
                  </label>
                  <AdminSelect
                    value={formServiceType}
                    onChange={(e) => {
                      const nextType = e.target.value;
                      setFormServiceType(nextType);
                      if (nextType === "Rescue") {
                        setFormIntakeType("rescue");
                        setFormPriority("Urgent");
                        setFormRequestChannel("Rescue Hotline");
                      } else {
                        setFormIntakeType("walk_in");
                        if (formPriority === "Urgent") setFormPriority("Normal");
                        setFormRequestChannel("Walk-in");
                      }
                    }}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">-- Select Service Type --</option>
                    {SERVICE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </AdminSelect>
                </div>

                {/* 2. Common Issue */}
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-700">
                    Common Issue *
                  </label>
                  <AdminSelect
                    value={formReportedProblem}
                    onChange={(e) => {
                      const chosen = e.target.value;
                      setFormReportedProblem(chosen);
                      setFormCommonIssue(chosen);
                    }}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">-- Select Common Issue --</option>
                    {activeCommonIssues.map((issue) => (
                      <option key={issue} value={issue}>
                        {issue}
                      </option>
                    ))}
                  </AdminSelect>
                </div>
              </div>
            </div>
          </section>

          <section className="relative z-10 rounded-2xl border border-slate-200 bg-white shadow-2xs">
            <div className="flex items-center gap-3.5 rounded-t-2xl border-b border-indigo-100/80 bg-gradient-to-r from-indigo-50/70 via-slate-50/50 to-white px-5 py-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm shadow-indigo-500/20">
                <CalendarClock className="h-5 w-5" />
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-md bg-indigo-100 px-2 py-0.5 text-[10px] font-black tracking-wider uppercase text-indigo-800">
                  Step 03
                </span>
                <h3 className="text-base font-extrabold text-slate-900">Check-in Details</h3>
              </div>
            </div>
            <div className="space-y-4 p-4 sm:p-5 pb-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-700">Check-in Time *</label>
                  <DesktopDateTimePicker value={formCheckinAt} onChange={setFormCheckinAt} required />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-700">
                    Priority Level
                  </label>
                  <AdminSelect
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {PRIORITIES.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </AdminSelect>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="flex flex-col-reverse gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-xs text-slate-500"><span className="font-bold text-red-500">*</span> Required fields must be completed</p>
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={closeModal}
              className="h-10 rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSaving || Boolean(activeWoForFormVehicle)}
              onClick={handleCreateWorkOrder}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1e3a8a] px-6 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />{isSaving ? "Creating..." : "Create Work Order"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {detailWO ? (
        (() => {
          const isUrgent = (detailWO.priority || "").toLowerCase() === "urgent";
          const isHigh = (detailWO.priority || "").toLowerCase() === "high";

          // Activity Log calculation
          const originChannel = (detailWO.requestChannel || "").toLowerCase();
          const sourceLabel = originChannel.includes("walk")
            ? "Walk-in Desk"
            : originChannel.includes("rescue")
              ? "Rescue Hotline"
              : "Customer App";

          const activityItems = [
            detailWO.collectedAt ? { time: detailWO.collectedAt, activity: "Status updated to Ready for Collection / Collected", by: "System" } : null,
            detailWO.completedAt ? { time: detailWO.completedAt, activity: "Status updated to Ready for Collection", by: "System" } : null,
            detailWO.underRepairAt ? { time: detailWO.underRepairAt, activity: "Status updated to Under Repair", by: "System" } : null,
            detailWO.partsReadyAt ? { time: detailWO.partsReadyAt, activity: "Parts marked Ready for Installation", by: "System" } : null,
            detailWO.approvedAt ? { time: detailWO.approvedAt, activity: "Quotation approved by Customer", by: detailWO.contactName || "Customer" } : null,
            detailWO.quotationIssuedAt ? { time: detailWO.quotationIssuedAt, activity: "Quotation issued & submitted", by: "Admin" } : null,
            detailWO.inspectedAt ? { time: detailWO.inspectedAt, activity: "Inspection completed & assessment recorded", by: detailWO.foremanName || "Foreman" } : null,
            (detailWO.createdAt || detailWO.checkinAt) ? { time: (detailWO.createdAt || detailWO.checkinAt), activity: `Work Order created via ${sourceLabel}`, by: "System" } : null,
          ].filter(Boolean) as { time: string; activity: string; by: string }[];

          // Attachments
          const attachments = (detailWO.photos || []).map((photo: any, idx: number) => {
            const isPdf = Boolean(
              photo.mimeType === "application/pdf" ||
              photo.mime_type === "application/pdf" ||
              (photo.originalName || photo.original_name || photo.caption || "").toLowerCase().endsWith(".pdf")
            );
            const byteSize = photo.byteSize || photo.byte_size;
            const formattedSize = byteSize ? (byteSize >= 1048576 ? `${(byteSize / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(byteSize / 1024))} KB`) : "1.8 MB";

            return {
              id: photo.id,
              name: photo.originalName || photo.original_name || photo.caption || `Attachment ${idx + 1}.${isPdf ? "pdf" : "jpg"}`,
              time: photo.createdAt || photo.takenAt || photo.created_at || detailWO.createdAt || new Date().toISOString(),
              size: formattedSize,
              by: photo.uploadedBy || photo.uploaded_by || "System",
              type: isPdf ? "pdf" : "image",
              url: apiAssetUrl("work-order-photo-file", { id: photo.id }),
            };
          });

          return (
            <div className="space-y-5 w-full pb-12 animate-in fade-in duration-150 text-xs">
              {/* Top Header */}
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => {
                      setDetailWO(null);
                      setIsDetailEditing(false);
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-blue-600 transition-colors cursor-pointer mb-1"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Work Orders
                  </button>
                  <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
                      {detailWO.workOrderNo}
                    </h1>
                    {renderWorkOrderStatusPill(detailWO.canonicalStatus)}
                  </div>
                  <div className="flex items-center gap-4 text-[11px] text-slate-400 font-medium pt-1 flex-wrap">
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      Created: {formatCreatedDateTime(detailWO.createdAt || detailWO.checkinAt)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      Last Updated: {formatCreatedDateTime(detailWO.updatedAt || detailWO.createdAt || detailWO.checkinAt)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5" />
                      Intake Source: {sourceLabel}
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2.5 flex-wrap">
                  {!isDetailEditing ? (
                    detailWO.canonicalStatus !== "collected" && (
                      <button
                        key="btn-edit-wo"
                        type="button"
                        onClick={() => setIsDetailEditing(true)}
                        className="inline-flex h-10 items-center gap-2 rounded-xl border border-blue-600 bg-white px-5 text-xs font-bold text-blue-600 shadow-2xs hover:bg-blue-50 transition-colors cursor-pointer"
                      >
                        <Edit className="h-4 w-4" />
                        Edit Work Order
                      </button>
                    )
                  ) : (
                    <>
                      <button
                        key="btn-cancel-wo"
                        type="button"
                        disabled={isSaving}
                        onClick={() => {
                          setIsDetailEditing(false);
                          setEditPriority(detailWO.priority || "Normal");
                          setEditBay(detailWO.bay || "");
                          setEditEstimatedOut(detailWO.estimatedOut || "");
                          setEditCheckinMileage(detailWO.checkinMileage !== null && detailWO.checkinMileage !== undefined ? String(detailWO.checkinMileage) : "");
                          setDetailNotes(detailWO.reportedProblem || detailWO.notes || "");
                        }}
                        className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        <X className="h-4 w-4" />
                        Cancel
                      </button>
                      <button
                        key="btn-save-wo"
                        type="button"
                        disabled={isSaving}
                        onClick={handleSaveDetailChanges}
                        className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        <Save className="h-4 w-4" />
                        {isSaving ? "Saving..." : "Save Changes"}
                      </button>
                    </>
                  )}

                  {canViewQuotation && shouldShowQuotationAction(detailWO) && (
                    <button
                      type="button"
                      onClick={() => openQuotationModal(detailWO)}
                      className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <FileText className="h-4 w-4 text-slate-600" />
                      Quotation
                    </button>
                  )}

                  {canUpdateStatus && (
                    <button
                      type="button"
                      disabled={detailWO.canonicalStatus === "collected"}
                      onClick={() => openStatusModal(detailWO)}
                      title={detailWO.canonicalStatus === "collected" ? "Completed orders cannot be updated" : "Update Status"}
                      className={`inline-flex h-10 items-center gap-1.5 rounded-xl px-5 text-xs font-bold transition-colors ${
                        detailWO.canonicalStatus === "collected"
                          ? "bg-slate-200 text-slate-400 cursor-not-allowed opacity-60"
                          : "bg-blue-600 text-white shadow-xs hover:bg-blue-700 cursor-pointer"
                      }`}
                    >
                      <Calendar className="h-4 w-4" />
                      Update Status
                    </button>
                  )}
                </div>
              </div>

              {/* Card 1: GENERAL INFORMATION */}
              <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 mb-5">
                  GENERAL INFORMATION
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-4">
                  {/* Row 1 */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5">Vehicle No.</label>
                    <input
                      type="text"
                      readOnly
                      value={detailWO.vehicleNo}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-bold text-slate-800 cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5">Vehicle Type</label>
                    <input
                      type="text"
                      readOnly
                      value={`${detailWO.brand || ""} ${detailWO.model || ""}`.trim() || "-"}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-semibold text-slate-800 cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5">Company</label>
                    <input
                      type="text"
                      readOnly
                      value={detailWO.companyName || "-"}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-semibold text-slate-800 cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5">Contact</label>
                    <input
                      type="text"
                      readOnly
                      value={detailWO.contactName || detailWO.customerPhone || "-"}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-semibold text-slate-800 cursor-not-allowed"
                    />
                  </div>

                  {/* Row 2 */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5">Workshop Bay</label>
                    {isDetailEditing ? (
                      <AdminSelect
                        value={editBay}
                        onChange={(e) => setEditBay(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
                      >
                        <option value="">Unassigned</option>
                        {BAYS.map((b) => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </AdminSelect>
                    ) : (
                      <input
                        type="text"
                        readOnly
                        value={detailWO.bay || "Unassigned"}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-semibold text-slate-800 cursor-not-allowed"
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5">Assigned Repair Person</label>
                    {isDetailEditing ? (
                      <AdminSelect
                        value={editTechnicianIds[0] || ""}
                        onChange={(e) => setEditTechnicianIds(e.target.value ? [Number(e.target.value)] : [])}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
                      >
                        <option value="">Unassigned</option>
                        {assignableStaff.map((s) => (
                          <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                        ))}
                      </AdminSelect>
                    ) : (
                      <input
                        type="text"
                        readOnly
                        value={(detailWO.technicians || []).map((t) => t.name).join(", ") || detailWO.foremanName || "Unassigned"}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-semibold text-slate-800 cursor-not-allowed"
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5">Priority Level</label>
                    {isDetailEditing ? (
                      <AdminSelect
                        value={editPriority}
                        onChange={(e) => setEditPriority(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
                      >
                        {PRIORITIES.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </AdminSelect>
                    ) : (
                      <input
                        type="text"
                        readOnly
                        value={detailWO.priority || "Normal"}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-semibold text-slate-800 cursor-not-allowed"
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5">Job Type</label>
                    <input
                      type="text"
                      readOnly
                      value={detailWO.serviceType || (isRescueWorkOrder(detailWO) ? "Rescue" : "Repair")}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-semibold text-slate-800 cursor-not-allowed"
                    />
                  </div>

                  {/* Row 3 */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5">Expected Completion Date</label>
                    {isDetailEditing ? (
                      <DesktopDatePicker
                        value={editEstimatedOut}
                        onChange={setEditEstimatedOut}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
                      />
                    ) : (
                      <input
                        type="text"
                        readOnly
                        value={detailWO.estimatedOut ? formatEtaDisplay(detailWO.estimatedOut) : "—"}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-semibold text-slate-800 cursor-not-allowed"
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5">Check-in Mileage (KM)</label>
                    {isDetailEditing ? (
                      <input
                        type="number"
                        value={editCheckinMileage}
                        onChange={(e) => setEditCheckinMileage(e.target.value)}
                        placeholder="e.g. 125000"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
                      />
                    ) : (
                      <input
                        type="text"
                        readOnly
                        value={detailWO.checkinMileage !== null && detailWO.checkinMileage !== undefined ? String(detailWO.checkinMileage) : "—"}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-semibold text-slate-800 cursor-not-allowed"
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5">Reference</label>
                    {isDetailEditing ? (
                      <input
                        type="text"
                        value={detailReference}
                        onChange={(e) => setDetailReference(e.target.value)}
                        placeholder="e.g. PO-10293"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800"
                      />
                    ) : (
                      <input
                        type="text"
                        readOnly
                        value={detailWO.partsReference || detailWO.autocountJobNo || "—"}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-semibold text-slate-800 cursor-not-allowed"
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5">Back Order</label>
                    <div className="flex items-center gap-2.5 pt-1">
                      <label className={`relative inline-flex items-center ${isDetailEditing ? "cursor-pointer" : "cursor-not-allowed"}`}>
                        <input
                          type="checkbox"
                          disabled={!isDetailEditing}
                          checked={isDetailEditing ? editIsBackOrder : Boolean(detailWO.isBackOrder)}
                          onChange={(e) => setEditIsBackOrder(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                      </label>
                      <span className="text-[10px] text-slate-400 font-medium">
                        {(isDetailEditing ? editIsBackOrder : detailWO.isBackOrder)
                          ? "Enabled: VIP bypass stock availability"
                          : "Disabled: Standard inventory stock availability rules apply."}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: ISSUES & DIAGNOSTIC NOTES */}
              <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                    ISSUES &amp; DIAGNOSTIC FINDINGS
                  </h3>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {/* Initial Reported Issue */}
                  <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700">
                        Initial Reported Issue
                      </span>
                      <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-800">
                        Intake
                      </span>
                    </div>
                    {isDetailEditing ? (
                      <textarea
                        rows={3}
                        value={detailNotes}
                        onChange={(e) => setDetailNotes(e.target.value)}
                        placeholder="Customer reported problem at intake..."
                        className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    ) : (
                      <p className="text-xs text-slate-900 font-semibold whitespace-pre-wrap leading-relaxed">
                        {detailWO.reportedProblem || detailWO.notes || "No reported problem recorded."}
                      </p>
                    )}
                  </div>

                  {/* Actual Issue / Inspection Findings */}
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                        Actual Issue / Inspection Findings
                      </span>
                      <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[9px] font-bold text-indigo-800">
                        Diagnosis
                      </span>
                    </div>
                    {isDetailEditing ? (
                      <textarea
                        rows={3}
                        value={editActualIssue}
                        onChange={(e) => setEditActualIssue(e.target.value)}
                        placeholder="Technician findings, root cause, and actual defect details..."
                        className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    ) : (
                      <p className="text-xs text-slate-900 font-semibold whitespace-pre-wrap leading-relaxed">
                        {detailWO.actualIssue ? (
                          detailWO.actualIssue
                        ) : (
                          <span className="text-slate-400 font-normal italic">Pending inspection diagnosis supplement</span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Bottom 2-Column Grid: ATTACHMENTS & ACTIVITY LOG */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* ATTACHMENTS */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                      ATTACHMENTS ({attachments.length})
                    </h3>
                    <div>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handlePhotoUpload}
                        className="hidden"
                        accept="image/*,.pdf"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors cursor-pointer"
                      >
                        + Upload Photo / PDF
                      </button>
                    </div>
                  </div>

                  {attachments.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-100 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                            <th className="pb-2.5 font-bold">FILE NAME</th>
                            <th className="pb-2.5 font-bold">DATE &amp; TIME</th>
                            <th className="pb-2.5 font-bold">SIZE</th>
                            <th className="pb-2.5 font-bold text-left">UPLOADED BY</th>
                            <th className="pb-2.5 font-bold text-right whitespace-nowrap">ACTION</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {attachments.map((att) => (
                            <tr key={att.id} className="hover:bg-slate-50/60 transition-colors">
                              <td className="py-3 pr-2">
                                <button
                                  type="button"
                                  onClick={() => setPreviewAttachment(att)}
                                  className="flex items-center gap-2 text-left group cursor-pointer"
                                  title="Click to preview"
                                >
                                  {att.type === "pdf" ? (
                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600 border border-rose-200/60 group-hover:bg-rose-100 group-hover:scale-105 transition-all">
                                      <FileText className="h-3.5 w-3.5" />
                                    </span>
                                  ) : (
                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 border border-blue-200/60 group-hover:bg-blue-100 group-hover:scale-105 transition-all">
                                      <Camera className="h-3.5 w-3.5" />
                                    </span>
                                  )}
                                  <span className="font-bold text-slate-800 truncate max-w-[200px] group-hover:text-blue-600 group-hover:underline transition-colors">
                                    {att.name}
                                  </span>
                                </button>
                              </td>
                              <td className="py-3 text-slate-500 font-medium whitespace-nowrap">{formatCreatedDateTime(att.time)}</td>
                              <td className="py-3 text-slate-500 font-medium">{att.size}</td>
                              <td className="py-3 text-slate-600 font-medium">{att.by}</td>
                              <td className="py-3 text-right whitespace-nowrap">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setPreviewAttachment(att)}
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-blue-600 transition-colors cursor-pointer"
                                    title="Preview in modal"
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                  </button>
                                  <a
                                    href={att.url}
                                    download={att.name}
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-blue-600 transition-colors"
                                    title="Download"
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                  </a>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 p-6 text-center text-slate-400">
                      <Camera className="h-8 w-8 text-slate-300 mb-2" />
                      <p className="text-xs font-semibold text-slate-500">No attachments uploaded yet</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Click + Upload Photo / PDF to add inspection photos or PDF documents.</p>
                    </div>
                  )}
                </div>

                {/* ACTIVITY LOG */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                      ACTIVITY LOG
                    </h3>
                    <span className="text-xs font-bold text-slate-400">
                      Audit Trail
                    </span>
                  </div>

                  {activityItems.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-100 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                            <th className="pb-2.5 font-bold">DATE &amp; TIME</th>
                            <th className="pb-2.5 font-bold">ACTIVITY</th>
                            <th className="pb-2.5 font-bold text-left">BY</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {activityItems.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                              <td className="py-3 text-slate-500 font-medium whitespace-nowrap pr-3">
                                <div className="flex items-center gap-2">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                  <span>{formatCreatedDateTime(item.time)}</span>
                                </div>
                              </td>
                              <td className="py-3 font-semibold text-slate-800">{item.activity}</td>
                              <td className="py-3 text-left text-slate-500 font-medium whitespace-nowrap">{item.by}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 p-6 text-center text-slate-400">
                      <Clock className="h-8 w-8 text-slate-300 mb-2" />
                      <p className="text-xs font-semibold text-slate-500">No activity recorded</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()
      ) : (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Work Orders</h1>
              <p className="text-xs text-slate-500 mt-0.5">Manage and track all workshop work orders</p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Active / History Switcher */}
              <div className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-slate-100/90 p-1" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={recordScope === "active"}
                  onClick={() => changeRecordScope("active")}
                  className={`inline-flex h-8 items-center justify-center rounded-lg px-3.5 text-xs font-bold transition-all cursor-pointer ${
                    recordScope === "active" ? "bg-white text-blue-700 shadow-2xs font-extrabold" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <ListTodo className="mr-1.5 h-3.5 w-3.5 text-blue-600" />
                  Active Work Orders
                  <span
                    className={`ml-1.5 rounded-full px-1.5 py-0.2 text-[10px] ${
                      recordScope === "active" ? "bg-blue-50 text-blue-600 font-extrabold" : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {recordScope === "active" ? total || displayedWorkOrders.length : ""}
                  </span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={recordScope === "history"}
                  onClick={() => changeRecordScope("history")}
                  className={`inline-flex h-8 items-center justify-center rounded-lg px-3.5 text-xs font-bold transition-all cursor-pointer ${
                    recordScope === "history" ? "bg-white text-blue-700 shadow-2xs font-extrabold" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <HistoryIcon className="mr-1.5 h-3.5 w-3.5 text-slate-500" />
                  History
                  {recordScope === "history" && (
                    <span className="ml-1.5 rounded-full bg-blue-50 px-1.5 py-0.2 text-[10px] font-extrabold text-blue-600">
                      {total || displayedWorkOrders.length}
                    </span>
                  )}
                </button>
              </div>


              {canCreate ? (
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#1e3a8a] px-4 text-xs font-bold text-white shadow-xs transition-colors hover:bg-blue-800 cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  New Work Order
                </button>
              ) : null}
            </div>
          </div>

          {/* Unified Filter & Tabs Card (matching Bookings design) */}
          <div className="relative z-20 rounded-2xl border border-slate-200 bg-white shadow-2xs">
            {/* Top: Status Tabs */}
            <div className="flex items-center gap-6 sm:gap-8 border-b border-slate-100 px-6 pt-3.5 overflow-x-auto no-scrollbar">
              {currentStatusTabs.map((tab) => {
                const isActive = statusFilter === tab.id;
                return (
                  <button
                    key={tab.id || "all"}
                    type="button"
                    onClick={() => {
                      setStatusFilter(tab.id);
                      setPage(1);
                    }}
                    className={`relative inline-flex h-11 shrink-0 items-center gap-2 border-b-2 px-1 text-xs font-bold transition-colors cursor-pointer ${
                      isActive
                        ? "border-blue-600 text-blue-600"
                        : "border-transparent text-slate-700 hover:text-blue-600"
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                        isActive ? "bg-blue-50 text-blue-600" : tab.badgeColor || "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Bottom: Search & Filter Inputs Grid */}
            <div className={`grid grid-cols-1 gap-3 px-6 py-4 ${
              recordScope === "history"
                ? "md:grid-cols-[1.4fr_1.1fr_1fr_1fr_auto]"
                : "md:grid-cols-[1.5fr_1.2fr_1.2fr_auto]"
            }`}>
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search WO#, plate, or vehicle..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPage(1);
                  }}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-xs font-medium text-slate-800 placeholder:text-slate-400 shadow-2xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                />
              </div>

              {/* Company Dropdown */}
              <div>
                <AdminSelect
                  value={companyFilter}
                  onChange={(e) => {
                    setCompanyFilter(e.target.value);
                    setPage(1);
                  }}
                  placement="bottom"
                  className="h-10 text-xs font-medium w-full bg-white rounded-xl border-slate-200"
                  aria-label="Filter work order company"
                >
                  <option value="">All Companies</option>
                  {companies
                    .filter((c) => c.id !== null && c.id !== undefined && Number(c.id) > 0)
                    .map((c) => (
                      <option key={`comp-${c.id}`} value={String(c.id)}>
                        {c.name}
                      </option>
                    ))}
                </AdminSelect>
              </div>

              {recordScope === "history" ? (
                <>
                  {/* Completed from */}
                  <div>
                    <DesktopDatePicker
                      value={historyDateFrom}
                      onChange={(value) => {
                        setHistoryDateFrom(value);
                        setPage(1);
                      }}
                      placeholder="Completed from"
                      ariaLabel="Filter history completed from date"
                      allowPastDates
                      className="h-10 text-xs w-full bg-white rounded-xl border-slate-200"
                    />
                  </div>
                  {/* Completed to */}
                  <div>
                    <DesktopDatePicker
                      value={historyDateTo}
                      onChange={(value) => {
                        setHistoryDateTo(value);
                        setPage(1);
                      }}
                      placeholder="Completed to"
                      ariaLabel="Filter history completed to date"
                      allowPastDates
                      className="h-10 text-xs w-full bg-white rounded-xl border-slate-200"
                    />
                  </div>
                </>
              ) : (
                /* Vehicle Dropdown */
                <div>
                  <AdminSelect
                    value={vehicleFilter}
                    onChange={(e) => {
                      setVehicleFilter(e.target.value);
                      setPage(1);
                    }}
                    placement="bottom"
                    className="h-10 text-xs font-medium w-full bg-white rounded-xl border-slate-200"
                    aria-label="Filter work order vehicle"
                  >
                    <option value="">All Vehicles</option>
                    {vehicles
                      .filter((v) => v.id !== null && v.id !== undefined && Number(v.id) > 0)
                      .map((v) => (
                        <option key={`veh-${v.id}`} value={String(v.id)}>
                          {v.regNo || v.vecNo || v.unitNo || `Vehicle #${v.id}`} ({v.brand || "-"})
                        </option>
                      ))}
                  </AdminSelect>
                </div>
              )}

              {/* Reset Button */}
              <button
                type="button"
                onClick={handleClearFilters}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <RotateCcw className="h-4 w-4 text-slate-500" />
                Reset
              </button>
            </div>
          </div>



          {/* Work Orders Table */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            {isLoading ? (
              <div className="px-6 py-16 text-center">
                <Clock className="mx-auto mb-3 h-7 w-7 animate-spin text-blue-600" />
                <p className="text-sm font-semibold text-slate-600">Loading work orders...</p>
              </div>
            ) : error ? (
              <div className="px-6 py-12 text-center">
                <AlertCircle className="mx-auto mb-2 h-7 w-7 text-rose-500" />
                <p className="text-sm font-bold text-rose-700">Unable to load work orders</p>
                <p className="mt-1 text-xs text-slate-500">{error}</p>
                <button
                  type="button"
                  onClick={() => void fetchWorkOrders()}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Try Again
                </button>
              </div>
            ) : displayedWorkOrders.length === 0 ? (
              <div className="px-6 py-16 text-center text-xs text-slate-500">
                No work orders found matching your criteria.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100">
                  <thead className="bg-slate-50/70">
                    <tr>
                      <SortableHeader
                        label="WORK ORDER"
                        sortKey="wo"
                        currentSortKey={activeSortKey}
                        currentSortDirection={activeSortDirection}
                        onSort={handleHeaderSort}
                        className="px-4 py-3.5 text-[11px] text-left"
                      />
                      <SortableHeader
                        label="PRIORITY"
                        sortKey="priority"
                        currentSortKey={activeSortKey}
                        currentSortDirection={activeSortDirection}
                        onSort={handleHeaderSort}
                        className="px-4 py-3.5 text-[11px] text-left"
                      />
                      <SortableHeader
                        label="VEHICLE"
                        sortKey="vehicle"
                        currentSortKey={activeSortKey}
                        currentSortDirection={activeSortDirection}
                        onSort={handleHeaderSort}
                        className="px-4 py-3.5 text-[11px] text-left"
                      />
                      <SortableHeader
                        label="COMPANY"
                        sortKey="company"
                        currentSortKey={activeSortKey}
                        currentSortDirection={activeSortDirection}
                        onSort={handleHeaderSort}
                        className="px-4 py-3.5 text-[11px] text-left"
                      />
                      <SortableHeader
                        label="CURRENT STATUS"
                        sortKey="status"
                        currentSortKey={activeSortKey}
                        currentSortDirection={activeSortDirection}
                        onSort={handleHeaderSort}
                        className="px-4 py-3.5 text-[11px] text-left"
                      />
                      <SortableHeader
                        label="WORKSHOP BAY"
                        sortKey="bay"
                        currentSortKey={activeSortKey}
                        currentSortDirection={activeSortDirection}
                        onSort={handleHeaderSort}
                        className="px-4 py-3.5 text-[11px] text-left"
                      />
                      <SortableHeader
                        label="EST. OUT"
                        sortKey="eta"
                        currentSortKey={activeSortKey}
                        currentSortDirection={activeSortDirection}
                        onSort={handleHeaderSort}
                        className="px-4 py-3.5 text-[11px] text-left"
                      />
                      <th scope="col" className="px-4 py-3.5 text-right whitespace-nowrap text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                        ACTIONS
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white text-xs">
                    {displayedWorkOrders.map((wo) => {
                      const isExpanded = expandedWorkOrderIds.has(wo.id);
                      const technicianNames = (wo.technicians || []).map((m) => m.name).join(", ");
                      const currentStageKey = getWorkOrderStageKey(wo.canonicalStatus);
                      const currentStageIndex = getWorkOrderStageIndex(wo.canonicalStatus);
                      const isUrgent = (wo.priority || "").toLowerCase() === "urgent";
                      const isHigh = (wo.priority || "").toLowerCase() === "high";
                      const needsPartsReview = Boolean(wo.hasUnacknowledgedParts);
                      const priorityAccentColor = needsPartsReview ? "bg-amber-500" : isUrgent ? "bg-rose-600" : isHigh ? "bg-amber-500" : "bg-blue-600";
                      const priorityTextColor = isUrgent ? "text-rose-600" : isHigh ? "text-amber-600" : "text-blue-600";
                      const priorityIconClass = isUrgent
                        ? "bg-rose-50 text-rose-600 border border-rose-200"
                        : isHigh
                          ? "bg-amber-50 text-amber-600 border border-amber-200"
                          : isExpanded
                            ? "bg-blue-50 text-blue-600 border border-blue-100"
                            : "bg-slate-100/90 text-slate-500 border border-slate-200/60";

                      return (
                        <Fragment key={wo.id}>
                          <tr className={`transition-colors duration-200 relative ${isExpanded
                              ? isUrgent
                                ? "bg-rose-50/20 border-t-2 border-t-rose-100 shadow-[0_2px_6px_rgba(225,29,72,0.04)]"
                                : isHigh
                                  ? "bg-amber-50/20 border-t-2 border-t-amber-100 shadow-[0_2px_6px_rgba(217,119,6,0.04)]"
                                  : "bg-blue-50/20 border-t-2 border-t-blue-100 shadow-[0_2px_6px_rgba(30,58,138,0.04)]"
                              : needsPartsReview
                                ? "bg-amber-50/35 hover:bg-amber-50/60 border-b border-amber-100"
                                : "hover:bg-slate-50/80 border-b border-slate-100"
                            }`}>
                            {/* Work Order */}
                            <td className="relative px-4 py-3.5">
                              <span
                                className={`absolute left-0 top-0 -bottom-[1px] w-[2.5px] ${priorityAccentColor} z-20 pointer-events-none transition-opacity duration-300 ease-in-out ${isExpanded || needsPartsReview ? "opacity-100" : "opacity-0"
                                  }`}
                              />

                              <div className="flex items-center gap-3">
                                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${priorityIconClass}`}>
                                  <FileText className="h-4 w-4" />
                                </span>
                                <div>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <button
                                      type="button"
                                      onClick={() => openDetailView(wo, false)}
                                      className="font-extrabold text-slate-900 hover:text-blue-600 transition-colors text-left cursor-pointer"
                                    >
                                      {wo.workOrderNo}
                                    </button>
                                    {wo.isBackOrder ? (
                                      <span className="inline-flex h-5 items-center rounded-full border border-purple-200 bg-purple-50 px-2 text-[10px] font-semibold leading-none text-purple-700 whitespace-nowrap">
                                        Back Order
                                      </span>
                                    ) : null}
                                    {needsPartsReview ? (
                                      <button
                                        type="button"
                                        onClick={() => openPartsReviewModal(wo)}
                                        className="inline-flex h-5 items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2 text-[10px] font-semibold leading-none text-amber-800 transition-colors hover:bg-amber-200 whitespace-nowrap cursor-pointer"
                                        title="Workshop added or changed parts. Review and acknowledge them."
                                      >
                                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                                        New Parts · Review
                                      </button>
                                    ) : null}
                                    {isRescueWorkOrder(wo) ? (
                                      <span className="inline-flex h-5 items-center rounded-full border border-red-200 bg-red-50 px-2 text-[10px] font-semibold leading-none text-red-700 whitespace-nowrap">
                                        <PhoneCall className="mr-1 h-3 w-3" />
                                        Rescue
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Priority */}
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              {isUrgent ? (
                                <span className="inline-flex h-5 items-center gap-1 rounded-full border border-rose-200 bg-rose-50/80 px-2 text-[10px] font-semibold leading-none text-rose-700 whitespace-nowrap">
                                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                                  Urgent
                                </span>
                              ) : isHigh ? (
                                <span className="inline-flex h-5 items-center gap-1 rounded-full border border-amber-200 bg-amber-50/80 px-2 text-[10px] font-semibold leading-none text-amber-700 whitespace-nowrap">
                                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                  High
                                </span>
                              ) : (
                                <span className="inline-flex h-5 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 text-[10px] font-semibold leading-none text-slate-600 whitespace-nowrap">
                                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                                  {wo.priority ? (wo.priority.charAt(0).toUpperCase() + wo.priority.slice(1).toLowerCase()) : "Normal"}
                                </span>
                              )}
                            </td>

                            {/* Vehicle */}
                            <td className="px-4 py-3.5">
                              {wo.vehicleNo || wo.unitNo || wo.regNo ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(
                                      `/equipment?${wo.vehicleId ? `vehicleId=${wo.vehicleId}` : `plate=${encodeURIComponent(wo.vehicleNo || wo.regNo || "")}`}`
                                    );
                                  }}
                                  className="font-bold text-slate-900 transition-colors hover:text-blue-600 cursor-pointer text-left"
                                  title="View vehicle profile in Equipment"
                                >
                                  {wo.vehicleNo || wo.unitNo || wo.regNo}
                                </button>
                              ) : (
                                <span className="font-bold text-slate-400">-</span>
                              )}
                            </td>

                            {/* Company */}
                            <td className="px-4 py-3.5">
                              {wo.companyName && wo.companyName !== "-" ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(
                                      `/companies?${wo.companyId ? `companyId=${wo.companyId}` : `search=${encodeURIComponent(wo.companyName)}`}`
                                    );
                                  }}
                                  className="font-bold text-slate-800 transition-colors hover:text-blue-600 cursor-pointer text-left line-clamp-1 max-w-[200px]"
                                  title="View company profile in Companies"
                                >
                                  {wo.companyName}
                                </button>
                              ) : (
                                <span className="font-bold text-slate-400">-</span>
                              )}
                            </td>

                            {/* Current Status */}
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              {renderWorkOrderStatusPill(wo.canonicalStatus)}
                            </td>

                            {/* Workshop Bay */}
                            <td className="px-4 py-3.5 font-medium text-slate-700">
                              {wo.bay ? wo.bay : "—"}
                            </td>

                            {/* Est. Out */}
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              <p className="font-medium text-slate-800">{formatEtaDisplay(wo.estimatedOut)}</p>
                            </td>

                            {/* Actions */}
                            <td className="px-4 py-3.5 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                {canViewQuotation ? (
                                  shouldShowQuotationAction(wo) ? (
                                    <button
                                      type="button"
                                      onClick={() => openQuotationModal(wo)}
                                      className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer"
                                    >
                                      Quotation
                                    </button>
                                  ) : (
                                    <span
                                      aria-hidden="true"
                                      className="inline-flex h-8 items-center justify-center rounded-lg border border-transparent px-3.5 text-xs font-semibold invisible select-none pointer-events-none"
                                    >
                                      Quotation
                                    </span>
                                  )
                                ) : null}

                                {canUpdateStatus ? (
                                  <button
                                    type="button"
                                    disabled={wo.canonicalStatus === "collected"}
                                    onClick={() => openStatusModal(wo)}
                                    title={
                                      wo.canonicalStatus === "collected"
                                        ? "Completed orders cannot be updated"
                                        : needsPartsReview
                                          ? "Review and acknowledge newly added parts"
                                          : "Update Status"
                                    }
                                    className={`inline-flex h-8 items-center justify-center rounded-lg border px-3.5 text-xs font-bold transition-colors ${wo.canonicalStatus === "collected"
                                        ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed opacity-60"
                                        : needsPartsReview
                                          ? "border-amber-400 bg-amber-50 text-amber-800 shadow-2xs hover:bg-amber-100 cursor-pointer"
                                          : "border-blue-600 bg-white text-blue-600 shadow-2xs hover:bg-blue-50 cursor-pointer"
                                      }`}
                                  >
                                    {needsPartsReview ? "Review Parts" : "Update"}
                                  </button>
                                ) : null}

                                <button
                                  type="button"
                                  onClick={() => toggleRowExpanded(wo.id)}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 transition-colors cursor-pointer"
                                  aria-label="Toggle details"
                                >
                                  <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? `rotate-180 ${priorityTextColor}` : "text-slate-600"}`} />
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Expandable Lifecycle Timeline */}
                          <tr className={`bg-white relative ${isExpanded ? "border-b-4 border-b-slate-100 shadow-[0_6px_14px_-4px_rgba(15,23,42,0.06)]" : ""}`}>
                            <td colSpan={8} className="p-0">
                              <div
                                className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out will-change-[grid-template-rows,opacity] ${isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 pointer-events-none"
                                  }`}
                              >
                                <div className="overflow-hidden">
                                  <div className="relative px-6 py-5 border-t border-slate-100 bg-white">
                                    <span className={`absolute left-0 -top-[1px] bottom-0 w-[2.5px] ${priorityAccentColor} z-20 pointer-events-none`} />
                                    <div>
                                      <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 mb-6">
                                        REPAIR LIFECYCLE TIMELINE
                                      </h4>

                                      {/* 9-Step Horizontal Timeline */}
                                      <div className="overflow-x-auto pt-4 pb-2">
                                        <ol className="flex min-w-[900px] items-start justify-between relative px-3 pt-2">
                                          {WORK_ORDER_STAGES.map((stage, stageIndex) => {
                                            const timestamp = getStageTimestamp(wo, stage.key);
                                            const timeFormatted = formatTimelineStageTime(timestamp);
                                            const isPassed = stageIndex < currentStageIndex;
                                            const isCurrent = stage.key === currentStageKey;
                                            const isPendingPartsCurrent = isCurrent && wo.canonicalStatus === "pending_parts";
                                            const isPartsReadyCurrent = isCurrent && wo.canonicalStatus === "parts_ready";

                                            return (
                                              <li key={stage.key} className="relative flex-1 text-center group">
                                                {/* Connector Line */}
                                                {stageIndex < WORK_ORDER_STAGES.length - 1 ? (
                                                  <div
                                                    className={`absolute left-[50%] right-[-50%] top-3.5 h-[2px] -translate-y-1/2 z-0 ${isPassed
                                                        ? "bg-emerald-500"
                                                        : isCurrent
                                                          ? isPendingPartsCurrent
                                                            ? "bg-gradient-to-r from-emerald-500 via-amber-500 to-slate-200"
                                                            : isPartsReadyCurrent
                                                              ? "bg-gradient-to-r from-emerald-500 via-emerald-600 to-slate-200"
                                                              : "bg-gradient-to-r from-emerald-500 via-blue-500 to-slate-200"
                                                          : "bg-slate-200"
                                                      }`}
                                                  />
                                                ) : null}

                                                {/* Node Circle */}
                                                <div className="relative z-10 flex flex-col items-center">
                                                  <div className="relative flex items-center justify-center">
                                                    {isCurrent ? (
                                                      <>
                                                        <span className={`absolute -inset-2 rounded-full ${isPendingPartsCurrent ? "bg-amber-500/25" : isPartsReadyCurrent ? "bg-emerald-500/25" : "bg-blue-500/25"} animate-ping pointer-events-none`} />
                                                        <span className={`absolute -inset-1 rounded-full ${isPendingPartsCurrent ? "bg-amber-100" : isPartsReadyCurrent ? "bg-emerald-100" : "bg-blue-100"} pointer-events-none`} />
                                                      </>
                                                    ) : null}
                                                    <div
                                                      className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-transform ${isPassed
                                                          ? "bg-emerald-500 text-white shadow-xs"
                                                          : isCurrent
                                                            ? isPendingPartsCurrent
                                                              ? "bg-amber-500 text-white shadow-xs"
                                                              : isPartsReadyCurrent
                                                                ? "bg-emerald-600 text-white shadow-xs"
                                                                : "bg-blue-600 text-white shadow-xs"
                                                            : "border-2 border-slate-300 bg-white text-slate-400"
                                                        }`}
                                                    >
                                                      {isPassed || isPartsReadyCurrent ? (
                                                        <Check className="h-3.5 w-3.5 stroke-[3]" />
                                                      ) : isCurrent ? (
                                                        isPendingPartsCurrent ? (
                                                          <Clock className="h-3.5 w-3.5" />
                                                        ) : (
                                                          <Wrench className="h-3.5 w-3.5" />
                                                        )
                                                      ) : (
                                                        stageIndex + 1
                                                      )}
                                                    </div>
                                                  </div>

                                                  {/* Status Label */}
                                                  <div className="mt-2 text-center">
                                                    <span
                                                      className={`block text-xs font-extrabold ${isCurrent
                                                          ? isPendingPartsCurrent
                                                            ? "text-amber-700"
                                                            : isPartsReadyCurrent
                                                              ? "text-emerald-700"
                                                              : "text-blue-600"
                                                          : isPassed
                                                            ? "text-slate-800"
                                                            : "text-slate-400"
                                                        }`}
                                                    >
                                                      {stage.key === "parts_ready" && wo.canonicalStatus === "pending_parts"
                                                         ? "Pending Parts"
                                                         : stage.label}
                                                    </span>
                                                  </div>

                                                  {/* Timestamp */}
                                                  <div className="mt-1 min-h-[28px] text-[10px] text-slate-500 font-medium leading-tight">
                                                    {timeFormatted.date !== "—" ? (
                                                      <>
                                                        <div>{timeFormatted.date}</div>
                                                        <div className="text-slate-400">{timeFormatted.time}</div>
                                                        {isPendingPartsCurrent && wo.partsExpectedDate ? (
                                                          <div className="text-amber-600 font-bold text-[9px] mt-0.5">ETA: {wo.partsExpectedDate}</div>
                                                        ) : null}
                                                      </>
                                                    ) : isPendingPartsCurrent && wo.partsExpectedDate ? (
                                                      <div className="text-amber-600 font-semibold text-[10px]">ETA: {wo.partsExpectedDate}</div>
                                                    ) : (
                                                      <span className="text-slate-300">—</span>
                                                    )}
                                                  </div>

                                                  {/* Optional Badge */}
                                                  <div className="mt-1 min-h-[20px]">
                                                    {stage.optional ? (
                                                      <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-semibold ${isPendingPartsCurrent
                                                          ? "bg-amber-100 text-amber-800 font-bold"
                                                          : isPartsReadyCurrent
                                                            ? "bg-emerald-100 text-emerald-800 font-bold"
                                                            : "bg-slate-100 text-slate-500"
                                                        }`}>
                                                        {isPendingPartsCurrent ? "Waiting Parts" : isPartsReadyCurrent ? "Parts Staged" : "Optional"}
                                                      </span>
                                                    ) : null}
                                                  </div>
                                                </div>
                                              </li>
                                            );
                                          })}
                                        </ol>
                                      </div>

                                      <div className="mt-6 flex items-center justify-center gap-3 border-t border-slate-100 pt-4">
                                        {canView || canUpdateDetails ? (
                                          <button
                                            type="button"
                                            onClick={() => openDetailView(wo, false)}
                                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-slate-300 transition-colors cursor-pointer"
                                          >
                                            <Eye className="h-3.5 w-3.5 text-slate-500" />
                                            View Details
                                          </button>
                                        ) : null}

                                        {canUpdateStatus ? (
                                          <button
                                            type="button"
                                            disabled={wo.canonicalStatus === "collected"}
                                            onClick={() => openStatusModal(wo)}
                                            title={wo.canonicalStatus === "collected" ? "Completed orders cannot be updated" : "Update Status"}
                                            className={`inline-flex h-9 items-center justify-center rounded-xl px-6 text-xs font-bold transition-colors ${wo.canonicalStatus === "collected"
                                                ? "bg-slate-200 text-slate-400 cursor-not-allowed opacity-60"
                                                : "bg-blue-600 text-white shadow-xs hover:bg-blue-700 cursor-pointer"
                                              }`}
                                          >
                                            Update Status
                                          </button>
                                        ) : null}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <AdminPagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={total || displayedWorkOrders.length}
              pageSize={pageSize}
              pageSizeOptions={[10, 25, 50, 100]}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
              itemLabel="work orders"
            />
          </div>
        </div>
      )}

      {/* Review Mid-Repair Parts Modal */}
      {modalMode === "review_parts" && selectedWO && (
        <WorkOrderReviewPartsDialog
          workOrder={selectedWO}
          catalog={inspectionPartCatalog}
          onClose={closeModal}
          onSuccess={fetchWorkOrders}
        />
      )}

      {modalMode === "view" && selectedWO && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm transition-opacity">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/80">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-extrabold text-[#173b75]">
                  Work Order Details — {selectedWO.workOrderNo}
                </h2>
                <span className="rounded-md bg-slate-200/80 px-2 py-0.5 text-xs font-mono font-bold text-slate-700">
                  ID #{selectedWO.id}
                </span>
                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${getStatusBadge(selectedWO.canonicalStatus)}`}>
                  <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />
                  {t(`status_${selectedWO.canonicalStatus}`)}
                </span>
                {selectedWO.isBackOrder ? (
                  <span className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700 whitespace-nowrap">
                    <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />
                    Back Order
                  </span>
                ) : null}
                {(() => {
                  const detailsPriority = selectedWO.canonicalStatus === "collected" ? "Normal" : (selectedWO.priority || "Normal");
                  return (
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${getPriorityBadge(detailsPriority)}`}>
                      <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />
                      {detailsPriority}
                    </span>
                  );
                })()}
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 transition-colors"
                aria-label="Close dialog"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
              {/* Lifecycle Flow Timeline */}
              <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50/80 to-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ListTodo className="h-4 w-4 text-blue-700" />
                    <span className="font-extrabold uppercase tracking-wider text-slate-700">Repair Lifecycle Timeline</span>
                  </div>
                  <span className="font-bold text-slate-500">
                    Stage {getWorkOrderStageIndex(selectedWO.canonicalStatus) + 1} of {WORK_ORDER_STAGES.length}
                  </span>
                </div>
                <div className="overflow-x-auto pb-2">
                  <ol className="flex min-w-[780px] items-start px-2">
                    {WORK_ORDER_STAGES.map((stage, stageIndex) => {
                      const state = getStageState(selectedWO, stage, stageIndex);
                      const timestamp = getStageTimestamp(selectedWO, stage.key);
                      const isPendingPartsCurrent = state === "current" && selectedWO.canonicalStatus === "pending_parts" && stage.key === "parts_ready";
                      const isPartsReadyCurrent = state === "current" && selectedWO.canonicalStatus === "parts_ready" && stage.key === "parts_ready";
                      return (
                        <li key={stage.key} className="relative min-w-0 flex-1 px-1 text-center">
                          {stageIndex < WORK_ORDER_STAGES.length - 1 ? (
                            <span className={`absolute left-[calc(50%+16px)] right-[calc(-50%+16px)] top-[14px] h-[2.5px] rounded-full ${getStageConnectorClasses(state)}`} aria-hidden="true" />
                          ) : null}
                          <div aria-current={state === "current" ? "step" : undefined} className="relative z-[1] flex flex-col items-center">
                            <div className="relative flex items-center justify-center">
                              {state === "current" ? (
                                <span className={`absolute -inset-0.5 rounded-full ${isPendingPartsCurrent ? "bg-amber-400/40" : isPartsReadyCurrent ? "bg-emerald-400/40" : "bg-sky-400/40"} animate-ping pointer-events-none opacity-60`} />
                              ) : null}
                              <span className={`relative flex h-8 w-8 items-center justify-center rounded-full border-2 text-[11px] font-extrabold transition-colors ${getStageNodeClasses(state, isPendingPartsCurrent, isPartsReadyCurrent)}`}>
                                {state === "completed" || isPartsReadyCurrent ? (
                                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                                ) : state === "current" ? (
                                  isPendingPartsCurrent ? <Clock className="h-3.5 w-3.5" /> : <Wrench className="h-3.5 w-3.5" />
                                ) : (
                                  stageIndex + 1
                                )}
                              </span>
                            </div>
                            <span className={`mt-1.5 max-w-[90px] text-[10px] font-extrabold leading-tight ${state === "current" ? (isPendingPartsCurrent ? "text-amber-700" : isPartsReadyCurrent ? "text-emerald-700" : "text-sky-700") : state === "completed" ? "text-[#173b75]" : state === "optional-history" ? "text-amber-700" : "text-slate-500"}`}>
                              {stage.key === "parts_ready" && selectedWO.canonicalStatus === "pending_parts"
                                ? "Pending Parts"
                                : stage.label}
                            </span>
                            <span className="mt-0.5 min-h-[12px] text-[8px] font-medium leading-tight text-slate-400">
                              {timestamp ? formatStageTimestamp(timestamp) : isPendingPartsCurrent && selectedWO.partsExpectedDate ? `ETA: ${selectedWO.partsExpectedDate}` : ""}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              </div>

              {/* Emergency Rescue Indicator Banner */}
              {isRescueWorkOrder(selectedWO) ? (
                <div className="rounded-2xl border border-red-300 bg-gradient-to-r from-red-50 via-rose-50 to-amber-50 p-4 flex items-center justify-between gap-3 text-red-950 shadow-xs">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white shadow-sm shadow-red-500/30">
                      <PhoneCall className="h-5 w-5 animate-pulse" />
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-red-600 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">24/7 SOS</span>
                        <p className="text-xs font-black uppercase tracking-wide text-red-900">Emergency Roadside Rescue Job</p>
                      </div>
                      <p className="mt-0.5 text-[11px] text-red-700 font-medium">Request Channel: {selectedWO.requestChannel || "Rescue Hotline"}</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-red-600/10 border border-red-300 px-3 py-1 text-xs font-black text-red-800">
                    Priority: {selectedWO.priority || "Urgent"}
                  </span>
                </div>
              ) : null}

              {/* Vehicle & Customer Info Grid */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Vehicle & Intake Information Card */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs">
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                    <Car className="h-4 w-4 text-blue-600" />
                    <h3 className="font-bold uppercase tracking-wider text-slate-800">Vehicle &amp; Intake</h3>
                  </div>
                  <dl className="grid grid-cols-2 gap-3">
                    <div>
                      <dt className="text-[10px] font-bold uppercase text-slate-400">Plate No / Unit</dt>
                      <dd className="font-extrabold text-slate-900 text-sm">{selectedWO.vehicleNo}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase text-slate-400">Make &amp; Model</dt>
                      <dd className="font-semibold text-slate-800">{selectedWO.brand} {selectedWO.model}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase text-slate-400">Equipment Type</dt>
                      <dd className="font-medium text-slate-700">{selectedWO.equipmentType || "-"}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase text-slate-400">Check-in Mileage</dt>
                      <dd className="font-medium text-slate-700">
                        {selectedWO.checkinMileage !== null && selectedWO.checkinMileage !== undefined ? `${selectedWO.checkinMileage.toLocaleString()} km` : "Not recorded"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase text-slate-400">Intake Type</dt>
                      <dd className="font-medium text-slate-700">
                        {selectedWO.intakeType === "rescue" || isRescueWorkOrder(selectedWO) ? "🚨 Emergency Rescue" : selectedWO.intakeType === "walk_in" ? "Walk-in Intake" : "Customer App Booking"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase text-slate-400">Request Channel</dt>
                      <dd className="font-medium text-slate-700">{selectedWO.requestChannel || "Direct Intake"}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase text-slate-400">Intake Foreman</dt>
                      <dd className="font-medium text-slate-700">{selectedWO.foremanName || "Unassigned"}</dd>
                    </div>
                  </dl>

                  {selectedWO.relatedVehicles?.length > 0 ? (
                    <div className="border-t border-slate-100 pt-2">
                      <dt className="text-[10px] font-bold uppercase text-slate-400 mb-1">Related Vehicle / Trailer</dt>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedWO.relatedVehicles.map((vehicle) => (
                          <span key={vehicle.id} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                            {vehicle.vehicleNo}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Company & Workshop Operations Card */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs">
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                    <Building2 className="h-4 w-4 text-blue-600" />
                    <h3 className="font-bold uppercase tracking-wider text-slate-800">Customer &amp; Workshop Bay</h3>
                  </div>
                  <dl className="grid grid-cols-2 gap-3">
                    <div>
                      <dt className="text-[10px] font-bold uppercase text-slate-400">Company</dt>
                      <dd className="font-extrabold text-slate-900 text-sm">{selectedWO.companyName || "-"}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase text-slate-400">Contact Person</dt>
                      <dd className="font-semibold text-slate-800">
                        {selectedWO.contactName && selectedWO.contactName !== "-" ? `${selectedWO.contactName} (${selectedWO.contactType})` : "-"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase text-slate-400">Phone</dt>
                      <dd className="font-medium text-slate-700">{selectedWO.customerPhone || "-"}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase text-slate-400">AutoCount Job No.</dt>
                      <dd className="font-mono font-bold text-blue-800">{selectedWO.autocountJobNo || "-"}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase text-slate-400">Workshop Bay</dt>
                      <dd className="font-medium text-slate-700">{selectedWO.bay || "Not assigned"}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase text-slate-400">Expected Out / ETA</dt>
                      <dd className="font-medium text-slate-700">{selectedWO.estimatedOut || "No ETA"}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase text-slate-400">Service Type</dt>
                      <dd className="font-medium text-slate-700">{selectedWO.serviceType || "-"}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase text-slate-400">Service Centre</dt>
                      <dd className="font-medium text-slate-700">{selectedWO.serviceCentre || "Main Centre"}</dd>
                    </div>
                  </dl>

                  <div className="border-t border-slate-100 pt-2">
                    <dt className="text-[10px] font-bold uppercase text-slate-400 mb-1">Assigned Repair Team</dt>
                    <div className="flex flex-wrap gap-1.5">
                      {(selectedWO.technicians || []).length > 0 ? (
                        selectedWO.technicians.map((member) => (
                          <span key={member.id} className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-800">
                            {member.name} · {member.role}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-400">Unassigned</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Problem description & Diagnostic Findings */}
              {(selectedWO.reportedProblem || selectedWO.actualIssue || selectedWO.customerNotes) && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {selectedWO.reportedProblem ? (
                    <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3.5">
                      <div className="flex items-center justify-between mb-1">
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-blue-700">Initial Reported Issue</span>
                        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-800">Intake</span>
                      </div>
                      <p className="whitespace-pre-wrap text-slate-900 font-semibold text-xs leading-relaxed">{selectedWO.reportedProblem}</p>
                    </div>
                  ) : null}
                  {selectedWO.actualIssue ? (
                    <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3.5">
                      <div className="flex items-center justify-between mb-1">
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-indigo-700">Actual Issue / Inspection Findings</span>
                        <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[9px] font-bold text-indigo-800">Diagnosis</span>
                      </div>
                      <p className="whitespace-pre-wrap text-slate-900 font-semibold text-xs leading-relaxed">{selectedWO.actualIssue}</p>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 p-3.5 flex flex-col justify-center">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Actual Issue / Inspection Findings</span>
                      <p className="text-xs text-slate-400 italic">Pending inspection diagnosis supplement</p>
                    </div>
                  )}
                  {selectedWO.customerNotes ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 md:col-span-2">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Customer Notes</span>
                      <p className="whitespace-pre-wrap text-slate-800 font-medium text-xs leading-relaxed">{selectedWO.customerNotes}</p>
                    </div>
                  ) : null}
                </div>
              )}

              {/* Spare Parts Section */}
              <WorkOrderViewPartsSection workOrderId={selectedWO.id} />

              {/* Workshop Photos */}
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Camera className="h-4 w-4 text-violet-600" />
                    <span className="font-bold uppercase tracking-wider text-slate-800">Workshop Photos</span>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                    {selectedWO.photos?.length || 0} photo(s)
                  </span>
                </div>
                {selectedWO.photos?.length ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {selectedWO.photos.map((photo) => (
                      <figure key={photo.id} className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                        <button
                          type="button"
                          onClick={() => setSelectedPhoto(photo)}
                          className="block w-full cursor-zoom-in overflow-hidden bg-slate-100 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                          aria-label={`Enlarge ${photo.caption || "workshop photo"}`}
                        >
                          <img src={apiAssetUrl("work-order-photo-file", { id: photo.id })} alt={photo.caption || "Workshop photo"} loading="lazy" className="aspect-square w-full object-cover transition-transform hover:scale-105" />
                        </button>
                        <figcaption className="p-2 space-y-0.5">
                          <p className="text-[10px] font-bold uppercase text-blue-700">{photo.category.replaceAll("_", " ")}</p>
                          {photo.caption ? <p className="text-[11px] text-slate-700 truncate">{photo.caption}</p> : null}
                          <p className="text-[9px] text-slate-400">{photo.uploadedBy}{photo.customerVisible ? " · Customer Visible" : " · Internal"}</p>
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-slate-400">No workshop photos uploaded for this work order.</p>
                )}
              </div>

              {/* Milestone Timestamps Grid */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="h-4 w-4 text-blue-600" />
                  <span className="font-bold uppercase tracking-wider text-slate-800">All Milestone Timestamps</span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  <div className="rounded-lg bg-white p-2.5 border border-slate-200/80">
                    <span className="block text-[10px] font-bold uppercase text-slate-400">Check In</span>
                    <span className="font-bold text-slate-800">{selectedWO.checkinAt ? formatStageTimestamp(selectedWO.checkinAt) : "-"}</span>
                  </div>
                  <div className="rounded-lg bg-white p-2.5 border border-slate-200/80">
                    <span className="block text-[10px] font-bold uppercase text-slate-400">Inspection</span>
                    <span className="font-bold text-slate-800">{selectedWO.inspectedAt ? formatStageTimestamp(selectedWO.inspectedAt) : "-"}</span>
                  </div>
                  <div className="rounded-lg bg-white p-2.5 border border-slate-200/80">
                    <span className="block text-[10px] font-bold uppercase text-slate-400">Quotation Issued</span>
                    <span className="font-bold text-slate-800">{selectedWO.quotationIssuedAt ? formatStageTimestamp(selectedWO.quotationIssuedAt) : "-"}</span>
                  </div>
                  <div className="rounded-lg bg-white p-2.5 border border-slate-200/80">
                    <span className="block text-[10px] font-bold uppercase text-slate-400">Approved</span>
                    <span className="font-bold text-slate-800">{selectedWO.approvedAt ? formatStageTimestamp(selectedWO.approvedAt) : "-"}</span>
                  </div>
                  <div className="rounded-lg bg-white p-2.5 border border-slate-200/80">
                    <span className="block text-[10px] font-bold uppercase text-slate-400">Parts Ready</span>
                    <span className="font-bold text-slate-800">{selectedWO.partsReadyAt ? formatStageTimestamp(selectedWO.partsReadyAt) : "-"}</span>
                  </div>
                  <div className="rounded-lg bg-white p-2.5 border border-slate-200/80">
                    <span className="block text-[10px] font-bold uppercase text-slate-400">Under Repair</span>
                    <span className="font-bold text-slate-800">{selectedWO.underRepairAt ? formatStageTimestamp(selectedWO.underRepairAt) : "-"}</span>
                  </div>
                  <div className="rounded-lg bg-white p-2.5 border border-slate-200/80">
                    <span className="block text-[10px] font-bold uppercase text-slate-400">Completed</span>
                    <span className="font-bold text-slate-800">{selectedWO.completedAt ? formatStageTimestamp(selectedWO.completedAt) : "-"}</span>
                  </div>
                  <div className="rounded-lg bg-white p-2.5 border border-slate-200/80">
                    <span className="block text-[10px] font-bold uppercase text-slate-400">Collected</span>
                    <span className="font-bold text-slate-800">{selectedWO.collectedAt ? formatStageTimestamp(selectedWO.collectedAt) : "-"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-t border-slate-200">
              <div>
                {canViewQuotation && shouldShowQuotationAction(selectedWO) ? (
                  <button
                    type="button"
                    onClick={() => {
                      const wo = selectedWO;
                      closeModal();
                      openQuotationModal(wo);
                    }}
                    className="inline-flex items-center rounded-lg border border-cyan-300 bg-cyan-50 px-3.5 py-2 text-xs font-bold text-cyan-800 shadow-xs hover:bg-cyan-100 transition-colors"
                  >
                    <FileText className="mr-1.5 h-4 w-4" />View Quotation Document
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="px-5 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedPhoto && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-6 backdrop-blur-sm animate-in fade-in-0 duration-200"
          role="dialog"
          aria-modal="true"
          aria-label="Workshop photo preview"
          onClick={(event) => {
            if (event.target === event.currentTarget) setSelectedPhoto(null);
          }}
        >
          <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[1.75rem] border border-white/70 bg-white shadow-[0_28px_90px_rgba(2,6,23,0.42)] animate-in fade-in-0 zoom-in-95 duration-200" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              onClick={() => setSelectedPhoto(null)}
              className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/80 bg-white/90 text-slate-700 shadow-lg backdrop-blur transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label="Close photo preview"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-slate-100">
              <img
                src={apiAssetUrl("work-order-photo-file", { id: selectedPhoto.id })}
                alt={selectedPhoto.caption || "Workshop photo"}
                className="max-h-[78vh] max-w-full select-none object-contain"
              />
            </div>
            <div className="flex flex-wrap items-start justify-between gap-3 border-t border-slate-100 bg-white px-5 py-4 text-slate-800">
              <div className="min-w-0">
                <span className="inline-flex rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#2563eb]">{selectedPhoto.category.replaceAll("_", " ")}</span>
                {selectedPhoto.caption ? <p className="mt-2 text-sm leading-5 text-slate-600">{selectedPhoto.caption}</p> : null}
              </div>
              <p className="shrink-0 pt-1 text-xs font-medium text-slate-400">{selectedPhoto.uploadedBy}{selectedPhoto.customerVisible ? " · Customer visible" : " · Internal"}</p>
            </div>
          </div>
        </div>
      )}

      {/* Edit Details Modal */}
      {modalMode === "edit" && selectedWO && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm transition-opacity sm:p-5">
          <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-7 sm:py-5">
              <div className="flex items-start gap-3.5"><div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-[#1e3a8a] ring-1 ring-blue-100"><ClipboardList className="h-5 w-5" /></div><div><h2 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">Edit Work Order</h2><p className="mt-1 text-xs leading-5 text-slate-500 sm:text-sm">{selectedWO.workOrderNo} · Update scheduling and workshop ownership.</p></div></div>
              <button
                type="button"
                onClick={closeModal}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close work order dialog"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto bg-slate-50/80 p-4 sm:p-6">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 font-medium">
                  {formError}
                </div>
              )}

              <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Priority level
                  </label>
                  <AdminSelect
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                  >
                    {PRIORITIES.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </AdminSelect>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Workshop Bay
                  </label>
                  <AdminSelect
                    value={editBay}
                    onChange={(e) => setEditBay(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm bg-white"
                  >
                    <option value="">Unassigned</option>
                    {BAYS.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </AdminSelect>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Expected Completion Date
                  </label>
                  <DesktopDatePicker
                    value={editEstimatedOut}
                    onChange={setEditEstimatedOut}
                    ariaLabel="Choose expected completion date"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Check-in Mileage (km)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 125000"
                    value={editCheckinMileage}
                    onChange={(e) => setEditCheckinMileage(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm bg-white"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Assigned Repair Person
                  </label>
                  <StaffSelect staff={assignableStaff} selectedIds={editTechnicianIds} onChange={setEditTechnicianIds} />
                </div>

                {/* Back Order Switch in Edit Modal */}
                <div className="md:col-span-2 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 shadow-2xs">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-800">Back Order</span>
                      {editIsBackOrder ? (
                        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700">
                          Bypass Stock
                        </span>
                      ) : null}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {editIsBackOrder
                        ? "Enabled: Proceed with repair even if parts are out of stock (VIP reserved stock protected)."
                        : "Disabled: Standard inventory stock availability rules apply."}
                    </p>
                  </div>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      checked={editIsBackOrder}
                      onChange={(e) => setEditIsBackOrder(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                  </label>
                </div>
              </section>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-white px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
              <p className="text-xs text-slate-500">Changes apply to this work order only</p><div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={closeModal}
                  className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleUpdateWorkOrderDetails}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#1e3a8a] px-5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />{isSaving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lifecycle Status Modal */}
      {modalMode === "status" && selectedWO && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm transition-opacity sm:p-5">
          <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-white px-6 py-4">
              <div className="flex items-center gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
                  <ListTodo className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h2 className="text-lg font-bold tracking-tight text-slate-900">Update Work Order Status</h2>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200/80 px-2.5 py-0.5 text-xs font-bold text-blue-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                      {t(`status_${selectedWO.canonicalStatus}`)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500 font-mono">
                    {selectedWO.workOrderNo} · {[selectedWO.vehicleNo, selectedWO.brand, selectedWO.model].filter(Boolean).join(" ")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                aria-label="Close status dialog"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Error Message */}
            {formError && (
              <div className="mx-6 mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-600">
                {formError}
              </div>
            )}

            {/* Body */}
            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              {selectedWO.canonicalStatus === "scheduled" ? (
                <div className="rounded-2xl border border-sky-200 bg-sky-50/60 p-6 text-center space-y-4">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1e3a8a] text-white shadow-sm">
                    <Calendar className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="text-base font-extrabold text-slate-900">Vehicle Scheduled (Awaiting Arrival)</h4>
                    <p className="max-w-md mx-auto mt-1 text-xs leading-relaxed text-slate-600">
                      This work order is scheduled. Once the commercial vehicle arrives at the workshop, record its intake mileage and click &quot;Check In Vehicle&quot; below.
                    </p>
                  </div>
                  <div className="max-w-xs mx-auto text-left pt-1">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Check-in Mileage (km)
                    </label>
                    <input
                      type="number"
                      value={editCheckinMileage}
                      onChange={(e) => setEditCheckinMileage(e.target.value)}
                      placeholder={selectedWO.mileage ? `Current odometer ~${selectedWO.mileage.toLocaleString()} km` : "e.g. 125000"}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              ) : selectedWO.canonicalStatus === "checked_in" ? (
                <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-6 text-center space-y-3">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1e3a8a] text-white shadow-sm">
                    <Car className="h-6 w-6" />
                  </div>
                  <h4 className="text-base font-extrabold text-slate-900">Vehicle Checked In</h4>
                  <p className="max-w-md mx-auto text-xs leading-relaxed text-slate-600">
                    Vehicle has arrived and checked into the workshop. Proceed to vehicle inspection to diagnose issues and assess spare parts requirements.
                  </p>
                </div>
              ) : selectedWO.canonicalStatus === "inspected" ? (
                <>
                  {/* Step 1: Issue Verification & Diagnostic Findings */}
                  <div className="space-y-3.5 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                        1
                      </span>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">Vehicle Issue &amp; Inspection Findings</h3>
                        <p className="text-xs text-slate-500">Review customer reported problem and record technician diagnostic findings.</p>
                      </div>
                    </div>

                    <div className="space-y-3 pl-8">
                      {/* Original Reported Issue Box */}
                      <div className="rounded-xl border border-blue-200/80 bg-blue-50/70 p-3.5">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-blue-700">
                            <AlertCircle className="h-3.5 w-3.5" />
                            Original Reported Issue
                          </span>
                          <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                            Intake Record
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-slate-900 leading-relaxed whitespace-pre-wrap">
                          {selectedWO.reportedProblem || "No reported problem recorded"}
                        </p>
                      </div>

                      {/* Actual Issue / Supplement Input */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-slate-800">
                            Actual Issue / Diagnostic Findings
                          </label>
                          {selectedWO.reportedProblem && (
                            <button
                              type="button"
                              onClick={() => {
                                setInspectionActualIssue((prev) =>
                                  prev ? `${prev}\nSame as reported: ${selectedWO.reportedProblem}` : selectedWO.reportedProblem
                                );
                              }}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                            >
                              <Plus className="h-3 w-3" />
                              Same as reported
                            </button>
                          )}
                        </div>
                        <textarea
                          rows={3}
                          value={inspectionActualIssue}
                          onChange={(e) => setInspectionActualIssue(e.target.value)}
                          placeholder="Record actual root cause, parts inspected, defect details, or supplements to the original issue..."
                          className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs text-slate-900 shadow-2xs placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 leading-relaxed"
                        />
                        {/* Quick tags */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <span className="text-[10px] font-bold uppercase text-slate-400">Quick tags:</span>
                          {["Normal Wear & Tear", "Air / Fluid Leakage", "Component Cracked", "Brake Lining Worn", "Electrical Fault"].map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => {
                                setInspectionActualIssue((prev) =>
                                  prev ? `${prev.trim()}, ${tag}` : tag
                                );
                              }}
                              className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition-colors cursor-pointer"
                            >
                              + {tag}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Step 2: Are parts required for this repair? */}
                  <div className="space-y-3.5 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
                    <div className="flex items-start gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                        2
                      </span>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">Are spare parts required for this repair?</h3>
                        <p className="mt-0.5 text-xs text-slate-500">Determine whether replacement parts must be sourced from stock or external suppliers.</p>
                      </div>
                    </div>

                    {inspectionPartsLoading ? (
                      <div className="ml-9 rounded-xl border border-slate-200 bg-slate-50/70 p-6 text-center space-y-2">
                        <Loader2 className="mx-auto h-5 w-5 text-indigo-500 animate-spin" />
                        <p className="text-xs font-semibold text-slate-500">Checking saved diagnostic parts...</p>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-9">
                          <button
                            type="button"
                            onClick={() => {
                              if (inspectionParts.length === 0) {
                                setInspectionParts([blankInspectionPart()]);
                                setInspectionPartsConfirmed(false);
                              }
                            }}
                            className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all cursor-pointer ${
                              inspectionParts.length > 0
                                ? "border-2 border-indigo-500 bg-indigo-50/40 text-indigo-950 ring-2 ring-indigo-100"
                                : "border-slate-200 bg-white hover:border-slate-300 text-slate-700"
                            }`}
                          >
                            <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                              inspectionParts.length > 0 ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white"
                            }`}>
                              {inspectionParts.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                            </span>
                            <div>
                              <span className="text-xs font-bold block text-slate-900">Yes, spare parts required</span>
                              <span className="text-[11px] text-slate-500 leading-snug block mt-0.5">
                                Select items from stock catalog to check live availability, track shortage, or order parts.
                              </span>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setInspectionParts([]);
                              setInspectionPartsConfirmed(true);
                            }}
                            className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all cursor-pointer ${
                              inspectionParts.length === 0 && inspectionPartsConfirmed
                                ? "border-2 border-indigo-500 bg-indigo-50/40 text-indigo-950 ring-2 ring-indigo-100"
                                : "border-slate-200 bg-white hover:border-slate-300 text-slate-700"
                            }`}
                          >
                            <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                              inspectionParts.length === 0 && inspectionPartsConfirmed ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white"
                            }`}>
                              {inspectionParts.length === 0 && inspectionPartsConfirmed && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                            </span>
                            <div>
                              <span className="text-xs font-bold block text-slate-900">No parts required</span>
                              <span className="text-[11px] text-slate-500 leading-snug block mt-0.5">
                                Labour &amp; diagnostic service only (servicing, calibration, adjustments, inspections).
                              </span>
                            </div>
                          </button>
                        </div>

                        {/* If No parts required is selected, display concise Labour Only confirmation card */}
                        {inspectionParts.length === 0 && inspectionPartsConfirmed && (
                          <div className="ml-9 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 transition-all animate-in fade-in duration-150">
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                                <CheckCircle2 className="h-4 w-4" />
                              </div>
                              <div>
                                <h4 className="text-xs font-bold text-emerald-950">Labour &amp; Service Only Work Order</h4>
                                <p className="text-xs text-emerald-800/90 leading-relaxed mt-0.5">
                                  Confirmed no spare parts are needed. Quotation will be prepared for labour and diagnostic services only.
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Step 3: Required Spare Parts (Only when parts are required) */}
                  {inspectionParts.length > 0 && (
                    <div className="space-y-3.5 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                          3
                        </span>
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">Required Spare Parts</h3>
                          <p className="text-xs text-slate-500">Add parts to verify stock on hand and identify supplier shortages.</p>
                        </div>
                      </div>

                      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white pl-0 ml-9">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/80 text-[10px] font-bold uppercase text-slate-500">
                              <th className="py-2.5 px-3 w-8 text-center">#</th>
                              <th className="py-2.5 px-3 min-w-[200px]">Stock Item <span className="text-rose-500">*</span></th>
                              <th className="py-2.5 px-3 min-w-[180px]">Description</th>
                              <th className="py-2.5 px-3 w-28 text-center">Required Qty <span className="text-rose-500">*</span></th>
                              <th className="py-2.5 px-3 w-24 text-center">Stock Available</th>
                              <th className="py-2.5 px-3 w-20 text-center">Shortage</th>
                              <th className="py-2.5 px-3 w-14 text-center">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {inspectionParts.map((item, index) => {
                              const cataloguePart = inspectionCatalogBySku.get(item.code);
                              const stock = Number(cataloguePart?.stock || 0);
                              const shortage = Math.max(0, Number(item.quantity || 0) - stock);

                              return (
                                <tr key={item.id || index} className="hover:bg-slate-50/40 transition-colors">
                                  <td className="py-2.5 px-3 font-bold text-slate-400 text-center">{index + 1}</td>
                                  <td className="py-2.5 px-3">
                                    {canManagePartsStatus ? (
                                      <DocumentItemCatalogSelect
                                        compact
                                        itemType="part"
                                        code={item.code}
                                        description={item.description}
                                        parts={inspectionPartCatalog}
                                        services={[]}
                                        onSelect={(selection) => {
                                          const selectedCatalogPart = inspectionCatalogBySku.get(selection.code);
                                          setInspectionParts((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, partId: selectedCatalogPart?.id || null, code: selection.code, description: selection.description, unitPrice: selection.unitPrice, uom: selectedCatalogPart?.uom || "" } : line));
                                          setInspectionPartsConfirmed(false);
                                        }}
                                      />
                                    ) : (
                                      <span className="font-mono font-bold text-slate-800">{item.code || "—"}</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <input
                                      value={item.description}
                                      disabled={!canManagePartsStatus}
                                      onChange={(event) => {
                                        setInspectionParts((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, description: event.target.value } : line));
                                        setInspectionPartsConfirmed(false);
                                      }}
                                      placeholder="Description"
                                      className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100"
                                    />
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    <div className="relative inline-flex h-9 w-20 items-center justify-between rounded-xl border border-slate-200 bg-white px-2.5 shadow-2xs hover:border-slate-300 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-100">
                                      <input
                                        type="number"
                                        min="1"
                                        step="1"
                                        value={item.quantity}
                                        disabled={!canManagePartsStatus}
                                        onChange={(event) => {
                                          const val = Math.max(1, Number(event.target.value) || 1);
                                          setInspectionParts((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, quantity: val } : line));
                                          setInspectionPartsConfirmed(false);
                                        }}
                                        className="w-8 bg-transparent text-center font-bold text-xs text-slate-800 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:bg-transparent"
                                      />
                                      {canManagePartsStatus && (
                                        <div className="flex flex-col items-center justify-center -mr-1">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setInspectionParts((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, quantity: (Number(line.quantity) || 1) + 1 } : line));
                                              setInspectionPartsConfirmed(false);
                                            }}
                                            className="p-0.5 text-slate-400 hover:text-indigo-600 cursor-pointer"
                                            tabIndex={-1}
                                            aria-label="Increase quantity"
                                          >
                                            <ChevronUp className="h-3 w-3 stroke-[2.5]" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setInspectionParts((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, quantity: Math.max(1, (Number(line.quantity) || 1) - 1) } : line));
                                              setInspectionPartsConfirmed(false);
                                            }}
                                            className="p-0.5 text-slate-400 hover:text-indigo-600 cursor-pointer"
                                            tabIndex={-1}
                                            aria-label="Decrease quantity"
                                          >
                                            <ChevronDown className="h-3 w-3 stroke-[2.5]" />
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    <span className={`font-extrabold text-xs ${!cataloguePart ? "text-slate-400" : stock > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                      {cataloguePart ? stock : "—"}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    <span className={`font-extrabold text-xs ${!cataloguePart ? "text-slate-400" : shortage > 0 ? "text-rose-600" : "text-slate-600"}`}>
                                      {cataloguePart ? shortage : "0"}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    {canManagePartsStatus && (
                                      <button
                                        type="button"
                                        onClick={() => setPartToRemoveModal({ index, name: item.description || item.code || `Part ${index + 1}`, code: item.code })}
                                        className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                        title="Remove Part"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {canManagePartsStatus && (
                        <div className="pl-9 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setInspectionParts((current) => [...current, blankInspectionPart()]);
                              setInspectionPartsConfirmed(false);
                            }}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                          >
                            <Plus className="h-4 w-4" />
                            Add another part
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : selectedWO.canonicalStatus === "quotation_issued" ? (
                <div className="rounded-2xl border border-cyan-200 bg-cyan-50/50 p-6 text-center space-y-3">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-700 text-white shadow-sm">
                    <Send className="h-6 w-6" />
                  </div>
                  <h4 className="text-base font-extrabold text-cyan-950">Quotation Issued to Customer</h4>
                  <p className="max-w-md mx-auto text-xs leading-relaxed text-cyan-800">
                    Awaiting digital customer approval via app, or authorize quotation internally if confirmed verbally.
                  </p>
                  {canManageQuotation && (
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => openQuotationModal(selectedWO)}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-cyan-700 px-6 text-xs font-bold text-white shadow-sm transition-colors hover:bg-cyan-800 cursor-pointer"
                    >
                      <FileText className="h-4 w-4" />
                      View Quotation / Internal Approve →
                    </button>
                  )}
                </div>
              ) : selectedWO.canonicalStatus === "ready_for_collection" ? (
                /* Ready for collection: Simplified & focused handover view */
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-6 sm:p-8 text-center space-y-5">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm">
                    <CheckCircle2 className="h-7 w-7" />
                  </div>
                  <div className="space-y-1.5">
                    <h3 className="text-base font-extrabold text-emerald-950">Repair Completed · Ready for Customer Collection</h3>
                    <p className="max-w-md mx-auto text-xs leading-relaxed text-emerald-800/90">
                      All vehicle maintenance and repairs are completed. Vehicle has passed inspection and is ready for customer handover.
                    </p>
                  </div>

                  <div className="mx-auto max-w-lg rounded-xl border border-emerald-200/80 bg-white p-4 shadow-2xs">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-left">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Work Order</span>
                        <span className="text-xs font-mono font-bold text-slate-900 truncate block mt-0.5">{selectedWO.workOrderNo}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Vehicle</span>
                        <span className="text-xs font-bold text-slate-900 truncate block mt-0.5">{selectedWO.vehicleNo}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Workshop Bay</span>
                        <span className="text-xs font-bold text-slate-900 truncate block mt-0.5">{selectedWO.bay || "—"}</span>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs font-medium text-emerald-900">
                    Click <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">Collected →</span> below once the vehicle is handed over to the customer.
                  </p>
                </div>
              ) : selectedWO.canonicalStatus === "collected" ? (
                /* Collected: Final completed state */
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-6 sm:p-8 text-center space-y-4">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800 text-white shadow-sm">
                    <CheckCircle2 className="h-7 w-7" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-extrabold text-slate-900">Work Order Concluded &amp; Collected</h3>
                    <p className="max-w-md mx-auto text-xs leading-relaxed text-slate-500">
                      This work order lifecycle has concluded. The vehicle was collected and all diagnosed parts and records are locked.
                    </p>
                  </div>
                  <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-3 text-xs font-mono font-bold text-slate-700">
                    {selectedWO.workOrderNo} · {[selectedWO.vehicleNo, selectedWO.brand, selectedWO.model].filter(Boolean).join(" ")}
                  </div>
                </div>
              ) : (
                /* Pre-repair and Active repair stages: Parts status overview */
                <div className="space-y-4">
                  {selectedWO.canonicalStatus === "approved" && (
                    <div className="rounded-xl border border-teal-200 bg-teal-50/70 p-3.5 flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-600 text-white font-bold">
                        <CheckCircle2 className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-xs font-bold text-teal-950">Step 1: Quotation Approved · Parts Staging &amp; Stock Verification</h4>
                        <p className="text-[11px] text-teal-800">
                          Verify spare parts in stock. Once confirmed in hand, click &quot;Confirm Parts Ready&quot; to allocate workshop bay.
                        </p>
                      </div>
                    </div>
                  )}

                  {selectedWO.canonicalStatus === "pending_parts" && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-600 text-white font-bold">
                        <Clock className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-xs font-bold text-amber-950">Awaiting Spare Parts Delivery &amp; Procurement</h4>
                        <p className="text-[11px] text-amber-800">
                          Record supplier estimated delivery date below. Once spare parts are physically received, click &quot;Confirm Parts Ready&quot; to proceed.
                        </p>
                      </div>
                    </div>
                  )}

                  {selectedWO.canonicalStatus === "parts_ready" && (
                    <div className={`rounded-xl border p-3.5 flex items-center gap-3 ${
                      !selectedWO.isBackOrder && ["pending_parts", "partially_arrived"].includes(calculatedPartsStatus)
                        ? "border-amber-200 bg-amber-50/70"
                        : "border-emerald-200 bg-emerald-50/70"
                    }`}>
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-bold text-white ${
                        !selectedWO.isBackOrder && ["pending_parts", "partially_arrived"].includes(calculatedPartsStatus)
                          ? "bg-amber-600"
                          : "bg-emerald-600"
                      }`}>
                        {!selectedWO.isBackOrder && ["pending_parts", "partially_arrived"].includes(calculatedPartsStatus) ? (
                          <AlertTriangle className="h-4 w-4" />
                        ) : (
                          <Wrench className="h-4 w-4" />
                        )}
                      </div>
                      <div className="flex-1">
                        <h4 className={`text-xs font-bold ${
                          !selectedWO.isBackOrder && ["pending_parts", "partially_arrived"].includes(calculatedPartsStatus)
                            ? "text-amber-950"
                            : "text-emerald-950"
                        }`}>
                          {!selectedWO.isBackOrder && ["pending_parts", "partially_arrived"].includes(calculatedPartsStatus)
                            ? "Inventory Shortage Detected · Repair On Hold"
                            : "Step 2: Parts Staged & Ready · Workshop Bay Allocation"}
                        </h4>
                        <p className={`text-[11px] ${
                          !selectedWO.isBackOrder && ["pending_parts", "partially_arrived"].includes(calculatedPartsStatus)
                            ? "text-amber-800"
                            : "text-emerald-800"
                        }`}>
                          {!selectedWO.isBackOrder && ["pending_parts", "partially_arrived"].includes(calculatedPartsStatus)
                            ? "Required parts have stock shortages. Please receive stock via Purchase Order or enable Back Order before starting repair."
                            : "All required spare parts are confirmed in stock. Allocate a workshop bay and expected handover ETA below to start repair."}
                        </p>
                      </div>
                    </div>
                  )}

                  {selectedWO.canonicalStatus === "under_repair" && (
                    <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white font-bold">
                        <Car className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-xs font-bold text-blue-950">Step 3: Vehicle Under Active Repair</h4>
                        <p className="text-[11px] text-blue-800">
                          Vehicle is stationed in repair bay. Technicians are executing repairs. You can update the Bay/ETA or click &quot;Finish Repair&quot; once testing passes.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className={`rounded-xl border p-4 ${
                    partsOverviewLoading
                      ? "border-slate-200 bg-slate-50/80 text-slate-700"
                      : selectedWO.isBackOrder
                        ? "border-purple-200 bg-purple-50/80 text-purple-900"
                        : ["pending_parts", "partially_arrived"].includes(calculatedPartsStatus)
                          ? "border-amber-200 bg-amber-50/80 text-amber-900"
                          : calculatedPartsStatus === "not_required"
                            ? "border-slate-200 bg-slate-50/80 text-slate-700"
                            : "border-emerald-200 bg-emerald-50/80 text-emerald-900"
                  }`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                          partsOverviewLoading
                            ? "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
                            : selectedWO.isBackOrder
                              ? "bg-purple-100 text-purple-700 ring-1 ring-purple-200"
                              : ["pending_parts", "partially_arrived"].includes(calculatedPartsStatus)
                                ? "bg-amber-100 text-amber-700 ring-1 ring-amber-200"
                                : calculatedPartsStatus === "not_required"
                                  ? "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
                                  : "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200"
                        }`}>
                          {partsOverviewLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <PackageSearch className="h-5 w-5" />}
                        </span>
                        <div>
                          <h4 className="text-xs font-extrabold uppercase">
                            {partsOverviewLoading
                              ? "Checking Stock Availability..."
                              : selectedWO.isBackOrder
                                ? "Back Order Bypass Active"
                                : calculatedPartsStatus === "not_required"
                                  ? "No Parts Required"
                                  : calculatedPartsStatus === "parts_ready"
                                    ? "Parts Ready in Stock"
                                    : "Inventory Shortage Detected"}
                          </h4>
                          <p className="mt-0.5 text-[11px] opacity-80">
                            {partsOverviewLoading
                              ? "Checking live stock balance for required parts..."
                              : selectedWO.isBackOrder
                                ? "Shortage check bypassed to proceed with repair."
                                : calculatedPartsStatus === "not_required"
                                  ? "This work order does not require spare parts."
                                  : calculatedPartsStatus === "parts_ready"
                                    ? "All required spare parts are available."
                                    : "Some items require stock receiving before repair."}
                          </p>
                        </div>
                      </div>
                      {!partsOverviewLoading && (
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold whitespace-nowrap ${calculatedPartsStatusConfig.className}`}>
                          {calculatedPartsStatusConfig.label}
                        </span>
                      )}
                    </div>

                    {/* Back Order Authorization Toggle inside Modal */}
                    {canManagePartsStatus && !partsOverviewLoading && (selectedWO.isBackOrder || ["pending_parts", "partially_arrived"].includes(calculatedPartsStatus)) && ["approved", "pending_parts", "parts_ready"].includes(selectedWO.canonicalStatus) && (
                      <div className={`mt-3 pt-3 border-t flex flex-wrap items-center justify-between gap-2.5 ${
                        selectedWO.isBackOrder ? "border-purple-200" : "border-amber-200"
                      }`}>
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={Boolean(selectedWO.isBackOrder)}
                            disabled={isSaving}
                            onChange={(e) => handleToggleBackOrder(e.target.checked)}
                            className="h-4 w-4 rounded border-amber-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                          />
                          <span className="text-xs font-bold text-slate-800">
                            Enable Back Order (Bypass Shortage)
                          </span>
                          <span className="text-[11px] text-slate-500">
                            — Authorize repair execution while awaiting parts arrival
                          </span>
                        </label>
                        {selectedWO.isBackOrder && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-purple-700 bg-purple-100/90 px-2 py-0.5 rounded-full border border-purple-300">
                            Back Order Active
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Diagnosed Parts Table */}
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-3">
                      <div>
                        <h4 className="text-xs font-bold text-slate-800">
                          Diagnosed Repair Items {inspectionPartsLoading ? "" : `(${inspectionParts.length})`}
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          {canManagePartsStatus ? "Pick spare parts and verify live stock availability" : "Parts locked for completed repair"}
                        </p>
                      </div>
                      {canManagePartsStatus && !inspectionPartsLoading && (
                        <button
                          type="button"
                          onClick={() => setInspectionParts((current) => [...current, blankInspectionPart()])}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 cursor-pointer transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5" />Add Part
                        </button>
                      )}
                    </div>

                    {inspectionPartsLoading ? (
                      <div className="p-8 text-center space-y-2">
                        <Loader2 className="mx-auto h-7 w-7 text-indigo-500 animate-spin" />
                        <p className="text-xs font-semibold text-slate-600">Loading diagnosed repair items &amp; stock...</p>
                      </div>
                    ) : inspectionParts.length === 0 ? (
                      <div className="p-8 text-center">
                        <PackageSearch className="mx-auto h-8 w-8 text-slate-300" />
                        <p className="mt-2 text-xs font-bold text-slate-600">No parts listed for this repair</p>
                        <p className="mt-0.5 text-[11px] text-slate-400">Click &quot;Add Part&quot; above to add required spare parts.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/80 text-[10px] font-bold uppercase text-slate-500">
                              <th className="py-2.5 px-3 w-8 text-center">#</th>
                              <th className="py-2.5 px-3 min-w-[200px]">Stock Item {canManagePartsStatus && <span className="text-rose-500">*</span>}</th>
                              <th className="py-2.5 px-3 min-w-[180px]">Description</th>
                              <th className="py-2.5 px-3 w-28 text-center">Required Qty {canManagePartsStatus && <span className="text-rose-500">*</span>}</th>
                              <th className="py-2.5 px-3 w-24 text-center">Stock Available</th>
                              <th className="py-2.5 px-3 w-20 text-center">Shortage</th>
                              {canManagePartsStatus && <th className="py-2.5 px-3 w-14 text-center">Action</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {inspectionParts.map((item, index) => {
                              const cataloguePart = inspectionCatalogBySku.get(item.code);
                              const stock = Number(cataloguePart?.stock || 0);
                              const shortage = Math.max(0, Number(item.quantity || 0) - stock);

                              return (
                                <tr key={item.id || index} className="hover:bg-slate-50/40 transition-colors">
                                  <td className="py-2.5 px-3 font-bold text-slate-400 text-center">{index + 1}</td>
                                  <td className="py-2.5 px-3">
                                    {canManagePartsStatus ? (
                                      <DocumentItemCatalogSelect
                                        compact
                                        itemType="part"
                                        code={item.code}
                                        description={item.description}
                                        parts={inspectionPartCatalog}
                                        services={[]}
                                        onSelect={(selection) => {
                                          const selectedCatalogPart = inspectionCatalogBySku.get(selection.code);
                                          setInspectionParts((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, partId: selectedCatalogPart?.id || null, code: selection.code, description: selection.description, unitPrice: selection.unitPrice, uom: selectedCatalogPart?.uom || "" } : line));
                                        }}
                                      />
                                    ) : (
                                      <span className="font-mono font-bold text-slate-800">{item.code || "—"}</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <input
                                      value={item.description}
                                      disabled={!canManagePartsStatus}
                                      onChange={(event) => {
                                        setInspectionParts((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, description: event.target.value } : line));
                                      }}
                                      placeholder="Description"
                                      className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100 disabled:bg-slate-50"
                                    />
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    <div className="relative inline-flex h-9 w-20 items-center justify-between rounded-xl border border-slate-200 bg-white px-2.5 shadow-2xs hover:border-slate-300 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-100">
                                      <input
                                        type="number"
                                        min="1"
                                        step="1"
                                        value={item.quantity}
                                        disabled={!canManagePartsStatus}
                                        onChange={(event) => {
                                          const val = Math.max(1, Number(event.target.value) || 1);
                                          setInspectionParts((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, quantity: val } : line));
                                        }}
                                        className="w-8 bg-transparent text-center font-bold text-xs text-slate-800 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:bg-transparent"
                                      />
                                      {canManagePartsStatus && (
                                        <div className="flex flex-col items-center justify-center -mr-1">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setInspectionParts((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, quantity: (Number(line.quantity) || 1) + 1 } : line));
                                            }}
                                            className="p-0.5 text-slate-400 hover:text-indigo-600 cursor-pointer"
                                            tabIndex={-1}
                                            aria-label="Increase quantity"
                                          >
                                            <ChevronUp className="h-3 w-3 stroke-[2.5]" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setInspectionParts((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, quantity: Math.max(1, (Number(line.quantity) || 1) - 1) } : line));
                                            }}
                                            className="p-0.5 text-slate-400 hover:text-indigo-600 cursor-pointer"
                                            tabIndex={-1}
                                            aria-label="Decrease quantity"
                                          >
                                            <ChevronDown className="h-3 w-3 stroke-[2.5]" />
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    <span className={`font-extrabold text-xs ${!cataloguePart ? "text-slate-400" : stock > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                      {cataloguePart ? stock : "—"}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    <span className={`font-extrabold text-xs ${!cataloguePart ? "text-slate-400" : shortage > 0 ? "text-rose-600" : "text-slate-600"}`}>
                                      {cataloguePart ? shortage : "0"}
                                    </span>
                                  </td>
                                  {canManagePartsStatus && (
                                    <td className="py-2.5 px-3 text-center">
                                      <button
                                        type="button"
                                        onClick={() => setPartToRemoveModal({ index, name: item.description || item.code || `Part ${index + 1}`, code: item.code })}
                                        className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                        title="Remove Part"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {canManagePartsStatus && isInspectionPartsModified && (
                      <div className={`border-t p-3 px-4 ${
                        selectedWO.canonicalStatus === "under_repair"
                          ? "border-amber-200 bg-amber-50/90 text-amber-900"
                          : "border-slate-100 bg-slate-50/80 text-amber-700"
                      }`}>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                          <div className="space-y-0.5">
                            <span className="text-xs font-bold block">
                              {selectedWO.canonicalStatus === "under_repair"
                                ? "Adding Parts Mid-Repair Requires Quotation Revision"
                                : "Unsaved changes in required parts"}
                            </span>
                            {selectedWO.canonicalStatus === "under_repair" && (
                              <p className="text-[11px] text-amber-700 font-normal leading-tight">
                                Saving changes will revert this work order to Quotation status (incrementing revision) for pricing re-approval.
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={handleSaveRequiredParts}
                            className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-white shadow-sm disabled:opacity-50 cursor-pointer ${
                              selectedWO.canonicalStatus === "under_repair"
                                ? "bg-amber-600 hover:bg-amber-700"
                                : "bg-indigo-600 hover:bg-indigo-700"
                            }`}
                          >
                            <RefreshCw className={`h-3.5 w-3.5 ${isSaving ? "animate-spin" : ""}`} />
                            {isSaving
                              ? "Saving..."
                              : selectedWO.canonicalStatus === "under_repair"
                              ? "Save & Revise Quotation"
                              : "Save Parts & Verify Stock"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Shortage Expected Arrival Date Input */}
                  {!selectedWO.isBackOrder && selectedWO.canonicalStatus === "pending_parts" && ["pending_parts", "partially_arrived"].includes(calculatedPartsStatus) && canManagePartsStatus && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 space-y-3">
                      <label className="block text-xs font-semibold text-amber-900">
                        Expected parts arrival date <span className="text-rose-500">*</span>
                        <DesktopDatePicker value={partsExpectedDate} onChange={setPartsExpectedDate} ariaLabel="Choose expected parts arrival date" className="mt-1 h-10 w-full font-normal bg-white" />
                      </label>
                      <button
                        type="button"
                        disabled={isSaving || !partsExpectedDate}
                        onClick={handleUpdatePartsStatus}
                        className="inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-amber-600 px-4 text-xs font-bold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50 shadow-sm cursor-pointer"
                      >
                        {isSaving ? "Saving..." : "Save Expected Arrival Date"}
                      </button>
                    </div>
                  )}

                  {/* Workshop Bay & Target Handover (ETA) Assignment */}
                  {(selectedWO.canonicalStatus === "under_repair" ||
                    selectedWO.canonicalStatus === "parts_ready" ||
                    (selectedWO.canonicalStatus === "approved" && (effectivePartsStatus === "not_required" || !inspectionParts.some((p) => Boolean((p.code || "").trim() || (p.description || "").trim() || p.partId))))) && (
                    <div className={`space-y-3.5 rounded-2xl border p-4 shadow-2xs ${
                      selectedWO.canonicalStatus === "under_repair"
                        ? "border-slate-200 bg-white"
                        : "border-blue-200 bg-blue-50/50"
                    }`}>
                      <div className="flex items-center gap-2.5">
                        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-2xs ${
                          selectedWO.canonicalStatus === "under_repair" ? "bg-amber-500" : "bg-blue-600"
                        }`}>
                          <Wrench className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">
                            {selectedWO.canonicalStatus === "under_repair"
                              ? "Active Repair Bay & Target Handover (ETA)"
                              : "Assign Repair Bay & Target Handover (ETA)"}
                          </h3>
                          <p className="text-xs text-slate-500">
                            {selectedWO.canonicalStatus === "under_repair"
                              ? "Allocate or adjust workshop bay and estimated completion time during active repair."
                              : "Required to start repair: Select the workshop bay and estimated completion time."}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-9">
                        {/* Workshop Bay Allocation */}
                        <div className="space-y-2">
                          <label className="block text-xs font-bold text-slate-700">
                            Workshop Bay Allocation <span className="text-rose-500">*</span>
                          </label>
                          <div className="grid grid-cols-3 gap-2">
                            {WORKSHOP_BAYS.map((b) => (
                              <button
                                key={b}
                                type="button"
                                onClick={() => setEditBay(b)}
                                className={`rounded-xl border py-2 px-2 text-center text-xs font-bold transition-all cursor-pointer ${
                                  editBay === b
                                    ? "border-amber-600 bg-amber-50 text-amber-800 ring-2 ring-amber-200"
                                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                                }`}
                              >
                                {b}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Target Handover Date & Time */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="block text-xs font-bold text-slate-700">
                              Expected Handover (ETA) <span className="text-rose-500">*</span>
                            </label>
                            {editEstimatedOut && (
                              <span className="text-[11px] font-bold text-amber-700 font-mono">
                                {formatEtaDisplay(editEstimatedOut)}
                              </span>
                            )}
                          </div>
                          <DesktopDateTimePicker
                            value={editEstimatedOut}
                            onChange={setEditEstimatedOut}
                            className="w-full"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Rollback Reason Form (when active) */}
              {rollbackConfirmOpen && (
                <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Undo2 className="h-4 w-4 text-rose-600" />
                    <p className="text-xs font-bold text-rose-950">Confirm Status Rollback</p>
                  </div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Reason for Rollback <span className="text-rose-500">*</span>
                    <textarea
                      autoFocus
                      maxLength={500}
                      rows={2}
                      value={rollbackReason}
                      onChange={(event) => setRollbackReason(event.target.value)}
                      placeholder="Enter the reason for restoring the previous workflow status..."
                      className="mt-1 w-full resize-none rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
                    />
                  </label>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => { setRollbackConfirmOpen(false); setRollbackReason(""); }}
                      className="h-8 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isSaving || rollbackReason.trim().length < 1}
                      onClick={handleRollbackStatus}
                      className="inline-flex h-8 items-center justify-center rounded-lg bg-rose-600 px-3 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50 cursor-pointer shadow-2xs"
                    >
                      {isSaving ? "Rolling back..." : "Confirm Rollback"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Action Footer */}
            <div className="flex items-center justify-between border-t border-slate-100 bg-white px-6 py-4">
              <div>
                {canRollbackStatus && !["scheduled", "collected"].includes(selectedWO.canonicalStatus) && !(isHeadManagerRole && selectedWO.canonicalStatus === "checked_in") && !rollbackConfirmOpen && (
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => setRollbackConfirmOpen(true)}
                    className="inline-flex h-10 items-center rounded-xl border border-rose-200 bg-white px-4 text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50 cursor-pointer transition-colors"
                  >
                    <Undo2 className="mr-1.5 h-4 w-4 text-rose-500" />
                    Undo previous status
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-6 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  {selectedWO.canonicalStatus === "collected" ? "Close" : "Cancel"}
                </button>

                {selectedWO.canonicalStatus === "checked_in" ? (
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => handleUpdateStatus("inspected")}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-6 text-xs font-bold text-white shadow-sm transition-all hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
                  >
                    Start Inspection →
                  </button>
                ) : selectedWO.canonicalStatus === "inspected" ? (
                  <button
                    type="button"
                    disabled={isSaving || (inspectionParts.length > 0 && inspectionParts.some(p => !p.description && !p.code))}
                    onClick={async () => {
                      setIsSaving(true);
                      try {
                        if (inspectionActualIssue !== (selectedWO.actualIssue || "")) {
                          await postApi("admin-update-work-order", {
                            id: selectedWO.id,
                            actualIssue: inspectionActualIssue.trim(),
                          });
                          const updated = {
                            ...selectedWO,
                            actualIssue: inspectionActualIssue.trim(),
                          };
                          setDetailWO(prev => prev ? ({
                            ...prev,
                            actualIssue: inspectionActualIssue.trim(),
                          }) : null);
                          setSelectedWO(updated);
                          setWorkOrders(current => current.map(item => item.id === selectedWO.id ? {
                            ...item,
                            actualIssue: inspectionActualIssue.trim(),
                          } : item));
                        }
                        if (isInspectionPartsModified) {
                          await handleSaveRequiredParts();
                        }
                        if (canManageQuotation) {
                          openQuotationModal(selectedWO);
                        } else {
                          toast.success("Inspection findings saved.");
                          closeModal();
                        }
                      } catch (err: any) {
                        toast.error(err?.message || "Failed to save inspection findings.");
                      } finally {
                        setIsSaving(false);
                      }
                    }}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-6 text-xs font-bold text-white shadow-sm transition-all hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
                  >
                    <FileText className="h-4 w-4" />
                    {inspectionParts.length > 0
                      ? `Save & Prepare Quotation (${inspectionParts.length} parts) →`
                      : "Save & Review Labour Quotation →"}
                  </button>
                ) : (
                  <>
                    {selectedWO.canonicalStatus === "under_repair" && (
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={async () => {
                          setIsSaving(true);
                          try {
                            const payload: Record<string, any> = {
                              id: selectedWO.id,
                              bay: editBay || null,
                              estimatedOut: editEstimatedOut
                                ? (editEstimatedOut.includes("T")
                                    ? editEstimatedOut.replace("T", " ") + (editEstimatedOut.length === 16 ? ":00" : "")
                                    : editEstimatedOut)
                                : null,
                            };
                            await postApi("admin-update-work-order", payload);
                            const updated = {
                              ...selectedWO,
                              bay: editBay || null,
                              estimatedOut: payload.estimatedOut || null,
                            };
                            setDetailWO(prev => prev ? ({ ...prev, bay: editBay || null, estimatedOut: payload.estimatedOut || null }) : null);
                            setSelectedWO(updated);
                            setWorkOrders(current => current.map(item => item.id === selectedWO.id ? { ...item, bay: editBay || null, estimatedOut: payload.estimatedOut || null } : item));
                            toast.success("Workshop bay and handover ETA updated.");
                            closeModal();
                          } catch (err: any) {
                            toast.error(err?.message || "Failed to update workshop bay and ETA.");
                          } finally {
                            setIsSaving(false);
                          }
                        }}
                        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all cursor-pointer"
                      >
                        <Save className="h-4 w-4" />
                        Save Bay &amp; ETA
                      </button>
                    )}
                    {!selectedWO.isBackOrder &&
                      ["pending_parts", "partially_arrived"].includes(effectivePartsStatus || selectedWO.partsStatus || "not_required") &&
                      ["pending_parts", "parts_ready"].includes(selectedWO.canonicalStatus) && (
                        <div className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-800 shadow-2xs">
                          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                          <span>Parts shortage detected. Stock receiving or Back Order required to start repair.</span>
                        </div>
                    )}
                    {getAllowedNextStatuses(selectedWO.canonicalStatus, effectivePartsStatus || selectedWO.partsStatus || "not_required", Boolean(selectedWO.isBackOrder)).length > 0 &&
                      getAllowedNextStatuses(selectedWO.canonicalStatus, effectivePartsStatus || selectedWO.partsStatus || "not_required", Boolean(selectedWO.isBackOrder)).map((status) => {
                        let buttonLabel = `${t(`status_${status}`)} →`;
                        if (selectedWO.canonicalStatus === "scheduled" && status === "checked_in") {
                          buttonLabel = "Check In Vehicle →";
                        } else if (selectedWO.canonicalStatus === "approved") {
                          if (status === "parts_ready") buttonLabel = "Confirm Parts Ready →";
                          else if (status === "pending_parts") buttonLabel = "Pending Parts / Procurement →";
                          else if (status === "under_repair") buttonLabel = "Assign Bay & Start Repair →";
                        } else if (selectedWO.canonicalStatus === "pending_parts" && status === "parts_ready") {
                          buttonLabel = "Confirm Parts Ready →";
                        } else if (selectedWO.canonicalStatus === "parts_ready" && status === "under_repair") {
                          buttonLabel = "Start Repair →";
                        } else if (selectedWO.canonicalStatus === "under_repair" && status === "ready_for_collection") {
                          buttonLabel = "Finish Repair (Ready →)";
                        } else if (selectedWO.canonicalStatus === "ready_for_collection" && status === "collected") {
                          buttonLabel = "Complete Handover (Collected →)";
                        }
                        return (
                          <button
                            key={status}
                            type="button"
                            disabled={isSaving}
                            onClick={() => handleUpdateStatus(status)}
                            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-6 text-xs font-bold text-white shadow-sm transition-all hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
                          >
                            {buttonLabel}
                          </button>
                        );
                      })}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Confirmation Modal for Removing Inspection Part */}
      {partToRemoveModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-100">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5 border border-slate-200 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600 ring-1 ring-rose-200">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Remove Spare Part?</h3>
                <p className="text-xs text-slate-500">Confirm removing this required part</p>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 mb-4">
              <p className="text-xs font-bold text-slate-900">{partToRemoveModal.name}</p>
              {partToRemoveModal.code ? (
                <span className="mt-1 inline-block font-mono text-[10px] font-bold text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                  {partToRemoveModal.code}
                </span>
              ) : null}
            </div>
            <p className="text-xs text-slate-600 mb-4">
              Are you sure you want to remove this item from the required parts list?
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPartToRemoveModal(null)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setInspectionParts((current) => current.filter((_, lineIndex) => lineIndex !== partToRemoveModal.index));
                  setInspectionPartsConfirmed(false);
                  setPartToRemoveModal(null);
                  toast.success("Part removed from requirements list.");
                }}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-rose-700 active:scale-95 transition-all"
              >
                Confirm Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attachment Preview Modal */}
      {previewAttachment && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setPreviewAttachment(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50/80">
              <div className="flex items-center gap-2.5 min-w-0 pr-4">
                {previewAttachment.type === "pdf" ? (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600 border border-rose-200/60">
                    <FileText className="h-4 w-4" />
                  </span>
                ) : (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 border border-blue-200/60">
                    <Camera className="h-4 w-4" />
                  </span>
                )}
                <div className="min-w-0">
                  <h3 className="text-xs font-bold text-slate-900 truncate" title={previewAttachment.name}>
                    {previewAttachment.name}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                    {previewAttachment.by ? `Uploaded by ${previewAttachment.by}` : ""}
                    {previewAttachment.time ? ` · ${formatCreatedDateTime(previewAttachment.time)}` : ""}
                    {previewAttachment.size ? ` · ${previewAttachment.size}` : ""}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={previewAttachment.url}
                  download={previewAttachment.name}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors"
                >
                  <Download className="h-3.5 w-3.5 text-slate-500" />
                  Download
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewAttachment(null)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 transition-colors cursor-pointer"
                  aria-label="Close preview"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-auto p-4 bg-slate-900/5 flex items-center justify-center min-h-[320px]">
              {previewAttachment.type === "pdf" ? (
                <iframe
                  src={previewAttachment.url}
                  title={previewAttachment.name}
                  className="w-full h-[70vh] rounded-xl border border-slate-200 bg-white shadow-xs"
                />
              ) : (
                <img
                  src={previewAttachment.url}
                  alt={previewAttachment.name}
                  className="max-h-[75vh] w-auto max-w-full rounded-xl object-contain shadow-md"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
