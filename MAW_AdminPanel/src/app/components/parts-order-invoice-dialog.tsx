import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, FileDown, Loader2, Lock, Plus, Printer, RefreshCw, Send, Trash2, X, XCircle, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import logo from "../../MAW_logo.png";
import { apiRequest, postApi } from "../lib/api";
import { useConfirmationDialog } from "../contexts/confirmation-dialog-context";
import { downloadFinancialDocumentPdf, type FinancialPdfCompany } from "../lib/financial-document-pdf";
import { printDocumentElement } from "../lib/print-document";
import {
  DocumentItemCatalogSelect,
  type DocumentCatalogPart,
} from "./ui/document-item-catalog-select";
import { AdminSelect } from "./ui/admin-select";
import { DesktopDatePicker } from "./ui/desktop-date-picker";

export type PartsOrderItem = {
  name: string;
  quantity: number;
  price: number;
  code?: string;
  taxCode?: string;
  taxRate?: number;
};

export type PartsOrderData = {
  id: string;
  customer: string;
  items: PartsOrderItem[];
  total: number;
  status: "Pending" | "Processing" | "Shipped" | "Delivered" | string;
  orderDate: string;
  deliveryAddress: string;
  autocountDoNo?: string;
  autocountSyncStatus?: string;
  autocountSyncAt?: string | null;
  debtorCode?: string;
};

export interface InvoiceLine {
  id?: number;
  type: "part" | "labour" | "other";
  serviceTypeId?: number | null;
  code: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxCode: string;
  taxRate: number;
}

export interface InvoiceForm {
  docType: "INVOICE" | "DO";
  isBackOrder?: boolean;
  invoiceDate: string;
  dueDate: string;
  creditTermDays: number;
  autocountJobNo: string;
  debtorCode: string;
  vehicleType: string;
  vehicleNo: string;
  discount: number;
  notes: string;
  paymentInstructions: string;
  items: InvoiceLine[];
}

const DEFAULT_INSTRUCTIONS =
  "On payment our official receipt will be forwarded to you by return mail.\nAll cheques to be crossed & made payable to Mewah Autoworks Sdn Bhd.\nPlease add bank commission on all outstation cheques.\nHong Leong Islamic Bank: 37801017381";

function isoDate(offsetDays = 0) {
  const value = new Date();
  value.setDate(value.getDate() + offsetDays);
  return value.toISOString().slice(0, 10);
}

