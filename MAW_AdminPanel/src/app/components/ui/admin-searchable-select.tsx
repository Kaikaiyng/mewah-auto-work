import { useState, useMemo, useRef, useEffect } from "react";
import { Search, Check, ChevronDown, X } from "lucide-react";

export type SearchableOption<T = string | number> = {
  value: T;
  label: string;
  subLabel?: string;
  tag?: string;
  keywords?: string[];
  disabled?: boolean;
};

export type AdminSearchableSelectProps<T = string | number> = {
  options: SearchableOption<T>[];
  value: T | "" | null | undefined;
  onChange: (value: T | "") => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
};

export function AdminSearchableSelect<T extends string | number = string | number>({
  options,
  value,
  onChange,
  placeholder = "Select or search...",
  searchPlaceholder = "Type to search...",
  emptyText = "No matching records found.",
  disabled = false,
  className = "",
  ariaLabel,
}: AdminSearchableSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value],
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) => {
      const labelMatch = opt.label ? opt.label.toLowerCase().includes(q) : false;
      const subLabelMatch = opt.subLabel ? opt.subLabel.toLowerCase().includes(q) : false;
      const tagMatch = opt.tag ? opt.tag.toLowerCase().includes(q) : false;
      const keywordMatch = opt.keywords ? opt.keywords.some((k) => k.toLowerCase().includes(q)) : false;
      return labelMatch || subLabelMatch || tagMatch || keywordMatch;
    });
  }, [options, query]);

  const displayInputValue = useMemo(() => {
    if (open) return query;
    if (!selectedOption) return "";
    const parts = [selectedOption.label];
    if (selectedOption.subLabel) parts.push(`(${selectedOption.subLabel})`);
    if (selectedOption.tag) parts.push(`— ${selectedOption.tag}`);
    return parts.join(" ");
  }, [open, query, selectedOption]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative flex items-center">
        <input
          type="text"
          disabled={disabled}
          value={displayInputValue}
          placeholder={open ? searchPlaceholder : placeholder}
          aria-label={ariaLabel || placeholder}
          onFocus={() => {
            if (disabled) return;
            setOpen(true);
            setQuery("");
          }}
          onChange={(e) => {
            if (disabled) return;
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          className={`h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-8 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-60`}
        />
        <Search className="pointer-events-none absolute left-3 h-4 w-4 text-gray-400" />
        {value !== "" && value !== null && value !== undefined && !disabled ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
              setQuery("");
            }}
            className="absolute right-2.5 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="Clear"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-gray-400" />
        )}
      </div>

      {open && !disabled && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl animate-in fade-in-50">
          {filteredOptions.length === 0 ? (
            <p className="p-3 text-center text-xs text-gray-500">{emptyText}</p>
          ) : (
            filteredOptions.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={String(opt.value)}
                  type="button"
                  disabled={opt.disabled}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                    opt.disabled
                      ? "cursor-not-allowed opacity-40"
                      : isSelected
                      ? "bg-blue-50 font-bold text-[#1e3a8a]"
                      : "text-gray-800 hover:bg-slate-50"
                  }`}
                >
                  <div className="min-w-0">
                    <span className="font-bold text-gray-900">{opt.label}</span>
                    {opt.subLabel ? <span className="ml-2 text-gray-500">{opt.subLabel}</span> : null}
                    {opt.tag ? (
                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">
                        {opt.tag}
                      </span>
                    ) : null}
                  </div>
                  {isSelected ? <Check className="h-4 w-4 shrink-0 text-blue-600" /> : null}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
