import { useDeferredValue, useState } from "react";
import { Check, ChevronsUpDown, Plus, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { cn } from "./utils";

type AdminComboboxProps = {
  ariaLabel: string;
  className?: string;
  customLabel?: string;
  emptyLabel?: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  searchPlaceholder?: string;
  value: string;
};

export function AdminCombobox({
  ariaLabel,
  className,
  customLabel = "Use custom value",
  emptyLabel = "Type to add a custom value",
  onChange,
  options,
  placeholder,
  searchPlaceholder = "Search or enter a custom value...",
  value,
}: AdminComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim());
  const normalizedQuery = deferredQuery.toLocaleLowerCase();
  const filteredOptions = normalizedQuery
    ? options.filter((option) => option.toLocaleLowerCase().includes(normalizedQuery))
    : options;
  const hasExactMatch = options.some(
    (option) => option.toLocaleLowerCase() === normalizedQuery,
  );

  const chooseValue = (nextValue: string) => {
    onChange(nextValue);
    setQuery("");
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setQuery("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          className={cn(
            "flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-900 shadow-none transition-colors hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20",
            className,
          )}
        >
          <span className={cn("truncate", !value && "text-gray-400")}>
            {value || placeholder}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-gray-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="z-[120] w-[var(--radix-popover-trigger-width)] min-w-[280px] overflow-hidden rounded-xl border-gray-200 bg-white p-0 text-gray-900 shadow-xl"
      >
        <div className="flex h-11 items-center gap-2 border-b border-gray-100 px-3">
          <Search className="size-4 shrink-0 text-gray-400" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-full min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1.5">
          {filteredOptions.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => chooseValue(option)}
              className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-[#1e3a8a] focus:bg-blue-50 focus:text-[#1e3a8a] focus:outline-none"
            >
              <Check className={cn("size-4 shrink-0", value === option ? "opacity-100" : "opacity-0")} />
              <span className="truncate">{option}</span>
            </button>
          ))}
          {deferredQuery && !hasExactMatch ? (
            <button
              type="button"
              onClick={() => chooseValue(deferredQuery)}
              className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-[#1e3a8a] hover:bg-blue-50 focus:bg-blue-50 focus:outline-none"
            >
              <Plus className="size-4 shrink-0" />
              <span className="truncate">{customLabel}: “{deferredQuery}”</span>
            </button>
          ) : null}
          {filteredOptions.length === 0 && !deferredQuery ? (
            <p className="px-3 py-6 text-center text-sm text-gray-500">{emptyLabel}</p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
