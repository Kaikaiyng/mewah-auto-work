import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, ExternalLink, FileDown, Loader2, Lock, Plus, Printer, ReceiptText, RefreshCw, Save, Send, Trash2, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import logo from "../../MAW_logo.png";
import { useConfirmationDialog } from "../contexts/confirmation-dialog-context";
import { apiRequest, postApi } from "../lib/api";
import { downloadFinancialDocumentPdf } from "../lib/financial-document-pdf";
import { printDocumentElement } from "../lib/print-document";
import {
  DocumentItemCatalogSelect,
  type DocumentCatalogPart,
} from "./ui/document-item-catalog-select";
import { AdminSelect } from "./ui/admin-select";
import { TaxRateInput } from "./ui/tax-rate-input";
import { DesktopDatePicker } from "./ui/desktop-date-picker";
import { getMasterTaxCodes } from "./master-data";

export type InvoiceLine = {
  id?: number;
  type: "part" | "labour" | "other";
  serviceTypeId?: number | null;
  code: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxCode?: string;
  taxRate?: number;
  taxAmount?: number;
  amount?: number;
};

export type InvoiceWorkOrder = {
  id: number;
  workOrderNo: string;
  isBackOrder?: boolean;
  canonicalStatus: string;
  companyId?: number;
  companyName: string;
  contactName?: string;
  customerPhone?: string;
  vehicleId?: number;
  vehicleNo: string;
  brand: string;
  model: string;
  equipmentType: string;
  serviceType: string;
  serviceCentre: string;
  debtorCode?: string;
  autocountJobNo?: string;
  creditTermDays?: number;
  quotationNo?: string | null;
  quotationTotal?: number | null;
};

export type WorkOrderInvoice = {
  id: number;
  workOrderId: number;
  docType?: "INVOICE" | "DO";
  quotationId?: number | null;
  invoiceNo: string;
  status: "draft" | "pending_sync" | "issued" | "partially_paid" | "paid" | "overdue" | "void";
  storedStatus: "draft" | "pending_sync" | "issued" | "partially_paid" | "paid" | "void";
  isBackOrder?: boolean;
  internalRef: string;
  autocountInvoiceNo: string;
  autocountDoNo?: string;
  autocountJobNo: string;
  debtorCode: string;
  vehicleType: string;
  vehicleNo: string;
  creditTermDays: number;
  currency: string;
  syncStatus: "not_queued" | "queued" | "processing" | "synced" | "failed";
  syncError: string;
  mewahtransSyncStatus?: "not_queued" | "pending" | "processing" | "synced" | "failed";
  mewahtransRefNo?: string;
  mewahtransSyncedAt?: string | null;
  mewahtransError?: string;
  eInvoiceStatus: string;
  eInvoiceUuid: string;
  invoiceDate: string;
  dueDate?: string | null;
  subtotal: number;
  discount: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  paidAmount: number;
  balance: number;
  paymentMethod: string;
  notes: string;
  paymentInstructions: string;
  createdAt: string;
  updatedAt: string;
  issuedAt?: string | null;
  paidAt?: string | null;
  voidedAt?: string | null;
  items: InvoiceLine[];
};

type ServiceType = { id: number; name: string; description: string; basePrice: number; enabled: boolean; sortOrder: number };
type Settings = {
  company: { legalName: string; registrationNo: string; groupName: string; address: string; phone: string; email: string; operatingHours: string };
  pricing: { taxRate: number };
  serviceTypes: ServiceType[];
};
type QuotationSource = { id: number; quotationNo?: string | null; status: string; discount: number; taxRate: number; notes?: string; items: InvoiceLine[] } | null;
type InvoiceBundle = { invoice: WorkOrderInvoice | null; workOrder: InvoiceWorkOrder; quotation: QuotationSource; settings: Settings };
type InvoiceForm = { docType: "INVOICE" | "DO"; isBackOrder?: boolean; invoiceDate: string; dueDate: string; creditTermDays: number; autocountJobNo: string; debtorCode: string; vehicleType: string; vehicleNo: string; discount: number; notes: string; paymentInstructions: string; items: InvoiceLine[] };

const DEFAULT_INSTRUCTIONS = "On payment our official receipt will be forwarded to you by return mail.\nAll cheques to be crossed & made payable to Mewah Autoworks Sdn Bhd.\nPlease add bank commission on all outstation cheques.\nHong Leong Islamic Bank: 37801017381";

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

function statusClass(status: string) {
  if (status === "paid") return "bg-emerald-100 text-emerald-700";
  if (status === "overdue" || status === "void") return "bg-rose-100 text-rose-700";
  if (status === "partially_paid" || status === "pending_sync") return "bg-amber-100 text-amber-700";
  if (status === "issued") return "bg-blue-100 text-blue-700";
  return "bg-slate-100 text-slate-700";
}

