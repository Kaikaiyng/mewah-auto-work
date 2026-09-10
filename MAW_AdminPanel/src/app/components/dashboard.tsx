import {
  Calendar,
  Search,
  CalendarClock,
  LogIn,
  ClipboardCheck,
  FileText,
  ThumbsUp,
  Boxes,
  Wrench,
  PackageCheck,
  Truck,
  RefreshCw,
  AlertTriangle,
  Clock3,
  CircleDollarSign,
  Activity,
  ChevronRight,
  Inbox,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Users,
  Car,
  FilePlus2,
  Package,
  Building2,
  ShoppingCart,
  UserCheck,
  PhoneCall,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { useLanguage } from "../contexts/language-context";
import { useApiData } from "../lib/use-api-data";
import { hasAdminPermission } from "../lib/admin-permissions";
import { apiRequest } from "../lib/api";
import { PageLoading } from "./ui/page-loading";

const COLORS = ["#1e3a8a", "#2563eb", "#3b82f6", "#60a5fa", "#93c5fd", "#bfdbfe"];

const dashboardFallback = {
  asOf: "",
  stats: {
    totalCustomers: 0,
    totalCustomersChange: "0%",
    totalCustomersTrend: "neutral",
    todayBookings: 0,
    todayBookingsChange: "0%",
    todayBookingsTrend: "neutral",
    pendingOrders: 0,
    activeRepairs: 0,
    readyForCollection: 0,
    outstandingAmount: 0,
    overdueInvoices: 0,
    backOrderJobs: 0,
    pendingSyncInvoices: 0,
    failedSyncInvoices: 0,
    pendingPurchaseOrders: 0,
    rescueJobs: 0,
    lowStockParts: 0,
    monthRevenue: 0,
    monthRevenueChange: "0%",
    monthRevenueTrend: "neutral",
    workOrderStatusCounts: {
      scheduled: 0,
      checked_in: 0,
      inspected: 0,
      quotation_issued: 0,
      approved: 0,
      parts_ready: 0,
      under_repair: 0,
      ready_for_collection: 0,
      collected: 0,
    },
  },
  monthlyRevenue: [] as Array<{ month: string; revenue: number }>,
  weeklyBookings: [] as Array<{ day: string; date: string; bookings: number }>,
  serviceTypes: [] as Array<{ name: string; value: number }>,
  recentBookings: [],
  needsAttention: [] as Array<{ key: string; label: string; description: string; count: number; route: string; tone: string }>,
  todayWorkshop: [] as Array<{ id: string; time: string; customer: string; vehicle: string; service: string; status: string }>,
  recentActivity: [] as Array<{ id: string; title: string; detail: string; time: string; route: string; type: string }>,
  definitions: {
    monthRevenue: "",
    todayBookings: "",
  },
};

const lifecycleKPIs = [
  { key: "scheduled", color: "bg-blue-50 text-blue-700 border-blue-200", icon: CalendarClock, hoverBg: "hover:bg-blue-100" },
  { key: "checked_in", color: "bg-indigo-50 text-indigo-700 border-indigo-200", icon: LogIn, hoverBg: "hover:bg-indigo-100" },
  { key: "inspected", color: "bg-purple-50 text-purple-700 border-purple-200", icon: ClipboardCheck, hoverBg: "hover:bg-purple-100" },
  { key: "quotation_issued", color: "bg-cyan-50 text-cyan-700 border-cyan-200", icon: FileText, hoverBg: "hover:bg-cyan-100" },
  { key: "approved", color: "bg-pink-50 text-pink-700 border-pink-200", icon: ThumbsUp, hoverBg: "hover:bg-pink-100" },
  { key: "parts_ready", color: "bg-amber-50 text-amber-700 border-amber-200", icon: Boxes, hoverBg: "hover:bg-amber-100" },
  { key: "under_repair", color: "bg-orange-50 text-orange-700 border-orange-200", icon: Wrench, hoverBg: "hover:bg-orange-100" },
  { key: "ready_for_collection", color: "bg-green-50 text-green-700 border-green-200", icon: PackageCheck, hoverBg: "hover:bg-green-100" },
  { key: "collected", color: "bg-gray-50 text-gray-700 border-gray-200", icon: Truck, hoverBg: "hover:bg-gray-100" },
];

const attentionTone: Record<string, string> = {
  blue: "border-blue-200 bg-blue-50/80 text-blue-700 hover:bg-blue-100/70",
  amber: "border-amber-200 bg-amber-50/80 text-amber-800 hover:bg-amber-100/70",
  violet: "border-violet-200 bg-violet-50/80 text-violet-800 hover:bg-violet-100/70",
  orange: "border-orange-200 bg-orange-50/80 text-orange-800 hover:bg-orange-100/70",
  green: "border-emerald-200 bg-emerald-50/80 text-emerald-800 hover:bg-emerald-100/70",
  red: "border-rose-200 bg-rose-50/80 text-rose-800 hover:bg-rose-100/70",
};

function dashboardTime(value?: string) {
  if (!value) return "—";
  const parsed = new Date(value.includes("T") ? value : value.replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-MY", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="flex h-[240px] flex-col items-center justify-center rounded-xl bg-slate-50 text-center">
      <Inbox className="mb-3 h-8 w-8 text-slate-300" />
      <p className="text-sm font-semibold text-slate-600">{message}</p>
      <p className="mt-1 text-xs text-slate-400">This panel will update automatically when records are available.</p>
    </div>
  );
}

export function Dashboard() {
  const canViewFinance = hasAdminPermission("dashboard.finance");
  const canViewOrders = hasAdminPermission("order.view");
  const canViewWorkOrders = hasAdminPermission("workOrder.view");
  const canCreateWorkOrders = hasAdminPermission("workOrder.create");
  const canViewBookings = hasAdminPermission("booking.view");
  const canCreateBookings = hasAdminPermission("booking.create");
  const canViewInvoices = hasAdminPermission("invoice.view");
  const canCreateInvoices = hasAdminPermission("invoice.update");
  const canViewCompanies = hasAdminPermission("company.view");
  const canViewVehicles = hasAdminPermission("vehicle.view");
  const canViewParts = hasAdminPermission("part.view");
  const canViewSuppliers = hasAdminPermission("supplier.view");
  const canViewPOs = hasAdminPermission("order.view");
  const { t } = useLanguage();
  const navigate = useNavigate();
  const {
    data: dashboardData,
    isLoading,
    error,
    hasLoaded,
    reload,
  } = useApiData("admin-dashboard", dashboardFallback);
  const showDatabaseValues = hasLoaded && !error;

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    const intervalId = window.setInterval(refreshWhenVisible, 20_000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [reload]);

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await apiRequest<any[]>(
          `admin-vehicle-search&q=${encodeURIComponent(searchQuery)}`,
        );
        setSearchResults(results || []);
        setShowDropdown(true);
      } catch (err) {
        console.error("Search error:", err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const handleSelectSearchResult = (res: any) => {
    setSearchQuery("");
    setShowDropdown(false);
    navigate(`/equipment?search=${encodeURIComponent(res.plate || res.vehicleNo || "")}`);
  };

  const stats = dashboardData.stats;
  const visibleAttention = (dashboardData.needsAttention || []).filter((item) => {
    if (item.key === "overdue_invoices" && !canViewFinance) return false;
    if (item.key === "low_stock" && !canViewOrders) return false;
    return item.count > 0;
  });
  const hasRevenueData = dashboardData.monthlyRevenue.some((item) => item.revenue > 0);
  const hasBookingData = dashboardData.weeklyBookings.some((item) => item.bookings > 0);

  if (isLoading && !hasLoaded) {
    return (
      <PageLoading
        title="Loading Dashboard..."
        description="Fetching live operational metrics and workshop activity..."
      />
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Top Header & Search Bar */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("dashboard")}</h1>
          <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Live Workspace
            </span>
            <span>·</span>
            <span>Updated {dashboardData.asOf ? dashboardTime(dashboardData.asOf) : "—"}</span>
            <button
              type="button"
              onClick={() => void reload()}
              disabled={isLoading}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-blue-700 disabled:opacity-50 transition-colors"
              aria-label="Refresh dashboard"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin text-blue-600" : ""}`} />
            </button>
          </div>
        </div>

        {/* Plate / Registration Search Bar */}
        <div className="relative w-full md:w-80">
          <div className="relative">
            <input
              type="text"
              className="block w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-10 pr-3 text-sm placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder={
                t("search_registration_placeholder") || "Search plate number or vehicle..."
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => {
                if (searchResults.length > 0) setShowDropdown(true);
              }}
            />
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
          </div>

          {showDropdown && searchResults.length > 0 && (
            <div className="absolute z-20 mt-1.5 w-full rounded-xl bg-white shadow-xl border border-gray-200 overflow-hidden">
              <ul className="py-1 text-sm text-gray-700 max-h-60 overflow-y-auto">
                {searchResults.map((v) => (
                  <li
                    key={v.id}
                    className="relative cursor-pointer select-none px-4 py-2.5 hover:bg-blue-50 border-b last:border-b-0 transition-colors"
                    onClick={() => handleSelectSearchResult(v)}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-[#1e3a8a]">
                        {v.regNo}
                      </span>
                      <span className="text-gray-500 text-xs">
                        {v.brand} {v.model}
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-400 mt-0.5">
                      {v.companyName}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">
          Dashboard data connection notice: {error}.
        </div>
      )}

      {/* Primary KPI Grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Month Revenue */}
        {canViewFinance ? (
          <button
            type="button"
            onClick={() => navigate('/invoices')}
            className="group relative flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-5 text-left shadow-xs transition-all duration-200 hover:border-blue-300 hover:shadow-md hover:-translate-y-0.5"
          >
            <div className="flex-1 min-w-0 pr-3">
              <span className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 truncate">
                This Month Revenue
              </span>
              <div className="mt-1.5 flex items-baseline">
                <span className="text-3xl font-black tracking-tight text-slate-900 truncate">
                  {showDatabaseValues ? `RM ${Number(stats.monthRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                </span>
              </div>
              <div className="mt-2 flex items-center text-xs">
                <span className={`inline-flex items-center font-bold ${stats.monthRevenueTrend === "up" ? "text-emerald-600" : stats.monthRevenueTrend === "down" ? "text-rose-600" : "text-slate-500"}`}>
                  {stats.monthRevenueTrend === "up" ? <ArrowUpRight className="mr-1 h-3.5 w-3.5" /> : stats.monthRevenueTrend === "down" ? <ArrowDownRight className="mr-1 h-3.5 w-3.5" /> : null}
                  {stats.monthRevenueChange} vs last month
                </span>
              </div>
            </div>
            <div className="flex flex-col items-end justify-between self-stretch shrink-0 py-0.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-[#1e3a8a] shadow-2xs group-hover:scale-105 transition-transform">
                <CircleDollarSign className="h-5 w-5" />
              </div>
              <ChevronRight className="h-4 w-4 text-slate-300 group-hover:translate-x-1 group-hover:text-blue-600 transition" />
            </div>
          </button>
        ) : null}

        {/* Today's Bookings */}
        <button
          type="button"
          onClick={() => navigate('/bookings')}
          className="group relative flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-5 text-left shadow-xs transition-all duration-200 hover:border-blue-300 hover:shadow-md hover:-translate-y-0.5"
        >
          <div className="flex-1 min-w-0 pr-3">
            <span className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 truncate">
              Today’s Bookings
            </span>
            <div className="mt-1.5 flex items-baseline">
              <span className="text-3xl font-black tracking-tight text-slate-900 truncate">
                {showDatabaseValues ? Number(stats.todayBookings || 0).toLocaleString() : "—"}
              </span>
            </div>
            <div className="mt-2 flex items-center text-xs">
              <span className={`inline-flex items-center font-bold ${stats.todayBookingsTrend === "up" ? "text-emerald-600" : stats.todayBookingsTrend === "down" ? "text-rose-600" : "text-slate-500"}`}>
                {stats.todayBookingsTrend === "up" ? <ArrowUpRight className="mr-1 h-3.5 w-3.5" /> : stats.todayBookingsTrend === "down" ? <ArrowDownRight className="mr-1 h-3.5 w-3.5" /> : null}
                {stats.todayBookingsChange} vs yesterday
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end justify-between self-stretch shrink-0 py-0.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 shadow-2xs group-hover:scale-105 transition-transform">
              <Calendar className="h-5 w-5" />
            </div>
            <ChevronRight className="h-4 w-4 text-slate-300 group-hover:translate-x-1 group-hover:text-blue-600 transition" />
          </div>
        </button>

        {/* Active Repairs */}
        <button
          type="button"
          onClick={() => navigate('/work-orders')}
          className="group relative flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-5 text-left shadow-xs transition-all duration-200 hover:border-blue-300 hover:shadow-md hover:-translate-y-0.5"
        >
          <div className="flex-1 min-w-0 pr-3">
            <span className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 truncate">
              Active Workshop Jobs
            </span>
            <div className="mt-1.5 flex items-baseline">
              <span className="text-3xl font-black tracking-tight text-slate-900 truncate">
                {showDatabaseValues ? Number(stats.activeRepairs || 0).toLocaleString() : "—"}
              </span>
            </div>
            <div className="mt-2 flex items-center text-xs text-slate-500 font-medium">
              <span>In inspection & repair</span>
            </div>
          </div>
          <div className="flex flex-col items-end justify-between self-stretch shrink-0 py-0.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-orange-600 shadow-2xs group-hover:scale-105 transition-transform">
              <Wrench className="h-5 w-5" />
            </div>
            <ChevronRight className="h-4 w-4 text-slate-300 group-hover:translate-x-1 group-hover:text-blue-600 transition" />
          </div>
        </button>

        {/* Ready for Collection / Outstanding */}
        <button
          type="button"
          onClick={() => navigate(canViewFinance ? '/invoices' : '/work-orders?status=ready_for_collection')}
          className="group relative flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-5 text-left shadow-xs transition-all duration-200 hover:border-blue-300 hover:shadow-md hover:-translate-y-0.5"
        >
          <div className="flex-1 min-w-0 pr-3">
            <span className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 truncate">
              {canViewFinance ? "Outstanding Invoices" : "Ready for Collection"}
            </span>
            <div className="mt-1.5 flex items-baseline">
              <span className="text-3xl font-black tracking-tight text-slate-900 truncate">
                {showDatabaseValues
                  ? canViewFinance
                    ? `RM ${Number(stats.outstandingAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : Number(stats.readyForCollection || 0).toLocaleString()
                  : "—"}
              </span>
            </div>
            <div className="mt-2 flex items-center text-xs text-slate-500 font-medium">
              <span>{canViewFinance ? "Unpaid invoice balance" : "Waiting for pickup"}</span>
            </div>
          </div>
          <div className="flex flex-col items-end justify-between self-stretch shrink-0 py-0.5">
            <div className={`flex h-11 w-11 items-center justify-center rounded-xl shadow-2xs group-hover:scale-105 transition-transform ${canViewFinance ? "bg-purple-50 text-purple-700" : "bg-emerald-50 text-emerald-700"}`}>
              {canViewFinance ? <FileText className="h-5 w-5" /> : <PackageCheck className="h-5 w-5" />}
            </div>
            <ChevronRight className="h-4 w-4 text-slate-300 group-hover:translate-x-1 group-hover:text-blue-600 transition" />
          </div>
        </button>
      </div>

      {/* Real-time Operational Intelligence Monitor */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
        <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400 pl-1">
          Operational Monitor:
        </span>
        
        {/* AutoCount Sync */}
        <button
          type="button"
          onClick={() => navigate('/invoices?view=pending_sync')}
          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition hover:opacity-85 cursor-pointer ${
            ((stats as any).failedSyncInvoices || 0) > 0
              ? "border-rose-300 bg-rose-50 text-rose-700 ring-2 ring-rose-200/50"
              : ((stats as any).pendingSyncInvoices || 0) > 0
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />
          AutoCount Sync: {(stats as any).failedSyncInvoices ? `${(stats as any).failedSyncInvoices} Failed` : (stats as any).pendingSyncInvoices ? `${(stats as any).pendingSyncInvoices} Pending` : "All Synced"}
        </button>

        {/* Back Order VIP */}
        <button
          type="button"
          onClick={() => navigate('/work-orders')}
          className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700 transition hover:opacity-85 cursor-pointer"
        >
          <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />
          Back Orders: {(stats as any).backOrderJobs || 0} Active
        </button>

        {/* Rescue Jobs */}
        {((stats as any).rescueJobs || 0) > 0 ? (
          <button
            type="button"
            onClick={() => navigate('/work-orders')}
            className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 transition hover:opacity-85 cursor-pointer"
          >
            <PhoneCall className="mr-1.5 h-3 w-3" />
            Rescue Operations: {(stats as any).rescueJobs}
          </button>
        ) : null}

        {/* Low Stock Alerts */}
        <button
          type="button"
          onClick={() => navigate('/parts')}
          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition hover:opacity-85 cursor-pointer ${
            ((stats as any).lowStockParts || 0) > 0
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-slate-200 bg-slate-50 text-slate-600"
          }`}
        >
          <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />
          Stock Alerts: {(stats as any).lowStockParts || 0} Low Items
        </button>

        {/* Pending POs */}
        <button
          type="button"
          onClick={() => navigate('/purchase-orders')}
          className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 transition hover:opacity-85 cursor-pointer"
        >
          <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />
          Purchase Orders: {(stats as any).pendingPurchaseOrders || 0} Pending Arrival
        </button>

        {/* Overdue Invoices */}
        {canViewFinance && ((stats as any).overdueInvoices || 0) > 0 ? (
          <button
            type="button"
            onClick={() => navigate('/invoices')}
            className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 transition hover:opacity-85 cursor-pointer"
          >
            <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />
            Overdue Invoices: {(stats as any).overdueInvoices}
          </button>
        ) : null}
      </div>

      {/* Needs Attention & Today's Schedule */}
      <div className="grid gap-5 xl:grid-cols-2">
        {/* Needs Attention Center */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-extrabold text-slate-900">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Needs Attention
            </h2>
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
              <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />
              {visibleAttention.reduce((sum, item) => sum + item.count, 0)} items
            </span>
          </div>
          {visibleAttention.length ? (
            <div className="grid gap-2.5 sm:grid-cols-2">
              {visibleAttention.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => navigate(item.route)}
                  className={`flex items-center rounded-xl border p-3 text-left transition hover:shadow-sm ${attentionTone[item.tone] || attentionTone.blue}`}
                >
                  <span className="flex h-9 min-w-9 items-center justify-center rounded-lg bg-white/90 text-sm font-extrabold shadow-sm">
                    {item.count}
                  </span>
                  <span className="ml-3 min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{item.label}</span>
                    <span className="block truncate text-[11px] opacity-75">{item.description}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 opacity-50" />
                </button>
              ))}
            </div>
          ) : (
            <div className="flex h-36 flex-col items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <PackageCheck className="mb-2 h-6 w-6" />
              <p className="text-sm font-bold">All caught up!</p>
              <p className="text-xs text-emerald-600">No urgent pending actions require attention.</p>
            </div>
          )}
        </section>

        {/* Today's Workshop Schedule */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-extrabold text-slate-900">
              <Clock3 className="h-5 w-5 text-blue-600" />
              Today’s Workshop Schedule
            </h2>
            <button
              type="button"
              onClick={() => navigate('/bookings')}
              className="text-xs font-bold text-blue-700 hover:underline"
            >
              View all bookings →
            </button>
          </div>
          {dashboardData.todayWorkshop.length ? (
            <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
              {dashboardData.todayWorkshop.map((booking) => (
                <button
                  key={booking.id}
                  type="button"
                  onClick={() => navigate('/bookings')}
                  className="grid w-full grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 py-3 text-left hover:bg-slate-50 rounded-lg px-2 transition-colors"
                >
                  <span className="text-xs font-extrabold text-blue-700 bg-blue-50 px-2 py-1 rounded-md text-center">
                    {booking.time || '—'}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-slate-900">
                      {booking.vehicle !== '-' ? booking.vehicle : booking.customer}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {booking.service} · {booking.customer}
                    </span>
                  </span>
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                    booking.status === "Confirmed" || booking.status === "Completed"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : booking.status === "Pending"
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : booking.status === "Cancelled"
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : "border-slate-200 bg-slate-50 text-slate-600"
                  }`}>
                    <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />
                    {booking.status}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex h-36 flex-col items-center justify-center rounded-xl bg-slate-50 text-slate-500">
              <Calendar className="mb-2 h-6 w-6 text-slate-300" />
              <p className="text-sm font-semibold">No bookings scheduled today</p>
              <p className="text-xs text-slate-400">Click &apos;New Booking&apos; above to schedule one.</p>
            </div>
          )}
        </section>
      </div>

      {/* Work Order Lifecycle Pipeline Monitor */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-extrabold text-slate-900">{t("work_order_lifecycle")}</h2>
            <p className="text-xs text-slate-500 mt-0.5">Click any stage to filter active work orders</p>
          </div>
          <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
            <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />
            {dashboardData.stats.activeRepairs} active in workshop
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-9">
          {lifecycleKPIs.map((kpi) => {
            const count =
              showDatabaseValues && dashboardData.stats.workOrderStatusCounts
                ? dashboardData.stats.workOrderStatusCounts[kpi.key] || 0
                : "-";
            return (
              <button
                key={kpi.key}
                onClick={() => navigate(`/work-orders?status=${kpi.key}`)}
                className={`flex min-h-24 flex-col items-center justify-center rounded-xl border p-3 text-center transition-all ${kpi.color} ${kpi.hoverBg} hover:-translate-y-0.5 hover:shadow-md`}
              >
                <kpi.icon className="h-5 w-5 mb-1.5 opacity-80" />
                <span className="text-[10px] font-bold uppercase tracking-wider opacity-75">
                  {t(`status_${kpi.key}`)}
                </span>
                <span className="text-xl font-extrabold mt-1">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Revenue Trend Chart */}
        {canViewFinance ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-900">
                {t("monthly_revenue_trend")} (Last 6 Months)
              </h3>
              <span className="text-xs font-bold text-slate-400">Paid Invoices</span>
            </div>
            {hasRevenueData ? (
              <div id="revenue-chart-container" className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={dashboardData.monthlyRevenue}
                    margin={{ top: 10, right: 20, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                    <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} tickFormatter={(val) => `RM ${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`} />
                    <Tooltip
                      formatter={(val: any) => [`RM ${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, "Paid Revenue"]}
                      contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke="#1e3a8a"
                      strokeWidth={3}
                      dot={{ r: 4, fill: "#1e3a8a", strokeWidth: 2, stroke: "#ffffff" }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyPanel message="No paid revenue recorded in the last six months" />
            )}
          </div>
        ) : null}

        {/* Weekly Bookings Distribution Chart */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-extrabold text-slate-900">
              {t("week_booking_stats")} (Last 7 Days)
            </h3>
            <span className="text-xs font-bold text-slate-400">Daily Demand</span>
          </div>
          {hasBookingData ? (
            <div id="bookings-chart-container" className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={dashboardData.weeklyBookings}
                  margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="day" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip
                    formatter={(val: any) => [`${val} bookings`, "Bookings"]}
                    contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}
                  />
                  <Bar
                    dataKey="bookings"
                    fill="#3b82f6"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyPanel message="No bookings recorded in the last seven days" />
          )}
        </div>
      </div>

      {/* Service Types Breakdown & Recent Activity */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Service Types Distribution */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-base font-extrabold text-slate-900">
            {t("service_types_distribution")}
          </h3>
          {dashboardData.serviceTypes.length ? (
            <div id="service-chart-container" className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={dashboardData.serviceTypes}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={80}
                    innerRadius={45}
                    dataKey="value"
                    nameKey="name"
                  >
                    {dashboardData.serviceTypes.map((entry, index) => (
                      <Cell key={`service-cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val: any) => [`${val} jobs`, "Count"]} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyPanel message="No service breakdown available this month" />
          )}
        </section>

        {/* Live Recent Activity Feed */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-base font-extrabold text-slate-900">
              <Activity className="h-5 w-5 text-blue-600" />
              Live Operational Activity
            </h3>
            <span className="text-xs text-slate-400 font-medium">Real-time workshop updates</span>
          </div>
          {dashboardData.recentActivity.length ? (
            <div className="grid gap-x-6 divide-y divide-slate-100 md:grid-cols-2 md:divide-y-0 max-h-72 overflow-y-auto">
              {dashboardData.recentActivity.map((event) => {
                const EventIcon = event.type === "invoice" ? CircleDollarSign : event.type === "parts" ? Boxes : Wrench;
                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => navigate(event.route)}
                    className="flex items-center py-3 text-left hover:bg-slate-50 rounded-lg px-2 transition-colors"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                      <EventIcon className="h-4 w-4" />
                    </span>
                    <span className="ml-3 min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-slate-800">{event.title}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {event.detail} · {dashboardTime(event.time)}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-300" />
                  </button>
                );
              })}
            </div>
          ) : (
            <EmptyPanel message="No recent operational activity recorded" />
          )}
        </section>
      </div>
    </div>
  );
}
