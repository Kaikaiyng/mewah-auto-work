import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Check,
  CheckSquare,
  ClipboardList,
  Database,
  Download,
  Edit,
  ExternalLink,
  Eye,
  FilePlus2,
  FileText,
  Filter,
  RefreshCw,
  RotateCw,
  RotateCcw,
  Search,
  Send,
  Square,
  X,
} from "lucide-react";
import { apiRequest, postApi } from "../lib/api";
import { useApiData } from "../lib/use-api-data";
import { hasAdminPermission } from "../lib/admin-permissions";
import { toast } from "sonner";
import { WorkOrderInvoiceDialog, type InvoiceWorkOrder, type WorkOrderInvoice } from "./work-order-invoice-dialog";
import { AutoCountInvoiceDialog, type AutoCountInvoiceRecord } from "./autocount-invoice-dialog";
import { AdminSelect } from "./ui/admin-select";
import { AutoCountSyncBadge } from "./autocount-sync-badge";
import { useConfirmationDialog } from "../contexts/confirmation-dialog-context";
import { DesktopDatePicker } from "./ui/desktop-date-picker";
import { PageLoading } from "./ui/page-loading";

import { AdminPagination } from "./ui/admin-pagination";
import { SortableHeader, useSortState, compareValues } from "./ui/sortable-header";

type InvoiceCandidate = InvoiceWorkOrder & {
  orderType?: "work_order" | "parts_order";
  partsOrderId?: string;
};

type InvoiceRecord = Omit<WorkOrderInvoice, "id" | "status" | "storedStatus"> & AutoCountInvoiceRecord & {
  id: number | string;
  status: WorkOrderInvoice["status"] | "expired";
  storedStatus: WorkOrderInvoice["storedStatus"] | "expired";
  source?: "autocount" | "maw" | "maw_legacy" | "parts_order";
  orderType?: "work_order" | "parts_order";
  summaryOnly?: boolean;
  workOrder: InvoiceWorkOrder;
  customerName?: string;
  debtorName?: string;
  companyId?: string | number | null;
  docAmount?: number;
};

