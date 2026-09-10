import { useEffect, useState, useMemo } from "react";
import {
  CalendarDays,
  DollarSign,
  TrendingDown,
  TrendingUp,
  Users,
  Wrench,
  BarChart3,
  Building2,
  Package,
  Layers,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { postApi } from "../lib/api";
import { AdminSelect } from "./ui/admin-select";
import { AdminMetricCard } from "./ui/admin-metric-card";
import { PageLoading } from "./ui/page-loading";

type ChangeMetric = {
  change: string;
  trend: "up" | "down" | "neutral";
};

type ReportData = {
  period: {
    key: string;
    start: string;
    endExclusive: string;
    previousStart: string;
  };
  asOf: string;
  metrics: {
    totalRevenue: number;
    revenueChange: ChangeMetric;
    totalBookings: number;
    bookingsChange: ChangeMetric;
    averageBookingValue: number;
    activeContacts: number;
  };
  trend: Array<{ id: string; label: string; revenue: number; bookings: number }>;
  serviceBreakdown: Array<{ id: string; name: string; value: number }>;
  topContacts: Array<{ id: string; name: string; bookings: number; revenue: number }>;
  partsPerformance: Array<{ id: string; category: string; sales: number; revenue: number }>;
  definitions: {
    revenue: string;
    bookings: string;
    activeContacts: string;
  };
};

const EMPTY_REPORT: ReportData = {
  period: { key: "month", start: "", endExclusive: "", previousStart: "" },
  asOf: "",
  metrics: {
    totalRevenue: 0,
    revenueChange: { change: "0%", trend: "neutral" },
    totalBookings: 0,
    bookingsChange: { change: "0%", trend: "neutral" },
    averageBookingValue: 0,
    activeContacts: 0,
  },
  trend: [],
  serviceBreakdown: [],
  topContacts: [],
  partsPerformance: [],
  definitions: { revenue: "", bookings: "", activeContacts: "" },
};

const PERIODS = [
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "quarter", label: "This Quarter" },
  { value: "year", label: "This Year" },
];

const COLORS = ["#1e3a8a", "#2563eb", "#3b82f6", "#60a5fa", "#93c5fd", "#bfdbfe", "#cbd5e1"];

