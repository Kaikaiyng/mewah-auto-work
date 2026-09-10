import { useDeferredValue, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Package, PencilLine, Search, Wrench, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export type DocumentItemType = "part" | "labour" | "other";

export type DocumentCatalogPart = {
  id: number;
  name: string;
  sku: string;
  price: number;
  uom?: string;
  itemGroup?: string;
  itemType: "part" | "labour" | "service" | "fee" | "vehicle" | "other";
  taxCode?: string;
  isActive: boolean;
  stock?: number;
  isPreferred?: boolean;
};

export type DocumentServiceType = {
  id: number;
  name: string;
  description?: string;
  basePrice: number;
  enabled: boolean;
};

export type DocumentCatalogSelection = {
  source: "custom" | "service" | "item";
  serviceTypeId: number | null;
  code: string;
  description: string;
  unitPrice: number;
  taxCode: string;
};

type DocumentItemCatalogSelectProps = {
  code: string;
  description?: string;
  compact?: boolean;
  disabled?: boolean;
  itemType: DocumentItemType;
  parts: DocumentCatalogPart[];
  serviceTypeId?: number | null;
  services: DocumentServiceType[];
  onSelect: (selection: DocumentCatalogSelection) => void;
  className?: string;
};

const MAX_RESULTS = 60;

function matchesType(part: DocumentCatalogPart, itemType: DocumentItemType) {
  if (itemType === "part") return part.itemType === "part";
  if (itemType === "labour") return part.itemType === "labour" || part.itemType === "service";
  return part.itemType === "fee" || part.itemType === "other";
}

function includesQuery(values: Array<string | undefined>, query: string) {
  return !query || values.some((value) => value?.toLocaleLowerCase().includes(query));
}

export function DocumentItemCatalogSelect({
  code,
  description,
  compact = false,
  disabled,
  itemType,
  parts = [],
  serviceTypeId,
  services = [],
  onSelect,
  className,
}: DocumentItemCatalogSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());
  const typeLabel = itemType === "part" ? "part" : itemType === "labour" ? "service" : "other item";
  const cleanCode = (code || "").trim();
  const cleanDesc = (description || "").trim();
  const upperCode = cleanCode.toUpperCase();

  const upperDesc = cleanDesc.toUpperCase();

  const safeParts = parts || [];
  const safeServices = services || [];

  const matchingParts = useMemo(
    () => safeParts.filter(
      (part) => matchesType(part, itemType) && (
        part.isActive || 
        (part.sku && part.sku.trim().toUpperCase() === upperCode) ||
        (part.id && String(part.id) === cleanCode)
      ),
    ),
    [cleanCode, itemType, safeParts, upperCode],
  );

  const filteredParts = useMemo(
    () => [...matchingParts
      .filter((part) => includesQuery([part.sku, part.name, part.itemGroup], deferredQuery))]
      .sort((left, right) => {
        if (left.isPreferred && !right.isPreferred) return -1;
        if (!left.isPreferred && right.isPreferred) return 1;
        return Number(right.stock || 0) - Number(left.stock || 0);
      })
      .slice(0, MAX_RESULTS),
    [matchingParts, deferredQuery],
  );

  const filteredServices = useMemo(
    () => safeServices
      .filter((service) => service.enabled && includesQuery([service.name, service.description], deferredQuery))
      .slice(0, MAX_RESULTS),
    [safeServices, deferredQuery],
  );

  const selectedService = itemType === "labour" && serviceTypeId ? safeServices.find((s) => s.id === serviceTypeId) : undefined;
  const selectedPart = safeParts.find(
    (p) => matchesType(p, itemType) && (
      (upperCode && p.sku && p.sku.trim().toUpperCase() === upperCode) ||
      (cleanCode && p.id && String(p.id) === cleanCode) ||
      (upperDesc && p.name && p.name.trim().toUpperCase() === upperDesc)
    ),
  );

  const selectedLabel = selectedService ? selectedService.name : (
    selectedPart 
      ? `${selectedPart.sku} · ${selectedPart.name}` 
      : (cleanCode && cleanDesc ? `${cleanCode} · ${cleanDesc}` : cleanDesc || cleanCode || "")
  );
  const hasSelection = Boolean(cleanCode || cleanDesc || serviceTypeId);
  const totalAvailable = matchingParts.length + (itemType === "labour" ? safeServices.filter((service) => service.enabled).length : 0);

  const finishSelection = (selection: DocumentCatalogSelection) => {
    onSelect(selection);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className={compact ? (className || "min-w-0 flex-1") : "mb-2 rounded-xl border border-blue-100 bg-blue-50/60 p-2.5"}>
      {compact ? null : <p className="text-[10px] font-extrabold uppercase tracking-wide text-blue-800">Select from catalogue</p>}
      <Popover open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setQuery(""); }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-label={`Select ${typeLabel} from catalogue`}
            aria-expanded={open}
            disabled={disabled}
            className={
              compact
                ? "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left text-xs font-medium text-slate-800 outline-none transition-colors hover:border-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-70"
                : "mt-1.5 flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-blue-200 bg-white px-3 py-2 text-left text-xs font-medium text-slate-800 outline-none transition-colors hover:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:opacity-70"
            }
          >
            <span className={selectedLabel ? "min-w-0 truncate" : "min-w-0 truncate text-slate-400"}>
              {selectedLabel || `Select ${typeLabel} (${totalAvailable.toLocaleString()} in catalogue)...`}
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={6} className="z-[140] w-[var(--radix-popover-trigger-width)] min-w-[380px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border-slate-200 bg-white p-0 text-slate-900 shadow-2xl">
          <div className="flex h-12 items-center gap-2 border-b border-slate-200 px-3.5">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search item code, name or group..." className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" />
            <span className="shrink-0 text-[10px] font-semibold text-slate-400">{totalAvailable.toLocaleString()} records</span>
          </div>
          <div className="max-h-80 overflow-y-auto bg-slate-50 p-2" role="listbox">
            {hasSelection ? <button type="button" onClick={() => finishSelection({ source: "custom", serviceTypeId: null, code: "", description: "", unitPrice: 0, taxCode: "" })} className="mb-2 flex w-full items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-left text-rose-700 hover:border-rose-300 hover:bg-rose-100"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white"><X className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-xs font-extrabold">Clear selected {typeLabel}</span><span className="block truncate text-[10px] text-rose-600">{selectedLabel || code}</span></span></button> : null}
            <button type="button" role="option" aria-selected={!hasSelection} onClick={() => finishSelection({ source: "custom", serviceTypeId: null, code: "", description: "", unitPrice: 0, taxCode: "" })} className="mb-2 flex w-full items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2.5 text-left hover:border-blue-300 hover:bg-blue-50">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500"><PencilLine className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1"><span className="block text-xs font-bold text-slate-800">Custom {typeLabel}</span><span className="block text-[10px] text-slate-500">Enter code, description and price manually</span></span>
              {!hasSelection ? <Check className="h-4 w-4 text-blue-700" /> : null}
            </button>

            {filteredServices.length > 0 ? <p className="px-2 pb-1 pt-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">MAW Service Types</p> : null}
            {filteredServices.map((service) => (
              <button key={`service-${service.id}`} type="button" role="option" aria-selected={service.id === serviceTypeId} onClick={() => finishSelection({ source: "service", serviceTypeId: service.id, code: "", description: service.name, unitPrice: service.basePrice, taxCode: "" })} className="mb-1 flex w-full items-center gap-3 rounded-lg bg-white px-3 py-2.5 text-left shadow-sm hover:bg-blue-50 focus:bg-blue-50 focus:outline-none">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600"><Wrench className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-800">{service.name}</span><span className="block truncate text-[10px] text-slate-500">{service.description || "MAW service catalogue"}</span></span>
                <span className="shrink-0 text-xs font-extrabold text-slate-700">RM {service.basePrice.toFixed(2)}</span>
                {service.id === serviceTypeId ? <Check className="h-4 w-4 shrink-0 text-blue-700" /> : null}
              </button>
            ))}

            {filteredParts.length > 0 ? <p className="px-2 pb-1 pt-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">{itemType === "part" ? "AutoCount / Parts Inventory" : "AutoCount Item Master"}</p> : null}
            {filteredParts.map((part) => (
              <button
                key={`item-${part.id}`}
                type="button"
                role="option"
                aria-selected={part.sku === code && !serviceTypeId}
                onClick={() => finishSelection({ source: "item", serviceTypeId: null, code: part.sku, description: part.name, unitPrice: part.price, taxCode: part.taxCode || "" })}
                className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left shadow-sm hover:bg-blue-50 focus:bg-blue-50 focus:outline-none ${
                  part.isPreferred ? "border-l-4 border-l-emerald-500 bg-emerald-50/50" : "bg-white"
                }`}
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${part.isPreferred ? "bg-emerald-100 text-emerald-800" : "bg-blue-50 text-blue-700"}`}>
                  <Package className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="block truncate text-xs font-bold text-slate-800">{part.sku} · {part.name}</span>
                    {part.isPreferred ? (
                      <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-black text-emerald-800">
                        ★ Supplier Item
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-500">
                    <span className="min-w-0 truncate">{[part.itemGroup, part.uom].filter(Boolean).join(" · ") || "AutoCount item"}</span>
                    {typeof part.stock === "number" ? <span className={`shrink-0 rounded-full px-1.5 py-0.5 font-extrabold ${part.stock > 0 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>Stock {part.stock}</span> : null}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-extrabold text-slate-700">RM {Number(part.price || 0).toFixed(2)}</span>
                {part.sku === code && !serviceTypeId ? <Check className="h-4 w-4 shrink-0 text-blue-700" /> : null}
              </button>
            ))}

            {filteredServices.length === 0 && filteredParts.length === 0 ? <div className="px-4 py-8 text-center"><Search className="mx-auto h-6 w-6 text-slate-300" /><p className="mt-2 text-xs font-semibold text-slate-600">No matching catalogue records</p><p className="mt-1 text-[10px] text-slate-400">Try another code, name or group.</p></div> : null}
            {(filteredParts.length === MAX_RESULTS || filteredServices.length === MAX_RESULTS) ? <p className="px-3 py-2 text-center text-[10px] text-slate-400">Showing the first {MAX_RESULTS} results. Type more to narrow the list.</p> : null}
          </div>
        </PopoverContent>
      </Popover>
      {compact ? null : <p className="mt-1.5 text-[10px] leading-4 text-slate-500">Selection copies the catalogue code, description and selling price into this document.</p>}
    </div>
  );
}
