import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import {
  ArrowLeft,
  Calendar,
  CalendarClock,
  CheckCircle2,
  Clock,
  Clock3,
  Eye,
  FileText,
  Layers,
  Package,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  Trash2,
  Truck,
  Download,
  Filter,
  X,
  ChevronRight,
  AlertTriangle,
  AlertCircle,
  CircleDollarSign,
  CheckSquare,
  Square,
  Send,
  RotateCcw,
  MessageSquare,
  Copy,
  Check,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import logo from "../../MAW_logo.png";
import { apiRequest, postApi } from "../lib/api";
import { useApiData } from "../lib/use-api-data";
import { PageLoading } from "./ui/page-loading";
import { hasAdminPermission } from "../lib/admin-permissions";
import { AdminSelect } from "./ui/admin-select";
import { DesktopDatePicker } from "./ui/desktop-date-picker";
import { AutoCountSyncBadge } from "./autocount-sync-badge";
import { DocumentItemCatalogSelect, type DocumentCatalogPart } from "./ui/document-item-catalog-select";
import { useConfirmationDialog } from "../contexts/confirmation-dialog-context";
import { SortableHeader, useSortState, compareValues } from "./ui/sortable-header";
import { AdminPagination } from "./ui/admin-pagination";
import {
  AdminFormDialog,
  AdminFormDialogHeader,
  AdminFormDialogBody,
  AdminFormDialogFooter,
} from "./ui/admin-form-dialog";

type POTabType = "all" | "ordered" | "pending_sync" | "sync_failed" | "synced" | "receiving" | "received" | "draft";

const poTabs = new Set<POTabType>(["all", "ordered", "pending_sync", "sync_failed", "synced", "receiving", "received", "draft"]);

function isPendingSyncPO(order: PurchaseOrder) {
  return ["queued", "pending", "processing", "failed"].includes(order.syncStatus || "") || order.status === "pending_sync";
}

type PurchaseOrderItem = {
  id?: number;
  partId: number | null;
  itemCode: string;
  description: string;
  uom: string;
  quantity: number;
  receivedQuantity: number;
  unitCost: number;
  taxCode: string;
  taxRate: number;
  taxAmount?: number;
  amount?: number;
};

type PurchaseOrder = {
  id: number;
  poNo?: string;
  internalRef: string;
  autocountPoNo: string;
  workOrderId: number | null;
  workOrderNo: string;
  supplierCode: string;
  supplierName: string;
  orderDate: string;
  estimatedArrivalDate: string;
  reminderDays: number;
  status: "draft" | "pending_sync" | "ordered" | "partially_received" | "received" | "cancelled";
  currency: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  notes: string;
  syncStatus: "not_queued" | "queued" | "processing" | "synced" | "failed";
  syncError: string;
  items: PurchaseOrderItem[];
};

type PartOption = { id: number; name: string; sku: string; cost: number; uom: string; supplier: string; supplierCode: string; supplierName: string };
type WorkOrderOption = { id: number; workOrderNo: string; companyName: string };
type SupplierOption = {
  code: string;
  name: string;
  registrationNo: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  paymentTerm: string;
  creditLimit: number;
  currency: string;
  taxCode: string;
};
type PurchaseOrderOptions = { suppliers: SupplierOption[]; parts: PartOption[]; workOrders: WorkOrderOption[] };
type PurchaseOrderForm = Omit<PurchaseOrder, "id" | "internalRef" | "autocountPoNo" | "status" | "currency" | "subtotal" | "taxAmount" | "total" | "syncStatus" | "syncError" | "workOrderNo"> & { id?: number };
type PurchaseOrderDocumentSettings = {
  company: { legalName: string; registrationNo: string; groupName: string; address: string; phone: string; email: string };
};

const today = () => new Date().toISOString().slice(0, 10);
const futureDate = (days: number) => { const value = new Date(); value.setDate(value.getDate() + days); return value.toISOString().slice(0, 10); };
const blankItem = (): PurchaseOrderItem => ({ partId: null, itemCode: "", description: "", uom: "UNIT", quantity: 1, receivedQuantity: 0, unitCost: 0, taxCode: "", taxRate: 0 });
const blankForm = (): PurchaseOrderForm => ({ supplierCode: "", supplierName: "", workOrderId: null, orderDate: today(), estimatedArrivalDate: futureDate(7), reminderDays: 1, notes: "", items: [blankItem()] });
const money = (value: number) => Number(value || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pdfText = (value: unknown) => String(value ?? "").normalize("NFKD").replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();

function canReceivePO(order: PurchaseOrder) {
  if (!["ordered", "partially_received"].includes(order.status)) return false;
  if (order.syncStatus === "failed" || order.syncStatus === "queued" || order.syncStatus === "processing") return false;
  return true;
}

function formatOrderStatusLabel(order: PurchaseOrder) {
  if (order.status === "cancelled") return "Cancelled";
  if (order.status === "received") return "Received";
  if (order.status === "partially_received") return "Partially Received";
  if (order.syncStatus === "failed") return "On Hold";
  if (order.status === "draft") return "Draft";
  return "Ordered";
}

function statusClass(order: PurchaseOrder | string) {
  const status = typeof order === "string" ? order : order.status;
  const syncStatus = typeof order === "string" ? "" : order.syncStatus;
  if (status === "received") return "bg-emerald-100 text-emerald-700";
  if (status === "cancelled" || syncStatus === "failed") return "bg-rose-100 text-rose-700";
  if (status === "partially_received") return "bg-amber-100 text-amber-700";
  if (status === "ordered" || status === "pending_sync") return "bg-blue-100 text-blue-700";
  return "bg-slate-100 text-slate-600";
}

function daysUntilArrival(order: PurchaseOrder) {
  return Math.floor((new Date(`${order.estimatedArrivalDate}T00:00:00`).getTime() - new Date(`${today()}T00:00:00`).getTime()) / 86400000);
}

function arrivalLabel(order: PurchaseOrder) {
  if (["received", "cancelled"].includes(order.status)) return order.status === "received" ? "Received" : "Cancelled";
  const difference = daysUntilArrival(order);
  if (difference < 0) return `${Math.abs(difference)} day(s) overdue`;
  if (difference === 0) return "Arriving today";
  return `In ${difference} day(s)`;
}

function PurchaseOrderDocumentPreview({
  reference,
  autocountPoNo,
  supplierCode,
  supplierName,
  supplier,
  orderDate,
  estimatedArrivalDate,
  workOrderNo,
  items,
  subtotal,
  taxAmount,
  total,
  notes,
  company,
}: {
  reference: string;
  autocountPoNo?: string;
  supplierCode: string;
  supplierName: string;
  supplier?: SupplierOption | null;
  orderDate: string;
  estimatedArrivalDate: string;
  workOrderNo: string;
  items: PurchaseOrderItem[];
  subtotal: number;
  taxAmount: number;
  total: number;
  notes: string;
  company?: PurchaseOrderDocumentSettings["company"] | null;
}) {
  return (
    <article className="mx-auto shrink-0 w-[794px] min-h-[1123px] rounded-xs bg-white p-10 text-[11px] text-slate-900 shadow-2xl font-sans border border-slate-200/80">
      {/* Header */}
      <header className="flex items-start justify-between border-b-2 border-[#1e3a8a] pb-4">
        <div>
          <h1 className="text-base font-extrabold tracking-tight text-slate-900">
            {company?.legalName || "MEWAH AUTOWORKS SDN BHD"}
          </h1>
          <div className="mt-1 space-y-0.5 text-[10px] text-slate-600 leading-tight">
            {company?.registrationNo ? <p>Registration No: {company.registrationNo}</p> : null}
            {company?.groupName ? <p>{company.groupName}</p> : null}
            <p>{company?.address || "Configure your workshop address"}</p>
            <p>Tel: {company?.phone || "+60 00-000 0000"}{company?.email ? ` | ${company.email}` : ""}</p>
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-2xl font-black tracking-tight text-[#1e3a8a]">PURCHASE ORDER</h2>
          <p className="mt-1 text-xs font-bold text-slate-800">
            MAW PO Ref: <span className="font-mono">{reference}</span>
          </p>
          <p className="text-[11px] text-slate-600">
            AutoCount PO No: <span className="font-mono font-semibold">{autocountPoNo || "Pending sync"}</span>
          </p>
        </div>
      </header>

      {/* Supplier & Order Details Grid */}
      <div className="mt-4 grid grid-cols-2 gap-8 text-[11px]">
        <div>
          <h3 className="text-xs font-bold uppercase text-slate-900 tracking-wide mb-1.5">SUPPLIER</h3>
          <div className="space-y-0.5 text-slate-700 leading-snug">
            <p className="font-bold text-slate-900">{supplierName || "Select supplier"}</p>
            {supplierCode ? <p>Supplier Code: {supplierCode}</p> : null}
            {supplier?.registrationNo ? <p>Registration No: {supplier.registrationNo}</p> : null}
            {supplier?.address ? <p className="whitespace-pre-wrap">{supplier.address}</p> : null}
            {[supplier?.contact, supplier?.phone, supplier?.email].filter(Boolean).length > 0 ? (
              <p>{[supplier?.contact, supplier?.phone, supplier?.email].filter(Boolean).join(" | ")}</p>
            ) : null}
          </div>
        </div>
        <div>
          <h3 className="text-xs font-bold uppercase text-slate-900 tracking-wide mb-1.5">ORDER DETAILS</h3>
          <dl className="grid grid-cols-[130px_1fr] gap-y-1 text-slate-700">
            <dt>Order Date:</dt><dd className="font-medium text-slate-900">{orderDate || "—"}</dd>
            <dt>Estimated Arrival:</dt><dd className="font-medium text-slate-900">{estimatedArrivalDate || "—"}</dd>
            <dt>Related Work Order:</dt><dd className="font-medium text-slate-900">{workOrderNo || "General stock purchase"}</dd>
            <dt>Payment Term:</dt><dd className="font-medium text-slate-900">{supplier?.paymentTerm || "As agreed"}</dd>
            <dt>Currency:</dt><dd className="font-medium text-slate-900">MYR</dd>
          </dl>
        </div>
      </div>

      {/* Items Table with Navy Header */}
      <table className="mt-5 w-full border-collapse border border-slate-200 text-[10px]">
        <thead>
          <tr className="bg-[#1e3a8a] text-white">
            <th className="w-10 px-2 py-2 text-center font-bold">No.</th>
            <th className="px-3 py-2 text-left font-bold">Item Code / Description</th>
            <th className="w-14 px-2 py-2 text-right font-bold">Qty</th>
            <th className="w-14 px-2 py-2 text-center font-bold">UOM</th>
            <th className="w-24 px-2 py-2 text-right font-bold">Unit Cost (RM)</th>
            <th className="w-20 px-2 py-2 text-right font-bold">Tax (RM)</th>
            <th className="w-24 px-2 py-2 text-right font-bold">Amount (RM)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {items.map((item, index) => {
            const itemAmount = item.amount || Number(item.quantity || 0) * Number(item.unitCost || 0);
            const itemTax = item.taxAmount || (itemAmount * Number(item.taxRate || 0)) / 100;
            return (
              <tr key={item.id || index} className="align-top hover:bg-slate-50/50">
                <td className="px-2 py-2 text-center text-slate-500">{index + 1}</td>
                <td className="px-3 py-2">
                  <p className="font-bold text-slate-900">{item.itemCode ? `${item.itemCode} - ` : ""}{item.description || "Item description"}</p>
                  {item.taxCode ? <p className="text-[9px] text-slate-500 uppercase">{item.taxCode} · {Number(item.taxRate || 0).toFixed(2)}%</p> : null}
                </td>
                <td className="px-2 py-2 text-right font-medium text-slate-800">{Number(item.quantity || 0).toFixed(2)}</td>
                <td className="px-2 py-2 text-center text-slate-600">{item.uom || "UNIT"}</td>
                <td className="px-2 py-2 text-right text-slate-800">{money(item.unitCost)}</td>
                <td className="px-2 py-2 text-right text-slate-600">{money(itemTax)}</td>
                <td className="px-2 py-2 text-right font-bold text-slate-900">{money(itemAmount)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Summary and Financial Totals */}
      <div className="mt-5 grid grid-cols-[1fr_260px] gap-6 pt-2">
        <div>
          {notes ? (
            <div>
              <p className="text-xs font-bold text-slate-900">Notes / Instructions</p>
              <p className="mt-1 whitespace-pre-wrap text-slate-600 text-[10px]">{notes}</p>
            </div>
          ) : null}
        </div>
        <div className="space-y-1.5 text-[11px] text-right">
          <div className="flex justify-between text-slate-700">
            <span>Subtotal</span>
            <span className="font-semibold text-slate-900">RM {money(subtotal)}</span>
          </div>
          <div className="flex justify-between text-slate-700">
            <span>SST / Tax</span>
            <span className="font-semibold text-slate-900">RM {money(taxAmount)}</span>
          </div>
          <div className="border-t border-slate-900 pt-1.5 flex justify-between text-sm font-extrabold text-slate-900">
            <span>TOTAL</span>
            <span>RM {money(total)}</span>
          </div>
        </div>
      </div>

      {/* Authorization & Signatures */}
      <div className="mt-12 grid grid-cols-2 gap-12 text-center text-[10px]">
        <div>
          <div className="border-t border-slate-400 pt-1.5 font-bold text-slate-800">
            Authorised by Mewah AutoWorks
          </div>
        </div>
        <div>
          <div className="border-t border-slate-400 pt-1.5 font-bold text-slate-800">
            Supplier acknowledgement
          </div>
        </div>
      </div>

      <p className="mt-4 text-center text-[10px] font-bold text-slate-900">
        Please confirm item availability and delivery ETA via WhatsApp.
      </p>

      <div className="mt-6 border-t border-slate-100 pt-2 text-center text-[9px] text-slate-400 font-medium">
        MAW Purchase Order {reference} | Page 1
      </div>
    </article>
  );
}

type WhatsAppTemplateType = "formal" | "concise" | "urgent";

function cleanWhatsAppPhone(phone?: string | null): string {
  if (!phone) return "";
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) {
    digits = "60" + digits.slice(1);
  } else if (!digits.startsWith("60") && digits.length >= 9) {
    digits = "60" + digits;
  }
  return digits;
}

function buildWhatsAppOrderMessage(
  order: PurchaseOrder,
  templateType: WhatsAppTemplateType,
  supplier?: SupplierOption | null,
  company?: PurchaseOrderDocumentSettings["company"] | null
): string {
  const poRef = order.autocountPoNo || order.internalRef;
  const companyName = company?.legalName || "MEWAH AUTOWORKS SDN BHD";
  const address = company?.address || "Configure your workshop address";
  const companyPhone = company?.phone || "+60 00-000 0000";
  const supplierName = supplier?.name || order.supplierName;

  if (templateType === "urgent") {
    return [
      `🚨 *[URGENT / SEGERA] PESANAN BARANG (PO)*`,
      `🏢 *${companyName}*`,
      `📄 *PO Ref:* ${poRef}`,
      `🏭 *Kepada:* ${supplierName}`,
      `📅 *Tarikh:* ${order.orderDate}`,
      `⚡ *DIPERLUKAN SEGERA / URGENT ETA:* ${order.estimatedArrivalDate}`,
      order.workOrderNo ? `🔧 *Kenderaan / WO:* ${order.workOrderNo}` : "",
      ``,
      `📦 *SENARAI BARANG:*`,
      ...order.items.map(
        (item, idx) =>
          `${idx + 1}. *${item.itemCode ? `[${item.itemCode}] ` : ""}${item.description}*\n   Kuantiti: *${item.quantity} ${item.uom || "UNIT"}*`
      ),
      ``,
      order.notes ? `📝 *Catatan:* ${order.notes}\n` : "",
      `📍 *Alamat Hantar:*`,
      `${address}`,
      `👤 *Hubungi / PIC:* ${companyPhone}`,
      ``,
      `_Mohon sahkan stok ada & dispatch segera. Terima kasih!_`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (templateType === "concise") {
    return [
      `Salam / Hi *${supplierName}*,`,
      `Pesanan barang dari *${companyName}* (PO: *${poRef}*):`,
      ``,
      `*Senarai Barang:*`,
      ...order.items.map(
        (item) =>
          `• ${item.itemCode ? `[${item.itemCode}] ` : ""}${item.description} — *${item.quantity} ${item.uom || "UNIT"}*`
      ),
      ``,
      `📅 *Tarikh:* ${order.orderDate} | 🚚 *Target ETA:* ${order.estimatedArrivalDate}`,
      order.workOrderNo ? `🔧 *WO Ref:* ${order.workOrderNo}` : "",
      order.notes ? `📝 *Nota:* ${order.notes}` : "",
      `📍 *Hantar ke:* ${address}`,
      ``,
      `Sila confirm stok & anggaran sampai. Terima kasih!`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  // "formal" standard
  return [
    `*PURCHASE ORDER / PESANAN PEMBELIAN*`,
    `🏢 *${companyName}*`,
    `----------------------------------------`,
    `📄 *PO Reference:* ${poRef}`,
    `🏭 *Supplier:* ${supplierName}${order.supplierCode ? ` (${order.supplierCode})` : ""}`,
    `📅 *Order Date:* ${order.orderDate}`,
    `🚚 *Target Delivery ETA:* ${order.estimatedArrivalDate}`,
    order.workOrderNo ? `🔧 *Related Work Order:* ${order.workOrderNo}` : `🔧 *Purpose:* General Workshop Stock`,
    `----------------------------------------`,
    `📦 *ORDER ITEMS / SENARAI BARANG:*`,
    ...order.items.map(
      (item, idx) =>
        `${idx + 1}. *${item.itemCode ? `[${item.itemCode}] ` : ""}${item.description}*\n   Qty: *${item.quantity} ${item.uom || "PCS"}* @ RM ${Number(item.unitCost || 0).toFixed(2)} = RM ${Number((item.quantity || 0) * (item.unitCost || 0)).toFixed(2)}`
    ),
    `----------------------------------------`,
    `💰 *Estimated Total:* RM ${Number(order.total || 0).toFixed(2)} (inc. tax)`,
    order.notes ? `📝 *Special Instructions:* ${order.notes}` : "",
    `📍 *Delivery Address / Alamat Penghantaran:*`,
    `${address}`,
    `👤 *Workshop Contact / PIC:* ${companyPhone}`,
    ``,
    `_Please confirm receipt, item availability and delivery ETA via WhatsApp. Thank you!_`,
    `_Sila sahkan pesanan, stok & waktu penghantaran. Terima kasih!_`,
  ]
    .filter(Boolean)
    .join("\n");
}

function WhatsAppOrderModal({
  order,
  supplier,
  company,
  onClose,
}: {
  order: PurchaseOrder | null;
  supplier?: SupplierOption | null;
  company?: PurchaseOrderDocumentSettings["company"] | null;
  onClose: () => void;
}) {
  const [template, setTemplate] = useState<WhatsAppTemplateType>("formal");
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (order) {
      setTemplate("formal");
      setText(buildWhatsAppOrderMessage(order, "formal", supplier, company));
      setCopied(false);
    }
  }, [order, supplier, company]);

  if (!order) return null;

  const handleSwitchTemplate = (type: WhatsAppTemplateType) => {
    setTemplate(type);
    setText(buildWhatsAppOrderMessage(order, type, supplier, company));
    setCopied(false);
  };

  const handleCopy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("WhatsApp order message copied to clipboard!");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Failed to copy automatically. Please select and copy the text.");
    }
  };

  const supplierPhone = supplier?.phone || supplier?.contact || "";
  const cleanPhone = cleanWhatsAppPhone(supplierPhone);

  const handleOpenWhatsApp = () => {
    const encoded = encodeURIComponent(text);
    const url = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
    window.open(url, "_blank");
  };

  return (
    <AdminFormDialog labelledBy="whatsapp-po-modal-title" size="lg">
      <AdminFormDialogHeader
        id="whatsapp-po-modal-title"
        title="WhatsApp Order Template"
        description={`${order.autocountPoNo || order.internalRef} · ${order.supplierName}`}
        onClose={onClose}
      />
      <AdminFormDialogBody className="space-y-4 p-5">
        {/* Supplier contact info strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 border border-slate-200 px-4 py-2.5 text-xs text-slate-700">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900">Supplier Contact:</span>
            {supplierPhone ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100/70 px-2.5 py-0.5 font-bold text-emerald-800">
                📞 {supplierPhone}
              </span>
            ) : (
              <span className="text-slate-400 italic">No phone on file (you can choose contact in WhatsApp)</span>
            )}
          </div>
          <span className="text-[11px] font-medium text-slate-500">
            {order.items.length} item(s) · RM {Number(order.total || 0).toFixed(2)}
          </span>
        </div>

        {/* Template Selector Tabs */}
        <div>
          <label className="text-xs font-bold text-slate-700 mb-2 block">
            Select Message Template:
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleSwitchTemplate("formal")}
              className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all cursor-pointer ${
                template === "formal"
                  ? "border-[#1e3a8a] bg-blue-50/60 text-[#1e3a8a] shadow-xs ring-1 ring-[#1e3a8a]/20"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <span className="text-xs font-bold">1. Formal PO (Standard)</span>
              <span className="text-[10px] text-slate-500 mt-0.5">Full reference, pricing & company header</span>
            </button>

            <button
              type="button"
              onClick={() => handleSwitchTemplate("concise")}
              className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all cursor-pointer ${
                template === "concise"
                  ? "border-[#1e3a8a] bg-blue-50/60 text-[#1e3a8a] shadow-xs ring-1 ring-[#1e3a8a]/20"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <span className="text-xs font-bold">2. Quick Item List</span>
              <span className="text-[10px] text-slate-500 mt-0.5">Concise items, quantities & ETA only</span>
            </button>

            <button
              type="button"
              onClick={() => handleSwitchTemplate("urgent")}
              className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all cursor-pointer ${
                template === "urgent"
                  ? "border-rose-600 bg-rose-50/60 text-rose-800 shadow-xs ring-1 ring-rose-600/20"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <span className="text-xs font-bold text-rose-700">3. Urgent / VOR Order</span>
              <span className="text-[10px] text-slate-500 mt-0.5">Priority dispatch notice for rush repairs</span>
            </button>
          </div>
        </div>

        {/* Message Editor Area */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-slate-700">
              Message Preview (Editable):
            </span>
            <span className="text-[11px] text-slate-400">
              {text.length} characters · {text.split("\n").length} lines
            </span>
          </div>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setCopied(false);
            }}
            rows={12}
            className="w-full rounded-xl border border-slate-300 bg-slate-50/70 p-3.5 font-mono text-xs text-slate-800 outline-none transition focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            placeholder="WhatsApp message content..."
          />
          <p className="mt-1 text-[11px] text-slate-500">
            💡 Tip: Text formatting like <span className="font-mono font-bold">*bold*</span> and <span className="font-mono italic">_italics_</span> will be rendered in WhatsApp.
          </p>
        </div>
      </AdminFormDialogBody>

      <AdminFormDialogFooter className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 p-4 bg-slate-50">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
        >
          Close
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleOpenWhatsApp}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 text-xs font-bold text-emerald-800 hover:bg-emerald-50 cursor-pointer shadow-2xs"
            title="Open chat in WhatsApp with this message"
          >
            <ExternalLink className="h-4 w-4 text-emerald-600" />
            <span>Open in WhatsApp</span>
          </button>

          <button
            type="button"
            onClick={handleCopy}
            className={`inline-flex h-10 items-center gap-2 rounded-xl px-5 text-xs font-bold text-white shadow-sm transition-all cursor-pointer ${
              copied ? "bg-emerald-700" : "bg-emerald-600 hover:bg-emerald-700 active:scale-95"
            }`}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            <span>{copied ? "Copied to Clipboard!" : "Copy WhatsApp Text"}</span>
          </button>
        </div>
      </AdminFormDialogFooter>
    </AdminFormDialog>
  );
}

export function PurchaseOrders() {
  const [searchParams, setSearchParams] = useSearchParams();
  const canManage = hasAdminPermission("order.update");
  const confirmAction = useConfirmationDialog();
  const { data: orders, isLoading, error, reload, hasLoaded } = useApiData<PurchaseOrder[]>("admin-purchase-orders", []);
  const [options, setOptions] = useState<PurchaseOrderOptions>({ suppliers: [], parts: [], workOrders: [] });
  const [search, setSearch] = useState(() => (searchParams.get("po") || searchParams.get("search") || "").trim());

  useEffect(() => {
    const query = (searchParams.get("po") || searchParams.get("search") || "").trim();
    if (query) {
      setSearch(query);
    }
  }, [searchParams]);

  useEffect(() => {
    const poQuery = (searchParams.get("po") || "").trim();
    if (poQuery && orders.length > 0) {
      const match = orders.find(
        (o) =>
          (o.poNo || "").trim().toUpperCase() === poQuery.toUpperCase() ||
          (o.autocountPoNo || "").trim().toUpperCase() === poQuery.toUpperCase() ||
          (o.internalRef || "").trim().toUpperCase() === poQuery.toUpperCase() ||
          String(o.id) === poQuery
      );
      if (match) {
        setViewOrder(match);
      }
    }
  }, [searchParams, orders]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const requestedView = searchParams.get("view") as POTabType | null;
  const activeTab: POTabType = requestedView && poTabs.has(requestedView) ? requestedView : "all";
  const isSyncQueueView = activeTab === "pending_sync" || activeTab === "sync_failed";
  const [status, setStatus] = useState("all");
  const [form, setForm] = useState<PurchaseOrderForm | null>(null);
  const [viewOrder, setViewOrder] = useState<PurchaseOrder | null>(null);
  const [receiving, setReceiving] = useState<Record<number, number> | null>(null);
  const [whatsappModalOrder, setWhatsappModalOrder] = useState<PurchaseOrder | null>(null);
  const [documentSettings, setDocumentSettings] = useState<PurchaseOrderDocumentSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [exportingPdfId, setExportingPdfId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isBatchSyncing, setIsBatchSyncing] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const deferredSearch = useDeferredValue(search);

  const pendingDocuments = useMemo(() => {
    return orders.filter((order) =>
      isPendingSyncPO(order) && order.status !== "cancelled"
    );
  }, [orders]);
  const pendingCount = pendingDocuments.length;

  const counts = useMemo(() => {
    return {
      all: orders.length,
      ordered: orders.filter((item) => ["ordered", "pending_sync", "partially_received"].includes(item.status)).length,
      synced: orders.filter((item) => item.syncStatus === "synced").length,
      receiving: orders.filter((item) => item.status === "partially_received").length,
      received: orders.filter((item) => item.status === "received").length,
      draft: orders.filter((item) => item.status === "draft").length,
      failed: orders.filter((item) => item.syncStatus === "failed").length,
      arrivingSoon: orders.filter((item) => !["received", "cancelled", "draft"].includes(item.status) && daysUntilArrival(item) >= 0 && daysUntilArrival(item) <= item.reminderDays).length,
      overdue: orders.filter((item) => !["received", "cancelled", "draft"].includes(item.status) && daysUntilArrival(item) < 0).length,
    };
  }, [orders]);

  const filtered = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    return orders.filter((order) => {
      // Tab filter
      if (activeTab === "ordered" && !["ordered", "pending_sync", "partially_received"].includes(order.status)) return false;
      if (activeTab === "pending_sync" && !isPendingSyncPO(order)) return false;
      if (activeTab === "sync_failed" && order.syncStatus !== "failed") return false;
      if (activeTab === "synced" && order.syncStatus !== "synced") return false;
      if (activeTab === "receiving" && order.status !== "partially_received") return false;
      if (activeTab === "received" && order.status !== "received") return false;
      if (activeTab === "draft" && order.status !== "draft") return false;
      if (isSyncQueueView && order.status === "cancelled") return false;

      // Date range filter
      if (startDate && order.orderDate && order.orderDate < startDate) return false;
      if (endDate && order.orderDate && order.orderDate > endDate) return false;

      // Status dropdown filter
      if (status !== "all" && order.status !== status) return false;

      // Search query
      if (!query) return true;
      return (
        (order.internalRef && order.internalRef.toLowerCase().includes(query)) ||
        (order.autocountPoNo && order.autocountPoNo.toLowerCase().includes(query)) ||
        (order.supplierCode && order.supplierCode.toLowerCase().includes(query)) ||
        (order.supplierName && order.supplierName.toLowerCase().includes(query)) ||
        (order.workOrderNo && order.workOrderNo.toLowerCase().includes(query)) ||
        order.items.some(
          (item) =>
            (item.itemCode && item.itemCode.toLowerCase().includes(query)) ||
            (item.description && item.description.toLowerCase().includes(query))
        )
      );
    });
  }, [orders, deferredSearch, status, activeTab, isSyncQueueView, startDate, endDate]);

  const { sortKey, sortDirection, handleSort, setSortKey } = useSortState(null, "desc");

  const sortedAndFiltered = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";
      switch (sortKey) {
        case "refNo":
          aVal = a.internalRef || a.autocountPoNo || "";
          bVal = b.internalRef || b.autocountPoNo || "";
          break;
        case "supplier":
          aVal = a.supplierName || "";
          bVal = b.supplierName || "";
          break;
        case "workOrder":
          aVal = a.workOrderNo || "";
          bVal = b.workOrderNo || "";
          break;
        case "orderDate":
          aVal = a.orderDate || "";
          bVal = b.orderDate || "";
          break;
        case "items":
          aVal = a.items.reduce((s, i) => s + i.quantity, 0);
          bVal = b.items.reduce((s, i) => s + i.quantity, 0);
          break;
        case "total":
          aVal = a.total;
          bVal = b.total;
          break;
        case "syncStatus":
          aVal = a.syncStatus || "";
          bVal = b.syncStatus || "";
          break;
        case "status":
          aVal = a.status || "";
          bVal = b.status || "";
          break;
        default:
          return 0;
      }
      return compareValues(aVal, bVal, sortDirection);
    });
  }, [filtered, sortKey, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedAndFiltered.length / pageSize));
  const paginatedOrders = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedAndFiltered.slice(start, start + pageSize);
  }, [sortedAndFiltered, page, pageSize]);

  const isPOSyncable = (order: PurchaseOrder) => {
    if (order.syncStatus === "synced" || order.syncStatus === "not_queued") return false;
    if (["draft", "cancelled"].includes(order.status)) return false;
    if (isSyncQueueView) {
      return ["queued", "processing", "failed"].includes(order.syncStatus);
    }
    return order.syncStatus === "failed";
  };

  const syncableInFiltered = useMemo(() => {
    return filtered.filter(isPOSyncable);
  }, [filtered, isPOSyncable]);

  const isAllSyncableSelected =
    syncableInFiltered.length > 0 &&
    syncableInFiltered.every((o) => selectedIds.has(o.id));

  const toggleSelect = (order: PurchaseOrder) => {
    if (!isPOSyncable(order)) {
      if (order.syncStatus === "synced") {
        toast.info("This Purchase Order is already synced to AutoCount.");
      } else if (order.syncStatus === "not_queued") {
        toast.info("This Purchase Order was placed as a local order without AutoCount sync.");
      } else if (order.status === "draft") {
        toast.info("Draft purchase orders must be confirmed before syncing.");
      } else if (order.status === "cancelled") {
        toast.info("Cancelled purchase orders cannot be synced.");
      } else if (order.syncStatus === "queued") {
        toast.info("This Purchase Order is already in the AutoCount queue.");
      }
      return;
    }
    const next = new Set(selectedIds);
    if (next.has(order.id)) {
      next.delete(order.id);
    } else {
      next.add(order.id);
    }
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (syncableInFiltered.length === 0) {
      toast.info("No syncable purchase orders available in this view.");
      return;
    }
    if (isAllSyncableSelected) {
      setSelectedIds(new Set());
    } else {
      const next = new Set(selectedIds);
      syncableInFiltered.forEach((o) => next.add(o.id));
      setSelectedIds(next);
    }
  };

  const handleBatchQueueSync = async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    const confirmed = await confirmAction({
      title: `${isSyncQueueView ? "Sync" : "Queue"} ${count} Purchase Order(s) to AutoCount?`,
      description: isSyncQueueView
        ? `This will trigger AutoCount synchronization for ${count} selected purchase order(s).`
        : `This will move ${count} selected purchase order(s) to the AutoCount sync queue.`,
      confirmLabel: isSyncQueueView ? "Sync to AutoCount" : "Queue Sync",
      tone: "primary",
    });
    if (!confirmed) return;

    setIsBatchSyncing(true);
    try {
      const idsArray = Array.from(selectedIds);
      const results = await Promise.allSettled(
        idsArray.map((id) => postApi("admin-retry-purchase-order-sync", { id }))
      );
      const successfulCount = results.filter((r) => r.status === "fulfilled").length;
      if (successfulCount > 0) {
        toast.success(`${successfulCount} purchase order(s) queued for AutoCount sync.`);
      }
      if (successfulCount < idsArray.length) {
        toast.error(`${idsArray.length - successfulCount} purchase order(s) could not be queued.`);
      }
      setSelectedIds(new Set());
      await reload();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Failed to queue purchase orders for sync.");
    } finally {
      setIsBatchSyncing(false);
    }
  };

  const totals = useMemo(() => {
    const items = form?.items || [];
    const subtotal = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitCost || 0), 0);
    const tax = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitCost || 0) * Number(item.taxRate || 0) / 100, 0);
    return { subtotal, tax, total: subtotal + tax };
  }, [form?.items]);
  const selectedSupplier = useMemo(
    () => options.suppliers.find((supplier) => supplier.code === form?.supplierCode) || null,
    [options.suppliers, form?.supplierCode],
  );

  function matchesSupplier(
    selectedCode?: string,
    selectedName?: string,
    part?: { supplier?: string; supplierCode?: string; supplierName?: string }
  ): boolean {
    if (!selectedCode && !selectedName) return false;
    const sCode = (selectedCode || "").trim().toUpperCase();
    const sName = (selectedName || "").trim().toUpperCase();

    const pCode = (part?.supplierCode || "").trim().toUpperCase();
    const pName = (part?.supplierName || "").trim().toUpperCase();
    const pRaw = (part?.supplier || "").trim().toUpperCase();

    if (sCode) {
      if (pCode && (pCode === sCode || pCode.includes(sCode) || sCode.includes(pCode))) return true;
      if (pRaw && (pRaw === sCode || pRaw.includes(sCode) || pRaw.includes(`(${sCode})`))) return true;
    }
    if (sName) {
      if (pName && (pName === sName || pName.includes(sName) || sName.includes(pName))) return true;
      if (pRaw && (pRaw === sName || pRaw.includes(sName) || sName.includes(pRaw))) return true;
    }
    return false;
  }

  const linkedParts = useMemo(() => {
    if (!form?.supplierCode && !form?.supplierName) return [];
    return options.parts.filter((part) =>
      matchesSupplier(form.supplierCode, form.supplierName, part)
    );
  }, [options.parts, form?.supplierCode, form?.supplierName]);

  const catalogParts: DocumentCatalogPart[] = useMemo(() => {
    const hasSupplier = Boolean(form?.supplierCode || form?.supplierName);

    return options.parts
      .map((p) => {
        const isPreferred = hasSupplier && matchesSupplier(form?.supplierCode, form?.supplierName, p);

        return {
          id: p.id,
          sku: p.sku || "",
          name: p.name || "",
          price: p.cost || 0,
          uom: p.uom || "UNIT",
          itemGroup: [
            p.supplierCode,
            p.supplierName,
          ].filter(Boolean).join(" · "),
          itemType: "part" as const,
          taxCode: "",
          isActive: true,
          isPreferred,
        };
      })
      .sort((a, b) => {
        if (a.isPreferred && !b.isPreferred) return -1;
        if (!a.isPreferred && b.isPreferred) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [options.parts, form?.supplierCode, form?.supplierName]);

  const loadOptions = async () => {
    try {
      const poOptions = await apiRequest<PurchaseOrderOptions>("admin-purchase-order-options");
      setOptions(poOptions);
      return poOptions;
    } catch {
      return options;
    }
  };

  useEffect(() => {
    void loadOptions();
    void apiRequest<PurchaseOrderDocumentSettings>("admin-system-settings")
      .then(setDocumentSettings)
      .catch(() => setDocumentSettings(null));
  }, []);

  const openCreate = () => {
    setForm(blankForm());
    void loadOptions();
  };

  const openDraft = (order: PurchaseOrder) => {
    setForm({
      id: order.id,
      supplierCode: order.supplierCode,
      supplierName: order.supplierName,
      workOrderId: order.workOrderId,
      orderDate: order.orderDate,
      estimatedArrivalDate: order.estimatedArrivalDate,
      reminderDays: order.reminderDays,
      notes: order.notes,
      items: order.items.map((item) => ({ ...item })),
    });
    void loadOptions();
  };

  const updateItem = (index: number, patch: Partial<PurchaseOrderItem>) => setForm((current) => current ? ({ ...current, items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) }) : current);

  const handleRemovePOItem = async (index: number) => {
    if (!form) return;
    const targetItem = form.items[index];
    const itemLabel = targetItem?.description?.trim() || targetItem?.itemCode?.trim() || `Line #${index + 1}`;
    const confirmed = await confirmAction({
      title: "Remove Purchase Order Item?",
      description: `Are you sure you want to remove "${itemLabel}" from this supplier order?`,
      confirmLabel: "Remove Item",
      tone: "danger",
    });
    if (!confirmed) return;

    setForm({
      ...form,
      items: form.items.filter((_, itemIndex) => itemIndex !== index),
    });
  };

  const selectPart = (index: number, partId: string) => {
    const part = options.parts.find((item) => item.id === Number(partId));
    if (!part) return updateItem(index, { partId: null });
    setForm((current) => current ? {
      ...current,
      supplierCode: current.supplierCode || part.supplierCode || part.supplier,
      supplierName: current.supplierName || part.supplierName,
      items: current.items.map((item, itemIndex) => itemIndex === index ? {
        ...item,
        partId: part.id,
        itemCode: part.sku,
        description: part.name,
        uom: part.uom || "UNIT",
        unitCost: part.cost,
      } : item),
    } : current);
  };

  const selectSupplier = (supplierCode: string) => {
    if (!form) return;
    if (!supplierCode) {
      setForm({ ...form, supplierCode: "", supplierName: "" });
      return;
    }
    const supplier = options.suppliers.find((item) => item.code === supplierCode);
    if (supplier) setForm({ ...form, supplierCode: supplier.code, supplierName: supplier.name });
  };

  const save = async (submitMode?: "autocount") => {
    if (!form) return;
    setSaving(true);
    try {
      const saved = await postApi<PurchaseOrder>("admin-save-purchase-order", form);
      const result = submitMode ? await postApi<PurchaseOrder>("admin-submit-purchase-order", { id: saved.id, syncToAutoCount: submitMode === "autocount" }) : saved;
      toast.success(submitMode === "autocount" ? `${result.internalRef} confirmed and queued for AutoCount.` : "Purchase Order draft saved.");
      setForm(null);
      if (submitMode === "autocount") setViewOrder(result);
      await reload();
    } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Unable to save Purchase Order."); }
    finally { setSaving(false); }
  };

  const retrySync = async (order: PurchaseOrder) => {
    setSaving(true);
    try { await postApi("admin-retry-purchase-order-sync", { id: order.id }); toast.success("Purchase Order queued for AutoCount."); await reload(); }
    catch (caught) { toast.error(caught instanceof Error ? caught.message : "Unable to retry sync."); }
    finally { setSaving(false); }
  };

  const downloadPurchaseOrderPdf = async (order: PurchaseOrder) => {
    if (order.status === "draft") {
      toast.error("Confirm the Purchase Order before downloading the supplier PDF.");
      return;
    }
    if (order.status === "cancelled") {
      toast.error("A cancelled Purchase Order cannot be sent to a supplier.");
      return;
    }

    setExportingPdfId(order.id);
    try {
      const settings = await apiRequest<PurchaseOrderDocumentSettings>("admin-system-settings").catch(() => null);
      const company = settings?.company;
      const supplier = options.suppliers.find((item) => item.code === order.supplierCode);
      const document = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const pageWidth = document.internal.pageSize.getWidth();
      const margin = 14;

      document.setTextColor(15, 23, 42);
      document.setFont("helvetica", "bold");
      document.setFontSize(16);
      document.text(pdfText(company?.legalName || "MEWAH AUTOWORKS SDN BHD"), margin, 16);
      document.setFont("helvetica", "normal");
      document.setFontSize(8);
      const companyLines = [
        company?.registrationNo ? `Registration No: ${company.registrationNo}` : "",
        company?.groupName || "",
        company?.address || "",
        [company?.phone, company?.email].filter(Boolean).join(" | "),
      ].filter(Boolean).map(pdfText);
      document.text(companyLines, margin, 21);

      document.setFont("helvetica", "bold");
      document.setFontSize(19);
      document.setTextColor(30, 58, 138);
      document.text("PURCHASE ORDER", pageWidth - margin, 16, { align: "right" });
      document.setTextColor(15, 23, 42);
      document.setFontSize(9);
      document.text(`MAW PO Ref: ${pdfText(order.internalRef || `PO-${order.id}`)}`, pageWidth - margin, 23, { align: "right" });
      document.setFont("helvetica", "normal");
      document.text(`AutoCount PO No: ${pdfText(order.autocountPoNo || "Pending sync")}`, pageWidth - margin, 28, { align: "right" });
      document.setDrawColor(30, 58, 138);
      document.setLineWidth(0.7);
      document.line(margin, 38, pageWidth - margin, 38);

      document.setFont("helvetica", "bold");
      document.setFontSize(9);
      document.text("SUPPLIER", margin, 46);
      document.text("ORDER DETAILS", 116, 46);
      document.setFont("helvetica", "normal");
      document.setFontSize(8.5);
      const supplierLines = [
        order.supplierName,
        order.supplierCode ? `Supplier Code: ${order.supplierCode}` : "",
        supplier?.registrationNo ? `Registration No: ${supplier.registrationNo}` : "",
        supplier?.address || "",
        [supplier?.contact, supplier?.phone, supplier?.email].filter(Boolean).join(" | "),
      ].filter(Boolean).map(pdfText);
      document.text(document.splitTextToSize(supplierLines.join("\n"), 92), margin, 52);
      const detailLines = [
        `Order Date: ${order.orderDate}`,
        `Estimated Arrival: ${order.estimatedArrivalDate}`,
        `Related Work Order: ${order.workOrderNo || "General stock purchase"}`,
        `Payment Term: ${supplier?.paymentTerm || "As agreed"}`,
        `Currency: ${order.currency || "MYR"}`,
      ].map(pdfText);
      document.text(detailLines, 116, 52);

      autoTable(document, {
        startY: 78,
        margin: { left: margin, right: margin, bottom: 20 },
        theme: "grid",
        head: [["No.", "Item Code / Description", "Qty", "UOM", "Unit Cost (RM)", "Tax (RM)", "Amount (RM)"]],
        body: order.items.map((item, index) => [
          String(index + 1),
          pdfText(`${item.itemCode ? `${item.itemCode} - ` : ""}${item.description}`),
          Number(item.quantity).toFixed(2),
          pdfText(item.uom || "UNIT"),
          money(item.unitCost),
          money(item.taxAmount || 0),
          money(item.amount || item.quantity * item.unitCost),
        ]),
        styles: { font: "helvetica", fontSize: 7.5, cellPadding: 2.2, textColor: [30, 41, 59], lineColor: [203, 213, 225], lineWidth: 0.15 },
        headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: "bold", halign: "center" },
        columnStyles: {
          0: { cellWidth: 9, halign: "center" },
          1: { cellWidth: 73 },
          2: { cellWidth: 14, halign: "right" },
          3: { cellWidth: 15, halign: "center" },
          4: { cellWidth: 23, halign: "right" },
          5: { cellWidth: 20, halign: "right" },
          6: { cellWidth: 25, halign: "right" },
        },
        didDrawPage: () => {
          const pageNumber = document.getNumberOfPages();
          document.setFontSize(7);
          document.setTextColor(100, 116, 139);
          document.text(`MAW Purchase Order ${pdfText(order.internalRef)} | Page ${pageNumber}`, pageWidth / 2, 291, { align: "center" });
        },
      });

      let finalY = ((document as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 82) + 6;
      if (finalY > 238) {
        document.addPage();
        finalY = 18;
      }
      const totalsX = pageWidth - margin - 62;
      document.setFontSize(8.5);
      document.setTextColor(15, 23, 42);
      document.text("Subtotal", totalsX, finalY);
      document.text(`RM ${money(order.subtotal)}`, pageWidth - margin, finalY, { align: "right" });
      document.text("SST / Tax", totalsX, finalY + 5);
      document.text(`RM ${money(order.taxAmount)}`, pageWidth - margin, finalY + 5, { align: "right" });
      document.setDrawColor(15, 23, 42);
      document.line(totalsX, finalY + 8, pageWidth - margin, finalY + 8);
      document.setFont("helvetica", "bold");
      document.setFontSize(10);
      document.text("TOTAL", totalsX, finalY + 14);
      document.text(`RM ${money(order.total)}`, pageWidth - margin, finalY + 14, { align: "right" });

      document.setFont("helvetica", "normal");
      document.setFontSize(8);
      if (order.notes) {
        document.setFont("helvetica", "bold");
        document.text("Notes / Instructions", margin, finalY);
        document.setFont("helvetica", "normal");
        document.text(document.splitTextToSize(pdfText(order.notes), 92), margin, finalY + 5);
      }
      const signatureY = Math.max(finalY + 35, 250);
      document.setDrawColor(100, 116, 139);
      document.line(margin, signatureY, 78, signatureY);
      document.line(125, signatureY, pageWidth - margin, signatureY);
      document.setFontSize(7.5);
      document.text("Authorised by Mewah AutoWorks", margin, signatureY + 4);
      document.text("Supplier acknowledgement", 125, signatureY + 4);
      document.setFont("helvetica", "bold");
      document.text("Please confirm item availability and delivery ETA via WhatsApp.", margin, signatureY + 13);

      const fileReference = (order.internalRef || `PO-${order.id}`).replace(/[^A-Za-z0-9_-]+/g, "-");
      document.save(`${fileReference}.pdf`);
      toast.success(`${fileReference}.pdf downloaded and ready to send to the supplier.`);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Unable to generate Purchase Order PDF.");
    } finally {
      setExportingPdfId(null);
    }
  };

  const openReceiving = (order: PurchaseOrder) => {
    setViewOrder(order);
    setReceiving(Object.fromEntries(order.items.filter((item) => item.id).map((item) => [item.id!, item.receivedQuantity])));
  };

  const saveReceiving = async () => {
    if (!viewOrder || !receiving) return;
    setSaving(true);
    try {
      await postApi("admin-receive-purchase-order", { id: viewOrder.id, items: viewOrder.items.map((item) => ({ id: item.id, receivedQuantity: item.id ? Number(receiving[item.id] ?? item.receivedQuantity) : 0 })) });
      toast.success("Receiving saved and inventory updated."); setViewOrder(null); setReceiving(null); await reload();
    } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Unable to receive parts."); }
    finally { setSaving(false); }
  };

  if (isLoading && !hasLoaded) {
    return (
      <PageLoading
        title="Loading Purchase Orders..."
        description="Fetching supplier orders and receiving statuses..."
      />
    );
  }

  if (form) {
    const isEditing = Boolean(form.id);
    return (
      <div className="space-y-4">
        {/* Unified Card Frame */}
        <div className="w-full space-y-6">
          {/* Header Bar */}
          <header className="no-print flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-2xs sm:px-7 sm:py-5">
            <div className="flex flex-wrap items-center gap-3.5">
              <button
                type="button"
                onClick={() => setForm(null)}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Supplier Orders
              </button>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1e3a8a] ring-1 ring-blue-100">
                <ShoppingCart className="h-5 w-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-extrabold text-slate-900">
                    {isEditing ? `Edit Supplier Order (PO)` : "New Supplier Order (PO)"}
                  </h2>
                  <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#1e3a8a] border border-blue-100">
                    {form.supplierCode ? `Supplier: ${form.supplierCode}` : "Draft PO"}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  Build the supplier order in MAW, queue its accounting record to AutoCount, then download the PDF for WhatsApp.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 hidden sm:inline">
                {form.items.length} item line(s)
              </span>
              <button type="button" disabled={saving} onClick={() => void save()} className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-[#1e3a8a] shadow-2xs hover:bg-blue-50 disabled:opacity-50 cursor-pointer">Save Draft</button>
              <button type="button" disabled={saving} onClick={() => void save("autocount")} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#1e3a8a] px-4 text-xs font-bold text-white shadow-xs hover:bg-blue-800 disabled:opacity-50 cursor-pointer"><RefreshCw className={`h-3.5 w-3.5 ${saving ? "animate-spin" : ""}`} />Confirm &amp; Sync</button>
            </div>
          </header>

          <div className="purchase-order-layout w-full">
            <main className="w-full">
              <div className="space-y-5">
            {/* Section 1: Supplier & Schedule */}
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
              <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1e3a8a]">
                    <Truck className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-extrabold text-slate-900 truncate">1. Supplier &amp; Schedule</h3>
                    <p className="text-[11px] text-slate-500 truncate">Select AutoCount Creditor &amp; order timing.</p>
                  </div>
                </div>
                {form.supplierCode ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 whitespace-nowrap">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Creditor Linked
                  </span>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {/* AutoCount Supplier Dropdown */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    AutoCount Supplier
                  </label>
                  <AdminSelect
                    value={options.suppliers.some((supplier) => supplier.code === form.supplierCode) ? form.supplierCode : ""}
                    onChange={(event) => selectSupplier(event.target.value)}
                    className="w-full text-xs font-medium"
                  >
                    <option value="">-- Select AutoCount Supplier / Creditor --</option>
                    {options.suppliers.map((supplier) => (
                      <option key={supplier.code} value={supplier.code}>
                        {supplier.code} · {supplier.name}
                      </option>
                    ))}
                  </AdminSelect>
                </div>

                {/* Supplier Code */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Supplier Code
                  </label>
                  <input
                    value={form.supplierCode}
                    onChange={(event) => setForm({ ...form, supplierCode: event.target.value.toUpperCase() })}
                    placeholder="Required for AutoCount"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-xs font-bold text-slate-800 uppercase focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Supplier Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Supplier Name
                  </label>
                  <input
                    value={form.supplierName}
                    onChange={(event) => setForm({ ...form, supplierName: event.target.value })}
                    placeholder="Enter supplier company name"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Selected Supplier Details Info Banner */}
                {selectedSupplier ? (
                  <div className="sm:col-span-2 grid gap-3 rounded-xl border border-blue-100 bg-blue-50/50 p-3.5 text-xs text-slate-700 sm:grid-cols-2">
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-400">Contact Person</span>
                      <p className="font-semibold text-slate-800 truncate">{selectedSupplier.contact || "—"}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-400">Phone</span>
                      <p className="font-semibold text-slate-800 truncate">{selectedSupplier.phone || "—"}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-400">Payment Term</span>
                      <p className="font-semibold text-slate-800 truncate">{selectedSupplier.paymentTerm || "30 Days"}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase text-slate-400">Credit Limit</span>
                      <p className="font-semibold text-slate-800 truncate">{selectedSupplier.currency || "MYR"} {money(selectedSupplier.creditLimit)}</p>
                    </div>
                    {selectedSupplier.address ? (
                      <p className="text-[11px] text-slate-500 sm:col-span-2 border-t border-blue-100/60 pt-2 mt-1">
                        📍 {selectedSupplier.address}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {/* Order Date */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Order Date
                  </label>
                  <DesktopDatePicker
                    value={form.orderDate}
                    onChange={(value) => setForm({ ...form, orderDate: value })}
                    ariaLabel="Choose purchase order date"
                    allowPastDates
                    className="h-10 text-xs bg-slate-50"
                  />
                </div>

                {/* Estimated Arrival Date */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Estimated Arrival (ETA)
                  </label>
                  <DesktopDatePicker
                    value={form.estimatedArrivalDate}
                    onChange={(value) => setForm({ ...form, estimatedArrivalDate: value })}
                    ariaLabel="Choose estimated arrival date"
                    className="h-10 text-xs border-amber-200 bg-amber-50/50"
                  />
                </div>

                {/* Remind Before */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Arrival Reminder
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="30"
                      value={form.reminderDays}
                      onChange={(event) => setForm({ ...form, reminderDays: Number(event.target.value) })}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 pr-28 text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">
                      days before ETA
                    </span>
                  </div>
                </div>

                {/* Related Work Order */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Related Work Order (Optional)
                  </label>
                  <AdminSelect
                    value={form.workOrderId || ""}
                    onChange={(event) => setForm({ ...form, workOrderId: event.target.value ? Number(event.target.value) : null })}
                    className="w-full text-xs"
                  >
                    <option value="">General inventory purchase (Not tied to specific work order)</option>
                    {options.workOrders.map((job) => (
                      <option key={job.id} value={job.id}>
                        {job.workOrderNo} · {job.companyName}
                      </option>
                    ))}
                  </AdminSelect>
                </div>
              </div>
            </section>

            {/* Section 2: Parts & Item Lines */}
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-[#1e3a8a]">
                    <Layers className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900">2. Order Item Lines</h3>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                        {form.items.length} Line(s)
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {form.supplierCode
                        ? linkedParts.length > 0
                          ? `Showing ${linkedParts.length} linked item(s) for ${form.supplierName || form.supplierCode}`
                          : "Full parts catalogue and custom item lines available."
                        : "Select parts from catalogue or add custom item lines."}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {form.items.map((item, index) => {
                  const lineTotal = Number(item.quantity || 0) * Number(item.unitCost || 0);
                  const lineTax = lineTotal * (Number(item.taxRate || 0) / 100);
                  const lineGrandTotal = lineTotal + lineTax;

                  return (
                    <div
                      key={item.id || index}
                      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition-all hover:border-slate-300 space-y-3"
                    >
                      {/* Item Line Header */}
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-blue-100 text-[11px] font-black text-[#1e3a8a]">
                            #{index + 1}
                          </span>
                          <span className="text-xs font-extrabold text-slate-900 truncate max-w-[200px]">
                            {item.description || item.itemCode || "New Item Line"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <div className="text-right">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1.5">Line Total</span>
                            <span className="text-xs font-black text-[#1e3a8a]">
                              RM {money(lineGrandTotal)}
                            </span>
                          </div>
                          {form.items.length > 1 ? (
                            <button
                              type="button"
                              onClick={() => void handleRemovePOItem(index)}
                              className="rounded-lg p-1 text-rose-400 hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer"
                              title="Remove item line"
                              aria-label="Remove line"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          ) : null}
                        </div>
                      </div>

                      {/* Field 1: Stock Catalogue Search (Full-width for easy picking) */}
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Stock Catalogue (Auto-fill)
                        </label>
                        <DocumentItemCatalogSelect
                          itemType="part"
                          code={item.itemCode}
                          parts={catalogParts}
                          services={[]}
                          compact
                          onSelect={(selection) => {
                            const matchedPart = options.parts.find(
                              (p) =>
                                (p.sku && p.sku.toUpperCase() === selection.code.toUpperCase()) ||
                                (p.name && p.name.trim().toUpperCase() === selection.description.trim().toUpperCase())
                            );
                            const resolvedCost = Number(
                              (matchedPart?.cost !== undefined && matchedPart.cost > 0)
                                ? matchedPart.cost
                                : ((matchedPart as any)?.price !== undefined && (matchedPart as any).price > 0)
                                ? (matchedPart as any).price
                                : (selection.unitPrice || 0)
                            );
                            updateItem(index, {
                              partId: matchedPart?.id || null,
                              itemCode: selection.code,
                              description: selection.description,
                              uom: matchedPart?.uom || item.uom || "PCS",
                              unitCost: resolvedCost,
                            });
                            const targetSupplierCode = (matchedPart?.supplierCode || matchedPart?.supplier || "").trim();
                            if (targetSupplierCode && !form.supplierCode) {
                              const matchedSup = options.suppliers.find((s) => s.code.toUpperCase() === targetSupplierCode.toUpperCase());
                              const finalCode = matchedSup?.code || targetSupplierCode;
                              const finalName = matchedSup?.name || matchedPart?.supplierName || matchedPart?.supplier || finalCode;
                              setForm((current) =>
                                current
                                  ? {
                                      ...current,
                                      supplierCode: finalCode,
                                      supplierName: finalName,
                                    }
                                  : current
                              );
                              toast.info(`Supplier auto-selected: ${finalCode} · ${finalName}`);
                            }
                          }}
                        />
                      </div>

                      {/* Field 2: Item Code & UOM (3:1 ratio, perfectly aligned) */}
                      <div className="grid grid-cols-4 gap-2.5">
                        <div className="col-span-3">
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Item Code / SKU
                          </label>
                          <input
                            value={item.itemCode}
                            onChange={(event) => {
                              const code = event.target.value.toUpperCase();
                              const matched = options.parts.find((p) => p.sku && p.sku.toUpperCase() === code.trim());
                              if (matched) {
                                const resolvedCost = Number(
                                  (matched.cost !== undefined && matched.cost > 0)
                                    ? matched.cost
                                    : ((matched as any).price !== undefined && (matched as any).price > 0)
                                    ? (matched as any).price
                                    : 0
                                );
                                updateItem(index, {
                                  itemCode: code,
                                  partId: matched.id,
                                  description: matched.name,
                                  uom: matched.uom || "PCS",
                                  unitCost: resolvedCost,
                                });
                                const targetSupplierCode = (matched.supplierCode || matched.supplier || "").trim();
                                if (targetSupplierCode && !form.supplierCode) {
                                  const matchedSup = options.suppliers.find((s) => s.code.toUpperCase() === targetSupplierCode.toUpperCase());
                                  const finalCode = matchedSup?.code || targetSupplierCode;
                                  const finalName = matchedSup?.name || matched.supplierName || matched.supplier || finalCode;
                                  setForm((current) =>
                                    current
                                      ? {
                                          ...current,
                                          supplierCode: finalCode,
                                          supplierName: finalName,
                                        }
                                      : current
                                  );
                                  toast.info(`Supplier auto-selected: ${finalCode} · ${finalName}`);
                                }
                              } else {
                                updateItem(index, { itemCode: code });
                              }
                            }}
                            placeholder="e.g. 079567600114"
                            className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-xs font-bold text-slate-800 uppercase focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div className="col-span-1">
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            UOM
                          </label>
                          <input
                            value={item.uom}
                            onChange={(event) => updateItem(index, { uom: event.target.value.toUpperCase() })}
                            placeholder="PCS"
                            className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-2 text-center text-xs font-bold uppercase text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      {/* Field 3: Item Description */}
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Item Description
                        </label>
                        <input
                          value={item.description}
                          onChange={(event) => updateItem(index, { description: event.target.value })}
                          placeholder="Detailed part description or specification"
                          className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      {/* Field 4: Quantity, Unit Cost & Tax in a 3-column evenly-spaced grid */}
                      <div className="grid grid-cols-3 gap-2.5">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Quantity
                          </label>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={item.quantity}
                            onChange={(event) => updateItem(index, { quantity: Math.max(1, Number(event.target.value)) })}
                            className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-2 text-center text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Unit Cost (RM)
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unitCost}
                            onChange={(event) => updateItem(index, { unitCost: Number(event.target.value) })}
                            className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-2.5 text-right text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Tax Rate
                          </label>
                          <AdminSelect
                            value={item.taxRate}
                            onChange={(event) => {
                              const rate = Number(event.target.value);
                              updateItem(index, { taxRate: rate, taxCode: rate === 8 ? "SV-8" : item.taxCode || "" });
                            }}
                            className="h-10 w-full text-xs font-medium"
                          >
                            <option value={0}>0%</option>
                            <option value={8}>8% (SV-8)</option>
                          </AdminSelect>
                        </div>
                      </div>
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={() => setForm({ ...form, items: [...form.items, blankItem()] })}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-3 text-xs font-bold text-[#1e3a8a] transition-colors hover:border-blue-300 hover:bg-blue-50/50 cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  Add Another Item Line
                </button>
              </div>
            </section>

            {/* Section 3: Notes & Financial Grand Totals */}
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Internal Notes / Remarks
                  </label>
                  <textarea
                    rows={4}
                    value={form.notes}
                    onChange={(event) => setForm({ ...form, notes: event.target.value })}
                    placeholder="Enter any instructions, supplier references or internal notes..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                  <h4 className="text-xs font-extrabold uppercase tracking-wide text-slate-500 border-b border-slate-200/80 pb-2">
                    PO Financial Summary
                  </h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>Subtotal</span>
                      <span className="font-bold text-slate-800">RM {money(totals.subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>SST Tax</span>
                      <span className="font-bold text-slate-800">RM {money(totals.tax)}</span>
                    </div>
                    <div className="border-t border-slate-200 pt-2.5 flex justify-between items-baseline">
                      <span className="text-xs font-bold text-slate-900">Total Order</span>
                      <span className="text-xl font-extrabold text-[#1e3a8a]">
                        RM {money(totals.total)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

              </div>
            </main>
          </div>
        </div>
      </div>
    );
  }

  if (viewOrder) {
    return (
      <div className="space-y-4">
        {/* Unified Card Frame */}
        <div className="flex w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm">
          {/* Header with Back Button */}
          <header className="no-print flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-7 sm:py-5">
            <div className="flex flex-wrap items-center gap-3.5">
              <button
                type="button"
                onClick={() => {
                  if (receiving) {
                    setReceiving(null);
                  } else {
                    setViewOrder(null);
                    setReceiving(null);
                  }
                }}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" />
                {receiving ? "Back to Supplier Order" : "Back to Supplier Orders"}
              </button>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                <PackageCheck className="h-5 w-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-extrabold text-slate-900">
                    {viewOrder.autocountPoNo || viewOrder.internalRef}
                  </h2>
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${statusClass(viewOrder)}`}>
                    {formatOrderStatusLabel(viewOrder)}
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${viewOrder.syncStatus === "failed" ? "bg-rose-100 text-rose-700" : viewOrder.syncStatus === "synced" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                    AutoCount: {viewOrder.syncStatus.replaceAll("_", " ")}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {receiving ? "Record received quantities and update real-time workshop inventory." : `${viewOrder.supplierName} · ETA ${viewOrder.estimatedArrivalDate}`}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!receiving ? (
                <button
                  type="button"
                  onClick={() => setWhatsappModalOrder(viewOrder)}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 text-xs font-bold text-emerald-800 shadow-sm transition-colors hover:bg-emerald-100 hover:border-emerald-400 cursor-pointer"
                  title="WhatsApp order template and direct messaging"
                >
                  <MessageSquare className="h-4 w-4 text-emerald-600" />
                  <span>WhatsApp Template</span>
                </button>
              ) : null}
              {!receiving && !["draft", "cancelled"].includes(viewOrder.status) ? (
                <button
                  type="button"
                  disabled={exportingPdfId === viewOrder.id}
                  onClick={() => void downloadPurchaseOrderPdf(viewOrder)}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 text-xs font-bold text-[#1e3a8a] shadow-sm transition-colors hover:bg-blue-50 disabled:opacity-50 cursor-pointer"
                >
                  <Download className="h-4 w-4" />
                  {exportingPdfId === viewOrder.id ? "Generating PDF..." : "Download PO PDF"}
                </button>
              ) : null}
              {canManage && canReceivePO(viewOrder) && !receiving ? (
                <button
                  type="button"
                  onClick={() => openReceiving(viewOrder)}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition-colors cursor-pointer"
                >
                  <PackageCheck className="h-4 w-4" />
                  Receive Parts
                </button>
              ) : null}
            </div>
          </header>

          <div className="p-4 sm:p-6 space-y-6">
            {viewOrder.syncError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <strong>AutoCount sync failed:</strong> {viewOrder.syncError}
                </div>
                {canManage && viewOrder.syncStatus === "failed" ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void retrySync(viewOrder)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-rose-700 transition-colors cursor-pointer shrink-0"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Retry Sync</span>
                  </button>
                ) : null}
              </div>
            ) : null}

            {/* Supplier & Work Order Meta Grid */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div>
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Supplier</span>
                <p className="mt-1 text-sm font-bold text-slate-900">{viewOrder.supplierName}</p>
                <p className="text-xs text-slate-500">{viewOrder.supplierCode || "No code"}</p>
              </div>
              <div>
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Work Order</span>
                <p className="mt-1 text-sm font-bold text-blue-700">{viewOrder.workOrderNo || "General stock purchase"}</p>
              </div>
              <div>
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Arrival Schedule</span>
                <p className="mt-1 text-sm font-bold text-slate-900">{viewOrder.estimatedArrivalDate}</p>
                <p className={`text-xs ${arrivalLabel(viewOrder).includes("overdue") ? "font-bold text-rose-600" : "text-slate-500"}`}>
                  {arrivalLabel(viewOrder)}
                </p>
              </div>
            </div>

            {/* Items List */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900">Order Items &amp; Receiving Progress</h3>
                <span className="text-xs font-bold text-slate-500">{viewOrder.items.length} item(s)</span>
              </div>

              <div className="space-y-3">
                {viewOrder.items.map((item, index) => (
                  <div
                    key={item.id || index}
                    className="grid grid-cols-1 gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-4 sm:grid-cols-[1fr_130px_160px] items-center"
                  >
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        {item.itemCode ? <span className="font-mono text-blue-700 mr-1.5">{item.itemCode}</span> : null}
                        {item.description}
                      </p>
                      <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                        <span>Ordered: <strong className="text-slate-700">{item.quantity} {item.uom}</strong></span>
                        <span>·</span>
                        <span>Received: <strong className={item.receivedQuantity >= item.quantity ? "text-emerald-700 font-bold" : "text-amber-700 font-bold"}>{item.receivedQuantity} {item.uom}</strong></span>
                      </div>
                    </div>
                    <div className="sm:text-right">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block sm:hidden">Amount</span>
                      <p className="text-sm font-bold text-slate-900">
                        RM {money(item.amount || item.quantity * item.unitCost)}
                      </p>
                    </div>
                    {receiving && item.id ? (
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-emerald-700 mb-1">
                          Receive Quantity Now
                        </label>
                        <input
                          type="number"
                          min={item.receivedQuantity}
                          max={item.quantity}
                          step="1"
                          value={receiving[item.id] ?? item.receivedQuantity}
                          onChange={(event) => setReceiving({ ...receiving, [item.id!]: Number(event.target.value) })}
                          className="w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-bold text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    ) : (
                      <div className="text-right">
                        {item.receivedQuantity >= item.quantity ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Fully Received
                          </span>
                        ) : item.receivedQuantity > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                            <Clock className="h-3.5 w-3.5" /> Partially Arrived
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                            Pending Arrival
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Financial Totals */}
              <div className="flex justify-end gap-6 border-t border-slate-100 pt-4 text-xs font-medium">
                <span>Subtotal: <strong className="text-slate-800">RM {money(viewOrder.subtotal)}</strong></span>
                <span>Tax: <strong className="text-slate-800">RM {money(viewOrder.taxAmount)}</strong></span>
                <span className="text-sm font-extrabold text-[#1e3a8a]">Total: <strong>RM {money(viewOrder.total)}</strong></span>
              </div>
            </div>

            {/* Action Bar */}
            {receiving ? (
              <div className="sticky bottom-4 z-10 flex flex-col-reverse gap-3 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <button
                  type="button"
                  onClick={() => setReceiving(null)}
                  className="h-11 rounded-xl border border-slate-200 bg-white px-5 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel Receiving
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveReceiving()}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                >
                  <PackageCheck className="h-4 w-4" />
                  {saving ? "Saving..." : "Save Receiving & Update Inventory"}
                </button>
              </div>
            ) : (
              <div className="flex justify-end rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <button
                  type="button"
                  onClick={() => { setViewOrder(null); setReceiving(null); }}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-6 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 cursor-pointer"
                >
                  Back to List
                </button>
              </div>
            )}
          </div>
        </div>

        <WhatsAppOrderModal
          order={whatsappModalOrder}
          supplier={options.suppliers.find((s) => s.code === whatsappModalOrder?.supplierCode) || null}
          company={documentSettings?.company}
          onClose={() => setWhatsappModalOrder(null)}
        />
      </div>
    );
  }


  const tabItems: { id: POTabType; label: string; count: number; badgeColor?: string }[] = [
    { id: "all", label: "All POs", count: counts.all },
    { id: "ordered", label: "Active / Ordered", count: counts.ordered },
    { id: "pending_sync", label: "Pending Sync", count: pendingCount, badgeColor: "bg-amber-100 text-amber-800" },
    { id: "sync_failed", label: "Sync Failed", count: counts.failed, badgeColor: counts.failed > 0 ? "bg-rose-100 text-rose-700" : undefined },
    { id: "synced", label: "Synced to AutoCount", count: counts.synced, badgeColor: "bg-emerald-100 text-emerald-800" },
    { id: "receiving", label: "Partially Received", count: counts.receiving },
    { id: "received", label: "Fully Received", count: counts.received },
    { id: "draft", label: "Drafts", count: counts.draft },
  ];

  const selectPOView = (tab: POTabType) => {
    setStatus("all");
    setSelectedIds(new Set());
    setSearchParams(tab === "all" ? {} : { view: tab });
    setSortKey(null);
    setPage(1);
  };

  const handleClearFilters = () => {
    setSearch("");
    setStartDate("");
    setEndDate("");
    setStatus("all");
    setSortKey(null);
    setPage(1);
  };

  return (
    <div className="w-full space-y-4">
      {/* Top Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Purchase Orders (PO)</h1>
            <AutoCountSyncBadge
              label="AutoCount Procurement Active"
              onRefresh={() => void reload()}
              isRefreshing={isLoading}
            />
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Create supplier orders (PO), download PDF for WhatsApp, receive incoming parts and sync records to AutoCount
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManage ? (
            <button
              type="button"
              disabled={selectedIds.size === 0 || isBatchSyncing}
              onClick={() => void handleBatchQueueSync()}
              className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-xs font-bold shadow-2xs transition-all cursor-pointer ${
                selectedIds.size > 0
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-700/20"
                  : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60"
              }`}
            >
              <Send className="h-4 w-4" />
              <span>{isSyncQueueView ? "Sync to AutoCount" : "Queue Sync"} ({selectedIds.size})</span>
            </button>
          ) : null}
          {canManage ? (
            <button
              type="button"
              onClick={() => void openCreate()}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#1e3a8a] px-4 text-xs font-bold text-white shadow-xs transition-colors hover:bg-blue-800 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              New Supplier Order
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
          Purchase Orders are unavailable: {error}
        </div>
      ) : null}



      {/* Unified Filter & Tabs Card */}
      <div className="relative z-20 rounded-2xl border border-slate-200 bg-white shadow-2xs">
        {/* Top: Status Tabs */}
        <div className="flex items-center gap-6 sm:gap-8 border-b border-slate-100 px-6 pt-3.5 overflow-x-auto no-scrollbar">
          {tabItems.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => selectPOView(tab.id)}
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

        {/* Bottom: Search and Secondary Filter Grid */}
        <div className="grid grid-cols-1 gap-3 px-6 py-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-[1.5fr_1fr_1fr_1.2fr_auto]">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search PO #, supplier, WO #..."
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 shadow-2xs placeholder:text-slate-400"
            />
          </div>

          {/* Start Date */}
          <div>
            <DesktopDatePicker
              value={startDate}
              onChange={(val) => {
                setStartDate(val);
                setPage(1);
              }}
              placeholder="Order date from"
              ariaLabel="Filter from date"
              allowPastDates
              className="h-10 text-xs w-full bg-white rounded-xl border-slate-200"
            />
          </div>

          {/* End Date */}
          <div>
            <DesktopDatePicker
              value={endDate}
              onChange={(val) => {
                setEndDate(val);
                setPage(1);
              }}
              placeholder="Order date to"
              ariaLabel="Filter to date"
              allowPastDates
              className="h-10 text-xs w-full bg-white rounded-xl border-slate-200"
            />
          </div>

          {/* Status Dropdown */}
          <div>
            <AdminSelect
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              placement="bottom"
              className="h-10 w-full text-xs"
              aria-label="Filter PO status"
            >
              <option value="all">All sub-statuses</option>
              <option value="draft">Draft</option>
              <option value="pending_sync">Pending Sync</option>
              <option value="ordered">Ordered</option>
              <option value="partially_received">Partially Received</option>
              <option value="received">Received</option>
              <option value="cancelled">Cancelled</option>
            </AdminSelect>
          </div>

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

      {/* Purchase Orders Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs relative">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50/70">
              <tr className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                <th scope="col" className="w-10 px-4 py-3.5 text-left">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="text-slate-400 hover:text-slate-700 cursor-pointer"
                    title={isAllSyncableSelected ? "Deselect all" : "Select all syncable"}
                  >
                    {isAllSyncableSelected ? (
                      <CheckSquare className="h-4 w-4 text-blue-600" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                </th>
                <SortableHeader columnKey="refNo" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleSort} className="px-4 py-3.5 text-left">
                  PO Ref / No.
                </SortableHeader>
                <SortableHeader columnKey="supplier" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleSort} className="px-4 py-3.5 text-left">
                  Supplier
                </SortableHeader>
                <SortableHeader columnKey="workOrder" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleSort} className="px-4 py-3.5 text-left">
                  Work Order
                </SortableHeader>
                <SortableHeader columnKey="orderDate" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleSort} className="px-4 py-3.5 text-left">
                  Order Date / ETA
                </SortableHeader>
                <SortableHeader columnKey="items" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleSort} className="px-4 py-3.5 text-left">
                  Items
                </SortableHeader>
                <SortableHeader columnKey="total" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleSort} className="px-4 py-3.5 text-right">
                  Total Amount
                </SortableHeader>
                <SortableHeader columnKey="syncStatus" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleSort} className="px-4 py-3.5 text-center">
                  AutoCount Sync
                </SortableHeader>
                <SortableHeader columnKey="status" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleSort} className="px-4 py-3.5 text-center">
                  Order Status
                </SortableHeader>
                <th scope="col" className="px-4 py-3.5 text-right whitespace-nowrap text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="p-12 text-center text-sm text-slate-500">
                    Loading Purchase Orders...
                  </td>
                </tr>
              ) : sortedAndFiltered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-12 text-center">
                    <FileText className="mx-auto mb-3 h-9 w-9 text-slate-300" />
                    <p className="text-sm text-slate-500">No Purchase Orders found in this view.</p>
                  </td>
                </tr>
              ) : (
                paginatedOrders.map((order) => {
                  const isFailed = order.syncStatus === "failed";
                  const isPending = isPendingSyncPO(order);
                  const isSyncable = isPOSyncable(order);
                  const isSelected = selectedIds.has(order.id);
                  const arrivalDiff = daysUntilArrival(order);
                  const isOverdue = !["received", "cancelled", "draft"].includes(order.status) && arrivalDiff < 0;

                  return (
                    <tr
                      key={order.id}
                      onClick={() => {
                        if (order.status === "draft" && canManage) {
                          openDraft(order);
                        } else {
                          setViewOrder(order);
                          setReceiving(null);
                        }
                      }}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-blue-50/70"
                          : isFailed
                          ? "bg-rose-50/30 hover:bg-rose-50/60"
                          : isPending
                          ? "bg-amber-50/20 hover:bg-amber-50/50"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => toggleSelect(order)}
                          className={`cursor-pointer ${isSyncable ? "text-slate-400 hover:text-slate-700" : "text-slate-200 cursor-not-allowed"}`}
                          disabled={!isSyncable}
                        >
                          {isSelected ? (
                            <CheckSquare className="h-4 w-4 text-blue-600" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </button>
                      </td>

                      {/* PO Ref / AutoCount PO */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <p className="text-xs font-bold text-slate-900">{order.autocountPoNo || order.internalRef}</p>
                        {order.autocountPoNo ? <p className="text-[10px] font-mono text-slate-400">{order.internalRef}</p> : null}
                      </td>

                      {/* Supplier */}
                      <td className="px-4 py-3.5">
                        <p className="text-xs font-semibold text-slate-800">{order.supplierName}</p>
                        <p className="text-[11px] text-slate-400">{order.supplierCode || "No code"}</p>
                      </td>

                      {/* Work Order */}
                      <td className="px-4 py-3.5 text-xs font-bold text-blue-700 whitespace-nowrap">
                        {order.workOrderNo || <span className="text-xs font-normal text-slate-400">General Stock</span>}
                      </td>

                      {/* Order Date / ETA */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <p className="text-xs font-medium text-slate-700">{order.orderDate}</p>
                        <p className={`text-[11px] mt-0.5 ${isOverdue ? "font-bold text-rose-600" : "text-slate-500"}`}>
                          ETA: {order.estimatedArrivalDate} ({arrivalLabel(order)})
                        </p>
                      </td>

                      {/* Items */}
                      <td className="px-4 py-3.5 text-xs text-slate-600 font-medium whitespace-nowrap">
                        {order.items.length} line(s)
                      </td>

                      {/* Total Amount */}
                      <td className="px-4 py-3.5 text-right text-xs font-bold text-slate-900 whitespace-nowrap">
                        RM {money(order.total)}
                      </td>

                      {/* AutoCount Sync Status */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        {isFailed ? (
                          <span
                            className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700"
                            title={order.syncError || "Sync failed"}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                            Sync Failed
                          </span>
                        ) : isPending ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                            Pending Sync
                          </span>
                        ) : order.syncStatus === "synced" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Synced
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-500">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                            Not Queued
                          </span>
                        )}
                      </td>

                      {/* Order Status */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        {order.status === "received" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Received
                          </span>
                        ) : order.status === "partially_received" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            Partially Received
                          </span>
                        ) : order.status === "ordered" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                            Ordered
                          </span>
                        ) : order.status === "cancelled" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                            Cancelled
                          </span>
                        ) : order.syncStatus === "failed" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                            On Hold
                          </span>
                        ) : order.status === "draft" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-bold text-slate-600">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                            Draft
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                            Ordered
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {order.status === "draft" && canManage ? (
                            <button
                              type="button"
                              onClick={() => void openDraft(order)}
                              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 cursor-pointer transition-colors"
                              aria-label={`Edit ${order.internalRef}`}
                              title="Edit Draft PO"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              <span>Edit</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => { setViewOrder(order); setReceiving(null); }}
                              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 cursor-pointer transition-colors"
                              aria-label={`View ${order.internalRef}`}
                              title="View Purchase Order"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              <span>View</span>
                            </button>
                          )}
                          {canManage && canReceivePO(order) ? (
                            <button
                              type="button"
                              onClick={() => openReceiving(order)}
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 cursor-pointer transition-colors"
                              aria-label={`Receive ${order.internalRef}`}
                              title="Receive Parts"
                            >
                              <PackageCheck className="h-3.5 w-3.5" />
                              <span>Receive</span>
                            </button>
                          ) : null}
                          {!["draft", "cancelled"].includes(order.status) ? (
                            <button
                              type="button"
                              disabled={exportingPdfId === order.id}
                              onClick={() => void downloadPurchaseOrderPdf(order)}
                              className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 transition-colors cursor-pointer"
                              aria-label={`Download ${order.internalRef} PDF`}
                              title="Download PO PDF for WhatsApp"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                          {!["cancelled"].includes(order.status) ? (
                            <button
                              type="button"
                              onClick={() => setWhatsappModalOrder(order)}
                              className="rounded-lg p-1.5 text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
                              aria-label={`WhatsApp template for ${order.internalRef}`}
                              title="WhatsApp Order Text Template"
                            >
                              <MessageSquare className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                          {canManage && order.syncStatus === "failed" && !["draft", "cancelled"].includes(order.status) ? (
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => void retrySync(order)}
                              className="rounded-lg p-1.5 text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                              aria-label={`Retry sync ${order.internalRef}`}
                              title="Retry AutoCount sync"
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <AdminPagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={sortedAndFiltered.length}
          pageSize={pageSize}
          pageSizeOptions={[10, 25, 50, 100]}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          itemLabel="purchase orders"
        />
      </div>

      <WhatsAppOrderModal
        order={whatsappModalOrder}
        supplier={options.suppliers.find((s) => s.code === whatsappModalOrder?.supplierCode) || null}
        company={documentSettings?.company}
        onClose={() => setWhatsappModalOrder(null)}
      />
    </div>
  );
}