function catalogueTaxRate(taxCode: string, fallback: number) {
  const match = taxCode.match(/(\d+(?:\.\d+)?)/);
  if (!match) return fallback;
  const rate = Number(match[1]);
  return Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : fallback;
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

function blankForm(workOrder: InvoiceWorkOrder): InvoiceForm {
  const invDate = isoDate();
  const term = workOrder.creditTermDays || 30;
  return {
    docType: "INVOICE",
    isBackOrder: Boolean(workOrder.isBackOrder),
    invoiceDate: invDate,
    dueDate: computeDueDate(invDate, term),
    creditTermDays: term,
    autocountJobNo: workOrder.autocountJobNo || workOrder.workOrderNo,
    debtorCode: workOrder.debtorCode || "",
    vehicleType: workOrder.equipmentType || `${workOrder.brand} ${workOrder.model}`.trim(),
    vehicleNo: workOrder.vehicleNo,
    discount: 0,
    notes: "",
    paymentInstructions: DEFAULT_INSTRUCTIONS,
    items: [{ type: "labour", serviceTypeId: null, code: "", description: workOrder.serviceType || "Workshop service", quantity: 1, unitPrice: 0, taxCode: "SV-8", taxRate: 8 }],
  };
}

export function WorkOrderInvoiceDialog({
  workOrder,
  onClose,
  onChanged,
  backLabel = "Back to Invoices",
}: {
  workOrder: InvoiceWorkOrder;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
  backLabel?: string;
}) {
  const confirmAction = useConfirmationDialog();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<WorkOrderInvoice | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [catalogParts, setCatalogParts] = useState<DocumentCatalogPart[]>([]);
  const [debtors, setDebtors] = useState<{ code: string; name: string; term?: string }[]>([]);
  const [form, setForm] = useState<InvoiceForm>(() => blankForm(workOrder));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [error, setError] = useState("");
  const [activeEditingIndex, setActiveEditingIndex] = useState<number | null>(null);

  const masterTaxCodes = useMemo(() => getMasterTaxCodes().filter((t) => t.enabled), []);

  const taxRateOptions = useMemo(() => {
    const list: { key: string; rate: number; label: string }[] = [];
    const seenRates = new Set<number>();

    masterTaxCodes.forEach((tax) => {
      if (!seenRates.has(tax.rate)) {
        seenRates.add(tax.rate);
        list.push({
          key: tax.id,
          rate: tax.rate,
          label: `${tax.rate}% — ${tax.code} (${tax.name})`,
        });
      }
    });

    if (!seenRates.has(0)) {
      seenRates.add(0);
      list.unshift({
        key: "tax-zero",
        rate: 0,
        label: "0% — EXEMPT / ZRL (Zero Rated 0%)",
      });
    }

    list.sort((a, b) => a.rate - b.rate);
    return list;
  }, [masterTaxCodes]);

  const handleRemoveItem = async (index: number) => {
    const targetItem = form.items[index];
    const itemLabel = targetItem?.description?.trim() || targetItem?.code?.trim() || `Item #${index + 1}`;
    const confirmed = await confirmAction({
      title: "Remove Document Item?",
      description: `Are you sure you want to remove "${itemLabel}" from this ${form.docType === "DO" ? "delivery order" : "invoice"}?`,
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

  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest<InvoiceBundle>(`admin-get-work-order-invoice&id=${workOrder.id}`),
      apiRequest<DocumentCatalogPart[]>("admin-parts").catch(() => []),
      apiRequest<{ debtors?: { code: string; name: string; term?: string }[] } | { code: string; name: string; term?: string }[]>("admin-debtors")
        .then((res) => (Array.isArray(res) ? res : res?.debtors || []))
        .catch(() => []),
    ])
      .then(([bundle, loadedParts, loadedDebtors]) => {
        if (!active) return;
        setInvoice(bundle.invoice);
        setSettings(bundle.settings);
        setCatalogParts(loadedParts);
        setDebtors(Array.isArray(loadedDebtors) ? loadedDebtors : []);
        const resolvedDebtor = bundle.invoice?.debtorCode || bundle.workOrder.debtorCode || workOrder.debtorCode || "";
        if (bundle.invoice) {
          setForm({
            docType: "INVOICE",
            isBackOrder: Boolean(bundle.invoice.isBackOrder),
            invoiceDate: bundle.invoice.invoiceDate,
            dueDate: bundle.invoice.dueDate || "",
            creditTermDays: bundle.invoice.creditTermDays,
            autocountJobNo: bundle.invoice.autocountJobNo,
            debtorCode: resolvedDebtor,
            vehicleType: bundle.invoice.vehicleType || bundle.workOrder.equipmentType || workOrder.equipmentType || "",
            vehicleNo: (bundle.invoice.vehicleNo && bundle.invoice.vehicleNo !== "-") ? bundle.invoice.vehicleNo : (bundle.workOrder.vehicleNo && bundle.workOrder.vehicleNo !== "-" ? bundle.workOrder.vehicleNo : (workOrder.vehicleNo || "-")),
            discount: bundle.invoice.discount,
            notes: bundle.invoice.notes,
            paymentInstructions: bundle.invoice.paymentInstructions,
            items: (bundle.invoice.items && bundle.invoice.items.length > 0)
              ? bundle.invoice.items.map((item) => ({ ...item }))
              : [{
                  type: "labour" as const,
                  serviceTypeId: null,
                  code: "SERVICE",
                  description: bundle.workOrder.serviceType || workOrder.serviceType || "Workshop Service & Maintenance",
                  quantity: 1,
                  unitPrice: Number(bundle.invoice.subtotal || bundle.invoice.total || 0),
                  taxCode: "SV-8",
                  taxRate: 0,
                  taxAmount: 0,
                  amount: Number(bundle.invoice.subtotal || bundle.invoice.total || 0)
                }],
          });
        } else if (bundle.quotation && bundle.quotation.items.length > 0) {
          setForm({
            ...blankForm(bundle.workOrder),
            docType: "INVOICE",
            debtorCode: resolvedDebtor,
            vehicleNo: (bundle.workOrder.vehicleNo && bundle.workOrder.vehicleNo !== "-") ? bundle.workOrder.vehicleNo : (workOrder.vehicleNo || "-"),
            discount: bundle.quotation.discount,
            notes: bundle.quotation.notes || (bundle.quotation.quotationNo ? `Based on work order quotation (${bundle.quotation.quotationNo}).` : ""),
            items: bundle.quotation.items.map((item) => {
              const isLabour = item.type === "labour";
              return {
                ...item,
                id: undefined,
                taxCode: item.taxCode || (isLabour ? "SV-8" : ""),
                taxRate: item.taxRate !== undefined && item.taxRate !== null ? Number(item.taxRate) : (isLabour ? 8 : 0),
              };
            }),
          });
        } else {
          const matchedService = bundle.settings.serviceTypes.find(
            (service) =>
              service.enabled &&
              service.name.toLowerCase() === bundle.workOrder.serviceType.toLowerCase()
          );
          setForm({
            ...blankForm(bundle.workOrder),
            docType: "INVOICE",
            debtorCode: resolvedDebtor,
            items: [
              {
                type: "labour",
                serviceTypeId: matchedService?.id || null,
                code: "",
                description:
                  matchedService?.name ||
                  bundle.workOrder.serviceType ||
                  "Workshop service",
                quantity: 1,
                unitPrice: matchedService?.basePrice || 0,
                taxCode: bundle.settings.pricing.taxRate > 0 ? "SV-8" : "",
                taxRate: bundle.settings.pricing.taxRate,
              },
            ],
          });
        }
      })
      .catch((caught) => active && setError(caught instanceof Error ? caught.message : "Unable to load invoice."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [workOrder.id]);

  const totals = useMemo(() => {
    const subtotal = form.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);
    const discount = Math.min(Math.max(Number(form.discount || 0), 0), subtotal);
    const taxAmount = form.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0) * Number(item.taxRate || 0) / 100, 0);
    return { subtotal, discount, taxAmount, total: subtotal - discount + taxAmount };
  }, [form.items, form.discount]);
  const taxSummary = useMemo(() => {
    const grouped = new Map<string, { code: string; rate: number; taxable: number; tax: number }>();
    form.items.forEach((item) => {
      const rate = Number(item.taxRate || 0);
      const code = item.taxCode || (rate > 0 ? `TAX-${rate}` : "@0%");
      const current = grouped.get(`${code}-${rate}`) || { code, rate, taxable: 0, tax: 0 };
      const taxable = Number(item.quantity || 0) * Number(item.unitPrice || 0);
      current.taxable += taxable;
      current.tax += taxable * rate / 100;
      grouped.set(`${code}-${rate}`, current);
    });
    return [...grouped.values()];
  }, [form.items]);

  const isSynced = Boolean(invoice && invoice.syncStatus === "synced");
  const isVoid = Boolean(invoice && (invoice.storedStatus === "void" || invoice.status === "void"));
  const isProcessing = Boolean(invoice && invoice.syncStatus === "processing");
  const editable = !loading && !isSynced && !isVoid && !isProcessing;
  const updateItem = (index: number, patch: Partial<InvoiceLine>) => setForm((current) => ({ ...current, items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) }));
  const payload = () => ({ workOrderId: workOrder.id, docType: "INVOICE" as const, isBackOrder: Boolean(form.isBackOrder), invoiceDate: form.invoiceDate, dueDate: form.dueDate, creditTermDays: Number(form.creditTermDays), autocountJobNo: form.autocountJobNo, debtorCode: form.debtorCode, vehicleType: form.vehicleType, vehicleNo: form.vehicleNo, discount: Number(form.discount), notes: form.notes, paymentInstructions: form.paymentInstructions, items: form.items.map((item) => ({ ...item, quantity: Number(item.quantity), unitPrice: Number(item.unitPrice), taxRate: Number(item.taxRate || 0) })) });
  const save = async (issue: boolean) => {
    if (loading || saving) return;
    setSaving(true); setError("");
    try {
      const saved = await postApi<WorkOrderInvoice>("admin-save-work-order-invoice", payload());
      const result = issue ? await postApi<WorkOrderInvoice>("admin-issue-work-order-invoice", { workOrderId: workOrder.id }) : saved;
      setInvoice(result);
      toast.success(
        issue
          ? `${result.internalRef || result.invoiceNo} queued for AutoCount.`
          : (result.storedStatus === "draft" ? "Invoice draft saved." : "Invoice updated & sync queue refreshed.")
      );
      await onChanged();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to save invoice."); }
    finally { setSaving(false); }
  };
  const retrySync = async () => {
    if (!invoice) return;
    setSaving(true); setError("");
    try { const updated = await postApi<WorkOrderInvoice>("admin-retry-autocount-invoice-sync", { invoiceId: invoice.id }); setInvoice(updated); toast.success("Invoice re-queued for AutoCount."); await onChanged(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to retry sync."); }
    finally { setSaving(false); }
  };
  const voidInvoice = async () => {
    if (!invoice) return;
    const confirmed = await confirmAction({
      title: `Void ${invoice.invoiceNo}?`,
      description: "The invoice will be removed from the customer portal and can no longer receive payment.",
      confirmLabel: "Void invoice",
      tone: "danger",
    });
    if (!confirmed) return;
    setSaving(true);
    try { const updated = await postApi<WorkOrderInvoice>("admin-void-work-order-invoice", { invoiceId: invoice.id }); setInvoice(updated); toast.success("Invoice voided."); await onChanged(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to void invoice."); }
    finally { setSaving(false); }
  };

  const downloadPdf = () => {
    if (!invoice || invoice.storedStatus === "draft") {
      toast.error("Issue the document before downloading its final PDF.");
      return;
    }
    if (invoice.storedStatus === "void") {
      toast.error("A voided document cannot be downloaded as a final PDF.");
      return;
    }
    setExportingPdf(true);
    try {
      const reference = invoice.autocountInvoiceNo || invoice.invoiceNo || invoice.internalRef;
      const fileName = downloadFinancialDocumentPdf({
        documentType: "INVOICE",
        reference,
        internalReference: invoice.internalRef,
        company: settings?.company,
        customer: {
          name: workOrder.companyName,
          code: form.debtorCode,
          contact: workOrder.contactName,
          phone: workOrder.customerPhone,
        },
        details: [
          { label: "Date", value: displayDate(form.invoiceDate) },
          { label: "Due Date", value: displayDate(form.dueDate) },
          { label: "Term", value: `${form.creditTermDays} days` },
          { label: "Job No", value: form.autocountJobNo || workOrder.workOrderNo },
          { label: "Vehicle Type", value: form.vehicleType },
          { label: "Vehicle No", value: form.vehicleNo },
        ],
        items: form.items.map((item) => ({
          code: item.code,
          description: item.description,
          quantity: Number(item.quantity),
          uom: "UNIT",
          unitPrice: Number(item.unitPrice),
          taxCode: item.taxCode,
          taxRate: Number(item.taxRate || 0),
          taxAmount: Number(item.taxAmount ?? Number(item.quantity) * Number(item.unitPrice) * Number(item.taxRate || 0) / 100),
          amount: Number(item.amount ?? Number(item.quantity) * Number(item.unitPrice)),
        })),
        subtotal: totals.subtotal,
        discount: totals.discount,
        taxAmount: totals.taxAmount,
        total: totals.total,
        paidAmount: invoice.paidAmount,
        balance: invoice.balance,
        notes: form.notes,
        paymentInstructions: form.paymentInstructions,
        showDeliverySignatures: false,
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
      await printDocumentElement("invoice-document", `Invoice ${invoice?.internalRef || workOrder.workOrderNo}`);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Unable to open document print preview.");
    }
  };

  const company = settings?.company;
  return (
    <div className="invoice-print-shell w-full">
      <style>{`@media print { @page { size: A4 portrait; margin: 10mm; } html, body, #root { display:block!important; height:auto!important; overflow:visible!important; background:#fff!important; } body * { visibility:hidden!important; } .invoice-print-shell, .invoice-frame, .invoice-layout, .invoice-stage, #invoice-document, #invoice-document * { visibility:visible!important; } .invoice-print-shell { display:block!important; position:static!important; inset:auto!important; margin:0!important; padding:0!important; background:#fff!important; } .invoice-frame, .invoice-layout, .invoice-stage { display:block!important; position:static!important; width:auto!important; max-width:none!important; height:auto!important; max-height:none!important; overflow:visible!important; background:#fff!important; box-shadow:none!important; } .no-print { display:none!important; } #invoice-document { width:100%!important; min-height:0!important; max-width:none!important; margin:0!important; padding:0!important; box-shadow:none!important; } #invoice-document thead { display:table-header-group; } #invoice-document tr { break-inside:avoid-page; } }`}</style>
      <div className="invoice-frame flex w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm lg:h-[calc(100vh-7rem)] lg:min-h-[640px]">
        <header className="no-print shrink-0 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-7 sm:py-5">
          <div className="flex flex-wrap items-center gap-3.5">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              {backLabel}
            </button>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1e3a8a] ring-1 ring-blue-100">
              <ReceiptText className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-extrabold text-slate-900">Invoice · {workOrder.workOrderNo}</h2>
                {workOrder.workOrderNo ? (
                  <button
                    type="button"
                    onClick={() => {
                      const isHistory = workOrder.canonicalStatus === "collected";
                      onClose();
                      navigate(
                        `/work-orders?wo=${encodeURIComponent(workOrder.workOrderNo)}${workOrder.id ? `&id=${workOrder.id}` : ""}${isHistory ? "&view=history" : ""}`
                      );
                    }}
                    className="inline-flex items-center gap-1 rounded-md bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 hover:text-blue-900 transition-colors cursor-pointer"
                    title="Open Work Order in Workshop Management"
                  >
                    <span>View Work Order</span>
                    <ExternalLink className="h-3 w-3" />
                  </button>
                ) : null}
                {loading ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase text-slate-500">
                    <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
                    Loading...
                  </span>
                ) : (
                  <>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${statusClass(invoice?.status || "draft")}`}>
                      {invoice?.status?.replaceAll("_", " ") || "draft"}
                    </span>
                    {invoice ? (
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
                        invoice.syncStatus === "synced"
                          ? "bg-emerald-100 text-emerald-800"
                          : invoice.syncStatus === "failed"
                          ? "bg-rose-100 text-rose-700"
                          : invoice.syncStatus === "processing"
                          ? "bg-blue-100 text-blue-800 animate-pulse ring-1 ring-blue-300"
                          : "bg-amber-100 text-amber-800"
                      }`}>
                        AutoCount: {(invoice.syncStatus || invoice.status).replaceAll("_", " ")}
                      </span>
                    ) : null}
                  </>
                )}
              </div>
              <p className="mt-0.5 text-xs text-slate-500">Create the invoice in MAW, then queue and sync to AutoCount ERP billing.</p>
            </div>
          </div>
          <div className="flex gap-2">
            {loading ? (
              <div className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-xs font-semibold text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                <span>Loading invoice...</span>
              </div>
            ) : (
              <>
                {editable ? (
                  invoice && invoice.storedStatus !== "draft" ? (
                    <>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void save(false)}
                        className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#1e3a8a] px-4 text-xs font-bold text-white shadow-xs hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
                      >
                        <Save className="h-4 w-4" />
                        Save Changes
                      </button>
                      {invoice.syncStatus === "failed" ? (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void retrySync()}
                          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-4 text-xs font-bold text-blue-700 shadow-2xs hover:bg-blue-100 disabled:opacity-50 cursor-pointer"
                        >
                          <RefreshCw className="h-4 w-4" />
                          Retry Sync
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void save(false)}
                        className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                      >
                        <FileDown className="h-4 w-4" />
                        Save Draft
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void save(true)}
                        className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#1e3a8a] px-4 text-xs font-bold text-white shadow-xs hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
                      >
                        <Send className="h-4 w-4" />
                        Issue & Queue
                      </button>
                    </>
                  )
                ) : null}
                {invoice && !["draft", "void"].includes(invoice.storedStatus) ? (
                  <button
                    type="button"
                    disabled={exportingPdf}
                    onClick={downloadPdf}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1e3a8a] px-4 text-xs font-bold text-white shadow-sm hover:bg-blue-800 disabled:opacity-50"
                    aria-label="Download invoice PDF"
                  >
                    <FileDown className="h-4 w-4" />
                    {exportingPdf ? "Generating PDF..." : "Download Invoice PDF"}
                  </button>
                ) : null}
                {invoice ? (
                  <button
                    type="button"
                    onClick={() => void handlePrint()}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"
                    aria-label="Print invoice"
                  >
                    <Printer className="h-4 w-4" />
                    Print Invoice
                  </button>
                ) : null}
              </>
            )}
          </div>
        </header>
        {loading ? (
          <div className="p-16 text-center text-sm text-slate-500">Loading invoice...</div>
        ) : (
          <div className="invoice-layout grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[470px_minmax(0,1fr)]">
            <aside className="no-print maw-editor-scroll h-full overflow-y-auto border-r border-slate-200 bg-slate-100/80 p-4 sm:p-5">
              {error ? <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div> : null}
              {invoice?.syncError ? <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"><strong>AutoCount sync failed:</strong> {invoice.syncError}</div> : null}
              {isProcessing ? (
                <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 shadow-2xs">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600 shrink-0" />
                  <span><strong>AutoCount Sync in Progress:</strong> This invoice is currently locked while being transmitted to AutoCount ERP. Editing is disabled to prevent data collisions.</span>
                </div>
              ) : null}
              {isSynced ? (
                <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 shadow-2xs">
                  <Lock className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span><strong>AutoCount Synced:</strong> This invoice is posted to AutoCount ERP ({invoice?.invoiceNo || invoice?.autocountInvoiceNo}) and is permanently locked.</span>
                </div>
              ) : null}
              {isVoid ? (
                <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 shadow-2xs">
                  <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
                  <span><strong>Invoice Voided:</strong> This invoice has been voided and is archived in read-only mode.</span>
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
                        ? "Enabled: Can issue without stock check (protects VIP reserved inventory)."
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

                {/* General Details Card */}
                <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs space-y-3">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Document Details
                  </div>

                  {/* Dates */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Document Date</label>
                      <DesktopDatePicker
                        disabled={!editable}
                        value={form.invoiceDate}
                        onChange={(value) => setForm((current) => ({ ...current, invoiceDate: value, dueDate: computeDueDate(value, current.creditTermDays) }))}
                        ariaLabel="Choose document date"
                        allowPastDates
                        className="h-8.5 text-xs bg-slate-50/70 hover:bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Due Date</label>
                      <DesktopDatePicker
                        disabled={!editable}
                        value={form.dueDate}
                        onChange={(value) => setForm((current) => ({ ...current, dueDate: value }))}
                        ariaLabel="Choose document due date"
                        className="h-8.5 text-xs bg-slate-50/70 hover:bg-white"
                      />
                    </div>
                  </div>

                  {/* AutoCount Job No. & Debtor Code */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Job No.</label>
                      <input
                        disabled={!editable}
                        value={form.autocountJobNo}
                        onChange={(event) => setForm((current) => ({ ...current, autocountJobNo: event.target.value.toUpperCase() }))}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1.5 text-xs uppercase font-medium focus:bg-white focus:border-blue-500 focus:outline-none"
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
                        disabled={!editable}
                        value={form.vehicleType}
                        onChange={(event) => setForm((current) => ({ ...current, vehicleType: event.target.value }))}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1.5 text-xs focus:bg-white focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Vehicle No.</label>
                      <input
                        disabled={!editable}
                        value={form.vehicleNo}
                        onChange={(event) => setForm((current) => ({ ...current, vehicleNo: event.target.value.toUpperCase() }))}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1.5 text-xs uppercase font-semibold focus:bg-white focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Credit Term & Discount */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Credit Term (days)</label>
                      <input
                        type="number"
                        min="0"
                        max="3650"
                        disabled={!editable}
                        value={form.creditTermDays}
                        onChange={(event) => {
                          const term = Number(event.target.value) || 0;
                          setForm((current) => ({ ...current, creditTermDays: term, dueDate: computeDueDate(current.invoiceDate, term) }));
                        }}
                        className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 text-xs focus:bg-white focus:border-blue-500 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Discount (RM)</label>
                      <input
                        type="number"
                        min="0"
                        disabled={!editable}
                        value={form.discount}
                        onChange={(event) => setForm((current) => ({ ...current, discount: Number(event.target.value) }))}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1.5 text-xs focus:bg-white focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Items Section */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between px-0.5">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        {form.docType === "DO" ? "Delivery Order Items" : "Invoice Items"}
                      </h3>
                      <span className="rounded-full bg-slate-200/80 px-1.5 py-0.2 text-[10px] font-bold text-slate-600">
                        {form.items.length}
                      </span>
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
                            const itemEl = document.getElementById(`invoice-item-${nextIndex}`);
                            if (itemEl) {
                              itemEl.scrollIntoView({ behavior: "smooth", block: "center" });
                              const focusTarget = itemEl.querySelector<HTMLElement>('button[role="combobox"], input');
                              focusTarget?.focus();
                            }
                          }, 60);
                        }}
                        className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add Item
                      </button>
                    ) : null}
                  </div>

                  <div className="space-y-2.5">
                    {form.items.map((item, index) => {
                      const isEditing = activeEditingIndex === index;
                      return (
                        <div
                          id={`invoice-item-${index}`}
                          key={item.id || index}
                          tabIndex={-1}
                          onFocus={() => setActiveEditingIndex(index)}
                          onClick={() => setActiveEditingIndex(index)}
                          className={`relative rounded-xl border p-3 space-y-2 transition-all duration-200 outline-none ${
                            isEditing
                              ? "border-blue-500 bg-white shadow-md ring-2 ring-blue-500/20 -translate-y-1 z-10"
                              : "border-slate-200 bg-white shadow-2xs hover:border-slate-300 focus-within:border-blue-500 focus-within:shadow-md focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:-translate-y-1"
                          }`}
                        >
                        {/* Row 1: Type selector, Catalog Combobox, Delete Button */}
                        <div className="flex items-center gap-2">
                          <div className="w-28 shrink-0">
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
                              className="h-9 text-xs border-slate-200 rounded-lg"
                            >
                              <option value="part">Part (0%)</option>
                              <option value="labour">Labour (8%)</option>
                              <option value="other">Other (0%)</option>
                            </AdminSelect>
                          </div>

                          <DocumentItemCatalogSelect
                            compact
                            itemType={item.type}
                            serviceTypeId={item.serviceTypeId}
                            code={item.code}
                            description={item.description}
                            disabled={!editable}
                            services={settings?.serviceTypes || []}
                            parts={catalogParts}
                            onSelect={(selection) =>
                              updateItem(index, {
                                serviceTypeId: selection.serviceTypeId,
                                code: selection.code,
                                description: selection.description,
                                quantity: 1,
                                unitPrice: selection.unitPrice,
                                taxCode: selection.taxCode,
                                taxRate: catalogueTaxRate(selection.taxCode, Number(item.taxRate || settings?.pricing.taxRate || 0)),
                              })
                            }
                          />

                          {editable && form.items.length > 1 ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleRemoveItem(index);
                              }}
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer"
                              aria-label="Remove item"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          ) : null}
                        </div>

                        {/* Row 2: Code & Description */}
                        <div className="grid grid-cols-[96px_1fr] gap-2">
                          <input
                            disabled={!editable}
                            value={item.code}
                            onChange={(event) => updateItem(index, { code: event.target.value })}
                            placeholder="Code"
                            className="h-9 rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 text-xs font-mono uppercase focus:bg-white focus:border-blue-500 focus:outline-none"
                          />
                          <input
                            disabled={!editable}
                            value={item.description}
                            onChange={(event) => updateItem(index, { description: event.target.value })}
                            placeholder="Description / notes..."
                            className="h-9 rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 text-xs focus:bg-white focus:border-blue-500 focus:outline-none"
                          />
                        </div>

                        {/* Row 3: Qty, Unit Price, Tax, Amount */}
                        <div className="grid grid-cols-[96px_1fr_110px_1fr] gap-2 items-end">
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Qty</span>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              disabled={!editable}
                              value={item.quantity}
                              onChange={(event) => updateItem(index, { quantity: Math.max(1, Number(event.target.value)) })}
                              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 text-xs font-semibold focus:bg-white focus:border-blue-500 focus:outline-none"
                            />
                          </div>
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Unit Price</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              disabled={!editable}
                              value={item.unitPrice}
                              onChange={(event) => updateItem(index, { unitPrice: Number(event.target.value) })}
                              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 text-xs focus:bg-white focus:border-blue-500 focus:outline-none"
                            />
                          </div>
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Tax (%)</span>
                            <TaxRateInput
                              disabled={!editable}
                              value={item.taxRate ?? 0}
                              onChange={(rate) => {
                                const matched = masterTaxCodes.find((m) => Math.abs(m.rate - rate) < 0.001);
                                updateItem(index, {
                                  taxRate: rate,
                                  taxCode: matched?.autocountTaxCode || (rate === 8 ? "SV-8" : rate > 0 ? (item.taxCode || `TAX-${rate}`) : ""),
                                });
                              }}
                              presets={masterTaxCodes}
                              className="h-9 w-full text-xs"
                            />
                          </div>
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 text-right">Amount</span>
                            <div className="flex h-9 items-center justify-end rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-right text-xs font-bold text-slate-800">
                              {money(item.quantity * item.unitPrice)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </div>

                {/* Notes & Payment Instructions Card */}
                <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      {form.docType === "DO" ? "Delivery Notes" : "Invoice Notes"}
                    </label>
                    <textarea
                      disabled={!editable}
                      rows={2}
                      value={form.notes}
                      onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                      placeholder="Notes visible on document..."
                      className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 text-xs focus:bg-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Payment Instructions</label>
                    <textarea
                      disabled={!editable}
                      rows={3}
                      value={form.paymentInstructions}
                      onChange={(event) => setForm((current) => ({ ...current, paymentInstructions: event.target.value }))}
                      placeholder="Bank transfer details or terms..."
                      className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 text-xs focus:bg-white focus:border-blue-500 focus:outline-none leading-relaxed"
                    />
                  </div>
                </div>

                {isSynced ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-800 flex items-start gap-2">
                    <Lock className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">AutoCount Synced (Locked)</span>
                      <p className="text-[11px] text-emerald-700 mt-0.5 leading-relaxed">
                        This document is registered in AutoCount ({invoice.autocountInvoiceNo || invoice.invoiceNo}). Modifications must be processed via AutoCount ERP or Credit Note.
                      </p>
                    </div>
                  </div>
                ) : editable && invoice && invoice.storedStatus !== "draft" ? (
                  <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-800 flex items-start gap-2">
                    <div className="h-2 w-2 rounded-full bg-blue-500 shrink-0 mt-1.5 animate-pulse" />
                    <div>
                      <span className="font-bold block">Editable Before Sync</span>
                      <p className="text-[11px] text-blue-700 mt-0.5 leading-relaxed">
                        This invoice is queued or pending sync. You can edit line items or details. Saving changes will automatically refresh the sync queue.
                      </p>
                    </div>
                  </div>
                ) : null}

                {invoice && invoice.storedStatus !== "draft" ? (
                  <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-500">Document Status</span>
                      <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[10px] font-bold text-blue-700 uppercase">
                        {invoice.storedStatus}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-500">AutoCount Sync</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                        invoice.syncStatus === "synced"
                          ? "bg-emerald-100 text-emerald-700"
                          : invoice.syncStatus === "failed"
                          ? "bg-rose-100 text-rose-700"
                          : "bg-amber-100 text-amber-700"
                      }`}>
                        {invoice.syncStatus.replaceAll("_", " ")}
                      </span>
                    </div>
                    <p className="border-t border-slate-100 pt-1.5 text-[10px] leading-relaxed text-slate-400">
                      Payment settlements &amp; bank reconciliations are processed in AutoCount Accounting.
                    </p>
                  </div>
                ) : null}

                {invoice && invoice.storedStatus !== "void" && invoice.syncStatus !== "synced" ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void voidInvoice()}
                    className="inline-flex w-full items-center justify-center rounded-lg border border-rose-200 py-2.5 text-xs font-bold text-rose-600 hover:bg-rose-50 cursor-pointer"
                  >
                    <XCircle className="mr-1.5 h-4 w-4" />
                    Void Document
                  </button>
                ) : null}
              </div>
            </aside>
            <main className="invoice-stage maw-editor-scroll h-full overflow-auto bg-slate-200/80 p-6 sm:p-8 flex justify-center items-start">
              <article
                id="invoice-document"
                style={{ width: "210mm", minHeight: "297mm" }}
                className="a4-sheet mx-auto shrink-0 bg-white p-10 text-[11px] text-slate-900 shadow-2xl rounded-xs border border-slate-200/80 flex flex-col justify-between"
              >
                <div>
                  <header className="grid grid-cols-[250px_minmax(0,1fr)] items-center border-b-2 border-slate-800 pb-4">
                    <div className="flex h-28 w-60 items-center justify-center overflow-hidden">
                      <img src={logo} alt="Mewah AutoWorks" className="h-28 w-60 scale-[1.55] object-contain" />
                    </div>
                    <div className="text-center leading-tight">
                      <h1 className="text-xl font-black">{company?.legalName || "MEWAH AUTOWORKS SDN BHD"}</h1>
                      <p>({company?.registrationNo})</p>
                      <p>({company?.groupName})</p>
                      <p>{company?.address}</p>
                      <p>Tel: {company?.phone} · {company?.email}</p>
                    </div>
                  </header>
                  <div className="mt-5 grid grid-cols-2 gap-6">
                    <section className="min-h-40 border border-slate-700 p-3">
                      <p className="text-[9px] font-bold text-slate-500">{form.debtorCode || "DEBTOR CODE"}</p>
                      {workOrder.companyName && workOrder.companyName.trim() !== "-" && workOrder.companyName.trim().toLowerCase() !== "cash customer" ? (
                        <p className="font-black">{workOrder.companyName}</p>
                      ) : (
                        <>
                          <p className="font-black">{workOrder.contactName || "Cash Customer"}</p>
                          {workOrder.customerPhone && workOrder.customerPhone !== "-" ? <p>{workOrder.customerPhone}</p> : null}
                        </>
                      )}
                    </section>
                    <section>
                      <h2 className="mb-2 text-center text-2xl font-black tracking-wide">{form.docType === "DO" ? "DELIVERY ORDER" : "INVOICE"}</h2>
                      <dl className="grid grid-cols-[100px_10px_1fr] gap-y-1">
                        <dt className="font-bold">{form.docType === "DO" ? "DO No." : "No."}</dt>
                        <dd>:</dd>
                        <dd>{form.docType === "DO" ? (invoice?.autocountDoNo || invoice?.internalRef || "Generated when saved") : (invoice?.autocountInvoiceNo || invoice?.internalRef || "Generated when saved")}</dd>
                        <dt className="font-bold">Date</dt>
                        <dd>:</dd>
                        <dd>{displayDate(form.invoiceDate)}</dd>
                        <dt className="font-bold">Term</dt>
                        <dd>:</dd>
                        <dd>{form.creditTermDays} days</dd>
                        <dt className="font-bold">Job No.</dt>
                        <dd>:</dd>
                        <dd>{form.autocountJobNo}</dd>
                        <dt className="font-bold">Vehicle Type</dt>
                        <dd>:</dd>
                        <dd>{form.vehicleType}</dd>
                        <dt className="font-bold">Vehicle No.</dt>
                        <dd>:</dd>
                        <dd>{form.vehicleNo}</dd>
                      </dl>
                    </section>
                  </div>
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
                        <tr key={item.id || index} className="align-top">
                          <td className="py-2">{index + 1}.</td>
                          <td className="py-2">
                            <p className="font-bold">{item.code ? `${item.code} · ` : ""}{(item.description || "Item description").trim().replace(/\s*-\s*$/, "")}</p>
                            <p className="text-[8px] uppercase text-slate-500">{item.type} · {item.taxCode || "@0%"}</p>
                          </td>
                          <td className="py-2 text-right">{Number(item.quantity).toFixed(2)}</td>
                          <td className="py-2 text-right">{money(item.unitPrice)}</td>
                          <td className="py-2 text-right">{money(item.quantity * item.unitPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-8 pt-4">
                  <div className="grid grid-cols-[1fr_290px] gap-4 border-t border-slate-800 pt-2">
                    <div>
                      {form.notes ? (
                        <>
                          <p className="font-black">Note:</p>
                          <p className="whitespace-pre-wrap">{form.notes}</p>
                        </>
                      ) : null}
                      {totals.taxAmount > 0 && taxSummary.some((tax) => tax.tax > 0) ? (
                        <table className="mt-4 text-[9px]">
                          <thead>
                            <tr>
                              <th className="pr-5 text-left">Tax Code</th>
                              <th className="pr-5 text-right">Taxable</th>
                              <th className="text-right">Tax</th>
                            </tr>
                          </thead>
                          <tbody>
                            {taxSummary.map((tax) => (
                              <tr key={`${tax.code}-${tax.rate}`}>
                                <td className="pr-5">{tax.code} ({tax.rate.toFixed(2)}%)</td>
                                <td className="pr-5 text-right">{money(tax.taxable)}</td>
                                <td className="text-right">{money(tax.tax)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : null}
                    </div>
                    <dl className="grid grid-cols-[1fr_90px] gap-y-1 text-right">
                      <dt className="font-bold">Sub Total</dt>
                      <dd>{money(totals.subtotal)}</dd>
                      <dt>Discount</dt>
                      <dd>{money(totals.discount)}</dd>
                      <dt>Service Tax</dt>
                      <dd>{money(totals.taxAmount)}</dd>
                      <dt className="border-t border-slate-800 pt-2 text-sm font-black">Total (RM)</dt>
                      <dd className="border-t border-slate-800 pt-2 text-sm font-black">{money(totals.total)}</dd>
                    </dl>
                  </div>
                  <div className="mt-5 border-t border-slate-400 pt-3">
                    <p className="font-black">Payment Instructions:</p>
                    <p className="mt-1 whitespace-pre-wrap">{form.paymentInstructions}</p>
                  </div>
                  <p className="mt-8 text-center text-xs font-bold text-slate-500">
                    {form.docType === "DO" ? "This is a computer generated delivery order, please acknowledge receipt of vehicle & services." : "This is a computer generated invoice, no signature required."}
                  </p>
                  {form.docType === "DO" ? (
                    <div className="mt-12 grid grid-cols-2 gap-12 pt-8 text-center text-xs">
                      <div className="border-t border-slate-800 pt-2"><p className="font-bold">Issued By / Workshop Rep</p></div>
                      <div className="border-t border-slate-800 pt-2"><p className="font-bold">Received &amp; Accepted By / Driver</p></div>
                    </div>
                  ) : null}
                </div>
              </article>
            </main>
          </div>
        )}
      </div>
    </div>
  );
}
