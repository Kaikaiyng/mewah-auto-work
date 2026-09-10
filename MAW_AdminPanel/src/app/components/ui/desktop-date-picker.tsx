import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Calendar } from "./calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { cn } from "./utils";

type DesktopDatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  ariaLabel?: string;
  disabled?: boolean;
  minDate?: string | Date;
  disablePast?: boolean;
  allowPastDates?: boolean;
  disabledDays?: (date: Date) => boolean;
};

function parseIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function displayDate(value: string) {
  const date = parseIsoDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function DesktopDatePicker({
  value,
  onChange,
  placeholder = "dd/mm/yyyy",
  className,
  required = false,
  ariaLabel = "Choose date",
  disabled = false,
  minDate,
  disablePast = true,
  allowPastDates = false,
  disabledDays,
}: DesktopDatePickerProps) {
  const [open, setOpen] = useState(false);
  const [draftDate, setDraftDate] = useState<Date | undefined>(() => parseIsoDate(value));

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setDraftDate(parseIsoDate(value));
    setOpen(nextOpen);
  };

  const isDateDisabled = (date: Date) => {
    if (disabledDays && disabledDays(date)) return true;
    if (!allowPastDates && disablePast) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (date < today) return true;
    }
    if (minDate) {
      const min = typeof minDate === "string" ? parseIsoDate(minDate) : minDate;
      if (min) {
        const minClean = new Date(min);
        minClean.setHours(0, 0, 0, 0);
        if (date < minClean) return true;
      }
    }
    return false;
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
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
          <span>{displayDate(value) || placeholder}</span>
          <CalendarDays className="h-4 w-4 shrink-0 text-gray-500" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        collisionPadding={16}
        className="z-[80] w-[280px] rounded-xl border-gray-200 bg-white p-0 shadow-xl"
      >
        <div className="border-b border-gray-100 px-3.5 py-3">
          <p className="text-sm font-semibold text-gray-900">Pick a date</p>
          <p className="mt-0.5 text-xs text-gray-500">
            {draftDate ? displayDate(toIsoDate(draftDate)) : "No date selected"}
          </p>
        </div>
        <Calendar
          mode="single"
          selected={draftDate}
          disabled={isDateDisabled}
          onSelect={(date) => {
            setDraftDate(date);
            if (date) {
              onChange(toIsoDate(date));
              setOpen(false);
            }
          }}
          defaultMonth={draftDate}
          className="w-full p-2.5"
          classNames={{
            months: "flex w-full flex-col",
            month: "flex w-full flex-col gap-3",
            head_row: "flex w-full justify-between",
            row: "mt-1.5 flex w-full justify-between",
            day_selected: "bg-[#2563eb] text-white hover:bg-[#1d4ed8] hover:text-white focus:bg-[#1d4ed8] focus:text-white",
            day_today: "ring-1 ring-[#2563eb] text-[#1d4ed8]",
          }}
        />
        <div className="grid grid-cols-2 items-center gap-1 border-t border-gray-100 px-2.5 py-3">
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className="justify-self-center rounded-lg px-3 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-100"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => {
              const today = new Date();
              setDraftDate(today);
              onChange(toIsoDate(today));
              setOpen(false);
            }}
            className="justify-self-center rounded-lg px-3 py-2 text-xs font-semibold text-[#1e3a8a] hover:bg-blue-50"
          >
            Today
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
