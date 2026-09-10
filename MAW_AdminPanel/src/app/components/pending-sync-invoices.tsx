import { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Check,
  CheckSquare,
  CircleDollarSign,
  Clock3,
  Database,
  Edit,
  Eye,
  FileText,
  RefreshCw,
  RotateCw,
  Search,
  Send,
  Square,
  Truck,
} from "lucide-react";
import { postApi } from "../lib/api";
import { useApiData } from "../lib/use-api-data";
import { hasAdminPermission } from "../lib/admin-permissions";
import { toast } from "sonner";
import { WorkOrderInvoiceDialog, type InvoiceWorkOrder, type WorkOrderInvoice } from "./work-order-invoice-dialog";
import { PartsOrderInvoiceDialog, type PartsOrderData } from "./parts-order-invoice-dialog";
import { AutoCountSyncBadge } from "./autocount-sync-badge";
import { useConfirmationDialog } from "../contexts/confirmation-dialog-context";
import { AdminSelect } from "./ui/admin-select";
import { DesktopDatePicker } from "./ui/desktop-date-picker";
import { AdminMetricCard } from "./ui/admin-metric-card";

interface InvoiceRecord {
  id: number | string;
  orderType?: "work_order" | "parts_order";
  isBackOrder?: boolean;
  source?: string;
  invoiceNo: string;
  internalRef?: string;
  autocountInvoiceNo?: string;
  autocountDoNo?: string;
  autocountJobNo?: string;
  invoiceDate: string;
  dueDate?: string;
  creditTermDays: number;
  total: number;
  balance: number;
  paidAmount?: number;
  status: string;
  storedStatus: string;
  syncStatus?: string;
  syncRequestedAt?: string | null;
  syncedAt?: string | null;
  syncError?: string;
  vehicleNoRaw?: string;
  vehicleNo?: string;
  items?: Array<{
    id?: number;
    description: string;
    quantity: number;
    unitPrice: number;
    amount?: number;
    code?: string;
  }>;
  partsOrder?: PartsOrderData;
  workOrder: InvoiceWorkOrder;
}

type SubTab = "all_pending" | "work_orders" | "parts_orders" | "failed";

interface PendingSyncInvoicesProps {
  embedded?: boolean;
  initialTab?: SubTab;
  onTabChange?: (tab: SubTab) => void;
}

