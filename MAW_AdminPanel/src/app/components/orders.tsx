import { useState, useMemo } from "react";
import { Search, Eye, X, PackageCheck, Printer, CheckSquare, Square, RefreshCw, ChevronLeft, ArrowLeft, History as HistoryIcon, ListTodo, RotateCcw } from "lucide-react";
import { useApiData } from "../lib/use-api-data";
import { useLanguage } from "../contexts/language-context";
import { toast } from "sonner";
import { PageLoading } from "./ui/page-loading";
import { AdminSelect } from "./ui/admin-select";
import { AdminPagination } from "./ui/admin-pagination";
import { postApi } from "../lib/api";
import { hasAdminPermission } from "../lib/admin-permissions";
import { PartsOrderInvoiceDialog, type PartsOrderData } from "./parts-order-invoice-dialog";
import { AutoCountSyncBadge } from "./autocount-sync-badge";
import { SortableHeader, compareValues } from "./ui/sortable-header";

interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

interface Order {
  id: string;
  customer: string;
  items: OrderItem[];
  total: number;
  status: "Pending" | "Processing" | "Shipped" | "Delivered";
  orderDate: string;
  deliveryAddress: string;
  autocountDoNo?: string;
  autocountSyncStatus?: string;
  autocountSyncAt?: string | null;
}

