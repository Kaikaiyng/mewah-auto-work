import { useState, useEffect } from "react";
import {
  Activity,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Users,
  Building2,
  Package,
  FileText,
  RotateCcw,
  ShieldCheck,
  Server,
  ArrowUpRight,
  ArrowDownLeft,
  Info,
} from "lucide-react";
import { useLanguage } from "../contexts/language-context";
import { useApiData } from "../lib/use-api-data";
import { postApi } from "../lib/api";
import { AdminMetricCard } from "./ui/admin-metric-card";
import { AutoCountSyncBadge } from "./autocount-sync-badge";
import { PageLoading } from "./ui/page-loading";

type SyncHealthData = {
  status: "healthy" | "warning" | "offline";
  lastHeartbeat: string | null;
  minutesSinceLastSync: number;
  metrics: {
    debtors: { total: number; active: number; lastSync: string | null };
    creditors: { total: number; active: number; lastSync: string | null };
    stockItems: { total: number; lastSync: string | null };
    invoicesOutbox: { pending: number; failed: number; syncedToday: number };
  };
  failedQueue: Array<{
    id: number;
    invoiceId: number;
    invoiceNumber: string;
    companyName: string;
    debtorCode: string;
    total: number;
    operation: string;
    errorMessage: string;
    attemptCount: number;
    lastAttemptAt: string;
  }>;
  recentLogs: Array<{
    id: number;
    direction: "inbound" | "outbound";
    type: string;
    status: "success" | "failed";
    remark: string;
    timestamp: string;
  }>;
};

const fallbackSyncData: SyncHealthData = {
  status: "offline",
  lastHeartbeat: null,
  minutesSinceLastSync: 9999,
  metrics: {
    debtors: { total: 0, active: 0, lastSync: null },
    creditors: { total: 0, active: 0, lastSync: null },
    stockItems: { total: 0, lastSync: null },
    invoicesOutbox: { pending: 0, failed: 0, syncedToday: 0 },
  },
  failedQueue: [],
  recentLogs: [],
};

