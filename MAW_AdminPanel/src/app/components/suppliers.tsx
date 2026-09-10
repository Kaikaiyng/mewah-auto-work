import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  Building2,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  FileText,
  History,
  Package,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingCart,
  TrendingUp,
  Truck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AdminPagination } from "./ui/admin-pagination";
import { useApiData } from "../lib/use-api-data";
import { PageLoading } from "./ui/page-loading";
import { apiRequest } from "../lib/api";
import { AdminSelect } from "./ui/admin-select";
import { AutoCountSyncBadge } from "./autocount-sync-badge";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { SortableHeader, useSortState, compareValues } from "./ui/sortable-header";

type Supplier = {
  code: string;
  name: string;
  registrationNo: string;
  attention: string;
  phone: string;
  mobile: string;
  email: string;
  address: string;
  purchaseAgent: string;
  term: string;
  currency: string;
  creditLimit: number;
  creditorType: string;
  taxCode: string;
  active: boolean;
  lastModified: string | null;
  itemCount: number;
  fields: Record<string, string | number | null>;
};

type SupplierResponse = {
  suppliers: Supplier[];
  lastSync: { status: string; remark: string; date: string | null } | null;
};

type SupplierOrder = {
  id: number;
  internalRef: string;
  autocountPoNo: string;
  poNo: string;
  workOrderId: number | null;
  workOrderNo: string;
  supplierCode: string;
  supplierName: string;
  orderDate: string;
  estimatedArrivalDate: string;
  status: string;
  currency: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  itemCount: number;
  receivedAt: string | null;
  notes: string;
};

type SupplierPart = {
  partId: number | null;
  itemCode: string;
  description: string;
  uom: string;
  poCount: number;
  totalOrderedQty: number;
  totalReceivedQty: number;
  lastUnitCost: number;
  minUnitCost: number;
  maxUnitCost: number;
  lastOrderedAt: string | null;
  currentStock: number;
};

type CatalogItem = {
  itemCode: string;
  description: string;
  uom: string;
  cost: number;
  stock: number;
  price: number;
};

type SupplierTxData = {
  supplierCode: string;
  supplierName: string;
  summary: {
    totalPoCount: number;
    totalSpend: number;
    pendingPoCount: number;
    receivedPoCount: number;
    lastOrderDate: string | null;
  };
  orders: SupplierOrder[];
  suppliedParts: SupplierPart[];
  catalogItems: CatalogItem[];
};

function displayDateTime(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value.includes("T") ? value : value.replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function displayMoney(value: number, currency: string) {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: currency || "MYR",
    maximumFractionDigits: 2,
  }).format(value || 0);
}



function ReadOnlyField({ label, value, mono = false }: { label: string; value: string | number | null | undefined; mono?: boolean }) {
  const displayed = value === null || value === undefined || value === "" ? "—" : String(value);
  return (
    <div>
      <span className="mb-1 block text-[11px] font-bold text-slate-600">{label}</span>
      <div className={`flex min-h-10 w-full items-center break-words rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2 text-xs font-medium text-slate-800 ${mono ? "font-mono font-bold text-blue-700" : ""}`}>
        {displayed}
      </div>
    </div>
  );
}