function money(value: number) {
  return Number(value || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatInvoiceDate(value?: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function badge(status: string) {
  if (status === "paid") return "bg-emerald-100 text-emerald-700";
  if (status === "overdue" || status === "void" || status === "expired") return "bg-rose-100 text-rose-700";
  if (status === "partially_paid") return "bg-amber-100 text-amber-700";
  if (status === "pending_sync") return "bg-amber-100 text-amber-700";
  if (status === "issued") return "bg-blue-100 text-blue-700";
  return "bg-slate-100 text-slate-600";
}

type TabType = "all" | "issued" | "pending_sync" | "sync_failed" | "synced" | "void";

const invoiceTabs = new Set<TabType>(["all", "issued", "pending_sync", "sync_failed", "synced", "void"]);

function isPendingSyncRecord(invoice: InvoiceRecord) {
  return ["queued", "pending", "processing", "failed"].includes(invoice.syncStatus || "") || invoice.status === "pending_sync";
}

export type UnifiedInvoiceStatus = "void" | "draft" | "sync_failed" | "pending_sync" | "synced" | "issued";

function getUnifiedInvoiceStatus(invoice: InvoiceRecord): UnifiedInvoiceStatus {
  if (invoice.storedStatus === "void" || invoice.status === "void") return "void";
  if (invoice.storedStatus === "draft" || invoice.status === "draft") return "draft";
  if (invoice.syncStatus === "failed") return "sync_failed";
  if (isPendingSyncRecord(invoice)) return "pending_sync";
  if (invoice.syncStatus === "synced" || invoice.source === "autocount") return "synced";
  return "issued";
}

export function Invoices() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const canManage = hasAdminPermission("invoice.update");
  const confirmAction = useConfirmationDialog();
  const { data: invoices, isLoading, error, reload, hasLoaded } = useApiData<InvoiceRecord[]>("admin-invoices", []);
  const salesInvoices = useMemo(
    () => invoices.filter((invoice) =>
      invoice.docType !== "DO" &&
      invoice.source !== "parts_order" &&
      invoice.orderType !== "parts_order"
    ),
    [invoices],
  );
  const [search, setSearch] = useState(() => searchParams.get("search") || searchParams.get("invoiceNo") || "");
  useEffect(() => {
    const urlSearch = searchParams.get("search") || searchParams.get("invoiceNo");
    if (urlSearch !== null) {
      setSearch(urlSearch);
    }
  }, [searchParams]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const requestedView = searchParams.get("view") as TabType | null;
  const activeTab: TabType = requestedView && invoiceTabs.has(requestedView) ? requestedView : "all";
  const isSyncQueueView = activeTab === "pending_sync" || activeTab === "sync_failed";
  const [status, setStatus] = useState("all");
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<InvoiceWorkOrder | null>(null);
  const [candidateOpen, setCandidateOpen] = useState(false);
  const [creationMode, setCreationMode] = useState(false);
  const [candidates, setCandidates] = useState<InvoiceCandidate[]>([]);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number | string>>(new Set());
  const [isBatchSyncing, setIsBatchSyncing] = useState(false);
  const pendingDocuments = useMemo(() => {
    return salesInvoices.filter((invoice) =>
      isPendingSyncRecord(invoice) && invoice.status !== "void" && invoice.storedStatus !== "void"
    );
  }, [salesInvoices]);
  const pendingCount = pendingDocuments.length;

  const counts = useMemo(() => {
    return {
      all: salesInvoices.length,
      issued: salesInvoices.filter((i) => i.storedStatus !== "void" && i.status !== "void").length,
      synced: salesInvoices.filter((i) => i.syncStatus === "synced" || i.source === "autocount").length,
      failed: pendingDocuments.filter((invoice) => invoice.syncStatus === "failed").length,
      void: salesInvoices.filter((i) => i.storedStatus === "void" || i.status === "void").length,
      pendingWorkOrders: pendingDocuments.length,
    };
  }, [salesInvoices, pendingDocuments]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return salesInvoices.filter((invoice) => {
      // Tab filter
      if (activeTab === "issued" && (invoice.storedStatus === "void" || invoice.status === "void")) return false;
      if (activeTab === "pending_sync" && !isPendingSyncRecord(invoice)) return false;
      if (activeTab === "sync_failed" && invoice.syncStatus !== "failed") return false;
      if (activeTab === "synced" && invoice.syncStatus !== "synced" && invoice.source !== "autocount") return false;
      if (activeTab === "void" && invoice.storedStatus !== "void" && invoice.status !== "void") return false;
      if (isSyncQueueView && (invoice.status === "void" || invoice.storedStatus === "void")) return false;

      // Date range filter
      if (startDate && invoice.invoiceDate && invoice.invoiceDate < startDate) return false;
      if (endDate && invoice.invoiceDate && invoice.invoiceDate > endDate) return false;

      // Status dropdown filter
      const unified = getUnifiedInvoiceStatus(invoice);
      const matchesStatus = isSyncQueueView
        ? status === "all" || status === "work_orders"
        : status === "all" ||
          unified === status ||
          invoice.status === status ||
          invoice.storedStatus === status;
      // Search query
      const matchesSearch =
        !query ||
        [
          invoice.invoiceNo,
          invoice.autocountInvoiceNo,
          invoice.workOrder?.workOrderNo,
          invoice.workOrder?.companyName,
          invoice.workOrder?.vehicleNo,
          invoice.autocountJobNo,
        ].some((value) => String(value || "").toLowerCase().includes(query));

      return matchesStatus && matchesSearch;
    });
  }, [salesInvoices, search, status, activeTab, isSyncQueueView, startDate, endDate]);

  const { sortKey, sortDirection, handleSort, setSortKey } = useSortState(null, "desc");

  const sortedAndFiltered = useMemo(() => {
    if (!sortKey) return filtered;

    return [...filtered].sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";

      switch (sortKey) {
        case "invoiceNo":
          aVal = a.invoiceNo || "";
          bVal = b.invoiceNo || "";
          break;
        case "workOrderNo":
        case "jobNo":
          aVal = a.workOrder?.workOrderNo || a.autocountJobNo || "";
          bVal = b.workOrder?.workOrderNo || b.autocountJobNo || "";
          break;
        case "customer":
        case "billTo":
          aVal = a.customerName || a.debtorName || a.workOrder?.companyName || "";
          bVal = b.customerName || b.debtorName || b.workOrder?.companyName || "";
          break;
        case "vehicle":
          aVal = a.vehicleNoRaw || a.vehicleNo || a.workOrder?.vehicleNo || "";
          bVal = b.vehicleNoRaw || b.vehicleNo || b.workOrder?.vehicleNo || "";
          break;
        case "invoiceDate":
          aVal = a.invoiceDate || "";
          bVal = b.invoiceDate || "";
          break;
        case "dueDate":
          aVal = a.dueDate || "";
          bVal = b.dueDate || "";
          break;
        case "amount":
          aVal = Number(a.total ?? a.docAmount ?? 0);
          bVal = Number(b.total ?? b.docAmount ?? 0);
          break;
        case "status":
        case "paymentStatus":
        case "storedStatus":
        case "syncStatus":
          aVal = getUnifiedInvoiceStatus(a);
          bVal = getUnifiedInvoiceStatus(b);
          break;
        default:
          return 0;
      }
      return compareValues(aVal, bVal, sortDirection);
    });
  }, [filtered, sortKey, sortDirection]);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const totalPages = Math.max(1, Math.ceil(sortedAndFiltered.length / pageSize));
  const paginatedInvoices = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedAndFiltered.slice(start, start + pageSize);
  }, [sortedAndFiltered, page, pageSize]);

  const isInvoiceSyncable = (invoice: InvoiceRecord) => {
    if (invoice.source === "autocount" || invoice.syncStatus === "synced") return false;
    if (["paid", "void"].includes(invoice.storedStatus) || ["paid", "void"].includes(invoice.status)) return false;
    return true;
  };

  const syncableInFiltered = useMemo(() => {
    return filtered.filter(isInvoiceSyncable);
  }, [filtered]);

  const isAllSyncableSelected =
    syncableInFiltered.length > 0 &&
    syncableInFiltered.every((i) => selectedIds.has(i.id));

  const toggleSelect = (invoice: InvoiceRecord) => {
    if (!isInvoiceSyncable(invoice)) {
      if (invoice.syncStatus === "synced") {
        toast.info("This invoice is already synced to AutoCount.");
      } else if (invoice.storedStatus === "void" || invoice.status === "void") {
        toast.info("Void invoices cannot be synced.");
      }
      return;
    }
    const next = new Set(selectedIds);
    if (next.has(invoice.id)) {
      next.delete(invoice.id);
    } else {
      next.add(invoice.id);
    }
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (syncableInFiltered.length === 0) {
      toast.info("No syncable invoices available in this view.");
      return;
    }
    if (isAllSyncableSelected) {
      setSelectedIds(new Set());
    } else {
      const next = new Set(selectedIds);
      syncableInFiltered.forEach((i) => next.add(i.id));
      setSelectedIds(next);
    }
  };

  const handleBatchQueueSync = async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    const confirmed = await confirmAction({
      title: `${isSyncQueueView ? "Sync" : "Queue"} ${count} Invoice(s) to AutoCount?`,
      description: isSyncQueueView
        ? `This will trigger AutoCount synchronization for ${count} selected document(s).`
        : `This will move ${count} selected invoice(s) to the Pending Sync queue.`,
      confirmLabel: isSyncQueueView ? "Sync to AutoCount" : "Queue Sync",
      tone: "primary",
    });
    if (!confirmed) return;

    setIsBatchSyncing(true);
    try {
      const idsArray = Array.from(selectedIds);
      await postApi("admin-batch-retry-autocount-invoice-sync", { invoiceIds: idsArray });
      toast.success(`${idsArray.length} invoice(s) ${isSyncQueueView ? "sent to" : "queued for"} AutoCount sync.`);
      setSelectedIds(new Set());
      await reload();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Failed to queue invoices for sync.");
    } finally {
      setIsBatchSyncing(false);
    }
  };

  const isInvoiceEditable = (invoice: InvoiceRecord) => {
    if (!canManage) return false;
    if (invoice.source === "autocount" || invoice.syncStatus === "synced") return false;
    if (invoice.storedStatus === "void" || invoice.status === "void") return false;
    return true;
  };

  const openInvoiceDetail = (invoice: InvoiceRecord) => {
    if (invoice.workOrder && invoice.workOrder.id > 0) {
      setSelectedWorkOrder(invoice.workOrder);
    } else {
      setSelectedWorkOrder(invoice.workOrder || {
        id: typeof invoice.workOrderId === "number" && invoice.workOrderId > 0 ? invoice.workOrderId : (typeof invoice.id === "number" ? invoice.id : 0),
        workOrderNo: invoice.autocountJobNo || invoice.invoiceNo,
        canonicalStatus: "collected",
        companyId: 0,
        companyName: invoice.customerName || invoice.debtorName || "Customer",
        contactName: "",
        customerPhone: "",
        vehicleId: 0,
        vehicleNo: invoice.vehicleNo || invoice.vehicleNoRaw || "-",
        brand: "",
        model: "",
        equipmentType: "",
        serviceType: "Workshop Service",
        serviceCentre: "Mewah AutoWorks",
      });
    }
  };

  const filteredCandidates = useMemo(() => {
    const query = candidateSearch.trim().toLowerCase();
    if (!query) return candidates;
    return candidates.filter((c) =>
      [c.workOrderNo, c.companyName, c.vehicleNo, c.quotationNo || "", c.canonicalStatus]
        .some((v) => String(v || "").toLowerCase().includes(query))
    );
  }, [candidates, candidateSearch]);

  const openCreate = async () => {
    setCreationMode(true);
    setCandidateOpen(true);
    setCandidateLoading(true);
    try {
      const invoiceCandidates = await apiRequest<InvoiceCandidate[]>("admin-invoice-work-orders");
      setCandidates(invoiceCandidates.filter((candidate) => candidate.orderType !== "parts_order"));
    } catch (caught) {
      setCandidateOpen(false);
      setCreationMode(false);
      toast.error(caught instanceof Error ? caught.message : "Unable to load invoice-ready work orders.");
    } finally {
      setCandidateLoading(false);
    }
  };

  // In-Page View: View / Edit Work Order Invoice
  if (selectedWorkOrder) {
    return (
      <WorkOrderInvoiceDialog
        workOrder={selectedWorkOrder}
        backLabel={creationMode ? "Back to Select Work Order" : "Back to Invoices"}
        onClose={() => {
          setSelectedWorkOrder(null);
          if (creationMode) {
            setCandidateOpen(true);
          }
        }}
        onChanged={async () => {
          setCreationMode(false);
          await reload();
        }}
      />
    );
  }



  // In-Page View: Candidate Work Orders (Step 1 of Create Invoice)
  if (candidateOpen) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setCandidateOpen(false);
                setCreationMode(false);
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Invoices
            </button>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900">Select Work Order to Invoice</h1>
              <p className="text-xs text-slate-500">
                Choose a completed or approved repair to generate a billing invoice
              </p>
            </div>
          </div>
        </div>

        <div className="maw-search-field">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            value={candidateSearch}
            onChange={(e) => setCandidateSearch(e.target.value)}
            placeholder="Search candidate by WO#, company, vehicle or quotation..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
          />
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {candidateLoading ? (
            <div className="p-12 text-center text-sm text-slate-500">Loading work orders...</div>
          ) : filteredCandidates.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">
              No invoice-ready work orders available.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredCandidates.map((c) => (
                <div
                  key={c.partsOrderId || c.workOrderNo || c.id}
                  onClick={() => {
                    setCandidateOpen(false);
                    setSelectedWorkOrder(c);
                  }}
                  className="flex flex-wrap items-center justify-between gap-4 p-4 hover:bg-blue-50/50 cursor-pointer transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-blue-900">{c.workOrderNo}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 uppercase">
                        {c.canonicalStatus}
                      </span>
                      {c.quotationNo ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                          {c.quotationNo}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs font-semibold text-slate-700 mt-1">{c.companyName} · {c.vehicleNo}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{c.serviceType || "General Service"}</p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#1e3a8a] px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-800 cursor-pointer"
                  >
                    <FilePlus2 className="h-3.5 w-3.5" />
                    Generate Invoice
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }



  const tabItems: { id: TabType; label: string; count: number; badgeColor?: string }[] = [
    { id: "all", label: "All", count: counts.all },
    { id: "issued", label: "Issued", count: counts.issued },
    { id: "pending_sync", label: "Pending Sync", count: pendingCount, badgeColor: "bg-amber-100 text-amber-800" },
    { id: "sync_failed", label: "Sync Failed", count: counts.failed, badgeColor: counts.failed > 0 ? "bg-rose-100 text-rose-700" : undefined },
    { id: "synced", label: "Synced", count: counts.synced, badgeColor: "bg-emerald-100 text-emerald-800" },
    { id: "void", label: "Void", count: counts.void, badgeColor: counts.void > 0 ? "bg-rose-100 text-rose-700" : undefined },
  ];

  const selectInvoiceView = (tab: TabType) => {
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

  if (isLoading && !hasLoaded) {
    return (
      <PageLoading
        title="Loading Invoices..."
        description="Retrieving invoice records and AutoCount sync queue..."
      />
    );
  }

  // Default Invoices Table View
  return (
    <div className="w-full space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Invoice Management</h1>
            <AutoCountSyncBadge
              label="AutoCount Billing Active"
              onRefresh={() => void reload()}
              isRefreshing={isLoading}
            />
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Create and manage work order invoices, then queue and sync to AutoCount ERP
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
              <FilePlus2 className="h-4 w-4" />
              Create Invoice
            </button>
          ) : null}
        </div>
      </div>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">{error}</div> : null}



      {/* Unified Filter & Tabs Card (matching Vehicles / Work Orders / Bookings design) */}
      <div className="relative z-20 rounded-2xl border border-slate-200 bg-white shadow-2xs">
        {/* Top: Status Tabs */}
        <div className="flex items-center gap-6 sm:gap-8 border-b border-slate-100 px-6 pt-3.5 overflow-x-auto no-scrollbar">
          {tabItems.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => selectInvoiceView(tab.id)}
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
        <div className="grid grid-cols-1 gap-3 px-6 py-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-[1.5fr_1fr_1fr_1.2fr_auto]">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search invoice #, job #, company, vehicle..."
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
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
              placeholder="Invoice from"
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
              placeholder="Invoice to"
              ariaLabel="Filter to date"
              allowPastDates
              className="h-10 text-xs w-full bg-white rounded-xl border-slate-200"
            />
          </div>

          {/* Status Select */}
          <div>
            <AdminSelect
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              placement="bottom"
              className="h-10 w-full text-xs"
              aria-label="Filter invoice status"
            >
              {(isSyncQueueView
                ? [
                    ["all", "All pending invoices"],
                    ["work_orders", "Work Order Invoices"],
                  ]
                : [
                    ["all", "All statuses"],
                    ["synced", "Synced"],
                    ["pending_sync", "Pending Sync"],
                    ["sync_failed", "Sync Failed"],
                    ["issued", "Issued"],
                    ["draft", "Draft"],
                    ["void", "Void"],
                  ]
              ).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </AdminSelect>
          </div>

          {/* Reset button */}
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

      {/* Invoices Table */}
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
                <SortableHeader columnKey="invoiceNo" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleSort} className="px-4 py-3.5 text-left">
                  Invoice No
                </SortableHeader>
                <SortableHeader columnKey="workOrderNo" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleSort} className="px-4 py-3.5 text-left">
                  Work Order
                </SortableHeader>
                <SortableHeader columnKey="customer" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleSort} className="px-4 py-3.5 text-left">
                  Customer / Company
                </SortableHeader>
                <SortableHeader columnKey="vehicle" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleSort} className="px-4 py-3.5 text-left">
                  Vehicle
                </SortableHeader>
                <SortableHeader columnKey="invoiceDate" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleSort} className="px-4 py-3.5 text-left">
                  Invoice Date
                </SortableHeader>
                <SortableHeader columnKey="amount" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleSort} align="right" className="px-4 py-3.5 text-right">
                  Amount (RM)
                </SortableHeader>
                <SortableHeader columnKey="status" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleSort} align="center" className="px-4 py-3.5 text-center">
                  Status
                </SortableHeader>
                <th scope="col" className="px-4 py-3.5 text-right whitespace-nowrap text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="p-12 text-center text-sm text-slate-500">
                    Loading invoices...
                  </td>
                </tr>
              ) : sortedAndFiltered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-12 text-center">
                    <FileText className="mx-auto mb-3 h-9 w-9 text-slate-300" />
                    <p className="text-sm text-slate-500">No invoices found in this view.</p>
                  </td>
                </tr>
              ) : (
                paginatedInvoices.map((invoice) => {
                  const isFailed = invoice.syncStatus === "failed";
                  const isPending = isPendingSyncRecord(invoice);
                  const isSyncable = isInvoiceSyncable(invoice);
                  const isSelected = selectedIds.has(invoice.id);
                  const vehicle = invoice.workOrder?.vehicleNo || invoice.vehicleNo || invoice.vehicleNoRaw;
                  const company = invoice.workOrder?.companyName || invoice.customerName || invoice.debtorName || "Cash Customer";
                  const paymentStatus = invoice.storedStatus || invoice.status;

                  const debtorCode = (invoice.debtorCode || invoice.workOrder?.debtorCode || "").trim();
                  const hasDebtorCode = Boolean(debtorCode && debtorCode !== "" && debtorCode !== "-");
                  const isCashCustomer = company.toLowerCase().includes("cash") || (!invoice.workOrder?.companyId && !hasDebtorCode);

                  const statusType = getUnifiedInvoiceStatus(invoice);

                  return (
                    <tr
                      key={`${invoice.source || "invoice"}-${invoice.id}`}
                      onClick={() => openInvoiceDetail(invoice)}
                      className={`hover:bg-blue-50/40 transition-colors cursor-pointer ${
                        isSelected ? "bg-blue-50/50" : ""
                      }`}
                    >
                      <td className="w-10 px-4 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                        {isSyncable ? (
                          <button
                            type="button"
                            onClick={() => toggleSelect(invoice)}
                            className={`cursor-pointer ${
                              isSelected
                                ? "text-blue-600"
                                : "text-slate-400 hover:text-slate-600"
                            }`}
                            title={
                              isSelected
                                ? "Deselect"
                                : isSyncQueueView
                                ? "Select for AutoCount sync"
                                : "Select for queue sync"
                            }
                          >
                            {isSelected ? (
                              <CheckSquare className="h-4 w-4 text-blue-600" />
                            ) : (
                              <Square className="h-4 w-4" />
                            )}
                          </button>
                        ) : (
                          <span className="inline-block w-4 text-center text-slate-300 text-xs select-none">—</span>
                        )}
                      </td>

                      {/* Invoice No */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="font-extrabold text-slate-900 text-xs">
                          {invoice.autocountInvoiceNo || invoice.invoiceNo || invoice.internalRef}
                        </span>
                        {invoice.autocountInvoiceNo && invoice.invoiceNo && invoice.autocountInvoiceNo !== invoice.invoiceNo ? (
                          <span className="ml-1 text-[10px] text-slate-400 font-normal">({invoice.invoiceNo})</span>
                        ) : null}
                      </td>

                      {/* Work Order / Job No */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {invoice.workOrder?.workOrderNo || invoice.autocountJobNo ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const isHistory = invoice.workOrder?.canonicalStatus === "collected";
                              const woNo = invoice.workOrder?.workOrderNo || invoice.autocountJobNo;
                              const woId = invoice.workOrder?.id || invoice.workOrderId;
                              if (woNo) {
                                navigate(
                                  `/work-orders?wo=${encodeURIComponent(woNo)}${woId ? `&id=${woId}` : ""}${isHistory ? "&view=history" : ""}`
                                );
                              }
                            }}
                            className="font-bold text-slate-900 transition-colors hover:text-blue-600 cursor-pointer text-left"
                            title={`Open Work Order ${invoice.workOrder?.workOrderNo || invoice.autocountJobNo}`}
                          >
                            {invoice.workOrder?.workOrderNo || invoice.autocountJobNo}
                          </button>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                        {invoice.isBackOrder ? (
                          <span className="ml-1.5 inline-flex items-center rounded-md border border-purple-200 bg-purple-50 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700">
                            Back Order
                          </span>
                        ) : null}
                      </td>

                      {/* Customer / Company */}
                      <td className="px-4 py-3.5">
                        {invoice.companyId ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/companies?companyId=${invoice.companyId}`);
                            }}
                            className="text-left font-bold text-slate-900 line-clamp-1 max-w-[240px] transition-colors hover:text-blue-600 cursor-pointer text-xs"
                            title={company}
                          >
                            {company}
                          </button>
                        ) : (
                          <p className="text-xs font-semibold text-slate-800 line-clamp-1 max-w-[240px]" title={company}>
                            {company}
                          </p>
                        )}
                        {hasDebtorCode ? (
                          <div className="mt-0.5 inline-flex items-center gap-1 rounded bg-slate-100 border border-slate-200/80 px-1.5 py-0.5 text-[11px] font-mono font-semibold text-slate-700">
                            <span className="text-[10px] font-sans font-bold text-slate-400">CODE</span>
                            <span>{debtorCode}</span>
                          </div>
                        ) : isCashCustomer ? (
                          <p className="text-[10px] text-slate-400 mt-0.5">Cash Customer</p>
                        ) : (
                          <span className="inline-flex items-center gap-1 mt-0.5 rounded bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                            <span>⚠️</span> No Debtor Code
                          </span>
                        )}
                      </td>

                      {/* Vehicle */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {vehicle && vehicle.trim() !== "-" ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const vehId = invoice.workOrder?.vehicleId || (invoice as any).vehicleId;
                              navigate(
                                `/equipment?${vehId ? `vehicleId=${vehId}` : ""}${vehicle && vehicle !== "-" ? `&plate=${encodeURIComponent(vehicle)}` : ""}`
                              );
                            }}
                            className="font-bold text-slate-900 transition-colors hover:text-blue-600 cursor-pointer text-left"
                            title={`View vehicle details and service history for ${vehicle}`}
                          >
                            {vehicle}
                          </button>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>

                      {/* Invoice Date */}
                      <td className="px-4 py-3.5 text-xs text-slate-600 whitespace-nowrap">
                        {formatInvoiceDate(invoice.invoiceDate)}
                      </td>

                      {/* Invoice Amount & SST */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <p className="text-xs font-bold text-slate-900">
                          RM {money(invoice.total)}
                        </p>
                        {invoice.taxAmount && Number(invoice.taxAmount) > 0 ? (
                          <p className="text-[10px] text-slate-400 font-normal mt-0.5">
                            incl. SST {money(invoice.taxAmount)}
                          </p>
                        ) : null}
                      </td>

                      {/* Unified Status Badge */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        {statusType === "void" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-500">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                            Void
                          </span>
                        ) : statusType === "draft" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-bold text-slate-600">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                            Draft
                          </span>
                        ) : statusType === "sync_failed" ? (
                          <span
                            className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 cursor-pointer"
                            title={invoice.syncError || "Synchronization error, click view for details"}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                            Sync Failed
                          </span>
                        ) : statusType === "pending_sync" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                            Pending Sync
                          </span>
                        ) : statusType === "synced" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Synced
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                            Issued
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openInvoiceDetail(invoice);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 cursor-pointer transition-colors"
                            aria-label={`View ${invoice.invoiceNo}`}
                            title="View Details"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>View</span>
                          </button>
                          {isInvoiceEditable(invoice) ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openInvoiceDetail(invoice);
                              }}
                              className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer transition-colors"
                              aria-label={`Edit ${invoice.invoiceNo}`}
                              title="Edit Invoice"
                            >
                              <Edit className="h-3.5 w-3.5" />
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
          itemLabel="invoices"
        />
      </div>
    </div>
  );
}
