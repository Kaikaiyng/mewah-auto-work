import type { ButtonHTMLAttributes, ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "./utils";

type DialogSize = "sm" | "md" | "lg" | "xl";
type SectionTone = "blue" | "indigo" | "amber" | "emerald" | "slate";

const sizeClasses: Record<DialogSize, string> = {
  sm: "max-w-lg",
  md: "max-w-2xl",
  lg: "max-w-4xl",
  xl: "max-w-6xl",
};

const toneClasses: Record<SectionTone, string> = {
  blue: "bg-blue-50 text-blue-700",
  indigo: "bg-indigo-50 text-indigo-700",
  amber: "bg-amber-50 text-amber-700",
  emerald: "bg-emerald-50 text-emerald-700",
  slate: "bg-slate-100 text-slate-700",
};

export const adminFieldClass = "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";
export const adminTextareaClass = "min-h-20 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";
export const adminLabelClass = "mb-1.5 block text-xs font-semibold text-slate-700";

export function AdminFormDialog({
  children,
  size = "md",
  labelledBy,
  className,
}: {
  children: ReactNode;
  size?: DialogSize;
  labelledBy?: string;
  className?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm transition-opacity sm:p-5">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={cn(
          "flex max-h-[94vh] w-full flex-col overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150",
          sizeClasses[size],
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function AdminFormDialogHeader({
  id,
  title,
  description,
  icon,
  badge,
  onClose,
  closeDisabled = false,
}: {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  onClose: () => void;
  closeDisabled?: boolean;
}) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-7 sm:py-5">
      <div className="flex min-w-0 items-start gap-3.5">
        {icon ? (
          <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1e3a8a] ring-1 ring-blue-100">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={id} className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">{title}</h2>
            {badge ? <span className="hidden rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-700 sm:inline-flex">{badge}</span> : null}
          </div>
          {description ? <p className="mt-1 text-xs leading-5 text-slate-500 sm:text-sm">{description}</p> : null}
        </div>
      </div>
      <button
        type="button"
        disabled={closeDisabled}
        onClick={onClose}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-40 cursor-pointer"
        aria-label="Close dialog"
      >
        <X className="h-5 w-5" />
      </button>
    </header>
  );
}

export function AdminFormDialogBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex-1 space-y-4 overflow-y-auto bg-slate-50/80 p-4 sm:p-6 pb-24", className)}>{children}</div>;
}

export function AdminFormSection({
  number,
  title,
  description,
  icon,
  tone = "blue",
  children,
}: {
  number?: string | number;
  title: string;
  description?: string;
  icon?: ReactNode;
  tone?: SectionTone;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2.5">
          {number ? (
            <span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold", toneClasses[tone])}>
              {number}
            </span>
          ) : null}
          {icon ? <span className="text-slate-500">{icon}</span> : null}
          <div>
            <h3 className="text-sm font-bold text-slate-900">{title}</h3>
            {description ? <p className="text-xs text-slate-500">{description}</p> : null}
          </div>
        </div>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

export function AdminFormDialogFooter({
  children,
  note = <><span className="font-bold text-red-500">*</span> Required fields must be completed</>,
  className,
}: {
  children: ReactNode;
  note?: ReactNode;
  className?: string;
}) {
  return (
    <footer className={cn("flex flex-col-reverse gap-3 border-t border-slate-200 bg-white px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-7", className)}>
      {note !== null && note !== undefined ? <div className="text-xs text-slate-500">{note}</div> : <div />}
      <div className="flex items-center justify-end gap-2.5">{children}</div>
    </footer>
  );
}

export function AdminDialogCancelButton({ children = "Cancel", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50" {...props}>{children}</button>;
}

export function AdminDialogPrimaryButton({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#1e3a8a] px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" {...props}>{children}</button>;
}