function money(value: number) {
  return Number(value || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function displayDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-GB");
}

function computeDueDate(invoiceDateStr: string, termDays: number): string {
  try {
    const d = new Date(invoiceDateStr);
    if (!isNaN(d.getTime())) {
      d.setDate(d.getDate() + (Number(termDays) || 0));
      return d.toISOString().slice(0, 10);
    }
  } catch {}
  return invoiceDateStr;
}

export function PartsOrderInvoiceDialog({
  order,
  onClose,
  onChanged,
  backLabel = "Back to Orders",
}: {
  order: PartsOrderData;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
  backLabel?: string;
}) {
  const [catalogParts, setCatalogParts] = useState<DocumentCatalogPart[]>([]);
  const [debtors, setDebtors] = useState<{ code: string; name: string; term?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [error, setError] = useState("");
  const [company, setCompany] = useState<FinancialPdfCompany | null>(null);
  const confirmAction = useConfirmationDialog();
  const [activeEditingIndex, setActiveEditingIndex] = useState<number | null>(null);

  const isSynced = Boolean(order.autocountDoNo || order.autocountSyncStatus === "synced");
  const isProcessing = Boolean(order.autocountSyncStatus === "processing");
  const isVoid = Boolean(
    String(order.status).toLowerCase() === "cancelled" ||
    String(order.status).toLowerCase() === "void"
  );
  const editable = !loading && !isSynced && !isVoid && !isProcessing;

  const handleRemoveItem = async (index: number) => {
    const targetItem = form.items[index];
    const itemLabel = targetItem?.description?.trim() || targetItem?.code?.trim() || `Item #${index + 1}`;
    const confirmed = await confirmAction({
      title: "Remove Delivery Order Item?",
      description: `Are you sure you want to remove "${itemLabel}" from this delivery order?`,
      confirmLabel: "Remove Item",
      tone: "danger",
    });
    if (!confirmed) return;

    setForm((current) => ({
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    }));
    setActiveEditingIndex((prev) => (prev === index ? null : prev !== null && prev > index ? prev - 1 : prev));
  };

  const [form, setForm] = useState<InvoiceForm>(() => {
    const invDate = order.orderDate || isoDate();
    const term = 30;
    return {
      docType: "DO",
      isBackOrder: false,
      invoiceDate: invDate,
      dueDate: computeDueDate(invDate, term),
      creditTermDays: term,
      autocountJobNo: order.id,
      debtorCode: order.debtorCode || "",
      vehicleType: "Parts Order",
      vehicleNo: "-",
      discount: 0,
      notes: "",
      paymentInstructions: DEFAULT_INSTRUCTIONS,
      items: (order.items && order.items.length > 0)
        ? order.items.map((i, idx) => ({
            id: idx + 1,
            type: "part",
            serviceTypeId: null,
            code: i.code || "",
            description: i.name,
            quantity: Number(i.quantity) || 1,
            unitPrice: Number(i.price) || 0,
            taxCode: i.taxCode || "",
            taxRate: i.taxRate || 0,
          }))
        : [{ type: "part", serviceTypeId: null, code: "", description: "Spare part item", quantity: 1, unitPrice: 0, taxCode: "", taxRate: 0 }],
    };
  });

  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest<DocumentCatalogPart[]>("admin-parts").catch(() => []),
      apiRequest<{ debtors?: { code: string; name: string; term?: string }[] } | { code: string; name: string; term?: string }[]>("admin-debtors")
        .then((res) => (Array.isArray(res) ? res : res?.debtors || []))
        .catch(() => []),
      apiRequest<{ company: FinancialPdfCompany }>("admin-system-settings").catch(() => null),
    ]).then(([loadedParts, loadedDebtors, loadedSettings]) => {
      if (!active) return;
      setCatalogParts(loadedParts || []);
      setCompany(loadedSettings?.company || null);
      const debtorList = Array.isArray(loadedDebtors) ? loadedDebtors : [];
      setDebtors(debtorList);
      if (!form.debtorCode && debtorList.length > 0) {
        const matched = debtorList.find(
          (d) =>
            d.name.toLowerCase().includes(order.customer.toLowerCase()) ||
            order.customer.toLowerCase().includes(d.name.toLowerCase())
        );
        if (matched) {
          let nextTerm = form.creditTermDays;
          if (matched.term) {
            const m = matched.term.match(/\d+/);
            if (m) nextTerm = Number(m[0]);
          }
          setForm((cur) => ({
            ...cur,
            debtorCode: matched.code,
            creditTermDays: nextTerm,
            dueDate: computeDueDate(cur.invoiceDate, nextTerm),
          }));
        }
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const totals = useMemo(() => {
    const subtotal = form.items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0);
    const afterDiscount = Math.max(0, subtotal - (Number(form.discount) || 0));
    const taxAmount = 0;
    const total = afterDiscount + taxAmount;
    return { subtotal, discount: Number(form.discount) || 0, taxAmount, total };
  }, [form.items, form.discount]);

  const updateItem = (index: number, patch: Partial<InvoiceLine>) => {
    setForm((current) => {
      const nextItems = current.items.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        return { ...item, ...patch };
      });
      return { ...current, items: nextItems };
    });
  };

  const handleSave = async (isIssue = true) => {
    if (loading || saving || !editable) return;
    setSaving(true);
    setError("");
    try {
      if (isIssue) {
        await postApi("admin-update-order-status", {
          id: order.id,
          orderId: order.id,
          status: "processing",
        });
        toast.success(`Parts Order ${order.id} issued & queued for AutoCount DO sync!`);
      } else {
        toast.success(`Parts Order invoice draft saved.`);
      }
      await onChanged();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save invoice.");
      toast.error(caught instanceof Error ? caught.message : "Unable to save invoice.");
    } finally {
      setSaving(false);
    }
  };

  const downloadPdf = () => {
    setExportingPdf(true);
    try {
      const reference = order.autocountDoNo || order.id;
      const fileName = downloadFinancialDocumentPdf({
        documentType: "DELIVERY ORDER",
        reference,
        internalReference: order.id,
        company,
        customer: {
          name: order.customer,
          code: form.debtorCode,
          address: order.deliveryAddress,
        },
        details: [
          { label: "Date", value: displayDate(form.invoiceDate) },
          { label: "Due Date", value: "" },
          { label: "Term", value: "" },
          { label: "Order No", value: order.id },
          { label: "Delivery", value: order.deliveryAddress || "Pickup / as arranged" },
        ],
        items: form.items.map((item) => ({
          code: item.code,
          description: item.description,
          quantity: Number(item.quantity),
          uom: "UNIT",
          unitPrice: Number(item.unitPrice),
          taxCode: item.taxCode,
          taxRate: Number(item.taxRate || 0),
          amount: Number(item.quantity) * Number(item.unitPrice),
        })),
        subtotal: totals.subtotal,
        discount: totals.discount,
        taxAmount: totals.taxAmount,
        total: totals.total,
        notes: form.notes,
        paymentInstructions: "",
        showDeliverySignatures: true,
      });
      toast.success(`${fileName} downloaded.`);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Unable to generate document PDF.");
    } finally {
      setExportingPdf(false);
    }
  };

  const handlePrint = async () => {
    try {
      await printDocumentElement("invoice-document", `Delivery Order ${order.id}`);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Unable to open document print preview.");
    }
  };

  return (
    <div className="invoice-print-shell w-full">
      <style>{`@media print { @page { size: A4 portrait; margin: 10mm; } html, body, #root { display:block!important; height:auto!important; overflow:visible!important; background:#fff!important; } body * { visibility:hidden!important; } .invoice-print-shell, .invoice-frame, .invoice-layout, .invoice-stage, #invoice-document, #invoice-document * { visibility:visible!important; } .invoice-print-shell { display:block!important; position:static!important; inset:auto!important; margin:0!important; padding:0!important; background:#fff!important; } .invoice-frame, .invoice-layout, .invoice-stage { display:block!important; position:static!important; width:auto!important; max-width:none!important; height:auto!important; max-height:none!important; overflow:visible!important; background:#fff!important; box-shadow:none!important; } .no-print { display:none!important; } #invoice-document { width:100%!important; min-height:0!important; max-width:none!important; margin:0!important; padding:0!important; box-shadow:none!important; } #invoice-document thead { display:table-header-group; } #invoice-document tr { break-inside:avoid-page; } }`}</style>
      <div className="invoice-frame flex w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm lg:h-[calc(100vh-7rem)] lg:min-h-[640px]">
          <header className="no-print shrink-0 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-7 sm:py-5">
            <div className="flex flex-wrap items-center gap-3.5">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" />
                {backLabel}
              </button>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1e3a8a] ring-1 ring-blue-100">
                <ReceiptText className="h-5 w-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-extrabold text-slate-900">
                    Delivery Order · {order.id}
                  </h2>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase text-slate-800">
                    {order.status}
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
                    order.autocountSyncStatus === "synced"
                      ? "bg-emerald-100 text-emerald-800"
                      : order.autocountSyncStatus === "processing"
                      ? "bg-blue-100 text-blue-800 animate-pulse ring-1 ring-blue-300"
                      : order.autocountSyncStatus === "failed"
                      ? "bg-rose-100 text-rose-700"
                      : "bg-amber-100 text-amber-800"
                  }`}>
                    AutoCount: {order.autocountSyncStatus === "synced" ? "synced" : order.autocountSyncStatus === "processing" ? "processing" : order.autocountSyncStatus === "failed" ? "failed" : "queued"}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  Create the invoice in MAW, then queue and sync to AutoCount ERP billing.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {loading ? (
                <div className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-xs font-semibold text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  <span>Loading document...</span>
                </div>
              ) : (
                <>
                  {editable ? (
                    <>
                      <button type="button" disabled={saving} onClick={() => void handleSave(false)} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-50 cursor-pointer"><FileDown className="h-4 w-4" />Save Draft</button>
                      <button type="button" disabled={saving} onClick={() => void handleSave(true)} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#1e3a8a] px-4 text-xs font-bold text-white shadow-xs hover:bg-blue-800 disabled:opacity-50 cursor-pointer"><Send className="h-4 w-4" />Issue DO & Queue</button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    disabled={exportingPdf}
                    onClick={downloadPdf}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1e3a8a] px-4 text-xs font-bold text-white shadow-sm hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
                    aria-label="Download delivery order PDF"
                  >
                    <FileDown className="h-4 w-4" />
                    {exportingPdf ? "Generating PDF..." : "Download DO PDF"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handlePrint()}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 cursor-pointer"
                    aria-label="Print delivery order"
                  >
                    <Printer className="h-4 w-4" />
                    Print DO
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </header>

          <div className="invoice-layout grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[470px_minmax(0,1fr)]">
            {/* Left Sidebar Form with exact 1:1 card layout */}
            <aside className="no-print maw-editor-scroll h-full overflow-y-auto border-r border-slate-200 bg-slate-100/80 p-4 sm:p-5">
              {error ? <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div> : null}
              {isProcessing ? (
                <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 shadow-2xs">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600 shrink-0" />
                  <span><strong>AutoCount Sync in Progress:</strong> This delivery order is currently being synced to AutoCount ERP. Editing is disabled to prevent conflicts.</span>
                </div>
              ) : null}
              {isSynced ? (
                <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 shadow-2xs">
                  <Lock className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span><strong>AutoCount Synced:</strong> This delivery order has been posted to AutoCount ERP ({order.autocountDoNo || order.id}) and is permanently locked.</span>
                </div>
              ) : null}
              {isVoid ? (
                <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 shadow-2xs">
                  <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
                  <span><strong>Order Cancelled:</strong> This delivery order is cancelled and is archived in read-only mode.</span>
                </div>
              ) : null}
              <div className="space-y-4">
                {/* Back Order Switch Card */}
                <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-800">Back Order</span>
                      {form.isBackOrder ? (
                        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700">
                          Bypass Stock
                        </span>
                      ) : null}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {form.isBackOrder
                        ? "Enabled: Issue without deducting VIP physical inventory."
                        : "Disabled: Standard stock verification applies."}
                    </p>
                  </div>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      disabled={!editable}
                      checked={Boolean(form.isBackOrder)}
                      onChange={(e) => setForm((cur) => ({ ...cur, isBackOrder: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600 disabled:opacity-50"></div>
                  </label>
                </div>

                {/* Document Details Card */}
                <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs space-y-3">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Document Details
                  </div>

                  {/* Document date */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Document Date</label>
                    <DesktopDatePicker
                      disabled={!editable}
                      value={form.invoiceDate}
                      onChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          invoiceDate: value,
                          dueDate: computeDueDate(value, current.creditTermDays),
                        }))
                      }
                      ariaLabel="Choose document date"
                      allowPastDates
                      className="h-8.5 text-xs bg-slate-50/70 hover:bg-white"
                    />
                  </div>

                  {/* AutoCount Job No. & Debtor Code */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Job No.</label>
                      <input
                        disabled={!editable}
                        value={form.autocountJobNo}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, autocountJobNo: event.target.value.toUpperCase() }))
                        }
                        className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1.5 text-xs uppercase font-medium focus:bg-white focus:border-blue-500 focus:outline-none disabled:opacity-60"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-slate-600">Debtor Code</label>
                        {form.debtorCode ? (
                          <span className="text-[10px] font-bold text-emerald-600">✓ Auto-linked</span>
                        ) : (
                          <span className="text-[10px] text-amber-600">Auto-linking...</span>
                        )}
                      </div>
                      <AdminSelect
                        disabled={!editable}
                        value={form.debtorCode}
                        onChange={(event) => {
                          const val = event.target.value;
                          const matched = debtors.find((d) => d.code === val);
                          const finalCode = matched ? matched.code : val;
                          let nextTerm = form.creditTermDays;
                          if (matched?.term) {
                            const m = matched.term.match(/\d+/);
                            if (m) nextTerm = Number(m[0]);
                          }
                          setForm((current) => ({
                            ...current,
                            debtorCode: finalCode,
                            creditTermDays: nextTerm,
                            dueDate: computeDueDate(current.invoiceDate, nextTerm),
                          }));
                        }}
                        className="h-9 w-full text-xs font-mono uppercase"
                        placeholder="Select AutoCount debtor account..."
                      >
                        <option value="">-- Select Debtor Account --</option>
                        {debtors.map((d) => (
                          <option key={d.code} value={d.code}>
                            {d.code} — {d.name} {d.term ? `(${d.term})` : ""}
                          </option>
                        ))}
                        {form.debtorCode && !debtors.some((d) => d.code === form.debtorCode) ? (
                          <option value={form.debtorCode}>{form.debtorCode}</option>
                        ) : null}
                      </AdminSelect>
                    </div>
                  </div>

                  {/* Vehicle Details */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Vehicle Type</label>
                      <input
                        value={form.vehicleType}
                        onChange={(event) => setForm((current) => ({ ...current, vehicleType: event.target.value }))}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1.5 text-xs focus:bg-white focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Vehicle No.</label>
                      <input
                        value={form.vehicleNo}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, vehicleNo: event.target.value.toUpperCase() }))
                        }
                        className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1.5 text-xs uppercase font-semibold focus:bg-white focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Discount */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Discount (RM)</label>
                    <input
                      type="number"
                      min="0"
                      value={form.discount}
                      onChange={(event) => setForm((current) => ({ ...current, discount: Number(event.target.value) }))}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1.5 text-xs focus:bg-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Items Section */}
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
                    <div>
                      <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-600">
                        Delivery Order items
                      </h3>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {form.items.length} line item{form.items.length === 1 ? "" : "s"} · Select a catalogue part or enter a custom item.
                      </p>
                    </div>
                    {editable ? (
                      <button
                        type="button"
                        onClick={() => {
                          const nextIndex = form.items.length;
                          setForm((current) => ({
                            ...current,
                            items: [
                              ...current.items,
                              { type: "part", code: "", description: "", quantity: 1, unitPrice: 0, taxCode: "", taxRate: 0 },
                            ],
                          }));
                          setActiveEditingIndex(nextIndex);
                          setTimeout(() => {
                            const itemEl = document.getElementById(`parts-order-item-${nextIndex}`);
                            if (itemEl) {
                              itemEl.scrollIntoView({ behavior: "smooth", block: "center" });
                              const focusTarget = itemEl.querySelector<HTMLElement>('button[role="combobox"], input');
                              focusTarget?.focus();
                            }
                          }, 60);
                        }}
                        className="inline-flex h-9 items-center rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-100 cursor-pointer"
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        Add item
                      </button>
                    ) : null}
                  </div>
                  <div className="space-y-3 bg-slate-50/60 p-3">
                    {form.items.map((item, index) => {
                      const isEditing = activeEditingIndex === index;
                      return (
                        <div
                          id={`parts-order-item-${index}`}
                          key={item.id || `new-${index}`}
                          tabIndex={-1}
                          onFocus={() => setActiveEditingIndex(index)}
                          onClick={() => setActiveEditingIndex(index)}
                          className={`overflow-hidden rounded-xl border bg-white transition-all duration-200 outline-none ${
                            isEditing
                              ? "border-blue-500 shadow-md ring-2 ring-blue-500/20 -translate-y-1 z-10"
                              : item.id
                              ? "border-slate-200 shadow-xs hover:border-slate-300 focus-within:border-blue-500 focus-within:shadow-md focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:-translate-y-1"
                              : "border-blue-300 ring-1 ring-blue-100 shadow-xs hover:border-blue-400 focus-within:border-blue-500 focus-within:shadow-md focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:-translate-y-1"
                          }`}
                        >
                        <div className={`flex items-center justify-between border-b px-3.5 py-2 ${item.id ? "border-slate-100 bg-white" : "border-blue-100 bg-blue-50/80"}`}>
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-900 text-[10px] font-extrabold text-white">
                              {index + 1}
                            </span>
                            <span className="min-w-0 truncate text-xs font-bold text-slate-800">{item.description || "Untitled item"}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide ${item.id ? "bg-slate-100 text-slate-500" : "bg-blue-100 text-blue-700"}`}>
                              {item.id ? "Order item" : "New item"}
                            </span>
                          </div>
                          {editable && form.items.length > 1 ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleRemoveItem(index);
                              }}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-rose-500 transition-colors hover:bg-rose-50 hover:text-rose-700 cursor-pointer"
                              aria-label={`Remove item ${index + 1}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          ) : null}
                        </div>
                        <div className="grid grid-cols-1 gap-3 p-3.5 md:grid-cols-12">
                          <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500 md:col-span-2">
                            Type
                            <AdminSelect
                              disabled={!editable}
                              value={item.type}
                              onChange={(event) => {
                                const newType = event.target.value as InvoiceLine["type"];
                                const isLabour = newType === "labour";
                                updateItem(index, {
                                  type: newType,
                                  serviceTypeId: null,
                                  code: "",
                                  description: "",
                                  quantity: 1,
                                  unitPrice: 0,
                                  taxCode: isLabour ? "SV-8" : "",
                                  taxRate: isLabour ? 8 : 0,
                                });
                              }}
                              className="mt-1 h-10 w-full text-xs"
                            >
                              <option value="part">Part (0%)</option>
                              <option value="labour">Service / Labour (8%)</option>
                              <option value="other">Other (0%)</option>
                            </AdminSelect>
                          </label>
                          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 md:col-span-6">
                            Catalogue item
                            <div className="mt-1">
                              <DocumentItemCatalogSelect
                                disabled={!editable}
                                compact
                                itemType={item.type}
                                serviceTypeId={item.serviceTypeId}
                                code={item.code}
                                description={item.description}
                                parts={catalogParts}
                                services={[]}
                                onSelect={(selection) =>
                                  updateItem(index, {
                                    serviceTypeId: selection.serviceTypeId,
                                    code: selection.code,
                                    description: selection.description,
                                    quantity: 1,
                                    unitPrice: selection.unitPrice,
                                    taxCode: selection.taxCode,
                                    taxRate: selection.taxCode === "SV-8" ? 8 : 0,
                                  })
                                }
                              />
                            </div>
                          </div>
                          <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500 md:col-span-4">
                            Item code
                            <input
                              disabled={!editable}
                              value={item.code}
                              onChange={(event) => updateItem(index, { code: event.target.value })}
                              placeholder="Item code"
                              className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 disabled:opacity-60"
                            />
                          </label>
                          <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500 md:col-span-6">
                            Description
                            <input
                              disabled={!editable}
                              value={item.description}
                              onChange={(event) => updateItem(index, { description: event.target.value })}
                              placeholder="Item description"
                              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs disabled:opacity-60"
                            />
                          </label>
                          <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500 md:col-span-1">
                            Qty
                            <input
                              disabled={!editable}
                              type="number"
                              min="1"
                              step="1"
                              value={item.quantity}
                              onChange={(event) =>
                                updateItem(index, { quantity: Math.max(1, Number(event.target.value)) })
                              }
                              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold disabled:opacity-60"
                            />
                          </label>
                          <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500 md:col-span-2">
                            Unit price
                            <input
                              disabled={!editable}
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.unitPrice}
                              onChange={(event) =>
                                updateItem(index, { unitPrice: Number(event.target.value) })
                              }
                              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs disabled:opacity-60"
                            />
                          </label>
                          <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500 md:col-span-1">
                            Tax (%)
                            <input
                              disabled={!editable}
                              type="number"
                              min="0"
                              max="100"
                              step="any"
                              value={item.taxRate ?? 0}
                              onChange={(event) => {
                                const rate = event.target.value === "" ? 0 : Number(event.target.value);
                                updateItem(index, {
                                  taxRate: rate,
                                  taxCode: rate === 8 ? "SV-8" : rate > 0 ? (item.taxCode || `TAX-${rate}`) : "",
                                });
                              }}
                              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs disabled:opacity-60"
                            />
                          </label>
                          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 md:col-span-2">
                            Amount
                            <div className="mt-1 flex h-10 items-center justify-end rounded-lg bg-slate-100 px-3 text-xs font-extrabold text-slate-800">
                              {money(item.quantity * item.unitPrice)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </div>

                {/* Delivery Notes */}
                <label className="block text-xs font-bold text-slate-700">
                  Delivery notes
                  <textarea
                    disabled={!editable}
                    rows={3}
                    value={form.notes}
                    onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                    className="mt-1 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs disabled:opacity-60"
                  />
                </label>
              </div>
            </aside>

            {/* Right Side Live Real-time A4 Document Preview */}
            {/* Right Side Live Real-time A4 Document Preview */}
            <main className="invoice-stage maw-editor-scroll h-full overflow-auto bg-slate-200/80 p-6 sm:p-8 flex justify-center items-start">
              <article
                id="invoice-document"
                style={{ width: "210mm", minHeight: "297mm" }}
                className="a4-sheet mx-auto shrink-0 bg-white p-10 text-[11px] text-slate-900 shadow-2xl rounded-xs border border-slate-200/80 flex flex-col justify-between"
              >
                <div>
                  {/* Header with Logo */}
                  <header className="grid grid-cols-[250px_minmax(0,1fr)] items-center border-b-2 border-slate-800 pb-4">
                    <div className="flex h-28 w-60 items-center justify-center overflow-hidden">
                      <img src={logo} alt="Mewah AutoWorks" className="h-28 w-60 scale-[1.55] object-contain" />
                    </div>
                    <div className="text-center leading-tight">
                      <h1 className="text-xl font-black">MEWAH AUTOWORKS SDN BHD</h1>
                      <p>(YOUR-REGISTRATION-NO)</p>
                      <p>()</p>
                      <p>Configure your workshop address</p>
                      <p>Tel: +60 00-000 0000 · contact@example.com</p>
                    </div>
                  </header>

                  {/* Customer Box & Document Info */}
                  <div className="mt-5 grid grid-cols-2 gap-6">
                    <section className="min-h-40 border border-slate-700 p-3">
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">
                        {form.debtorCode || "DEBTOR CODE"}
                      </p>
                      <p className="font-black text-sm">{order.customer || "Cash Customer"}</p>
                      <p className="whitespace-pre-wrap text-slate-600 leading-relaxed text-[11px]">
                        {order.deliveryAddress || "Self-Pickup / Walk-in Customer"}
                      </p>
                    </section>
                    <section>
                      <h2 className="mb-2 text-center text-2xl font-black tracking-wide">
                        DELIVERY ORDER
                      </h2>
                      <dl className="grid grid-cols-[100px_10px_1fr] gap-y-1">
                        <dt className="font-bold">DO No.</dt>
                        <dd>:</dd>
                        <dd className="font-mono font-bold">{order.autocountDoNo || "Generated when saved"}</dd>
                        
                        <dt className="font-bold">Date</dt>
                        <dd>:</dd>
                        <dd>{displayDate(form.invoiceDate)}</dd>
                        
                        <dt className="font-bold">Job No.</dt>
                        <dd>:</dd>
                        <dd className="font-mono">{form.autocountJobNo}</dd>
                        
                        <dt className="font-bold">Vehicle Type</dt>
                        <dd>:</dd>
                        <dd>{form.vehicleType}</dd>
                        
                        <dt className="font-bold">Vehicle No.</dt>
                        <dd>:</dd>
                        <dd>{form.vehicleNo}</dd>
                      </dl>
                    </section>
                  </div>

                  {/* Items Table */}
                  <table className="mt-5 w-full border-collapse">
                    <thead>
                      <tr className="border-y-2 border-slate-800">
                        <th className="w-10 py-2 text-left">Item</th>
                        <th className="py-2 text-left">Code / Description</th>
                        <th className="w-16 text-right">Qty</th>
                        <th className="w-24 text-right">Unit Price<br />RM</th>
                        <th className="w-24 text-right">Amount<br />RM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.items.map((item, index) => (
                        <tr key={item.id || index} className="align-top border-b border-slate-100">
                          <td className="py-2.5 text-slate-400 font-bold">{index + 1}.</td>
                          <td className="py-2.5">
                            <p className="font-bold text-slate-950">
                              {item.code ? `${item.code} · ` : ""}
                              {item.description || "Part description"}
                            </p>
                            <p className="text-[8px] uppercase text-slate-500">{item.type} · @0%</p>
                          </td>
                          <td className="py-2.5 text-right font-medium">{Number(item.quantity).toFixed(2)}</td>
                          <td className="py-2.5 text-right font-medium">{money(item.unitPrice)}</td>
                          <td className="py-2.5 text-right font-bold text-slate-950">
                            {money(item.quantity * item.unitPrice)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Financial Totals & Signatures */}
                <div className="mt-8 pt-4">
                  <div className="grid grid-cols-[1fr_290px] gap-4 border-t border-slate-800 pt-2">
                    <div>
                      {form.notes ? (
                        <>
                          <p className="font-black text-slate-900">Note:</p>
                          <p className="whitespace-pre-wrap text-slate-600">{form.notes}</p>
                        </>
                      ) : null}
                      {totals.taxAmount > 0 ? (
                        <table className="mt-4 text-[9px]">
                          <thead>
                            <tr>
                              <th className="pr-5 text-left">Tax Code</th>
                              <th className="pr-5 text-right">Taxable</th>
                              <th className="text-right">Tax</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td className="pr-5">ZR (0.00%)</td>
                              <td className="pr-5 text-right">{money(totals.subtotal)}</td>
                              <td className="text-right">0.00</td>
                            </tr>
                          </tbody>
                        </table>
                      ) : null}
                    </div>

                    <dl className="grid grid-cols-[1fr_90px] gap-y-1 text-right text-[11px]">
                      <dt className="font-bold">Sub Total</dt>
                      <dd>{money(totals.subtotal)}</dd>
                      <dt>Discount</dt>
                      <dd>{money(totals.discount)}</dd>
                      <dt>Service Tax</dt>
                      <dd>0.00</dd>
                      <dt className="border-t border-slate-800 pt-2 text-sm font-black">Total (RM)</dt>
                      <dd className="border-t border-slate-800 pt-2 text-sm font-black">{money(totals.total)}</dd>
                    </dl>
                  </div>

                  <p className="mt-8 text-center text-xs font-bold text-slate-500">
                    This is a computer generated delivery order, please acknowledge receipt of parts &amp; goods.
                  </p>

                  {/* Signatures for DO */}
                  <div className="mt-12 grid grid-cols-2 gap-12 pt-8 text-center text-xs">
                    <div className="border-t border-slate-800 pt-2">
                      <p className="font-bold text-slate-900">Issued By / Workshop Rep</p>
                    </div>
                    <div className="border-t border-slate-800 pt-2">
                      <p className="font-bold text-slate-900">Received &amp; Accepted By / Customer</p>
                    </div>
                  </div>
                </div>
              </article>
            </main>
          </div>
        </div>
      </div>
  );
}
