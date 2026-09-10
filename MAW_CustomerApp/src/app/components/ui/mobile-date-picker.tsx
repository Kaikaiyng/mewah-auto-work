import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Calendar } from "./calendar";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "./drawer";
import { cn } from "./utils";

type MobileDatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  title?: string;
  emptyDescription?: string;
  clearLabel?: string;
  todayLabel?: string;
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

export function MobileDatePicker({
  value,
  onChange,
  placeholder = "dd/mm/yyyy",
  className,
  ariaLabel = "Choose date",
  title = "Pick a date",
  emptyDescription = "Choose a day from the calendar",
  clearLabel = "Clear",
  todayLabel = "Today",
  minDate,
  disablePast = true,
  allowPastDates = false,
  disabledDays,
}: MobileDatePickerProps) {
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

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isTodayDisabled = isDateDisabled(today);

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className={cn(
            "flex h-12 w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 text-left text-gray-900 transition-colors active:border-[#2563eb]",
            !value && "text-gray-400",
            className,
          )}
        >
          <span>{displayDate(value) || placeholder}</span>
          <CalendarDays className="h-5 w-5 shrink-0 text-gray-500" />
        </button>
      </DrawerTrigger>
      <DrawerContent className="mx-auto max-h-[92vh] w-full max-w-md rounded-t-[28px] border-slate-200 bg-white shadow-2xl">
        <DrawerHeader className="border-b border-slate-200 px-5 pb-4 pt-3 text-left">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#2563eb]">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <DrawerTitle className="text-lg font-semibold text-slate-900">{title}</DrawerTitle>
              <DrawerDescription className="text-sm text-slate-500">
                {draftDate ? displayDate(toIsoDate(draftDate)) : emptyDescription}
              </DrawerDescription>
            </div>
          </div>
        </DrawerHeader>
        <div className="overflow-y-auto bg-slate-50 p-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
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
            className="mx-auto w-full max-w-[352px] p-1.5"
            classNames={{
              months: "flex w-full flex-col",
              month: "flex w-full flex-col gap-3",
              day: "size-9 min-[360px]:size-11 p-0 font-normal aria-selected:opacity-100",
              head_cell: "w-9 min-[360px]:w-11 text-xs font-medium text-gray-500",
              row: "mt-1 flex w-full justify-between",
              head_row: "flex w-full justify-between",
              day_selected: "bg-[#2563eb] text-white hover:bg-[#1d4ed8] hover:text-white focus:bg-[#1d4ed8] focus:text-white",
              day_today: "ring-1 ring-[#2563eb] text-[#1d4ed8]",
            }}
            />
          </div>
        </div>
        <DrawerFooter className="grid grid-cols-2 gap-2 border-t border-gray-100 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className="min-h-11 w-full rounded-xl px-2 text-sm font-semibold text-gray-500 active:bg-gray-100"
          >
            {clearLabel}
          </button>
          <button
            type="button"
            disabled={isTodayDisabled}
            onClick={() => {
              setDraftDate(today);
              onChange(toIsoDate(today));
              setOpen(false);
            }}
            className="min-h-11 w-full rounded-xl border border-blue-200 px-2 text-sm font-semibold text-[#2563eb] active:bg-blue-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
          >
            {todayLabel}
          </button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