function formatTimestamp(value?: string | null) {
  if (!value) return "Never synced";
  const parsed = new Date(value.includes("T") ? value : value.replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function timeAgo(minutes: number) {
  if (minutes >= 9999) return "Unknown / No sync";
  if (minutes < 1) return "Just now (< 1 min ago)";
  if (minutes === 1) return "1 min ago";
  if (minutes < 60) return `${minutes} mins ago`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (hours < 24) return `${hours} hr ${rem}m ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

export function AutocountSyncHealth() {
  const { t } = useLanguage();
  const { data, isLoading, error, reload, hasLoaded } = useApiData<SyncHealthData>(
    "admin-autocount-sync-health",
    fallbackSyncData
  );

  const [retryingId, setRetryingId] = useState<number | null>(null);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);

  // Auto-refresh every 20 seconds while page is open
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, 20_000);
    return () => clearInterval(timer);
  }, [reload]);

  const handleRetry = async (queueId: number) => {
    setRetryingId(queueId);
    setRetryMessage(null);
    try {
      await postApi("admin-autocount-retry-queue", { queueId });
      setRetryMessage(
        queueId === 0
          ? "All failed items queued for retry successfully."
          : "Queue item scheduled for retry."
      );
      void reload();
    } catch (err: any) {
      setRetryMessage(err?.message || "Failed to schedule retry.");
    } finally {
      setRetryingId(null);
    }
  };

  const statusConfig = {
    healthy: {
      label: "Online & Synchronized",
      badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
      dotColor: "bg-emerald-500",
      description: "AutoCount Windows sync service is actively communicating with cloud database.",
      icon: CheckCircle2,
    },
    warning: {
      label: "Sync Warning / Attention",
      badgeColor: "bg-amber-50 text-amber-700 border-amber-200",
      dotColor: "bg-amber-500",
      description: "Sync delay detected (> 30 mins) or some outbound invoices failed to post.",
      icon: AlertTriangle,
    },
    offline: {
      label: "Offline / Idle",
      badgeColor: "bg-rose-50 text-rose-700 border-rose-200",
      dotColor: "bg-rose-500",
      description: "No heartbeat received in over 2 hours. Ensure AutoCount_Sync_Program.exe is running on the office PC.",
      icon: XCircle,
    },
  }[data.status] || {
    label: "Unknown",
    badgeColor: "bg-slate-50 text-slate-700 border-slate-200",
    dotColor: "bg-slate-500",
    description: "Checking sync status...",
    icon: Info,
  };

  if (isLoading && !hasLoaded) {
    return (
      <PageLoading
        title="Loading Sync Health..."
        description="Connecting to AutoCount agent daemon and checking queue statuses..."
      />
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">AutoCount Sync Health</h1>
            <AutoCountSyncBadge
              label={data.status === "healthy" ? "AutoCount Connected" : data.status === "warning" ? "AutoCount Sync Warning" : "AutoCount Offline"}
              status={data.status === "healthy" ? "success" : data.status === "warning" ? "pending" : "failed"}
              lastSync={data.lastHeartbeat}
              onRefresh={() => void reload()}
              isRefreshing={isLoading}
            />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Real-time synchronization status between Mewah AutoWorks and AutoCount ERP
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data.metrics.invoicesOutbox.failed > 0 && (
            <button
              type="button"
              onClick={() => handleRetry(0)}
              disabled={retryingId !== null || isLoading}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-700 disabled:opacity-50"
            >
              <RotateCcw className={`mr-2 h-4 w-4 ${retryingId === 0 ? "animate-spin" : ""}`} />
              Retry All Failed ({data.metrics.invoicesOutbox.failed})
            </button>
          )}
          <button
            type="button"
            onClick={() => void reload()}
            disabled={isLoading}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-[#1e3a8a] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-800 disabled:opacity-50"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh Health
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">
          Notice: {error}
        </div>
      )}

      {retryMessage && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 shadow-sm">
          {retryMessage}
        </div>
      )}

      {/* Main Status Hero Banner */}
      <div className={`rounded-2xl border p-5 shadow-sm ${statusConfig.badgeColor}`}>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
              <statusConfig.icon className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${statusConfig.dotColor} animate-pulse`} />
                <h2 className="text-lg font-extrabold">{statusConfig.label}</h2>
              </div>
              <p className="mt-1 text-xs opacity-90">{statusConfig.description}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 rounded-xl bg-white/80 px-4 py-3 text-xs shadow-sm md:text-right">
            <div>
              <p className="font-bold text-slate-700">Last Synced Heartbeat</p>
              <p className="text-slate-500">{formatTimestamp(data.lastHeartbeat)}</p>
            </div>
            <div className="hidden h-6 w-[1px] bg-slate-200 md:block" />
            <div>
              <p className="font-bold text-slate-700">Heartbeat Interval</p>
              <p className="text-slate-500">{timeAgo(data.minutesSinceLastSync)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 4 Primary Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard label="AutoCount Debtors" value={isLoading ? "—" : data.metrics.debtors.total.toLocaleString()} detail={`${data.metrics.debtors.active} active · Last: ${timeAgo(data.minutesSinceLastSync)}`} icon={Users} />
        <AdminMetricCard label="AutoCount Creditors" value={isLoading ? "—" : data.metrics.creditors.total.toLocaleString()} detail={`${data.metrics.creditors.active} active suppliers synced`} icon={Building2} iconClassName="bg-indigo-50 text-indigo-700" />
        <AdminMetricCard label="Stock & Parts Master" value={isLoading ? "—" : data.metrics.stockItems.total.toLocaleString()} detail="Synced inventory and stock groups" icon={Package} iconClassName="bg-amber-50 text-amber-700" />
        <AdminMetricCard
          label="Invoices Outbox"
          value={isLoading ? "—" : data.metrics.invoicesOutbox.syncedToday.toLocaleString()}
          detail={`${data.metrics.invoicesOutbox.pending} pending · ${data.metrics.invoicesOutbox.failed} failed`}
          icon={FileText}
          iconClassName={data.metrics.invoicesOutbox.failed > 0 ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}
          valueClassName={data.metrics.invoicesOutbox.failed > 0 ? "text-rose-600" : "text-slate-900"}
        />
      </div>

      {/* Failed Queue Section (If any) */}
      {data.failedQueue.length > 0 && (
        <div className="rounded-2xl border border-rose-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-rose-600" />
              <h2 className="text-base font-extrabold text-rose-900">
                Failed Outbox Sync Queue ({data.failedQueue.length})
              </h2>
            </div>
            <span className="text-xs text-slate-500">Requires review or debtor code mapping</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-500">
                <tr>
                  <th className="p-3">Invoice No</th>
                  <th className="p-3">Client / Company</th>
                  <th className="p-3">Debtor Code</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Error Reason</th>
                  <th className="p-3 text-right whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.failedQueue.map((item) => (
                  <tr key={item.id} className="hover:bg-rose-50/40">
                    <td className="p-3 font-bold text-slate-900">{item.invoiceNumber}</td>
                    <td className="p-3">{item.companyName}</td>
                    <td className="p-3">
                      <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px]">
                        {item.debtorCode}
                      </span>
                    </td>
                    <td className="p-3 font-semibold">RM {item.total.toFixed(2)}</td>
                    <td className="p-3 text-rose-700 max-w-xs truncate" title={item.errorMessage}>
                      {item.errorMessage}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleRetry(item.id)}
                          disabled={retryingId === item.id}
                          className="inline-flex items-center rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-[#1e3a8a] hover:bg-blue-100 disabled:opacity-50"
                        >
                          <RotateCcw className={`mr-1 h-3 w-3 ${retryingId === item.id ? "animate-spin" : ""}`} />
                          Retry
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sync Architecture & Recent Activity Stream */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Sync System Architecture Info */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Server className="h-5 w-5 text-blue-600" />
            <h3 className="text-base font-extrabold text-slate-900">Sync Configuration</h3>
          </div>
          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="text-slate-500">Service Program</span>
              <span className="font-semibold text-slate-800">Autocount_Sync_Program.exe</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="text-slate-500">Protocol & Mode</span>
              <span className="font-semibold text-slate-800">Direct MySQL / MSSQL Dual Sync</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="text-slate-500">Debtor / Creditor Sync</span>
              <span className="inline-flex items-center font-bold text-emerald-600">
                <ArrowDownLeft className="mr-1 h-3 w-3" />Inbound (AutoCount ➔ Cloud)
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="text-slate-500">Invoice Posting</span>
              <span className="inline-flex items-center font-bold text-blue-600">
                <ArrowUpRight className="mr-1 h-3 w-3" />Outbound (Cloud ➔ AutoCount)
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="text-slate-500">Stock & Price Master</span>
              <span className="font-semibold text-slate-800">AutoCount Stock Group Mapping</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-500">MewahTrans Fleet System</span>
              <span className="inline-flex items-center font-bold text-indigo-600">
                <ArrowUpRight className="mr-1 h-3 w-3" />Outbound Fleet Sync Ready
              </span>
            </div>
          </div>
          <div className="rounded-xl bg-blue-50/80 p-3 text-[11px] text-blue-900">
            <p className="font-bold mb-0.5">Troubleshooting Tip:</p>
            <p>If AutoCount status is Offline, check the Windows workstation sync service. MewahTrans fleet billing outbox is ready for dispatch.</p>
          </div>
        </div>

        {/* Recent Sync Activity Log Stream */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-600" />
              <h3 className="text-base font-extrabold text-slate-900">Recent Sync Log Stream</h3>
            </div>
            <span className="text-xs text-slate-400 font-medium">Last 25 sync events</span>
          </div>
          {data.recentLogs.length === 0 ? (
            <div className="flex h-56 flex-col items-center justify-center rounded-xl bg-slate-50 text-slate-400">
              <Clock className="mb-2 h-7 w-7 text-slate-300" />
              <p className="text-xs">No sync logs recorded yet</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
              {data.recentLogs.map((log) => (
                <div key={log.id} className="flex items-center justify-between py-2.5 px-2 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${log.status === "success" ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
                      {log.status === "success" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    </span>
                    <div>
                      <p className="text-xs font-bold text-slate-800">
                        {log.type} Sync
                        <span className="ml-2 font-normal text-slate-400">{log.remark}</span>
                      </p>
                      <p className="text-[10px] text-slate-400">{formatTimestamp(log.timestamp)}</p>
                    </div>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase ${log.status === "success" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                    {log.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
