import {
  Children,
  isValidElement,
  useState,
  useMemo,
  useRef,
  useEffect,
  type ChangeEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { Search, Check, ChevronDown, X } from "lucide-react";
import { cn } from "./utils";

type NativeOptionProps = {
  children?: ReactNode;
  disabled?: boolean;
  value?: string | number;
};

type AdminSelectProps = {
  "aria-label"?: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
  placeholder?: string;
  placement?: "bottom" | "top" | "auto";
  required?: boolean;
  value: string | number;
};

function extractText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (isValidElement(node) && node.props) return extractText((node.props as { children?: ReactNode }).children);
  return "";
}

export function AdminSelect({
  "aria-label": ariaLabel,
  children,
  className,
  disabled,
  id,
  name,
  onChange,
  placeholder,
  placement = "auto",
  value,
}: AdminSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const rawOptions = Children.toArray(children).filter(
    (child): child is ReactElement<NativeOptionProps> => isValidElement(child) && child.type === "option",
  );

  const options = useMemo(() => {
    return rawOptions.map((opt) => {
      const text = extractText(opt.props.children);
      const val = opt.props.value !== undefined && opt.props.value !== null ? String(opt.props.value) : text;
      const isPlaceholder = val === "" && (text.startsWith("--") || text.includes("Select"));
      
      let primaryLabel = text;
      let subLabel: string | undefined = undefined;
      let tag: string | undefined = undefined;

      if (!isPlaceholder && text) {
        let remaining = text;
        if (remaining.includes(" — ")) {
          const parts = remaining.split(" — ");
          primaryLabel = parts[0];
          tag = parts.slice(1).join(" — ");
          remaining = parts[0];
        } else if (remaining.includes(" · ")) {
          const parts = remaining.split(" · ");
          primaryLabel = parts[0];
          subLabel = parts.slice(1).join(" · ");
          remaining = parts[0];
        }

        const parenMatch = remaining.match(/^(.*?)\s*\((.*?)\)$/);
        if (parenMatch) {
          primaryLabel = parenMatch[1].trim();
          subLabel = parenMatch[2].trim();
        }
      }

      return {
        value: val,
        rawText: text,
        primaryLabel: isPlaceholder ? text : primaryLabel,
        subLabel: isPlaceholder ? undefined : subLabel,
        tag: isPlaceholder ? undefined : tag,
        isPlaceholder,
        disabled: opt.props.disabled,
      };
    });
  }, [rawOptions]);

  const [openUpward, setOpenUpward] = useState(placement === "top");

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
      if (spaceBelow < 250 && spaceAbove > spaceBelow) {
        setOpenUpward(true);
      } else {
        setOpenUpward(false);
      }
    }
  }, [open, placement]);

  const stringVal = value !== undefined && value !== null ? String(value) : "";
  const selectedOption = options.find((opt) => opt.value === stringVal);

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) => {
      if (opt.isPlaceholder) return false;
      return opt.rawText.toLowerCase().includes(q) || opt.value.toLowerCase().includes(q);
    });
  }, [options, query]);

  const defaultPlaceholder = useMemo(() => {
    if (placeholder) return placeholder;
    const phOpt = options.find((opt) => opt.isPlaceholder);
    return phOpt ? phOpt.rawText : "-- Select or search --";
  }, [options, placeholder]);

  const triggerDisplayText = useMemo(() => {
    if (open) return query;
    if (!selectedOption || selectedOption.isPlaceholder) return "";
    return selectedOption.rawText;
  }, [open, query, selectedOption]);

  const handleSelect = (nextValue: string) => {
    onChange?.({
      target: { value: nextValue },
      currentTarget: { value: nextValue },
    } as ChangeEvent<HTMLSelectElement>);
    setOpen(false);
    setQuery("");
  };

  const isH10 = className?.includes("h-10");
  const isH9 = className?.includes("h-9");
  const isH8 = className?.includes("h-8");
  const compact = !isH10 && !isH9 && (className?.includes("text-xs") || isH8);
  const fullWidth = className?.includes("w-full") || !className?.includes("w-");
  const customRounded = className?.split(/\s+/).find((c) => c.startsWith("rounded-"));
  const customBorder = className?.split(/\s+/).find((c) => c.startsWith("border-slate-") || c.startsWith("border-gray-"));

  // Keep only width, grid, flex, margin positioning on the container div
  const containerClasses = useMemo(() => {
    const kept = className
      ? className
          .split(/\s+/)
          .filter((cls) => {
            const c = cls.trim();
            return (
              c.startsWith("w-") ||
              c.startsWith("md:w-") ||
              c.startsWith("lg:w-") ||
              c.startsWith("sm:w-") ||
              c.startsWith("max-w-") ||
              c.startsWith("min-w-") ||
              c.startsWith("flex-") ||
              c.startsWith("col-") ||
              c.startsWith("md:col-") ||
              c.startsWith("m-") ||
              c.startsWith("mt-") ||
              c.startsWith("mb-") ||
              c.startsWith("ml-") ||
              c.startsWith("mr-") ||
              c.startsWith("mx-") ||
              c.startsWith("my-")
            );
          })
          .join(" ")
      : "";
    return cn("relative inline-block text-left", kept || (fullWidth ? "w-full" : "w-auto"), open ? "z-[60]" : "z-auto");
  }, [className, fullWidth, open]);

  return (
    <div ref={containerRef} className={containerClasses}>
      <button
        id={id}
        name={name}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel || defaultPlaceholder}
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => !prev);
          setQuery("");
        }}
        className={cn(
          "flex w-full items-center justify-between gap-2 border bg-white text-left font-medium text-gray-900 shadow-none transition-colors hover:border-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-60",
          customRounded || "rounded-lg",
          customBorder || "border-gray-300",
          isH10 ? "h-10 px-3 text-xs" : isH9 ? "h-9 px-2.5 text-xs" : compact ? "h-8 px-2.5 text-xs" : "h-10 px-3.5 text-sm",
        )}
      >
        <span
          className={cn(
            "truncate",
            !selectedOption || selectedOption.isPlaceholder ? "text-gray-400 font-normal" : "text-gray-900 font-medium",
          )}
        >
          {selectedOption && !selectedOption.isPlaceholder
            ? selectedOption.rawText
            : defaultPlaceholder}
        </span>
        <ChevronDown
          className={cn(
            "shrink-0 text-gray-400 transition-transform duration-200",
            open ? "rotate-180 text-blue-600" : "",
            compact ? "h-3.5 w-3.5" : "h-4 w-4",
          )}
        />
      </button>

      {open && !disabled && (
        <div
          className={cn(
            "absolute left-0 right-0 z-[140] max-h-72 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl",
            (placement === "top" || openUpward) ? "bottom-full mb-1.5" : "top-full mt-1.5",
          )}
        >
          {options.length > 5 && (
            <div className="flex h-10 items-center gap-2 border-b border-slate-100 px-3">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type to search..."
                className="h-full min-w-0 flex-1 bg-transparent text-xs text-slate-900 outline-none placeholder:text-slate-400"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="rounded p-0.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          )}

          <div className="max-h-60 overflow-y-auto p-1.5">
            {filteredOptions.length === 0 ? (
              <p className="p-3 text-center text-xs text-slate-500">No matching records found.</p>
            ) : (
              filteredOptions.map((opt, idx) => {
                const isSelected = opt.value === stringVal;
                return (
                  <button
                    key={`${opt.value}-${idx}`}
                    type="button"
                    disabled={opt.disabled}
                    onClick={() => handleSelect(opt.value)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs transition-colors cursor-pointer",
                      opt.disabled
                        ? "cursor-not-allowed opacity-40"
                        : isSelected
                        ? "bg-blue-50 font-bold text-[#1e3a8a]"
                        : "text-slate-800 hover:bg-slate-50",
                    )}
                  >
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                      <span className={isSelected ? "font-bold text-[#1e3a8a]" : "font-medium text-slate-900"}>
                        {opt.primaryLabel}
                      </span>
                      {opt.subLabel ? (
                        <span className="text-slate-500 font-normal">
                          ({opt.subLabel})
                        </span>
                      ) : null}
                      {opt.tag ? (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                          {opt.tag}
                        </span>
                      ) : null}
                    </div>
                    {isSelected ? <Check className="h-4 w-4 shrink-0 text-blue-600 ml-2" /> : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

