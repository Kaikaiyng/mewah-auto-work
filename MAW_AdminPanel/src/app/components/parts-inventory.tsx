import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Search, Plus, Edit, Trash2, XCircle, X, ImageIcon, Upload, RefreshCw, RotateCcw, Package, Eye, Database, Save, ChevronLeft, ChevronRight, ArrowLeft, History, ArrowDownRight, ArrowUpRight, Building2, SlidersHorizontal, AlertCircle, CheckCircle2, TrendingDown, TrendingUp, DollarSign, Calendar, User, FileText, ExternalLink } from "lucide-react";
import { useApiData } from "../lib/use-api-data";
import { useLanguage } from "../contexts/language-context";
import { toast } from "sonner";
import { PageLoading } from "./ui/page-loading";
import { useConfirmationDialog } from "../contexts/confirmation-dialog-context";
import { AdminSelect } from "./ui/admin-select";
import { AdminPagination } from "./ui/admin-pagination";
import { postApi } from "../lib/api";
import { hasAdminPermission } from "../lib/admin-permissions";
import { AutoCountSyncBadge } from "./autocount-sync-badge";
import { SortableHeader, useSortState, compareValues } from "./ui/sortable-header";

interface Part {
  id: number;
  name: string;
  category: string;
  sku: string;
  price: number;
  cost: number | null;
  uom: string;
  itemGroup: string;
  itemType: ItemType;
  taxCode: string;
  isStockItem: boolean;
  isActive: boolean;
  stock: number;
  lowStockThreshold: number;
  supplier: string;
  supplierCode?: string;
  supplierName?: string;
  image: string;
}

interface SupplierPurchasingInsight {
  supplierCode: string;
  supplierName: string;
  lastPurchasedAt: string | null;
  lastUnitCost: number;
  minUnitCost: number;
  maxUnitCost: number;
  totalQuantityOrdered: number;
  orderCount: number;
}

interface StockLedgerTransaction {
  id: number;
  partId: number;
  transactionType: "po_receive" | "job_consume" | "manual_adjust" | "return" | "initial" | string;
  docType: string;
  docId: number | null;
  docNo: string;
  partyCode: string;
  partyName: string;
  quantityChange: number;
  balanceAfter: number;
  unitCost: number | null;
  notes: string;
  createdBy: string;
  createdAt: string;
}

interface PartStockLedgerData {
  part: Part;
  purchasingSummary: SupplierPurchasingInsight[];
  transactions: StockLedgerTransaction[];
}

interface ImportPartRow {
  sku: string;
  name: string;
  uom?: string;
  category?: string;
  cost?: number;
  price?: number;
  stock?: number;
  lowStockThreshold?: number;
  supplier?: string;
  itemGroup?: string;
  itemType?: ItemType;
  taxCode?: string;
  isStockItem?: boolean;
  isActive?: boolean;
}

type ItemType = "part" | "labour" | "service" | "fee" | "vehicle" | "other";

interface StockGroup {
  code: string;
  description: string;
  itemType: ItemType;
  isWorkshopItem: boolean;
  isActive: boolean;
}

interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  total: number;
}

interface AutoCountItemDetail {
  itemCode: string;
  fields: Record<string, string | number | null>;
  image: {
    hasImage: boolean;
    size: number;
  };
}

const IMPORT_PREVIEW_LIMIT = 5;
const PARTS_PAGE_SIZE = 10;

function parseSupplierInfo(rawName?: string | null, rawCode?: string | null) {
  let name = (rawName || "").trim();
  let code = (rawCode || "").trim();

  // If name has "(code)" format, e.g. "PG SMART AUTOMOTIVE SDN BHD (400-P008)"
  const matchName = name.match(/^(.*?)\s*\(([^)]+)\)$/);
  if (matchName) {
    name = matchName[1].trim();
    if (!code || code === rawName) {
      code = matchName[2].trim();
    }
  }

  // If code has "(code)" format
  const matchCode = code.match(/^(.*?)\s*\(([^)]+)\)$/);
  if (matchCode) {
    if (!name || name === rawCode) {
      name = matchCode[1].trim();
    }
    code = matchCode[2].trim();
  }

  // If name equals code
  if (name && code && name === code) {
    if (/^[A-Z0-9]+-[A-Z0-9]+$/i.test(code)) {
      name = "";
    }
  }

  return { name, code };
}

function formatSupplierLabel(rawName?: string | null, rawCode?: string | null, fallback = "—"): string {
  const { name, code } = parseSupplierInfo(rawName, rawCode);
  if (!name && !code) return fallback;
  if (name && !code) return name;
  if (!name && code) return code;
  if (name === code) return name;
  return `${name} (${code})`;
}

function PartReadOnlyField({ label, value, mono = false }: { label: string; value?: string | number | null; mono?: boolean }) {
  return <div><span className="mb-1 block text-[11px] font-bold text-slate-600">{label}</span><div className={`flex min-h-10 w-full items-center rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2 text-xs font-medium text-slate-800 ${mono ? "font-mono font-bold" : ""}`}>{value === null || value === undefined || value === "" ? "—" : value}</div></div>;
}

const partFieldClass = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium shadow-2xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100";
const partLabelClass = "mb-1 block text-[11px] font-bold text-slate-700";

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }
  row.push(value);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

function findColumn(headers: string[], aliases: string[]) {
  return aliases.map((alias) => headers.indexOf(alias)).find((index) => index >= 0) ?? -1;
}

function parseCsvNumber(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const negative = /^\(.*\)$/.test(trimmed);
  const normalized = trimmed.replace(/[(),\s]/g, "").replace(/^(?:RM|MYR)/i, "");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return undefined;
  return negative ? -parsed : parsed;
}

function parseAutoCountCsv(text: string): ImportPartRow[] {
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  if (rows.length < 2) throw new Error("The selected CSV does not contain any part records.");
  const headers = rows[0].map((header) => header.trim().toLowerCase().replace(/[^a-z0-9]/g, ""));
  const skuIndex = findColumn(headers, ["sku", "itemcode", "stockcode", "partno", "partcode", "code"]);
  const nameIndex = findColumn(headers, ["name", "description", "itemdescription", "itemname", "partname", "stockname"]);
  const uomIndex = findColumn(headers, ["uom", "unit", "baseuom", "unitofmeasure"]);
  const categoryIndex = findColumn(headers, ["category", "itemgroup", "stockgroup", "partcategory", "groupname", "classification"]);
  const itemTypeIndex = findColumn(headers, ["itemtype", "type", "stocktype"]);
  const taxCodeIndex = findColumn(headers, ["taxcode", "salestaxcode", "outputtaxcode"]);
  const costIndex = findColumn(headers, ["cost", "costprice", "standardcost", "stdcost", "averagecost", "unitcost", "lastcost"]);
  const priceIndex = findColumn(headers, ["price", "sellingprice", "sellingprice1", "unitprice", "salesprice", "salesprice1"]);
  const stockIndex = findColumn(headers, ["stock", "quantity", "qty", "stockquantity", "currentstock", "qtyonhand", "onhandqty", "onhand", "balance", "balanceqty", "balancequantity", "qtybalance", "stockbalance", "stockbalanceqty"]);
  const thresholdIndex = findColumn(headers, ["lowstockthreshold", "minimumstock", "minstock", "minstocklevel", "reorderlevel", "reorderpoint", "reorderqty", "reorderquantity", "minlevel", "minimumlevel"]);
  const supplierIndex = findColumn(headers, ["supplier", "vendor", "suppliername", "vendorname"]);
  if (skuIndex < 0 || nameIndex < 0) {
    throw new Error("The CSV must contain SKU/Item Code and Name/Description columns.");
  }

  const importedRows: ImportPartRow[] = [];
  for (const values of rows.slice(1)) {
    const skuValue = values[skuIndex] || "";
    const nameValue = values[nameIndex]?.trim() || "";
    if (!skuValue.trim() || !nameValue) continue;
    const imported: ImportPartRow = {
      sku: skuValue,
      name: nameValue,
    };
    const uomValue = uomIndex >= 0 ? values[uomIndex]?.trim() : "";
    const categoryValue = categoryIndex >= 0 ? values[categoryIndex]?.trim() : "";
    const supplierValue = supplierIndex >= 0 ? values[supplierIndex]?.trim() : "";
    const itemTypeValue = itemTypeIndex >= 0 ? values[itemTypeIndex]?.trim().toLowerCase() : "";
    const taxCodeValue = taxCodeIndex >= 0 ? values[taxCodeIndex]?.trim() : "";
    const costValue = costIndex >= 0 ? parseCsvNumber(values[costIndex]) : undefined;
    const priceValue = priceIndex >= 0 ? parseCsvNumber(values[priceIndex]) : undefined;
    const stockValue = stockIndex >= 0 ? parseCsvNumber(values[stockIndex]) : undefined;
    const thresholdValue = thresholdIndex >= 0 ? parseCsvNumber(values[thresholdIndex]) : undefined;
    if (uomValue) imported.uom = uomValue;
    if (categoryValue) {
      imported.category = categoryValue;
      imported.itemGroup = categoryValue;
    }
    if (supplierValue) imported.supplier = supplierValue;
    if (["part", "labour", "service", "fee", "vehicle", "other"].includes(itemTypeValue)) imported.itemType = itemTypeValue as ItemType;
    if (taxCodeValue) imported.taxCode = taxCodeValue;
    if (costValue !== undefined) imported.cost = Math.max(0, costValue);
    if (priceValue !== undefined) imported.price = Math.max(0, priceValue);
    if (stockValue !== undefined) imported.stock = Math.max(0, stockValue);
    if (thresholdValue !== undefined) imported.lowStockThreshold = Math.max(0, thresholdValue);
    importedRows.push(imported);
  }
  if (importedRows.length === 0) throw new Error("No valid part rows were found in the selected CSV.");
  if (importedRows.length > 5000) throw new Error("A single import cannot exceed 5,000 rows.");
  return importedRows;
}

const presetAutoCountGroups = [
  "ACCHDLG", "ACCRUAL", "AUDIT FE", "BOOKFEE", "CONTRA", "CONTRI", "COURIER", "DEPOSIT",
  "EQUIP", "FWDG", "HAULAGE", "HDLG", "INSURAN", "LAB HAND", "LABOUR", "MTL_DGC",
  "O/CHARGE", "PORTS", "PR LABOU", "PREPAY", "PS LABOU", "RENTAL", "SM", "SOC", "SP",
  "STOCK", "STOCK PM", "T&E (EXP", "T/L USE", "T/W USE", "TLS&EQP", "TR LABOU", "TRANS",
  "TS LABOU", "UK/EQP", "UTILITY",
];
const itemTypeLabels: Record<ItemType, string> = {
  part: "Part / Stock",
  labour: "Labour",
  service: "Service",
  fee: "Fee / Charge",
  vehicle: "Vehicle Sales",
  other: "Other",
};
const MAX_PART_IMAGE_BYTES = 3 * 1024 * 1024;
const acceptedPartImageTypes = ["image/jpeg", "image/png", "image/webp"];

function isPartLowStock(part: Part) {
  return part.itemType === "part" && part.isStockItem && part.stock <= Math.max(0, part.lowStockThreshold);
}

type StockStatus = "in-stock" | "low-stock" | "out-of-stock" | "not-stock";

function getPartStockStatus(part: Part): StockStatus {
  if (part.itemType !== "part" || !part.isStockItem) return "not-stock";
  if (part.stock <= 0) return "out-of-stock";
  if (isPartLowStock(part)) return "low-stock";
  return "in-stock";
}

