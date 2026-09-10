import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, FileDown, FileText, Loader2, Plus, Printer, Send, Trash2, Wrench, X } from "lucide-react";
import { toast } from "sonner";
import logo from "../../MAW_logo.png";
import { apiRequest, postApi } from "../lib/api";
import { useConfirmationDialog } from "../contexts/confirmation-dialog-context";
import { printDocumentElement } from "../lib/print-document";
import {
  DocumentItemCatalogSelect,
  type DocumentCatalogPart,
} from "./ui/document-item-catalog-select";
import { AdminSelect } from "./ui/admin-select";
import { TaxRateInput } from "./ui/tax-rate-input";
import { DesktopDatePicker } from "./ui/desktop-date-picker";
import { DesktopDateTimePicker } from "./ui/desktop-date-time-picker";
import { getMasterTaxCodes } from "./master-data";

const WORKSHOP_BAYS = [
  "Bay 1",
  "Bay 2",
  "Bay 3",
  "Bay 4",
  "Engine Bay",
  "Trailer Bay",
] as const;

export type QuotationItem = {
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

export type WorkOrderQuotation = {
  id: number;
  workOrderId: number;
  quotationNo: string;
  debtorCode?: string;
  revision: number;
  status: "draft" | "issued" | "approved" | "rejected";
  validUntil: string | null;
  subtotal: number;
  discount: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  notes: string;
  terms: string;
  customerResponseNote: string;
  createdAt: string;
  updatedAt: string;
  issuedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  items: QuotationItem[];
};

export type QuotationWorkOrder = {
  id: number;
  workOrderNo: string;
  canonicalStatus: string;
  companyName: string;
  contactName: string;
  customerPhone: string;
  vehicleNo: string;
  brand: string;
  model: string;
  equipmentType: string;
  serviceType: string;
  bay?: string | null;
  estimatedOut?: string | null;
};

type EditableQuote = {
  date: string;
  validUntil: string;
  debtorCode: string;
  debtorAddress?: string;
  vehicleType: string;
  vehicleNo: string;
  discount: number;
  taxRate: number;
  notes: string;
  terms: string;
  items: QuotationItem[];
};

type InspectionPartRequirement = {
  id?: number;
  partId: number | null;
  code: string;
  description: string;
  uom: string;
  quantity: number;
  unitPrice: number;
};

type DocumentSettings = {
  company: {
    legalName: string;
    registrationNo: string;
    groupName: string;
    address: string;
    phone: string;
    email: string;
    operatingHours: string;
  };
  pricing: { taxRate: number };
  serviceTypes: ServiceTypeOption[];
};

type ServiceTypeOption = {
  id: number;
  name: string;
  description: string;
  basePrice: number;
  enabled: boolean;
  sortOrder: number;
};

type AutoCountDebtor = {
  code: string;
  name: string;
  term?: string;
};

type AutoCountDebtorResponse = AutoCountDebtor[] | {
  debtors?: AutoCountDebtor[];
  lastSync?: unknown;
};

const defaultDocumentSettings: DocumentSettings = {
  company: {
    legalName: "MEWAH AUTOWORKS SDN BHD",
    registrationNo: "YOUR-REGISTRATION-NO",
    groupName: "",
    address: "Configure your workshop address",
    phone: "+60 00-000 0000",
    email: "contact@example.com",
    operatingHours: "Monday - Saturday, 8:00 AM - 6:00 PM",
  },
  pricing: { taxRate: 0 },
  serviceTypes: [],
};

const DEFAULT_TERMS = "Quotation is valid until the date stated above. Additional work requires customer approval. Prices may change if inspection reveals additional parts or labour.";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function futureDate(days: number) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function catalogueTaxRate(taxCode: string, fallback: number) {
  const match = taxCode.match(/(\d+(?:\.\d+)?)/);
  if (match) {
    const parsed = parseFloat(match[1]);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
}

function blankQuote(): EditableQuote {
  return {
    date: today(),
    validUntil: futureDate(14),
    debtorCode: "",
    vehicleType: "",
    vehicleNo: "",
    discount: 0,
    taxRate: 0,
    notes: "",
    terms: DEFAULT_TERMS,
    items: [{ type: "part", code: "", description: "", quantity: 1, unitPrice: 0, taxCode: "", taxRate: 0 }],
  };
}

function money(value: number) {
  return Number(value || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function displayDate(value?: string | null) {
  if (!value) return "—";
  const normalized = value.includes("T") ? value : value.includes(" ") ? value.replace(" ", "T") : `${value}T00:00:00`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-GB");
}

function statusClass(status: string) {
  const classes: Record<string, string> = {
    draft: "bg-slate-100 text-slate-700",
    issued: "bg-blue-100 text-blue-700",
    approved: "bg-emerald-100 text-emerald-700",
    rejected: "bg-rose-100 text-rose-700",
  };
  return classes[status] || classes.draft;
}

export function WorkOrderQuotationDialog({
  workOrder,
  canManage,
  onClose,
  onChanged,
  backLabel = "Back to Work Orders",
}: {
  workOrder: QuotationWorkOrder;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
  backLabel?: string;
}) {
  const [quotation, setQuotation] = useState<WorkOrderQuotation | null>(null);
  const [form, setForm] = useState<EditableQuote>(() => ({
    ...blankQuote(),
    vehicleType: workOrder.equipmentType || [workOrder.brand, workOrder.model].filter(Boolean).join(" "),
    vehicleNo: workOrder.vehicleNo || "",
  }));
  const [documentSettings, setDocumentSettings] = useState<DocumentSettings>(defaultDocumentSettings);
  const [catalogParts, setCatalogParts] = useState<DocumentCatalogPart[]>([]);
  const [debtors, setDebtors] = useState<AutoCountDebtor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [activeEditingIndex, setActiveEditingIndex] = useState<number | null>(null);
  const confirmAction = useConfirmationDialog();
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

    const currentRate = Number(form.taxRate || 0);
    if (!seenRates.has(currentRate)) {
      list.push({
        key: "tax-custom",
        rate: currentRate,
        label: `${currentRate}% — Custom Tax Rate`,
      });
    }

    return list;
  }, [masterTaxCodes, form.taxRate]);

  const handleRemoveItem = async (index: number) => {
    const targetItem = form.items[index];
    const itemLabel = targetItem?.description?.trim() || targetItem?.code?.trim() || `Item #${index + 1}`;
    const confirmed = await confirmAction({
      title: "Remove Quotation Item?",
      description: `Are you sure you want to remove "${itemLabel}" from this quotation?`,
      confirmLabel: "Remove Item",
      tone: "danger",
    });
    if (!confirmed) return;

    setForm((current) => ({
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    }));
    if (activeEditingIndex === index) {
      setActiveEditingIndex(Math.max(0, index - 1));
    } else if (activeEditingIndex !== null && activeEditingIndex > index) {
      setActiveEditingIndex(activeEditingIndex - 1);
    }
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      apiRequest<WorkOrderQuotation | null>(`admin-get-work-order-quotation&id=${workOrder.id}`),
      apiRequest<DocumentSettings>("admin-system-settings").catch(() => null),
      apiRequest<DocumentCatalogPart[]>("admin-parts").catch(() => []),
      apiRequest<InspectionPartRequirement[]>(`admin-get-work-order-part-requirements&id=${workOrder.id}`).catch(() => []),
      apiRequest<AutoCountDebtorResponse>("admin-autocount-debtors").catch(() => []),
    ])
      .then(([data, loadedSettings, loadedParts, inspectionParts, loadedDebtors]) => {
        if (!active) return;
        const safeCatalogParts = Array.isArray(loadedParts) ? loadedParts : [];
        const safeInspectionParts = Array.isArray(inspectionParts) ? inspectionParts : [];
        const safeDebtors = Array.isArray(loadedDebtors)
          ? loadedDebtors
          : Array.isArray(loadedDebtors?.debtors)
            ? loadedDebtors.debtors
            : [];
        if (loadedSettings) setDocumentSettings(loadedSettings);
        setCatalogParts(safeCatalogParts);
        setDebtors(safeDebtors);
        setQuotation(data);

        // Try auto-matching debtor code from server or AutoCount debtors
        const serverDebtorCode = (data as any)?.debtorCode || "";
        const matchedDebtor = safeDebtors.find(
          (d) =>
            (serverDebtorCode && d.code.toUpperCase() === serverDebtorCode.toUpperCase()) ||
            d.name.trim().toLowerCase() === (workOrder.companyName || "").trim().toLowerCase() ||
            (workOrder.companyName || "").trim().toLowerCase().includes(d.name.trim().toLowerCase())
        );
        const resolvedDebtorCode = serverDebtorCode || matchedDebtor?.code || "";

        if (data && data.id > 0) {
          const createdAtDate = data.createdAt ? data.createdAt.slice(0, 10) : today();
          // Automatically merge any diagnosed inspection parts not yet in the quotation
          const existingCodes = new Set((data.items || []).map((it) => (it.code || "").trim().toUpperCase()).filter(Boolean));
          const existingDescs = new Set((data.items || []).map((it) => (it.description || "").trim().toUpperCase()).filter(Boolean));
          const missingInspectionParts = safeInspectionParts.filter((p) => {
            const pCode = (p.code || "").trim().toUpperCase();
            const pDesc = (p.description || "").trim().toUpperCase();
            return !(pCode && existingCodes.has(pCode)) && !(pDesc && existingDescs.has(pDesc));
          });

          const initialItems = [
            ...(data.items || []).map((item) => {
              const isLabour = item.type === "labour";
              return {
                ...item,
                taxCode: item.taxCode || (isLabour ? "SV-8" : ""),
                taxRate: item.taxRate !== undefined && item.taxRate !== null ? Number(item.taxRate) : (isLabour ? 8 : 0),
              };
            }),
            ...missingInspectionParts.map((item) => ({
              type: "part" as const,
              code: item.code,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              taxCode: "",
              taxRate: 0,
            })),
          ];

          setForm({
            date: createdAtDate,
            validUntil: data.validUntil || futureDate(14),
            debtorCode: resolvedDebtorCode,
            vehicleType: workOrder.equipmentType || [workOrder.brand, workOrder.model].filter(Boolean).join(" "),
            vehicleNo: workOrder.vehicleNo || "",
            discount: data.discount,
            taxRate: data.taxRate,
            notes: data.notes,
            terms: data.terms || DEFAULT_TERMS,
            items: initialItems,
          });
        } else if (safeInspectionParts.length > 0) {
          const nextForm: EditableQuote = {
            ...blankQuote(),
            debtorCode: resolvedDebtorCode,
            vehicleType: workOrder.equipmentType || [workOrder.brand, workOrder.model].filter(Boolean).join(" "),
            vehicleNo: workOrder.vehicleNo || "",
            items: safeInspectionParts.map((item) => ({
              type: "part",
              code: item.code,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              taxCode: "",
              taxRate: 0,
            })),
          };
          setForm(nextForm);
        } else {
          setForm({
            ...blankQuote(),
            debtorCode: resolvedDebtorCode,
            vehicleType: workOrder.equipmentType || [workOrder.brand, workOrder.model].filter(Boolean).join(" "),
            vehicleNo: workOrder.vehicleNo || "",
          });
        }
      })
      .catch((caught) => {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : "Unable to load quotation.");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [workOrder]);

  const catalogBySku = useMemo(() => {
    const map = new Map<string, DocumentCatalogPart>();
    catalogParts.forEach((part) => map.set(part.sku, part));
    return map;
  }, [catalogParts]);

  const totals = useMemo(() => {
    const subtotal = form.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);
    const discount = Math.min(Math.max(Number(form.discount || 0), 0), subtotal);
    const taxAmount = form.items.reduce(
      (sum, item) => sum + (Number(item.quantity || 0) * Number(item.unitPrice || 0) * Number(item.taxRate || 0)) / 100,
      0
    );
    const taxable = Math.max(0, subtotal - discount);
    return {
      subtotal,
      discount,
      taxAmount,
      total: Number((taxable + taxAmount).toFixed(2)),
    };
  }, [form.discount, form.items]);

  const taxSummary = useMemo(() => {
    const grouped = new Map<string, { code: string; rate: number; taxable: number; tax: number }>();
    form.items.forEach((item) => {
      const rate = Number(item.taxRate || 0);
      const code = item.taxCode || (rate > 0 ? `TAX-${rate}` : "@0%");
      const current = grouped.get(`${code}-${rate}`) || { code, rate, taxable: 0, tax: 0 };
      const taxable = Number(item.quantity || 0) * Number(item.unitPrice || 0);
      current.taxable += taxable;
      current.tax += (taxable * rate) / 100;
      grouped.set(`${code}-${rate}`, current);
    });
    return Array.from(grouped.values());
  }, [form.items]);

  const handlePrint = async () => {
    try {
      await printDocumentElement("quotation-document", `Quotation ${quotation?.quotationNo || workOrder.workOrderNo}`);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Unable to open quotation print preview.");
    }
  };

  const isApproved = quotation?.status === "approved";
  const isDraft = !quotation || quotation.status === "draft";
  const isIssued = quotation?.status === "issued";
  const isRejected = quotation?.status === "rejected";
  const isEditable = !loading && canManage && !isApproved;
  const canIssue = Boolean(!loading && canManage && form.items.length > 0 && !isApproved);

  const updateItem = (index: number, patch: Partial<QuotationItem>) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    }));
  };

  const payload = () => ({
    workOrderId: workOrder.id,
    debtorCode: form.debtorCode,
    validUntil: form.validUntil,
    discount: Number(form.discount || 0),
    taxRate: Number(form.taxRate || 0),
    notes: form.notes,
    terms: form.terms,
    items: form.items.map((item) => ({
      type: item.type || "part",
      serviceTypeId: item.serviceTypeId || null,
      code: (item.code || "").trim(),
      description: (item.description || item.code || "Item").trim(),
      quantity: Number(item.quantity || 1),
      unitPrice: Number(item.unitPrice || 0),
      taxCode: item.taxCode || (item.type === "labour" ? "SV-8" : ""),
      taxRate: Number(item.taxRate ?? (item.type === "labour" ? 8 : 0)),
    })),
  });

  const save = async (issue: boolean) => {
    if (loading || saving) return;
    setSaving(true);
    setError("");
    try {
      const saved = await postApi<WorkOrderQuotation>("admin-save-work-order-quotation", payload());
      let nextQuote = saved;
      if (issue) {
        nextQuote = await postApi<WorkOrderQuotation>("admin-issue-work-order-quotation", { workOrderId: workOrder.id });
        toast.success(`Quotation ${nextQuote.quotationNo} issued to customer.`);
      } else {
        toast.success("Quotation updated and saved.");
      }
      setQuotation(nextQuote);
      if (Array.isArray(nextQuote.items)) {
        setForm((prev) => ({
          ...prev,
          discount: nextQuote.discount,
          taxRate: nextQuote.taxRate,
          notes: nextQuote.notes,
          terms: nextQuote.terms,
          items: nextQuote.items.map((it) => ({ ...it })),
        }));
      }
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save quotation.");
    } finally {
      setSaving(false);
    }
  };

  const hasUnsavedChanges = useMemo(() => {
    if (!quotation) return form.items.length > 0;
    const currentSerialized = JSON.stringify(form.items.map((i) => ({
      t: i.type,
      c: (i.code || "").trim(),
      d: (i.description || "").trim(),
      q: Number(i.quantity || 1),
      p: Number(i.unitPrice || 0),
      s: i.serviceTypeId || null,
    })));
    const savedSerialized = JSON.stringify((quotation.items || []).map((i) => ({
      t: i.type,
      c: (i.code || "").trim(),
      d: (i.description || "").trim(),
      q: Number(i.quantity || 1),
      p: Number(i.unitPrice || 0),
      s: i.serviceTypeId || null,
    })));
    return currentSerialized !== savedSerialized;
  }, [form.items, quotation]);

  const handleBackWithAutoSave = async () => {
    if (isEditable && hasUnsavedChanges) {
      try {
        await postApi<WorkOrderQuotation>("admin-save-work-order-quotation", payload());
        toast.success("Quotation draft automatically saved.");
        await onChanged();
      } catch (err) {
        console.warn("Auto-save on exit failed:", err);
      }
    }
    onClose();
  };

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignBay, setAssignBay] = useState(workOrder.bay || "");
  const [assignEta, setAssignEta] = useState(
    workOrder.estimatedOut
      ? (workOrder.estimatedOut.includes(" ") ? workOrder.estimatedOut.replace(" ", "T").slice(0, 16) : workOrder.estimatedOut.slice(0, 16))
      : ""
  );

  const confirmAndProceedToRepair = async () => {
    if (!assignBay) {
      toast.error("Please allocate a Workshop Bay before proceeding to repair.");
      return;
    }
    if (!assignEta) {
      toast.error("Please set the Expected Handover (ETA) before proceeding to repair.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (isEditable) {
        await postApi<WorkOrderQuotation>("admin-save-work-order-quotation", payload());
      }
      const formattedEta = assignEta.includes("T")
        ? assignEta.replace("T", " ") + (assignEta.length === 16 ? ":00" : "")
        : assignEta;
      await postApi("admin-approve-work-order-quotation", {
        workOrderId: workOrder.id,
        bay: assignBay,
        estimatedOut: formattedEta,
      });
      toast.success("Quotation approved. Workshop Bay and Handover ETA assigned.");
      await onChanged();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to approve quotation.");
      toast.error(caught instanceof Error ? caught.message : "Unable to approve quotation.");
    } finally {
      setSaving(false);
      setAssignModalOpen(false);
    }
  };

  const shownStatus = quotation?.status || "draft";
  const shownNo = quotation?.quotationNo || "Generated when saved";

  return (
    <div className="quotation-print-shell space-y-4">
      <style>{`@media print {
        @page { size: A4 portrait; margin: 10mm; }
        html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
        #root { display: none !important; }
        body * { visibility: hidden !important; }
        .no-print { display: none !important; }
        .quotation-print-shell, .quotation-print-frame, .quotation-layout, .quotation-stage,
        #quotation-document, #quotation-document * { visibility: visible !important; }
        .quotation-print-shell, .quotation-print-frame, .quotation-layout, .quotation-stage {
          display: block !important; position: static !important; inset: auto !important;
          width: auto !important; height: auto !important; min-height: 0 !important;
          max-width: none !important; max-height: none !important; overflow: visible !important;
          margin: 0 !important; padding: 0 !important; background: #fff !important;
          border: 0 !important; border-radius: 0 !important; box-shadow: none !important;
          transform: none !important; backdrop-filter: none !important;
        }
        #quotation-document {
          position: static !important; width: 100% !important; min-height: 0 !important;
          max-width: none !important; margin: 0 !important; padding: 0 !important;
          border: 0 !important; box-shadow: none !important;
        }
        #quotation-document header, #quotation-document > div { break-inside: avoid-page; }
        #quotation-document table { break-inside: auto; }
        #quotation-document thead { display: table-header-group; }
        #quotation-document tr { break-inside: avoid-page; }
      }`}</style>

      {/* Frame Container */}
      <div className="quotation-print-frame flex w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm lg:h-[calc(100vh-7rem)] lg:min-h-[640px]">
        <header className="no-print shrink-0 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-7 sm:py-5">
          <div className="flex flex-wrap items-center gap-3.5">
            <button
              type="button"
              onClick={() => void handleBackWithAutoSave()}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              {backLabel}
            </button>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1e3a8a] ring-1 ring-blue-100">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-extrabold text-slate-900">Quotation · {workOrder.workOrderNo}</h2>
                {loading ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase text-slate-500">
                    <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
                    Loading...
                  </span>
                ) : (
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${statusClass(shownStatus)}`}>
                    {shownStatus}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-slate-500">Create, review and issue the repair estimate to the customer.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {loading ? (
              <div className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-xs font-semibold text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                <span>Loading quotation...</span>
              </div>
            ) : (
              <>
                {canManage ? (
                  <>
                    {isEditable && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void save(false)}
                        className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-4 text-xs font-bold shadow-sm transition-all disabled:opacity-50 cursor-pointer ${
                          hasUnsavedChanges
                            ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 ring-2 ring-amber-300/40"
                            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <FileDown className="h-4 w-4" />
                        {hasUnsavedChanges ? "Save Changes" : quotation ? "Update Quotation" : "Save Draft"}
                      </button>
                    )}
                    {!isApproved && (
                      <button
                        type="button"
                        disabled={saving || !canIssue}
                        onClick={() => void save(true)}
                        className={`inline-flex h-10 items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-white shadow-sm transition-all hover:bg-blue-800 disabled:opacity-50 cursor-pointer ${
                          hasUnsavedChanges && isIssued
                            ? "bg-blue-700 ring-2 ring-amber-400"
                            : "bg-[#1e3a8a]"
                        }`}
                      >
                        <Send className="h-4 w-4" />
                        {isIssued ? (hasUnsavedChanges ? "Save & Re-issue Quote" : "Re-issue Quote") : "Issue Quote"}
                      </button>
                    )}
                    {!isApproved && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => setAssignModalOpen(true)}
                        className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Approve & Proceed to Repair
                      </button>
                    )}
                  </>
                ) : null}
                {quotation ? (
                  <button
                    type="button"
                    onClick={() => void handlePrint()}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 cursor-pointer"
                    aria-label="Print quotation"
                  >
                    <Printer className="h-4 w-4" />
                    Print Quotation
                  </button>
                ) : null}
              </>
            )}
          </div>
        </header>

        {loading ? (
          <div className="p-16 text-center text-sm text-slate-500">Loading quotation...</div>
        ) : (
          <div className="quotation-layout grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[470px_minmax(0,1fr)]">
            <aside className="no-print maw-editor-scroll h-full overflow-y-auto border-r border-slate-200 bg-slate-100/80 p-4 sm:p-5">
              {error ? <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div> : null}
              {!canManage ? <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">View only. Only Admin can create, edit or issue quotations.</div> : null}
              {isApproved ? (
                <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>This quotation has been approved and locked. Repair is authorized.</span>
                </div>
              ) : null}

              <div className="space-y-4">
                {/* General Details Card */}
                <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs space-y-3">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    General Information
                  </div>

                  {/* Dates */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Date</label>
                      <DesktopDatePicker
                        disabled={!isEditable}
                        value={form.date}
                        onChange={(value) => setForm((current) => ({ ...current, date: value }))}
                        ariaLabel="Choose quotation date"
                        allowPastDates
                        className="h-8.5 text-xs bg-slate-50/70 hover:bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Valid Until</label>
                      <DesktopDatePicker
                        disabled={!isEditable}
                        value={form.validUntil}
                        onChange={(value) => setForm((current) => ({ ...current, validUntil: value }))}
                        ariaLabel="Choose quotation validity date"
                        className="h-8.5 text-xs bg-slate-50/70 hover:bg-white"
                      />
                    </div>
                  </div>

                  {/* Debtor Code & AutoCount Link */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-semibold text-slate-600">Debtor Code</label>
                      {form.debtorCode ? (
                        <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> Auto-linked
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">Optional</span>
                      )}
                    </div>
                    <AdminSelect
                      disabled={!isEditable}
                      value={form.debtorCode}
                      onChange={(event) => {
                        const val = event.target.value;
                        const matched = debtors.find((d) => d.code === val);
                        setForm((current) => ({
                          ...current,
                          debtorCode: val,
                          debtorAddress: (matched as any)?.address1 || (matched as any)?.address2 || current.debtorAddress,
                        }));
                      }}
                      className="h-9 w-full text-xs font-mono uppercase"
                      placeholder="Select AutoCount debtor account..."
                    >
                      <option value="">-- Direct / Walk-in Customer --</option>
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

                  {/* Vehicle Details */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Vehicle Type</label>
                      <input
                        disabled={!isEditable}
                        value={form.vehicleType}
                        onChange={(event) => setForm((current) => ({ ...current, vehicleType: event.target.value }))}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1.5 text-xs focus:bg-white focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Vehicle No.</label>
                      <input
                        disabled={!isEditable}
                        value={form.vehicleNo}
                        onChange={(event) => setForm((current) => ({ ...current, vehicleNo: event.target.value.toUpperCase() }))}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1.5 text-xs uppercase font-semibold focus:bg-white focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Validity & Discount */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Valid Until</label>
                      <input
                        type="date"
                        disabled={!isEditable}
                        value={form.validUntil}
                        onChange={(event) => setForm((current) => ({ ...current, validUntil: event.target.value }))}
                        className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 text-xs focus:bg-white focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Discount (RM)</label>
                      <input
                        type="number"
                        min="0"
                        disabled={!isEditable}
                        value={form.discount}
                        onChange={(event) => setForm((current) => ({ ...current, discount: Number(event.target.value) }))}
                        className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 text-xs focus:bg-white focus:border-blue-500 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Items Section */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between px-0.5">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Quotation Items</h3>
                      <span className="rounded-full bg-slate-200/80 px-1.5 py-0.2 text-[10px] font-bold text-slate-600">
                        {form.items.length}
                      </span>
                    </div>
                    {isEditable ? (
                      <button
                        type="button"
                        onClick={() => {
                          const nextIndex = form.items.length;
                          setForm((current) => ({
                            ...current,
                            items: [...current.items, { type: "part", code: "", description: "", quantity: 1, unitPrice: 0, taxCode: "", taxRate: 0 }],
                          }));
                          setActiveEditingIndex(nextIndex);
                          setTimeout(() => {
                            const itemEl = document.getElementById(`quotation-item-${nextIndex}`);
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
                      const upperCode = (item.code || "").trim().toUpperCase();
                      const upperDesc = (item.description || "").trim().toUpperCase();
                      const selectedPart = item.type === "part"
                        ? (catalogBySku.get(item.code) || catalogParts.find((p) => {
                            const pSku = (p.sku || "").trim().toUpperCase();
                            const pName = (p.name || "").trim().toUpperCase();
                            return (upperCode && pSku === upperCode) || (upperDesc && pName === upperDesc);
                          }))
                        : undefined;
                      const stockOnHand = Number(selectedPart?.stock || 0);
                      const requiredQuantity = Number(item.quantity || 0);
                      const shortage = Math.max(0, requiredQuantity - stockOnHand);
                      const isEditing = activeEditingIndex === index;

                      return (
                        <div
                          id={`quotation-item-${index}`}
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
                            <div className="w-24 shrink-0">
                              <AdminSelect
                                disabled={!isEditable}
                                value={item.type}
                                onChange={(event) => {
                                  const newType = event.target.value as QuotationItem["type"];
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
                              disabled={!isEditable}
                              services={documentSettings?.serviceTypes || []}
                              parts={catalogParts}
                              onSelect={(selection) =>
                                updateItem(index, {
                                  serviceTypeId: selection.serviceTypeId,
                                  code: selection.code,
                                  description: selection.description,
                                  quantity: 1,
                                  unitPrice: selection.unitPrice,
                                  taxCode: selection.taxCode,
                                  taxRate: catalogueTaxRate(selection.taxCode, Number(item.taxRate || 0)),
                                })
                              }
                            />

                            {isEditable && form.items.length > 1 ? (
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
                              disabled={!isEditable}
                              value={item.code}
                              onChange={(event) => updateItem(index, { code: event.target.value })}
                              placeholder="Code"
                              className="h-9 rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 text-xs font-mono uppercase focus:bg-white focus:border-blue-500 focus:outline-none"
                            />
                            <input
                              disabled={!isEditable}
                              value={item.description}
                              onChange={(event) => updateItem(index, { description: event.target.value })}
                              placeholder="Description / notes..."
                              className="h-9 rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 text-xs focus:bg-white focus:border-blue-500 focus:outline-none"
                            />
                          </div>

                          {/* Row 3: Compact Stock Indicator (if Part) */}
                          {item.type === "part" && item.code ? (
                            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] border border-slate-100">
                              <div className="flex items-center gap-3 text-slate-600">
                                <span>Stock: <strong className="font-semibold text-slate-800">{selectedPart ? stockOnHand.toLocaleString() : "Unlinked"}</strong></span>
                                <span className="text-slate-300">·</span>
                                <span>Req: <strong className="font-semibold text-slate-800">{requiredQuantity.toLocaleString()}</strong></span>
                              </div>
                              <div>
                                {selectedPart ? (
                                  shortage > 0 ? (
                                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                                      Shortage: {shortage.toLocaleString()}
                                    </span>
                                  ) : (
                                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                                      In Stock
                                    </span>
                                  )
                                ) : (
                                  <span className="text-[10px] text-slate-400">Custom Part</span>
                                )}
                              </div>
                            </div>
                          ) : null}

                          {/* Row 4: Qty, Unit Price, Tax, Amount */}
                          <div className="grid grid-cols-[96px_1fr_110px_1fr] gap-2 items-end">
                            <div>
                              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Qty</span>
                              <input
                                type="number"
                                min="1"
                                step="1"
                                disabled={!isEditable}
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
                                disabled={!isEditable}
                                value={item.unitPrice}
                                onChange={(event) => updateItem(index, { unitPrice: Number(event.target.value) })}
                                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 text-xs focus:bg-white focus:border-blue-500 focus:outline-none"
                              />
                            </div>
                            <div>
                              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Tax (%)</span>
                              <TaxRateInput
                                disabled={!isEditable}
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

                {/* Notes & Terms Card */}
                <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Customer Notes</label>
                    <textarea
                      disabled={!isEditable}
                      rows={2}
                      value={form.notes}
                      onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                      placeholder="Notes visible to customer..."
                      className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 text-xs focus:bg-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Terms & Conditions</label>
                    <textarea
                      disabled={!isEditable}
                      rows={2}
                      value={form.terms}
                      onChange={(event) => setForm((current) => ({ ...current, terms: event.target.value }))}
                      placeholder="Quotation terms..."
                      className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 text-xs focus:bg-white focus:border-blue-500 focus:outline-none leading-relaxed"
                    />
                  </div>
                </div>

                {quotation?.customerResponseNote ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <p className="text-[10px] font-extrabold uppercase tracking-wide text-amber-700">Customer response</p>
                    <p className="mt-1 text-xs text-amber-900">{quotation.customerResponseNote}</p>
                  </div>
                ) : null}

              </div>
            </aside>

            {/* Document Stage */}
            <main className="quotation-stage maw-editor-scroll h-full overflow-auto bg-slate-200/80 p-6 sm:p-8 flex justify-center items-start">
              <article
                id="quotation-document"
                style={{ width: "210mm", minHeight: "297mm" }}
                className="a4-sheet mx-auto shrink-0 bg-white p-10 text-[11px] text-slate-900 shadow-2xl rounded-xs border border-slate-200/80 flex flex-col justify-between"
              >
                <div>
                  <header className="grid grid-cols-[250px_minmax(0,1fr)] items-center border-b-2 border-slate-800 pb-4">
                    <div className="flex h-28 w-60 items-center justify-center overflow-hidden">
                      <img src={logo} alt="Mewah AutoWorks" className="h-28 w-60 scale-[1.55] object-contain" />
                    </div>
                    <div className="text-center leading-tight">
                      <h1 className="text-xl font-black">{documentSettings.company?.legalName || "MEWAH AUTOWORKS SDN BHD"}</h1>
                      <p>({documentSettings.company?.registrationNo})</p>
                      <p>({documentSettings.company?.groupName})</p>
                      <p>{documentSettings.company?.address}</p>
                      <p>Tel: {documentSettings.company?.phone} · {documentSettings.company?.email}</p>
                    </div>
                  </header>

                  <div className="mt-5 grid grid-cols-2 gap-6">
                    <section className="min-h-40 border border-slate-700 p-3">
                      <p className="text-[9px] font-bold text-slate-500">{form.debtorCode || "CUSTOMER"}</p>
                      {workOrder.companyName && workOrder.companyName.trim() !== "-" && workOrder.companyName.trim().toLowerCase() !== "cash customer" ? (
                        <>
                          <p className="font-black text-sm">{workOrder.companyName}</p>
                          {form.debtorAddress ? <p className="mt-1 text-[10px] text-slate-600 leading-relaxed">{form.debtorAddress}</p> : null}
                        </>
                      ) : (
                        <>
                          <p className="font-black text-sm">{workOrder.contactName || "Cash Customer"}</p>
                          {workOrder.customerPhone && workOrder.customerPhone !== "-" ? (
                            <p>{workOrder.customerPhone}</p>
                          ) : null}
                          {form.debtorAddress ? <p className="mt-1 text-[10px] text-slate-600 leading-relaxed">{form.debtorAddress}</p> : null}
                        </>
                      )}
                    </section>
                    <section>
                      <h2 className="mb-2 text-center text-2xl font-black tracking-wide">QUOTATION</h2>
                      <dl className="grid grid-cols-[100px_10px_1fr] gap-y-1">
                        <dt className="font-bold">No.</dt><dd>:</dd><dd>{shownNo}</dd>
                        <dt className="font-bold">Revision</dt><dd>:</dd><dd>{quotation?.revision || 1}</dd>
                        <dt className="font-bold">Date</dt><dd>:</dd><dd>{displayDate(quotation?.createdAt || form.date)}</dd>
                        <dt className="font-bold">Valid Until</dt><dd>:</dd><dd>{displayDate(form.validUntil)}</dd>
                        <dt className="font-bold">Job No.</dt><dd>:</dd><dd>{workOrder.workOrderNo}</dd>
                        <dt className="font-bold">Vehicle Type</dt><dd>:</dd><dd>{form.vehicleType}</dd>
                        <dt className="font-bold">Vehicle No.</dt><dd>:</dd><dd>{form.vehicleNo}</dd>
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
                            <p className="text-[8px] uppercase text-slate-500">{item.type} · {item.taxCode || (Number(item.taxRate || 0) > 0 ? `SV-${item.taxRate}` : "@0%")}</p>
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
                      <dt className="font-bold">Sub Total</dt><dd>{money(totals.subtotal)}</dd>
                      <dt>Discount</dt><dd>{money(totals.discount)}</dd>
                      <dt>Service Tax</dt><dd>{money(totals.taxAmount)}</dd>
                      <dt className="border-t border-slate-800 pt-2 text-sm font-black">Total (RM)</dt>
                      <dd className="border-t border-slate-800 pt-2 text-sm font-black">{money(totals.total)}</dd>
                    </dl>
                  </div>

                  <div className="mt-5 border-t border-slate-400 pt-3">
                    <p className="font-black">Terms &amp; Conditions:</p>
                    <p className="mt-1 whitespace-pre-wrap">{form.terms}</p>
                  </div>
                  <p className="mt-8 text-center text-xs font-bold text-slate-500">This is a computer generated quotation, no signature required.</p>
                </div>
              </article>
            </main>
          </div>
        )}
      </div>

      {/* Assign Bay & ETA Modal before starting repair */}
      {assignModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-100">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-slate-200 animate-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-200">
                  <Wrench className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Assign Repair Bay &amp; Target Handover (ETA)</h3>
                  <p className="text-xs text-slate-500">Required before entering Under Repair status</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAssignModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
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
                      onClick={() => setAssignBay(b)}
                      className={`rounded-xl border py-2.5 px-2 text-center text-xs font-bold transition-all cursor-pointer ${
                        assignBay === b
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
                <label className="block text-xs font-bold text-slate-700">
                  Expected Handover (ETA) <span className="text-rose-500">*</span>
                </label>
                <DesktopDateTimePicker
                  value={assignEta}
                  onChange={setAssignEta}
                  className="w-full"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={saving}
                onClick={() => setAssignModalOpen(false)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || !assignBay || !assignEta}
                onClick={() => void confirmAndProceedToRepair()}
                className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                <CheckCircle2 className="h-4 w-4" />
                {saving ? "Authorizing..." : "Confirm & Start Repair"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