const statusColors: Record<string, string> = {
  Pending: "border-amber-200 bg-amber-50 text-amber-700",
  Processing: "border-blue-200 bg-blue-50 text-blue-700",
  Shipped: "border-purple-200 bg-purple-50 text-purple-700",
  Delivered: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

export function Orders() {
  const canUpdate = hasAdminPermission("order.update");
  const { t } = useLanguage();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [selectedCustomer, setSelectedCustomer] = useState("All");
  const [selectedSyncStatus, setSelectedSyncStatus] = useState<"All" | "synced" | "pending" | "not_synced">("All");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [printingOrder, setPrintingOrder] = useState<Order | null>(null);
  const [statusModalOrder, setStatusModalOrder] = useState<Order | null>(null);
  const [returnToOrderDetails, setReturnToOrderDetails] = useState(false);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBatchSyncing, setIsBatchSyncing] = useState(false);
  const [recordScope, setRecordScope] = useState<"active" | "history">("active");
  const [sortBy, setSortBy] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const handleHeaderSort = (key: string) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDirection("asc");
      setPage(1);
      if (key === "date") setSortBy("date_asc");
      else if (key === "order") setSortBy("order_asc");
      else if (key === "customer") setSortBy("customer_asc");
      else if (key === "total") setSortBy("total_asc");
      else setSortBy("");
    } else if (sortDirection === "asc") {
      setSortDirection("desc");
      setPage(1);
      if (key === "date") setSortBy("date_desc");
      else if (key === "order") setSortBy("order_desc");
      else if (key === "customer") setSortBy("customer_desc");
      else if (key === "total") setSortBy("total_desc");
      else setSortBy("");
    } else {
      // 3rd click: Reset to default null (no column blue)
      setSortKey(null);
      setSortDirection("desc");
      setSortBy("");
      setPage(1);
    }
  };

  const handleDropdownSort = (val: string) => {
    setSortBy(val);
    setPage(1);
    switch (val) {
      case "date_desc":
        setSortKey("date");
        setSortDirection("desc");
        break;
      case "date_asc":
        setSortKey("date");
        setSortDirection("asc");
        break;
      case "order_asc":
        setSortKey("order");
        setSortDirection("asc");
        break;
      case "order_desc":
        setSortKey("order");
        setSortDirection("desc");
        break;
      case "customer_asc":
        setSortKey("customer");
        setSortDirection("asc");
        break;
      case "customer_desc":
        setSortKey("customer");
        setSortDirection("desc");
        break;
      case "total_desc":
        setSortKey("total");
        setSortDirection("desc");
        break;
      case "total_asc":
        setSortKey("total");
        setSortDirection("asc");
        break;
    }
  };

  // API Integration
  const {
    data: orders,
    isLoading,
    error,
    reload,
    hasLoaded,
  } = useApiData<Order[]>("admin-orders", []);

  const customers = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((o) => {
      const name = (o.customer || "").trim();
      if (name && name !== "-") set.add(name);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [orders]);

  const activeCount = useMemo(() => orders.filter((order) => order.status !== "Delivered").length, [orders]);
  const historyCount = orders.length - activeCount;

  const activeStatusCounts = useMemo(() => {
    const activeOrders = orders.filter((o) => o.status !== "Delivered");
    return {
      all: activeOrders.length,
      pending: activeOrders.filter((o) => o.status === "Pending").length,
      processing: activeOrders.filter((o) => o.status === "Processing").length,
      shipped: activeOrders.filter((o) => o.status === "Shipped").length,
    };
  }, [orders]);

  const statusTabs = useMemo(() => {
    if (recordScope === "history") {
      return [
        { id: "All", label: "Delivered (History)", count: historyCount },
      ];
    }
    return [
      { id: "All", label: "All Active", count: activeStatusCounts.all },
      { id: "Pending", label: "Pending", count: activeStatusCounts.pending },
      { id: "Processing", label: "Processing", count: activeStatusCounts.processing },
      { id: "Shipped", label: "Shipped", count: activeStatusCounts.shipped },
    ];
  }, [recordScope, historyCount, activeStatusCounts]);

  const filteredOrders = useMemo(() => {
    const scoped = orders.filter((order) => {
      const matchesScope = recordScope === "history" ? order.status === "Delivered" : order.status !== "Delivered";
      const matchesSearch =
        order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(order.deliveryAddress || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(order.autocountDoNo || "").toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus =
        selectedStatus === "All" || order.status === selectedStatus;
      const matchesCustomer =
        selectedCustomer === "All" || order.customer === selectedCustomer;
      const isSynced = Boolean(order.autocountDoNo) || order.autocountSyncStatus === "synced";
      const isPendingSync = order.autocountSyncStatus === "pending" || order.autocountSyncStatus === "processing";
      const matchesSync =
        selectedSyncStatus === "All" ||
        (selectedSyncStatus === "synced" && isSynced) ||
        (selectedSyncStatus === "pending" && isPendingSync) ||
        (selectedSyncStatus === "not_synced" && !isSynced && !isPendingSync);

      return matchesScope && matchesSearch && matchesStatus && matchesCustomer && matchesSync;
    });

    return [...scoped].sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";
      switch (sortKey) {
        case "order":
          aVal = a.id;
          bVal = b.id;
          break;
        case "autocount":
          aVal = a.autocountDoNo || (a.autocountSyncStatus === "pending" || a.autocountSyncStatus === "processing" ? "Syncing..." : "");
          bVal = b.autocountDoNo || (b.autocountSyncStatus === "pending" || b.autocountSyncStatus === "processing" ? "Syncing..." : "");
          break;
        case "customer":
          aVal = a.customer;
          bVal = b.customer;
          break;
        case "items":
          aVal = a.items.reduce((sum, item) => sum + item.quantity, 0);
          bVal = b.items.reduce((sum, item) => sum + item.quantity, 0);
          break;
        case "date":
          aVal = a.orderDate || "";
          bVal = b.orderDate || "";
          break;
        case "total":
          aVal = a.total;
          bVal = b.total;
          break;
        case "status":
          aVal = a.status;
          bVal = b.status;
          break;
        default:
          return 0;
      }
      return compareValues(aVal, bVal, sortDirection);
    });
  }, [orders, recordScope, searchTerm, selectedStatus, selectedCustomer, selectedSyncStatus, sortKey, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleOrders = filteredOrders.slice((safePage - 1) * pageSize, safePage * pageSize);

  const changeRecordScope = (scope: "active" | "history") => {
    setRecordScope(scope);
    setSelectedStatus("All");
    setSelectedIds(new Set());
    setPage(1);
  };

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedStatus("All");
    setSelectedCustomer("All");
    setSelectedSyncStatus("All");
    setSortBy("");
    setSortKey(null);
    setSortDirection("desc");
    setPage(1);
  };

  // Update order status
  const handleUpdateStatus = async (orderId: string, newStatus: string) => {
    setUpdatingOrderId(orderId);
    try {
      await postApi("admin-update-order-status", {
        id: orderId,
        status: newStatus,
      });
      await reload();
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder({
          ...selectedOrder,
          status: newStatus as Order["status"],
        });
      }
      toast.success(`Order ${orderId} updated to ${newStatus}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update order status",
      );
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const syncableOrders = useMemo(() => {
    return visibleOrders.filter((o) => !o.autocountDoNo || o.autocountSyncStatus !== "synced");
  }, [visibleOrders]);

  const isAllSelected =
    syncableOrders.length > 0 &&
    syncableOrders.every((o) => selectedIds.has(o.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      const next = new Set(selectedIds);
      syncableOrders.forEach((o) => next.add(o.id));
      setSelectedIds(next);
    }
  };

  const handleBatchSync = async () => {
    if (selectedIds.size === 0) return;
    setIsBatchSyncing(true);
    try {
      const idsArray = Array.from(selectedIds);
      await postApi("admin-batch-sync-parts-orders", { orderIds: idsArray });
      toast.success(`${idsArray.length} parts order(s) queued for AutoCount DO sync.`);
      setSelectedIds(new Set());
      await reload();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Failed to batch queue parts orders.");
    } finally {
      setIsBatchSyncing(false);
    }
  };

  const openStatusFromDetails = (order: Order) => {
    setReturnToOrderDetails(true);
    setSelectedOrder(null);
    setStatusModalOrder(order);
  };

  const closeStatusModal = (nextStatus?: Order["status"]) => {
    if (returnToOrderDetails && statusModalOrder) {
      setSelectedOrder({
        ...statusModalOrder,
        status: nextStatus || statusModalOrder.status,
      });
    }
    setReturnToOrderDetails(false);
    setStatusModalOrder(null);
  };

  if (isLoading && !hasLoaded) {
    return (
      <PageLoading
        title="Loading Orders..."
        description="Fetching parts orders and fulfillment details..."
      />
    );
  }

  if (printingOrder) {
    return (
      <PartsOrderInvoiceDialog
        order={printingOrder}
        onClose={() => setPrintingOrder(null)}
        onChanged={reload}
      />
    );
  }



  if (selectedOrder) {
    const totalQuantity = selectedOrder.items.reduce(
      (sum, item) => sum + Number(item.quantity || 0),
      0,
    );
    const syncLabel = selectedOrder.autocountDoNo
      ? "Synced"
      : selectedOrder.autocountSyncStatus === "pending" || selectedOrder.autocountSyncStatus === "processing"
        ? "Syncing"
        : selectedOrder.autocountSyncStatus || "Not synced";

    return (
      <div className="w-full space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setSelectedOrder(null)}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Parts Orders
            </button>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700">
              <PackageCheck className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-extrabold tracking-tight text-slate-900">
                  Parts Order · {selectedOrder.id}
                </h1>
                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusColors[selectedOrder.status] || "border-slate-200 bg-slate-50 text-slate-600"}`}>
                  <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />
                  {selectedOrder.status}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                Review order information, items, fulfilment and AutoCount documents.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPrintingOrder(selectedOrder)}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50"
            >
              <Printer className="h-4 w-4" />
              Document
            </button>
            {canUpdate ? (
              <button
                type="button"
                onClick={() => openStatusFromDetails(selectedOrder)}
                disabled={selectedOrder.status === "Delivered"}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-xs font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Update Status
              </button>
            ) : null}
          </div>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <h2 className="text-sm font-bold text-slate-900">General Information</h2>
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              ["Order No.", selectedOrder.id],
              ["Order Date", selectedOrder.orderDate || "-"],
              ["Customer", selectedOrder.customer || "-"],
              ["Total Amount", `RM ${selectedOrder.total.toFixed(2)}`],
              ["Line Items", String(selectedOrder.items.length)],
              ["Total Quantity", String(totalQuantity)],
              ["AutoCount DO No.", selectedOrder.autocountDoNo || "-"],
              ["AutoCount Sync", syncLabel],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="mb-1.5 text-xs font-semibold text-slate-600">{label}</p>
                <div className="flex min-h-10 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-800">
                  {value}
                </div>
              </div>
            ))}
            <div className="md:col-span-2 xl:col-span-4">
              <p className="mb-1.5 text-xs font-semibold text-slate-600">Delivery Address</p>
              <div className="flex min-h-10 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium leading-5 text-slate-700">
                {selectedOrder.deliveryAddress || "No delivery address"}
              </div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Order Items</h2>
              <p className="mt-0.5 text-xs text-slate-500">Parts and quantities included in this order.</p>
            </div>
            <span className="text-xs font-semibold text-slate-500">{selectedOrder.items.length} line items</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-slate-50/80">
                <tr className="text-left text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                  <th className="w-16 px-6 py-3.5">#</th>
                  <th className="px-4 py-3.5">Part / Description</th>
                  <th className="px-4 py-3.5 text-right">Qty</th>
                  <th className="px-4 py-3.5 text-right">Unit Price (RM)</th>
                  <th className="px-6 py-3.5 text-right">Amount (RM)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {selectedOrder.items.map((item, index) => (
                  <tr key={`${item.name}-${index}`} className="text-xs text-slate-700">
                    <td className="px-6 py-4 font-semibold text-slate-400">{index + 1}</td>
                    <td className="px-4 py-4 font-bold text-slate-900">{item.name}</td>
                    <td className="px-4 py-4 text-right font-semibold">{item.quantity}</td>
                    <td className="px-4 py-4 text-right">{Number(item.price || 0).toFixed(2)}</td>
                    <td className="px-6 py-4 text-right font-bold text-slate-900">{(Number(item.price || 0) * Number(item.quantity || 0)).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end border-t border-slate-100 bg-slate-50/40 px-6 py-4">
            <div className="flex min-w-[260px] items-center justify-between text-sm font-extrabold text-slate-900">
              <span>Total (RM)</span>
              <span>{selectedOrder.total.toFixed(2)}</span>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Parts Orders</h1>
            <AutoCountSyncBadge
              label="AutoCount DO Sync Active"
              onRefresh={() => void reload()}
              isRefreshing={isLoading}
            />
          </div>
          <p className="mt-0.5 text-xs text-slate-500">Manage customer spare parts orders, fulfilment and AutoCount delivery orders</p>
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
              Active Parts Orders
              <span
                className={`ml-1.5 rounded-full px-1.5 py-0.2 text-[10px] ${
                  recordScope === "active" ? "bg-blue-50 font-extrabold text-blue-600" : "bg-slate-200 text-slate-600"
                }`}
              >
                {activeCount}
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
              <span
                className={`ml-1.5 rounded-full px-1.5 py-0.2 text-[10px] ${
                  recordScope === "history" ? "bg-blue-50 font-extrabold text-blue-600" : "bg-slate-200 text-slate-600"
                }`}
              >
                {historyCount}
              </span>
            </button>
          </div>

        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Parts orders are unavailable: {error}.
        </div>
      )}

      {/* Unified Filter & Tabs Card (matching Bookings & Parts Inventory design) */}
      <div className="relative z-20 rounded-2xl border border-slate-200 bg-white shadow-2xs">
        {/* Status Tabs */}
        <div className="flex items-center gap-6 sm:gap-8 border-b border-slate-100 px-6 pt-3.5 overflow-x-auto no-scrollbar">
          {statusTabs.map((tab) => {
            const isActive = selectedStatus === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setSelectedStatus(tab.id);
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
                    isActive ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Filter Inputs Grid */}
        <div className="grid grid-cols-1 gap-3 px-6 py-4 sm:grid-cols-2 lg:grid-cols-[1.5fr_1.2fr_1.2fr_auto]">
          {/* Search */}
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search order no., customer, address or DO..."
              value={searchTerm}
              onChange={(event) => { setSearchTerm(event.target.value); setPage(1); }}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-9 text-xs font-medium text-slate-800 placeholder:text-slate-400 shadow-2xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
            />
            {searchTerm ? (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  setPage(1);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                title="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          {/* Customer Dropdown */}
          <div>
            <AdminSelect
              value={selectedCustomer}
              onChange={(e) => {
                setSelectedCustomer(e.target.value);
                setPage(1);
              }}
              placement="bottom"
              aria-label="Filter by customer"
              className="h-10 w-full text-xs"
            >
              <option value="All">All Customers</option>
              {customers.map((cust) => (
                <option key={cust} value={cust}>
                  {cust}
                </option>
              ))}
            </AdminSelect>
          </div>

          {/* AutoCount Sync Status */}
          <div>
            <AdminSelect
              value={selectedSyncStatus}
              onChange={(e) => {
                setSelectedSyncStatus(e.target.value as "All" | "synced" | "pending" | "not_synced");
                setPage(1);
              }}
              placement="bottom"
              aria-label="Filter by AutoCount DO sync status"
              className="h-10 w-full text-xs"
            >
              <option value="All">All AutoCount Sync Statuses</option>
              <option value="pending">Pending Sync</option>
              <option value="synced">Synced (DO Generated)</option>
              <option value="not_synced">Not Synced</option>
            </AdminSelect>
          </div>

          {/* Reset Button */}
          <button
            type="button"
            onClick={clearFilters}
            title="Reset all filters"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <RotateCcw className="h-4 w-4 text-slate-500" />
            Reset
          </button>
        </div>
      </div>

      {/* Orders Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50/70">
              <tr>
                <th scope="col" className="w-10 px-5 py-3.5 text-left">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="text-slate-400 hover:text-slate-700 cursor-pointer"
                    title={isAllSelected ? "Deselect all" : "Select all syncable"}
                  >
                    {isAllSelected ? (
                      <CheckSquare className="h-4 w-4 text-blue-600" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                </th>
                <SortableHeader columnKey="order" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleHeaderSort} className="px-5 py-3.5 text-left">
                  Order
                </SortableHeader>
                <SortableHeader columnKey="autocount" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleHeaderSort} className="px-5 py-3.5 text-left">
                  AutoCount DO
                </SortableHeader>
                <SortableHeader columnKey="customer" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleHeaderSort} className="px-5 py-3.5 text-left">
                  Customer
                </SortableHeader>
                <th scope="col" className="px-5 py-3.5 text-left text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                  Items
                </th>
                <SortableHeader columnKey="date" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleHeaderSort} className="px-5 py-3.5 text-left">
                  Order Date
                </SortableHeader>
                <SortableHeader columnKey="total" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleHeaderSort} className="px-5 py-3.5 text-left">
                  Total
                </SortableHeader>
                <SortableHeader columnKey="status" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleHeaderSort} className="px-5 py-3.5 text-left">
                  Status
                </SortableHeader>
                <th scope="col" className="px-5 py-3.5 text-right whitespace-nowrap text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {isLoading ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-5 py-12 text-center text-sm text-gray-500"
                  >
                    Loading parts orders...
                  </td>
                </tr>
              ) : visibleOrders.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-5 py-12 text-center text-sm text-gray-500"
                  >
                    No orders match the current filters.
                  </td>
                </tr>
              ) : (
                visibleOrders.map((order) => {
                  const itemQuantity = order.items.reduce(
                    (total, item) => total + item.quantity,
                    0,
                  );
                  const isSelected = selectedIds.has(order.id);
                  return (
                    <tr key={order.id} className={`text-xs transition-colors hover:bg-slate-50/80 ${isSelected ? "bg-blue-50/50" : ""}`}>
                      <td className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => toggleSelect(order.id)}
                          className="text-slate-400 hover:text-slate-700 cursor-pointer"
                        >
                          {isSelected ? (
                            <CheckSquare className="h-4 w-4 text-blue-600" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4">
                        <button type="button" onClick={() => setSelectedOrder(order)} className="font-extrabold text-blue-600 transition-colors hover:text-blue-800 hover:underline cursor-pointer">{order.id}</button>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4">
                        {order.autocountDoNo ? (
                          <span className="font-mono font-bold text-emerald-600">
                            {order.autocountDoNo}
                          </span>
                        ) : order.autocountSyncStatus === "pending" || order.autocountSyncStatus === "processing" ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600">
                            <RefreshCw className="h-3 w-3 animate-spin text-amber-600" />
                            Syncing...
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-900">
                          {order.customer}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-900">
                          {itemQuantity} units
                        </p>
                        <p className="mt-0.5 text-[10px] text-slate-400">{order.items.length} line items</p>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 font-medium text-slate-700">
                        {order.orderDate || "-"}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-left font-bold text-slate-900">
                        RM {order.total.toFixed(2)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4">
                        <span className={`text-xs font-bold ${order.status === "Delivered" ? "text-emerald-600" : order.status === "Shipped" ? "text-purple-600" : order.status === "Processing" ? "text-blue-600" : "text-amber-600"}`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-right">
                        <div className="flex items-center justify-end">
                          <button type="button" onClick={() => setSelectedOrder(order)} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 cursor-pointer" title="View Order Details" aria-label={`View ${order.id}`}><Eye className="h-3.5 w-3.5 text-slate-500" />View Details</button>
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
          currentPage={safePage}
          totalPages={totalPages}
          totalItems={filteredOrders.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          itemLabel="parts orders"
        />
      </div>

      {/* Floating Batch Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 rounded-2xl border border-slate-700 bg-slate-900 px-6 py-3.5 text-white shadow-2xl animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-blue-400" />
            <span className="text-sm font-bold">
              {selectedIds.size} Order(s) Selected
            </span>
          </div>
          <div className="h-4 w-px bg-slate-700" />
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="text-xs font-semibold text-slate-300 hover:text-white cursor-pointer"
          >
            Clear Selection
          </button>
          <button
            type="button"
            disabled={isBatchSyncing}
            onClick={() => void handleBatchSync()}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-blue-500 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isBatchSyncing ? "animate-spin" : ""}`} />
            <span>{isBatchSyncing ? "Queueing..." : "Batch Sync to AutoCount"}</span>
          </button>
        </div>
      )}

      {/* Quick Status Update Modal */}
      {statusModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm transition-opacity sm:p-5">
          <div className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-6 sm:py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                  <PackageCheck className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 sm:text-lg">
                    Update Fulfilment Status
                  </h2>
                  <p className="text-xs font-mono text-slate-500">
                    {statusModalOrder.id} · {statusModalOrder.customer}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => closeStatusModal()}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                  Order Fulfilment Workflow (Strict Sequential)
                </label>
                
                {/* Visual Step Timeline */}
                <div className="space-y-3">
                  {([
                    { key: "Pending", step: 1, label: "1. Order Placed", desc: "Customer submitted parts order from App.", color: "amber" },
                    { key: "Processing", step: 2, label: "2. Prepare & Generate DO", desc: "Picking parts & enqueuing AutoCount DO sync.", color: "blue" },
                    { key: "Shipped", step: 3, label: "3. Dispatched / Ready for Pickup", desc: "Parts ready at workshop counter or out for delivery.", color: "purple" },
                    { key: "Delivered", step: 4, label: "4. Delivered & Completed", desc: "Customer received parts. Order fulfilled and closed.", color: "emerald" },
                  ] as const).map((stepItem, idx) => {
                    const currentIdx = (["Pending", "Processing", "Shipped", "Delivered"] as const).indexOf(statusModalOrder.status);
                    const isPassed = idx < currentIdx;
                    const isCurrent = idx === currentIdx;
                    const isNext = idx === currentIdx + 1;
                    const isLocked = idx > currentIdx + 1;
                    const isUpdating = updatingOrderId === statusModalOrder.id;

                    return (
                      <div
                        key={stepItem.key}
                        className={`relative rounded-xl border p-3.5 transition-all ${
                          isCurrent
                            ? "border-blue-500 bg-blue-50/70 ring-2 ring-blue-500/20 shadow-sm"
                            : isPassed
                            ? "border-emerald-200 bg-emerald-50/40 text-emerald-950"
                            : isNext
                            ? "border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50/30"
                            : "border-slate-100 bg-slate-50 opacity-60"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div
                              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                isPassed
                                  ? "bg-emerald-600 text-white"
                                  : isCurrent
                                  ? "bg-blue-600 text-white ring-4 ring-blue-100"
                                  : isNext
                                  ? "border-2 border-blue-600 bg-white text-blue-600"
                                  : "border-2 border-slate-300 bg-white text-slate-400"
                              }`}
                            >
                              {isPassed ? "✓" : stepItem.step}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className={`text-xs font-bold ${isCurrent ? "text-blue-900" : isPassed ? "text-emerald-900" : isNext ? "text-slate-800" : "text-slate-500"}`}>
                                  {stepItem.label}
                                </h4>
                                {isCurrent && (
                                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-extrabold text-blue-700 uppercase">
                                    Current
                                  </span>
                                )}
                                {isPassed && (
                                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-extrabold text-emerald-700">
                                    Done
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 text-[11px] text-slate-500">
                                {stepItem.desc}
                              </p>
                            </div>
                          </div>

                          {/* Action Button */}
                          {isNext ? (
                            <button
                              type="button"
                              disabled={isUpdating}
                              onClick={async () => {
                                await handleUpdateStatus(statusModalOrder.id, stepItem.key);
                                closeStatusModal(stepItem.key);
                              }}
                              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-blue-700 hover:scale-105 active:scale-95 disabled:opacity-50 cursor-pointer"
                            >
                              Advance &rarr;
                            </button>
                          ) : isLocked ? (
                            <span className="shrink-0 text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                              <span>🔒</span> Next step required
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {statusModalOrder.autocountDoNo ? (
                <div className="rounded-xl border border-emerald-200/60 bg-emerald-50/80 p-3 text-xs text-emerald-800 flex items-center justify-between">
                  <div>
                    <span className="font-bold">AutoCount DO:</span> {statusModalOrder.autocountDoNo}
                  </div>
                  <span className="text-[10px] font-bold text-emerald-600">Synced</span>
                </div>
              ) : statusModalOrder.status === "Pending" ? (
                <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-[11px] text-blue-800">
                  💡 Advancing to <strong>Processing</strong> will automatically enqueue and generate the <strong>AutoCount Delivery Order (DO)</strong>.
                </div>
              ) : null}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3.5">
              <button
                type="button"
                onClick={() => closeStatusModal()}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 shadow-sm cursor-pointer"
              >
                {t("close")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