const stockStatusConfig: Record<StockStatus, { label: string; className: string }> = {
  "in-stock": { label: "In stock", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  "low-stock": { label: "Low stock", className: "border-amber-200 bg-amber-50 text-amber-700" },
  "out-of-stock": { label: "Out of stock", className: "border-red-200 bg-red-50 text-red-700" },
  "not-stock": { label: "Not stock-tracked", className: "border-slate-200 bg-slate-50 text-slate-600" },
};

const itemDetailSections = [
  {
    title: "Item master",
    fields: ["ItemCode", "Description", "Desc2", "FurtherDescription", "ItemGroup", "ItemType", "ItemClass", "ItemCategory", "Classification", "ItemBrand", "GlobalCode"],
  },
  {
    title: "Stock & units",
    fields: ["StockControl", "BaseUOM", "SalesUOM", "PurchaseUOM", "ReportUOM", "CostingMethod", "AssemblyCost", "LeadTime", "LeadTimeDay", "HasSerialNo", "HasBatchNo", "SNFormatName", "BackOrderControl", "AutoUOMConversion"],
  },
  {
    title: "Sales, purchase & tax",
    fields: ["TaxCode", "PurchaseTaxCode", "DutyRate", "TariffCode", "MarkupRatio", "MainSupplier", "IsSalesItem", "IsPurchaseItem", "IsPOSItem", "IsRawMaterialItem", "IsFinishGoodsItem", "MustGenerateEInvoice"],
  },
  {
    title: "Settings",
    fields: ["IsActive", "Discontinued", "IsCalcBonusPoint", "HasPromoter", "ExternalLink", "ImageFileName", "Note", "Guid"],
  },
  {
    title: "System information",
    fields: ["DocKey", "AutoKey", "CreatedTimeStamp", "CreatedUserID", "LastModified", "LastModifiedUserID", "LastUpdate"],
  },
] as const;

const knownItemDetailFields = new Set<string>(itemDetailSections.flatMap((section) => [...section.fields]));

const booleanItemFields = new Set([
  "StockControl", "HasSerialNo", "HasBatchNo", "IsActive", "Discontinued", "IsCalcBonusPoint",
  "HasPromoter", "BackOrderControl", "AutoUOMConversion", "IsSalesItem", "IsPurchaseItem", "IsPOSItem",
  "IsRawMaterialItem", "IsFinishGoodsItem", "MustGenerateEInvoice",
]);

function itemFieldLabel(field: string) {
  return field
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/UOM/g, "UOM")
    .replace(/ID/g, "ID");
}

function itemFieldValue(field: string, value: string | number | null) {
  if (value === null || value === "") return "—";
  if (booleanItemFields.has(field)) {
    return ["T", "1", "Y", "TRUE"].includes(String(value).toUpperCase()) ? "Yes" : "No";
  }
  return String(value);
}