export function Suppliers() {
  const { data, isLoading, error, reload, hasLoaded } = useApiData<SupplierResponse>("admin-suppliers", { suppliers: [], lastSync: null });
  const [search, setSearch] = useState("");
  const [statusTab, setStatusTab] = useState<"all" | "active" | "inactive" | "linked">("all");
  const [selectedTerm, setSelectedTerm] = useState("all");
  const [itemLinkFilter, setItemLinkFilter] = useState<"all" | "linked" | "unlinked">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<Supplier | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<"orders" | "parts" | "catalog" | "profile">("orders");
  const [txData, setTxData] = useState<SupplierTxData | null>(null);
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [orderSearch, setOrderSearch] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("all");
  const [partSearch, setPartSearch] = useState("");

  const fetchSupplierTransactions = (code: string, name: string) => {
    setTxLoading(true);
    setTxError(null);
    apiRequest<SupplierTxData>(`admin-supplier-transactions&code=${encodeURIComponent(code)}&name=${encodeURIComponent(name)}`)
      .then((res) => {
        setTxData(res);
        setTxLoading(false);
      })
      .catch((err) => {
        setTxError(err instanceof Error ? err.message : "Failed to load supplier transactions");
        setTxLoading(false);
      });
  };

  useEffect(() => {
    if (!selected) {
      setTxData(null);
      setTxError(null);
      setTxLoading(false);
      return;
    }
    setActiveDetailTab("orders");
    setOrderSearch("");
    setOrderStatusFilter("all");
    setPartSearch("");
    fetchSupplierTransactions(selected.code, selected.name);
  }, [selected]);

  const filteredOrders = useMemo(() => {
    if (!txData?.orders) return [];
    return txData.orders.filter((order) => {
      const status = (order.status || "").toLowerCase();
      const matchesStatus =
        orderStatusFilter === "all" ||
        (orderStatusFilter === "inflight" && ["pending", "ordered", "partial_received"].includes(status)) ||
        status === orderStatusFilter;
      const matchesSearch =
        !orderSearch.trim() ||
        order.poNo.toLowerCase().includes(orderSearch.toLowerCase()) ||
        order.internalRef.toLowerCase().includes(orderSearch.toLowerCase()) ||
        (order.workOrderNo && order.workOrderNo.toLowerCase().includes(orderSearch.toLowerCase())) ||
        (order.notes && order.notes.toLowerCase().includes(orderSearch.toLowerCase()));
      return matchesStatus && matchesSearch;
    });
  }, [txData?.orders, orderStatusFilter, orderSearch]);

  const filteredSuppliedParts = useMemo(() => {
    if (!txData?.suppliedParts) return [];
    return txData.suppliedParts.filter((part) => {
      if (!partSearch.trim()) return true;
      const q = partSearch.toLowerCase();
      return (
        part.itemCode.toLowerCase().includes(q) ||
        part.description.toLowerCase().includes(q)
      );
    });
  }, [txData?.suppliedParts, partSearch]);

  const { sortKey, sortDirection, handleSort, setSortKey, setSortDirection } = useSortState(null, "asc");

  const counts = useMemo(() => {
    return {
      all: data.suppliers.length,
      active: data.suppliers.filter((s) => s.active).length,
      inactive: data.suppliers.filter((s) => !s.active).length,
      linked: data.suppliers.filter((s) => s.itemCount > 0).length,
    };
  }, [data.suppliers]);

  const statusTabs = useMemo(() => {
    return [
      { id: "all", label: "All Suppliers", count: counts.all },
      { id: "active", label: "Active", count: counts.active },
      { id: "inactive", label: "Inactive", count: counts.inactive },
      { id: "linked", label: "Parts Suppliers", count: counts.linked },
    ] as const;
  }, [counts]);

  const paymentTerms = useMemo(() => {
    const terms = new Set<string>();
    data.suppliers.forEach((s) => {
      const term = (s.term || "").trim();
      if (term) terms.add(term);
    });
    return Array.from(terms).sort((a, b) => a.localeCompare(b));
  }, [data.suppliers]);

  const sortSelectValue = useMemo(() => {
    return sortKey ? `${sortKey}_${sortDirection || "asc"}` : "default";
  }, [sortKey, sortDirection]);

  const handleSortSelectChange = (val: string) => {
    if (val === "default") {
      setSortKey(null);
      setSortDirection("asc");
      setPage(1);
      return;
    }
    const [key, dir] = val.split("_");
    setSortKey(key);
    setSortDirection(dir as "asc" | "desc");
    setPage(1);
  };

  const filtered = useMemo(() => {
    return data.suppliers.filter((s) => {
      const matchesSearch =
        search === "" ||
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.code.toLowerCase().includes(search.toLowerCase()) ||
        s.phone.toLowerCase().includes(search.toLowerCase()) ||
        s.email.toLowerCase().includes(search.toLowerCase());

      const matchesStatus =
        statusTab === "all" ||
        (statusTab === "active" && s.active) ||
        (statusTab === "inactive" && !s.active) ||
        (statusTab === "linked" && s.itemCount > 0);

      const matchesTerm = selectedTerm === "all" || (s.term || "").trim() === selectedTerm;

      const matchesItemLink =
        itemLinkFilter === "all" ||
        (itemLinkFilter === "linked" && s.itemCount > 0) ||
        (itemLinkFilter === "unlinked" && s.itemCount === 0);

      return matchesSearch && matchesStatus && matchesTerm && matchesItemLink;
    }).sort((a, b) => {
      if (!sortKey) return 0;
      switch (sortKey) {
        case "name":
          return compareValues(a.name, b.name, sortDirection);
        case "code":
          return compareValues(a.code, b.code, sortDirection);
        case "term":
          return compareValues(a.term, b.term, sortDirection);
        case "creditLimit":
          return compareValues(a.creditLimit, b.creditLimit, sortDirection);
        case "itemCount":
          return compareValues(a.itemCount, b.itemCount, sortDirection);
        case "status":
          return compareValues(a.active ? "Active" : "Inactive", b.active ? "Active" : "Inactive", sortDirection);
        default:
          return 0;
      }
    });
  }, [data.suppliers, search, statusTab, selectedTerm, itemLinkFilter, sortKey, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const clearFilters = () => {
    setSearch("");
    setStatusTab("all");
    setSelectedTerm("all");
    setItemLinkFilter("all");
    setSortKey(null);
    setSortDirection("asc");
    setPage(1);
  };


  if (isLoading && !hasLoaded) {
    return (
      <PageLoading
        title="Loading Suppliers..."
        description="Fetching creditor accounts and procurement history..."
      />
    );
  }

  if (selected) {
    return (
      <div className="w-full space-y-5">
        {/* Top bar */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4 text-slate-500" />
              Back to Suppliers
            </button>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-black tracking-tight text-slate-900">{selected.name || selected.code}</h1>
              <span className="font-mono text-xs font-bold rounded-lg bg-slate-100 px-2.5 py-1 text-slate-700 border border-slate-200">
                {selected.code}
              </span>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold ${selected.active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-500"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${selected.active ? "bg-emerald-600" : "bg-slate-400"}`} />
                {selected.active ? "Active" : "Inactive"}
              </span>
              {selected.term ? (
                <span className="inline-flex rounded-lg border border-blue-200 bg-blue-50/70 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
                  Terms: {selected.term}
                </span>
              ) : null}
            </div>
            <p className="text-xs text-slate-500">
              Purchasing transaction history, purchase orders, price analytics and AutoCount creditor master.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchSupplierTransactions(selected.code, selected.name)}
              disabled={txLoading}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${txLoading ? "animate-spin text-blue-600" : ""}`} />
              Refresh Transactions
            </button>
          </div>
        </div>

        {/* 4 Stat Overview Cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Orders</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <ShoppingCart className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-black text-slate-900">
                {txLoading ? "..." : (txData?.summary.totalPoCount ?? 0)}
              </span>
              <span className="text-xs text-slate-500">POs placed</span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Spend</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-black text-emerald-700">
                {txLoading ? "..." : displayMoney(txData?.summary.totalSpend ?? 0, selected.currency)}
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">In-Flight Deliveries</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                <Truck className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-black text-amber-700">
                {txLoading ? "..." : (txData?.summary.pendingPoCount ?? 0)}
              </span>
              <span className="text-xs text-slate-500">pending delivery</span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Last Order Date</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-50 text-purple-700">
                <Calendar className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-sm font-bold text-slate-900">
                {txLoading ? "..." : (txData?.summary.lastOrderDate ? String(txData.summary.lastOrderDate).substring(0, 10) : "No orders yet")}
              </span>
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
          <button
            type="button"
            onClick={() => setActiveDetailTab("orders")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-colors cursor-pointer ${
              activeDetailTab === "orders"
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            <ShoppingCart className="h-3.5 w-3.5" />
            Purchase Orders ({txData?.orders.length ?? 0})
          </button>

          <button
            type="button"
            onClick={() => setActiveDetailTab("parts")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-colors cursor-pointer ${
              activeDetailTab === "parts"
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            <Package className="h-3.5 w-3.5" />
            Supplied Parts ({txData?.suppliedParts.length ?? 0})
          </button>

          {(txData?.catalogItems.length ?? 0) > 0 ? (
            <button
              type="button"
              onClick={() => setActiveDetailTab("catalog")}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-colors cursor-pointer ${
                activeDetailTab === "catalog"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              AutoCount Catalog ({txData?.catalogItems.length})
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setActiveDetailTab("profile")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-colors cursor-pointer ${
              activeDetailTab === "profile"
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            <Eye className="h-3.5 w-3.5" />
            Creditor Profile &amp; AutoCount Master
          </button>
        </div>

        {/* Tab 1: Purchase Orders */}
        {activeDetailTab === "orders" ? (
          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                  <ShoppingCart className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900">Purchase Order Transaction History</h2>
                  <p className="text-[11px] text-slate-500">Historical orders placed with this vendor, fulfillment status and invoice totals.</p>
                </div>
              </div>

              {/* Status Pills */}
              <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setOrderStatusFilter("all")}
                  className={`rounded-lg px-3 py-1 text-xs font-bold transition-colors cursor-pointer ${orderStatusFilter === "all" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600 hover:text-slate-900"}`}
                >
                  All ({txData?.orders.length ?? 0})
                </button>
                <button
                  type="button"
                  onClick={() => setOrderStatusFilter("inflight")}
                  className={`rounded-lg px-3 py-1 text-xs font-bold transition-colors cursor-pointer ${orderStatusFilter === "inflight" ? "bg-white text-amber-700 shadow-2xs" : "text-slate-600 hover:text-slate-900"}`}
                >
                  In-Flight ({txData?.orders.filter((o) => ["pending", "ordered", "partial_received"].includes(o.status.toLowerCase())).length ?? 0})
                </button>
                <button
                  type="button"
                  onClick={() => setOrderStatusFilter("received")}
                  className={`rounded-lg px-3 py-1 text-xs font-bold transition-colors cursor-pointer ${orderStatusFilter === "received" ? "bg-white text-emerald-700 shadow-2xs" : "text-slate-600 hover:text-slate-900"}`}
                >
                  Received ({txData?.orders.filter((o) => o.status.toLowerCase() === "received").length ?? 0})
                </button>
                <button
                  type="button"
                  onClick={() => setOrderStatusFilter("draft")}
                  className={`rounded-lg px-3 py-1 text-xs font-bold transition-colors cursor-pointer ${orderStatusFilter === "draft" ? "bg-white text-slate-800 shadow-2xs" : "text-slate-600 hover:text-slate-900"}`}
                >
                  Draft ({txData?.orders.filter((o) => o.status.toLowerCase() === "draft").length ?? 0})
                </button>
              </div>
            </div>

            {/* Search within orders */}
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search PO #, Work Order, notes..."
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-800 placeholder-slate-400 transition-colors focus:border-blue-500 focus:outline-none"
              />
            </div>

            {txLoading ? (
              <div className="flex min-h-48 items-center justify-center gap-2.5 text-xs text-slate-500">
                <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
                Loading purchase orders...
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-10 text-center text-xs text-slate-500">
                No purchase orders recorded matching this filter.
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-xs">
                    <thead className="border-b border-slate-100 bg-slate-50/80 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-4 py-3.5">PO Ref / No</th>
                        <th className="px-4 py-3.5">Order Date</th>
                        <th className="px-4 py-3.5">Expected Arrival</th>
                        <th className="px-4 py-3.5">Linked Job / WO</th>
                        <th className="px-4 py-3.5 text-center">Items</th>
                        <th className="px-4 py-3.5 text-right">Total Amount</th>
                        <th className="px-4 py-3.5">Fulfillment Status</th>
                        <th className="px-4 py-3.5">Received Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredOrders.map((po) => (
                        <tr key={po.id} className="transition-colors hover:bg-slate-50/70">
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span className="font-mono font-bold text-blue-700">{po.poNo}</span>
                            {po.autocountPoNo ? (
                              <span className="ml-1.5 inline-flex items-center rounded-md bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 border border-emerald-200">
                                Synced
                              </span>
                            ) : null}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap font-mono text-slate-600">
                            {po.orderDate ? String(po.orderDate).substring(0, 10) : "—"}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap font-mono text-slate-600">
                            {po.estimatedArrivalDate ? String(po.estimatedArrivalDate).substring(0, 10) : "—"}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            {po.workOrderNo ? (
                              <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-700 border border-slate-200">
                                {po.workOrderNo}
                              </span>
                            ) : (
                              <span className="text-slate-400">Workshop Restock</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-center whitespace-nowrap font-mono font-semibold text-slate-700">
                            {po.itemCount}
                          </td>
                          <td className="px-4 py-3.5 text-right whitespace-nowrap font-mono font-bold text-slate-900">
                            RM {Number(po.total).toFixed(2)}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            {po.status === "received" ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                                <Check className="h-3 w-3 text-emerald-600" />
                                Received
                              </span>
                            ) : po.status === "partial_received" ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 px-2.5 py-0.5 text-[11px] font-bold text-purple-800">
                                <Truck className="h-3 w-3 text-purple-600" />
                                Partially Received
                              </span>
                            ) : po.status === "ordered" ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-800">
                                <Truck className="h-3 w-3 text-blue-600" />
                                In Transit
                              </span>
                            ) : po.status === "pending" ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                                <Clock className="h-3 w-3 text-amber-600" />
                                Pending
                              </span>
                            ) : po.status === "cancelled" ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold text-rose-800">
                                <X className="h-3 w-3 text-rose-600" />
                                Cancelled
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-700">
                                <FileText className="h-3 w-3 text-slate-500" />
                                {po.status || "Draft"}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap font-mono text-[11px] text-slate-500">
                            {po.receivedAt ? String(po.receivedAt).substring(0, 16) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        ) : null}

        {/* Tab 2: Supplied Parts & Unit Costs */}
        {activeDetailTab === "parts" ? (
          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
                  <Package className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900">Supplied Parts &amp; Historical Purchase Costs</h2>
                  <p className="text-[11px] text-slate-500">Inventory items ordered from this vendor with purchasing price ranges and volume totals.</p>
                </div>
              </div>

              {/* Search within supplied parts */}
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search item code or description..."
                  value={partSearch}
                  onChange={(e) => setPartSearch(e.target.value)}
                  className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-800 placeholder-slate-400 transition-colors focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {txLoading ? (
              <div className="flex min-h-48 items-center justify-center gap-2.5 text-xs text-slate-500">
                <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
                Loading supplied parts history...
              </div>
            ) : filteredSuppliedParts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-10 text-center text-xs text-slate-500">
                No parts have been purchased from this supplier yet.
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-xs">
                    <thead className="border-b border-slate-100 bg-slate-50/80 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-4 py-3.5">SKU / Item Code</th>
                        <th className="px-4 py-3.5">Description</th>
                        <th className="px-4 py-3.5">UOM</th>
                        <th className="px-4 py-3.5 text-right">Last Purchase Cost</th>
                        <th className="px-4 py-3.5 text-right">Price Range (Min - Max)</th>
                        <th className="px-4 py-3.5 text-right">Total Ordered</th>
                        <th className="px-4 py-3.5 text-right">Current Stock</th>
                        <th className="px-4 py-3.5">Last Purchased</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredSuppliedParts.map((part, idx) => {
                        const hasVariance = part.minUnitCost !== part.maxUnitCost;
                        return (
                          <tr key={`${part.itemCode}-${idx}`} className="transition-colors hover:bg-slate-50/70">
                            <td className="px-4 py-3.5 whitespace-nowrap font-mono font-bold text-blue-700">
                              {part.itemCode || "—"}
                            </td>
                            <td className="px-4 py-3.5 font-semibold text-slate-900 max-w-[280px] truncate" title={part.description}>
                              {part.description}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap font-semibold text-slate-600">
                              {part.uom || "UNIT"}
                            </td>
                            <td className="px-4 py-3.5 text-right whitespace-nowrap font-mono font-bold text-slate-900">
                              RM {Number(part.lastUnitCost).toFixed(2)}
                            </td>
                            <td className="px-4 py-3.5 text-right whitespace-nowrap">
                              <span className="font-mono text-slate-700">
                                RM {Number(part.minUnitCost).toFixed(2)} - {Number(part.maxUnitCost).toFixed(2)}
                              </span>
                              {hasVariance ? (
                                <span className="ml-1.5 inline-flex rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 border border-amber-200">
                                  ±RM {(part.maxUnitCost - part.minUnitCost).toFixed(2)}
                                </span>
                              ) : null}
                            </td>
                            <td className="px-4 py-3.5 text-right whitespace-nowrap font-mono font-semibold text-slate-800">
                              {Number(part.totalOrderedQty).toLocaleString()} {part.uom}
                            </td>
                            <td className="px-4 py-3.5 text-right whitespace-nowrap font-mono font-black text-slate-900">
                              {Number(part.currentStock).toLocaleString()} {part.uom}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap font-mono text-[11px] text-slate-500">
                              {part.lastOrderedAt ? String(part.lastOrderedAt).substring(0, 10) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        ) : null}

        {/* Tab 3: AutoCount Catalog */}
        {activeDetailTab === "catalog" && (txData?.catalogItems.length ?? 0) > 0 ? (
          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                <FileText className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-extrabold text-slate-900">AutoCount Synced Catalog</h2>
                <p className="text-[11px] text-slate-500">Catalog items where this creditor is set as MainSupplier in AutoCount.</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-xs">
                  <thead className="border-b border-slate-100 bg-slate-50/80 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3.5">Item Code</th>
                      <th className="px-4 py-3.5">Description</th>
                      <th className="px-4 py-3.5">UOM</th>
                      <th className="px-4 py-3.5 text-right">Standard Cost</th>
                      <th className="px-4 py-3.5 text-right">Selling Price</th>
                      <th className="px-4 py-3.5 text-right">Balance Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {txData?.catalogItems.map((item) => (
                      <tr key={item.itemCode} className="transition-colors hover:bg-slate-50/70">
                        <td className="px-4 py-3.5 whitespace-nowrap font-mono font-bold text-blue-700">{item.itemCode}</td>
                        <td className="px-4 py-3.5 font-semibold text-slate-900">{item.description}</td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-slate-600">{item.uom}</td>
                        <td className="px-4 py-3.5 text-right whitespace-nowrap font-mono font-bold text-slate-900">RM {Number(item.cost).toFixed(2)}</td>
                        <td className="px-4 py-3.5 text-right whitespace-nowrap font-mono text-slate-700">RM {Number(item.price).toFixed(2)}</td>
                        <td className="px-4 py-3.5 text-right whitespace-nowrap font-mono font-bold text-slate-900">{Number(item.stock).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ) : null}

        {/* Tab 4: Creditor Profile & AutoCount Master */}
        {activeDetailTab === "profile" ? (
          <div className="space-y-5">
            <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs">
              <h2 className="text-sm font-extrabold text-slate-900">General Information</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <ReadOnlyField label="Creditor Code" value={selected.code} mono />
                <ReadOnlyField label="Creditor Name" value={selected.name} />
                <ReadOnlyField label="Registration No." value={selected.registrationNo} />
                <ReadOnlyField label="Payment Terms" value={selected.term} />
                <ReadOnlyField label="Credit Limit" value={displayMoney(selected.creditLimit, selected.currency)} />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <ReadOnlyField label="Attention Person" value={selected.attention} />
                <ReadOnlyField label="Phone" value={selected.phone} />
                <ReadOnlyField label="Mobile" value={selected.mobile} />
                <ReadOnlyField label="Email" value={selected.email} />
              </div>
              <ReadOnlyField label="Address" value={selected.address} />
            </section>

            <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-extrabold text-slate-900">AutoCount Master Details</h2>
                <span className="text-xs font-bold text-blue-600">Read-only master</span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <ReadOnlyField label="Purchase Agent" value={selected.purchaseAgent} />
                <ReadOnlyField label="Creditor Type" value={selected.creditorType} />
                <ReadOnlyField label="Tax Code" value={selected.taxCode} />
                <ReadOnlyField label="Linked Items" value={selected.itemCount.toLocaleString()} />
                <ReadOnlyField label="Currency" value={selected.currency} />
                <ReadOnlyField label="Status" value={selected.active ? "Active" : "Inactive"} />
                <div className="sm:col-span-2">
                  <ReadOnlyField label="Last Modified" value={displayDateTime(selected.lastModified)} />
                </div>
              </div>
            </section>

            {Object.keys(selected.fields).length > 0 ? (
              <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-extrabold text-slate-900">Additional AutoCount Fields</h2>
                  <span className="text-xs font-bold text-slate-500">{Object.keys(selected.fields).length} fields</span>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {Object.entries(selected.fields).map(([field, value]) => (
                    <ReadOnlyField key={field} label={field} value={value} />
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Master Data</h1>
            <AutoCountSyncBadge label="AutoCount Creditor Master" lastSync={data.lastSync?.date} onRefresh={() => void reload()} isRefreshing={isLoading} />
          </div>
          <p className="text-xs text-slate-500 mt-0.5">AutoCount Creditor master directory, payment terms, currency and supplier profiles.</p>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">Supplier data unavailable: {error}.</div> : null}

      {/* Unified Filter & Tabs Card */}
      <div className="relative z-20 rounded-2xl border border-slate-200 bg-white shadow-2xs">
        {/* Status Tabs */}
        <div className="flex items-center gap-6 sm:gap-8 border-b border-slate-100 px-6 pt-3.5 overflow-x-auto no-scrollbar">
          {statusTabs.map((tab) => {
            const isActive = statusTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setStatusTab(tab.id);
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
        <div className="grid grid-cols-1 gap-3 px-6 py-4 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.1fr_auto]">
          {/* Search */}
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search creditor code, supplier name, registration no, phone or email..."
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-9 text-xs shadow-2xs outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
            />
            {search ? (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setPage(1);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                title="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          {/* Payment Term Dropdown */}
          <div>
            <AdminSelect
              value={selectedTerm}
              onChange={(event) => {
                setSelectedTerm(event.target.value);
                setPage(1);
              }}
              placement="bottom"
              className="h-10 w-full text-xs"
              aria-label="Filter by payment term"
            >
              <option value="all">All Payment Terms</option>
              {paymentTerms.map((term) => (
                <option key={term} value={term}>
                  Term: {term}
                </option>
              ))}
            </AdminSelect>
          </div>

          {/* Catalog Linkage Dropdown */}
          <div>
            <AdminSelect
              value={itemLinkFilter}
              onChange={(event) => {
                setItemLinkFilter(event.target.value as typeof itemLinkFilter);
                setPage(1);
              }}
              placement="bottom"
              className="h-10 w-full text-xs"
              aria-label="Filter by catalog linkage"
            >
              <option value="all">All Catalog Linkage</option>
              <option value="linked">Parts Suppliers ({counts.linked})</option>
              <option value="unlinked">No Linked Parts ({counts.all - counts.linked})</option>
            </AdminSelect>
          </div>

          {/* Sort By Dropdown */}
          <div>
            <AdminSelect
              value={sortSelectValue}
              onChange={(event) => handleSortSelectChange(event.target.value)}
              placement="bottom"
              className="h-10 w-full text-xs"
              aria-label="Sort suppliers"
            >
              <option value="default">Default (Unsorted)</option>
              <option value="name_asc">Sort: Name (A to Z)</option>
              <option value="name_desc">Sort: Name (Z to A)</option>
              <option value="itemCount_desc">Sort: Most Linked Parts</option>
              <option value="itemCount_asc">Sort: Least Linked Parts</option>
              <option value="creditLimit_desc">Sort: Highest Credit Limit</option>
              <option value="code_asc">Sort: Creditor Code (A-Z)</option>
              <option value="term_asc">Sort: Payment Term</option>
              <option value="status_asc">Sort: Status (Active First)</option>
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

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50/70">
              <tr className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                <SortableHeader
                  label="Creditor Code"
                  sortKey="code"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  className="px-5 py-3.5 text-left"
                />
                <SortableHeader
                  label="Creditor Name"
                  sortKey="name"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  className="px-5 py-3.5 text-left"
                />
                <th className="px-5 py-3.5 text-left">Contact</th>
                <th className="px-5 py-3.5 text-left">Email</th>
                <SortableHeader
                  label="Payment Term"
                  sortKey="term"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  className="px-5 py-3.5 text-left"
                />
                <SortableHeader
                  label="Credit Limit"
                  sortKey="creditLimit"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  className="px-5 py-3.5 text-left"
                />
                <SortableHeader
                  label="Linked Items"
                  sortKey="itemCount"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  className="px-5 py-3.5 text-left"
                />
                <SortableHeader
                  label="Status"
                  sortKey="status"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  className="px-5 py-3.5 text-left"
                />
                <th className="px-5 py-3.5 text-right whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-xs">
              {isLoading && data.suppliers.length === 0 ? <tr><td colSpan={9} className="px-5 py-16 text-center font-medium text-slate-400">Loading suppliers &amp; creditors…</td></tr> : null}
              {!isLoading && visible.length === 0 ? <tr><td colSpan={9} className="px-5 py-16 text-center font-medium text-slate-400">No suppliers match the current filter criteria.</td></tr> : null}
              {visible.map((supplier) => (
                <tr key={supplier.code} className="transition-colors hover:bg-slate-50/50">
                  <td className="whitespace-nowrap px-5 py-4"><button type="button" onClick={() => setSelected(supplier)} className="font-bold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer">{supplier.code || "—"}</button></td>
                  <td className="px-5 py-4"><button type="button" onClick={() => setSelected(supplier)} className="text-left font-bold uppercase text-slate-900 transition-colors hover:text-blue-600 cursor-pointer">{supplier.name || "Unnamed supplier"}</button></td>
                  <td className="whitespace-nowrap px-5 py-4 text-slate-600">{supplier.mobile || supplier.phone || "—"}</td>
                  <td className="max-w-60 truncate whitespace-nowrap px-5 py-4 text-slate-600" title={supplier.email}>{supplier.email || "—"}</td>
                  <td className="whitespace-nowrap px-5 py-4 font-bold text-slate-800">
                    {supplier.term ? (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                        supplier.term.toUpperCase().includes("C.O.D") || supplier.term === "0"
                          ? "bg-amber-50 text-amber-700 border border-amber-200/60"
                          : "bg-slate-100 text-slate-700"
                      }`}>
                        {supplier.term}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 font-medium text-slate-700">
                    {supplier.creditLimit > 0 ? displayMoney(supplier.creditLimit, supplier.currency) : <span className="text-slate-400">RM 0.00</span>}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4">
                    {supplier.itemCount > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-700 border border-blue-200/60">
                        {supplier.itemCount.toLocaleString()} items
                      </span>
                    ) : (
                      <span className="text-slate-400 font-medium pl-2">0</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${supplier.active ? "text-emerald-600" : "text-slate-400"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${supplier.active ? "bg-emerald-600" : "bg-slate-400"}`} />
                      {supplier.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-right"><div className="flex items-center justify-end"><button type="button" onClick={() => setSelected(supplier)} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:border-slate-300 hover:bg-slate-50 cursor-pointer"><Eye className="h-3.5 w-3.5 text-slate-500" />View Details</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <AdminPagination
          currentPage={safePage}
          totalPages={totalPages}
          totalItems={filtered.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          itemLabel="suppliers"
        />
      </div>
    </div>
  );
}