function MetricChangeBadge({ metric }: { metric: ChangeMetric }) {
  if (!metric.change || metric.change === "0%") {
    return <span className="text-xs text-slate-400 font-medium">0% vs prev period</span>;
  }
  const isUp = metric.trend === "up";
  if (metric.change === "New") {
    return (
      <span className="inline-flex items-center text-xs font-bold text-emerald-600">
        <ArrowUpRight className="mr-1 h-3.5 w-3.5" />New Activity
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center text-xs font-bold ${isUp ? "text-emerald-600" : "text-rose-600"}`}>
      {isUp ? <ArrowUpRight className="mr-1 h-3.5 w-3.5" /> : <ArrowDownRight className="mr-1 h-3.5 w-3.5" />}
      {metric.change} vs prev period
    </span>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-[280px] flex-col items-center justify-center rounded-xl bg-slate-50 text-center">
      <BarChart3 className="mb-2 h-7 w-7 text-slate-300" />
      <p className="text-sm font-semibold text-slate-600">{message}</p>
      <p className="mt-0.5 text-xs text-slate-400">Records will reflect here once available for this timeframe.</p>
    </div>
  );
}

function getEvenlySpacedTrendTicks(trend: ReportData["trend"], maximumTicks = 7) {
  if (trend.length <= maximumTicks) {
    return trend.map((item) => item.label);
  }

  const lastIndex = trend.length - 1;
  const tickIndexes = Array.from(
    { length: maximumTicks },
    (_, index) => Math.round((index * lastIndex) / (maximumTicks - 1)),
  );
  return [...new Set(tickIndexes)].map((index) => trend[index].label);
}

export function Reports() {
  const [selectedPeriod, setSelectedPeriod] = useState("month");
  const [report, setReport] = useState<ReportData>(EMPTY_REPORT);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "services" | "clients" | "parts">("overview");

  const revenueTrendTicks = useMemo(() => getEvenlySpacedTrendTicks(report.trend), [report.trend]);

  const totalPartsRevenue = useMemo(() => {
    return (report.partsPerformance || []).reduce((sum, item) => sum + (item.revenue || 0), 0);
  }, [report.partsPerformance]);

  const totalPartsUnits = useMemo(() => {
    return (report.partsPerformance || []).reduce((sum, item) => sum + (item.sales || 0), 0);
  }, [report.partsPerformance]);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError("");
    setReport(EMPTY_REPORT);
    postApi<ReportData>("admin-reports", { period: selectedPeriod })
      .then((result) => {
        if (active) setReport(result);
      })
      .catch((caught) => {
        if (!active) return;
        setReport(EMPTY_REPORT);
        setError(caught instanceof Error ? caught.message : "Unable to load report data.");
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
          setHasLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, [selectedPeriod]);



  if (isLoading && !hasLoaded) {
    return (
      <PageLoading
        title="Loading Reports..."
        description="Aggregating financial metrics and performance analytics..."
      />
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
          <p className="text-xs text-slate-500 mt-1">
            Financial analytics, service distribution and operational performance
          </p>
        </div>
        <div className="flex items-center gap-3">
          <AdminSelect
            value={selectedPeriod}
            onChange={(event) => setSelectedPeriod(event.target.value)}
            className="border border-gray-300 px-4 py-2 rounded-xl text-sm font-semibold shadow-sm bg-white"
            aria-label="Report period"
          >
            {PERIODS.map((period) => (
              <option key={period.value} value={period.value}>
                {period.label}
              </option>
            ))}
          </AdminSelect>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">
          Report data connection notice: {error}.
        </div>
      ) : null}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard
          label="Paid Revenue"
          value={isLoading ? "—" : `RM ${report.metrics.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          detail={!isLoading ? <MetricChangeBadge metric={report.metrics.revenueChange} /> : "Loading report data"}
          icon={DollarSign}
        />
        <AdminMetricCard
          label="Service Bookings"
          value={isLoading ? "—" : report.metrics.totalBookings.toLocaleString()}
          detail={!isLoading ? <MetricChangeBadge metric={report.metrics.bookingsChange} /> : "Loading report data"}
          icon={Wrench}
          iconClassName="bg-indigo-50 text-indigo-700"
        />
        <AdminMetricCard
          label="Avg. Booking Value"
          value={isLoading ? "—" : `RM ${report.metrics.averageBookingValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          detail="Revenue per completed job"
          icon={TrendingUp}
          iconClassName="bg-purple-50 text-purple-700"
        />
        <AdminMetricCard
          label="Active Contacts & Fleets"
          value={isLoading ? "—" : report.metrics.activeContacts.toLocaleString()}
          detail="Engaged during this timeframe"
          icon={Users}
          iconClassName="bg-emerald-50 text-emerald-700"
          valueClassName="text-emerald-600"
        />
      </div>

      {/* Analytics View Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={`inline-flex items-center rounded-xl px-4 py-2 text-sm font-bold transition-all ${
            activeTab === "overview"
              ? "bg-[#1e3a8a] text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <BarChart3 className="mr-2 h-4 w-4" />
          Overview & Revenue Trend
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("services")}
          className={`inline-flex items-center rounded-xl px-4 py-2 text-sm font-bold transition-all ${
            activeTab === "services"
              ? "bg-[#1e3a8a] text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <Layers className="mr-2 h-4 w-4" />
          Service Breakdown
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("clients")}
          className={`inline-flex items-center rounded-xl px-4 py-2 text-sm font-bold transition-all ${
            activeTab === "clients"
              ? "bg-[#1e3a8a] text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <Building2 className="mr-2 h-4 w-4" />
          Top Clients & Fleets
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("parts")}
          className={`inline-flex items-center rounded-xl px-4 py-2 text-sm font-bold transition-all ${
            activeTab === "parts"
              ? "bg-[#1e3a8a] text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <Package className="mr-2 h-4 w-4" />
          Parts Performance
        </button>
      </div>

      {/* Tab 1: Overview & Revenue Trend */}
      {activeTab === "overview" && (
        <div className="space-y-5">
          {/* Revenue Area Chart */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-extrabold text-slate-900">Revenue Progression</h2>
                <p className="text-xs text-slate-500 mt-0.5">Paid invoice totals across selected time intervals</p>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                RM {report.metrics.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })} Total
              </span>
            </div>
            {report.trend.length === 0 ? (
              <EmptyChart message={isLoading ? "Loading report trend…" : "No dated invoices or bookings in this period."} />
            ) : (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={report.trend} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                    <defs>
                      <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="label"
                      ticks={revenueTrendTicks}
                      interval={0}
                      minTickGap={20}
                      tickMargin={8}
                      stroke="#94a3b8"
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis
                      stroke="#94a3b8"
                      tick={{ fontSize: 12 }}
                      tickFormatter={(val) => `RM ${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                    />
                    <Tooltip
                      formatter={(val: any) => [`RM ${Number(val).toFixed(2)}`, "Paid Revenue"]}
                      contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="#1e3a8a"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#colorRev)"
                      name="Paid Revenue"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Bookings Distribution & Snapshot */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-extrabold text-slate-900">Service Bookings Volume</h3>
                <span className="text-xs font-bold text-slate-400">Total: {report.metrics.totalBookings}</span>
              </div>
              {report.trend.length === 0 ? (
                <EmptyChart message="No service bookings in this period." />
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={report.trend} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="label" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                      <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} allowDecimals={false} />
                      <Tooltip
                        formatter={(val: any) => [`${val} bookings`, "Bookings"]}
                        contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0" }}
                      />
                      <Bar dataKey="bookings" fill="#3b82f6" radius={[6, 6, 0, 0]} name="Bookings" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 mb-2">Executive Summary</h3>
                <p className="text-xs text-slate-500 mb-4">Core performance indicators for {report.period.key.toUpperCase()}</p>
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
                    <span className="text-xs font-bold text-slate-600">Total Completed Services</span>
                    <span className="text-sm font-extrabold text-slate-900">{report.metrics.totalBookings}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
                    <span className="text-xs font-bold text-slate-600">Total Parts Sales Volume</span>
                    <span className="text-sm font-extrabold text-slate-900">RM {totalPartsRevenue.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
                    <span className="text-xs font-bold text-slate-600">Active Customer Count</span>
                    <span className="text-sm font-extrabold text-slate-900">{report.metrics.activeContacts}</span>
                  </div>
                </div>
              </div>
              <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/80 p-3 text-xs text-blue-900">
                <span className="font-bold">Period Range:</span> {report.period.start || "—"} to {report.period.endExclusive || "—"}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Service Breakdown */}
      {activeTab === "services" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-base font-extrabold text-slate-900">Service Category Distribution</h2>
            {report.serviceBreakdown.length === 0 ? (
              <EmptyChart message="No service bookings in this period." />
            ) : (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={report.serviceBreakdown}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                      outerRadius={95}
                      innerRadius={50}
                      dataKey="value"
                    >
                      {report.serviceBreakdown.map((entry, index) => (
                        <Cell key={entry.id || `service-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val: any) => [`${val} jobs`, "Count"]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-base font-extrabold text-slate-900">Service Breakdown List</h2>
            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
              {report.serviceBreakdown.map((svc, index) => (
                <div key={svc.id || svc.name} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="h-3.5 w-3.5 rounded-full shrink-0"
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    />
                    <span className="text-sm font-bold text-slate-800">{svc.name}</span>
                  </div>
                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                    <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />
                    {svc.value} bookings
                  </span>
                </div>
              ))}
              {report.serviceBreakdown.length === 0 && (
                <p className="py-12 text-center text-sm text-slate-400">No service categories recorded.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Top Clients & Fleets */}
      {activeTab === "clients" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-extrabold text-slate-900">Top Revenue Clients & Corporate Fleets</h2>
              <p className="text-xs text-slate-500 mt-0.5">Ranked by total billed invoice revenue during this period</p>
            </div>
            <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
              <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />
              {report.topContacts.length} clients ranked
            </span>
          </div>
          {report.topContacts.length === 0 ? (
            <EmptyChart message="No client or fleet activity recorded in this period." />
          ) : (
            <div className="space-y-2.5">
              {report.topContacts.map((contact, index) => (
                <div
                  key={contact.id || contact.name}
                  className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50/70 p-3.5 hover:bg-blue-50/50 transition-colors"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1e3a8a] text-xs font-bold text-white shadow-sm">
                      {index + 1}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{contact.name}</p>
                      <p className="text-xs text-slate-500">{contact.bookings} completed bookings / jobs</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-extrabold text-[#1e3a8a]">
                      RM {contact.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-[11px] text-slate-400">Total Billed</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Parts Performance */}
      {activeTab === "parts" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-base font-extrabold text-slate-900">Parts Category Sales Distribution</h2>
            {report.partsPerformance.length === 0 ? (
              <EmptyChart message="No dated parts activity in this period." />
            ) : (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={report.partsPerformance} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="category" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                    <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(val: any) => [`RM ${Number(val).toFixed(2)}`, "Revenue"]}
                      contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0" }}
                    />
                    <Bar dataKey="revenue" fill="#1e3a8a" radius={[6, 6, 0, 0]} name="Revenue" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-base font-extrabold text-slate-900">Parts Category Performance Details</h2>
            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
              {report.partsPerformance.map((part) => (
                <div key={part.id || part.category} className="py-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-bold text-slate-900">{part.category}</p>
                    <p className="text-sm font-extrabold text-[#1e3a8a]">
                      RM {part.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>{part.sales} units billed</span>
                    <span>Avg Unit Price: RM {part.sales > 0 ? (part.revenue / part.sales).toFixed(2) : "0.00"}</span>
                  </div>
                </div>
              ))}
              {report.partsPerformance.length === 0 && (
                <p className="py-12 text-center text-sm text-slate-400">No parts activity recorded in this period.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Audit & Period Footnote */}
      <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm text-blue-950 shadow-sm">
        <div className="flex items-start gap-3">
          <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
          <div className="space-y-1">
            <p className="font-bold text-blue-900">
              Period Audit: {report.period.start || "—"} to {report.period.endExclusive || "—"} (end date exclusive)
            </p>
            <p className="text-xs text-blue-800">{report.definitions.revenue}</p>
            <p className="text-xs text-blue-800">{report.definitions.bookings}</p>
            <p className="text-xs text-blue-800">{report.definitions.activeContacts}</p>
            {report.asOf && (
              <p className="text-[11px] font-semibold text-blue-600 pt-1">
                Report generated at: {new Date(report.asOf).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