function csvCell(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

interface DocLinkInfo {
  type: "po" | "invoice" | "work_order" | "adjustment" | "opening" | "other";
  label: string;
  url?: string;
  actionText: string;
}

function resolveDocLink(tx: StockLedgerTransaction): DocLinkInfo {
  const docTypeUpper = (tx.docType || "").trim().toUpperCase();
  const transTypeUpper = (tx.transactionType || "").trim().toUpperCase();
  const docNo = (tx.docNo || "").trim();
  const docNoUpper = docNo.toUpperCase();

  // 1. Purchase Order
  if (
    docTypeUpper === "PO" ||
    transTypeUpper === "PO_RECEIVE" ||
    docNoUpper.startsWith("PO-") ||
    docNoUpper.startsWith("PO/")
  ) {
    return {
      type: "po",
      label: "Purchase Order",
      url: `/purchase-orders?po=${encodeURIComponent(docNo)}`,
      actionText: "Open Purchase Order",
    };
  }

  // 2. Invoice
  if (
    docTypeUpper === "INV" ||
    docTypeUpper === "INVOICE" ||
    transTypeUpper === "JOB_CONSUME" ||
    docNoUpper.startsWith("INV-") ||
    docNoUpper.startsWith("INV/")
  ) {
    return {
      type: "invoice",
      label: "Sales Invoice",
      url: `/invoices?invoiceNo=${encodeURIComponent(docNo)}`,
      actionText: "Open Invoice",
    };
  }

  // 3. Work Order
  if (
    docTypeUpper === "WO" ||
    docTypeUpper === "JOB" ||
    docNoUpper.startsWith("WO-") ||
    docNoUpper.startsWith("JOB-")
  ) {
    return {
      type: "work_order",
      label: "Work Order",
      url: `/work-orders?wo=${encodeURIComponent(docNo)}`,
      actionText: "Open Work Order",
    };
  }

  // 4. Opening stock
  if (docTypeUpper === "OPENING" || transTypeUpper === "INITIAL" || docNoUpper.includes("INITIAL")) {
    return {
      type: "opening",
      label: "Opening Stock Voucher",
      actionText: "View Opening Details",
    };
  }

  // 5. Stock Adjustment
  if (
    docTypeUpper === "ADJ" ||
    transTypeUpper === "MANUAL_ADJUST" ||
    transTypeUpper === "STOCK_ADJUSTMENT" ||
    docNoUpper.startsWith("ADJ-")
  ) {
    return {
      type: "adjustment",
      label: "Stock Adjustment Voucher",
      actionText: "View Adjustment Details",
    };
  }

  return {
    type: "other",
    label: tx.docType || "Document",
    actionText: "View Document Details",
  };
}

export function PartsInventory() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const canCreate = false;
  const canUpdate = hasAdminPermission("part.update");
  const canDelete = false;
  const canViewCost = hasAdminPermission("part.viewCost");
  const { t } = useLanguage();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedItemType, setSelectedItemType] = useState<"All" | ItemType>("All");
  const [selectedStockStatus, setSelectedStockStatus] = useState<"All" | StockStatus>("All");
  const [selectedSupplier, setSelectedSupplier] = useState("All");
  const [selectedActiveStatus, setSelectedActiveStatus] = useState<"All" | "active" | "inactive">("All");
  const [selectedPartIds, setSelectedPartIds] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PARTS_PAGE_SIZE);
  
  // API Integration
  const { data: parts, isLoading, error, reload, hasLoaded } = useApiData<Part[]>("admin-parts", []);
  const { data: stockGroups } = useApiData<StockGroup[]>("admin-stock-groups", []);
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingPart, setEditingPart] = useState<Part | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const confirmAction = useConfirmationDialog();

  // Form states
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [uom, setUom] = useState("");
  const [itemGroup, setItemGroup] = useState("");
  const [itemType, setItemType] = useState<ItemType>("part");
  const [taxCode, setTaxCode] = useState("");
  const [isStockItem, setIsStockItem] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [stock, setStock] = useState("");
  const [lowStockThreshold, setLowStockThreshold] = useState("10");
  const [supplier, setSupplier] = useState("");
  const [image, setImage] = useState("");
  const [imageData, setImageData] = useState("");
  const [imageFileName, setImageFileName] = useState("");
  const [imageInputKey, setImageInputKey] = useState(0);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportPartRow[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);
  const [detailPart, setDetailPart] = useState<Part | null>(null);
  const [itemDetail, setItemDetail] = useState<AutoCountItemDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  // Stock Ledger & Multi-Supplier History states
  const [ledgerPart, setLedgerPart] = useState<Part | null>(null);
  const [ledgerData, setLedgerData] = useState<PartStockLedgerData | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState("");
  const [ledgerFilter, setLedgerFilter] = useState<"all" | "in" | "out" | "adjust">("all");
  const [ledgerSupplierFilter, setLedgerSupplierFilter] = useState<string>("all");
  const [selectedTxModal, setSelectedTxModal] = useState<StockLedgerTransaction | null>(null);

  // Stock Adjustment states
  const [adjustPart, setAdjustPart] = useState<Part | null>(null);
  const [adjustNewStock, setAdjustNewStock] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);
  const [adjustError, setAdjustError] = useState("");

  const { sortKey, sortDirection, handleSort, setSortKey } = useSortState(null, "asc");

  const categories = useMemo(() => {
    return ["All", ...new Set(parts.map((p) => p.itemGroup || p.category).filter(Boolean))];
  }, [parts]);

  const suppliers = useMemo(() => {
    const map = new Map<string, string>();
    parts.forEach((p) => {
      const { name, code } = parseSupplierInfo(p.supplierName, p.supplierCode || p.supplier);
      const key = code || name;
      if (key) {
        const label = formatSupplierLabel(name, code);
        if (!map.has(key)) {
          map.set(key, label);
        }
      }
    });
    return Array.from(map.entries())
      .map(([code, label]) => ({ code, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [parts]);

  const itemGroupOptions = useMemo(() => {
    return [...new Set([
      ...presetAutoCountGroups,
      ...stockGroups.map((group) => group.code),
      ...parts.map((part) => part.itemGroup).filter(Boolean),
    ])];
  }, [parts, stockGroups]);
  const stockGroupMap = useMemo(
    () => new Map(stockGroups.map((group) => [group.code, group])),
    [stockGroups],
  );

  const filteredParts = useMemo(() => {
    const list = parts.filter((part) => {
      const matchesSearch =
        part.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        part.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (part.supplierCode || part.supplier || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (part.supplierName || "").toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === "All" || (part.itemGroup || part.category) === selectedCategory;
      const matchesItemType = selectedItemType === "All" || part.itemType === selectedItemType;
      const matchesStockStatus = selectedStockStatus === "All" || getPartStockStatus(part) === selectedStockStatus;
      const matchesSupplier =
        selectedSupplier === "All" ||
        (part.supplierCode || part.supplier || "").trim() === selectedSupplier;
      const matchesActiveStatus =
        selectedActiveStatus === "All" ||
        (selectedActiveStatus === "active" ? Boolean(part.isActive) : !part.isActive);
      return matchesSearch && matchesCategory && matchesItemType && matchesStockStatus && matchesSupplier && matchesActiveStatus;
    });

    if (!sortKey) return list;

    return [...list].sort((a, b) => {
      switch (sortKey) {
        case "sku":
          return compareValues(a.sku, b.sku, sortDirection);
        case "name":
          return compareValues(a.name, b.name, sortDirection);
        case "category":
          return compareValues(a.itemGroup || a.category, b.itemGroup || b.category, sortDirection);
        case "supplier":
          return compareValues(a.supplierName || a.supplierCode || a.supplier, b.supplierName || b.supplierCode || b.supplier, sortDirection);
        case "uom":
          return compareValues(a.uom, b.uom, sortDirection);
        case "price":
          return compareValues(a.price, b.price, sortDirection);
        case "stock":
          return compareValues(a.stock, b.stock, sortDirection);
        case "status":
          return compareValues(getPartStockStatus(a), getPartStockStatus(b), sortDirection);
        default:
          return 0;
      }
    });
  }, [parts, searchTerm, selectedCategory, selectedItemType, selectedStockStatus, selectedSupplier, selectedActiveStatus, sortKey, sortDirection]);

  const stockCounts = useMemo(() => {
    return {
      all: parts.length,
      inStock: parts.filter((p) => getPartStockStatus(p) === "in-stock").length,
      lowStock: parts.filter((p) => getPartStockStatus(p) === "low-stock").length,
      outOfStock: parts.filter((p) => getPartStockStatus(p) === "out-of-stock").length,
      notStock: parts.filter((p) => getPartStockStatus(p) === "not-stock").length,
    };
  }, [parts]);

  const totalPages = Math.max(1, Math.ceil(filteredParts.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleParts = useMemo(
    () => filteredParts.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredParts, currentPage, pageSize],
  );
  const missingImportCosts = useMemo(
    () => importRows.filter((part) => part.cost === undefined).length,
    [importRows],
  );
  const importedStockTotal = useMemo(
    () => importRows.reduce((sum, part) => sum + (part.stock ?? 0), 0),
    [importRows],
  );
  const selectedParts = useMemo(
    () => parts.filter((part) => selectedPartIds.has(part.id)),
    [parts, selectedPartIds],
  );
  const allVisibleSelected = visibleParts.length > 0 && visibleParts.every((part) => selectedPartIds.has(part.id));

  const togglePartSelection = (partId: number) => {
    setSelectedPartIds((current) => {
      const next = new Set(current);
      if (next.has(partId)) next.delete(partId);
      else next.add(partId);
      return next;
    });
  };

  const toggleVisibleSelection = () => {
    setSelectedPartIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visibleParts.forEach((part) => next.delete(part.id));
      else visibleParts.forEach((part) => next.add(part.id));
      return next;
    });
  };



  // Open Create Modal
  const openCreateModal = () => {
    setModalMode("create");
    setEditingPart(null);
    setFormError("");
    setSubmitting(false);
    
    // Clear form fields
    setName("");
    setCategory("SPARE PARTS");
    setSku("");
    setPrice("");
    setCost("");
    setUom("PCS");
    setItemGroup("SP");
    setItemType("part");
    setTaxCode("");
    setIsStockItem(true);
    setIsActive(true);
    setStock("");
    setLowStockThreshold("10");
    setSupplier("");
    setImage("");
    setImageData("");
    setImageFileName("");
    setImageInputKey((key) => key + 1);
    
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const openEditModal = (part: Part) => {
    setModalMode("edit");
    setEditingPart(part);
    setFormError("");
    setSubmitting(false);
    
    // Load values
    setName(part.name);
    setCategory(part.category);
    setSku(part.sku);
    setPrice(part.price.toString());
    setCost((part.cost ?? 0).toString());
    setUom(part.uom);
    setItemGroup(part.itemGroup || "");
    setItemType(part.itemType || "part");
    setTaxCode(part.taxCode || "");
    setIsStockItem(part.isStockItem ?? true);
    setIsActive(part.isActive ?? true);
    setStock(part.stock.toString());
    setLowStockThreshold(part.lowStockThreshold.toString());
    setSupplier(part.supplierCode || part.supplier);
    setImage(part.image);
    setImageData("");
    setImageFileName("");
    setImageInputKey((key) => key + 1);
    
    setIsModalOpen(true);
  };

  // Handle Form Submit
  const handleFormSubmit = async (e?: React.FormEvent) => {
    if (e?.preventDefault) e.preventDefault();
    setFormError("");
    setSubmitting(true);

    const normalizedName = name.trim();
    const normalizedSku = sku;
    const parsedPrice = Number(price);
    const parsedCost = Number(cost);
    const parsedStock = Number(stock);
    const parsedThreshold = Number(lowStockThreshold);

    if (!normalizedName) {
      setFormError("Part Name is required.");
      setSubmitting(false);
      return;
    }
    if (!normalizedSku.trim()) {
      setFormError("SKU / Code is required.");
      setSubmitting(false);
      return;
    }
    if (normalizedSku.length > 80) {
      setFormError("Item Code must not exceed 80 characters.");
      setSubmitting(false);
      return;
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0 || !Number.isFinite(parsedCost) || parsedCost < 0) {
      setFormError("Unit price and unit cost must be valid non-negative amounts.");
      setSubmitting(false);
      return;
    }
    if (!Number.isFinite(parsedStock) || parsedStock < 0 || !Number.isFinite(parsedThreshold) || parsedThreshold < 0) {
      setFormError("Stock quantity and low threshold must be valid non-negative quantities.");
      setSubmitting(false);
      return;
    }

    const payload = {
      id: editingPart?.id,
      name: normalizedName,
      category: category.trim() || "Others",
      sku: normalizedSku,
      price: parsedPrice,
      cost: parsedCost,
      uom: uom.trim(),
      itemGroup: itemGroup.trim().toUpperCase(),
      itemType,
      taxCode: taxCode.trim().toUpperCase(),
      isStockItem,
      isActive,
      stock: editingPart ? editingPart.stock : parsedStock,
      lowStockThreshold: parsedThreshold,
      supplier: supplier.trim() || "Mewah AutoWorks",
      image: image.trim(),
      imageData,
    };

    const action = modalMode === "create" ? "admin-create-part" : "admin-update-part";

    try {
      await postApi(action, payload);
      setIsModalOpen(false);
      await reload();
      if (modalMode === "edit" && editingPart) {
        const updatedPart: Part = {
          ...editingPart,
          name: normalizedName,
          category: payload.category,
          sku: normalizedSku,
          price: parsedPrice,
          cost: parsedCost,
          uom: payload.uom,
          itemGroup: payload.itemGroup,
          itemType,
          taxCode: payload.taxCode,
          isStockItem,
          isActive,
          stock: parsedStock,
          lowStockThreshold: parsedThreshold,
          supplier: payload.supplier,
          image: imageData || image,
        };
        setDetailPart(updatedPart);
        void openItemDetail(updatedPart);
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save part");
    } finally {
      setSubmitting(false);
    }
  };

  const openImportModal = () => {
    setImportRows([]);
    setImportFileName("");
    setImportError("");
    setIsImportModalOpen(true);
  };

  const handleImportFile = async (file?: File) => {
    setImportRows([]);
    setImportError("");
    setImportFileName(file?.name || "");
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setImportError("Select the prepared AutoCount CSV file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImportError("The import file must not exceed 5 MB.");
      return;
    }
    try {
      setImportRows(parseAutoCountCsv(await file.text()));
    } catch (caught) {
      setImportError(caught instanceof Error ? caught.message : "Unable to read the selected CSV.");
    }
  };

  const handleImportParts = async () => {
    if (importRows.length === 0 || importing) return;
    setImportError("");
    setImporting(true);
    try {
      const result = await postApi<ImportResult>("admin-import-parts", { items: importRows });
      setIsImportModalOpen(false);
      setPage(1);
      await reload();
      toast.success(`AutoCount import complete: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped.`);
    } catch (caught) {
      setImportError(caught instanceof Error ? caught.message : "Unable to import AutoCount parts.");
    } finally {
      setImporting(false);
    }
  };

  const handleImageSelection = (file?: File) => {
    setFormError("");
    if (!file) return;
    if (!acceptedPartImageTypes.includes(file.type)) {
      setFormError("Image must be a JPG, PNG, or WebP file.");
      setImageInputKey((key) => key + 1);
      return;
    }
    if (file.size > MAX_PART_IMAGE_BYTES) {
      setFormError("Image must not exceed 3 MB.");
      setImageInputKey((key) => key + 1);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        setFormError("Unable to read the selected image.");
        return;
      }
      setImageData(reader.result);
      setImageFileName(file.name);
    };
    reader.onerror = () => setFormError("Unable to read the selected image.");
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImage("");
    setImageData("");
    setImageFileName("");
    setImageInputKey((key) => key + 1);
  };

  // Handle Delete Part
  const handleDeletePart = async (part: Part) => {
    const confirmed = await confirmAction({
      title: `Delete part "${part.name}"?`,
      description: `Part ${part.sku || `#${part.id}`} will be permanently removed from inventory. This action cannot be undone.`,
      confirmLabel: "Delete part",
      tone: "danger",
    });
    if (!confirmed) {
      return;
    }

    try {
      await postApi("admin-delete-part", { id: part.id });
      await reload();
      toast.success(`Part "${part.name}" deleted.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete part");
    }
  };

  const openItemDetail = async (part: Part) => {
    setDetailPart(part);
    setItemDetail(null);
    setDetailError("");
    setDetailLoading(true);
    try {
      setItemDetail(await postApi<AutoCountItemDetail>("admin-item-detail", { itemCode: part.sku }));
    } catch (caught) {
      setDetailError(caught instanceof Error ? caught.message : "Unable to load AutoCount Item details.");
    } finally {
      setDetailLoading(false);
    }
  };

  const closeItemDetail = () => {
    setDetailPart(null);
    setItemDetail(null);
    setDetailError("");
    setDetailLoading(false);
  };

  const openStockLedger = async (part: Part) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("partId", String(part.id));
      return next;
    });
    setLedgerPart(part);
    setLedgerData(null);
    setLedgerError("");
    setLedgerLoading(true);
    setLedgerFilter("all");
    setLedgerSupplierFilter("all");
    try {
      const data = await postApi<PartStockLedgerData>("admin-part-stock-ledger", { partId: part.id });
      setLedgerData(data);
    } catch (caught) {
      setLedgerError(caught instanceof Error ? caught.message : "Unable to load stock ledger & history.");
    } finally {
      setLedgerLoading(false);
    }
  };

  const closeStockLedger = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("partId");
      next.delete("id");
      return next;
    });
    setLedgerPart(null);
    setLedgerData(null);
    setLedgerError("");
    setLedgerLoading(false);
    setLedgerSupplierFilter("all");
    setSelectedTxModal(null);
  };

  // Automatically open stock ledger if URL contains partId or id param
  useEffect(() => {
    const partIdParam = Number(searchParams.get("partId") || searchParams.get("id"));
    if (partIdParam && parts && parts.length > 0 && (!ledgerPart || ledgerPart.id !== partIdParam)) {
      const match = parts.find((p) => p.id === partIdParam);
      if (match) {
        void openStockLedger(match);
      }
    }
  }, [searchParams, parts]);

  const openAdjustModal = (part: Part) => {
    setAdjustPart(part);
    setAdjustNewStock(String(part.stock));
    setAdjustReason("");
    setAdjustError("");
  };

  const closeAdjustModal = () => {
    setAdjustPart(null);
    setAdjustNewStock("");
    setAdjustReason("");
    setAdjustError("");
  };

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustPart) return;
    const newStockVal = parseFloat(adjustNewStock);
    if (isNaN(newStockVal)) {
      setAdjustError("Please enter a valid stock quantity.");
      return;
    }
    if (!adjustReason.trim()) {
      setAdjustError("Adjustment reason is strictly mandatory for audit compliance.");
      return;
    }
    if (newStockVal === adjustPart.stock) {
      setAdjustError("The new stock quantity is identical to current stock. No adjustment needed.");
      return;
    }

    setAdjustSubmitting(true);
    setAdjustError("");
    try {
      const res = await postApi<{ success: boolean; newStock: number; delta: number; message: string }>(
        "admin-adjust-part-stock",
        {
          partId: adjustPart.id,
          newStock: newStockVal,
          reason: adjustReason.trim(),
        }
      );
      toast.success(res.message || `Stock adjusted successfully to ${res.newStock}.`);
      const updatedPart = { ...adjustPart, stock: res.newStock };
      closeAdjustModal();
      await reload();
      if (ledgerPart && ledgerPart.id === adjustPart.id) {
        void openStockLedger(updatedPart);
      }
    } catch (caught) {
      setAdjustError(caught instanceof Error ? caught.message : "Failed to adjust stock.");
    } finally {
      setAdjustSubmitting(false);
    }
  };

  const renderAdjustModal = () => {
    if (!adjustPart) return null;
    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm animate-in fade-in duration-150">
        <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200">
          <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-700">
                <SlidersHorizontal className="h-4 w-4 text-indigo-600" />
                Audit Stock Adjustment
              </div>
              <h3 className="text-sm font-black text-slate-900 mt-0.5">{adjustPart.name}</h3>
              <span className="font-mono text-xs text-slate-500">{adjustPart.sku}</span>
            </div>
            <button
              type="button"
              onClick={closeAdjustModal}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <form onSubmit={handleAdjustSubmit} className="flex-1 space-y-4 overflow-y-auto p-5">
            {adjustError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700">
                {adjustError}
              </div>
            ) : null}

            {/* Current vs New Quantity */}
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div>
                <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Current Stock</span>
                <span className="font-mono text-base font-black text-slate-800">
                  {adjustPart.stock} <span className="text-xs font-medium text-slate-500">{adjustPart.uom}</span>
                </span>
              </div>
              <div>
                <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Adjustment Variance</span>
                {(() => {
                  const parsed = parseFloat(adjustNewStock);
                  if (isNaN(parsed)) return <span className="text-xs text-slate-400">—</span>;
                  const delta = parsed - adjustPart.stock;
                  return (
                    <span className={`font-mono text-base font-black ${delta > 0 ? "text-emerald-600" : delta < 0 ? "text-rose-600" : "text-slate-600"}`}>
                      {delta > 0 ? `+${delta}` : delta} <span className="text-xs font-medium text-slate-500">{adjustPart.uom}</span>
                    </span>
                  );
                })()}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">
                New Physical Stock Count *
              </label>
              <input
                type="number"
                min="0"
                step="0.001"
                required
                value={adjustNewStock}
                onChange={(e) => setAdjustNewStock(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 font-mono text-sm font-bold text-slate-900 shadow-2xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200"
                placeholder="e.g. 25"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">
                Audit Reason / Justification *
              </label>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {[
                  "Annual physical stock take discrepancy",
                  "Damaged or expired goods write-off",
                  "Supplier delivery discrepancy",
                  "Unrecorded internal consumption",
                  "Found unrecorded stock on shelf",
                ].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setAdjustReason(preset)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-100 cursor-pointer"
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <textarea
                required
                rows={3}
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="Explain why the physical inventory was adjusted (strictly required for audit compliance)..."
                className="w-full rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-800 shadow-2xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200"
              />
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-800">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  <strong>Audit Mode:</strong> This adjustment is recorded permanently in the stock ledger with your timestamp. Ensure the physical count has been verified.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 pt-3">
              <button
                type="button"
                onClick={closeAdjustModal}
                className="h-9 rounded-xl border border-slate-300 bg-white px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={adjustSubmitting}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-indigo-600 px-4 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
              >
                <CheckCircle2 className="h-4 w-4" />
                {adjustSubmitting ? "Recording..." : "Confirm & Record Adjustment"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  if (isLoading && !hasLoaded) {
    return (
      <PageLoading
        title="Loading Parts Inventory..."
        description="Fetching spare parts catalogue and inventory balances..."
      />
    );
  }

  if (ledgerPart) {
    const stockStatus = stockStatusConfig[getPartStockStatus(ledgerPart)];
    const filteredTransactions = (ledgerData?.transactions || []).filter((tx) => {
      if (ledgerFilter === "in" && Number(tx.quantityChange) <= 0) return false;
      if (ledgerFilter === "out" && Number(tx.quantityChange) >= 0) return false;
      if (
        ledgerFilter === "adjust" &&
        tx.transactionType !== "manual_adjust" &&
        tx.transactionType !== "stock_adjustment" &&
        tx.docType !== "ADJ"
      ) {
        return false;
      }
      if (ledgerSupplierFilter !== "all") {
        const supKey = `${tx.partyCode || ""} ${tx.partyName || ""}`.toLowerCase();
        if (!supKey.includes(ledgerSupplierFilter.toLowerCase())) {
          return false;
        }
      }
      return true;
    });

    const supplierFilterMap = new Map<string, { code: string; name: string }>();
    (ledgerData?.purchasingSummary || []).forEach((s) => {
      const { name, code } = parseSupplierInfo(s.supplierName, s.supplierCode);
      const key = code || name;
      if (key && !supplierFilterMap.has(key)) {
        supplierFilterMap.set(key, { code: key, name: name || code });
      }
    });
    (ledgerData?.transactions || [])
      .filter((t) => t.transactionType === "po_receive" || t.docType === "PO" || t.docType === "OPENING" || t.transactionType === "initial")
      .forEach((t) => {
        const { name, code } = parseSupplierInfo(t.partyName, t.partyCode);
        const key = code || name;
        if (key && !supplierFilterMap.has(key)) {
          supplierFilterMap.set(key, { code: key, name: name || code });
        }
      });
    const supplierFilterOptions = Array.from(supplierFilterMap.values());

    return (
      <div className="w-full space-y-6">
        {/* Top bar with back button & header */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={closeStockLedger}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4 text-slate-500" />
            Back to Parts Inventory
          </button>

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-black tracking-tight text-slate-900">{ledgerPart.name}</h1>
                <span className="font-mono text-xs font-bold rounded-lg bg-slate-100 px-2.5 py-1 text-slate-700 border border-slate-200">
                  {ledgerPart.sku}
                </span>
                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${stockStatus.className}`}>
                  <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />
                  {stockStatus.label}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  Current Balance: <strong className="font-mono text-sm font-black text-slate-900">{ledgerPart.stock.toLocaleString()} {ledgerPart.uom}</strong>
                </span>
                <span className="text-slate-300">|</span>
                <span className="inline-flex items-center gap-1.5 font-medium">
                  Selling Price: <strong className="font-semibold text-slate-900">RM {ledgerPart.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </span>
                {ledgerPart.cost !== null ? (
                  <>
                    <span className="text-slate-300">|</span>
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      Standard Cost: <strong className="font-semibold text-slate-900">RM {ledgerPart.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                    </span>
                  </>
                ) : null}
                <span className="text-slate-300">|</span>
                <span className="inline-flex items-center gap-1.5 font-medium">
                  Category: <strong className="font-semibold text-slate-900">{ledgerPart.itemGroup || ledgerPart.category || "—"}</strong>
                </span>
                <span className="text-slate-300">|</span>
                <span className="inline-flex items-center gap-1.5 font-medium">
                  Primary Supplier:{" "}
                  <strong className="font-semibold text-slate-900">
                    {formatSupplierLabel(ledgerPart.supplierName, ledgerPart.supplierCode, ledgerPart.supplier || "Not assigned")}
                  </strong>
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => void openStockLedger(ledgerPart)}
                disabled={ledgerLoading}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`h-4 w-4 text-slate-500 ${ledgerLoading ? "animate-spin text-blue-600" : ""}`} />
                Refresh Ledger
              </button>

              {canUpdate ? (
                <button
                  type="button"
                  onClick={() => openAdjustModal(ledgerPart)}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-indigo-600 px-5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-indigo-700 cursor-pointer"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Audit Stock Adjustment
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {ledgerLoading ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-12 text-sm font-medium text-slate-500 shadow-2xs">
            <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
            <span>Loading audit ledger &amp; purchasing insights...</span>
          </div>
        ) : null}

        {!ledgerLoading && ledgerError ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-800">
            {ledgerError}
          </div>
        ) : null}

        {!ledgerLoading && ledgerData ? (
          <div className="space-y-6">
            {/* Section 1: Multi-Supplier Purchasing History */}
            <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                    <Building2 className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-extrabold text-slate-900">Multi-Supplier Sourcing &amp; Price History</h2>
                    <p className="text-[11px] text-slate-500">Historical vendor purchases, price variances and volume analytics across different suppliers.</p>
                  </div>
                </div>
                <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                  {ledgerData.purchasingSummary.length} {ledgerData.purchasingSummary.length === 1 ? "Supplier" : "Suppliers"} Recorded
                </span>
              </div>

              {ledgerData.purchasingSummary.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-8 text-center text-xs text-slate-500">
                  No historical supplier purchase orders recorded for this item yet. When purchase orders are created and received, multi-supplier price comparisons will appear here.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {ledgerData.purchasingSummary.map((sup) => {
                    const lastUnitCost = Number(sup.lastUnitCost || 0);
                    const minUnitCost = Number(sup.minUnitCost ?? (sup as any).lowestUnitCost ?? 0);
                    const maxUnitCost = Number(sup.maxUnitCost ?? (sup as any).highestUnitCost ?? 0);
                    const totalQty = Number(sup.totalQuantityOrdered ?? (sup as any).totalQtyPurchased ?? 0);
                    const orderCount = Number(sup.orderCount ?? (sup as any).totalPoCount ?? 0);
                    const lastDate = sup.lastPurchasedAt ?? (sup as any).lastPurchaseDate;
                    const hasPriceVariance = minUnitCost !== maxUnitCost;
                    const { name: cardSupName, code: cardSupCode } = parseSupplierInfo(sup.supplierName, sup.supplierCode);
                    const isPrimary = Boolean(
                      (cardSupCode && (cardSupCode === ledgerPart.supplierCode || cardSupCode === ledgerPart.supplier)) ||
                      (cardSupName && cardSupName === ledgerPart.supplierName)
                    );
                    const filterVal = cardSupCode || cardSupName;
                    const isFilterActive = ledgerSupplierFilter.toLowerCase() === filterVal.toLowerCase();

                    return (
                      <div
                        key={cardSupCode || cardSupName}
                        className={`relative flex flex-col justify-between rounded-xl border p-4 shadow-2xs transition-all hover:shadow-xs ${
                          isFilterActive
                            ? "border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/20"
                            : isPrimary
                            ? "border-blue-300 bg-blue-50/30 hover:bg-blue-50/50"
                            : "border-slate-200 bg-slate-50/50 hover:bg-white"
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-mono text-xs font-bold text-blue-700">
                                {cardSupCode || "—"}
                              </span>
                              {isPrimary ? (
                                <span className="inline-flex rounded-md bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-800 border border-blue-200">
                                  Default Vendor
                                </span>
                              ) : null}
                            </div>
                            <span className="inline-flex rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600 border border-slate-200 shadow-2xs">
                              {orderCount} {orderCount === 1 ? "order" : "orders"}
                            </span>
                          </div>
                          <h3 className="mt-1 font-bold text-slate-900 line-clamp-1" title={cardSupName || cardSupCode}>
                            {cardSupName || cardSupCode}
                          </h3>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-200/80 pt-3 text-xs">
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Last Price</span>
                            <span className="font-mono font-bold text-slate-900">
                              RM {lastUnitCost.toFixed(2)}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Price Range</span>
                            <span className="font-mono text-slate-700">
                              RM {minUnitCost.toFixed(2)} - {maxUnitCost.toFixed(2)}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Received</span>
                            <span className="font-semibold text-slate-800">
                              {totalQty.toLocaleString()} {ledgerPart.uom}
                            </span>
                          </div>
                          <div>
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Last Ordered</span>
                            <span className="text-slate-600">
                              {lastDate ? String(lastDate).substring(0, 10) : "—"}
                            </span>
                          </div>
                        </div>

                        {hasPriceVariance ? (
                          <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-800">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                            <span>Price variance: RM {(maxUnitCost - minUnitCost).toFixed(2)}</span>
                          </div>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => {
                            setLedgerSupplierFilter(isFilterActive ? "all" : filterVal);
                          }}
                          className={`mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border py-1.5 text-xs font-bold transition-all cursor-pointer ${
                            isFilterActive
                              ? "border-blue-600 bg-blue-600 text-white shadow-xs hover:bg-blue-700"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:border-slate-300"
                          }`}
                        >
                          <Search className="h-3.5 w-3.5" />
                          {isFilterActive ? "Clear Filter" : "Trace Receipts"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Section 2: Stock Movement Ledger (Audit Log) */}
            <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
                    <History className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-extrabold text-slate-900">Stock Movement Ledger (Audit Log)</h2>
                    <p className="text-[11px] text-slate-500">Immutable, append-only log of every inventory receipt, dispatch, and physical count adjustment.</p>
                  </div>
                </div>

                {/* Filter Controls: Movement Pills + Supplier Dropdown */}
                <div className="flex flex-wrap items-center gap-2.5">
                  {supplierFilterOptions.length > 0 ? (
                    <div className="flex items-center gap-1.5">
                      <div className="w-56 sm:w-64">
                        <AdminSelect
                          value={ledgerSupplierFilter}
                          onChange={(e) => setLedgerSupplierFilter(e.target.value)}
                          placement="bottom"
                          aria-label="Filter ledger by supplier"
                          className="h-9 w-full text-xs font-semibold"
                        >
                          <option value="all">All Vendors ({supplierFilterOptions.length})</option>
                          {supplierFilterOptions.map((opt) => (
                            <option key={opt.code} value={opt.code}>
                              {formatSupplierLabel(opt.name, opt.code)}
                            </option>
                          ))}
                        </AdminSelect>
                      </div>
                      {ledgerSupplierFilter !== "all" ? (
                        <button
                          type="button"
                          onClick={() => setLedgerSupplierFilter("all")}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors cursor-pointer shadow-2xs"
                          title="Clear supplier filter"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  {/* Filter Pills */}
                  <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setLedgerFilter("all")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${ledgerFilter === "all" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-600 hover:text-slate-900"}`}
                    >
                      All Movements ({ledgerData.transactions.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setLedgerFilter("in")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${ledgerFilter === "in" ? "bg-white text-emerald-700 shadow-2xs" : "text-slate-600 hover:text-slate-900"}`}
                    >
                      Inflow (+)
                    </button>
                    <button
                      type="button"
                      onClick={() => setLedgerFilter("out")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${ledgerFilter === "out" ? "bg-white text-rose-700 shadow-2xs" : "text-slate-600 hover:text-slate-900"}`}
                    >
                      Outflow (-)
                    </button>
                    <button
                      type="button"
                      onClick={() => setLedgerFilter("adjust")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${ledgerFilter === "adjust" ? "bg-white text-indigo-700 shadow-2xs" : "text-slate-600 hover:text-slate-900"}`}
                    >
                      Audit Adjustments
                    </button>
                  </div>
                </div>
              </div>

              {filteredTransactions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-12 text-center text-xs text-slate-500">
                  No stock movement transactions match the selected filter.
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[840px] text-left text-xs">
                      <thead className="border-b border-slate-100 bg-slate-50/80 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="px-4 py-3.5">Date &amp; Time</th>
                          <th className="px-4 py-3.5">Movement Type</th>
                          <th className="px-4 py-3.5">Reference / Doc</th>
                          <th className="px-4 py-3.5">Counterparty / Supplier</th>
                          <th className="px-4 py-3.5 text-right">Qty Change</th>
                          <th className="px-4 py-3.5 text-right">Balance After</th>
                          <th className="px-4 py-3.5 text-right">Unit Cost</th>
                          <th className="px-4 py-3.5">Audit Reason / Notes</th>
                          <th className="px-4 py-3.5">Recorded By</th>
                          <th className="px-4 py-3.5 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredTransactions.map((tx) => {
                          const qty = Number(tx.quantityChange);
                          const isPositive = qty > 0;
                          const isNegative = qty < 0;
                          const docLink = resolveDocLink(tx);

                          let typeBadge = (
                            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-700">
                              {tx.transactionType}
                            </span>
                          );

                          if (tx.transactionType === "po_receive" || tx.docType === "PO") {
                            typeBadge = (
                              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                                <ArrowDownRight className="h-3 w-3 text-emerald-600" />
                                PO Inflow
                              </span>
                            );
                          } else if (tx.transactionType === "job_consume" || tx.docType === "INV") {
                            typeBadge = (
                              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                                <ArrowUpRight className="h-3 w-3 text-amber-600" />
                                Job Dispatch
                              </span>
                            );
                          } else if (
                            tx.transactionType === "manual_adjust" ||
                            tx.transactionType === "stock_adjustment" ||
                            tx.docType === "ADJ"
                          ) {
                            typeBadge = (
                              <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold text-indigo-800">
                                <SlidersHorizontal className="h-3 w-3 text-indigo-600" />
                                Audit Adjust
                              </span>
                            );
                          } else if (tx.transactionType === "return") {
                            typeBadge = (
                              <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-800">
                                Return
                              </span>
                            );
                          } else if (tx.transactionType === "initial" || tx.docType === "OPENING") {
                            typeBadge = (
                              <span className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 px-2.5 py-0.5 text-[11px] font-bold text-purple-800">
                                Opening Stock
                              </span>
                            );
                          }

                          return (
                            <tr key={tx.id} className="transition-colors hover:bg-slate-50/70">
                              <td className="px-4 py-3.5 whitespace-nowrap font-mono text-[11px] text-slate-500">
                                {tx.createdAt ? String(tx.createdAt).substring(0, 16) : "—"}
                              </td>
                              <td className="px-4 py-3.5 whitespace-nowrap">{typeBadge}</td>
                              <td className="px-4 py-3.5 whitespace-nowrap">
                                {tx.docNo ? (
                                  docLink.url ? (
                                    <button
                                      type="button"
                                      onClick={() => navigate(docLink.url!)}
                                      className="group inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/80 px-2.5 py-1 text-xs font-mono font-bold text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300 hover:text-indigo-900 transition-all cursor-pointer shadow-2xs"
                                      title={`Click to jump to ${docLink.label}: ${tx.docNo}`}
                                    >
                                      <span>{tx.docNo}</span>
                                      <ArrowUpRight className="h-3.5 w-3.5 text-indigo-500 group-hover:text-indigo-700 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setSelectedTxModal(tx)}
                                      className="group inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100/90 px-2.5 py-1 text-xs font-mono font-bold text-slate-800 hover:bg-slate-200/90 hover:border-slate-300 transition-all cursor-pointer shadow-2xs"
                                      title={`Click to view ${docLink.label} details`}
                                    >
                                      <span>{tx.docNo}</span>
                                      <Eye className="h-3 w-3 text-slate-500 group-hover:text-slate-800" />
                                    </button>
                                  )
                                ) : (
                                  <span className="font-mono text-slate-400">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3.5 text-slate-700 max-w-[220px]" title={formatSupplierLabel(tx.partyName, tx.partyCode)}>
                                {tx.transactionType === "po_receive" || tx.docType === "PO" || tx.docType === "OPENING" || tx.transactionType === "initial" ? (
                                  (() => {
                                    const { name: supName, code: supCode } = parseSupplierInfo(tx.partyName, tx.partyCode);
                                    const isOpening = tx.docType === "OPENING" || tx.transactionType === "initial";
                                    return (
                                      <div className="flex flex-col">
                                        <span className="font-bold text-slate-900 truncate">
                                          {supName || supCode || (isOpening ? "System Baseline" : "Supplier")}
                                        </span>
                                        {supCode && supCode !== supName ? (
                                          <span className="font-mono text-[10px] text-emerald-700 font-semibold">
                                            {isOpening ? "Vendor / Acc:" : "Supplier:"} {supCode}
                                          </span>
                                        ) : null}
                                      </div>
                                    );
                                  })()
                                ) : tx.docType === "INV" || tx.transactionType === "job_consume" ? (
                                  <div className="flex flex-col">
                                    <span className="font-bold text-slate-900 truncate">
                                      {tx.partyName || "Workshop Customer"}
                                    </span>
                                    {tx.partyCode ? (
                                      <span className="font-mono text-[10px] text-slate-500 font-semibold">
                                        Customer: {tx.partyCode}
                                      </span>
                                    ) : null}
                                  </div>
                                ) : (
                                  <span>{formatSupplierLabel(tx.partyName, tx.partyCode)}</span>
                                )}
                              </td>
                              <td className="px-4 py-3.5 text-right whitespace-nowrap font-mono font-bold">
                                <span className={isPositive ? "text-emerald-700" : isNegative ? "text-rose-700" : "text-slate-600"}>
                                  {isPositive ? `+${qty}` : qty} {ledgerPart.uom}
                                </span>
                              </td>
                              <td className="px-4 py-3.5 text-right whitespace-nowrap font-mono font-black text-slate-900">
                                {Number(tx.balanceAfter).toLocaleString()} {ledgerPart.uom}
                              </td>
                              <td className="px-4 py-3.5 text-right whitespace-nowrap font-mono text-slate-700">
                                {tx.unitCost !== null && tx.unitCost !== undefined ? `RM ${Number(tx.unitCost).toFixed(2)}` : "—"}
                              </td>
                              <td className="px-4 py-3.5 text-slate-600 max-w-[240px] truncate" title={tx.notes}>
                                {tx.notes || "—"}
                              </td>
                              <td className="px-4 py-3.5 whitespace-nowrap text-slate-500 text-[11px] font-medium">
                                {(tx as any).operatorName || tx.createdBy || "System"}
                              </td>
                              <td className="px-4 py-3.5 text-center whitespace-nowrap">
                                <div className="flex items-center justify-center gap-1.5">
                                  {docLink.url ? (
                                    <button
                                      type="button"
                                      onClick={() => navigate(docLink.url!)}
                                      className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300 transition-colors cursor-pointer"
                                      title={`Jump to ${docLink.label}`}
                                    >
                                      <span>Open {docLink.type === "po" ? "PO" : docLink.type === "invoice" ? "Invoice" : "WO"}</span>
                                      <ArrowUpRight className="h-3.5 w-3.5" />
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={() => setSelectedTxModal(tx)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors cursor-pointer shadow-2xs"
                                    title="View Audit Details"
                                  >
                                    <Eye className="h-3 w-3 text-slate-500" />
                                    <span>Details</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          </div>
        ) : null}

        {/* Stock Movement Audit Voucher Detail Modal */}
        {selectedTxModal && ledgerPart && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
            <div className="relative w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-100 shadow-2xs">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-black text-slate-900 font-mono">
                        {selectedTxModal.docNo || "Stock Transaction"}
                      </h3>
                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                        {selectedTxModal.transactionType}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Recorded at {selectedTxModal.createdAt ? String(selectedTxModal.createdAt) : "—"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTxModal(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
                {/* Part Info Banner */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Stock Item</span>
                    <h4 className="text-sm font-black text-slate-900">{ledgerPart.name}</h4>
                    <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                      <span>SKU: <strong className="text-slate-700">{ledgerPart.sku}</strong></span>
                      <span>·</span>
                      <span>UOM: <strong className="text-slate-700">{ledgerPart.uom}</strong></span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Current Stock</span>
                    <p className="font-mono text-base font-black text-slate-900">
                      {ledgerPart.stock.toLocaleString()} {ledgerPart.uom}
                    </p>
                  </div>
                </div>

                {/* Transaction Stat Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Quantity Change</span>
                    <span className={`font-mono text-base font-black ${
                      Number(selectedTxModal.quantityChange) > 0
                        ? "text-emerald-600"
                        : Number(selectedTxModal.quantityChange) < 0
                          ? "text-rose-600"
                          : "text-slate-700"
                    }`}>
                      {Number(selectedTxModal.quantityChange) > 0 ? `+${selectedTxModal.quantityChange}` : selectedTxModal.quantityChange} {ledgerPart.uom}
                    </span>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Balance After</span>
                    <span className="font-mono text-base font-black text-slate-900">
                      {Number(selectedTxModal.balanceAfter).toLocaleString()} {ledgerPart.uom}
                    </span>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Unit Cost</span>
                    <span className="font-mono text-base font-black text-slate-900">
                      {selectedTxModal.unitCost !== null && selectedTxModal.unitCost !== undefined
                        ? `RM ${Number(selectedTxModal.unitCost).toFixed(2)}`
                        : "—"}
                    </span>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total Impact</span>
                    <span className="font-mono text-base font-black text-slate-900">
                      {selectedTxModal.unitCost !== null && selectedTxModal.unitCost !== undefined
                        ? `RM ${(Math.abs(Number(selectedTxModal.quantityChange)) * Number(selectedTxModal.unitCost)).toFixed(2)}`
                        : "—"}
                    </span>
                  </div>
                </div>

                {/* Counterparty & Record Details */}
                <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100 text-xs">
                  <div className="flex items-center justify-between p-3">
                    <span className="text-slate-500 font-medium">Document / Voucher Type</span>
                    <span className="font-bold text-slate-800">{resolveDocLink(selectedTxModal).label} ({selectedTxModal.docType})</span>
                  </div>
                  <div className="flex items-center justify-between p-3">
                    <span className="text-slate-500 font-medium">Counterparty / Supplier / Customer</span>
                    <span className="font-bold text-slate-800 text-right">
                      {formatSupplierLabel(selectedTxModal.partyName, selectedTxModal.partyCode)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3">
                    <span className="text-slate-500 font-medium">Recorded By / Operator</span>
                    <span className="font-bold text-slate-800">
                      {(selectedTxModal as any).operatorName || selectedTxModal.createdBy || "System"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3">
                    <span className="text-slate-500 font-medium">Transaction ID</span>
                    <span className="font-mono text-slate-600">#{selectedTxModal.id}</span>
                  </div>
                </div>

                {/* Audit Reason & Notes */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-1">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block">
                    Audit Reason / Notes
                  </span>
                  <p className="text-xs text-slate-800 leading-relaxed font-normal whitespace-pre-wrap">
                    {selectedTxModal.notes || "No additional audit notes recorded."}
                  </p>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/80 px-6 py-4">
                <div>
                  {resolveDocLink(selectedTxModal).url && (
                    <button
                      type="button"
                      onClick={() => {
                        const targetUrl = resolveDocLink(selectedTxModal).url!;
                        setSelectedTxModal(null);
                        navigate(targetUrl);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 transition-colors cursor-pointer"
                    >
                      <span>{resolveDocLink(selectedTxModal).actionText} ({selectedTxModal.docNo})</span>
                      <ArrowUpRight className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTxModal(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {renderAdjustModal()}
      </div>
    );
  }

  const isEditingPart = Boolean(isModalOpen && modalMode === "edit" && editingPart);
  const standalonePart = isEditingPart ? editingPart : detailPart;

  if (standalonePart) {
    const stockStatus = stockStatusConfig[getPartStockStatus(standalonePart)];
    const closeStandalonePart = () => {
      setIsModalOpen(false);
      setEditingPart(null);
      closeItemDetail();
    };
    const cancelPartEdit = () => {
      setIsModalOpen(false);
      setFormError("");
      if (!detailPart && editingPart) void openItemDetail(editingPart);
    };

    return (
      <div id="part-detail-form" className="w-full space-y-6">
        <div className="space-y-3">
          <button type="button" onClick={closeStandalonePart} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 cursor-pointer"><ArrowLeft className="h-4 w-4 text-slate-500" />Back to Parts Inventory</button>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-black tracking-tight text-slate-900">{standalonePart.name}</h1><span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${stockStatus.className}`}><span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />{stockStatus.label}</span></div>
              <p className="mt-1 text-xs text-slate-500">{standalonePart.sku} · AutoCount item master, pricing and workshop stock controls.</p>
            </div>
            <div className="flex items-center gap-2.5">
              {!isEditingPart ? (
                <>
                  {standalonePart.isStockItem && standalonePart.itemType === "part" ? (
                    <button
                      type="button"
                      onClick={() => void openStockLedger(standalonePart)}
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 cursor-pointer"
                    >
                      <History className="h-4 w-4 text-blue-600" />
                      Stock Ledger &amp; History
                    </button>
                  ) : null}
                  {canUpdate ? (
                    <button
                      key="edit-part-btn"
                      type="button"
                      onClick={() => openEditModal(standalonePart)}
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-blue-600 bg-white px-5 text-xs font-bold text-blue-600 shadow-2xs transition-colors hover:bg-blue-50 cursor-pointer"
                    >
                      <Edit className="h-4 w-4" />
                      Edit Part
                    </button>
                  ) : null}
                </>
              ) : (
                <>
                  <button
                    key="cancel-part-btn"
                    type="button"
                    disabled={submitting}
                    onClick={cancelPartEdit}
                    className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </button>
                  <button
                    key="save-part-btn"
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleFormSubmit()}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                  >
                    <Save className="h-4 w-4" />
                    {submitting ? "Saving..." : "Save Changes"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {formError ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-medium text-rose-700">{formError}</div> : null}

        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs">
          <h2 className="text-sm font-extrabold text-slate-900">General Information</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {isEditingPart ? <><div><label className={partLabelClass}>Item Code *</label><input required maxLength={80} value={sku} onChange={(event) => setSku(event.target.value)} className={`${partFieldClass} font-mono font-bold`} /></div><div className="lg:col-span-2"><label className={partLabelClass}>Part Name *</label><input required value={name} onChange={(event) => setName(event.target.value)} className={partFieldClass} /></div><div><label className={partLabelClass}>UOM</label><input value={uom} onChange={(event) => setUom(event.target.value)} className={partFieldClass} /></div></> : <><PartReadOnlyField label="Item Code" value={standalonePart.sku} mono /><div className="lg:col-span-2"><PartReadOnlyField label="Part Name" value={standalonePart.name} /></div><PartReadOnlyField label="UOM" value={standalonePart.uom} /></>}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {isEditingPart ? <><div><label className={partLabelClass}>AutoCount Stock Group</label><AdminSelect value={itemGroup} onChange={(event) => { const nextGroup = event.target.value; const group = stockGroupMap.get(nextGroup); setItemGroup(nextGroup); setCategory(group?.description || nextGroup || "Others"); if (group) { setItemType(group.itemType); setIsStockItem(group.itemType === "part" || group.itemType === "vehicle"); } }} className="h-10 w-full text-xs"><option value="">No AutoCount group</option>{itemGroupOptions.map((groupCode) => <option key={groupCode} value={groupCode}>{groupCode}{stockGroupMap.get(groupCode)?.description ? ` — ${stockGroupMap.get(groupCode)?.description}` : ""}</option>)}</AdminSelect></div><div><label className={partLabelClass}>Item Type</label><AdminSelect value={itemType} onChange={(event) => { const nextType = event.target.value as ItemType; setItemType(nextType); setIsStockItem(nextType === "part" || nextType === "vehicle"); }} className="h-10 w-full text-xs">{Object.entries(itemTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</AdminSelect></div><div><label className={partLabelClass}>Tax Code</label><input value={taxCode} onChange={(event) => setTaxCode(event.target.value)} className={partFieldClass} /></div><div><label className={partLabelClass}>Active Status</label><AdminSelect value={isActive ? "Active" : "Inactive"} onChange={(event) => setIsActive(event.target.value === "Active")} className="h-10 w-full text-xs"><option>Active</option><option>Inactive</option></AdminSelect></div></> : <><PartReadOnlyField label="Stock Group" value={standalonePart.itemGroup || standalonePart.category} /><PartReadOnlyField label="Item Type" value={itemTypeLabels[standalonePart.itemType]} /><PartReadOnlyField label="Tax Code" value={standalonePart.taxCode} /><PartReadOnlyField label="Active Status" value={standalonePart.isActive ? "Active" : "Inactive"} /></>}
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs">
          <h2 className="text-sm font-extrabold text-slate-900">Pricing &amp; Stock</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {isEditingPart ? (
              <>
                <div>
                  <label className={partLabelClass}>Selling Price (RM)</label>
                  <input type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} className={partFieldClass} />
                </div>
                {canViewCost ? (
                  <div>
                    <label className={partLabelClass}>Unit Cost (RM)</label>
                    <input type="number" min="0" step="0.01" value={cost} onChange={(event) => setCost(event.target.value)} className={partFieldClass} />
                  </div>
                ) : null}
                <div>
                  <div className="flex items-center justify-between">
                    <label className={partLabelClass}>Stock Quantity</label>
                    <button
                      type="button"
                      onClick={() => void openStockLedger(standalonePart)}
                      className="text-[10px] font-bold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
                      title="Adjust stock in Stock Ledger & History with mandatory reason"
                    >
                      Adjust in History ↗
                    </button>
                  </div>
                  <input
                    type="number"
                    value={stock}
                    disabled
                    readOnly
                    title="Stock quantity cannot be edited directly here. Use 'Stock Ledger & History' to adjust stock with mandatory reason."
                    className={`${partFieldClass} bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed select-none`}
                  />
                  <p className="mt-1 text-[10px] text-slate-400">
                    Adjustable only via Stock Ledger &amp; History with audit reason.
                  </p>
                </div>
                <div>
                  <label className={partLabelClass}>Low Stock Threshold</label>
                  <input type="number" min="0" step="0.001" value={lowStockThreshold} onChange={(event) => setLowStockThreshold(event.target.value)} className={partFieldClass} />
                </div>
              </>
            ) : (
              <>
                <PartReadOnlyField label="Selling Price (RM)" value={standalonePart.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} />
                {canViewCost ? <PartReadOnlyField label="Unit Cost (RM)" value={standalonePart.cost?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} /> : null}
                <PartReadOnlyField label="Stock Quantity" value={standalonePart.isStockItem ? standalonePart.stock.toLocaleString() : "Not tracked"} />
                <PartReadOnlyField label="Low Stock Threshold" value={standalonePart.lowStockThreshold} />
              </>
            )}
          </div>
          {isEditingPart ? <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-600"><input type="checkbox" checked={isStockItem} onChange={(event) => setIsStockItem(event.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-blue-600" />Track stock quantity</label> : null}
        </section>

        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs">
          <h2 className="text-sm font-extrabold text-slate-900">Supplier &amp; Item Media</h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr_2fr]">
            {isEditingPart ? <div><label className={partLabelClass}>Supplier Code</label><input value={supplier} onChange={(event) => setSupplier(event.target.value)} className={partFieldClass} /></div> : <PartReadOnlyField label="Supplier Code" value={standalonePart.supplierCode || standalonePart.supplier} />}
            <PartReadOnlyField label="Supplier Name" value={standalonePart.supplierName} />
            {isEditingPart ? <div><label className={partLabelClass}>Part Image</label><div className="flex min-h-10 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2"><label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"><Upload className="h-3.5 w-3.5" />Choose Image<input key={imageInputKey} type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={(event) => handleImageSelection(event.target.files?.[0])} className="sr-only" /></label><span className="truncate text-xs text-slate-500">{imageFileName || (image ? "Current image" : "No image")}</span>{(imageData || image) ? <button type="button" onClick={removeImage} className="ml-auto text-xs font-bold text-red-600">Remove</button> : null}</div></div> : <PartReadOnlyField label="Part Image" value={standalonePart.image ? "Available" : "No image"} />}
          </div>
        </section>

        {!isEditingPart ? <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs"><div className="flex items-center gap-2"><Database className="h-4 w-4 text-blue-600" /><h2 className="text-sm font-extrabold text-slate-900">AutoCount Master Details</h2></div>{detailLoading ? <div className="flex min-h-32 items-center justify-center text-xs font-medium text-slate-500"><RefreshCw className="mr-2 h-4 w-4 animate-spin text-blue-600" />Loading AutoCount item details...</div> : detailError ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">{detailError}</div> : itemDetail ? <div className="space-y-4">{itemDetailSections.map((section) => { const fields = section.fields.filter((field) => Object.prototype.hasOwnProperty.call(itemDetail.fields, field)); if (fields.length === 0) return null; return <div key={section.title} className="overflow-hidden rounded-xl border border-slate-100"><h3 className="border-b border-slate-100 bg-slate-50/70 px-4 py-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">{section.title}</h3><div className="grid sm:grid-cols-2 lg:grid-cols-4">{fields.map((field) => <div key={field} className="border-b border-r border-slate-100 px-4 py-3"><p className="text-[10px] font-bold text-slate-400">{itemFieldLabel(field)}</p><p className="mt-1 break-words text-xs font-medium text-slate-800">{itemFieldValue(field, itemDetail.fields[field])}</p></div>)}</div></div>; })}</div> : <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400">No additional AutoCount fields available.</div>}</section> : null}
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
              {t("parts_management")}
            </h1>
            <AutoCountSyncBadge
              label="AutoCount Stock Master"
              onRefresh={() => void reload()}
              isRefreshing={isLoading}
            />
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Spare parts catalog and stock levels are master-managed in AutoCount and synced to MAW
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        {canCreate ? <>
          <button
            type="button"
            onClick={openImportModal}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-blue-600 bg-white px-4 text-xs font-bold text-blue-600 shadow-2xs hover:bg-blue-50 transition-colors cursor-pointer"
          >
            <Upload className="h-4 w-4" />
            Import
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-bold text-white shadow-2xs hover:bg-blue-700 transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            {t("add_part")}
          </button>
        </> : null}
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <div className="flex items-start gap-2">
            <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Parts inventory is unavailable</p>
              <p className="mt-0.5">{error}. No substitute inventory data is being shown.</p>
            </div>
          </div>
          <button type="button" onClick={reload} disabled={isLoading} className="inline-flex shrink-0 items-center rounded-lg border border-red-300 bg-white px-3 py-1.5 font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50">
            <RefreshCw className={`mr-1.5 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Retry
          </button>
        </div>
      )}

      {!error && (
        <div className="relative z-20 rounded-2xl border border-slate-200 bg-white shadow-2xs">
          <div className="flex items-center gap-6 sm:gap-8 border-b border-slate-100 px-6 pt-3.5 overflow-x-auto no-scrollbar">
            {(
              [
                { id: "All", label: "All Items", count: stockCounts.all },
                { id: "in-stock", label: "In Stock", count: stockCounts.inStock },
                { id: "low-stock", label: "Low Stock", count: stockCounts.lowStock, badgeColor: stockCounts.lowStock > 0 ? "bg-amber-100 text-amber-800" : undefined },
                { id: "out-of-stock", label: "Out of Stock", count: stockCounts.outOfStock, badgeColor: stockCounts.outOfStock > 0 ? "bg-rose-100 text-rose-700 animate-pulse" : undefined },
                { id: "not-stock", label: "Non-stock / Services", count: stockCounts.notStock },
              ] as { id: "All" | StockStatus; label: string; count: number; badgeColor?: string }[]
            ).map((tab) => {
              const isActive = selectedStockStatus === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setSelectedStockStatus(tab.id);
                    setPage(1);
                  }}
                  className={`relative inline-flex h-11 shrink-0 items-center gap-2 border-b-2 px-1 text-xs font-bold transition-colors cursor-pointer ${
                    isActive
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-slate-700 hover:text-blue-600"
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                      isActive ? "bg-blue-50 text-blue-600" : tab.badgeColor || "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-1 gap-3 px-6 py-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-[1.5fr_1.1fr_1.1fr_1.2fr_1.1fr_auto]">
            <div className="relative sm:col-span-2 md:col-span-1 xl:col-span-1">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                placeholder={t("search_parts")}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-9 text-xs shadow-2xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
              />
              {searchTerm ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm("");
                    setPage(1);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  title="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <div>
              <AdminSelect
                value={selectedCategory}
                onChange={(e) => {
                  setSelectedCategory(e.target.value);
                  setPage(1);
                }}
                placement="bottom"
                aria-label="Filter by category"
                className="h-10 w-full text-xs"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat === "All" ? "All Categories" : cat}
                  </option>
                ))}
              </AdminSelect>
            </div>
            <div>
              <AdminSelect
                value={selectedItemType}
                onChange={(e) => {
                  setSelectedItemType(e.target.value as "All" | ItemType);
                  setPage(1);
                }}
                placement="bottom"
                aria-label="Filter by item type"
                className="h-10 w-full text-xs"
              >
                <option value="All">All Item Types</option>
                <option value="part">Part / Stock</option>
                <option value="labour">Labour</option>
                <option value="service">Service</option>
                <option value="fee">Fee / Charge</option>
                <option value="vehicle">Vehicle Sales</option>
                <option value="other">Other</option>
              </AdminSelect>
            </div>
            <div>
              <AdminSelect
                value={selectedSupplier}
                onChange={(e) => {
                  setSelectedSupplier(e.target.value);
                  setPage(1);
                }}
                placement="bottom"
                aria-label="Filter by supplier"
                className="h-10 w-full text-xs"
              >
                <option value="All">All Suppliers</option>
                {suppliers.map((sup) => (
                  <option key={sup.code} value={sup.code}>
                    {sup.label}
                  </option>
                ))}
              </AdminSelect>
            </div>
            <div>
              <AdminSelect
                value={selectedActiveStatus}
                onChange={(e) => {
                  setSelectedActiveStatus(e.target.value as "All" | "active" | "inactive");
                  setPage(1);
                }}
                placement="bottom"
                aria-label="Filter by status"
                className="h-10 w-full text-xs"
              >
                <option value="All">All Status (Active & Inactive)</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive / Discontinued</option>
              </AdminSelect>
            </div>
            <button
              type="button"
              onClick={() => {
                setSearchTerm("");
                setSelectedCategory("All");
                setSelectedItemType("All");
                setSelectedStockStatus("All");
                setSelectedSupplier("All");
                setSelectedActiveStatus("All");
                setSortKey(null);
                setPage(1);
              }}
              title="Reset all filters"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <RotateCcw className="h-4 w-4 text-slate-500" />
              Reset
            </button>
          </div>
        </div>
      )}

      {isLoading && parts.length === 0 ? (
        <div className="flex min-h-48 items-center justify-center rounded-lg border border-gray-200 bg-white text-sm text-gray-500">
          <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
          Loading parts inventory...
        </div>
      ) : null}

      {!isLoading && !error && parts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
          <ImageIcon className="mx-auto h-9 w-9 text-gray-300" />
          <h2 className="mt-3 text-sm font-semibold text-gray-900">No parts in inventory</h2>
          <p className="mt-1 text-sm text-gray-500">All parts and stock quantities are synced from AutoCount.</p>
        </div>
      ) : null}

      {!isLoading && !error && parts.length > 0 && filteredParts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-sm text-gray-500">
          No parts match the current search, category, supplier, status and stock filters.
        </div>
      ) : null}

      {/* Parts Table */}
      {!error && visibleParts.length > 0 ? <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left">
            <thead className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="w-12 px-5 py-3.5">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleVisibleSelection} aria-label="Select visible parts" className="h-4 w-4 rounded border-gray-300 text-[#1e3a8a] focus:ring-blue-500" />
                </th>
                <SortableHeader
                  label="Item Code"
                  sortKey="sku"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  className="px-4 py-3.5"
                />
                <SortableHeader
                  label="Part"
                  sortKey="name"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  className="px-4 py-3.5"
                />
                <SortableHeader
                  label="Category"
                  sortKey="category"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  className="px-4 py-3.5"
                />
                <SortableHeader
                  label="Supplier"
                  sortKey="supplier"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  className="px-4 py-3.5"
                />
                <th className="px-4 py-3.5 text-left">UOM</th>
                <SortableHeader
                  label="Price"
                  sortKey="price"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  className="px-4 py-3.5"
                />
                <SortableHeader
                  label="Stock"
                  sortKey="stock"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  className="px-4 py-3.5"
                />
                <SortableHeader
                  label="Status"
                  sortKey="status"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  className="px-4 py-3.5"
                />
                <th className="px-5 py-3.5 text-right whitespace-nowrap font-bold text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibleParts.map((part) => {
                const status = stockStatusConfig[getPartStockStatus(part)];
                const isSelected = selectedPartIds.has(part.id);
                return (
                  <tr key={part.id} className={`text-xs transition-colors hover:bg-slate-50/60 ${isSelected ? "bg-blue-50/70" : ""}`}>
                    <td className="px-5 py-4">
                      <input type="checkbox" checked={isSelected} onChange={() => togglePartSelection(part.id)} aria-label={`Select ${part.name}`} className="h-4 w-4 rounded border-gray-300 text-[#1e3a8a] focus:ring-blue-500" />
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <button type="button" onClick={() => void openItemDetail(part)} className="font-mono font-bold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer">{part.sku}</button>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => void openItemDetail(part)} className="max-w-[300px] truncate font-bold text-slate-900 transition-colors hover:text-blue-600 cursor-pointer" title={part.name}>{part.name}</button>
                        {!part.isActive && (
                          <span className="shrink-0 rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                            Inactive
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap font-semibold text-slate-700">
                      {part.category || part.itemGroup || "—"}
                    </td>
                    <td className="px-4 py-4 max-w-[200px]" title={formatSupplierLabel(part.supplierName, part.supplierCode || part.supplier)}>
                      {(() => {
                        const { name: sName, code: sCode } = parseSupplierInfo(part.supplierName, part.supplierCode || part.supplier);
                        if (sName) {
                          return (
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-900 truncate">{sName}</span>
                              {sCode && sCode !== sName && (
                                <span className="font-mono text-[10px] text-blue-600 font-semibold">{sCode}</span>
                              )}
                            </div>
                          );
                        }
                        if (sCode) {
                          return <span className="font-mono text-xs text-slate-700 font-bold">{sCode}</span>;
                        }
                        return <span className="text-slate-400">—</span>;
                      })()}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap font-semibold text-slate-700">
                      {part.uom || "—"}
                    </td>
                    <td className="px-4 py-4 text-left whitespace-nowrap font-semibold text-slate-900">RM {part.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-4 py-4 text-left">
                      {part.itemType === "part" && part.isStockItem ? (
                        <button
                          type="button"
                          onClick={() => void openStockLedger(part)}
                          className={`font-semibold hover:underline cursor-pointer ${part.stock < 0 ? "text-red-600" : "text-slate-900 hover:text-blue-600"}`}
                          title="Click to view stock ledger & purchasing history"
                        >
                          {part.stock.toLocaleString()}
                        </button>
                      ) : (
                        <span className="font-medium text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4"><span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${status.className}`}><span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />{status.label}</span></td>
                    <td className="px-5 py-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => void openItemDetail(part)}
                          aria-label={`View ${part.name} AutoCount details`}
                          title="View AutoCount Details"
                          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:border-slate-300 hover:bg-slate-50 cursor-pointer"
                        >
                          <Eye className="h-3.5 w-3.5 text-slate-500" />
                          Details
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <AdminPagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredParts.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          itemLabel="items"
        />
      </div> : null}

      {selectedParts.length > 0 ? (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-2xl">
          <span className="border-r border-gray-200 px-2 text-sm font-semibold text-gray-800">{selectedParts.length} selected</span>
          {canUpdate ? <button type="button" disabled={selectedParts.length !== 1} onClick={() => openEditModal(selectedParts[0])} className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"><Edit className="mr-2 h-4 w-4" />Edit info</button> : null}
          {canDelete ? <button type="button" disabled={selectedParts.length !== 1} onClick={() => handleDeletePart(selectedParts[0])} className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 className="mr-2 h-4 w-4" />Delete</button> : null}
          <button type="button" onClick={() => setSelectedPartIds(new Set())} aria-label="Clear selection" className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X className="h-4 w-4" /></button>
        </div>
      ) : null}

      {detailPart ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200">
            <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50/90 px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-700"><Database className="h-4 w-4" />AutoCount Item</div>
                <h2 className="mt-1 truncate text-lg font-extrabold text-slate-900">{detailPart.sku} · {detailPart.name}</h2>
              </div>
              <button type="button" onClick={closeItemDetail} aria-label="Close Item details" className="ml-4 rounded-xl border border-slate-200 bg-white p-2 text-slate-500 shadow-sm hover:bg-slate-100 hover:text-slate-800"><X className="h-5 w-5" /></button>
            </header>

            <div className="overflow-y-auto p-5">
              {detailLoading ? (
                <div className="flex min-h-64 items-center justify-center text-sm font-medium text-slate-500"><RefreshCw className="mr-2 h-5 w-5 animate-spin text-blue-600" />Loading Item details...</div>
              ) : null}

              {!detailLoading && detailError ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">{detailError}</div>
              ) : null}

              {!detailLoading && itemDetail ? (
                <div className="space-y-5">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-xl border border-blue-100 bg-blue-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Item Code</p><p className="mt-1 break-all font-mono text-sm font-bold text-slate-900">{itemDetail.itemCode}</p></div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Item Group</p><p className="mt-1 text-sm font-bold text-slate-900">{itemFieldValue("ItemGroup", itemDetail.fields.ItemGroup)}</p></div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Active</p><p className="mt-1 text-sm font-bold text-slate-900">{itemFieldValue("IsActive", itemDetail.fields.IsActive)}</p></div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">AutoCount Image</p><p className="mt-1 text-sm font-bold text-slate-900">{itemDetail.image.hasImage ? `${itemDetail.image.size.toLocaleString()} bytes` : "No image"}</p></div>
                  </div>

                  {itemDetailSections.map((section) => {
                    const fields = section.fields.filter((field) => Object.prototype.hasOwnProperty.call(itemDetail.fields, field));
                    if (fields.length === 0) return null;
                    return (
                      <section key={section.title} className="overflow-hidden rounded-xl border border-slate-200">
                        <h3 className="border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider text-slate-600">{section.title}</h3>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3">
                          {fields.map((field) => {
                            const value = itemFieldValue(field, itemDetail.fields[field]);
                            const isLong = value.length > 80;
                            return (
                              <div key={field} className={`${isLong ? "sm:col-span-2 lg:col-span-3" : ""} min-w-0 border-b border-r border-slate-100 px-4 py-3`}>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{itemFieldLabel(field)}</p>
                                <p className="mt-1 whitespace-pre-wrap break-words text-sm font-medium text-slate-800">{value}</p>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}

                  {Object.entries(itemDetail.fields).some(([field]) => !knownItemDetailFields.has(field)) ? (
                    <section className="overflow-hidden rounded-xl border border-slate-200">
                      <h3 className="border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider text-slate-600">Additional fields</h3>
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3">
                        {Object.entries(itemDetail.fields).filter(([field]) => !knownItemDetailFields.has(field)).map(([field, rawValue]) => (
                          <div key={field} className="min-w-0 border-b border-r border-slate-100 px-4 py-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{itemFieldLabel(field)}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm font-medium text-slate-800">{itemFieldValue(field, rawValue)}</p></div>
                        ))}
                      </div>
                    </section>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {isImportModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-5">
          <div className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-7 sm:py-5">
              <div className="flex items-start gap-3.5"><div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1e3a8a] ring-1 ring-blue-100"><Upload className="h-5 w-5" /></div><div>
                <h2 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">Import AutoCount Parts</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500 sm:text-sm">Review the selected CSV before creating or updating inventory records.</p>
              </div></div>
              <button type="button" onClick={() => setIsImportModalOpen(false)} aria-label="Close AutoCount import" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/80 p-4 sm:p-6">
              {importError ? (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {importError}
                </div>
              ) : null}
              <label className="flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-blue-200 bg-white p-6 shadow-sm transition hover:border-blue-300 hover:bg-blue-50/50">
                <div className="text-center">
                  <Upload className="mx-auto h-7 w-7 text-[#1e3a8a]" />
                  <p className="mt-2 text-sm font-semibold text-gray-800">{importFileName || "Select prepared AutoCount CSV"}</p>
                  <p className="mt-1 text-xs text-gray-500">Maximum 5,000 records · 5 MB</p>
                </div>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  onChange={(event) => handleImportFile(event.target.files?.[0])}
                />
              </label>
              {importRows.length > 0 ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg bg-blue-50 p-3"><p className="text-xs text-gray-500">Ready</p><p className="text-xl font-bold text-blue-700">{importRows.length}</p></div>
                    <div className="rounded-lg bg-amber-50 p-3"><p className="text-xs text-gray-500">Missing unit cost</p><p className="text-xl font-bold text-amber-700">{missingImportCosts}</p></div>
                    <div className="rounded-lg bg-gray-100 p-3"><p className="text-xs text-gray-500">Imported stock</p><p className="text-xl font-bold text-gray-700">{importedStockTotal.toLocaleString()}</p></div>
                  </div>
                  <div className="overflow-hidden rounded-lg border border-gray-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-gray-50 text-gray-500"><tr><th className="px-3 py-2">SKU</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">UOM</th><th className="px-3 py-2 text-right">Stock</th><th className="px-3 py-2 text-right">Cost</th></tr></thead>
                      <tbody>
                        {importRows.slice(0, IMPORT_PREVIEW_LIMIT).map((part) => (
                          <tr key={part.sku} className="border-t border-gray-100"><td className="px-3 py-2 font-mono">{part.sku}</td><td className="max-w-xs truncate px-3 py-2">{part.name}</td><td className="px-3 py-2">{part.uom || "-"}</td><td className="px-3 py-2 text-right">{part.stock ?? "-"}</td><td className="px-3 py-2 text-right">{part.cost === undefined ? "-" : `RM ${part.cost.toFixed(2)}`}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-gray-500">Only columns present in the CSV are updated. Missing fields are preserved for existing SKUs.</p>
                </div>
              ) : null}
            </div>
            <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 bg-white px-4 py-3.5 sm:px-7">
              <button type="button" onClick={() => setIsImportModalOpen(false)} className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
              <button type="button" disabled={importRows.length === 0 || importing} onClick={handleImportParts} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#1e3a8a] px-5 text-sm font-semibold text-white shadow-sm disabled:opacity-50">
                <Upload className="h-4 w-4" />{importing ? "Importing..." : `Import ${importRows.length || ""} Parts`}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Add / Edit Part Modal */}
      {isModalOpen && modalMode === "create" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm transition-opacity sm:p-5">
          <div className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-7 sm:py-5">
              <div className="flex items-start gap-3.5"><div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1e3a8a] ring-1 ring-blue-100"><Package className="h-5 w-5" /></div><div><h2 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
                {modalMode === "create" ? t("add_part") : `${t("edit")} - ${name}`}
              </h2><p className="mt-1 text-xs leading-5 text-slate-500 sm:text-sm">Maintain AutoCount identity, pricing, stock controls and item media.</p></div></div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close part dialog"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="flex flex-col flex-1 overflow-hidden">
              <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/80 p-4 sm:p-6">
                {formError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 font-medium">
                    {formError}
                  </div>
                )}

                <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-start gap-3 rounded-t-xl border-b border-slate-100 bg-white px-4 py-3.5 sm:px-5"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><Package className="h-4 w-4" /></div><div><h3 className="text-sm font-bold text-slate-900">1. Item profile</h3><p className="mt-0.5 text-xs text-slate-500">Enter item identity, AutoCount mapping, stock and supplier details.</p></div></div>
                  <div className="space-y-4 p-4 sm:p-5">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    {t("part_name")} *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    placeholder="e.g. Engine Oil 15W-40"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      AutoCount Stock Group
                    </label>
                    <AdminSelect
                      value={itemGroup}
                      onChange={(event) => {
                        const nextGroup = event.target.value;
                        const group = stockGroupMap.get(nextGroup);
                        setItemGroup(nextGroup);
                        setCategory(group?.description || nextGroup || "Others");
                        if (group) {
                          setItemType(group.itemType);
                          setIsStockItem(group.itemType === "part" || group.itemType === "vehicle");
                        }
                      }}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">No AutoCount group</option>
                      {itemGroupOptions.map((groupCode) => (
                        <option key={groupCode} value={groupCode}>
                          {groupCode}{stockGroupMap.get(groupCode)?.description ? ` — ${stockGroupMap.get(groupCode)?.description}` : ""}
                        </option>
                      ))}
                    </AdminSelect>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      AutoCount Item Code *
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={80}
                      value={sku}
                      onChange={(e) => setSku(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                      placeholder="Symbols and spaces are preserved"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-700">Item Type</label>
                    <AdminSelect
                      value={itemType}
                      onChange={(event) => {
                        const nextType = event.target.value as ItemType;
                        setItemType(nextType);
                        setIsStockItem(nextType === "part" || nextType === "vehicle");
                      }}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {Object.entries(itemTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </AdminSelect>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-700">Tax Code</label>
                    <input type="text" maxLength={30} value={taxCode} onChange={(event) => setTaxCode(event.target.value)} placeholder="Optional" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>

                {itemType === "vehicle" ? <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Vehicle Sales items stay outside the workshop Work Order and Purchase Order item selectors.</div> : null}

                <div className="grid grid-cols-3 gap-4">
                  {canViewCost ? <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      {t("unit_price")} (RM)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      placeholder="0.00"
                    />
                  </div> : null}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      Unit Cost (RM)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={cost}
                      onChange={(e) => setCost(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      UOM
                    </label>
                    <input
                      type="text"
                      value={uom}
                      onChange={(e) => setUom(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      placeholder="PCS"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        {t("stock_quantity")}
                      </label>
                      {editingPart && (
                        <button
                          type="button"
                          onClick={() => {
                            const p = editingPart;
                            setIsModalOpen(false);
                            void openStockLedger(p);
                          }}
                          className="text-[10px] font-bold text-blue-600 hover:underline cursor-pointer"
                          title="Adjust stock in Stock Ledger & History with mandatory reason"
                        >
                          Adjust in History ↗
                        </button>
                      )}
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value={stock}
                      disabled={Boolean(editingPart)}
                      readOnly={Boolean(editingPart)}
                      onChange={(e) => setStock(e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg text-sm ${
                        editingPart
                          ? "bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed select-none"
                          : "border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      }`}
                      placeholder="0"
                      title={editingPart ? "Stock quantity cannot be edited directly here. Use Stock Ledger & History to adjust." : undefined}
                    />
                    {editingPart && (
                      <p className="mt-1 text-[10px] text-gray-400">
                        Adjustable only via Stock Ledger &amp; History with audit reason.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      Low Threshold
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value={lowStockThreshold}
                      onChange={(e) => setLowStockThreshold(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      placeholder="10"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                  <label className="inline-flex items-center gap-2"><input type="checkbox" checked={isStockItem} onChange={(event) => setIsStockItem(event.target.checked)} className="h-4 w-4 rounded border-gray-300" />Track stock quantity</label>
                  <label className="inline-flex items-center gap-2"><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} className="h-4 w-4 rounded border-gray-300" />Active item</label>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    {t("supplier")}
                  </label>
                  <input
                    type="text"
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    placeholder="e.g. Bosch Malaysia"
                  />
                  {editingPart?.supplierName ? <p className="mt-1 text-xs font-medium text-blue-700">{editingPart.supplierName}</p> : null}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Part Image
                  </label>
                  <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-white">
                        {imageData || image ? (
                          <img
                            src={imageData || image}
                            alt="Part preview"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <ImageIcon className="h-7 w-7 text-gray-300" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <label className="inline-flex cursor-pointer items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100">
                          <Upload className="mr-2 h-4 w-4" />
                          Choose Image
                          <input
                            key={imageInputKey}
                            type="file"
                            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                            onChange={(event) => handleImageSelection(event.target.files?.[0])}
                            className="sr-only"
                          />
                        </label>
                        <p className="mt-2 truncate text-xs text-gray-500">
                          {imageFileName || (image ? "Current image" : "JPG, PNG or WebP · max 3 MB")}
                        </p>
                        {(imageData || image) && (
                          <button
                            type="button"
                            onClick={removeImage}
                            className="mt-1 text-xs font-semibold text-red-600 hover:text-red-700"
                          >
                            Remove image
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                  </div>
                </section>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-white px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
                <p className="text-xs text-slate-500"><span className="font-bold text-red-500">*</span> Required fields must be completed</p>
                <div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {t("cancel")}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#1e3a8a] px-5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />{submitting ? "Saving..." : modalMode === "create" ? "Create Part" : "Save Changes"}
                </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {renderAdjustModal()}
    </div>
  );
}
