import React from "react";

interface PageLoadingProps {
  title?: string;
  description?: string;
  className?: string;
}

export function PageLoading({
  title = "Loading...",
  description,
  className = "",
}: PageLoadingProps) {
  return (
    <div
      className={`flex min-h-[55vh] w-full flex-col items-center justify-center py-16 animate-in fade-in duration-200 ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="relative flex items-center justify-center">
        {/* Outer spinner */}
        <div className="h-11 w-11 rounded-full border-3 border-slate-200 border-t-[#1e3a8a] animate-spin" />
        {/* Inner branded core */}
        <div className="absolute h-5 w-5 rounded-full bg-blue-50 flex items-center justify-center shadow-xs">
          <div className="h-2 w-2 rounded-full bg-[#1e3a8a]" />
        </div>
      </div>
      <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-500">
        {title}
      </p>
      {description ? (
        <p className="mt-1 text-xs text-slate-400 max-w-sm text-center">
          {description}
        </p>
      ) : null}
    </div>
  );
}
