import { useEffect, useRef, useState, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router";
import { Search, Plus, Eye, Edit, Trash2, Truck, X, Save, Lock, Download, Filter, ChevronLeft, ChevronRight, ArrowLeft, RotateCcw, Wrench, ExternalLink, AlertCircle, FileText, History } from "lucide-react";
import { useLanguage } from "../contexts/language-context";
import { useApiData } from "../lib/use-api-data";
import { apiAssetUrl, postApi, apiRequest } from "../lib/api";
import { toast } from "sonner";
import { useConfirmationDialog } from "../contexts/confirmation-dialog-context";
import { DesktopDatePicker } from "./ui/desktop-date-picker";
import { AdminCombobox } from "./ui/admin-combobox";
import { AdminSelect } from "./ui/admin-select";
import { AdminPagination } from "./ui/admin-pagination";
import { hasAdminPermission } from "../lib/admin-permissions";
import { AutoCountSyncBadge } from "./autocount-sync-badge";
import { SortableHeader, useSortState, compareValues } from "./ui/sortable-header";
import { PageLoading } from "./ui/page-loading";

interface Vehicle {
  id: number;
  vecNo: string;
  regNo: string;
  equipment: string;
  brand: string;
  model: string;
  year: number;
  mileage: string;
  owner: string;
  ownerId?: number;
  companyId?: number;
  companyName?: string;
  chassisNo?: string;
  engineNo?: string;
  containerLength?: string;
  axleConfiguration?: string;
  insurance: string;
  roadTax: string;
  puspakom: string;
  lastServiceDate?: string;
  lastServiceMileage?: number;
  nextServiceDate?: string;
  nextServiceMileage?: number;
  status: string;
  vehicleStatus?: VehicleStatus;
  verificationStatus?: "pending" | "approved" | "rejected";
  rejectionReason?: string;
  reviewedBy?: number;
  reviewedAt?: string;
  createdSource?: string;
  autocountProjectNo?: string;
  autocountSyncAt?: string;
  documents?: VehicleDocument[];
  activeWorkOrder?: ActiveWorkOrderInfo | null;
}

interface ActiveWorkOrderInfo {
  id: number;
  workOrderNo: string;
  canonicalStatus: string;
  statusLabel: string;
  checkinAt?: string | null;
}

interface VehicleDocument {
  id: number;
  vehicleId: string;
  type: "insurance" | "road_tax" | "puspakom";
  expiryDate: string;
  originalName: string;
  mimeType: string;
  byteSize: number;
  status: "pending" | "approved" | "rejected" | "superseded";
  reviewReason?: string;
  reviewedAt?: string;
  createdAt?: string;
}

interface VehicleHistorySummary {
  totalWorkOrders: number;
  totalInvoices: number;
  totalMaintenanceSpend: number;
  lastRecordedMileage: number | null;
  lastServiceDate: string | null;
  lastServiceMileage?: number | null;
  nextServiceMileage?: number | null;
  nextServiceDate?: string | null;
  serviceStatus?: "normal" | "due_soon" | "overdue";
  remainingKm?: number | null;
}

interface VehicleHistoryWorkOrder {
  id: number;
  workOrderNo: string;
  status: string;
  statusLabel: string;
  primaryIssue: string | null;
  currentMileage: number | null;
  checkinMileage?: number | null;
  mileageDelta?: number | null;
  checkinAt: string | null;
  completedAt: string | null;
  totalAmount: number;
}

interface VehicleHistoryInvoice {
  id: number;
  invoiceNo: string;
  invoiceDate: string;
  totalAmount: number;
  paymentStatus: string;
  balanceDue: number;
  workOrderId: number | null;
  workOrderNo: string | null;
}

interface VehicleMileageLogItem {
  id: number;
  mileage: number;
  delta: number | null;
  source: string;
  referenceNo: string | null;
  recordedByName: string | null;
  notes: string | null;
  createdAt: string;
}

interface VehicleHistoryData {
  vehicleId: number;
  summary: VehicleHistorySummary;
  workOrders: VehicleHistoryWorkOrder[];
  invoices: VehicleHistoryInvoice[];
  mileageLogs?: VehicleMileageLogItem[];
}

const isComplianceExpired = (value?: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value?.trim() || "");
  if (!match) return false;

  const expiryDate = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return expiryDate < today;
};

const isComplianceExpiringSoon = (value?: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value?.trim() || "");
  if (!match) return false;

  const expiryDate = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thirtyDaysLater = new Date(today);
  thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
  return expiryDate >= today && expiryDate <= thirtyDaysLater;
};

const formatMileage = (value?: string | number | null) => {
  if (value === null || value === undefined || String(value).trim() === "") return "—";

  const withoutUnit = String(value).trim().replace(/\s*km\s*$/i, "");
  const numericValue = Number(withoutUnit.replace(/,/g, ""));
  const displayValue = Number.isFinite(numericValue)
    ? numericValue.toLocaleString("en-MY")
    : withoutUnit;
  return `${displayValue} km`;
};

function VehicleReadOnlyField({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <span className="mb-1 block text-[11px] font-bold text-slate-600">{label}</span>
      <div className="flex h-10 w-full items-center rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 text-xs font-medium text-slate-800">
        {value === null || value === undefined || value === "" ? "—" : value}
      </div>
    </div>
  );
}

const isImageDocument = (document: VehicleDocument) =>
  document.mimeType.startsWith("image/") || /\.(?:jpe?g|png|webp|heic|heif)$/i.test(document.originalName);

const isPdfDocument = (document: VehicleDocument) =>
  document.mimeType === "application/pdf" || /\.pdf$/i.test(document.originalName);



type VehicleStatus = "Active" | "Inactive" | "Under Maintenance" | "Out of Service" | "Disposed";

interface VehicleForm {
  vecNo: string;
  regNo: string;
  equipment: string;
  brand: string;
  model: string;
  year: string;
  mileage: string;
  companyId: number;
  chassisNo: string;
  engineNo: string;
  containerLength: string;
  axleConfiguration: string;
  insurance: string;
  roadTax: string;
  puspakom: string;
  lastServiceDate: string;
  lastServiceMileage: string;
  nextServiceDate: string;
  nextServiceMileage: string;
  vehicleStatus: VehicleStatus;
  autocountProjectNo: string;
}

const mockEquipment: Vehicle[] = [];

const emptyVehicleForm: VehicleForm = {
  vecNo: "",
  regNo: "",
  equipment: "Prime Mover",
  brand: "",
  model: "",
  year: "",
  mileage: "",
  companyId: 0,
  chassisNo: "",
  engineNo: "",
  containerLength: "",
  axleConfiguration: "",
  insurance: "",
  roadTax: "",
  puspakom: "",
  lastServiceDate: "",
  lastServiceMileage: "",
  nextServiceDate: "",
  nextServiceMileage: "",
  vehicleStatus: "Active",
  autocountProjectNo: "",
};

const vehicleStatuses: VehicleStatus[] = [
  "Active",
  "Inactive",
  "Under Maintenance",
  "Out of Service",
  "Disposed",
];

const getEffectiveVehicleStatus = (vehicle?: { vehicleStatus?: string; verificationStatus?: string } | null): VehicleStatus => {
  if (!vehicle) return "Active";
  if (vehicle.verificationStatus === "rejected") return "Inactive";
  return vehicleStatuses.includes(vehicle.vehicleStatus as VehicleStatus)
    ? (vehicle.vehicleStatus as VehicleStatus)
    : "Active";
};

const fleetEquipmentTypes = [
  "Prime Mover",
  "Container Chassis / Skeletal Trailer",
  "Side Loader / Sidelifter",
  "Other",
];

const containerLengths = ["20 ft", "40 ft", "45 ft", "20/40 ft Extendable", "Other"];
const axleConfigurations = ["2 Axle", "3 Axle", "Other"];

const primeMoverBrandModels: Record<string, string[]> = {
  "Volvo Trucks": ["FH", "FH16", "FM", "FMX"],
  Scania: ["P-series", "G-series", "G450", "R-series", "R450", "S-series"],
  MAN: ["TGM", "TGS", "TGX"],
  "Mercedes-Benz Trucks": ["Atego", "Actros", "Arocs"],
  "UD Trucks": ["Kuzer", "Croner", "Quester", "Quester CGE", "Quester CWE"],
  Hino: ["300 Series", "500 Series", "700 Series", "Profia", "Ranger"],
  Isuzu: ["N-Series", "F-Series", "GIGA", "Forward", "ELF"],
  FUSO: ["Canter", "Fighter", "Super Great"],
  "Sinotruk / HOWO": ["HOWO A7", "HOWO T7H", "HOWO TX", "HOWO MAX", "SITRAK C7H", "SITRAK G7"],
  Shacman: ["F3000", "X3000", "X5000", "M3000"],
  "Foton / Auman": ["EST-A", "EST", "GTL", "ETX"],
  Dongfeng: ["Tianlong", "KX", "KL", "KR", "Captain"],
  JAC: ["Gallop", "K7", "N-Series"],
  Other: [],
};

const sideLoaderBrands = ["Hammar", "Steelbro", "Swinglift", "Combilift", "Other"];
const commonBrands = [...Object.keys(primeMoverBrandModels), ...sideLoaderBrands];

const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ");
const normalizedBrandAliases: Record<string, string> = {
  "nissan ud": "UD Trucks",
  "ud truck": "UD Trucks",
  "mitsubishi fuso": "FUSO",
  fuso: "FUSO",
  "volvo": "Volvo Trucks",
  "mercedes-benz": "Mercedes-Benz Trucks",
  "mercedes benz": "Mercedes-Benz Trucks",
  "sinotruk/howo": "Sinotruk / HOWO",
  "sinotruk / howo": "Sinotruk / HOWO",
  howo: "Sinotruk / HOWO",
  foton: "Foton / Auman",
  auman: "Foton / Auman",
  "foton auman": "Foton / Auman",
};

const normalizeBrandName = (value: string) => {
  const normalizedValue = normalizeText(value);
  const key = normalizedValue.toLocaleLowerCase();
  const alias = normalizedBrandAliases[key];
  if (alias) {
    return alias;
  }

  return commonBrands.find((brand) => brand.toLocaleLowerCase() === key) || normalizedValue;
};

const uniqueCaseInsensitive = (values: string[]) => {
  const uniqueValues = new Map<string, string>();

  values.forEach((value) => {
    const normalizedValue = normalizeText(value);
    if (normalizedValue) {
      const key = normalizedValue.toLocaleLowerCase();
      if (!uniqueValues.has(key)) {
        uniqueValues.set(key, normalizedValue);
      }
    }
  });

  return [...uniqueValues.values()];
};

const canonicalizeSuggestion = (value: string, suggestions: string[]) => {
  const normalizedValue = normalizeText(value);
  return suggestions.find(
    (suggestion) => suggestion.toLocaleLowerCase() === normalizedValue.toLocaleLowerCase()
  ) || normalizedValue;
};

const canonicalizeBrand = (value: string, suggestions: string[]) => {
  const normalizedValue = normalizeBrandName(value);
  return suggestions.find(
    (suggestion) => suggestion.toLocaleLowerCase() === normalizedValue.toLocaleLowerCase()
  ) || normalizedValue;
};

const missingEquipmentValues = new Set(["", "-", "n/a", "na", "unknown", "not specified"]);

const isMissingEquipmentValue = (equipment?: string) =>
  missingEquipmentValues.has(normalizeText(equipment || "").toLocaleLowerCase());

const normalizeEquipmentProfile = (equipment: string, existingContainerLength = "") => {
  const normalizedEquipment = normalizeText(equipment);
  const key = normalizedEquipment.toLocaleLowerCase();
  const chassisMappings: Record<string, string> = {
    "20 ft trailer": "20 ft",
    "20 ft container chassis": "20 ft",
    "40 ft trailer": "40 ft",
    "40's trailer": "40 ft",
    "40 ft container chassis": "40 ft",
    "45 ft container chassis": "45 ft",
    "20/40 ft extendable container chassis": "20/40 ft Extendable",
  };

  if (chassisMappings[key]) {
    return {
      equipment: "Container Chassis / Skeletal Trailer",
      containerLength: existingContainerLength || chassisMappings[key],
    };
  }
  if (key === "sidelifter" || key === "side loader" || key === "side loader / sidelifter") {
    return { equipment: "Side Loader / Sidelifter", containerLength: existingContainerLength };
  }

  return {
    equipment: isMissingEquipmentValue(normalizedEquipment) ? "" : normalizedEquipment,
    containerLength: existingContainerLength,
  };
};

