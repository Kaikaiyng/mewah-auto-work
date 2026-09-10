import { DesktopDatePicker } from "./desktop-date-picker";
import { DesktopTimePicker } from "./desktop-time-picker";
import { cn } from "./utils";

type DesktopDateTimePickerProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  minDate?: string | Date;
  disablePast?: boolean;
  allowPastDates?: boolean;
  disabledDays?: (date: Date) => boolean;
};

export function DesktopDateTimePicker({
  value,
  onChange,
  className,
  required = false,
  disabled = false,
  minDate,
  disablePast = true,
  allowPastDates = false,
  disabledDays,
}: DesktopDateTimePickerProps) {
  const [date = "", time = ""] = value.split("T");
  const updateDate = (nextDate: string) => onChange(nextDate ? `${nextDate}T${time || "09:00"}` : "");
  const updateTime = (nextTime: string) => onChange(nextTime ? `${date || new Date().toISOString().slice(0, 10)}T${nextTime}` : "");

  return (
    <div className={cn("grid grid-cols-[minmax(0,1fr)_128px] gap-2", className)}>
      <DesktopDatePicker
        value={date}
        onChange={updateDate}
        ariaLabel="Choose date"
        required={required}
        disabled={disabled}
        minDate={minDate}
        disablePast={disablePast}
        allowPastDates={allowPastDates}
        disabledDays={disabledDays}
        className="h-10"
      />
      <DesktopTimePicker value={time} onChange={updateTime} ariaLabel="Choose time" required={required} disabled={disabled} className="h-10" />
    </div>
  );
}
