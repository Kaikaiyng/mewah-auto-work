import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "./utils";

export type TaxPreset = {
  id?: string;
  code: string;
  name: string;
  rate: number;
};

export type TaxRateInputProps = {
  value: number | string;
  onChange: (value: number) => void;
  presets?: TaxPreset[];
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  id?: string;
  placement?: "bottom" | "top" | "auto";
};

export function TaxRateInput({
  value,
  onChange,
  presets = [],
  disabled = false,
  className = "",
  placeholder = "0",
  id,
  placement = "auto",
}: TaxRateInputProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value === 0 ? "0" : String(value ?? ""));
  const containerRef = useRef<HTMLDivElement>(null);
  const [openUpward, setOpenUpward] = useState(placement === "top");

  // Keep internal text in sync when external numeric value changes (e.g. initial load or reset)
  useEffect(() => {
    const numVal = Number(value || 0);
    const currNum = Number(inputValue || 0);
    if (Math.abs(numVal - currNum) > 0.0001 || (value === 0 && inputValue === "")) {
      setInputValue(value === 0 ? "0" : String(value ?? ""));
    }
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (open && containerRef.current) {
      if (placement === "bottom") {
        setOpenUpward(false);
        return;
      }
      if (placement === "top") {
        setOpenUpward(true);
        return;
      }
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      if (spaceBelow < 220 && spaceAbove > spaceBelow) {
        setOpenUpward(true);
      } else {
        setOpenUpward(false);
      }
    }
  }, [open, placement]);

  // Unique presets sorted by rate
  const uniquePresets = useMemo(() => {
    const list: { key: string; rate: number; code: string; name: string }[] = [];
    const seenRates = new Set<number>();

    presets.forEach((p) => {
      if (!seenRates.has(p.rate)) {
        seenRates.add(p.rate);
        list.push({
          key: p.id || `tax-${p.rate}`,
          rate: p.rate,
          code: p.code,
          name: p.name,
        });
      }
    });

    if (!seenRates.has(0)) {
      seenRates.add(0);
      list.unshift({
        key: "tax-0",
        rate: 0,
        code: "EXEMPT",
        name: "Tax Exempt / Zero Rated",
      });
    }

    list.sort((a, b) => a.rate - b.rate);
    return list;
  }, [presets]);

  const currentNumeric = Number(inputValue || 0);

  const handleInputChange = (raw: string) => {
    // Only allow numbers and decimal point
    if (raw !== "" && !/^\d*\.?\d*$/.test(raw)) return;
    setInputValue(raw);
    const parsed = raw === "" ? 0 : Number(raw);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
      onChange(parsed);
    }
  };

  const handleSelectPreset = (rate: number) => {
    setInputValue(String(rate));
    onChange(rate);
    setOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex items-center rounded-lg border border-slate-200 bg-slate-50/70 transition-colors focus-within:border-blue-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-500/20",
        disabled && "opacity-60 bg-slate-100 cursor-not-allowed",
        className,
      )}
    >
      <input
        id={id}
        type="text"
        inputMode="decimal"
        disabled={disabled}
        value={inputValue}
        onChange={(e) => handleInputChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          } else if (e.key === "Escape" && open) {
            e.preventDefault();
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        className="h-full w-full min-w-0 bg-transparent px-2.5 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <span className="text-[11px] font-bold text-slate-400 select-none pr-1">%</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Select tax preset"
        className="flex h-full items-center px-1.5 text-slate-400 hover:text-slate-700 disabled:cursor-not-allowed transition-colors border-l border-slate-200/80 cursor-pointer"
      >
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform duration-200",
            open && "rotate-180 text-blue-600",
          )}
        />
      </button>

      {open && !disabled && (
        <div
          className={cn(
            "absolute left-0 right-0 z-[150] min-w-[220px] w-full max-w-[280px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl animate-in fade-in-50",
            placement === "top" || openUpward ? "bottom-full mb-1.5" : "top-full mt-1.5",
          )}
        >
          <div className="bg-slate-50 px-2.5 py-1.5 border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Select SST Preset
          </div>
          <div className="p-1 space-y-0.5">
            {uniquePresets.map((preset) => {
              const isSelected = Math.abs(preset.rate - currentNumeric) < 0.001;
              return (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => handleSelectPreset(preset.rate)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer",
                    isSelected
                      ? "bg-blue-50 font-bold text-[#1e3a8a]"
                      : "text-slate-800 hover:bg-slate-50",
                  )}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <span className={cn("font-bold", isSelected ? "text-[#1e3a8a]" : "text-slate-900")}>
                      {preset.rate}%
                    </span>
                    <span className="text-[11px] text-slate-500 truncate">
                      {preset.code} ({preset.name})
                    </span>
                  </div>
                  {isSelected ? <Check className="h-3.5 w-3.5 shrink-0 text-blue-600" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
