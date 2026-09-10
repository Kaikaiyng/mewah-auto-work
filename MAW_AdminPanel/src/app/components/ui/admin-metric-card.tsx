import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";

type AdminMetricCardProps = {
  label: ReactNode;
  value: ReactNode;
  detail: ReactNode;
  icon: LucideIcon;
  iconClassName?: string;
  valueClassName?: string;
  onClick?: () => void;
};

const cardClassName = "group relative flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-5 text-left shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md";

export function AdminMetricCard({
  label,
  value,
  detail,
  icon: Icon,
  iconClassName = "bg-blue-50 text-[#1e3a8a]",
  valueClassName = "text-slate-900",
  onClick,
}: AdminMetricCardProps) {
  const content = (
    <>
      <div className="min-w-0 flex-1 pr-3">
        <span className="block truncate text-[11px] font-extrabold uppercase tracking-wider text-slate-500">{label}</span>
        <div className="mt-1.5 flex items-baseline">
          <span className={`truncate text-3xl font-black tracking-tight ${valueClassName}`}>{value}</span>
        </div>
        <div className="mt-2 flex items-center text-xs">
          <span className="truncate font-medium text-slate-500">{detail}</span>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end justify-between self-stretch py-0.5">
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl shadow-2xs transition-transform group-hover:scale-105 ${iconClassName}`}>
          <Icon className="h-5 w-5" />
        </div>
        <ChevronRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-1 group-hover:text-blue-600" />
      </div>
    </>
  );

  return onClick ? (
    <button type="button" onClick={onClick} className={cardClassName}>{content}</button>
  ) : (
    <div className={cardClassName}>{content}</div>
  );
}
