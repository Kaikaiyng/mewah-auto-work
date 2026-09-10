import { useMemo, useState, useCallback, useEffect } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Fingerprint,
  HardDrive,
  RefreshCw,
  Search,
  ServerCrash,
  ShieldCheck,
  Timer,
  X,
  Zap,
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

interface LogEntry {
  ts: string;
  level: "FATAL" | "ERROR" | "WARN" | "INFO";
  message: string;
  context: Record<string, unknown>;
  mode: string;
  ip: string;
  actor: string;
}

interface LogFile {
  month: string;
  sizeBytes: number;
  lines: number;
}

interface SystemHealth {
  phpVersion: string;
  serverTime: string;
  memoryUsage: string;
  memoryLimit: string;
  mysqlConnected: boolean;
  mysqlVersion: string;
  logsDirWritable: boolean;
  logFileExists: boolean;
  logFileSize: number;
}

interface LogsResponse {
  availableFiles: LogFile[];
  month: string;
  entries: LogEntry[];
  levelCounts?: { total: number; fatal: number; error: number; warn: number; info: number; };
  pagination: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
  systemHealth?: SystemHealth;
}

const EMPTY: LogsResponse = {
  availableFiles: [],
  month: "",
  entries: [],
  pagination: { page: 1, perPage: 100, total: 0, totalPages: 1 },
};

type AppLogSourceType = "admin" | "customer" | "workshop" | "autocount" | "system";

