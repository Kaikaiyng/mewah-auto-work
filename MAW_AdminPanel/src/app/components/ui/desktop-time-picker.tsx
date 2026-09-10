import { useState, useMemo, useEffect, useRef } from "react";
import { Check, Clock3 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { cn } from "./utils";

type DesktopTimePickerProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  ariaLabel?: string;
  disabled?: boolean;
};

function formatTime12(h24: number, minute: number): string {
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 || 12;
  return `${String(h12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function displayTime(value: string) {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return "";
  const h24 = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  return formatTime12(h24, m);
}

// 96 intervals of 15 minutes each across 24 hours
const BASE_TIME_SLOTS = Array.from({ length: 96 }, (_, i) => {
  const totalMin = i * 15;
  const h24 = Math.floor(totalMin / 60);
  const minute = totalMin % 60;
  const value = `${String(h24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const label = formatTime12(h24, minute);
  return { value, label, totalMin, isCustom: false };
});

export function DesktopTimePicker({
  value,
  onChange,
  placeholder = "hh:mm",
  className,
  required = false,
  ariaLabel = "Choose time",
  disabled = false,
}: DesktopTimePickerProps) {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // If current value is an exact custom minute, include it in the sorted slots
  const allSlots = useMemo(() => {
    if (!value) return BASE_TIME_SLOTS;
    const exists = BASE_TIME_SLOTS.some((s) => s.value === value);
    if (exists) return BASE_TIME_SLOTS;

    const match = /^(\d{1,2}):(\d{2})/.exec(value);
    if (!match) return BASE_TIME_SLOTS;
    const h24 = parseInt(match[1], 10);
    const minute = parseInt(match[2], 10);
    const totalMin = h24 * 60 + minute;
    const customSlot = {
      value,
      label: formatTime12(h24, minute),
      totalMin,
      isCustom: true,
    };
    const combined = [...BASE_TIME_SLOTS, customSlot];
    combined.sort((a, b) => a.totalMin - b.totalMin);
    return combined;
  }, [value]);

  // Determine current nearest 15-min slot
  const currentNearestSlotValue = useMemo(() => {
    const now = new Date();
    const roundedMin = Math.round(now.getMinutes() / 15) * 15;
    now.setMinutes(roundedMin);
    now.setSeconds(0);
    const h24 = now.getHours();
    const minute = now.getMinutes();
    return `${String(h24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }, [open]);

  // When popover opens, auto-scroll to selected item or nearest current time
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      const activeEl = listRef.current?.querySelector<HTMLElement>("[data-active='true']");
      if (activeEl) {
        activeEl.scrollIntoView({ block: "center", behavior: "auto" });
      } else {
        const nearestEl = listRef.current?.querySelector<HTMLElement>("[data-nearest='true']");
        if (nearestEl) {
          nearestEl.scrollIntoView({ block: "center", behavior: "auto" });
        }
      }
    }, 40);
    return () => clearTimeout(timer);
  }, [open, value]);

  const handleSelect = (timeValue: string) => {
    onChange(timeValue);
    setOpen(false);
  };

  const handleNow = () => {
    onChange(currentNearestSlotValue);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          aria-required={required}
          disabled={disabled}
          className={cn(
            "flex w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 text-left text-sm text-gray-900 transition-colors hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-70",
            !value && "text-gray-400 font-normal",
            className,
          )}
        >
          <span>{displayTime(value) || placeholder}</span>
          <Clock3 className="h-4 w-4 shrink-0 text-gray-500" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={8}
        collisionPadding={16}
        className="z-[80] w-[280px] rounded-xl border-gray-200 bg-white p-0 shadow-xl"
      >
        {/* Header - Matches DesktopDatePicker Pick a date exactly */}
        <div className="border-b border-gray-100 px-3.5 py-3">
          <p className="text-sm font-semibold text-gray-900">Pick a time</p>
          <p className="mt-0.5 text-xs text-gray-500">
            {value ? displayTime(value) : "No time selected"}
          </p>
        </div>

        {/* 15-Minute Selectable Slots */}
        <div
          ref={listRef}
          className="max-h-60 overflow-y-auto p-2 select-none scroll-smooth space-y-1"
        >
          {allSlots.map((slot) => {
            const isSelected = slot.value === value;
            const isNearest = !value && slot.value === currentNearestSlotValue;

            return (
              <button
                key={slot.value}
                type="button"
                data-active={isSelected ? "true" : "false"}
                data-nearest={isNearest ? "true" : "false"}
                onClick={() => handleSelect(slot.value)}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold transition-colors cursor-pointer text-left",
                  isSelected
                    ? "bg-[#2563eb] text-white hover:bg-[#1d4ed8] hover:text-white focus:bg-[#1d4ed8] focus:text-white"
                    : isNearest
                    ? "ring-1 ring-[#2563eb] text-[#1d4ed8] hover:bg-blue-50"
                    : "text-gray-700 hover:bg-gray-100 hover:text-gray-900",
                )}
              >
                <span>{slot.label}</span>
                {isSelected ? <Check className="h-3.5 w-3.5 text-white" /> : null}
              </button>
            );
          })}
        </div>

        {/* Footer - Matches DesktopDatePicker Clear & Today design exactly */}
        <div className="grid grid-cols-2 items-center gap-1 border-t border-gray-100 px-2.5 py-3">
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className="justify-self-center rounded-lg px-3 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-100 cursor-pointer"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={handleNow}
            className="justify-self-center rounded-lg px-3 py-2 text-xs font-semibold text-[#1e3a8a] hover:bg-blue-50 cursor-pointer"
          >
            Now
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
