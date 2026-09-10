import { ChevronLeft, ChevronRight } from "lucide-react";
import { AdminSelect } from "./admin-select";
import { cn } from "./utils";

export function getPageNumbers(currentPage: number, totalPages: number): (number | "...")[] {
  if (totalPages <= 7) {
    return Array.from({ length: Math.max(1, totalPages) }, (_, i) => i + 1);
  }
  const pages: (number | "...")[] = [1];
  if (currentPage > 3) {
    pages.push("...");
  }
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }
  if (currentPage < totalPages - 2) {
    pages.push("...");
  }
  pages.push(totalPages);
  return pages;
}

export type AdminPaginationProps = {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  itemLabel?: string;
  className?: string;
};

export function AdminPagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  pageSizeOptions = [10, 20, 50, 100],
  onPageChange,
  onPageSizeChange,
  itemLabel = "items",
  className,
}: AdminPaginationProps) {
  const safeCurrentPage = Math.max(1, Math.min(currentPage, Math.max(1, totalPages)));
  const safeTotalPages = Math.max(1, totalPages);
  const startItem = totalItems > 0 ? (safeCurrentPage - 1) * pageSize + 1 : 0;
  const endItem = Math.min(safeCurrentPage * pageSize, totalItems);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 bg-white px-5 py-3.5 text-xs text-slate-500",
        className,
      )}
    >
      <div>
        Showing <span className="font-bold text-slate-800">{startItem}</span> to{" "}
        <span className="font-bold text-slate-800">{endItem}</span> of{" "}
        <span className="font-bold text-slate-800">{totalItems}</span> {itemLabel}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={safeCurrentPage <= 1}
            onClick={() => onPageChange(Math.max(1, safeCurrentPage - 1))}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 shadow-2xs transition-colors hover:bg-slate-50 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {getPageNumbers(safeCurrentPage, safeTotalPages).map((pNum, idx) =>
            pNum === "..." ? (
              <span key={`ellipsis-${idx}`} className="px-1.5 text-xs text-slate-400">
                …
              </span>
            ) : (
              <button
                key={`page-${pNum}`}
                type="button"
                onClick={() => onPageChange(Number(pNum))}
                className={`flex h-8 min-w-[32px] items-center justify-center rounded-xl px-2 text-xs font-bold transition-colors cursor-pointer ${
                  safeCurrentPage === Number(pNum)
                    ? "border border-blue-600 bg-blue-50 text-blue-600 shadow-2xs"
                    : "border border-slate-200 bg-white text-slate-700 shadow-2xs hover:bg-slate-50"
                }`}
              >
                {pNum}
              </button>
            ),
          )}

          <button
            type="button"
            disabled={safeCurrentPage >= safeTotalPages}
            onClick={() => onPageChange(Math.min(safeTotalPages, safeCurrentPage + 1))}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 shadow-2xs transition-colors hover:bg-slate-50 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {onPageSizeChange ? (
          <div className="w-[104px]">
            <AdminSelect
              value={String(pageSize)}
              onChange={(event) => {
                onPageSizeChange(Number(event.target.value));
              }}
              placement="top"
              className="h-8 w-full text-xs font-semibold rounded-xl border-slate-200 bg-white"
              aria-label="Items per page"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={String(size)}>
                  {size} / page
                </option>
              ))}
            </AdminSelect>
          </div>
        ) : null}
      </div>
    </div>
  );
}