function resolveAppLogSource(entry: LogEntry) {
  const mode = (entry.mode || "").toLowerCase();
  const actor = (entry.actor || "").toLowerCase();
  const msg = (entry.message || "").toLowerCase();

  if (
    mode.startsWith("customer-") ||
    actor.includes("customer") ||
    mode === "add-booking" ||
    mode === "add-vehicle" ||
    mode === "login" ||
    msg.includes("customer portal")
  ) {
    return {
      type: "customer" as AppLogSourceType,
      label: "Customer App",
      icon: Smartphone,
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }
  if (
    mode.startsWith("workshop-") ||
    actor.includes("workshop") ||
    actor.includes("mechanic") ||
    actor.includes("technician") ||
    msg.includes("workshop")
  ) {
    return {
      type: "workshop" as AppLogSourceType,
      label: "Workshop App",
      icon: Wrench,
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }
  if (
    mode.startsWith("sync-") ||
    (mode.includes("autocount") && !mode.startsWith("admin-")) ||
    msg.includes("[erp sync]") ||
    actor === "sync_agent"
  ) {
    return {
      type: "autocount" as AppLogSourceType,
      label: "AutoCount ERP",
      icon: Database,
      className: "border-purple-200 bg-purple-50 text-purple-700",
    };
  }
  if (mode.startsWith("admin-") || actor.includes("admin") || msg.includes("[audit]")) {
    return {
      type: "admin" as AppLogSourceType,
      label: "Admin Panel",
      icon: Monitor,
      className: "border-blue-200 bg-blue-50 text-blue-700",
    };
  }
  return {
    type: "system" as AppLogSourceType,
    label: "Server / System",
    icon: Activity,
    className: "border-slate-200 bg-slate-50 text-slate-700",
  };
}

function levelStyle(level: string) {
  switch (level) {
    case "FATAL":
      return {
        row: "bg-red-50/60",
        badge: "border-red-300 bg-red-100 text-red-700",
        icon: <ServerCrash className="h-3.5 w-3.5" />,
      };
    case "ERROR":
      return {
        row: "bg-orange-50/40",
        badge: "border-orange-300 bg-orange-100 text-orange-700",
        icon: <AlertCircle className="h-3.5 w-3.5" />,
      };
    case "WARN":
      return {
        row: "bg-amber-50/30",
        badge: "border-amber-300 bg-amber-100 text-amber-700",
        icon: <AlertTriangle className="h-3.5 w-3.5" />,
      };
    default:
      return {
        row: "",
        badge: "border-slate-200 bg-slate-50 text-slate-600",
        icon: <Activity className="h-3.5 w-3.5" />,
      };
  }
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatTs(ts: string) {
  if (!ts) return "-";
  const d = new Date(ts.replace(" ", "T"));
  return isNaN(d.getTime())
    ? ts
    : new Intl.DateTimeFormat("en-MY", {
        dateStyle: "short",
        timeStyle: "medium",
      }).format(d);
}

export function AppLogs() {
  const [month, setMonth] = useState("");
  const [level, setLevel] = useState("ALL");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(0);

  const query = useMemo(() => {
    const parts: string[] = [`level=${level}`, `page=${page}`];
    if (month) parts.push(`month=${month}`);
    if (search) parts.push(`search=${encodeURIComponent(search)}`);
    return `admin-app-logs&${parts.join("&")}`;
  }, [level, month, page, search]);

  const { data, isLoading, error, reload, hasLoaded } = useApiData<LogsResponse>(query, EMPTY);

  useEffect(() => {
    if (autoRefreshInterval <= 0) return;
    const timer = setInterval(() => {
      void reload();
    }, autoRefreshInterval * 1000);
    return () => clearInterval(timer);
  }, [autoRefreshInterval, reload]);

  const handleMonthChange = useCallback((m: string) => {
    setMonth(m);
    setPage(1);
    setExpandedIdx(null);
  }, []);

  const handleLevelChange = useCallback((l: string) => {
    setLevel(l);
    setPage(1);
    setExpandedIdx(null);
  }, []);

  const handlePageChange = useCallback((p: number) => {
    setPage(p);
    setExpandedIdx(null);
  }, []);

  const handleCopyLog = (entry: LogEntry, idx: number) => {
    const payload = JSON.stringify({
      timestamp: entry.ts,
      level: entry.level,
      message: entry.message,
      mode: entry.mode,
      actor: entry.actor,
      ip: entry.ip,
      context: entry.context,
    }, null, 2);
    navigator.clipboard.writeText(payload);
    setCopiedIdx(idx);
    toast.success("Log entry copied to clipboard");
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const handleDownloadLogFile = () => {
    const activeMonth = month || data.month || new Date().toISOString().slice(0, 7);
    const downloadUrl = `/api.php?mode=admin-app-logs&download=1&month=${activeMonth}`;
    window.open(downloadUrl, "_blank");
  };

  const handleExportLogsExcel = async () => {
    if (data.entries.length === 0) {
      toast.error("No log entries available to export.");
      return;
    }

    const columnDefs: ExcelColumnDef[] = [
      { header: "Timestamp", key: "ts", align: "center", minWidth: 20 },
      { header: "Level", key: "level", align: "center", minWidth: 12 },
      { header: "Portal / Source", key: "portalSource", align: "left", minWidth: 18 },
      { header: "Message", key: "message", align: "left", minWidth: 40 },
      { header: "API Action (Mode)", key: "mode", align: "left", minWidth: 24 },
      { header: "Actor", key: "actor", align: "left", minWidth: 18 },
      { header: "IP Address", key: "ip", align: "center", minWidth: 16, numFmt: "@" },
    ];

    const rows = data.entries.map((e) => ({
      ts: e.ts,
      level: e.level,
      portalSource: resolveAppLogSource(e).label,
      message: e.message,
      mode: e.mode || "-",
      actor: e.actor || "-",
      ip: e.ip || "-",
    }));

    const activeMonth = month || data.month || new Date().toISOString().slice(0, 7);
    const fileName = `maw-app-logs-${activeMonth}.xlsx`;
    await exportTableToExcel({
      fileName,
      sheetName: "Application Logs",
      columns: columnDefs,
      data: rows,
      successMessage: `Exported ${data.entries.length} log entries to ${fileName}`,
    });
  };

  const pagination = data.pagination;
  const counts = data.levelCounts || {
    total: pagination.total || data.entries.length,
    fatal: data.entries.filter((e) => e.level === "FATAL").length,
    error: data.entries.filter((e) => e.level === "ERROR").length,
    warn: data.entries.filter((e) => e.level === "WARN").length,
    info: data.entries.filter((e) => e.level === "INFO").length,
  };
  const fatalCount = counts.fatal;
  const errorCount = counts.error;
  const warnCount = counts.warn;
  const health = data.systemHealth;

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const todayIssuesCount = useMemo(() => {
    return data.entries.filter((e) => {
      const isToday = (e.ts || "").startsWith(todayStr);
      const isIssue = e.level === "FATAL" || e.level === "ERROR" || e.level === "WARN";
      return isToday && isIssue;
    }).length;
  }, [data.entries, todayStr]);

  const displayedEntries = useMemo(() => {
    return data.entries.filter((entry) => {
      const srcInfo = resolveAppLogSource(entry);
      if (sourceFilter !== "all" && srcInfo.type !== sourceFilter) return false;
      if (level !== "ALL" && entry.level !== level) return false;
      if (search) {
        const query = search.toLowerCase();
        const searchable = [
          entry.message,
          entry.level,
          srcInfo.label,
          entry.mode,
          entry.actor,
          entry.ip,
          JSON.stringify(entry.context || {}),
        ].join(" ").toLowerCase();
        return searchable.includes(query);
      }
      return true;
    });
  }, [data.entries, level, search, sourceFilter]);

  if (isLoading && !hasLoaded) {
    return (
      <PageLoading
        title="Loading System Logs..."
        description="Reading server diagnostics and application events..."
      />
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Application Logs</h1>
          <p className="mt-1 text-xs text-slate-500">
            Raw structured diagnostic logs capturing exceptions, warnings, performance bottlenecks, and API audit mirrors.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Auto Refresh */}
          <AdminSelect
            value={String(autoRefreshInterval)}
            onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
            className="h-10 text-xs w-36"
          >
            <option value="0">Auto-refresh: Off</option>
            <option value="5">Every 5s</option>
            <option value="15">Every 15s</option>
            <option value="30">Every 30s</option>
            <option value="60">Every 1 min</option>
          </AdminSelect>

          {/* Month selector */}
          <AdminSelect
            value={month || data.month || ""}
            onChange={(e) => handleMonthChange(e.target.value)}
            className="h-10 text-xs w-36"
          >
            {data.availableFiles.length > 0 ? (
              data.availableFiles.map((f) => (
                <option key={f.month} value={f.month}>
                  {f.month} ({formatBytes(f.sizeBytes)})
                </option>
              ))
            ) : (
              <option value="">{new Date().toISOString().slice(0, 7)} (Current)</option>
            )}
          </AdminSelect>

          <button
            type="button"
            onClick={handleExportLogsExcel}
            disabled={isLoading || data.entries.length === 0}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            <Download className="h-4 w-4 text-slate-500" />
            Export Excel
          </button>

          <button
            type="button"
            onClick={handleDownloadLogFile}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <FileText className="h-4 w-4 text-slate-500" />
            Download .log
          </button>

          <button
            type="button"
            onClick={() => void reload()}
            disabled={isLoading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#1e3a8a] px-4 text-xs font-bold text-white shadow-2xs transition-colors hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
          Application logs unavailable: {error}.
        </div>
      ) : null}

      {/* Metrics Row */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard
          label="Total Entries"
          value={counts.total.toLocaleString()}
          detail={`Active month: ${month || data.month || "Current"}`}
          icon={Activity}
          iconClassName="bg-blue-50 text-blue-700"
          valueClassName="text-slate-900"
        />
        <AdminMetricCard
          label="Errors & Crashes"
          value={(fatalCount + errorCount).toLocaleString()}
          detail={`${fatalCount} FATAL, ${errorCount} ERROR`}
          icon={ServerCrash}
          iconClassName="bg-rose-50 text-rose-700"
          valueClassName={fatalCount + errorCount > 0 ? "text-rose-700" : "text-slate-900"}
        />
        <AdminMetricCard
          label="Warnings & Slow"
          value={warnCount.toLocaleString()}
          detail="HTTP 4xx, performance, & PHP warnings"
          icon={AlertTriangle}
          iconClassName="bg-amber-50 text-amber-700"
          valueClassName={warnCount > 0 ? "text-amber-700" : "text-slate-900"}
        />
        <AdminMetricCard
          label="Issues Today"
          value={todayIssuesCount === 0 ? "0 Issues" : `${todayIssuesCount} Today`}
          detail={todayIssuesCount === 0 ? "Zero errors or warnings today" : "Errors or warnings since midnight"}
          icon={todayIssuesCount === 0 ? ShieldCheck : AlertTriangle}
          iconClassName={todayIssuesCount === 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}
          valueClassName={todayIssuesCount === 0 ? "text-emerald-700" : "text-rose-700"}
        />
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[280px] flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search error message, endpoint, actor, IP address..."
            className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-8 text-xs outline-none shadow-2xs placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100"
          />
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(""); setPage(1); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="w-44 sm:w-48">
          <AdminSelect value={sourceFilter} onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }} className="h-10 text-xs">
            <option value="all">All Portals</option>
            <option value="admin">Admin Panel</option>
            <option value="customer">Customer App</option>
            <option value="workshop">Workshop App</option>
            <option value="autocount">AutoCount ERP</option>
            <option value="system">Server / System</option>
          </AdminSelect>
        </div>

        <div className="w-40 sm:w-44">
          <AdminSelect value={level} onChange={(e) => handleLevelChange(e.target.value)} className="h-10 text-xs">
            <option value="ALL">All Levels</option>
            <option value="FATAL">FATAL only</option>
            <option value="ERROR">ERROR only</option>
            <option value="WARN">WARN only</option>
            <option value="INFO">INFO only</option>
          </AdminSelect>
        </div>

        {(search || sourceFilter !== "all" || level !== "ALL") && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setSourceFilter("all");
              setLevel("ALL");
              setPage(1);
            }}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50/70">
              <tr className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                <th scope="col" className="px-5 py-3.5 text-left whitespace-nowrap">Timestamp</th>
                <th scope="col" className="w-24 px-5 py-3.5 text-left">Level</th>
                <th scope="col" className="px-5 py-3.5 text-left">Portal / Source</th>
                <th scope="col" className="px-5 py-3.5 text-left">Log Message</th>
                <th scope="col" className="px-5 py-3.5 text-left">API Action</th>
                <th scope="col" className="px-5 py-3.5 text-left">Actor / IP</th>
                <th scope="col" className="w-12 px-5 py-3.5 text-left">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-xs">
              {isLoading && data.entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center text-slate-400 font-medium">
                    <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin text-slate-300" />
                    Loading log entries…
                  </td>
                </tr>
              ) : displayedEntries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center">
                    <ShieldCheck className="mx-auto h-8 w-8 text-emerald-400 mb-2" />
                    <p className="text-sm font-semibold text-slate-700">No application logs recorded</p>
                    <p className="mt-1 text-xs text-slate-400">No logs found matching level &quot;{level}&quot; and current filters.</p>
                  </td>
                </tr>
              ) : (
                displayedEntries.map((entry, idx) => {
                  const style = levelStyle(entry.level);
                  const source = resolveAppLogSource(entry);
                  const expanded = expandedIdx === idx;
                  return [
                    <tr key={`row-${idx}`} className={`align-middle transition-colors hover:bg-slate-50/50 ${style.row}`}>
                      <td className="whitespace-nowrap px-5 py-4 font-mono text-xs text-slate-500 font-medium">
                        {formatTs(entry.ts)}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${style.badge}`}>
                          {style.icon}
                          {entry.level}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${source.className}`}>
                          {source.label}
                        </span>
                      </td>
                      <td className="max-w-[340px] px-5 py-4">
                        <p className="truncate text-xs font-bold text-slate-900" title={entry.message}>
                          {entry.message}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <code className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-mono font-bold text-slate-700">
                          {entry.mode || "—"}
                        </code>
                      </td>
                      <td className="px-5 py-4">
                        {entry.actor ? (
                          <p className="text-xs font-bold text-slate-900">{entry.actor}</p>
                        ) : null}
                        {entry.ip ? (
                          <p className="mt-0.5 font-mono text-[11px] text-slate-400 font-medium">{entry.ip}</p>
                        ) : null}
                      </td>
                      <td className="px-5 py-4 text-left">
                        <button
                          type="button"
                          onClick={() => setExpandedIdx(expanded ? null : idx)}
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none cursor-pointer ${expanded ? "bg-slate-100 text-slate-800" : ""}`}
                          aria-label={expanded ? "Collapse" : "Expand"}
                          aria-expanded={expanded}
                        >
                          <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
                        </button>
                      </td>
                    </tr>,
                    expanded ? (
                      <tr key={`detail-${idx}`} className="bg-slate-50/80">
                        <td colSpan={7} className="px-5 py-4">
                          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Diagnostic Entry</span>
                                <span className="text-slate-300">·</span>
                                <span className="text-xs text-slate-500 font-mono">{entry.ts}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleCopyLog(entry, idx)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                              >
                                {copiedIdx === idx ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-slate-500" />}
                                {copiedIdx === idx ? "Copied" : "Copy Raw Log"}
                              </button>
                            </div>

                            <div className="grid gap-4 lg:grid-cols-[1fr_1.5fr]">
                              <div className="space-y-2.5 text-xs">
                                <div className="rounded-xl bg-slate-50 p-3.5 space-y-1.5 border border-slate-100">
                                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Request Context</p>
                                  <p><span className="text-slate-500">API Action:</span> <code className="text-[#1e3a8a] font-mono font-bold">{entry.mode || "None"}</code></p>
                                  <p><span className="text-slate-500">Portal / Source:</span> <span className={`inline-flex items-center ml-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${source.className}`}>{source.label}</span></p>
                                  <p><span className="text-slate-500">Actor:</span> <span className="font-bold text-slate-900">{entry.actor || "Anonymous / System"}</span></p>
                                  <p><span className="text-slate-500">Client IP:</span> <code className="text-slate-800 font-mono font-medium">{entry.ip || "Unknown"}</code></p>
                                </div>
                              </div>

                              <div className="space-y-1.5">
                                <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Diagnostic Context</p>
                                <pre className="max-h-60 overflow-auto rounded-xl bg-slate-900 p-3.5 font-mono text-xs text-slate-100 leading-relaxed border border-slate-800">
                                  {JSON.stringify(entry.context || {}, null, 2)}
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
          currentPage={pagination.page}
          totalPages={pagination.totalPages}
          totalItems={pagination.total || data.entries.length}
          pageSize={pagination.perPage || 100}
          onPageChange={handlePageChange}
          itemLabel="log entries"
        />
      </div>
    </div>
  );
}
