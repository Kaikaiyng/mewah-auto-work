import { useMemo, useState } from "react";
import {
  Activity,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Fingerprint,
  Search,
  ShieldCheck,
  UserRound,
  Download,
  Copy,
  Check,
  X,
  FileText,
  RotateCcw,
  Sparkles,
  Monitor,
  Smartphone,
  Wrench,
  Database,
} from "lucide-react";
import { useApiData } from "../lib/use-api-data";
import { PageLoading } from "./ui/page-loading";
import { AdminSelect } from "./ui/admin-select";
import { AdminPagination } from "./ui/admin-pagination";
import { exportTableToExcel, ExcelColumnDef } from "../lib/excel-export";
import { toast } from "sonner";
import { AdminMetricCard } from "./ui/admin-metric-card";

interface AuditItem {
  id: number;
  action: string;
  category: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  description: string;
  metadata: Record<string, unknown>;
  actorId: number;
  actorName: string;
  actorRole: string;
  actorSource?: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
}

interface AuditResponse {
  items: AuditItem[];
  stats: {
    total: number;
    today: number;
    activeActors: number;
    securityEvents: number;
  };
}

const EMPTY_AUDIT_RESPONSE: AuditResponse = {
  items: [],
  stats: { total: 0, today: 0, activeActors: 0, securityEvents: 0 },
};

type AuditSourceType = "admin" | "customer" | "workshop" | "autocount";

