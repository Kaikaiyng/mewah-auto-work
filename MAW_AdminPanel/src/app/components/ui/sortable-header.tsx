import React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

export type SortDirection = "asc" | "desc" | null;

export interface SortableHeaderProps {
  children?: React.ReactNode;
  label?: React.ReactNode;
  columnKey?: string;
  sortKey?: string;
  currentSortKey: string | null;
  currentSortDirection?: SortDirection;
  currentDirection?: SortDirection;
  onSort: (key: string) => void;
  align?: "left" | "center" | "right";
  className?: string;
  ariaLabel?: string;
}

/**
 * Reusable table header component with interactive click-to-sort,
 * keyboard accessibility, and visual state indicators.
 */
export function SortableHeader({
  children,
  label,
  columnKey,
  sortKey: explicitSortKey,
  currentSortKey,
  currentSortDirection,
  currentDirection,
  onSort,
  align = "left",
  className = "",
  ariaLabel,
}: SortableHeaderProps) {
  const effectiveSortKey = explicitSortKey || columnKey || "";
  const effectiveContent = children ?? label;
  const effectiveDirection = currentSortDirection ?? currentDirection ?? null;
  const isActive = currentSortKey === effectiveSortKey;

  const thAlignClass = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  const btnAlignClass = align === "right" ? "justify-end text-right" : align === "center" ? "justify-center text-center" : "justify-start text-left";

  return (
    <th
      scope="col"
      className={`select-none text-left ${thAlignClass} ${className}`}
      aria-sort={
        isActive
          ? effectiveDirection === "asc"
            ? "ascending"
            : effectiveDirection === "desc"
            ? "descending"
            : "none"
          : "none"
      }
    >
      <button
        type="button"
        onClick={() => onSort(effectiveSortKey)}
        aria-label={ariaLabel || `Sort by ${typeof effectiveContent === "string" ? effectiveContent : effectiveSortKey}`}
        style={{
          fontFamily: "inherit",
          fontSize: "inherit",
          fontWeight: "inherit",
          letterSpacing: "inherit",
          textTransform: "inherit",
          lineHeight: "inherit",
        }}
        className={`group inline-flex items-center gap-1.5 whitespace-nowrap text-left ${btnAlignClass} transition-colors cursor-pointer focus:outline-none ${
          isActive
            ? "text-blue-600"
            : "text-slate-500 hover:text-slate-700"
        }`}
      >
        <span>{effectiveContent}</span>
        <span className="inline-flex shrink-0">
          {isActive && effectiveDirection === "asc" ? (
            <ArrowUp className="h-3 w-3 text-blue-600" />
          ) : isActive && effectiveDirection === "desc" ? (
            <ArrowDown className="h-3 w-3 text-blue-600" />
          ) : (
            <ArrowUpDown className="h-3 w-3 text-slate-400 group-hover:text-slate-600 transition-colors opacity-70 group-hover:opacity-100" />
          )}
        </span>
      </button>
    </th>
  );
}

/**
 * Convenient hook to manage sort state in tables
 */
export function useSortState(defaultKey: string | null = null, defaultDirection: SortDirection = "asc") {
  const [sortKey, setSortKey] = React.useState<string | null>(defaultKey);
  const [sortDirection, setSortDirection] = React.useState<SortDirection>(defaultDirection);

  const handleSort = React.useCallback((key: string) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDirection("asc");
    } else if (sortDirection === "asc") {
      setSortDirection("desc");
    } else {
      // 3rd click: Reset to null (neutral default, no blue highlight)
      setSortKey(null);
      setSortDirection(defaultDirection);
    }
  }, [sortKey, sortDirection, defaultDirection]);

  return { sortKey, sortDirection, handleSort, setSortKey, setSortDirection };
}

/**
 * Universal comparator supporting text, numbers, formatted currency, mileage, and dates
 */
export function compareValues(a: any, b: any, direction: SortDirection = "asc"): number {
  if (a === b) return 0;
  if (a == null || a === "" || a === "-") return 1;
  if (b == null || b === "" || b === "-") return -1;

  let result = 0;
  if (typeof a === "number" && typeof b === "number") {
    result = a - b;
  } else {
    const rawA = String(a).trim();
    const rawB = String(b).trim();
    const cleanA = rawA.replace(/^(rm|km|\$)\s*/i, "").replace(/,/g, "").replace(/\s*km$/i, "");
    const cleanB = rawB.replace(/^(rm|km|\$)\s*/i, "").replace(/,/g, "").replace(/\s*km$/i, "");
    const numA = Number(cleanA);
    const numB = Number(cleanB);

    if (!isNaN(numA) && !isNaN(numB) && cleanA !== "" && cleanB !== "") {
      result = numA - numB;
    } else {
      const dateA = Date.parse(rawA);
      const dateB = Date.parse(rawB);
      if (!isNaN(dateA) && !isNaN(dateB) && (rawA.includes("-") || rawA.includes("/"))) {
        result = dateA - dateB;
      } else {
        result = rawA.localeCompare(rawB, undefined, { numeric: true, sensitivity: "base" });
      }
    }
  }

  return direction === "desc" ? -result : result;
}

export default SortableHeader;