export function Equipment() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const companyFilter = Number(searchParams.get("companyId") || 0);
  const vehicleDetailId = Number(searchParams.get("vehicleId") || 0);
  const vehiclePlateParam = (searchParams.get("plate") || searchParams.get("regNo") || "").trim().toLowerCase();
  const canCreate = hasAdminPermission("vehicle.create");
  const canUpdate = hasAdminPermission("vehicle.update");
  const canReview = hasAdminPermission("vehicle.review");
  const canManageVehicles = canCreate || canUpdate;
  const { t } = useLanguage();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBrand, setSelectedBrand] = useState("All");
  const [verificationFilter, setVerificationFilter] = useState("All");
  const [operationalStatusFilter, setOperationalStatusFilter] = useState("All");
  const [equipmentTypeFilter, setEquipmentTypeFilter] = useState("All");
  const [complianceFilter, setComplianceFilter] = useState("All");
  const { sortKey, sortDirection, handleSort, setSortKey } = useSortState(null, "asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Modals state
  const [selectedEquipment, setSelectedEquipment] = useState<Vehicle | null>(null);
  const [modalMode, setModalMode] = useState<"view" | "create" | "edit" | null>(null);
  const [form, setForm] = useState<VehicleForm>(emptyVehicleForm);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [reviewReason, setReviewReason] = useState("");
  const [isReviewing, setIsReviewing] = useState(false);
  const [documentReviewReason, setDocumentReviewReason] = useState("");
  const [reviewingDocumentId, setReviewingDocumentId] = useState<number | null>(null);
  const [previewDocumentId, setPreviewDocumentId] = useState<number | null>(null);
  const [docImageErrors, setDocImageErrors] = useState<Record<number, boolean>>({});
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [showUploadDocForm, setShowUploadDocForm] = useState(false);
  const [uploadDocType, setUploadDocType] = useState<"insurance" | "road_tax" | "puspakom">("road_tax");
  const [uploadDocExpiry, setUploadDocExpiry] = useState(() => new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10));
  const [uploadDocFile, setUploadDocFile] = useState<File | null>(null);
  const docFileInputRef = useRef<HTMLInputElement>(null);
  const handledVehicleDetailRef = useRef<string>("");
  const [vehicleHistory, setVehicleHistory] = useState<VehicleHistoryData | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyTab, setHistoryTab] = useState<"work_orders" | "invoices" | "mileage_logs">("work_orders");
  const isPrimeMover = form.equipment === "Prime Mover";
  const isContainerChassis = form.equipment === "Container Chassis / Skeletal Trailer";
  const isSideLoader = form.equipment === "Side Loader / Sidelifter";
  const showMileage = !isContainerChassis;
  const showEngineNumber = isPrimeMover;

  const { data: equipmentData, isLoading, error, reload, hasLoaded } = useApiData<Vehicle[]>("admin-vehicles", []);
  const { data: companiesData } = useApiData<any[]>("admin-companies", []);
  const confirmAction = useConfirmationDialog();

  const equipment = useMemo(() => {
    if (isLoading && !hasLoaded) {
      return [];
    }
    if (error && equipmentData.length === 0) {
      return mockEquipment;
    }
    return equipmentData;
  }, [equipmentData, isLoading, hasLoaded, error]);

  const sortedAndFilteredEquipment = useMemo(() => {
    const list = equipment.filter((item) => {
      const q = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !q ||
        (item.vecNo || "").toLowerCase().includes(q) ||
        (item.regNo || "").toLowerCase().includes(q) ||
        (item.owner || "").toLowerCase().includes(q) ||
        (item.companyName || "").toLowerCase().includes(q) ||
        (item.brand || "").toLowerCase().includes(q) ||
        (item.model || "").toLowerCase().includes(q) ||
        (item.activeWorkOrder?.workOrderNo || "").toLowerCase().includes(q);

      const matchesBrand =
        selectedBrand === "All" ||
        normalizeBrandName(item.brand).toLocaleLowerCase() === selectedBrand.toLocaleLowerCase();

      const matchesVerification =
        verificationFilter === "All" ||
        (item.verificationStatus || "approved") === verificationFilter.toLowerCase();

      const matchesCompany = companyFilter === 0 || Number(item.companyId) === companyFilter;

      const opStatus = getEffectiveVehicleStatus(item);
      const matchesOperationalStatus =
        operationalStatusFilter === "All" || opStatus === operationalStatusFilter;

      const matchesEquipmentType =
        equipmentTypeFilter === "All"
          ? true
          : equipmentTypeFilter === "Other"
          ? item.equipment === "Other" ||
            (!["prime", "mover", "head", "truck"].some((k) => (item.equipment || "").toLowerCase().includes(k)) &&
             !["trailer", "chassis", "skeletal", "lowbed"].some((k) => (item.equipment || "").toLowerCase().includes(k)) &&
             !["sidelifter", "side loader"].some((k) => (item.equipment || "").toLowerCase().includes(k)))
          : (item.equipment || "") === equipmentTypeFilter;

      let matchesCompliance = true;
      if (complianceFilter !== "All") {
        const complianceItems = [item.insurance, item.roadTax, item.puspakom];
        const expired = complianceItems.filter(isComplianceExpired).length;
        const expiringSoon = complianceItems.filter(isComplianceExpiringSoon).length;
        if (complianceFilter === "Expired") {
          matchesCompliance = expired > 0;
        } else if (complianceFilter === "ExpiringSoon") {
          matchesCompliance = expiringSoon > 0;
        }
      }

      return (
        matchesSearch &&
        matchesBrand &&
        matchesVerification &&
        matchesCompany &&
        matchesOperationalStatus &&
        matchesEquipmentType &&
        matchesCompliance
      );
    });

    if (!sortKey) return list;

    return [...list].sort((a, b) => {
      const opStatusA = getEffectiveVehicleStatus(a);
      const opStatusB = getEffectiveVehicleStatus(b);

      switch (sortKey) {
        case "vecNo":
          return compareValues(a.vecNo || a.regNo, b.vecNo || b.regNo, sortDirection);
        case "regNo":
          return compareValues(a.regNo, b.regNo, sortDirection);
        case "brand":
          return compareValues(`${a.brand} ${a.model}`, `${b.brand} ${b.model}`, sortDirection);
        case "equipment":
          return compareValues(a.equipment, b.equipment, sortDirection);
        case "company":
          return compareValues(a.companyName || a.owner, b.companyName || b.owner, sortDirection);
        case "mileage": {
          const isChassisA = (a.equipment || "").toLowerCase().includes("chassis") || (a.equipment || "").toLowerCase().includes("skeletal trailer");
          const isChassisB = (b.equipment || "").toLowerCase().includes("chassis") || (b.equipment || "").toLowerCase().includes("skeletal trailer");
          const numA = isChassisA ? -1 : (Number(String(a.mileage || "").replace(/\D/g, "")) || 0);
          const numB = isChassisB ? -1 : (Number(String(b.mileage || "").replace(/\D/g, "")) || 0);
          return compareValues(numA, numB, sortDirection);
        }
        case "status":
          return compareValues(opStatusA, opStatusB, sortDirection);
        case "approval":
          return compareValues(a.verificationStatus || "approved", b.verificationStatus || "approved", sortDirection);
        case "compliance": {
          const countA = [a.insurance, a.roadTax, a.puspakom].filter(isComplianceExpired).length;
          const countB = [b.insurance, b.roadTax, b.puspakom].filter(isComplianceExpired).length;
          return compareValues(countA, countB, sortDirection);
        }
        default:
          return 0;
      }
    });
  }, [
    equipment,
    searchTerm,
    selectedBrand,
    verificationFilter,
    companyFilter,
    operationalStatusFilter,
    equipmentTypeFilter,
    complianceFilter,
    sortKey,
    sortDirection,
  ]);
  const filteredEquipment = sortedAndFilteredEquipment;
  const filteredCompanyName = companiesData.find((company) => Number(company.id) === companyFilter)?.name;
  const totalPages = Math.max(1, Math.ceil(filteredEquipment.length / pageSize));
  const paginatedEquipment = filteredEquipment.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setPage(1);
  }, [companyFilter]);

  const clearCompanyFilter = () => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("companyId");
    setSearchParams(nextParams);
  };

  const equipmentBrands = useMemo(
    () => uniqueCaseInsensitive(equipment.map((item) => normalizeBrandName(item.brand))),
    [equipment]
  );
  const brandSuggestions = useMemo(() => {
    const savedBrandsForType = equipment
      .filter((item) => normalizeEquipmentProfile(item.equipment).equipment === form.equipment)
      .map((item) => normalizeBrandName(item.brand));

    if (isPrimeMover) {
      return uniqueCaseInsensitive([...Object.keys(primeMoverBrandModels), ...savedBrandsForType]);
    }
    if (isContainerChassis) {
      return uniqueCaseInsensitive([...savedBrandsForType, "Other"]);
    }
    if (isSideLoader) {
      return uniqueCaseInsensitive([...sideLoaderBrands, ...savedBrandsForType]);
    }
    return uniqueCaseInsensitive([...commonBrands, ...equipmentBrands]);
  }, [equipment, equipmentBrands, form.equipment, isContainerChassis, isPrimeMover, isSideLoader]);

  const brands = ["All", ...equipmentBrands];

  const tabCounts = useMemo(() => {
    return {
      all: equipment.length,
      active: equipment.filter((e) => !e.activeWorkOrder && getEffectiveVehicleStatus(e) === "Active").length,
      maintenance: equipment.filter((e) => getEffectiveVehicleStatus(e) === "Under Maintenance" || Boolean(e.activeWorkOrder)).length,
      out_of_service: equipment.filter((e) => getEffectiveVehicleStatus(e) === "Out of Service").length,
      inactive: equipment.filter((e) => getEffectiveVehicleStatus(e) === "Inactive").length,
    };
  }, [equipment]);

  const operationalTabs = useMemo(() => {
    return [
      { id: "All", label: "All Vehicles", count: tabCounts.all },
      { id: "Active", label: "Active", count: tabCounts.active, badgeColor: tabCounts.active > 0 ? "bg-emerald-100 text-emerald-800" : undefined },
      { id: "Under Maintenance", label: "Under Maintenance", count: tabCounts.maintenance, badgeColor: tabCounts.maintenance > 0 ? "bg-amber-100 text-amber-800" : undefined },
      { id: "Out of Service", label: "Out of Service", count: tabCounts.out_of_service, badgeColor: tabCounts.out_of_service > 0 ? "bg-rose-100 text-rose-700" : undefined },
      { id: "Inactive", label: "Inactive", count: tabCounts.inactive, badgeColor: tabCounts.inactive > 0 ? "bg-slate-100 text-slate-700" : undefined },
    ];
  }, [tabCounts]);

  const handleClearFilters = () => {
    setSearchTerm("");
    setSelectedBrand("All");
    setVerificationFilter("All");
    setOperationalStatusFilter("All");
    setEquipmentTypeFilter("All");
    setComplianceFilter("All");
    setSortKey(null);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("companyId");
      return next;
    });
    setPage(1);
  };
  const modelSuggestions = useMemo(() => {
    const selectedBrand = canonicalizeBrand(form.brand, brandSuggestions);
    const standardBrand = Object.keys(primeMoverBrandModels).find(
      (brand) => brand.toLocaleLowerCase() === selectedBrand.toLocaleLowerCase()
    );
    const savedModels = equipment
      .filter((item) => {
        const sameEquipment = normalizeEquipmentProfile(item.equipment).equipment === form.equipment;
        const sameBrand = !selectedBrand
          || normalizeBrandName(item.brand).toLocaleLowerCase() === selectedBrand.toLocaleLowerCase();
        return sameEquipment && sameBrand;
      })
      .map((item) => item.model);

    if (isContainerChassis) {
      return uniqueCaseInsensitive([
        "3-Axle Skeletal Chassis",
        "Extendable Chassis",
        "2-Axle Skeletal Chassis",
        "40ft Skeletal Trailer",
        "20ft Skeletal Trailer",
        ...savedModels,
      ]);
    }
    if (isSideLoader) {
      return uniqueCaseInsensitive([
        "Hammar 195",
        "Hammar 155",
        "Steelbro SB450",
        "Steelbro SB362",
        "Swinglift",
        "Combilift",
        ...savedModels,
      ]);
    }

    if (selectedBrand && standardBrand && primeMoverBrandModels[standardBrand]?.length) {
      return uniqueCaseInsensitive([...primeMoverBrandModels[standardBrand], ...savedModels]);
    }

    const allPrimeMoverModels = Object.values(primeMoverBrandModels).flat();
    return uniqueCaseInsensitive([...allPrimeMoverModels, ...savedModels]);
  }, [brandSuggestions, equipment, form.brand, form.equipment, isContainerChassis, isPrimeMover, isSideLoader]);

  const openCreateModal = () => {
    setSelectedEquipment(null);
    setForm(emptyVehicleForm);
    setFormError("");
    setReviewReason("");
    setIsSaving(false);
    setModalMode("create");
  };

  const openEditModal = (vehicle: Vehicle) => {
    setSelectedEquipment(vehicle);
    const cleanDate = (d?: string) => {
      if (!d || d === "-" || d === "0000-00-00") return "";
      return d;
    };
    const equipmentProfile = normalizeEquipmentProfile(vehicle.equipment, vehicle.containerLength);
    setForm({
      vecNo: vehicle.vecNo || "",
      regNo: vehicle.regNo || "",
      equipment: equipmentProfile.equipment,
      brand: vehicle.brand || "",
      model: vehicle.model || "",
      year: vehicle.year ? String(vehicle.year) : "",
      mileage: String(vehicle.mileage || "").replace(/\D/g, ""),
      companyId: vehicle.companyId || vehicle.ownerId || 0,
      chassisNo: (vehicle.chassisNo || "").toUpperCase(),
      engineNo: (vehicle.engineNo || "").toUpperCase(),
      containerLength: equipmentProfile.containerLength,
      axleConfiguration: vehicle.axleConfiguration || "",
      insurance: cleanDate(vehicle.insurance),
      roadTax: cleanDate(vehicle.roadTax),
      puspakom: cleanDate(vehicle.puspakom),
      lastServiceDate: cleanDate(vehicle.lastServiceDate),
      lastServiceMileage: vehicle.lastServiceMileage ? String(vehicle.lastServiceMileage) : "",
      nextServiceDate: cleanDate(vehicle.nextServiceDate),
      nextServiceMileage: vehicle.nextServiceMileage ? String(vehicle.nextServiceMileage) : "",
      vehicleStatus: vehicle.verificationStatus === "rejected" ? "Active" : getEffectiveVehicleStatus(vehicle),
      autocountProjectNo: vehicle.autocountProjectNo || "",
    });
    setFormError("");
    setReviewReason(vehicle.rejectionReason || "");
    setIsSaving(false);
    setModalMode("edit");
  };

  const openViewModal = (vehicle: Vehicle) => {
    setSelectedEquipment(vehicle);
    setReviewReason(vehicle.rejectionReason || "");
    setDocumentReviewReason("");
    setPreviewDocumentId(null);
    setModalMode("view");
  };

  const closeModal = () => {
    if (searchParams.has("vehicleId") || searchParams.has("plate") || searchParams.has("regNo")) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("vehicleId");
      nextParams.delete("plate");
      nextParams.delete("regNo");
      setSearchParams(nextParams, { replace: true });
    }
    setModalMode(null);
    setSelectedEquipment(null);
    setDocumentReviewReason("");
    setReviewingDocumentId(null);
    setPreviewDocumentId(null);
    setVehicleHistory(null);
  };

  useEffect(() => {
    if (!vehicleDetailId && !vehiclePlateParam) {
      handledVehicleDetailRef.current = "";
      return;
    }
    const currentKey = `${vehicleDetailId}_${vehiclePlateParam}`;
    if (isLoading || handledVehicleDetailRef.current === currentKey) return;
    const requestedVehicle = equipment.find((vehicle) => {
      if (vehicleDetailId && vehicle.id === vehicleDetailId) return true;
      if (vehiclePlateParam) {
        const pNorm = vehiclePlateParam.replace(/\s+/g, "");
        const regNorm = (vehicle.regNo || "").toLowerCase().replace(/\s+/g, "");
        const vecNorm = (vehicle.vecNo || "").toLowerCase().replace(/\s+/g, "");
        return regNorm === pNorm || vecNorm === pNorm;
      }
      return false;
    });
    if (!requestedVehicle) return;
    handledVehicleDetailRef.current = currentKey;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("vehicleId");
    nextParams.delete("plate");
    nextParams.delete("regNo");
    setSearchParams(nextParams, { replace: true });
    setSelectedEquipment(requestedVehicle);
    setReviewReason(requestedVehicle.rejectionReason || "");
    setModalMode("view");
  }, [equipment, isLoading, searchParams, setSearchParams, vehicleDetailId, vehiclePlateParam]);

  useEffect(() => {
    if (!selectedEquipment?.id || modalMode !== "view") {
      setVehicleHistory(null);
      return;
    }
    let isCurrent = true;
    setLoadingHistory(true);
    apiRequest<VehicleHistoryData>(
      `admin-vehicle-history&vehicleId=${selectedEquipment.id}&plate=${encodeURIComponent(selectedEquipment.regNo || "")}`
    )
      .then((res) => {
        if (!isCurrent) return;
        const historyData = ((res as any)?.data || res) as VehicleHistoryData;
        if (historyData && (historyData.workOrders || historyData.summary)) {
          setVehicleHistory(historyData);
        } else {
          setVehicleHistory(null);
        }
      })
      .catch((err) => {
        if (!isCurrent) return;
        console.error("Failed to load vehicle history:", err);
        setVehicleHistory(null);
      })
      .finally(() => {
        if (isCurrent) setLoadingHistory(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedEquipment?.id, selectedEquipment?.regNo, modalMode]);

  useEffect(() => {
    if (searchParams.get("action") === "create") {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("action");
      setSearchParams(nextParams, { replace: true });
      openCreateModal();
      const cid = Number(searchParams.get("companyId") || 0);
      if (cid > 0) {
        setForm((prev) => ({ ...prev, companyId: cid }));
      }
    }
  }, [searchParams, setSearchParams]);

  const handleSubmitEquipment = async (approveAfterSave = false) => {
    setFormError("");
    const normalizedBrand = canonicalizeBrand(form.brand, brandSuggestions);
    const normalizedModel = canonicalizeSuggestion(form.model, modelSuggestions);

    if (!form.regNo.trim()) {
      setFormError("Registration number is required.");
      return;
    }
    if (!form.equipment.trim()) {
      setFormError("Equipment type is required.");
      return;
    }
    if (!fleetEquipmentTypes.includes(form.equipment)) {
      setFormError("Please select a supported equipment type.");
      return;
    }
    if (isPrimeMover && !normalizedBrand) {
      setFormError("Prime Mover brand is required.");
      return;
    }
    if (isPrimeMover && !normalizedModel) {
      setFormError("Prime Mover model is required.");
      return;
    }
    if (isContainerChassis && !form.containerLength) {
      setFormError("Container length is required for a container chassis.");
      return;
    }
    if (isContainerChassis && !form.axleConfiguration) {
      setFormError("Axle configuration is required for a container chassis.");
      return;
    }
    if (form.companyId === 0) {
      setFormError("Please select a company.");
      return;
    }
    if (!vehicleStatuses.includes(form.vehicleStatus)) {
      setFormError("Please select a valid vehicle status.");
      return;
    }
    const currentYear = new Date().getFullYear();
    if (form.year && (!/^\d{4}$/.test(form.year) || Number(form.year) < 1900 || Number(form.year) > currentYear + 1)) {
      setFormError(`Manufacture year must be between 1900 and ${currentYear + 1}.`);
      return;
    }
    if (form.mileage && !/^\d+$/.test(form.mileage)) {
      setFormError("Current mileage must be a non-negative whole number.");
      return;
    }
    if (form.lastServiceMileage && !/^\d+$/.test(form.lastServiceMileage)) {
      setFormError("Last service mileage must be a non-negative whole number.");
      return;
    }
    if (form.nextServiceMileage && !/^\d+$/.test(form.nextServiceMileage)) {
      setFormError("Next service mileage must be a non-negative whole number.");
      return;
    }
    const minHistoricalMileage = Number(vehicleHistory?.summary?.lastRecordedMileage || 0);
    if (selectedEquipment && minHistoricalMileage > 0 && form.mileage && Number(form.mileage) < minHistoricalMileage) {
      setFormError(`Current mileage cannot be less than the vehicle's historical service mileage (${minHistoricalMileage.toLocaleString()} km).`);
      return;
    }
    if (form.mileage && form.lastServiceMileage && Number(form.lastServiceMileage) > Number(form.mileage)) {
      setFormError("Last service mileage cannot exceed current mileage.");
      return;
    }
    if (
      form.lastServiceMileage &&
      form.nextServiceMileage &&
      Number(form.nextServiceMileage) < Number(form.lastServiceMileage)
    ) {
      setFormError("Next service mileage cannot be lower than last service mileage.");
      return;
    }
    if (form.lastServiceDate && form.nextServiceDate && form.nextServiceDate < form.lastServiceDate) {
      setFormError("Next service date cannot be before last service date.");
      return;
    }

    setIsSaving(true);
    try {
      const selectedCompany = companiesData.find((c) => c.id === form.companyId);
      const companyName = selectedCompany ? selectedCompany.name : "";
      const isCurrentlyRejected = selectedEquipment?.verificationStatus === "rejected";
      const reverifyAction = isCurrentlyRejected
        ? (approveAfterSave ? "approved" : "pending")
        : undefined;

      const savedVehicle = await postApi<{ id: number }>(
        modalMode === "create" ? "admin-create-vehicle" : "admin-update-vehicle",
        {
          id: selectedEquipment?.id,
          vecNo: form.vecNo.trim().toUpperCase(),
          regNo: form.regNo.trim().toUpperCase(),
          equipment: form.equipment,
          brand: normalizedBrand,
          model: normalizedModel,
          containerLength: form.containerLength,
          axleConfiguration: form.axleConfiguration,
          year: form.year === "" ? null : Number(form.year),
          mileage: form.mileage === "" ? null : Number(form.mileage),
          companyId: form.companyId,
          chassisNo: form.chassisNo.trim().toUpperCase(),
          engineNo: form.engineNo.trim().toUpperCase(),
          ownerName: companyName,
          insurance: form.insurance,
          roadTax: form.roadTax,
          puspakom: form.puspakom,
          lastServiceDate: form.lastServiceDate,
          lastServiceMileage: form.lastServiceMileage === "" ? null : Number(form.lastServiceMileage),
          nextServiceDate: form.nextServiceDate,
          nextServiceMileage: form.nextServiceMileage === "" ? null : Number(form.nextServiceMileage),
          vehicleStatus: reverifyAction === "pending" ? "Inactive" : form.vehicleStatus,
          reverifyAction,
          autocountProjectNo: form.autocountProjectNo.trim(),
        }
      );
      const shouldApproveAfterSave =
        approveAfterSave &&
        modalMode === "edit" &&
        selectedEquipment?.verificationStatus === "pending" &&
        canReview;

      if (shouldApproveAfterSave) {
        await postApi("admin-review-vehicle", {
          id: savedVehicle.id,
          decision: "approved",
          reason: "",
        });
        window.dispatchEvent(new CustomEvent("admin-vehicles-updated"));
      }

      await reload();
      window.dispatchEvent(new CustomEvent("admin-vehicles-updated"));
      if (modalMode === "edit" && selectedEquipment) {
        const nextVStatus = reverifyAction || (shouldApproveAfterSave ? "approved" : selectedEquipment.verificationStatus);
        setSelectedEquipment({
          ...selectedEquipment,
          id: savedVehicle.id,
          vecNo: form.vecNo.trim().toUpperCase(),
          regNo: form.regNo.trim().toUpperCase(),
          equipment: form.equipment,
          brand: normalizedBrand,
          model: normalizedModel,
          year: form.year === "" ? 0 : Number(form.year),
          mileage: form.mileage,
          companyId: form.companyId,
          companyName,
          owner: companyName,
          chassisNo: form.chassisNo.trim().toUpperCase(),
          engineNo: form.engineNo.trim().toUpperCase(),
          containerLength: form.containerLength,
          axleConfiguration: form.axleConfiguration,
          insurance: form.insurance,
          roadTax: form.roadTax,
          puspakom: form.puspakom,
          lastServiceDate: form.lastServiceDate,
          lastServiceMileage: form.lastServiceMileage === "" ? undefined : Number(form.lastServiceMileage),
          nextServiceDate: form.nextServiceDate,
          nextServiceMileage: form.nextServiceMileage === "" ? undefined : Number(form.nextServiceMileage),
          vehicleStatus: nextVStatus === "rejected" || nextVStatus === "pending" ? "Inactive" : form.vehicleStatus,
          autocountProjectNo: form.autocountProjectNo.trim(),
          verificationStatus: nextVStatus,
          rejectionReason: reverifyAction || shouldApproveAfterSave ? "" : selectedEquipment.rejectionReason,
        });
        setModalMode("view");
        setFormError("");
      } else {
        closeModal();
      }
      toast.success(
        isCurrentlyRejected
          ? (approveAfterSave
              ? `Vehicle "${form.regNo.trim().toUpperCase()}" saved and approved.`
              : `Vehicle "${form.regNo.trim().toUpperCase()}" updated and moved to Pending Verification.`)
          : shouldApproveAfterSave
          ? `Vehicle "${form.regNo.trim().toUpperCase()}" saved and approved.`
          : modalMode === "create"
          ? `Vehicle "${form.regNo.trim().toUpperCase()}" added successfully.`
          : `Vehicle "${form.regNo.trim().toUpperCase()}" updated successfully.`,
        { id: `vehicle-saved-${savedVehicle.id}` },
      );
    } catch (apiError) {
      setFormError(apiError instanceof Error ? apiError.message : "Unable to save vehicle.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteEquipment = async (item: Vehicle) => {
    const confirmed = await confirmAction({
      title: `Delete vehicle "${item.regNo}"?`,
      description: "This vehicle and its stored details will be permanently removed. This action cannot be undone.",
      confirmLabel: "Delete vehicle",
      tone: "danger",
    });
    if (!confirmed) {
      return;
    }

    try {
      await postApi("admin-delete-vehicle", { id: item.id });
      await reload();
      toast.success(`Vehicle "${item.regNo}" deleted.`);
    } catch (apiError) {
      toast.error(apiError instanceof Error ? apiError.message : "Unable to delete vehicle.");
    }
  };

  const handleReviewVehicle = async (decision: "approved" | "rejected") => {
    if (!selectedEquipment) return;
    if (decision === "rejected" && !reviewReason.trim()) {
      setFormError("Please enter a rejection reason.");
      return;
    }
    setFormError("");
    setIsReviewing(true);
    try {
      await postApi("admin-review-vehicle", {
        id: selectedEquipment.id,
        decision,
        reason: decision === "rejected" ? reviewReason.trim() : "",
      });
      await reload();
      window.dispatchEvent(new CustomEvent("admin-vehicles-updated"));
      closeModal();
    } catch (apiError) {
      setFormError(apiError instanceof Error ? apiError.message : "Unable to review vehicle.");
    } finally {
      setIsReviewing(false);
    }
  };

  const handleReviewDocument = async (document: VehicleDocument, decision: "approved" | "rejected") => {
    if (!selectedEquipment) return;
    if (decision === "rejected" && !documentReviewReason.trim()) {
      setFormError("Please enter a document rejection reason.");
      return;
    }
    setFormError("");
    setReviewingDocumentId(document.id);
    try {
      await postApi("admin-review-vehicle-document", {
        id: document.id,
        decision,
        reason: decision === "rejected" ? documentReviewReason.trim() : "",
      });
      const expiryField = document.type === "insurance" ? "insurance" : document.type === "road_tax" ? "roadTax" : "puspakom";
      setSelectedEquipment((current) => current ? {
        ...current,
        ...(decision === "approved" ? { [expiryField]: document.expiryDate } : {}),
        documents: current.documents?.map((item) => item.id === document.id
          ? { ...item, status: decision, reviewReason: decision === "rejected" ? documentReviewReason.trim() : "", reviewedAt: new Date().toISOString() }
          : item),
      } : current);
      setDocumentReviewReason("");
      await reload();
      toast.success(decision === "approved" ? "Vehicle document approved." : "Vehicle document rejected.");
    } catch (apiError) {
      setFormError(apiError instanceof Error ? apiError.message : "Unable to review vehicle document.");
    } finally {
      setReviewingDocumentId(null);
    }
  };

  const handleUploadDocument = async () => {
    if (!selectedEquipment) return;
    if (!uploadDocFile) {
      toast.error("Please select a document file to upload.");
      return;
    }
    if (!uploadDocExpiry) {
      toast.error("Please select the document expiry date.");
      return;
    }
    setIsUploadingDoc(true);
    try {
      const formData = new FormData();
      formData.append("vehicleId", String(selectedEquipment.id));
      formData.append("documentType", uploadDocType);
      formData.append("expiryDate", uploadDocExpiry);
      formData.append("document", uploadDocFile);

      const res = await apiRequest<{ documentId: number; documents: VehicleDocument[] }>(
        "admin-upload-vehicle-document",
        {
          method: "POST",
          body: formData,
        }
      );

      toast.success("Compliance document uploaded successfully.");
      const updatedDocs = res.documents || [];
      setSelectedEquipment((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          documents: updatedDocs,
          ...(uploadDocType === "insurance" ? { insurance: uploadDocExpiry } : {}),
          ...(uploadDocType === "road_tax" ? { roadTax: uploadDocExpiry } : {}),
          ...(uploadDocType === "puspakom" ? { puspakom: uploadDocExpiry } : {}),
        };
      });
      setForm((prev) => ({
        ...prev,
        ...(uploadDocType === "insurance" ? { insurance: uploadDocExpiry } : {}),
        ...(uploadDocType === "road_tax" ? { roadTax: uploadDocExpiry } : {}),
        ...(uploadDocType === "puspakom" ? { puspakom: uploadDocExpiry } : {}),
      }));
      setShowUploadDocForm(false);
      setUploadDocFile(null);
      if (docFileInputRef.current) docFileInputRef.current.value = "";
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload document.");
    } finally {
      setIsUploadingDoc(false);
    }
  };

  const handleDeleteDocument = async (documentId: number) => {
    if (!selectedEquipment) return;
    const targetDoc = (selectedEquipment.documents || []).find((d) => d.id === documentId);
    const docLabel = targetDoc?.originalName || targetDoc?.type || "this compliance document";
    const confirmed = await confirmAction({
      title: "Delete Compliance Document?",
      description: `Are you sure you want to permanently delete "${docLabel}"? This action cannot be undone.`,
      confirmLabel: "Delete Document",
      tone: "danger",
    });
    if (!confirmed) return;
    try {
      await apiRequest("admin-delete-vehicle-document", {
        method: "POST",
        body: JSON.stringify({ documentId }),
      });
      toast.success("Document deleted successfully.");
      const updatedDocs = (selectedEquipment.documents || []).filter((d) => d.id !== documentId);
      setSelectedEquipment((prev) => (prev ? { ...prev, documents: updatedDocs } : null));
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete document.");
    }
  };

  const renderComplianceDocumentsSection = () => {
    if (!selectedEquipment) return null;
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Compliance Documents</h3>
            <p className="mt-0.5 text-xs text-slate-500">Uploaded files, road tax, insurance, and inspection history.</p>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
              {selectedEquipment.documents?.length || 0} files
            </span>
            {canUpdate && selectedEquipment.verificationStatus !== "rejected" && (
              <button
                type="button"
                onClick={() => setShowUploadDocForm((prev) => !prev)}
                className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-[#1e3a8a] px-3 text-xs font-bold text-white hover:bg-blue-800 transition-colors shadow-2xs cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                {showUploadDocForm ? "Cancel" : "Upload Document"}
              </button>
            )}
          </div>
        </div>

        {/* Upload Form */}
        {showUploadDocForm && (
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/60 p-4 space-y-3 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-extrabold text-blue-950 uppercase tracking-wider flex items-center gap-1.5">
                <Plus className="h-3.5 w-3.5 text-blue-600" />
                Upload New Compliance Document
              </h4>
              <button
                type="button"
                onClick={() => setShowUploadDocForm(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Document Type *</label>
                <AdminSelect
                  value={uploadDocType}
                  onChange={(e) => setUploadDocType(e.target.value as "insurance" | "road_tax" | "puspakom")}
                  className="w-full text-xs"
                >
                  <option value="road_tax">Road Tax</option>
                  <option value="insurance">Insurance</option>
                  <option value="puspakom">PUSPAKOM</option>
                </AdminSelect>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Document Expiry Date *</label>
                <DesktopDatePicker
                  value={uploadDocExpiry}
                  onChange={(val) => setUploadDocExpiry(val)}
                  className="h-10 w-full text-xs"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Choose File (PDF, PNG, JPG, WebP) *</label>
              <input
                ref={docFileInputRef}
                type="file"
                accept=".pdf,image/*,.heic,.heif"
                onChange={(e) => setUploadDocFile(e.target.files?.[0] || null)}
                className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowUploadDocForm(false);
                  setUploadDocFile(null);
                  if (docFileInputRef.current) docFileInputRef.current.value = "";
                }}
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUploadDocument}
                disabled={isUploadingDoc || !uploadDocFile}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#1e3a8a] px-4 py-2 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50 transition-colors cursor-pointer"
              >
                <Save className="h-3.5 w-3.5" />
                {isUploadingDoc ? "Uploading..." : "Upload & Save"}
              </button>
            </div>
          </div>
        )}

        {/* Documents List */}
        {selectedEquipment.documents?.length ? (
          <div className="mt-4 space-y-3">
            {selectedEquipment.documents.map((document) => {
              const label = document.type === "insurance" ? "Insurance" : document.type === "road_tax" ? "Road Tax" : "PUSPAKOM";
              const statusClass = document.status === "approved"
                ? "bg-emerald-100 text-emerald-800"
                : document.status === "pending"
                ? "bg-amber-100 text-amber-800"
                : document.status === "rejected"
                ? "bg-red-100 text-red-800"
                : "bg-slate-200 text-slate-600";
              const fileUrl = apiAssetUrl("vehicle-document-file", { id: document.id });
              const imageDocument = isImageDocument(document);
              const pdfDocument = isPdfDocument(document);
              const previewable = imageDocument || pdfDocument;
              const previewExpanded = previewDocumentId === document.id;
              return (
                <div key={document.id} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-slate-900">{label}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusClass}`}>{document.status}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">Expires {document.expiryDate} · {(document.byteSize / 1024).toFixed(0)} KB</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs font-semibold">
                        {previewable ? (
                          <button
                            type="button"
                            onClick={() => setPreviewDocumentId((current) => current === document.id ? null : document.id)}
                            className="inline-flex items-center gap-1 text-blue-700 hover:underline cursor-pointer"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span className="truncate max-w-[200px]">{document.originalName}</span>
                            <span className="shrink-0 text-slate-400">· {previewExpanded ? "Hide preview" : "Preview"}</span>
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-700">
                            <FileText className="h-3.5 w-3.5 text-slate-400" />
                            <span className="truncate max-w-[200px]">{document.originalName}</span>
                          </span>
                        )}
                        <a
                          href={fileUrl}
                          download={document.originalName}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-slate-500 hover:text-blue-700 hover:underline cursor-pointer"
                          title={`Download ${document.originalName}`}
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>Download</span>
                        </a>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {canUpdate && selectedEquipment.verificationStatus !== "rejected" && (
                        <button
                          type="button"
                          onClick={() => void handleDeleteDocument(document.id)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer"
                          title="Delete document"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  {imageDocument && (
                    <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                      {docImageErrors[document.id] ? (
                        <div className="flex flex-col items-center justify-center p-6 text-center">
                          <AlertCircle className="h-8 w-8 text-amber-500 mb-2" />
                          <p className="text-xs font-medium text-slate-700">Preview could not be displayed</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">The file might be unavailable or requires direct download.</p>
                          <a
                            href={fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-blue-600 shadow-xs border border-slate-200 hover:bg-slate-50 transition-colors"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Open or download document
                          </a>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPreviewDocumentId((current) => current === document.id ? null : document.id)}
                          className={`flex w-full items-center justify-center cursor-pointer ${previewExpanded ? "min-h-64 p-2" : "h-48 p-2"}`}
                          aria-label={`${previewExpanded ? "Reduce" : "Enlarge"} preview of ${document.originalName}`}
                        >
                          <img
                            src={fileUrl}
                            alt={`Preview of ${label} document ${document.originalName}`}
                            className={previewExpanded ? "max-h-[62vh] max-w-full object-contain" : "h-full w-full object-contain"}
                            onError={() => setDocImageErrors((prev) => ({ ...prev, [document.id]: true }))}
                          />
                        </button>
                      )}
                    </div>
                  )}
                  {pdfDocument && previewExpanded && (
                    <iframe
                      src={fileUrl}
                      title={`Preview of ${label} document ${document.originalName}`}
                      className="mt-3 h-[62vh] min-h-96 w-full rounded-lg border border-slate-200 bg-white"
                    />
                  )}
                  {document.reviewReason ? <p className="mt-2 rounded bg-red-50 px-2 py-1.5 text-xs text-red-700">{document.reviewReason}</p> : null}
                  {canReview && document.status === "pending" ? (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => void handleReviewDocument(document, "approved")}
                        disabled={reviewingDocumentId !== null}
                        className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40 cursor-pointer"
                      >
                        {reviewingDocumentId === document.id ? "Saving..." : "Approve document"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleReviewDocument(document, "rejected")}
                        disabled={reviewingDocumentId !== null}
                        className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-40 cursor-pointer"
                      >
                        Reject document
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
            {canReview && selectedEquipment.documents.some((document) => document.status === "pending") ? (
              <textarea
                value={documentReviewReason}
                onChange={(event) => setDocumentReviewReason(event.target.value)}
                placeholder="Reason required only when rejecting a document"
                rows={2}
                className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            ) : null}
          </div>
        ) : (
          !showUploadDocForm && (
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
              <p className="text-xs text-slate-500">No uploaded compliance documents.</p>
              {canUpdate && (
                <button
                  type="button"
                  onClick={() => setShowUploadDocForm(true)}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Upload First Document
                </button>
              )}
            </div>
          )
        )}
      </section>
    );
  };

  const renderVehicleServiceHistorySection = () => {
    if (!selectedEquipment) return null;

    const rawSummary = (vehicleHistory?.summary || {}) as any;
    const summary = {
      totalWorkOrders: Number(rawSummary.totalWorkOrders ?? rawSummary.totalJobs ?? 0),
      totalInvoices: Number(rawSummary.totalInvoices ?? 0),
      totalMaintenanceSpend: Number(rawSummary.totalMaintenanceSpend ?? rawSummary.totalSpent ?? 0),
      lastRecordedMileage: rawSummary.lastRecordedMileage ?? rawSummary.maxMileage ?? null,
      lastServiceDate: rawSummary.lastServiceDate ?? null,
    };
    const workOrders = vehicleHistory?.workOrders || [];
    const invoices = vehicleHistory?.invoices || [];

    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">3. Workshop Service & Maintenance History</h3>
              <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-200">
                {summary.totalWorkOrders} Services / {summary.totalInvoices} Invoices
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Complete historical record of work orders, maintenance costs, and billing for vehicle {selectedEquipment.regNo || selectedEquipment.vecNo}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (selectedEquipment.id) {
                  setLoadingHistory(true);
                  apiRequest<VehicleHistoryData>(
                    `admin-vehicle-history&vehicleId=${selectedEquipment.id}&plate=${encodeURIComponent(selectedEquipment.regNo || "")}`
                  )
                    .then((res) => {
                      const historyData = ((res as any)?.data || res) as VehicleHistoryData;
                      if (historyData && (historyData.workOrders || historyData.summary)) {
                        setVehicleHistory(historyData);
                      }
                    })
                    .finally(() => setLoadingHistory(false));
                }
              }}
              disabled={loadingHistory}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <RotateCcw className={`h-3.5 w-3.5 ${loadingHistory ? "animate-spin text-blue-600" : "text-slate-400"}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Summary Metric Cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Total Work Orders</span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-black text-slate-900">{summary.totalWorkOrders}</span>
              <span className="text-xs text-slate-400">jobs</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Invoices Billed</span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xl font-black text-slate-900">{summary.totalInvoices}</span>
              <span className="text-xs text-slate-400">issued</span>
            </div>
          </div>

          <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3.5">
            <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider block">Total Spend</span>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-xs font-bold text-emerald-700">RM</span>
              <span className="text-xl font-black text-emerald-900">
                {Number(summary.totalMaintenanceSpend || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3.5">
            <span className="text-[11px] font-semibold text-blue-800 uppercase tracking-wider block">Last Service Mileage</span>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-xl font-black text-blue-950">
                {summary.lastRecordedMileage ? Number(summary.lastRecordedMileage).toLocaleString("en-MY") : "—"}
              </span>
              {summary.lastRecordedMileage ? <span className="text-xs text-blue-700">km</span> : null}
            </div>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-200">
          <button
            type="button"
            onClick={() => setHistoryTab("work_orders")}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-colors cursor-pointer ${
              historyTab === "work_orders"
                ? "border-[#1e3a8a] text-[#1e3a8a]"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <Wrench className="h-3.5 w-3.5" />
            <span>Work Orders ({summary.totalWorkOrders})</span>
          </button>
          <button
            type="button"
            onClick={() => setHistoryTab("invoices")}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-colors cursor-pointer ${
              historyTab === "invoices"
                ? "border-[#1e3a8a] text-[#1e3a8a]"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            <span>Invoices & Billing ({summary.totalInvoices})</span>
          </button>
          <button
            type="button"
            onClick={() => setHistoryTab("mileage_logs")}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-colors cursor-pointer ${
              historyTab === "mileage_logs"
                ? "border-[#1e3a8a] text-[#1e3a8a]"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <History className="h-3.5 w-3.5" />
            <span>Odometer Audit Trail ({vehicleHistory?.mileageLogs?.length || 0})</span>
          </button>
        </div>

        {/* Content */}
        {loadingHistory ? (
          <div className="flex items-center justify-center py-12 text-slate-400 text-xs">
            <RotateCcw className="h-4 w-4 animate-spin mr-2 text-blue-600" />
            Loading vehicle service records...
          </div>
        ) : historyTab === "work_orders" ? (
          workOrders.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
              <Wrench className="mx-auto h-8 w-8 text-slate-300 mb-2" />
              <p className="text-xs font-semibold text-slate-700">No service work orders recorded</p>
              <p className="mt-1 text-[11px] text-slate-500">
                When this vehicle undergoes workshop maintenance or inspection, records will appear here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-700">
                  <tr>
                    <th className="px-3.5 py-2.5">Work Order</th>
                    <th className="px-3.5 py-2.5">Date / Time</th>
                    <th className="px-3.5 py-2.5">Service / Issue</th>
                    <th className="px-3.5 py-2.5">Mileage</th>
                    <th className="px-3.5 py-2.5">Status</th>
                    <th className="px-3.5 py-2.5 text-right">Amount</th>
                    <th className="px-3.5 py-2.5 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {workOrders.map((wo) => {
                    const isCollected = wo.status === "collected" || wo.status === "completed";
                    const isInProgress = wo.status === "in_progress" || wo.status === "work_completed";
                    return (
                      <tr key={wo.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-3.5 py-2.5">
                          <button
                            type="button"
                            onClick={() => navigate(`/work-orders?wo=${encodeURIComponent(wo.workOrderNo)}`)}
                            className="font-bold text-slate-900 transition-colors hover:text-blue-600 cursor-pointer text-left"
                          >
                            {wo.workOrderNo}
                          </button>
                        </td>
                        <td className="px-3.5 py-2.5 text-slate-500 whitespace-nowrap">
                          {wo.checkinAt ? wo.checkinAt.slice(0, 16) : "—"}
                        </td>
                        <td className="px-3.5 py-2.5 font-medium text-slate-800 max-w-[240px] truncate" title={wo.primaryIssue || ""}>
                          {wo.primaryIssue || "Standard Service & Maintenance"}
                        </td>
                        <td className="px-3.5 py-2.5 font-mono text-slate-700 whitespace-nowrap">
                          <div>
                            <span>{formatMileage(wo.currentMileage ?? wo.checkinMileage)}</span>
                            {wo.mileageDelta !== null && wo.mileageDelta !== undefined && (
                              <span className={`block text-[10px] font-sans font-semibold ${wo.mileageDelta > 15000 ? "text-amber-600" : "text-slate-500"}`}>
                                {wo.mileageDelta > 0 ? `+${wo.mileageDelta.toLocaleString()} km` : `${wo.mileageDelta.toLocaleString()} km`}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              isCollected
                                ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                                : isInProgress
                                ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                                : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                            }`}
                          >
                            {wo.statusLabel || wo.status}
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-bold text-slate-900 whitespace-nowrap">
                          RM {Number(wo.totalAmount || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-3.5 py-2.5 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => navigate(`/work-orders?wo=${encodeURIComponent(wo.workOrderNo)}`)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-colors shadow-2xs cursor-pointer"
                          >
                            <span>Open WO</span>
                            <ExternalLink className="h-3 w-3 text-slate-400" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : historyTab === "invoices" ? (
          invoices.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
              <FileText className="mx-auto h-8 w-8 text-slate-300 mb-2" />
              <p className="text-xs font-semibold text-slate-700">No invoices issued for this vehicle</p>
              <p className="mt-1 text-[11px] text-slate-500">
                Invoices generated from workshop jobs or parts sales will appear here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-700">
                  <tr>
                    <th className="px-3.5 py-2.5">Invoice No</th>
                    <th className="px-3.5 py-2.5">Invoice Date</th>
                    <th className="px-3.5 py-2.5">Linked Work Order</th>
                    <th className="px-3.5 py-2.5 text-right">Total Amount</th>
                    <th className="px-3.5 py-2.5">Payment Status</th>
                    <th className="px-3.5 py-2.5 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {invoices.map((inv) => {
                    const isPaid = inv.paymentStatus === "paid";
                    return (
                      <tr key={inv.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-3.5 py-2.5">
                          <button
                            type="button"
                            onClick={() => navigate(`/invoices?search=${encodeURIComponent(inv.invoiceNo)}`)}
                            className="font-bold text-slate-900 transition-colors hover:text-blue-600 cursor-pointer text-left"
                          >
                            {inv.invoiceNo}
                          </button>
                        </td>
                        <td className="px-3.5 py-2.5 text-slate-500 whitespace-nowrap">
                          {inv.invoiceDate || "—"}
                        </td>
                        <td className="px-3.5 py-2.5">
                          {inv.workOrderNo ? (
                            <button
                              type="button"
                              onClick={() => navigate(`/work-orders?wo=${encodeURIComponent(inv.workOrderNo || "")}`)}
                              className="font-bold text-slate-900 transition-colors hover:text-blue-600 cursor-pointer text-left"
                            >
                              {inv.workOrderNo}
                            </button>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-bold text-slate-900 whitespace-nowrap">
                          RM {Number(inv.totalAmount || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              isPaid
                                ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                                : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                            }`}
                          >
                            {inv.paymentStatus ? inv.paymentStatus.toUpperCase() : "PENDING"}
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => navigate(`/invoices?search=${encodeURIComponent(inv.invoiceNo)}`)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-colors shadow-2xs cursor-pointer"
                          >
                            <span>View Invoice</span>
                            <ExternalLink className="h-3 w-3 text-slate-400" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          (vehicleHistory?.mileageLogs || []).length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
                <History className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                <p className="text-xs font-semibold text-slate-700">No odometer audit records yet</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Odometer readings are automatically and immutably recorded during workshop check-in, bookings, and profile updates.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-700">
                    <tr>
                      <th className="px-3.5 py-2.5">Date & Time</th>
                      <th className="px-3.5 py-2.5">Recorded Reading</th>
                      <th className="px-3.5 py-2.5">Change / Delta</th>
                      <th className="px-3.5 py-2.5">Recording Source</th>
                      <th className="px-3.5 py-2.5">Reference Document</th>
                      <th className="px-3.5 py-2.5">Recorded By / Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {(vehicleHistory?.mileageLogs || []).map((log) => {
                      const sourceLabel =
                        log.source === "work_order_checkin"
                          ? "WO Check-in"
                          : log.source === "walkin_checkin"
                          ? "Walk-in Intake"
                          : log.source === "booking_checkin"
                          ? "Booking Intake"
                          : log.source === "work_order_update"
                          ? "WO Correction"
                          : log.source === "vehicle_profile"
                          ? "Profile Edit"
                          : log.source === "vehicle_created"
                          ? "Registration"
                          : log.source;

                      const sourceBadgeClass =
                        log.source.includes("checkin") || log.source.includes("intake")
                          ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                          : log.source === "vehicle_profile" || log.source === "vehicle_created"
                          ? "bg-purple-50 text-purple-700 ring-1 ring-purple-200"
                          : "bg-slate-100 text-slate-700 ring-1 ring-slate-200";

                      return (
                        <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-3.5 py-2.5 text-slate-500 whitespace-nowrap">
                            {log.createdAt ? log.createdAt.slice(0, 16) : "—"}
                          </td>
                          <td className="px-3.5 py-2.5 font-mono font-bold text-slate-900 whitespace-nowrap">
                            {formatMileage(log.mileage)}
                          </td>
                          <td className="px-3.5 py-2.5 font-mono whitespace-nowrap">
                            {log.delta !== null && log.delta !== undefined && log.delta !== 0 ? (
                              <span className={`inline-flex items-center text-xs font-semibold ${log.delta > 15000 ? "text-amber-600" : log.delta > 0 ? "text-emerald-600" : "text-slate-500"}`}>
                                {log.delta > 0 ? `+${log.delta.toLocaleString()} km` : `${log.delta.toLocaleString()} km`}
                              </span>
                            ) : (
                              <span className="text-slate-400">Baseline</span>
                            )}
                          </td>
                          <td className="px-3.5 py-2.5 whitespace-nowrap">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${sourceBadgeClass}`}>
                              {sourceLabel}
                            </span>
                          </td>
                          <td className="px-3.5 py-2.5 font-mono text-slate-700 whitespace-nowrap">
                            {log.referenceNo ? (
                              log.referenceNo.startsWith("WO-") ? (
                                <button
                                  type="button"
                                  onClick={() => navigate(`/work-orders?wo=${encodeURIComponent(log.referenceNo || "")}`)}
                                  className="font-bold text-slate-900 transition-colors hover:text-blue-600 cursor-pointer"
                                >
                                  {log.referenceNo}
                                </button>
                              ) : (
                                <span>{log.referenceNo}</span>
                              )
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-3.5 py-2.5 text-slate-600 max-w-[260px] truncate" title={log.notes || ""}>
                            <span className="font-semibold text-slate-800">{log.recordedByName || "System"}: </span>
                            <span>{log.notes || "Odometer logged"}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
      </section>
    );
  };

  const isStandaloneVehiclePage = Boolean(modalMode === "create" || (selectedEquipment && (modalMode === "view" || modalMode === "edit")));

  if (isLoading && !hasLoaded) {
    return (
      <PageLoading
        title="Loading Vehicles..."
        description="Loading commercial fleet inventory and maintenance schedules..."
      />
    );
  }

  return (
    <>
      {!isStandaloneVehiclePage ? (
      <div className="w-full space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Vehicle Management</h1>
            <AutoCountSyncBadge
              label="AutoCount Vehicle Master"
              onRefresh={() => void reload()}
              isRefreshing={isLoading}
            />
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Fleet master records are managed in AutoCount. Maintenance schedules and workshop status are tracked here.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate ? (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#1e3a8a] px-4 text-xs font-bold text-white shadow-xs transition-colors hover:bg-blue-800 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              {t("add_vehicle") || "New Vehicle"}
            </button>
          ) : null}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          Database data unavailable: {error}. Showing fallback data.
        </div>
      )}

      {/* Unified Filter & Tabs Card (matching Work Orders / Bookings design) */}
      <div className="relative z-20 rounded-2xl border border-slate-200 bg-white shadow-2xs">
        {/* Top: Status Tabs */}
        <div className="flex items-center gap-6 sm:gap-8 border-b border-slate-100 px-6 pt-3.5 overflow-x-auto no-scrollbar">
          {operationalTabs.map((tab) => {
            const isActive = operationalStatusFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setOperationalStatusFilter(tab.id);
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

        {/* Bottom: Search & Filter Inputs Grid */}
        <div className="grid grid-cols-1 gap-3 px-6 py-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[1.4fr_1.1fr_1fr_1fr_1fr_1fr_auto]">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search vehicle no., reg no., brand, model, company..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 shadow-2xs placeholder:text-slate-400"
            />
          </div>

          {/* Company Filter */}
          <div>
            <AdminSelect
              value={String(companyFilter || "")}
              onChange={(e) => {
                const val = e.target.value;
                setSearchParams((prev) => {
                  const next = new URLSearchParams(prev);
                  if (!val || val === "0") {
                    next.delete("companyId");
                  } else {
                    next.set("companyId", val);
                  }
                  return next;
                });
                setPage(1);
              }}
              placement="bottom"
              className="h-10 w-full text-xs"
              aria-label="Filter by company"
            >
              <option value="">All Companies</option>
              {companiesData
                .filter((c) => c.id !== null && c.id !== undefined && Number(c.id) > 0)
                .map((comp) => (
                  <option key={comp.id} value={String(comp.id)}>
                    {comp.name}
                  </option>
                ))}
            </AdminSelect>
          </div>

          {/* Equipment Type Filter */}
          <div>
            <AdminSelect
              value={equipmentTypeFilter}
              onChange={(e) => {
                setEquipmentTypeFilter(e.target.value);
                setPage(1);
              }}
              placement="bottom"
              className="h-10 w-full text-xs"
              aria-label="Filter equipment type"
            >
              <option value="All">All Types</option>
              {fleetEquipmentTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </AdminSelect>
          </div>

          {/* Brand Filter */}
          <div>
            <AdminSelect
              value={selectedBrand}
              onChange={(e) => {
                setSelectedBrand(e.target.value);
                setPage(1);
              }}
              placement="bottom"
              className="h-10 w-full text-xs"
              aria-label="Filter vehicle brand"
            >
              {brands.map((brand) => (
                <option key={brand} value={brand}>{brand === "All" ? "All Brands" : brand}</option>
              ))}
            </AdminSelect>
          </div>

          {/* Approval Filter */}
          <div>
            <AdminSelect
              value={verificationFilter}
              onChange={(e) => {
                setVerificationFilter(e.target.value);
                setPage(1);
              }}
              placement="bottom"
              className="h-10 w-full text-xs"
              aria-label="Filter vehicle verification status"
            >
              <option value="All">All Approvals</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
            </AdminSelect>
          </div>

          {/* Compliance Filter */}
          <div>
            <AdminSelect
              value={complianceFilter}
              onChange={(e) => {
                setComplianceFilter(e.target.value);
                setPage(1);
              }}
              placement="bottom"
              className="h-10 w-full text-xs"
              aria-label="Filter compliance status"
            >
              <option value="All">All Compliance</option>
              <option value="Expired">Expired Documents</option>
              <option value="ExpiringSoon">Expiring Soon (30d)</option>
            </AdminSelect>
          </div>

          {/* Reset button */}
          <button
            type="button"
            onClick={handleClearFilters}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <RotateCcw className="h-4 w-4 text-slate-500" />
            Reset
          </button>
        </div>
      </div>

      {/* Equipment / Vehicles Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50/70">
              <tr className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                <SortableHeader
                  label="Vehicle / Unit"
                  sortKey="vecNo"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  className="px-5 py-3.5 text-left"
                />
                <SortableHeader
                  label="Plate No."
                  sortKey="regNo"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  className="px-5 py-3.5 text-left"
                />
                <th scope="col" className="px-5 py-3.5 text-left">Vehicle Details</th>
                <SortableHeader
                  label="Vehicle Type"
                  sortKey="equipment"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  className="px-5 py-3.5 text-left"
                />
                <SortableHeader
                  label="Company"
                  sortKey="company"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  className="px-5 py-3.5 text-left"
                />
                <SortableHeader
                  label="Mileage"
                  sortKey="mileage"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  className="px-5 py-3.5 text-left"
                />
                <SortableHeader
                  label="Status"
                  sortKey="status"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  className="px-5 py-3.5 text-left"
                />
                <th scope="col" className="px-5 py-3.5 text-left">Approval</th>
                <SortableHeader
                  label="Compliance"
                  sortKey="compliance"
                  currentSortKey={sortKey}
                  currentSortDirection={sortDirection}
                  onSort={handleSort}
                  className="px-5 py-3.5 text-left"
                />
                <th scope="col" className="px-5 py-3.5 text-right whitespace-nowrap font-bold text-slate-700">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-xs">
              {isLoading && filteredEquipment.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-5 py-16 text-center font-medium text-slate-400">
                    Loading vehicles…
                  </td>
                </tr>
              ) : null}
              {!isLoading && filteredEquipment.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-5 py-16 text-center font-medium text-slate-400">
                    No vehicles found matching these criteria.
                  </td>
                </tr>
              ) : null}
              {paginatedEquipment.map((item) => {
                const complianceValues = [item.roadTax, item.insurance, item.puspakom];
                const expiredComplianceCount = complianceValues.filter((value) => isComplianceExpired(value)).length;
                const missingComplianceCount = complianceValues.filter((value) => !value?.trim()).length;

                return (
                <tr key={item.id} className="align-middle transition-colors hover:bg-slate-50/50">
                  {/* Vehicle / Unit */}
                  <td className="px-5 py-4 whitespace-nowrap">
                    {item.vecNo ? (
                      <button
                        type="button"
                        onClick={() => openViewModal(item)}
                        className="text-left font-bold text-blue-600 transition-colors hover:text-blue-800 hover:underline cursor-pointer"
                      >
                        {item.vecNo}
                      </button>
                    ) : (
                      <span className="font-medium text-slate-400">—</span>
                    )}
                  </td>

                  {/* Plate No. */}
                  <td className="px-5 py-4 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openViewModal(item)}
                      className="font-bold text-slate-900 transition-colors hover:text-blue-600 cursor-pointer"
                    >
                      {item.regNo || "—"}
                    </button>
                  </td>

                  {/* Vehicle Details */}
                  <td className="px-5 py-4">
                    <p className="font-bold text-slate-900">
                      {[item.brand, item.model].filter(Boolean).join(" ") || "-"}
                    </p>
                  </td>

                  {/* Vehicle Type; detailed chassis specs remain in View Details */}
                  <td className="px-5 py-4">
                    <p className="font-semibold text-slate-900">
                      {isMissingEquipmentValue(item.equipment) ? "Not specified" : item.equipment}
                    </p>
                  </td>

                  {/* Company */}
                  <td className="px-5 py-4">
                    <p className="font-semibold text-slate-900">
                      {item.companyName || item.owner || "-"}
                    </p>
                  </td>

                  {/* Mileage */}
                  <td className="px-5 py-4 whitespace-nowrap">
                    {(() => {
                      const isChassis = (item.equipment || "").toLowerCase().includes("chassis") || (item.equipment || "").toLowerCase().includes("skeletal trailer");
                      if (isChassis) {
                        return <span className="text-xs font-semibold text-slate-400">N/A (Chassis)</span>;
                      }
                      const curMileage = Number(String(item.mileage || "").replace(/\D/g, "")) || 0;
                      const nextMileage = Number(item.nextServiceMileage || 0);
                      const isOverdue = nextMileage > 0 && curMileage > nextMileage;
                      const isDueSoon = nextMileage > 0 && !isOverdue && (nextMileage - curMileage) <= 1000;

                      return (
                        <div>
                          <p className="font-semibold text-slate-900">
                            {formatMileage(item.mileage)}
                          </p>
                          {isOverdue && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 ring-1 ring-rose-200">
                              <AlertCircle className="h-2.5 w-2.5" /> Overdue {(curMileage - nextMileage).toLocaleString()} km
                            </span>
                          )}
                          {isDueSoon && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-200">
                              Due in {(nextMileage - curMileage).toLocaleString()} km
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </td>

                  {/* Status */}
                  <td className="px-5 py-4 whitespace-nowrap">
                    {(() => {
                      const opStatus = getEffectiveVehicleStatus(item);

                      if (item.activeWorkOrder) {
                        return (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/work-orders?vehicleId=${item.id}`);
                            }}
                            className="group inline-flex items-center gap-1.5 font-bold text-amber-600 hover:text-amber-800 transition-colors cursor-pointer"
                            title={`Click to view Work Order: ${item.activeWorkOrder.workOrderNo} (${item.activeWorkOrder.statusLabel})`}
                          >
                            <span className="relative flex h-1.5 w-1.5">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-600" />
                            </span>
                            <span className="group-hover:underline">{opStatus}</span>
                            <ExternalLink className="h-3 w-3 opacity-60 group-hover:opacity-100 transition-opacity text-amber-600" />
                          </button>
                        );
                      }

                      return (
                        <span className={`inline-flex items-center gap-1.5 font-bold ${
                          opStatus === "Active"
                            ? "text-emerald-600"
                            : "text-slate-500"
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${
                            opStatus === "Active"
                              ? "bg-emerald-600"
                              : "bg-slate-400"
                          }`} />
                          {opStatus}
                        </span>
                      );
                    })()}
                  </td>

                  {/* Approval Status */}
                  <td className="px-5 py-4 whitespace-nowrap">
                    {(() => {
                      const vStatus = (item.verificationStatus || "approved").toLowerCase();
                      if (vStatus === "pending") {
                        return <span className="font-bold text-amber-600">Pending</span>;
                      }
                      if (vStatus === "rejected") {
                        return <span className="font-bold text-red-600">Rejected</span>;
                      }
                      return <span className="font-bold text-emerald-600">Approved</span>;
                    })()}
                  </td>

                  {/* Compliance summary; full dates remain in View Details */}
                  <td className="px-5 py-4 whitespace-nowrap">
                    {expiredComplianceCount > 0 ? (
                      <span className="font-bold text-red-600">
                        {expiredComplianceCount} Expired
                      </span>
                    ) : missingComplianceCount > 0 ? (
                      <span className="font-bold text-amber-600">
                        {missingComplianceCount} Not Set
                      </span>
                    ) : (
                      <span className="font-bold text-emerald-600">
                        All Valid
                      </span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-5 py-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => openViewModal(item)}
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 cursor-pointer"
                        aria-label={`View ${item.regNo}`}
                        title="View details"
                      >
                        <Eye className="h-3.5 w-3.5 text-slate-500" />
                        View Details
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
          currentPage={page}
          totalPages={totalPages}
          totalItems={filteredEquipment.length}
          pageSize={pageSize}
          pageSizeOptions={[10, 25, 50, 100]}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          itemLabel="vehicles"
        />
      </div>

      </div>
      ) : null}

      {modalMode && (
        <div className={isStandaloneVehiclePage ? "w-full space-y-4" : "fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm transition-opacity sm:p-5"}>
          <div className={isStandaloneVehiclePage ? "w-full space-y-4" : `flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150`}>
            {isStandaloneVehiclePage ? (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={closeModal}
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 cursor-pointer"
                >
                  <ArrowLeft className="h-4 w-4 text-slate-500" />
                  Back to Vehicles
                </button>

                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h1 className="text-2xl font-black tracking-tight text-slate-900">
                        {modalMode === "create"
                          ? "New Vehicle"
                          : (selectedEquipment?.vecNo || selectedEquipment?.regNo || "Vehicle")}
                      </h1>
                      {modalMode === "create" ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700">
                          <Truck className="h-3.5 w-3.5" />
                          Fleet Registration
                        </span>
                      ) : selectedEquipment ? (
                        (() => {
                          const opStatus = getEffectiveVehicleStatus(selectedEquipment);
                          return (
                            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                              opStatus === "Active"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : opStatus === "Under Maintenance"
                                ? "border-amber-200 bg-amber-50 text-amber-700"
                                : "border-slate-200 bg-slate-100 text-slate-600"
                            }`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${opStatus === "Active" ? "bg-emerald-600" : opStatus === "Under Maintenance" ? "bg-amber-600" : "bg-slate-400"}`} />
                              {opStatus}
                            </span>
                          );
                        })()
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {modalMode === "create"
                        ? "Register a new commercial prime mover, trailer or fleet equipment into the system."
                        : `${selectedEquipment?.regNo} · Vehicle master, compliance documents and service information.`}
                    </p>
                    {selectedEquipment?.activeWorkOrder && (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-2.5 text-xs text-amber-900">
                        <div className="flex items-center gap-2">
                          <Wrench className="h-4 w-4 text-amber-600 shrink-0" />
                          <div>
                            <span className="font-bold">Active Workshop Job: </span>
                            <span className="font-semibold text-amber-800">{selectedEquipment.activeWorkOrder.workOrderNo} ({selectedEquipment.activeWorkOrder.statusLabel})</span>
                            {selectedEquipment.activeWorkOrder.checkinAt && (
                              <span className="text-amber-600 text-[11px] ml-2">Checked in {selectedEquipment.activeWorkOrder.checkinAt}</span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => navigate(`/work-orders?vehicleId=${selectedEquipment.id}`)}
                          className="inline-flex items-center gap-1 font-bold text-amber-800 hover:text-amber-950 underline shrink-0 cursor-pointer"
                        >
                          View Work Order
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                    {selectedEquipment?.verificationStatus === "rejected" && (
                      <div className="mt-3 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50/90 px-4 py-2.5 text-xs text-red-900">
                        <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold text-red-800">Vehicle Rejected: </span>
                          <span className="text-red-700 font-medium">
                            {selectedEquipment.rejectionReason || "This vehicle has been rejected by administration. Editing and workshop operations are disabled."}
                          </span>
                          {selectedEquipment.reviewedAt && (
                            <span className="text-red-500 text-[11px] ml-2">Reviewed on {selectedEquipment.reviewedAt}</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {modalMode === "view" && selectedEquipment ? (
                      <div className="flex items-center gap-2">
                        {selectedEquipment.verificationStatus === "rejected" && (
                          <span className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-700">
                            <AlertCircle className="h-4 w-4 text-red-500" />
                            Rejected
                          </span>
                        )}
                        {canUpdate ? (
                          <button
                            key="btn-edit-vehicle"
                            type="button"
                            onClick={() => openEditModal(selectedEquipment)}
                            className="inline-flex h-10 items-center gap-2 rounded-xl border border-blue-600 bg-white px-5 text-xs font-bold text-blue-600 shadow-2xs transition-colors hover:bg-blue-50 cursor-pointer"
                          >
                            <Edit className="h-4 w-4" />
                            {selectedEquipment.verificationStatus === "rejected" ? "Edit & Re-verify" : "Edit Vehicle"}
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <>
                        <button
                          key="btn-cancel-vehicle"
                          type="button"
                          disabled={isSaving}
                          onClick={() => (selectedEquipment ? openViewModal(selectedEquipment) : closeModal())}
                          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 cursor-pointer"
                        >
                          <X className="h-4 w-4" />
                          Cancel
                        </button>
                        {((selectedEquipment?.verificationStatus === "pending" || selectedEquipment?.verificationStatus === "rejected") && canReview) ? (
                          <button
                            key="btn-approve-vehicle"
                            type="button"
                            disabled={isSaving}
                            onClick={() => void handleSubmitEquipment(true)}
                            className="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-600 bg-white px-5 text-xs font-bold text-emerald-700 shadow-2xs transition-colors hover:bg-emerald-50 disabled:opacity-50 cursor-pointer"
                          >
                            <Save className="h-4 w-4" />
                            {isSaving ? "Saving..." : "Save & Approve"}
                          </button>
                        ) : null}
                        <button
                          key="btn-save-vehicle"
                          type="button"
                          disabled={isSaving}
                          onClick={() => void handleSubmitEquipment(false)}
                          className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                        >
                          <Save className="h-4 w-4" />
                          {isSaving
                            ? "Saving..."
                            : modalMode === "create"
                            ? "Create Vehicle"
                            : selectedEquipment?.verificationStatus === "rejected"
                            ? "Save as Pending"
                            : "Save Changes"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ) : (
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-7 sm:py-5">
              <div className="flex min-w-0 items-start gap-3.5">
                {modalMode !== "view" ? <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1e3a8a] ring-1 ring-blue-100"><Truck className="h-5 w-5" /></div> : null}
                <div>
                <h2 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
                  {modalMode === "create"
                    ? "New Vehicle"
                    : modalMode === "edit"
                    ? "Edit Vehicle"
                    : "Vehicle Details"}
                </h2>
                <p className="mt-1 text-xs leading-5 text-slate-500 sm:text-sm">
                  {modalMode === "view"
                    ? "View detailed vehicle information."
                    : "Fill in vehicle details below."}
                </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            )}

            <div className={isStandaloneVehiclePage ? "space-y-6" : "flex-1 overflow-y-auto bg-slate-50/80 p-4 sm:p-6"}>
              {modalMode === "view" && selectedEquipment ? (
                <div className="space-y-6">
                  <section className="rounded-2xl border border-slate-200 bg-white shadow-2xs">
                    <div className="flex items-start gap-3 rounded-t-2xl border-b border-slate-100 bg-white px-5 py-3.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                        <Truck className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">1. Vehicle profile</h3>
                        <p className="mt-0.5 text-xs text-slate-500">Fleet identity and operational workshop details.</p>
                      </div>
                    </div>

                    <div className="space-y-4 p-5">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <VehicleReadOnlyField label="Equipment Type" value={isMissingEquipmentValue(selectedEquipment.equipment) ? "Not specified" : selectedEquipment.equipment} />
                        <VehicleReadOnlyField label="Vehicle Status" value={getEffectiveVehicleStatus(selectedEquipment)} />
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <VehicleReadOnlyField label="Unit / Fleet Number" value={selectedEquipment.vecNo} />
                        <VehicleReadOnlyField label="Registration / Plate No." value={selectedEquipment.regNo} />
                        <VehicleReadOnlyField label="Manufacture Year" value={selectedEquipment.year || null} />
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <VehicleReadOnlyField label="Brand / Manufacturer" value={selectedEquipment.brand} />
                        <VehicleReadOnlyField label="Model / Series" value={selectedEquipment.model} />
                      </div>

                      {selectedEquipment.containerLength || selectedEquipment.axleConfiguration ? (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <VehicleReadOnlyField label="Container Length" value={selectedEquipment.containerLength} />
                          <VehicleReadOnlyField label="Axle Configuration" value={selectedEquipment.axleConfiguration} />
                        </div>
                      ) : null}

                      {(() => {
                        const profileMileageNum = Number(String(selectedEquipment.mileage || 0).replace(/[^0-9]/g, ""));
                        const historyMileageNum = Number(vehicleHistory?.summary?.lastRecordedMileage || 0);
                        const displayProfileMileage = Math.max(profileMileageNum, historyMileageNum);
                        const displayLastServiceDate = selectedEquipment.lastServiceDate || vehicleHistory?.summary?.lastServiceDate || "";
                        const rawHistoryLastMileage = (vehicleHistory?.summary as any)?.lastServiceMileage;
                        const displayLastServiceMileage = selectedEquipment.lastServiceMileage || (rawHistoryLastMileage ? Number(rawHistoryLastMileage) : (historyMileageNum > 0 ? historyMileageNum : null));

                        return (
                          <>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                              <VehicleReadOnlyField label="Current Mileage" value={formatMileage(displayProfileMileage || selectedEquipment.mileage)} />
                              <VehicleReadOnlyField label="Chassis / VIN No." value={selectedEquipment.chassisNo} />
                            </div>

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                              <VehicleReadOnlyField label="Engine No." value={selectedEquipment.engineNo} />
                              <VehicleReadOnlyField label="Company" value={selectedEquipment.companyName || selectedEquipment.owner} />
                            </div>

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                              <VehicleReadOnlyField label="Insurance Expiry" value={selectedEquipment.insurance} />
                              <VehicleReadOnlyField label="Road Tax Expiry" value={selectedEquipment.roadTax} />
                              <VehicleReadOnlyField label="Puspakom Expiry" value={selectedEquipment.puspakom} />
                            </div>

                            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                              <div className="mb-3">
                                <h3 className="text-sm font-semibold text-gray-900">Service Information</h3>
                                <p className="mt-0.5 text-xs text-gray-500">Optional history and the next recommended service interval.</p>
                              </div>
                              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div className="space-y-3">
                                  <VehicleReadOnlyField label="Last Service Date" value={displayLastServiceDate || null} />
                                  <VehicleReadOnlyField label="Last Service Mileage" value={displayLastServiceMileage ? formatMileage(displayLastServiceMileage) : null} />
                                </div>
                                <div className="space-y-3">
                                  <VehicleReadOnlyField label="Next Service Date" value={selectedEquipment.nextServiceDate} />
                                  <div>
                                    <VehicleReadOnlyField label="Next Service Mileage" value={selectedEquipment.nextServiceMileage ? formatMileage(selectedEquipment.nextServiceMileage) : null} />
                                    {(() => {
                                      const nextNum = Number(selectedEquipment.nextServiceMileage || 0);
                                      const curNum = Number(displayProfileMileage || String(selectedEquipment.mileage || "").replace(/\D/g, "") || 0);
                                      if (nextNum > 0 && curNum > nextNum) {
                                        return (
                                          <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-rose-600">
                                            <AlertCircle className="h-3 w-3 shrink-0" />
                                            Service overdue by {(curNum - nextNum).toLocaleString()} km
                                          </p>
                                        );
                                      }
                                      if (nextNum > 0 && (nextNum - curNum) <= 1000) {
                                        return (
                                          <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-amber-600">
                                            <AlertCircle className="h-3 w-3 shrink-0" />
                                            Service due in {(nextNum - curNum).toLocaleString()} km
                                          </p>
                                        );
                                      }
                                      return null;
                                    })()}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </section>

                  <section className="hidden">
                    <h3 className="mb-4 text-sm font-extrabold text-slate-900">General Information</h3>
                  <div className="flex items-center space-x-3 pb-4 border-b border-gray-100">
                    <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center">
                      <Truck className="h-6 w-6 text-[#1e3a8a]" />
                    </div>
                    <div>
                      <h4 className="text-base font-semibold text-gray-900">{selectedEquipment.vecNo || "-"}</h4>
                      <p className="text-sm text-gray-500">{selectedEquipment.regNo}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm lg:grid-cols-2">
                    <div className="flex justify-between border-b border-gray-100 pb-2">
                      <span className="text-gray-500">Type:</span>
                      <span className="text-gray-900 font-medium">
                        {isMissingEquipmentValue(selectedEquipment.equipment) ? "Not specified" : selectedEquipment.equipment}
                      </span>
                    </div>
                    {selectedEquipment.containerLength ? (
                      <div className="flex justify-between border-b border-gray-100 pb-2">
                        <span className="text-gray-500">Container Length:</span>
                        <span className="font-medium text-gray-900">{selectedEquipment.containerLength}</span>
                      </div>
                    ) : null}
                    {selectedEquipment.axleConfiguration ? (
                      <div className="flex justify-between border-b border-gray-100 pb-2">
                        <span className="text-gray-500">Axle Configuration:</span>
                        <span className="font-medium text-gray-900">{selectedEquipment.axleConfiguration}</span>
                      </div>
                    ) : null}
                    <div className="flex justify-between border-b border-gray-100 pb-2">
                      <span className="text-gray-500">Brand:</span>
                      <span className="text-gray-900 font-medium">{selectedEquipment.brand}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-100 pb-2">
                      <span className="text-gray-500">Model:</span>
                      <span className="text-gray-900 font-medium">{selectedEquipment.model}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-100 pb-2">
                      <span className="text-gray-500">Year:</span>
                      <span className="text-gray-900 font-medium">{selectedEquipment.year || "-"}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-100 pb-2">
                      <span className="text-gray-500">Mileage:</span>
                      <span className="text-gray-900 font-medium">{selectedEquipment.mileage}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-100 pb-2">
                      <span className="text-gray-500">Company:</span>
                      <span className="text-gray-900 font-medium">{selectedEquipment.companyName || selectedEquipment.owner}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-100 pb-2">
                      <span className="text-gray-500">Chassis No.:</span>
                      <span className="text-gray-900 font-medium">{selectedEquipment.chassisNo || "-"}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-100 pb-2">
                      <span className="text-gray-500">Engine No.:</span>
                      <span className="text-gray-900 font-medium">{selectedEquipment.engineNo || "-"}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-100 pb-2">
                      <span className="text-gray-500">Insurance Expiry:</span>
                      <span className="text-gray-900 font-medium">{selectedEquipment.insurance || "-"}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-100 pb-2">
                      <span className="text-gray-500">Road Tax Expiry:</span>
                      <span className="text-gray-900 font-medium">{selectedEquipment.roadTax || "-"}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-100 pb-2">
                      <span className="text-gray-500">Puspakom Expiry:</span>
                      <span className="text-gray-900 font-medium">{selectedEquipment.puspakom || "-"}</span>
                    </div>
                    {selectedEquipment.autocountProjectNo ? (
                      <div className="flex justify-between border-b border-gray-100 pb-2">
                        <span className="text-gray-500">AutoCount Project / Ref:</span>
                        <span className="font-mono text-xs font-bold text-sky-800">{selectedEquipment.autocountProjectNo}</span>
                      </div>
                    ) : null}
                    <div className="flex justify-between border-b border-gray-100 pb-2">
                      <span className="text-gray-500">Last Service:</span>
                      <span className="text-gray-900 font-medium">
                        {selectedEquipment.lastServiceDate || "-"}
                        {selectedEquipment.lastServiceMileage ? ` · ${selectedEquipment.lastServiceMileage.toLocaleString()} km` : ""}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-gray-100 pb-2">
                      <span className="text-gray-500">Next Service:</span>
                      <span className="text-gray-900 font-medium">
                        {selectedEquipment.nextServiceDate || "-"}
                        {selectedEquipment.nextServiceMileage ? ` · ${selectedEquipment.nextServiceMileage.toLocaleString()} km` : ""}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-gray-100 pb-2">
                      <span className="text-gray-500">Verification:</span>
                      <span className={`px-2.5 py-0.5 text-xs rounded-full font-semibold ${
                        (selectedEquipment.verificationStatus || "approved") === "pending"
                          ? "bg-amber-100 text-amber-800"
                          : selectedEquipment.verificationStatus === "rejected"
                          ? "bg-red-100 text-red-800"
                          : "bg-green-100 text-green-800"
                      }`}>
                        {(selectedEquipment.verificationStatus || "approved").toUpperCase()}
                      </span>
                    </div>
                    {selectedEquipment.rejectionReason && (
                      <div className="flex justify-between gap-4 border-b border-gray-100 pb-2">
                        <span className="text-gray-500">Rejection Reason:</span>
                        <span className="text-right text-red-700 font-medium">{selectedEquipment.rejectionReason}</span>
                      </div>
                    )}
                    {selectedEquipment.reviewedAt && (
                      <div className="flex justify-between border-b border-gray-100 pb-2">
                        <span className="text-gray-500">Reviewed At:</span>
                        <span className="text-gray-900 font-medium">{selectedEquipment.reviewedAt}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-b border-gray-100 pb-2">
                      <span className="text-gray-500">Vehicle Status:</span>
                      <span className="text-gray-900 font-medium">{getEffectiveVehicleStatus(selectedEquipment)}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-100 pb-2">
                      <span className="text-gray-500">Vehicle Condition:</span>
                      <span className={`px-2.5 py-0.5 text-xs rounded-full font-semibold ${
                        selectedEquipment.status === "Pending Verification"
                          ? "bg-amber-100 text-amber-800"
                          : selectedEquipment.status === "Excellent"
                          ? "bg-green-100 text-green-800"
                          : selectedEquipment.status === "Good"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-red-100 text-red-800"
                      }`}>
                        {selectedEquipment.status}
                      </span>
                    </div>
                  </div>
                  </section>

                  {renderComplianceDocumentsSection()}

                  {renderVehicleServiceHistorySection()}

                  {canReview && (selectedEquipment.verificationStatus || "approved") === "pending" ? <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Vehicle verification
                    </label>
                    <textarea
                      value={reviewReason}
                      onChange={(e) => setReviewReason(e.target.value)}
                      placeholder="Required when rejecting a vehicle"
                      rows={3}
                      className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => void handleReviewVehicle("approved")}
                        disabled={isReviewing}
                        className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-40"
                      >
                        {isReviewing ? "Saving..." : "Approve"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleReviewVehicle("rejected")}
                        disabled={isReviewing}
                        className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40"
                      >
                        Reject
                      </button>
                    </div>
                  </div> : null}
                  {formError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {formError}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <section className="rounded-2xl border border-slate-200 bg-white shadow-2xs [&_label]:mb-1 [&_label]:text-[11px] [&_label]:font-bold [&_label]:normal-case [&_label]:tracking-normal [&_label]:text-slate-700 [&_input]:h-10 [&_input]:rounded-xl [&_input]:border-slate-200 [&_input]:px-3.5 [&_input]:text-xs [&_input]:shadow-2xs">
                    <div className="flex items-start gap-3 rounded-t-2xl border-b border-slate-100 bg-white px-5 py-3.5"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><Truck className="h-4 w-4" /></div><div><h3 className="text-sm font-bold text-slate-900">1. Vehicle profile</h3><p className="mt-0.5 text-xs text-slate-500">Fleet identity and operational workshop details.</p></div></div>
                  <div className="space-y-4 p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Equipment Type *</label>
                      <AdminSelect
                        value={form.equipment}
                        onChange={(e) => {
                          const equipment = e.target.value;
                          setForm((current) => ({
                            ...current,
                            equipment,
                            ...(equipment === "Container Chassis / Skeletal Trailer"
                              ? { mileage: "", engineNo: "" }
                              : { containerLength: "", axleConfiguration: "" }),
                            ...(equipment !== "Prime Mover" ? { engineNo: "" } : {}),
                          }));
                        }}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        <option value="" disabled>Select Equipment Type</option>
                        {form.equipment && !fleetEquipmentTypes.includes(form.equipment) ? (
                          <option value={form.equipment}>{form.equipment} (Legacy type — please update)</option>
                        ) : null}
                        {fleetEquipmentTypes.map((equipmentType) => (
                          <option key={equipmentType} value={equipmentType}>{equipmentType}</option>
                        ))}
                      </AdminSelect>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Vehicle Status *</label>
                      <AdminSelect
                        value={form.vehicleStatus}
                        onChange={(e) => setForm({ ...form, vehicleStatus: e.target.value as VehicleStatus })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        {vehicleStatuses.map((status) => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </AdminSelect>
                      {selectedEquipment?.verificationStatus === "rejected" ? (
                        <p className="mt-1 text-[11px] text-blue-600 font-medium">
                          Re-verifying: Click "Save & Approve" to activate, or "Save as Pending" to queue for review.
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Unit / Fleet Number</label>
                      <input
                        type="text"
                        maxLength={50}
                        placeholder="e.g. DEMO-UNIT-001"
                        value={form.vecNo}
                        onChange={(e) => setForm({ ...form, vecNo: e.target.value.toUpperCase() })}
                        onBlur={() => setForm((current) => ({ ...current, vecNo: current.vecNo.trim().toUpperCase() }))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <p className="mt-1 text-xs text-gray-500">Optional internal unit number, for example DEMO-UNIT-001.</p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Registration / Plate No. *</label>
                      <input
                        type="text"
                        placeholder="e.g. WKL 1234"
                        value={form.regNo}
                        onChange={(e) => setForm({ ...form, regNo: e.target.value.toUpperCase() })}
                        onBlur={() => setForm((current) => ({ ...current, regNo: current.regNo.trim().toUpperCase() }))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Manufacture Year</label>
                      <input
                        type="number"
                        min={1900}
                        max={new Date().getFullYear() + 1}
                        step={1}
                        placeholder="e.g. 2020"
                        value={form.year}
                        onChange={(e) => setForm({ ...form, year: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                        Brand / Manufacturer
                        <span className={`inline-block w-2 ${isPrimeMover ? "" : "invisible"}`} aria-hidden="true"> *</span>
                      </label>
                      <AdminCombobox
                        ariaLabel="Choose or enter a vehicle brand"
                        placeholder={isContainerChassis ? "Optional local or custom manufacturer" : "e.g. Volvo Trucks"}
                        value={form.brand}
                        onChange={(value) => setForm({
                          ...form,
                          brand: canonicalizeBrand(value, brandSuggestions),
                        })}
                        options={brandSuggestions}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                        Model / Series
                        <span className={`inline-block w-2 ${isPrimeMover ? "" : "invisible"}`} aria-hidden="true"> *</span>
                      </label>
                      <AdminCombobox
                        ariaLabel="Choose or enter a vehicle model"
                        placeholder={
                          isPrimeMover
                            ? "e.g. FH16, FMX, G450, Quester, GIGA"
                            : isContainerChassis
                              ? "e.g. 3-Axle Skeletal Chassis"
                              : "Optional model or series"
                        }
                        value={form.model}
                        onChange={(value) => setForm({
                          ...form,
                          model: canonicalizeSuggestion(value, modelSuggestions),
                        })}
                        options={modelSuggestions}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  {isContainerChassis ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Container Length *</label>
                        <AdminSelect
                          value={form.containerLength}
                          onChange={(e) => setForm({ ...form, containerLength: e.target.value })}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        >
                          <option value="">-- Select Container Length --</option>
                          {containerLengths.map((length) => (
                            <option key={length} value={length}>{length}</option>
                          ))}
                        </AdminSelect>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Axle Configuration *</label>
                        <AdminSelect
                          value={form.axleConfiguration}
                          onChange={(e) => setForm({ ...form, axleConfiguration: e.target.value })}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        >
                          <option value="">-- Select Axle Configuration --</option>
                          {axleConfigurations.map((configuration) => (
                            <option key={configuration} value={configuration}>{configuration}</option>
                          ))}
                        </AdminSelect>
                      </div>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {showMileage ? (
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Current Mileage</label>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          step={1}
                          placeholder="e.g. 125000"
                          value={form.mileage}
                          onChange={(e) => {
                            if (/^\d*$/.test(e.target.value)) setForm({ ...form, mileage: e.target.value });
                          }}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    ) : null}
                    <div className={showMileage ? "" : "sm:col-span-2"}>
                      <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Chassis / VIN No.</label>
                      <input
                        type="text"
                        placeholder="Optional"
                        value={form.chassisNo}
                        onChange={(e) => setForm({ ...form, chassisNo: e.target.value.toUpperCase() })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {showEngineNumber ? (
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Engine No.</label>
                        <input
                          type="text"
                          placeholder="Optional"
                          value={form.engineNo}
                          onChange={(e) => setForm({ ...form, engineNo: e.target.value.toUpperCase() })}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    ) : null}
                    <div className={showEngineNumber ? "" : "sm:col-span-2"}>
                      <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Company *</label>
                      <AdminSelect
                        value={form.companyId}
                        onChange={(e) => {
                          const companyId = Number(e.target.value);
                          setForm({ ...form, companyId });
                        }}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        <option value={0}>-- Select Company --</option>
                        {companiesData.map((comp) => (
                          <option key={comp.id} value={comp.id}>
                            {comp.name}
                          </option>
                        ))}
                      </AdminSelect>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-700 uppercase tracking-wider mb-1">Insurance Expiry</label>
                      <DesktopDatePicker
                        value={form.insurance || ""}
                        onChange={(value) => setForm({ ...form, insurance: value })}
                        ariaLabel="Choose insurance expiry date"
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs shadow-2xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-700 uppercase tracking-wider mb-1">Road Tax Expiry</label>
                      <DesktopDatePicker
                        value={form.roadTax || ""}
                        onChange={(value) => setForm({ ...form, roadTax: value })}
                        ariaLabel="Choose road tax expiry date"
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs shadow-2xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-700 uppercase tracking-wider mb-1">Puspakom Expiry</label>
                      <DesktopDatePicker
                        value={form.puspakom || ""}
                        onChange={(value) => setForm({ ...form, puspakom: value })}
                        ariaLabel="Choose PUSPAKOM expiry date"
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs shadow-2xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-100"
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="mb-3">
                      <h3 className="text-sm font-semibold text-gray-900">Service Information</h3>
                      <p className="mt-0.5 text-xs text-gray-500">
                        Optional history and the next recommended service interval.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-3">
                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-700">Last Service Date</label>
                          <DesktopDatePicker
                            value={form.lastServiceDate}
                            onChange={(value) => setForm({ ...form, lastServiceDate: value })}
                            ariaLabel="Choose last service date"
                            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs shadow-2xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-100"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-700">Last Service Mileage</label>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            step={1}
                            placeholder="e.g. 100000"
                            value={form.lastServiceMileage}
                            onChange={(event) => {
                              if (/^\d*$/.test(event.target.value)) {
                                setForm({ ...form, lastServiceMileage: event.target.value });
                              }
                            }}
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-700">Next Service Date</label>
                          <DesktopDatePicker
                            value={form.nextServiceDate}
                            onChange={(value) => setForm({ ...form, nextServiceDate: value })}
                            ariaLabel="Choose next service date"
                            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs shadow-2xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-100"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-700">Next Service Mileage</label>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            step={1}
                            placeholder="e.g. 120000"
                            value={form.nextServiceMileage}
                            onChange={(event) => {
                              if (/^\d*$/.test(event.target.value)) {
                                setForm({ ...form, nextServiceMileage: event.target.value });
                              }
                            }}
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {formError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {formError}
                    </div>
                  )}
                  </div>
                </section>

                {/* Compliance documents also visible and manageable in edit mode */}
                {selectedEquipment ? renderComplianceDocumentsSection() : null}
                </div>
              )}
            </div>

            {modalMode === "create" && (
              <div className="flex flex-col-reverse gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <p className="text-xs text-slate-500">
                  <span className="font-bold text-red-500">*</span> Required fields must be completed
                </p>
                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="h-10 rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => void handleSubmitEquipment(false)}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1e3a8a] px-6 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    <Save className="h-4 w-4" />
                    {isSaving ? "Saving..." : "Create Vehicle"}
                  </button>
                </div>
              </div>
            )}

            {!isStandaloneVehiclePage ? (
            <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-white px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
              <p className="text-xs text-slate-500">{modalMode !== "view" ? <><span className="font-bold text-red-500">*</span> Required fields must be completed</> : null}</p>
              <div className="flex items-center justify-end gap-2.5">
              {modalMode === "view" && canUpdate && selectedEquipment ? (
                <button
                  type="button"
                  onClick={() => openEditModal(selectedEquipment)}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#1e3a8a] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-800"
                >
                  <Edit className="h-4 w-4" />
                  {selectedEquipment.verificationStatus === "rejected" ? "Edit & Re-verify" : "Edit Vehicle"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={closeModal}
                className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                Close
              </button>
              {modalMode === "edit" &&
                (selectedEquipment?.verificationStatus === "pending" || selectedEquipment?.verificationStatus === "rejected") &&
                canReview && (
                <button
                  type="button"
                  onClick={() => void handleSubmitEquipment(true)}
                  disabled={isSaving}
                  className="rounded-lg bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {isSaving ? "Saving..." : "Save & Approve"}
                </button>
              )}
              {modalMode !== "view" && (
                <button
                  type="button"
                  onClick={() => void handleSubmitEquipment(false)}
                  disabled={isSaving}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#1e3a8a] px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-800 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {isSaving
                    ? "Saving..."
                    : modalMode === "create"
                    ? "Create Vehicle"
                    : selectedEquipment?.verificationStatus === "rejected"
                    ? "Save as Pending"
                    : "Save Changes"}
                </button>
              )}
              </div>
            </div>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