function resolveSource(item: { action: string; actorRole?: string; actorSource?: string }) {
  const source = (item.actorSource || "").toLowerCase();
  const action = (item.action || "").toLowerCase();
  const role = (item.actorRole || "").toLowerCase();

  if (source.includes("customer") || action.startsWith("customer-") || role === "customer" || action === "add-booking" || action === "add-vehicle") {
    return {
      type: "customer" as AuditSourceType,
      label: "Customer App",
      icon: Smartphone,
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }
  if (source.includes("workshop") || source.includes("staff") || action.startsWith("workshop-") || role === "mechanic" || role === "technician") {
    return {
      type: "workshop" as AuditSourceType,
      label: "Workshop App",
      icon: Wrench,
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }
  if (action.startsWith("sync-") || source.includes("autocount_connector") || source === "sync_agent") {
    return {
      type: "autocount" as AuditSourceType,
      label: "AutoCount ERP",
      icon: Database,
      className: "border-purple-200 bg-purple-50 text-purple-700",
    };
  }
  if (action.startsWith("admin-") || source.includes("admin_users") || source.includes("admin")) {
    return {
      type: "admin" as AuditSourceType,
      label: "Admin Panel",
      icon: Monitor,
      className: "border-blue-200 bg-blue-50 text-blue-700",
    };
  }
  return {
    type: "admin" as AuditSourceType,
    label: "Admin Panel",
    icon: Monitor,
    className: "border-blue-200 bg-blue-50 text-blue-700",
  };
}

function readableAction(action: string) {
  return action
    .replace(/^(admin-|workshop-|customer-|sync-)/, "")
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function actorSourceLabel(action: string, actorRole: string) {
  if (action.startsWith("customer-")) return "Customer";
  if (action.startsWith("workshop-")) return actorRole || "Workshop";
  return actorRole || "Admin";
}

function formatDateTime(value: string) {
  if (!value) return "-";
  const parsed = new Date(value.replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-MY", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function categoryTone(category: string) {
  const tones: Record<string, string> = {
    Workshop: "border-blue-200 bg-blue-50 text-blue-700",
    Inventory: "border-amber-200 bg-amber-50 text-amber-700",
    Finance: "border-emerald-200 bg-emerald-50 text-emerald-700",
    "Security & Admin": "border-violet-200 bg-violet-50 text-violet-700",
    "Customer Data": "border-cyan-200 bg-cyan-50 text-cyan-700",
    "Customer Portal": "border-teal-200 bg-teal-50 text-teal-700",
    Communication: "border-pink-200 bg-pink-50 text-pink-700",
  };
  return tones[category] || "border-slate-200 bg-slate-50 text-slate-700";
}

function actionVerbBadge(action: string) {
  const lower = action.toLowerCase();
  if (lower.includes("create") || lower.includes("save")) {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }
  if (lower.includes("approve")) {
    return "bg-teal-50 text-teal-700 border-teal-200";
  }
  if (lower.includes("issue") || lower.includes("send")) {
    return "bg-cyan-50 text-cyan-700 border-cyan-200";
  }
  if (lower.includes("sync") || lower.includes("queue")) {
    return "bg-purple-50 text-purple-700 border-purple-200";
  }
  if (lower.includes("delete") || lower.includes("void") || lower.includes("cancel") || lower.includes("reject")) {
    return "bg-rose-50 text-rose-700 border-rose-200";
  }
  if (lower.includes("login") || lower.includes("logout") || lower.includes("auth")) {
    return "bg-amber-50 text-amber-700 border-amber-200";
  }
  return "bg-blue-50 text-blue-700 border-blue-200";
}

export function AuditTrail() {
  const { data, isLoading, error, reload, hasLoaded } = useApiData<AuditResponse>(
    "admin-audit-trail",
    EMPTY_AUDIT_RESPONSE,
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [category, setCategory] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [actor, setActor] = useState("all");
  const [dateRange, setDateRange] = useState("30");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const categories = useMemo(
    () => Array.from(new Set(data.items.map((item) => item.category))).filter(Boolean).sort(),
    [data.items],
  );

  const entityTypes = useMemo(
    () => Array.from(new Set(data.items.map((item) => item.entityType))).filter(Boolean).sort(),
    [data.items],
  );

  const actors = useMemo(
    () => Array.from(new Set(data.items.map((item) => item.actorName))).filter(Boolean).sort(),
    [data.items],
  );

  const filteredItems = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const rangeDays = Number(dateRange);
    const minimumDate = rangeDays > 0 ? Date.now() - rangeDays * 86_400_000 : 0;
    return data.items.filter((item) => {
      const srcInfo = resolveSource(item);
      const searchable = [
        item.action,
        item.description,
        item.actorName,
        item.actorRole,
        srcInfo.label,
        item.entityType,
        item.entityId,
        item.entityLabel,
        item.ipAddress,
      ].join(" ").toLowerCase();
      const timestamp = new Date(item.createdAt.replace(" ", "T")).getTime();
      return (!query || searchable.includes(query))
        && (sourceFilter === "all" || srcInfo.type === sourceFilter)
        && (category === "all" || item.category === category)
        && (entityFilter === "all" || item.entityType === entityFilter)
        && (actor === "all" || item.actorName === actor)
        && (!minimumDate || (!Number.isNaN(timestamp) && timestamp >= minimumDate));
    });
  }, [actor, category, data.items, dateRange, entityFilter, searchTerm, sourceFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleItems = filteredItems.slice((safePage - 1) * pageSize, safePage * pageSize);

  const updateFilter = (update: () => void) => {
    update();
    setPage(1);
    setExpandedId(null);
  };

  const handleCopyJson = (item: AuditItem) => {
    const jsonStr = JSON.stringify(item.metadata, null, 2);
    navigator.clipboard.writeText(jsonStr);
    setCopiedId(item.id);
    toast.success("Audit metadata copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExportAudit = async () => {
    if (filteredItems.length === 0) {
      toast.error("No audit records available to export.");
      return;
    }

    const columnDefs: ExcelColumnDef[] = [
      { header: "Timestamp", key: "createdAt", align: "center", minWidth: 20 },
      { header: "Actor Name", key: "actorName", align: "left", minWidth: 20 },
      { header: "Role", key: "actorRole", align: "left", minWidth: 16 },
      { header: "Portal / Source", key: "portalSource", align: "left", minWidth: 18 },
      { header: "Action", key: "action", align: "left", minWidth: 24 },
      { header: "Category", key: "category", align: "left", minWidth: 16 },
      { header: "Entity Type", key: "entityType", align: "left", minWidth: 16 },
      { header: "Record Identifier", key: "entityLabel", align: "left", minWidth: 24 },
      { header: "Description", key: "description", align: "left", minWidth: 40 },
      { header: "IP Address", key: "ipAddress", align: "center", minWidth: 16, numFmt: "@" },
    ];

    const rows = filteredItems.map((item) => ({
      createdAt: item.createdAt ? String(item.createdAt).slice(0, 19).replace("T", " ") : "-",
      actorName: String(item.actorName || "-"),
      actorRole: String(item.actorRole || "-"),
      portalSource: resolveSource(item).label,
      action: readableAction(item.action),
      category: String(item.category || "-").toUpperCase(),
      entityType: String(item.entityType || "-"),
      entityLabel: String(item.entityLabel || item.entityId || "-"),
      description: String(item.description || "-"),
      ipAddress: String(item.ipAddress || "-"),
    }));

    const fileName = `maw-audit-trail-${new Date().toISOString().slice(0, 10)}.xlsx`;
    await exportTableToExcel({
      fileName,
      sheetName: "Audit Trail",
      columns: columnDefs,
      data: rows,
      successMessage: `Exported ${filteredItems.length} audit logs to ${fileName}`,
    });
  };

  if (isLoading && !hasLoaded) {
    return (
      <PageLoading
        title="Loading Audit Trail..."
        description="Fetching administrative activity logs and security history..."
      />
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Audit Trail</h1>
          <p className="mt-1 text-xs text-slate-500">
            Immutable operational and security audit log tracking all actions across Admin Panel, Customer App, Workshop, and ERP Sync.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportAudit}
            disabled={isLoading || filteredItems.length === 0}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            <Download className="h-4 w-4 text-slate-500" />
            Export Excel
          </button>
          <button
            type="button"
            onClick={() => void reload()}
            disabled={isLoading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#1e3a8a] px-4 text-xs font-bold text-white shadow-2xs transition-colors hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
          >
            <RotateCcw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
          Audit Trail is unavailable: {error}.
        </div>
      ) : null}

      {/* Metric Cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard
          label="Total Logged Events"
          value={data.stats.total.toLocaleString()}
          detail="All-time recorded entries"
          icon={Activity}
          iconClassName="bg-blue-50 text-blue-700"
          valueClassName="text-slate-900"
        />
        <AdminMetricCard
          label="Events Today"
          value={data.stats.today.toLocaleString()}
          detail="Recorded since midnight"
          icon={CalendarDays}
          iconClassName="bg-emerald-50 text-emerald-700"
          valueClassName="text-emerald-700"
        />
        <AdminMetricCard
          label="Active Actors (30d)"
          value={data.stats.activeActors.toLocaleString()}
          detail="Unique users who changed state"
          icon={UserRound}
          iconClassName="bg-indigo-50 text-indigo-700"
          valueClassName="text-indigo-700"
        />
        <AdminMetricCard
          label="Security & Admin"
          value={data.stats.securityEvents.toLocaleString()}
          detail="Logins, auth, and critical updates"
          icon={Fingerprint}
          iconClassName="bg-violet-50 text-violet-700"
          valueClassName="text-violet-700"
        />
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => updateFilter(() => setSearchTerm(event.target.value))}
            placeholder="Search action, record identifier, actor name, user, IP..."
            className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-8 text-xs outline-none shadow-2xs placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => updateFilter(() => setSearchTerm(""))}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="w-40 sm:w-44">
          <AdminSelect value={sourceFilter} onChange={(event) => updateFilter(() => setSourceFilter(event.target.value))} className="h-10 text-xs">
            <option value="all">All Portals</option>
            <option value="admin">Admin Panel</option>
            <option value="customer">Customer App</option>
            <option value="workshop">Workshop App</option>
            <option value="autocount">AutoCount ERP</option>
          </AdminSelect>
        </div>

        <div className="w-40 sm:w-44">
          <AdminSelect value={category} onChange={(event) => updateFilter(() => setCategory(event.target.value))} className="h-10 text-xs">
            <option value="all">All Categories</option>
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </AdminSelect>
        </div>

        <div className="w-40 sm:w-44">
          <AdminSelect value={entityFilter} onChange={(event) => updateFilter(() => setEntityFilter(event.target.value))} className="h-10 text-xs">
            <option value="all">All Entity Types</option>
            {entityTypes.map((item) => <option key={item} value={item}>{item.replace("-", " ")}</option>)}
          </AdminSelect>
        </div>

        <div className="w-36 sm:w-40">
          <AdminSelect value={dateRange} onChange={(event) => updateFilter(() => setDateRange(event.target.value))} className="h-10 text-xs">
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="0">All records</option>
          </AdminSelect>
        </div>

        {(searchTerm || sourceFilter !== "all" || category !== "all" || entityFilter !== "all" || dateRange !== "30") && (
          <button
            type="button"
            onClick={() => {
              setSearchTerm("");
              setSourceFilter("all");
              setCategory("all");
              setEntityFilter("all");
              setDateRange("30");
              setPage(1);
            }}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Audit Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50/70">
              <tr className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                <th scope="col" className="px-5 py-3.5 text-left whitespace-nowrap">Timestamp</th>
                <th scope="col" className="px-5 py-3.5 text-left">Actor &amp; Role</th>
                <th scope="col" className="px-5 py-3.5 text-left">Portal / Source</th>
                <th scope="col" className="px-5 py-3.5 text-left">Action</th>
                <th scope="col" className="px-5 py-3.5 text-left">Record Identifier</th>
                <th scope="col" className="px-5 py-3.5 text-left">Category</th>
                <th scope="col" className="w-12 px-5 py-3.5 text-right whitespace-nowrap">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-xs">
              {isLoading && data.items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center text-slate-400 font-medium">
                    Loading audit events…
                  </td>
                </tr>
              ) : visibleItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center">
                    <ShieldCheck className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                    <p className="text-sm font-semibold text-slate-600">No audit records found</p>
                    <p className="mt-1 text-xs text-slate-400">Try adjusting search keywords, entity filters, portal filter, or date range.</p>
                  </td>
                </tr>
              ) : (
                visibleItems.map((item) => {
                  const expanded = expandedId === item.id;
                  const source = resolveSource(item);
                  return [
                    <tr key={`row-${item.id}`} className="align-middle transition-colors hover:bg-slate-50/50">
                      <td className="whitespace-nowrap px-5 py-4 font-mono text-xs text-slate-500 font-medium">
                        {formatDateTime(item.createdAt)}
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-bold text-slate-900">{item.actorName}</p>
                        <p className="mt-0.5 text-xs text-slate-500 font-medium">
                          <span>{actorSourceLabel(item.action, item.actorRole)}</span>
                          {item.ipAddress ? <span className="font-mono text-[11px] text-slate-400"> · {item.ipAddress}</span> : null}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${source.className}`}>
                          {source.label}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-bold ${actionVerbBadge(item.action)}`}>
                          {readableAction(item.action)}
                        </span>
                        <p className="mt-1 max-w-[340px] truncate text-xs text-slate-600 font-medium" title={item.description}>
                          {item.description}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-slate-700">
                        <span className="font-bold text-[10px] uppercase tracking-wider text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          {item.entityType.replaceAll("-", " ")}
                        </span>
                        {item.entityLabel || item.entityId ? (
                          <p className="mt-1 text-xs font-bold text-slate-900 font-mono">{item.entityLabel || `#${item.entityId}`}</p>
                        ) : null}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-bold ${categoryTone(item.category)}`}>
                          {item.category}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right whitespace-nowrap">
                        <div className="flex justify-end">
                          <button
                          type="button"
                          onClick={() => setExpandedId(expanded ? null : item.id)}
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none cursor-pointer ${expanded ? "bg-slate-100 text-slate-800" : ""}`}
                          aria-label={expanded ? "Hide audit details" : "Show audit details"}
                          aria-expanded={expanded}
                        >
                          <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
                        </button>
                      </div>
                    </td>
                    </tr>,
                    expanded ? (
                      <tr key={`details-${item.id}`} className="bg-slate-50/80">
                        <td colSpan={7} className="px-5 py-4">
                          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Event #{item.id}</span>
                                <span className="text-slate-300">·</span>
                                <code className="rounded bg-slate-100 px-2 py-0.5 text-xs font-mono font-bold text-slate-700">{item.action}</code>
                                <span className="text-slate-300">·</span>
                                <span className="text-xs text-slate-500 font-mono">{item.createdAt}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleCopyJson(item)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                              >
                                {copiedId === item.id ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-slate-500" />}
                                {copiedId === item.id ? "Copied" : "Copy Payload"}
                              </button>
                            </div>

                            <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
                              <div className="space-y-2.5 text-xs">
                                <div className="rounded-xl bg-slate-50 p-3.5 space-y-1.5 border border-slate-100">
                                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Actor Context</p>
                                  <p><span className="text-slate-500">User:</span> <span className="font-bold text-slate-900">{item.actorName}</span> (ID: {item.actorId || "System"})</p>
                                  <p><span className="text-slate-500">Role:</span> <span className="font-bold text-slate-900">{item.actorRole}</span></p>
                                  <p><span className="text-slate-500">Portal / Source:</span> <span className={`inline-flex items-center ml-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${source.className}`}>{source.label}</span></p>
                                  <p><span className="text-slate-500">IP Address:</span> <span className="font-mono font-medium text-slate-800">{item.ipAddress || "Unknown"}</span></p>
                                </div>

                                <div className="rounded-xl bg-slate-50 p-3.5 space-y-1.5 border border-slate-100">
                                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Target Entity</p>
                                  <p><span className="text-slate-500">Module:</span> <span className="font-bold text-slate-900">{item.category} / {item.entityType}</span></p>
                                  <p><span className="text-slate-500">Target ID:</span> <span className="font-mono font-bold text-slate-900">{item.entityId || "N/A"}</span></p>
                                  <p><span className="text-slate-500">Target Label:</span> <span className="font-bold text-slate-900">{item.entityLabel || "N/A"}</span></p>
                                </div>
                              </div>

                              <div className="space-y-1.5">
                                <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Metadata Payload</p>
                                <pre className="max-h-60 overflow-auto rounded-xl bg-slate-900 p-3.5 font-mono text-xs text-slate-100 leading-relaxed border border-slate-800">
                                  {JSON.stringify(item.metadata, null, 2)}
                                </pre>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null,
                  ];
                })
              )}
            </tbody>
          </table>
        </div>

        <AdminPagination
          currentPage={safePage}
          totalPages={totalPages}
          totalItems={filteredItems.length}
          pageSize={pageSize}
          pageSizeOptions={[10, 25, 50, 100]}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          itemLabel="audit events"
        />
      </div>
    </div>
  );
}
