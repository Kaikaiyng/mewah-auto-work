import { CheckCircle2, Clock, RefreshCw } from "lucide-react";

interface AutoCountSyncBadgeProps {
  lastSync?: string | null;
  status?: "success" | "pending" | "failed" | string | null;
  label?: string;
  className?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

function formatSyncTime(value?: string | null): string {
  if (!value) return "Live Sync";
  const parsed = new Date(value.includes("T") ? value : value.replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return value;

  const now = new Date();
  const diffMs = now.getTime() - parsed.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins === 1) return "1 min ago";
  if (diffMins < 60) return `${diffMins} mins ago`;

  const isToday = now.toDateString() === parsed.toDateString();
  const timeStr = parsed.toLocaleTimeString("en-MY", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (isToday) return `Today ${timeStr}`;

  return parsed.toLocaleDateString("en-MY", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AutoCountSyncBadge({
  lastSync,
  status = "success",
  label = "AutoCount Synced",
  className = "",
  onRefresh,
  isRefreshing = false,
}: AutoCountSyncBadgeProps) {
  const normalizedStatus = String(status || "success").toLowerCase();
  const isFailed = ["failed", "offline", "error"].includes(normalizedStatus);
  const isPending = ["pending", "warning", "syncing"].includes(normalizedStatus);
  const formattedTime = lastSync ? formatSyncTime(lastSync) : isFailed ? "Offline" : isPending ? "Attention" : "Live Sync";
  const palette = isFailed
    ? {
        wrapper: "border-rose-200/80 bg-rose-50/70 text-rose-800 hover:bg-rose-50",
        pulse: "bg-rose-400",
        dot: "bg-rose-500",
        label: "text-rose-900",
        separator: "text-rose-300",
        detail: "text-rose-700",
        icon: "text-rose-600/70",
        refresh: "text-rose-600 hover:bg-rose-100/60 hover:text-rose-900",
      }
    : isPending
      ? {
          wrapper: "border-amber-200/80 bg-amber-50/70 text-amber-800 hover:bg-amber-50",
          pulse: "bg-amber-400",
          dot: "bg-amber-500",
          label: "text-amber-900",
          separator: "text-amber-300",
          detail: "text-amber-700",
          icon: "text-amber-600/70",
          refresh: "text-amber-600 hover:bg-amber-100/60 hover:text-amber-900",
        }
      : {
          wrapper: "border-emerald-200/80 bg-emerald-50/70 text-emerald-800 hover:bg-emerald-50",
          pulse: "bg-emerald-400",
          dot: "bg-emerald-500",
          label: "text-emerald-900",
          separator: "text-emerald-300",
          detail: "text-emerald-700",
          icon: "text-emerald-600/70",
          refresh: "text-emerald-600 hover:bg-emerald-100/60 hover:text-emerald-900",
        };

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium shadow-sm backdrop-blur-sm transition-all ${palette.wrapper} ${className}`}
      title={lastSync ? `AutoCount Sync Time: ${lastSync}` : "Connected to AutoCount ERP"}
    >
      <span className="relative flex h-2 w-2">
        {!isFailed ? <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${palette.pulse}`} /> : null}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${palette.dot}`} />
      </span>
      <span className={`font-semibold ${palette.label}`}>{label}</span>
      <span className={palette.separator}>·</span>
      <span className={`flex items-center gap-1 font-normal ${palette.detail}`}>
        <Clock className={`inline h-3 w-3 ${palette.icon}`} />
        {formattedTime}
      </span>
      {onRefresh && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRefresh();
          }}
          disabled={isRefreshing}
          className={`ml-1 rounded-full p-0.5 focus:outline-none ${palette.refresh}`}
          title="Refresh synced data"
        >
          <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`} />
        </button>
      )}
    </div>
  );
}