const money = (val: number | string | undefined | null) => {
  const num = Number(val) || 0;
  return num.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export function PendingSyncInvoices({ embedded = false, initialTab = "all_pending", onTabChange }: PendingSyncInvoicesProps) {
  const canManage = hasAdminPermission("invoice.update");
  const confirmAction = useConfirmationDialog();
  const { data: invoices, isLoading, error, reload } = useApiData<InvoiceRecord[]>("admin-invoices", []);
  
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [activeTab, setActiveTab] = useState<SubTab>(initialTab);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<InvoiceWorkOrder | null>(null);
  const [selectedPartsOrder, setSelectedPartsOrder] = useState<PartsOrderData | null>(null);
  const [syncingInvoiceId, setSyncingInvoiceId] = useState<number | string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number | string>>(new Set());
  const [isBatchSyncing, setIsBatchSyncing] = useState(false);

  const selectTab = (tab: SubTab) => {
    setActiveTab(tab);
    onTabChange?.(tab);
  };

  // Filter only documents currently waiting to be synced to AutoCount
  const pendingInvoices = useMemo(() => {
    return invoices.filter((i) => {
      const isQueuedOrPending = ["queued", "pending", "processing"].includes(i.syncStatus || "") || i.status === "pending_sync";
      const isFailed = i.syncStatus === "failed";
      return (isQueuedOrPending || isFailed) && i.status !== "void" && i.storedStatus !== "void";
    });
  }, [invoices]);

  const counts = useMemo(() => {
    return {
      all_pending: pendingInvoices.length,
      work_orders: pendingInvoices.filter((i) => i.source !== "parts_order" && i.orderType !== "parts_order").length,
      parts_orders: pendingInvoices.filter((i) => i.source === "parts_order" || i.orderType === "parts_order").length,
      failed: pendingInvoices.filter((i) => i.syncStatus === "failed").length,
    };
  }, [pendingInvoices]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return pendingInvoices.filter((invoice) => {
      // SubTab filter
      if (activeTab === "work_orders" && (invoice.source === "parts_order" || invoice.orderType === "parts_order")) return false;
      if (activeTab === "parts_orders" && invoice.source !== "parts_order" && invoice.orderType !== "parts_order") return false;
      if (activeTab === "failed" && invoice.syncStatus !== "failed") return false;

      // Date range filter
      if (startDate && invoice.invoiceDate && invoice.invoiceDate < startDate) return false;
      if (endDate && invoice.invoiceDate && invoice.invoiceDate > endDate) return false;

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

      return matchesSearch;
    });
  }, [pendingInvoices, search, activeTab, startDate, endDate]);

  const isAllSelected = filtered.length > 0 && filtered.every((i) => selectedIds.has(i.id));

  const toggleSelect = (id: number | string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      const next = new Set(selectedIds);
      filtered.forEach((i) => next.add(i.id));
      setSelectedIds(next);
    }
  };

  const handleManualSync = async (invoice: InvoiceRecord) => {
    if (!invoice.id) return;
    const docName = invoice.autocountInvoiceNo || invoice.invoiceNo || invoice.internalRef || "this document";
    const company = invoice.workOrder?.companyName || "Customer";
    const confirmed = await confirmAction({
      title: `Sync ${docName} to AutoCount?`,
      description: `This will trigger synchronization for ${docName} (${company}) to AutoCount ERP.`,
      confirmLabel: "Sync to AutoCount",
      tone: "primary",
    });
    if (!confirmed) return;

    setSyncingInvoiceId(invoice.id);
    try {
      if (invoice.source === "parts_order" || invoice.orderType === "parts_order") {
        await postApi("admin-batch-sync-parts-orders", { orderIds: [invoice.autocountJobNo || invoice.id] });
      } else if (invoice.storedStatus === "draft") {
        await postApi("admin-issue-work-order-invoice", { workOrderId: invoice.workOrder.id });
      } else {
        await postApi("admin-retry-autocount-invoice-sync", { invoiceId: invoice.id });
      }
      toast.success(`Document ${docName} sent to AutoCount sync queue.`);
      await reload();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Failed to sync document.");
    } finally {
      setSyncingInvoiceId(null);
    }
  };

  const handleBatchSync = async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    const confirmed = await confirmAction({
      title: `Sync ${count} Document(s) to AutoCount?`,
      description: `This will trigger batch synchronization for ${count} selected document(s) to AutoCount ERP.`,
      confirmLabel: "Sync to AutoCount",
      tone: "primary",
    });
    if (!confirmed) return;

    setIsBatchSyncing(true);
    try {
      const idsArray = Array.from(selectedIds);
      await postApi("admin-batch-retry-autocount-invoice-sync", { invoiceIds: idsArray });
      toast.success(`${idsArray.length} document(s) queued for AutoCount sync.`);
      setSelectedIds(new Set());
      await reload();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Failed to batch sync documents.");
    } finally {
      setIsBatchSyncing(false);
    }
  };

  const openInvoiceDetail = (invoice: InvoiceRecord) => {
    if (invoice.source === "parts_order" || invoice.orderType === "parts_order") {
      setSelectedPartsOrder(invoice.partsOrder || {
        id: invoice.autocountJobNo || String(invoice.invoiceNo),
        customer: invoice.workOrder?.companyName || "Customer",
        items: (invoice.items || []).map((it) => ({
          name: it.description,
          quantity: it.quantity,
          price: it.unitPrice,
          code: it.code,
        })),
        total: invoice.total,
        status: "Processing",
        orderDate: invoice.invoiceDate,
        deliveryAddress: "",
        autocountDoNo: invoice.autocountDoNo || invoice.invoiceNo,
        debtorCode: invoice.workOrder?.debtorCode,
      });
    } else if (invoice.workOrder) {
      setSelectedWorkOrder(invoice.workOrder);
    }
  };

  // In-Page View: Parts Order Invoice Dialog
  if (selectedPartsOrder) {
    return (
      <PartsOrderInvoiceDialog
        order={selectedPartsOrder}
        backLabel={embedded ? "Back to Invoices" : "Back to Pending Sync"}
        onClose={() => setSelectedPartsOrder(null)}
        onChanged={async () => {
          await reload();
        }}
      />
    );
  }

  // In-Page View: Work Order Invoice Dialog
  if (selectedWorkOrder) {
    return (
      <WorkOrderInvoiceDialog
        workOrder={selectedWorkOrder}
        backLabel={embedded ? "Back to Invoices" : "Back to Pending Sync"}
        onClose={() => setSelectedWorkOrder(null)}
        onChanged={async () => {
          await reload();
        }}
      />
    );
  }

  const totalPendingAmount = pendingInvoices.reduce((sum, i) => sum + (Number(i.total) || 0), 0);

  return (
    <div className="space-y-4">
      {/* Standalone header, or compact sync controls when embedded in Invoices. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {embedded ? (
          <div className="flex flex-wrap items-center gap-3">
            <AutoCountSyncBadge
              label="AutoCount Outbox Active"
              onRefresh={() => void reload()}
              isRefreshing={isLoading}
            />
            <p className="text-xs text-slate-500">Invoices and delivery orders queued for AutoCount ERP synchronization.</p>
          </div>
        ) : (
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-extrabold text-slate-900">Pending Sync Invoice</h1>
              <AutoCountSyncBadge
                label="AutoCount Outbox Active"
                onRefresh={() => void reload()}
                isRefreshing={isLoading}
              />
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Invoices and delivery orders queued and waiting for AutoCount ERP synchronization.
            </p>
          </div>
        )}
        {canManage ? (
          <button
            type="button"
            disabled={selectedIds.size === 0 || isBatchSyncing}
            onClick={() => void handleBatchSync()}
            className={`inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-bold shadow-sm transition-all cursor-pointer ${
              selectedIds.size > 0
                ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-700/20"
                : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60"
            }`}
          >
            <Send className="mr-2 h-4 w-4" />
            <span>Sync ({selectedIds.size}) to AutoCount</span>
          </button>
        ) : null}
      </div>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : null}

      {/* KPI Stats Summary */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard label="Total Pending Sync" value={counts.all_pending} detail="Invoices and DOs queued" icon={Clock3} iconClassName="bg-amber-50 text-amber-600" valueClassName="text-amber-600" onClick={() => selectTab("all_pending")} />
        <AdminMetricCard label="Work Order Invoices" value={counts.work_orders} detail="Awaiting invoice sync" icon={FileText} onClick={() => selectTab("work_orders")} />
        <AdminMetricCard label="Parts Order DOs" value={counts.parts_orders} detail="Awaiting delivery order sync" icon={Truck} iconClassName="bg-indigo-50 text-indigo-700" onClick={() => selectTab("parts_orders")} />
        <AdminMetricCard label="Total Pending Amount" value={`RM ${money(totalPendingAmount)}`} detail="Queued value awaiting sync" icon={CircleDollarSign} iconClassName="bg-emerald-50 text-emerald-700" onClick={() => selectTab("all_pending")} />
      </div>

      {/* Sub Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-2">
        {[
          { id: "all_pending", label: "All Pending Sync", count: counts.all_pending },
          { id: "work_orders", label: "Work Orders", count: counts.work_orders },
          { id: "parts_orders", label: "Parts Orders", count: counts.parts_orders },
          { id: "failed", label: "Sync Failed", count: counts.failed, badgeColor: counts.failed > 0 ? "bg-rose-100 text-rose-700 animate-pulse" : undefined },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => selectTab(tab.id as SubTab)}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer ${
                isActive
                  ? "bg-[#1e3a8a] text-white shadow-sm"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                  isActive
                    ? "bg-white/20 text-white"
                    : tab.badgeColor || "bg-slate-100 text-slate-600"
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search and Secondary Filter Bar */}
      <div className="maw-filter-bar">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="maw-search-field">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search invoice #, AutoCount IV, job #..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
          </div>
          <div>
            <DesktopDatePicker
              value={startDate}
              onChange={setStartDate}
              placeholder="Date from"
              ariaLabel="Filter from date"
              allowPastDates
              className="maw-filter-control"
            />
          </div>
          <div>
            <DesktopDatePicker
              value={endDate}
              onChange={setEndDate}
              placeholder="Date to"
              ariaLabel="Filter to date"
              allowPastDates
              className="maw-filter-control"
            />
          </div>
          <div>
            <AdminSelect
              value={activeTab}
              onChange={(e) => selectTab(e.target.value as SubTab)}
              className="w-full"
              aria-label="Filter pending sync type"
            >
              <option value="all_pending">All Pending ({counts.all_pending})</option>
              <option value="work_orders">Work Orders ({counts.work_orders})</option>
              <option value="parts_orders">Parts Orders ({counts.parts_orders})</option>
              <option value="failed">Sync Failed ({counts.failed})</option>
            </AdminSelect>
          </div>
        </div>
      </div>

      {/* Pending Sync Invoices Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm relative">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="w-10 px-4 py-3 text-center">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="text-slate-500 hover:text-slate-700 cursor-pointer"
                    title={isAllSelected ? "Deselect all" : "Select all"}
                  >
                    {isAllSelected ? (
                      <CheckSquare className="h-4 w-4 text-[#1e3a8a]" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                </th>
                {["Invoice No", "Job / Ref No.", "Bill To", "Invoice Date", "Items / Vehicle", "Invoice Amount", "Sync Status", "AutoCount Invoice No"].map((heading) => (
                  <th key={heading} className="px-4 py-3 text-left text-[11px] font-extrabold uppercase tracking-wide text-slate-500">
                    {heading}
                  </th>
                ))}
                <th className="px-4 py-3 text-right whitespace-nowrap text-[11px] font-extrabold uppercase tracking-wide text-slate-500">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="p-12 text-center text-sm text-slate-500">
                    Loading pending sync invoices...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-12 text-center">
                    <FileText className="mx-auto mb-3 h-9 w-9 text-slate-300" />
                    <p className="text-sm font-semibold text-slate-700">No pending sync invoices.</p>
                    <p className="mt-1 text-xs text-slate-400">All invoices are synchronized with AutoCount ERP.</p>
                  </td>
                </tr>
              ) : (
                filtered.map((invoice) => {
                  const isSelected = selectedIds.has(invoice.id);
                  const isFailed = invoice.syncStatus === "failed";
                  return (
                    <tr
                      key={`${invoice.source || "invoice"}-${invoice.id}`}
                      onClick={() => openInvoiceDetail(invoice)}
                      className={`hover:bg-blue-50/40 transition-colors cursor-pointer ${
                        isSelected ? "bg-blue-50/60" : ""
                      }`}
                    >
                      <td className="w-10 px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelect(invoice.id);
                          }}
                          className="text-slate-500 hover:text-slate-700 cursor-pointer"
                        >
                          {isSelected ? (
                            <CheckSquare className="h-4 w-4 text-[#1e3a8a]" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-sm font-extrabold text-slate-900">
                          {invoice.autocountInvoiceNo || invoice.invoiceNo || invoice.internalRef}
                        </p>
                        {invoice.autocountInvoiceNo && invoice.invoiceNo && invoice.autocountInvoiceNo !== invoice.invoiceNo ? (
                          <p className="text-[10px] text-slate-400">Ref: {invoice.invoiceNo}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold uppercase ${
                              invoice.source === "parts_order" || invoice.orderType === "parts_order"
                                ? "border-purple-200 bg-purple-50 text-purple-700"
                                : "border-indigo-200 bg-indigo-50 text-indigo-700"
                            }`}
                          >
                            <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />
                            {invoice.source === "parts_order" || invoice.orderType === "parts_order" ? "Parts DO" : "Work Order"}
                          </span>
                          {invoice.isBackOrder ? (
                            <span className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700 whitespace-nowrap">
                              <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />
                              Back Order
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs font-bold text-blue-700">{invoice.autocountJobNo || invoice.workOrder?.workOrderNo}</p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-sm font-semibold text-slate-800">{invoice.workOrder?.companyName || "Customer"}</p>
                        <p className="text-xs text-slate-500">{invoice.vehicleNoRaw || invoice.vehicleNo || invoice.workOrder?.vehicleNo || "-"}</p>
                      </td>
                      <td className="px-4 py-4 text-xs text-slate-600">
                        <p className="font-semibold">{invoice.invoiceDate}</p>
                        {invoice.dueDate ? (
                          <p className="text-[10px] text-slate-400">Due: {invoice.dueDate}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-4 text-xs text-slate-600">
                        <p className="font-semibold">{invoice.items ? `${invoice.items.length} line items` : "-"}</p>
                      </td>
                      <td className="px-4 py-4 text-sm font-bold text-slate-900">RM {money(invoice.total)}</td>
                      <td className="px-4 py-4">
                        <div>
                          {isFailed ? (
                            <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 whitespace-nowrap">
                              <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />
                              <AlertCircle className="mr-1 h-3.5 w-3.5 inline" /> Sync Failed
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 whitespace-nowrap">
                              <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />
                              Pending Sync
                            </span>
                          )}
                          {isFailed && invoice.syncError ? (
                            <p className="mt-1 max-w-[200px] truncate text-[10px] text-rose-600" title={invoice.syncError}>
                              {invoice.syncError}
                            </p>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-xs font-semibold text-slate-700">
                        <p>{invoice.autocountInvoiceNo || "—"}</p>
                      </td>
                      <td className="px-4 py-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openInvoiceDetail(invoice);
                            }}
                            className="rounded-lg p-1.5 text-blue-700 hover:bg-blue-50 cursor-pointer"
                            aria-label={`View ${invoice.invoiceNo}`}
                            title="View Details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {canManage && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openInvoiceDetail(invoice);
                              }}
                              className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 cursor-pointer"
                              aria-label={`Edit ${invoice.invoiceNo}`}
                              title="Edit Invoice"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-200 bg-slate-50/70 px-5 py-3 text-xs text-slate-500">
          {filtered.length.toLocaleString()} pending sync invoice(s)
        </div>
      </div>
    </div>
  );
}
