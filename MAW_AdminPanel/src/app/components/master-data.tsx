import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router";
import {
  Wrench,
  Truck,
  Package,
  Layers,
  Search,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  Filter,
  RefreshCw,
  Database,
  Building2,
  Clock,
  DollarSign,
  Boxes,
  FileSpreadsheet,
  HelpCircle,
  Receipt,
  CalendarClock,
  Warehouse,
  MapPin,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { AdminMetricCard } from "./ui/admin-metric-card";
import { AdminSelect } from "./ui/admin-select";
import { AdminPagination } from "./ui/admin-pagination";
import { SortableHeader, compareValues } from "./ui/sortable-header";
import { useLanguage } from "../contexts/language-context";
import { useConfirmationDialog } from "../contexts/confirmation-dialog-context";
import {
  AdminFormDialog,
  AdminFormDialogHeader,
  AdminFormDialogBody,
  AdminFormDialogFooter,
  AdminFormSection,
  AdminDialogPrimaryButton,
  AdminDialogCancelButton,
  adminFieldClass,
  adminLabelClass,
  adminTextareaClass,
} from "./ui/admin-form-dialog";

export type MasterDataType = "services" | "vehicles" | "parts" | "erp" | "taxes" | "terms" | "bays" | "bins";

export interface ServiceItem {
  id: string;
  code: string;
  name: string;
  category: "Preventive Maintenance" | "Repair & Overhaul" | "Inspection" | "Diagnostics";
  estimatedHours: number;
  basePrice: number;
  totalPrice?: number;
  enabled: boolean;
  description: string;
}

export interface VehicleSpecItem {
  id: string;
  code: string;
  name: string;
  type: "Equipment Type" | "Make / Brand" | "Axle Configuration";
  inspectionMonths: number;
  enabled: boolean;
  description: string;
}

export interface PartsTaxonomyItem {
  id: string;
  code: string;
  name: string;
  type: "Parts Category" | "Unit of Measure (UOM)";
  autocountMapCode: string;
  enabled: boolean;
  description: string;
}

export interface ErpProjectItem {
  id: string;
  projectNo: string;
  description: string;
  debtorCode: string;
  status: "Active" | "Inactive";
  linkedVehiclesCount: number;
  lastSync: string;
}

export interface TaxCodeItem {
  id: string;
  code: string;
  name: string;
  rate: number;
  category: "Labour" | "Parts" | "All";
  autocountTaxCode: string;
  isDefault: boolean;
  enabled: boolean;
  description: string;
}

export interface PaymentTermItem {
  id: string;
  code: string;
  name: string;
  days: number;
  autocountTermCode: string;
  isDefault: boolean;
  enabled: boolean;
  description: string;
}

export interface WorkshopBayItem {
  id: string;
  code: string;
  name: string;
  type: "Pit" | "Heavy Overhaul" | "Alignment & Tyre" | "Brake & Air" | "General";
  hasPit: boolean;
  maxTonnage: number;
  status: "Available" | "Occupied" | "Maintenance";
  enabled: boolean;
  description: string;
}

export interface BinLocationItem {
  id: string;
  code: string;
  name: string;
  zone: string;
  warehouse: string;
  binType: "Shelf Rack" | "Heavy Pallet" | "Small Bin" | "Bulk Drum";
  enabled: boolean;
  description: string;
}

const STORAGE_KEY = "maw_master_data_entries_v1";

export const DEFAULT_SERVICES: ServiceItem[] = [
  { id: "svc-1", code: "SRV-PM-01", name: "Periodic Maintenance Service (A)", category: "Preventive Maintenance", estimatedHours: 2.5, totalPrice: 280, basePrice: 280, enabled: true, description: "Engine oil change, oil filter, multi-point 36 inspection check." },
  { id: "svc-2", code: "SRV-PM-02", name: "Major Maintenance Service (B)", category: "Preventive Maintenance", estimatedHours: 4.5, totalPrice: 650, basePrice: 650, enabled: true, description: "Complete fluid flush, all filters, differential and gearbox service." },
  { id: "svc-3", code: "SRV-BRK-01", name: "Brake Lining & Drum Overhaul", category: "Repair & Overhaul", estimatedHours: 3.5, totalPrice: 420, basePrice: 420, enabled: true, description: "Complete axle brake shoe relining, drum resurfacing and adjustment." },
  { id: "svc-4", code: "SRV-SUS-01", name: "Leaf Spring & Bushing Repair", category: "Repair & Overhaul", estimatedHours: 4.0, totalPrice: 500, basePrice: 500, enabled: true, description: "Leaf spring assembly inspection, bushing replacement and U-bolt torque." },
  { id: "svc-5", code: "SRV-ENG-01", name: "Engine Diagnostic & Electronic Scan", category: "Diagnostics", estimatedHours: 1.5, totalPrice: 220, basePrice: 220, enabled: true, description: "ECU sensor diagnostics, fault code clearance and harness test." },
  { id: "svc-6", code: "SRV-INS-01", name: "Pre-PUSPAKOM Inspection & Preparation", category: "Inspection", estimatedHours: 3.0, totalPrice: 350, basePrice: 350, enabled: true, description: "Roller brake test preparation, smoke test, side slip and lighting checks." },
  { id: "svc-7", code: "SRV-TYR-01", name: "Wheel Alignment & High-Speed Balancing", category: "Preventive Maintenance", estimatedHours: 2.0, totalPrice: 260, basePrice: 260, enabled: true, description: "Multi-axle toe-in alignment, camber check and wheel balance." },
  { id: "svc-8", code: "SRV-AIR-01", name: "Heavy Vehicle A/C System Service", category: "Repair & Overhaul", estimatedHours: 3.0, totalPrice: 380, basePrice: 380, enabled: true, description: "Refrigerant recovery, vacuum test, compressor inspection and filter replacement." },
];

export const DEFAULT_VEHICLE_SPECS: VehicleSpecItem[] = [
  { id: "vsp-1", code: "EQ-PM", name: "Prime Mover (Tractor Head)", type: "Equipment Type", inspectionMonths: 6, enabled: true, description: "Commercial heavy tractor unit for long-haul semi-trailer haulage." },
  { id: "vsp-2", code: "EQ-TR40", name: "40' Flatbed / Skeletal Trailer", type: "Equipment Type", inspectionMonths: 6, enabled: true, description: "Standard container chassis and general cargo flatbed trailer." },
  { id: "vsp-3", code: "EQ-TR20", name: "20' Container Skeleton Trailer", type: "Equipment Type", inspectionMonths: 6, enabled: true, description: "Single 20-foot shipping container chassis." },
  { id: "vsp-4", code: "EQ-RIGID", name: "Rigid Lorry (Box / Wooden Body)", type: "Equipment Type", inspectionMonths: 6, enabled: true, description: "Medium-duty rigid truck for city and domestic distribution." },
  { id: "vsp-5", code: "EQ-TIPPER", name: "Dump Truck / Tipper Lorry", type: "Equipment Type", inspectionMonths: 6, enabled: true, description: "Hydraulic tipper vehicle for aggregate, earthwork and sand haulage." },
  { id: "vsp-6", code: "MK-VOLVO", name: "Volvo Trucks", type: "Make / Brand", inspectionMonths: 6, enabled: true, description: "Swedish heavy commercial vehicle manufacturer (FM, FH, FMX series)." },
  { id: "vsp-7", code: "MK-SCANIA", name: "Scania", type: "Make / Brand", inspectionMonths: 6, enabled: true, description: "Swedish commercial vehicle brand (P, G, R, S Series cabs)." },
  { id: "vsp-8", code: "MK-HINO", name: "Hino Motors", type: "Make / Brand", inspectionMonths: 6, enabled: true, description: "Japanese truck brand (300, 500, 700 Series)." },
  { id: "vsp-9", code: "MK-ISUZU", name: "Isuzu Commercial", type: "Make / Brand", inspectionMonths: 6, enabled: true, description: "Japanese commercial brand (ELF, Forward, Giga series)." },
  { id: "vsp-10", code: "AX-4X2", name: "4x2 (Single Steer, Single Drive)", type: "Axle Configuration", inspectionMonths: 6, enabled: true, description: "Standard two-axle configuration for local and regional delivery." },
  { id: "vsp-11", code: "AX-6X2", name: "6x2 (Single Steer, Pusher/Tag Axle)", type: "Axle Configuration", inspectionMonths: 6, enabled: true, description: "Three-axle vehicle with lifting axle for fuel saving." },
  { id: "vsp-12", code: "AX-6X4", name: "6x4 (Single Steer, Double Drive Tandem)", type: "Axle Configuration", inspectionMonths: 6, enabled: true, description: "Heavy-duty three-axle configuration for heavy container haulage." },
];

export const DEFAULT_PARTS_TAXONOMY: PartsTaxonomyItem[] = [
  { id: "ptx-1", code: "CAT-OIL", name: "Oils, Lubricants & Greases", type: "Parts Category", autocountMapCode: "ITEM-LUB", enabled: true, description: "Engine oil, hydraulic oil, gear lube, wheel bearing grease." },
  { id: "ptx-2", code: "CAT-FLT", name: "Filters (Oil, Fuel, Air, Cabin)", type: "Parts Category", autocountMapCode: "ITEM-FLT", enabled: true, description: "Spin-on oil filters, primary/secondary fuel water separators, air elements." },
  { id: "ptx-3", code: "CAT-BRK", name: "Braking System Components", type: "Parts Category", autocountMapCode: "ITEM-BRK", enabled: true, description: "Brake linings, drums, slack adjusters, brake chambers and air valves." },
  { id: "ptx-4", code: "CAT-ENG", name: "Engine & Drivetrain Spare Parts", type: "Parts Category", autocountMapCode: "ITEM-ENG", enabled: true, description: "Pistons, liners, gaskets, turbos, injectors, belts and tensioners." },
  { id: "ptx-5", code: "CAT-SUS", name: "Suspension, Axle & Steering", type: "Parts Category", autocountMapCode: "ITEM-SUS", enabled: true, description: "Leaf springs, air bellows, shock absorbers, tie rod ends and king pins." },
  { id: "ptx-6", code: "CAT-ELE", name: "Electrical, Lighting & Batteries", type: "Parts Category", autocountMapCode: "ITEM-ELE", enabled: true, description: "Heavy-duty commercial batteries, alternators, starter motors, LED lamps." },
  { id: "ptx-7", code: "UOM-PCS", name: "Piece / Each (PCS)", type: "Unit of Measure (UOM)", autocountMapCode: "PCS", enabled: true, description: "Standard single-item count unit." },
  { id: "ptx-8", code: "UOM-SET", name: "Set / Kit (SET)", type: "Unit of Measure (UOM)", autocountMapCode: "SET", enabled: true, description: "Paired or packaged repair kits (e.g. brake kit, overhaul gasket set)." },
  { id: "ptx-9", code: "UOM-DRUM", name: "Drum 200L (DRUM)", type: "Unit of Measure (UOM)", autocountMapCode: "DRUM", enabled: true, description: "Standard 200-litre bulk commercial oil drum." },
  { id: "ptx-10", code: "UOM-LTR", name: "Litre (LTR)", type: "Unit of Measure (UOM)", autocountMapCode: "LTR", enabled: true, description: "Liquid volumetric measurement for oil and coolant dispensing." },
  { id: "ptx-11", code: "UOM-BOX", name: "Box (BOX)", type: "Unit of Measure (UOM)", autocountMapCode: "BOX", enabled: true, description: "Standard carton or boxed component package." },
];

export const DEFAULT_ERP_PROJECTS: ErpProjectItem[] = [
  { id: "erp-1", projectNo: "PRJ-MEWAH-MAIN", description: "Mewah Main Workshop Fleet Operations", debtorCode: "300-M0001", status: "Active", linkedVehiclesCount: 24, lastSync: "2026-09-05 10:45" },
  { id: "erp-2", projectNo: "PRJ-SWIFTLOG-JB", description: "Swift Haulage Logistics South Fleet", debtorCode: "300-S0012", status: "Active", linkedVehiclesCount: 16, lastSync: "2026-09-05 09:30" },
  { id: "erp-3", projectNo: "PRJ-SINAR-TRANS", description: "Sinar Bulk Transportation Contract", debtorCode: "300-S0045", status: "Active", linkedVehiclesCount: 9, lastSync: "2026-09-04 17:15" },
  { id: "erp-4", projectNo: "PRJ-SOUTHERN-PM", description: "Southern Container Port Shuttle Fleet", debtorCode: "300-S0089", status: "Active", linkedVehiclesCount: 12, lastSync: "2026-09-04 16:00" },
  { id: "erp-5", projectNo: "PRJ-RETAIL-WALK", description: "Walk-in & Ad-hoc Workshop Customers", debtorCode: "300-W0001", status: "Active", linkedVehiclesCount: 0, lastSync: "2026-09-03 14:20" },
];

export const DEFAULT_TAX_CODES: TaxCodeItem[] = [
  { id: "tax-1", code: "SV-8", name: "Service Tax 8% (Labour & Service)", rate: 8.0, category: "Labour", autocountTaxCode: "SV-8", isDefault: true, enabled: true, description: "Standard Malaysian Service Tax 8% on commercial vehicle maintenance and labour." },
  { id: "tax-2", code: "SV-6", name: "Service Tax 6% (Grandfathered / Special)", rate: 6.0, category: "Labour", autocountTaxCode: "SV-6", isDefault: false, enabled: true, description: "Legacy 6% service tax rate for specific transition period billing." },
  { id: "tax-3", code: "TX-10", name: "Sales Tax 10% (General Goods / Consumables)", rate: 10.0, category: "Parts", autocountTaxCode: "TX-10", isDefault: false, enabled: true, description: "Sales tax rate on taxable spare parts, workshop consumables and grease." },
  { id: "tax-4", code: "ZRL", name: "Zero Rated 0% (Export / Free Zone Haulage)", rate: 0.0, category: "All", autocountTaxCode: "ZRL", isDefault: false, enabled: true, description: "Zero-rated 0% supplies for bonded warehouse and cross-border Singapore logistics." },
  { id: "tax-5", code: "EXEMPT", name: "Tax Exempt 0% (Non-taxable Direct Supply)", rate: 0.0, category: "All", autocountTaxCode: "EXEMPT", isDefault: false, enabled: true, description: "Non-taxable or exempt scope workshop charges." },
];

export const DEFAULT_PAYMENT_TERMS: PaymentTermItem[] = [
  { id: "trm-1", code: "COD", name: "Cash On Delivery (Immediate Payment)", days: 0, autocountTermCode: "C.O.D.", isDefault: false, enabled: true, description: "Immediate settlement upon work completion or delivery of parts." },
  { id: "trm-2", code: "NET 30", name: "30 Days Credit Term", days: 30, autocountTermCode: "30 DAYS", isDefault: true, enabled: true, description: "Standard commercial credit term for fleet contract accounts (30 days from invoice)." },
  { id: "trm-3", code: "NET 60", name: "60 Days Extended Credit", days: 60, autocountTermCode: "60 DAYS", isDefault: false, enabled: true, description: "Corporate fleet accounts with approved 60-day billing cycle." },
  { id: "trm-4", code: "NET 90", name: "90 Days Extended Credit", days: 90, autocountTermCode: "90 DAYS", isDefault: false, enabled: true, description: "Long-term institutional or government logistics contracts." },
  { id: "trm-5", code: "EOM", name: "End of Month (30 Days)", days: 30, autocountTermCode: "E.O.M.", isDefault: false, enabled: true, description: "Due on the last day of the following calendar month." },
];

export const DEFAULT_WORKSHOP_BAYS: WorkshopBayItem[] = [
  { id: "bay-1", code: "Bay 1", name: "Bay 1", type: "Pit", hasPit: true, maxTonnage: 45, status: "Available", enabled: true, description: "Underground lubrication and quick inspection pit" },
  { id: "bay-2", code: "Bay 2", name: "Bay 2", type: "Pit", hasPit: true, maxTonnage: 45, status: "Available", enabled: true, description: "Secondary lubrication and fluid service pit" },
  { id: "bay-3", code: "Bay 3", name: "Bay 3", type: "General", hasPit: false, maxTonnage: 45, status: "Available", enabled: true, description: "Standard repair and maintenance bay" },
  { id: "bay-4", code: "Bay 4", name: "Bay 4", type: "General", hasPit: false, maxTonnage: 45, status: "Available", enabled: true, description: "Diagnostics and general servicing bay" },
  { id: "bay-5", code: "Engine Bay", name: "Engine Bay", type: "Heavy Overhaul", hasPit: false, maxTonnage: 50, status: "Available", enabled: true, description: "Heavy tractor engine and gearbox teardown bay with hoist" },
  { id: "bay-6", code: "Trailer Bay", name: "Trailer Bay", type: "Alignment & Tyre", hasPit: true, maxTonnage: 55, status: "Available", enabled: true, description: "Trailer chassis, axle and laser alignment bay" },
];

export const DEFAULT_BIN_LOCATIONS: BinLocationItem[] = [
  { id: "bin-1", code: "A-R01-01", name: "Oil & Fuel Filter Rack Level 1", zone: "Zone A (Filters & Lubes)", warehouse: "Main Workshop Store", binType: "Shelf Rack", enabled: true, description: "Spin-on oil filters and primary fuel water separators for Volvo & Scania." },
  { id: "bin-2", code: "A-R01-02", name: "Air Cleaner Element Upper Shelf", zone: "Zone A (Filters & Lubes)", warehouse: "Main Workshop Store", binType: "Shelf Rack", enabled: true, description: "Heavy-duty cylindrical primary and secondary air filter cartridges." },
  { id: "bin-3", code: "B-DRM-01", name: "Brake Lining & Shoe Bins", zone: "Zone B (Braking & Drums)", warehouse: "Main Workshop Store", binType: "Small Bin", enabled: true, description: "Axle brake shoe kits, rivets, slack adjusters and return springs." },
  { id: "bin-4", code: "C-ENG-01", name: "Engine Gaskets & Injector Bin", zone: "Zone C (Engine & Transmission)", warehouse: "Main Workshop Store", binType: "Small Bin", enabled: true, description: "Cylinder head gaskets, turbocharger rebuild kits and electronic unit injectors." },
  { id: "bin-5", code: "D-PLT-01", name: "Heavy Brake Drums & Hubs Pallet", zone: "Zone D (Heavy Pallets & Tyres)", warehouse: "Main Yard Pallet Deck", binType: "Heavy Pallet", enabled: true, description: "Ground pallet space for cast iron 10-hole brake drums and wheel hub assemblies." },
  { id: "bin-6", code: "D-OIL-01", name: "200L Commercial Oil Drum Bay", zone: "Zone A (Filters & Lubes)", warehouse: "Main Yard Pallet Deck", binType: "Bulk Drum", enabled: true, description: "15W-40 CI-4/CK-4 engine oil and 85W-140 differential gear oil bulk dispensing zone." },
];

// Helper readers for consuming modules (e.g. Invoices, Quotations, Work Orders)
export function getMasterTaxCodes(): TaxCodeItem[] {
  try {
    const saved = localStorage.getItem(`${STORAGE_KEY}_taxes`);
    return saved ? JSON.parse(saved) : DEFAULT_TAX_CODES;
  } catch {
    return DEFAULT_TAX_CODES;
  }
}

export function getMasterPaymentTerms(): PaymentTermItem[] {
  try {
    const saved = localStorage.getItem(`${STORAGE_KEY}_terms`);
    return saved ? JSON.parse(saved) : DEFAULT_PAYMENT_TERMS;
  } catch {
    return DEFAULT_PAYMENT_TERMS;
  }
}

export function getMasterWorkshopBays(): WorkshopBayItem[] {
  try {
    const saved = localStorage.getItem(`${STORAGE_KEY}_bays`);
    return saved ? JSON.parse(saved) : DEFAULT_WORKSHOP_BAYS;
  } catch {
    return DEFAULT_WORKSHOP_BAYS;
  }
}

export function getMasterBinLocations(): BinLocationItem[] {
  try {
    const saved = localStorage.getItem(`${STORAGE_KEY}_bins`);
    return saved ? JSON.parse(saved) : DEFAULT_BIN_LOCATIONS;
  } catch {
    return DEFAULT_BIN_LOCATIONS;
  }
}

export function MasterData() {
  const { t } = useLanguage();
  const confirmationDialog = useConfirmationDialog();

  const [activeTab, setActiveTab] = useState<MasterDataType>("services");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedStatus, setSelectedStatus] = useState<"All" | "Active" | "Inactive">("All");

  // Sorting and pagination state
  const [sortKey, setSortKey] = useState<string | null>("code");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Master Data collections with localStorage persistence
  const [services, setServices] = useState<ServiceItem[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_services`);
      return saved ? JSON.parse(saved) : DEFAULT_SERVICES;
    } catch {
      return DEFAULT_SERVICES;
    }
  });

  const [vehicleSpecs, setVehicleSpecs] = useState<VehicleSpecItem[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_vehicles`);
      return saved ? JSON.parse(saved) : DEFAULT_VEHICLE_SPECS;
    } catch {
      return DEFAULT_VEHICLE_SPECS;
    }
  });

  const [partsTaxonomy, setPartsTaxonomy] = useState<PartsTaxonomyItem[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_parts`);
      return saved ? JSON.parse(saved) : DEFAULT_PARTS_TAXONOMY;
    } catch {
      return DEFAULT_PARTS_TAXONOMY;
    }
  });

  const [erpProjects, setErpProjects] = useState<ErpProjectItem[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_erp`);
      return saved ? JSON.parse(saved) : DEFAULT_ERP_PROJECTS;
    } catch {
      return DEFAULT_ERP_PROJECTS;
    }
  });

  const [taxCodes, setTaxCodes] = useState<TaxCodeItem[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_taxes`);
      return saved ? JSON.parse(saved) : DEFAULT_TAX_CODES;
    } catch {
      return DEFAULT_TAX_CODES;
    }
  });

  const [paymentTerms, setPaymentTerms] = useState<PaymentTermItem[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_terms`);
      return saved ? JSON.parse(saved) : DEFAULT_PAYMENT_TERMS;
    } catch {
      return DEFAULT_PAYMENT_TERMS;
    }
  });

  const [workshopBays, setWorkshopBays] = useState<WorkshopBayItem[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_bays`);
      return saved ? JSON.parse(saved) : DEFAULT_WORKSHOP_BAYS;
    } catch {
      return DEFAULT_WORKSHOP_BAYS;
    }
  });

  const [binLocations, setBinLocations] = useState<BinLocationItem[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_bins`);
      return saved ? JSON.parse(saved) : DEFAULT_BIN_LOCATIONS;
    } catch {
      return DEFAULT_BIN_LOCATIONS;
    }
  });

  // Modal form states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    categoryOrType: "",
    estimatedHours: "1.0",
    basePrice: "100.00",
    inspectionMonths: "6",
    autocountMapCode: "",
    debtorCode: "",
    rate: "8.0",
    days: "30",
    hasPit: true,
    maxTonnage: "45",
    bayStatus: "Available" as "Available" | "Occupied" | "Maintenance",
    warehouse: "Main Workshop Store",
    zone: "Zone A (Filters & Lubes)",
    description: "",
    enabled: true,
  });

  // Save changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE_KEY}_services`, JSON.stringify(services));
      localStorage.setItem(`${STORAGE_KEY}_vehicles`, JSON.stringify(vehicleSpecs));
      localStorage.setItem(`${STORAGE_KEY}_parts`, JSON.stringify(partsTaxonomy));
      localStorage.setItem(`${STORAGE_KEY}_erp`, JSON.stringify(erpProjects));
      localStorage.setItem(`${STORAGE_KEY}_taxes`, JSON.stringify(taxCodes));
      localStorage.setItem(`${STORAGE_KEY}_terms`, JSON.stringify(paymentTerms));
      localStorage.setItem(`${STORAGE_KEY}_bays`, JSON.stringify(workshopBays));
      localStorage.setItem(`${STORAGE_KEY}_bins`, JSON.stringify(binLocations));
    } catch {}
  }, [services, vehicleSpecs, partsTaxonomy, erpProjects, taxCodes, paymentTerms, workshopBays, binLocations]);

  // Tab change handler
  const handleTabChange = (tab: MasterDataType) => {
    setActiveTab(tab);
    setSearchTerm("");
    setSelectedCategory("All");
    setSelectedStatus("All");
    setSortKey("code");
    setSortDirection("asc");
    setPage(1);
  };

  // Header sort handler
  const handleSort = (key: string) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDirection("asc");
      setPage(1);
    } else if (sortDirection === "asc") {
      setSortDirection("desc");
      setPage(1);
    } else {
      setSortKey(null);
      setSortDirection("asc");
      setPage(1);
    }
  };

  // Filtered entries for current tab
  const filteredData = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();

    if (activeTab === "services") {
      return services
        .filter((item) => {
          const matchSearch =
            !q ||
            item.code.toLowerCase().includes(q) ||
            item.name.toLowerCase().includes(q) ||
            item.description.toLowerCase().includes(q);
          const matchCat = selectedCategory === "All" || item.category === selectedCategory;
          const matchStatus =
            selectedStatus === "All" ||
            (selectedStatus === "Active" && item.enabled) ||
            (selectedStatus === "Inactive" && !item.enabled);
          return matchSearch && matchCat && matchStatus;
        })
        .sort((a, b) => {
          if (!sortKey) return 0;
          let aVal: any = "";
          let bVal: any = "";
          if (sortKey === "code") { aVal = a.code; bVal = b.code; }
          else if (sortKey === "name") { aVal = a.name; bVal = b.name; }
          else if (sortKey === "category") { aVal = a.category; bVal = b.category; }
          else if (sortKey === "hours") { aVal = a.estimatedHours; bVal = b.estimatedHours; }
          else if (sortKey === "price") { aVal = a.basePrice; bVal = b.basePrice; }
          else if (sortKey === "status") { aVal = a.enabled ? 1 : 0; bVal = b.enabled ? 1 : 0; }
          return compareValues(aVal, bVal, sortDirection);
        });
    }

    if (activeTab === "vehicles") {
      return vehicleSpecs
        .filter((item) => {
          const matchSearch =
            !q ||
            item.code.toLowerCase().includes(q) ||
            item.name.toLowerCase().includes(q) ||
            item.description.toLowerCase().includes(q);
          const matchCat = selectedCategory === "All" || item.type === selectedCategory;
          const matchStatus =
            selectedStatus === "All" ||
            (selectedStatus === "Active" && item.enabled) ||
            (selectedStatus === "Inactive" && !item.enabled);
          return matchSearch && matchCat && matchStatus;
        })
        .sort((a, b) => {
          if (!sortKey) return 0;
          let aVal: any = "";
          let bVal: any = "";
          if (sortKey === "code") { aVal = a.code; bVal = b.code; }
          else if (sortKey === "name") { aVal = a.name; bVal = b.name; }
          else if (sortKey === "category") { aVal = a.type; bVal = b.type; }
          else if (sortKey === "interval") { aVal = a.inspectionMonths; bVal = b.inspectionMonths; }
          else if (sortKey === "status") { aVal = a.enabled ? 1 : 0; bVal = b.enabled ? 1 : 0; }
          return compareValues(aVal, bVal, sortDirection);
        });
    }

    if (activeTab === "parts") {
      return partsTaxonomy
        .filter((item) => {
          const matchSearch =
            !q ||
            item.code.toLowerCase().includes(q) ||
            item.name.toLowerCase().includes(q) ||
            item.autocountMapCode.toLowerCase().includes(q) ||
            item.description.toLowerCase().includes(q);
          const matchCat = selectedCategory === "All" || item.type === selectedCategory;
          const matchStatus =
            selectedStatus === "All" ||
            (selectedStatus === "Active" && item.enabled) ||
            (selectedStatus === "Inactive" && !item.enabled);
          return matchSearch && matchCat && matchStatus;
        })
        .sort((a, b) => {
          if (!sortKey) return 0;
          let aVal: any = "";
          let bVal: any = "";
          if (sortKey === "code") { aVal = a.code; bVal = b.code; }
          else if (sortKey === "name") { aVal = a.name; bVal = b.name; }
          else if (sortKey === "category") { aVal = a.type; bVal = b.type; }
          else if (sortKey === "erpCode") { aVal = a.autocountMapCode; bVal = b.autocountMapCode; }
          else if (sortKey === "status") { aVal = a.enabled ? 1 : 0; bVal = b.enabled ? 1 : 0; }
          return compareValues(aVal, bVal, sortDirection);
        });
    }

    if (activeTab === "taxes") {
      return taxCodes
        .filter((item) => {
          const matchSearch =
            !q ||
            item.code.toLowerCase().includes(q) ||
            item.name.toLowerCase().includes(q) ||
            item.autocountTaxCode.toLowerCase().includes(q) ||
            item.description.toLowerCase().includes(q);
          const matchCat = selectedCategory === "All" || item.category === selectedCategory;
          const matchStatus =
            selectedStatus === "All" ||
            (selectedStatus === "Active" && item.enabled) ||
            (selectedStatus === "Inactive" && !item.enabled);
          return matchSearch && matchCat && matchStatus;
        })
        .sort((a, b) => {
          if (!sortKey) return 0;
          let aVal: any = "";
          let bVal: any = "";
          if (sortKey === "code") { aVal = a.code; bVal = b.code; }
          else if (sortKey === "name") { aVal = a.name; bVal = b.name; }
          else if (sortKey === "rate") { aVal = a.rate; bVal = b.rate; }
          else if (sortKey === "category") { aVal = a.category; bVal = b.category; }
          else if (sortKey === "erpCode") { aVal = a.autocountTaxCode; bVal = b.autocountTaxCode; }
          else if (sortKey === "status") { aVal = a.enabled ? 1 : 0; bVal = b.enabled ? 1 : 0; }
          return compareValues(aVal, bVal, sortDirection);
        });
    }

    if (activeTab === "terms") {
      return paymentTerms
        .filter((item) => {
          const matchSearch =
            !q ||
            item.code.toLowerCase().includes(q) ||
            item.name.toLowerCase().includes(q) ||
            item.autocountTermCode.toLowerCase().includes(q) ||
            item.description.toLowerCase().includes(q);
          const matchStatus =
            selectedStatus === "All" ||
            (selectedStatus === "Active" && item.enabled) ||
            (selectedStatus === "Inactive" && !item.enabled);
          return matchSearch && matchStatus;
        })
        .sort((a, b) => {
          if (!sortKey) return 0;
          let aVal: any = "";
          let bVal: any = "";
          if (sortKey === "code") { aVal = a.code; bVal = b.code; }
          else if (sortKey === "name") { aVal = a.name; bVal = b.name; }
          else if (sortKey === "days") { aVal = a.days; bVal = b.days; }
          else if (sortKey === "erpCode") { aVal = a.autocountTermCode; bVal = b.autocountTermCode; }
          else if (sortKey === "status") { aVal = a.enabled ? 1 : 0; bVal = b.enabled ? 1 : 0; }
          return compareValues(aVal, bVal, sortDirection);
        });
    }

    if (activeTab === "bays") {
      return workshopBays
        .filter((item) => {
          const matchSearch =
            !q ||
            item.code.toLowerCase().includes(q) ||
            item.name.toLowerCase().includes(q) ||
            item.description.toLowerCase().includes(q);
          const matchCat = selectedCategory === "All" || item.type === selectedCategory;
          const matchStatus =
            selectedStatus === "All" ||
            (selectedStatus === "Active" && item.enabled) ||
            (selectedStatus === "Inactive" && !item.enabled);
          return matchSearch && matchCat && matchStatus;
        })
        .sort((a, b) => {
          if (!sortKey) return 0;
          let aVal: any = "";
          let bVal: any = "";
          if (sortKey === "code") { aVal = a.code; bVal = b.code; }
          else if (sortKey === "name") { aVal = a.name; bVal = b.name; }
          else if (sortKey === "category") { aVal = a.type; bVal = b.type; }
          else if (sortKey === "tonnage") { aVal = a.maxTonnage; bVal = b.maxTonnage; }
          else if (sortKey === "bayStatus") { aVal = a.status; bVal = b.status; }
          else if (sortKey === "status") { aVal = a.enabled ? 1 : 0; bVal = b.enabled ? 1 : 0; }
          return compareValues(aVal, bVal, sortDirection);
        });
    }

    if (activeTab === "bins") {
      return binLocations
        .filter((item) => {
          const matchSearch =
            !q ||
            item.code.toLowerCase().includes(q) ||
            item.name.toLowerCase().includes(q) ||
            item.zone.toLowerCase().includes(q) ||
            item.warehouse.toLowerCase().includes(q) ||
            item.description.toLowerCase().includes(q);
          const matchCat = selectedCategory === "All" || item.binType === selectedCategory;
          const matchStatus =
            selectedStatus === "All" ||
            (selectedStatus === "Active" && item.enabled) ||
            (selectedStatus === "Inactive" && !item.enabled);
          return matchSearch && matchCat && matchStatus;
        })
        .sort((a, b) => {
          if (!sortKey) return 0;
          let aVal: any = "";
          let bVal: any = "";
          if (sortKey === "code") { aVal = a.code; bVal = b.code; }
          else if (sortKey === "name") { aVal = a.name; bVal = b.name; }
          else if (sortKey === "category") { aVal = a.binType; bVal = b.binType; }
          else if (sortKey === "zone") { aVal = a.zone; bVal = b.zone; }
          else if (sortKey === "status") { aVal = a.enabled ? 1 : 0; bVal = b.enabled ? 1 : 0; }
          return compareValues(aVal, bVal, sortDirection);
        });
    }

    // ERP Projects
    return erpProjects
      .filter((item) => {
        const matchSearch =
          !q ||
          item.projectNo.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.debtorCode.toLowerCase().includes(q);
        const matchStatus =
          selectedStatus === "All" ||
          (selectedStatus === "Active" && item.status === "Active") ||
          (selectedStatus === "Inactive" && item.status === "Inactive");
        return matchSearch && matchStatus;
      })
      .sort((a, b) => {
        if (!sortKey) return 0;
        let aVal: any = "";
        let bVal: any = "";
        if (sortKey === "code") { aVal = a.projectNo; bVal = b.projectNo; }
        else if (sortKey === "name") { aVal = a.description; bVal = b.description; }
        else if (sortKey === "debtor") { aVal = a.debtorCode; bVal = b.debtorCode; }
        else if (sortKey === "vehicles") { aVal = a.linkedVehiclesCount; bVal = b.linkedVehiclesCount; }
        else if (sortKey === "status") { aVal = a.status; bVal = b.status; }
        return compareValues(aVal, bVal, sortDirection);
      });
  }, [activeTab, services, vehicleSpecs, partsTaxonomy, erpProjects, taxCodes, paymentTerms, workshopBays, binLocations, searchTerm, selectedCategory, selectedStatus, sortKey, sortDirection]);

  // Paginated records
  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleData = useMemo(() => {
    return filteredData.slice((safePage - 1) * pageSize, safePage * pageSize);
  }, [filteredData, safePage, pageSize]);

  // Metric counts
  const serviceCount = services.filter((s) => s.enabled).length;
  const vehicleCount = vehicleSpecs.filter((v) => v.enabled).length;
  const partsCount = partsTaxonomy.filter((p) => p.enabled).length;
  const erpCount = erpProjects.filter((e) => e.status === "Active").length;
  const taxCount = taxCodes.filter((t) => t.enabled).length;
  const termCount = paymentTerms.filter((t) => t.enabled).length;
  const bayCount = workshopBays.filter((b) => b.enabled).length;
  const binCount = binLocations.filter((b) => b.enabled).length;

  // Toggle status inline
  const handleToggleStatus = (id: string) => {
    if (activeTab === "services") {
      setServices((prev) =>
        prev.map((item) => (item.id === id ? { ...item, enabled: !item.enabled } : item))
      );
      toast.success("Service status updated.");
    } else if (activeTab === "vehicles") {
      setVehicleSpecs((prev) =>
        prev.map((item) => (item.id === id ? { ...item, enabled: !item.enabled } : item))
      );
      toast.success("Vehicle specification status updated.");
    } else if (activeTab === "parts") {
      setPartsTaxonomy((prev) =>
        prev.map((item) => (item.id === id ? { ...item, enabled: !item.enabled } : item))
      );
      toast.success("Parts taxonomy status updated.");
    } else if (activeTab === "taxes") {
      setTaxCodes((prev) =>
        prev.map((item) => (item.id === id ? { ...item, enabled: !item.enabled } : item))
      );
      toast.success("Tax code status updated.");
    } else if (activeTab === "terms") {
      setPaymentTerms((prev) =>
        prev.map((item) => (item.id === id ? { ...item, enabled: !item.enabled } : item))
      );
      toast.success("Payment term status updated.");
    } else if (activeTab === "bays") {
      setWorkshopBays((prev) =>
        prev.map((item) => (item.id === id ? { ...item, enabled: !item.enabled } : item))
      );
      toast.success("Workshop bay status updated.");
    } else if (activeTab === "bins") {
      setBinLocations((prev) =>
        prev.map((item) => (item.id === id ? { ...item, enabled: !item.enabled } : item))
      );
      toast.success("Bin location status updated.");
    } else {
      setErpProjects((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, status: item.status === "Active" ? "Inactive" : "Active" } : item
        )
      );
      toast.success("ERP Project status updated.");
    }
  };

  // Delete item handler
  const handleDeleteItem = async (id: string, name: string) => {
    const confirmed = await confirmationDialog({
      title: "Delete Master Data Entry?",
      description: `Are you sure you want to delete "${name}"? This action cannot be undone.`,
      confirmLabel: "Delete Entry",
      tone: "danger",
    });
    if (!confirmed) return;

    if (activeTab === "services") {
      setServices((prev) => prev.filter((item) => item.id !== id));
    } else if (activeTab === "vehicles") {
      setVehicleSpecs((prev) => prev.filter((item) => item.id !== id));
    } else if (activeTab === "parts") {
      setPartsTaxonomy((prev) => prev.filter((item) => item.id !== id));
    } else if (activeTab === "taxes") {
      setTaxCodes((prev) => prev.filter((item) => item.id !== id));
    } else if (activeTab === "terms") {
      setPaymentTerms((prev) => prev.filter((item) => item.id !== id));
    } else if (activeTab === "bays") {
      setWorkshopBays((prev) => prev.filter((item) => item.id !== id));
    } else if (activeTab === "bins") {
      setBinLocations((prev) => prev.filter((item) => item.id !== id));
    } else {
      setErpProjects((prev) => prev.filter((item) => item.id !== id));
    }
    toast.success(`Entry "${name}" deleted.`);
  };

  // Open Add/Edit Modal
  const openAddModal = () => {
    setEditingItem(null);
    setFormData({
      code: "",
      name: "",
      categoryOrType:
        activeTab === "services"
          ? "Preventive Maintenance"
          : activeTab === "vehicles"
            ? "Equipment Type"
            : activeTab === "parts"
              ? "Parts Category"
              : activeTab === "taxes"
                ? "Labour"
                : activeTab === "bays"
                  ? "Pit"
                  : activeTab === "bins"
                    ? "Shelf Rack"
                    : "",
      estimatedHours: "1.0",
      basePrice: "100.00",
      inspectionMonths: "6",
      autocountMapCode: "",
      debtorCode: "",
      rate: "8.0",
      days: "30",
      hasPit: true,
      maxTonnage: "45",
      bayStatus: "Available",
      warehouse: "Main Workshop Store",
      zone: "Zone A (Filters & Lubes)",
      description: "",
      enabled: true,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (item: any) => {
    setEditingItem(item);
    if (activeTab === "services") {
      setFormData({
        code: item.code,
        name: item.name,
        categoryOrType: item.category,
        estimatedHours: String(item.estimatedHours),
        basePrice: String(item.basePrice),
        inspectionMonths: "6",
        autocountMapCode: "",
        debtorCode: "",
        rate: "8.0",
        days: "30",
        hasPit: true,
        maxTonnage: "45",
        bayStatus: "Available",
        warehouse: "Main Workshop Store",
        zone: "Zone A (Filters & Lubes)",
        description: item.description || "",
        enabled: item.enabled,
      });
    } else if (activeTab === "vehicles") {
      setFormData({
        code: item.code,
        name: item.name,
        categoryOrType: item.type,
        estimatedHours: "1.0",
        basePrice: "100.00",
        inspectionMonths: String(item.inspectionMonths),
        autocountMapCode: "",
        debtorCode: "",
        rate: "8.0",
        days: "30",
        hasPit: true,
        maxTonnage: "45",
        bayStatus: "Available",
        warehouse: "Main Workshop Store",
        zone: "Zone A (Filters & Lubes)",
        description: item.description || "",
        enabled: item.enabled,
      });
    } else if (activeTab === "parts") {
      setFormData({
        code: item.code,
        name: item.name,
        categoryOrType: item.type,
        estimatedHours: "1.0",
        basePrice: "100.00",
        inspectionMonths: "6",
        autocountMapCode: item.autocountMapCode || "",
        debtorCode: "",
        rate: "8.0",
        days: "30",
        hasPit: true,
        maxTonnage: "45",
        bayStatus: "Available",
        warehouse: "Main Workshop Store",
        zone: "Zone A (Filters & Lubes)",
        description: item.description || "",
        enabled: item.enabled,
      });
    } else if (activeTab === "taxes") {
      setFormData({
        code: item.code,
        name: item.name,
        categoryOrType: item.category,
        estimatedHours: "1.0",
        basePrice: "100.00",
        inspectionMonths: "6",
        autocountMapCode: item.autocountTaxCode || "",
        debtorCode: "",
        rate: String(item.rate),
        days: "30",
        hasPit: true,
        maxTonnage: "45",
        bayStatus: "Available",
        warehouse: "Main Workshop Store",
        zone: "Zone A (Filters & Lubes)",
        description: item.description || "",
        enabled: item.enabled,
      });
    } else if (activeTab === "terms") {
      setFormData({
        code: item.code,
        name: item.name,
        categoryOrType: "",
        estimatedHours: "1.0",
        basePrice: "100.00",
        inspectionMonths: "6",
        autocountMapCode: item.autocountTermCode || "",
        debtorCode: "",
        rate: "8.0",
        days: String(item.days),
        hasPit: true,
        maxTonnage: "45",
        bayStatus: "Available",
        warehouse: "Main Workshop Store",
        zone: "Zone A (Filters & Lubes)",
        description: item.description || "",
        enabled: item.enabled,
      });
    } else if (activeTab === "bays") {
      setFormData({
        code: item.code,
        name: item.name,
        categoryOrType: item.type,
        estimatedHours: "1.0",
        basePrice: "100.00",
        inspectionMonths: "6",
        autocountMapCode: "",
        debtorCode: "",
        rate: "8.0",
        days: "30",
        hasPit: Boolean(item.hasPit),
        maxTonnage: String(item.maxTonnage || 45),
        bayStatus: item.status || "Available",
        warehouse: "Main Workshop Store",
        zone: "Zone A (Filters & Lubes)",
        description: item.description || "",
        enabled: item.enabled,
      });
    } else if (activeTab === "bins") {
      setFormData({
        code: item.code,
        name: item.name,
        categoryOrType: item.binType,
        estimatedHours: "1.0",
        basePrice: "100.00",
        inspectionMonths: "6",
        autocountMapCode: "",
        debtorCode: "",
        rate: "8.0",
        days: "30",
        hasPit: true,
        maxTonnage: "45",
        bayStatus: "Available",
        warehouse: item.warehouse || "Main Workshop Store",
        zone: item.zone || "Zone A (Filters & Lubes)",
        description: item.description || "",
        enabled: item.enabled,
      });
    } else {
      setFormData({
        code: item.projectNo,
        name: item.description,
        categoryOrType: "",
        estimatedHours: "1.0",
        basePrice: "100.00",
        inspectionMonths: "6",
        autocountMapCode: "",
        debtorCode: item.debtorCode || "",
        rate: "8.0",
        days: "30",
        hasPit: true,
        maxTonnage: "45",
        bayStatus: "Available",
        warehouse: "Main Workshop Store",
        zone: "Zone A (Filters & Lubes)",
        description: "",
        enabled: item.status === "Active",
      });
    }
    setIsModalOpen(true);
  };

  const handleSaveModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code.trim() || !formData.name.trim()) {
      toast.error("Code and Name are required fields.");
      return;
    }

    if (activeTab === "services") {
      if (editingItem) {
        setServices((prev) =>
          prev.map((item) =>
            item.id === editingItem.id
              ? {
                  ...item,
                  code: formData.code.trim().toUpperCase(),
                  name: formData.name.trim(),
                  category: formData.categoryOrType as any,
                  estimatedHours: parseFloat(formData.estimatedHours) || 1.0,
                  basePrice: parseFloat(formData.basePrice) || 0,
                  description: formData.description.trim(),
                  enabled: formData.enabled,
                }
              : item
          )
        );
        toast.success("Service updated successfully.");
      } else {
        const newItem: ServiceItem = {
          id: `svc-${Date.now()}`,
          code: formData.code.trim().toUpperCase(),
          name: formData.name.trim(),
          category: (formData.categoryOrType || "Preventive Maintenance") as any,
          estimatedHours: parseFloat(formData.estimatedHours) || 1.0,
          basePrice: parseFloat(formData.basePrice) || 0,
          description: formData.description.trim(),
          enabled: formData.enabled,
        };
        setServices((prev) => [newItem, ...prev]);
        toast.success("New service entry created.");
      }
    } else if (activeTab === "vehicles") {
      if (editingItem) {
        setVehicleSpecs((prev) =>
          prev.map((item) =>
            item.id === editingItem.id
              ? {
                  ...item,
                  code: formData.code.trim().toUpperCase(),
                  name: formData.name.trim(),
                  type: formData.categoryOrType as any,
                  inspectionMonths: parseInt(formData.inspectionMonths, 10) || 6,
                  description: formData.description.trim(),
                  enabled: formData.enabled,
                }
              : item
          )
        );
        toast.success("Vehicle specification updated.");
      } else {
        const newItem: VehicleSpecItem = {
          id: `vsp-${Date.now()}`,
          code: formData.code.trim().toUpperCase(),
          name: formData.name.trim(),
          type: (formData.categoryOrType || "Equipment Type") as any,
          inspectionMonths: parseInt(formData.inspectionMonths, 10) || 6,
          description: formData.description.trim(),
          enabled: formData.enabled,
        };
        setVehicleSpecs((prev) => [newItem, ...prev]);
        toast.success("New vehicle specification created.");
      }
    } else if (activeTab === "parts") {
      if (editingItem) {
        setPartsTaxonomy((prev) =>
          prev.map((item) =>
            item.id === editingItem.id
              ? {
                  ...item,
                  code: formData.code.trim().toUpperCase(),
                  name: formData.name.trim(),
                  type: formData.categoryOrType as any,
                  autocountMapCode: formData.autocountMapCode.trim().toUpperCase(),
                  description: formData.description.trim(),
                  enabled: formData.enabled,
                }
              : item
          )
        );
        toast.success("Parts taxonomy updated.");
      } else {
        const newItem: PartsTaxonomyItem = {
          id: `ptx-${Date.now()}`,
          code: formData.code.trim().toUpperCase(),
          name: formData.name.trim(),
          type: (formData.categoryOrType || "Parts Category") as any,
          autocountMapCode: formData.autocountMapCode.trim().toUpperCase(),
          description: formData.description.trim(),
          enabled: formData.enabled,
        };
        setPartsTaxonomy((prev) => [newItem, ...prev]);
        toast.success("New parts taxonomy entry created.");
      }
    } else if (activeTab === "taxes") {
      if (editingItem) {
        setTaxCodes((prev) =>
          prev.map((item) =>
            item.id === editingItem.id
              ? {
                  ...item,
                  code: formData.code.trim().toUpperCase(),
                  name: formData.name.trim(),
                  category: (formData.categoryOrType || "Labour") as any,
                  rate: parseFloat(formData.rate) || 0,
                  autocountTaxCode: (formData.autocountMapCode || formData.code).trim().toUpperCase(),
                  description: formData.description.trim(),
                  enabled: formData.enabled,
                }
              : item
          )
        );
        toast.success("Tax code updated.");
      } else {
        const newItem: TaxCodeItem = {
          id: `tax-${Date.now()}`,
          code: formData.code.trim().toUpperCase(),
          name: formData.name.trim(),
          category: (formData.categoryOrType || "Labour") as any,
          rate: parseFloat(formData.rate) || 0,
          autocountTaxCode: (formData.autocountMapCode || formData.code).trim().toUpperCase(),
          isDefault: false,
          description: formData.description.trim(),
          enabled: formData.enabled,
        };
        setTaxCodes((prev) => [newItem, ...prev]);
        toast.success("New tax code created.");
      }
    } else if (activeTab === "terms") {
      if (editingItem) {
        setPaymentTerms((prev) =>
          prev.map((item) =>
            item.id === editingItem.id
              ? {
                  ...item,
                  code: formData.code.trim().toUpperCase(),
                  name: formData.name.trim(),
                  days: parseInt(formData.days, 10) || 0,
                  autocountTermCode: (formData.autocountMapCode || formData.code).trim(),
                  description: formData.description.trim(),
                  enabled: formData.enabled,
                }
              : item
          )
        );
        toast.success("Payment term updated.");
      } else {
        const newItem: PaymentTermItem = {
          id: `trm-${Date.now()}`,
          code: formData.code.trim().toUpperCase(),
          name: formData.name.trim(),
          days: parseInt(formData.days, 10) || 0,
          autocountTermCode: (formData.autocountMapCode || formData.code).trim(),
          isDefault: false,
          description: formData.description.trim(),
          enabled: formData.enabled,
        };
        setPaymentTerms((prev) => [newItem, ...prev]);
        toast.success("New payment term created.");
      }
    } else if (activeTab === "bays") {
      if (editingItem) {
        setWorkshopBays((prev) =>
          prev.map((item) =>
            item.id === editingItem.id
              ? {
                  ...item,
                  code: formData.code.trim().toUpperCase(),
                  name: formData.name.trim(),
                  type: (formData.categoryOrType || "Pit") as any,
                  hasPit: formData.hasPit,
                  maxTonnage: parseFloat(formData.maxTonnage) || 45,
                  status: formData.bayStatus,
                  description: formData.description.trim(),
                  enabled: formData.enabled,
                }
              : item
          )
        );
        toast.success("Workshop bay updated.");
      } else {
        const newItem: WorkshopBayItem = {
          id: `bay-${Date.now()}`,
          code: formData.code.trim().toUpperCase(),
          name: formData.name.trim(),
          type: (formData.categoryOrType || "Pit") as any,
          hasPit: formData.hasPit,
          maxTonnage: parseFloat(formData.maxTonnage) || 45,
          status: formData.bayStatus,
          description: formData.description.trim(),
          enabled: formData.enabled,
        };
        setWorkshopBays((prev) => [newItem, ...prev]);
        toast.success("New workshop bay created.");
      }
    } else if (activeTab === "bins") {
      if (editingItem) {
        setBinLocations((prev) =>
          prev.map((item) =>
            item.id === editingItem.id
              ? {
                  ...item,
                  code: formData.code.trim().toUpperCase(),
                  name: formData.name.trim(),
                  binType: (formData.categoryOrType || "Shelf Rack") as any,
                  zone: formData.zone.trim(),
                  warehouse: formData.warehouse.trim(),
                  description: formData.description.trim(),
                  enabled: formData.enabled,
                }
              : item
          )
        );
        toast.success("Bin location updated.");
      } else {
        const newItem: BinLocationItem = {
          id: `bin-${Date.now()}`,
          code: formData.code.trim().toUpperCase(),
          name: formData.name.trim(),
          binType: (formData.categoryOrType || "Shelf Rack") as any,
          zone: formData.zone.trim(),
          warehouse: formData.warehouse.trim(),
          description: formData.description.trim(),
          enabled: formData.enabled,
        };
        setBinLocations((prev) => [newItem, ...prev]);
        toast.success("New bin location created.");
      }
    } else {
      // ERP Projects
      if (editingItem) {
        setErpProjects((prev) =>
          prev.map((item) =>
            item.id === editingItem.id
              ? {
                  ...item,
                  projectNo: formData.code.trim().toUpperCase(),
                  description: formData.name.trim(),
                  debtorCode: formData.debtorCode.trim().toUpperCase(),
                  status: formData.enabled ? "Active" : "Inactive",
                }
              : item
          )
        );
        toast.success("ERP Project mapping updated.");
      } else {
        const newItem: ErpProjectItem = {
          id: `erp-${Date.now()}`,
          projectNo: formData.code.trim().toUpperCase(),
          description: formData.name.trim(),
          debtorCode: formData.debtorCode.trim().toUpperCase(),
          status: formData.enabled ? "Active" : "Inactive",
          linkedVehiclesCount: 0,
          lastSync: "Manual Entry",
        };
        setErpProjects((prev) => [newItem, ...prev]);
        toast.success("New ERP project mapping created.");
      }
    }

    setIsModalOpen(false);
  };

  return (
    <div className="w-full space-y-4">
      {/* Top Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Master Data</h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-[#1e3a8a] border border-blue-200/60">
              <Database className="h-3 w-3" />
              Central Taxonomy & Rules
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Standardized workshop services, heavy fleet specifications, tax codes, payment terms, workshop bays and AutoCount ERP mappings.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/suppliers"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-slate-300 transition-all cursor-pointer"
          >
            <Building2 className="h-3.5 w-3.5 text-slate-500" />
            <span>Suppliers Master</span>
          </Link>
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#1e3a8a] px-4 text-xs font-bold text-white shadow-sm hover:bg-blue-900 transition-all cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Entry</span>
          </button>
        </div>
      </div>

      {/* Summary Metric Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <AdminMetricCard
          label="Services"
          value={serviceCount}
          detail="Active packages"
          icon={Wrench}
          iconClassName="bg-blue-50 text-blue-700"
          onClick={() => handleTabChange("services")}
        />
        <AdminMetricCard
          label="Vehicle Specs"
          value={vehicleCount}
          detail="Body & brands"
          icon={Truck}
          iconClassName="bg-indigo-50 text-indigo-700"
          onClick={() => handleTabChange("vehicles")}
        />
        <AdminMetricCard
          label="Parts Taxonomy"
          value={partsCount}
          detail="Cats & UOM"
          icon={Package}
          iconClassName="bg-amber-50 text-amber-700"
          onClick={() => handleTabChange("parts")}
        />
        <AdminMetricCard
          label="ERP Projects"
          value={erpCount}
          detail="AutoCount jobs"
          icon={Layers}
          iconClassName="bg-emerald-50 text-emerald-700"
          onClick={() => handleTabChange("erp")}
        />
        <AdminMetricCard
          label="Tax Codes"
          value={taxCount}
          detail="SST & rates"
          icon={Receipt}
          iconClassName="bg-purple-50 text-purple-700"
          onClick={() => handleTabChange("taxes")}
        />
        <AdminMetricCard
          label="Credit Terms"
          value={termCount}
          detail="Billing terms"
          icon={CalendarClock}
          iconClassName="bg-cyan-50 text-cyan-700"
          onClick={() => handleTabChange("terms")}
        />
        <AdminMetricCard
          label="Workshop Bays"
          value={bayCount}
          detail="Pits & hoists"
          icon={Warehouse}
          iconClassName="bg-orange-50 text-orange-700"
          onClick={() => handleTabChange("bays")}
        />
        <AdminMetricCard
          label="Bin Locations"
          value={binCount}
          detail="Storage racks"
          icon={Boxes}
          iconClassName="bg-rose-50 text-rose-700"
          onClick={() => handleTabChange("bins")}
        />
      </div>

      {/* Navigation Tab Bar & Quick Search */}
      <div className="relative z-20 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Tabs */}
          <div className="inline-flex flex-wrap items-center rounded-xl bg-slate-100 p-1 border border-slate-200/80">
            <button
              type="button"
              onClick={() => handleTabChange("services")}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                activeTab === "services"
                  ? "bg-white text-[#1e3a8a] shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Wrench className="h-3.5 w-3.5" />
              <span>Workshop Services</span>
              <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] font-semibold text-slate-600">
                {services.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleTabChange("vehicles")}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                activeTab === "vehicles"
                  ? "bg-white text-[#1e3a8a] shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Truck className="h-3.5 w-3.5" />
              <span>Vehicle Specs</span>
              <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] font-semibold text-slate-600">
                {vehicleSpecs.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleTabChange("parts")}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                activeTab === "parts"
                  ? "bg-white text-[#1e3a8a] shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Package className="h-3.5 w-3.5" />
              <span>Parts & UOM</span>
              <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] font-semibold text-slate-600">
                {partsTaxonomy.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleTabChange("erp")}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                activeTab === "erp"
                  ? "bg-white text-[#1e3a8a] shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>ERP & Projects</span>
              <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] font-semibold text-slate-600">
                {erpProjects.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleTabChange("taxes")}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                activeTab === "taxes"
                  ? "bg-white text-[#1e3a8a] shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Receipt className="h-3.5 w-3.5" />
              <span>Tax Codes (SST)</span>
              <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] font-semibold text-slate-600">
                {taxCodes.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleTabChange("terms")}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                activeTab === "terms"
                  ? "bg-white text-[#1e3a8a] shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <CalendarClock className="h-3.5 w-3.5" />
              <span>Payment Terms</span>
              <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] font-semibold text-slate-600">
                {paymentTerms.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleTabChange("bays")}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                activeTab === "bays"
                  ? "bg-white text-[#1e3a8a] shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Warehouse className="h-3.5 w-3.5" />
              <span>Workshop Bays</span>
              <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] font-semibold text-slate-600">
                {workshopBays.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleTabChange("bins")}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                activeTab === "bins"
                  ? "bg-white text-[#1e3a8a] shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Boxes className="h-3.5 w-3.5" />
              <span>Bin Locations</span>
              <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] font-semibold text-slate-600">
                {binLocations.length}
              </span>
            </button>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px] sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder={`Search ${activeTab}...`}
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-9 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none"
              />
            </div>

            {/* Subcategory Filter (if applicable) */}
            {activeTab !== "erp" && activeTab !== "terms" ? (
              <div className="w-40">
                <AdminSelect
                  value={selectedCategory}
                  onChange={(e) => {
                    setSelectedCategory(e.target.value);
                    setPage(1);
                  }}
                  className="h-9 text-xs"
                >
                  <option value="All">All Categories</option>
                  {activeTab === "services" ? (
                    <>
                      <option value="Preventive Maintenance">Preventive Maint.</option>
                      <option value="Repair & Overhaul">Repair & Overhaul</option>
                      <option value="Diagnostics">Diagnostics</option>
                      <option value="Inspection">Inspection</option>
                    </>
                  ) : activeTab === "vehicles" ? (
                    <>
                      <option value="Equipment Type">Equipment Types</option>
                      <option value="Make / Brand">Makes & Brands</option>
                      <option value="Axle Configuration">Axle Configs</option>
                    </>
                  ) : activeTab === "parts" ? (
                    <>
                      <option value="Parts Category">Parts Categories</option>
                      <option value="Unit of Measure (UOM)">UOM Standards</option>
                    </>
                  ) : activeTab === "taxes" ? (
                    <>
                      <option value="Labour">Labour Taxes</option>
                      <option value="Parts">Parts Taxes</option>
                      <option value="All">All Supplies</option>
                    </>
                  ) : activeTab === "bays" ? (
                    <>
                      <option value="Pit">Inspection Pits</option>
                      <option value="Heavy Overhaul">Heavy Overhaul</option>
                      <option value="Alignment & Tyre">Laser Alignment</option>
                      <option value="Brake & Air">Air Brake Station</option>
                      <option value="General">General Bays</option>
                    </>
                  ) : activeTab === "bins" ? (
                    <>
                      <option value="Shelf Rack">Shelf Racks</option>
                      <option value="Heavy Pallet">Heavy Pallets</option>
                      <option value="Small Bin">Small Bins</option>
                      <option value="Bulk Drum">Bulk Drums</option>
                    </>
                  ) : null}
                </AdminSelect>
              </div>
            ) : null}

            {/* Status Filter */}
            <div className="w-32">
              <AdminSelect
                value={selectedStatus}
                onChange={(e) => {
                  setSelectedStatus(e.target.value as any);
                  setPage(1);
                }}
                className="h-9 text-xs"
              >
                <option value="All">All Status</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </AdminSelect>
            </div>
          </div>
        </div>
      </div>

      {/* Main Master Data Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-100 bg-slate-50/80 text-[11px] font-extrabold uppercase tracking-wider text-slate-600">
              <tr>
                <SortableHeader
                  columnKey="code"
                  currentSortKey={sortKey}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                  className="px-5 py-3.5"
                >
                  {activeTab === "erp" ? "Project No" : "Code"}
                </SortableHeader>

                <SortableHeader
                  columnKey="name"
                  currentSortKey={sortKey}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                  className="px-5 py-3.5"
                >
                  {activeTab === "erp" ? "Description" : "Name / Title"}
                </SortableHeader>

                {activeTab === "services" ? (
                  <>
                    <SortableHeader
                      columnKey="category"
                      currentSortKey={sortKey}
                      currentDirection={sortDirection}
                      onSort={handleSort}
                      className="px-5 py-3.5"
                    >
                      Category
                    </SortableHeader>
                    <SortableHeader
                      columnKey="hours"
                      currentSortKey={sortKey}
                      currentDirection={sortDirection}
                      onSort={handleSort}
                      className="px-5 py-3.5 text-right"
                    >
                      Est. Hours
                    </SortableHeader>
                    <SortableHeader
                      columnKey="price"
                      currentSortKey={sortKey}
                      currentDirection={sortDirection}
                      onSort={handleSort}
                      className="px-5 py-3.5 text-right"
                    >
                      Base Labour (RM)
                    </SortableHeader>
                  </>
                ) : activeTab === "vehicles" ? (
                  <>
                    <SortableHeader
                      columnKey="category"
                      currentSortKey={sortKey}
                      currentDirection={sortDirection}
                      onSort={handleSort}
                      className="px-5 py-3.5"
                    >
                      Spec Type
                    </SortableHeader>
                    <SortableHeader
                      columnKey="interval"
                      currentSortKey={sortKey}
                      currentDirection={sortDirection}
                      onSort={handleSort}
                      className="px-5 py-3.5 text-center"
                    >
                      PUSPAKOM Cycle
                    </SortableHeader>
                    <th className="px-5 py-3.5">Description</th>
                  </>
                ) : activeTab === "parts" ? (
                  <>
                    <SortableHeader
                      columnKey="category"
                      currentSortKey={sortKey}
                      currentDirection={sortDirection}
                      onSort={handleSort}
                      className="px-5 py-3.5"
                    >
                      Classification
                    </SortableHeader>
                    <SortableHeader
                      columnKey="erpCode"
                      currentSortKey={sortKey}
                      currentDirection={sortDirection}
                      onSort={handleSort}
                      className="px-5 py-3.5"
                    >
                      AutoCount Code
                    </SortableHeader>
                    <th className="px-5 py-3.5">Notes</th>
                  </>
                ) : activeTab === "taxes" ? (
                  <>
                    <SortableHeader
                      columnKey="rate"
                      currentSortKey={sortKey}
                      currentDirection={sortDirection}
                      onSort={handleSort}
                      className="px-5 py-3.5 text-right"
                    >
                      Tax Rate (%)
                    </SortableHeader>
                    <SortableHeader
                      columnKey="category"
                      currentSortKey={sortKey}
                      currentDirection={sortDirection}
                      onSort={handleSort}
                      className="px-5 py-3.5"
                    >
                      Applies To
                    </SortableHeader>
                    <SortableHeader
                      columnKey="erpCode"
                      currentSortKey={sortKey}
                      currentDirection={sortDirection}
                      onSort={handleSort}
                      className="px-5 py-3.5"
                    >
                      AutoCount Tax Code
                    </SortableHeader>
                  </>
                ) : activeTab === "terms" ? (
                  <>
                    <SortableHeader
                      columnKey="days"
                      currentSortKey={sortKey}
                      currentDirection={sortDirection}
                      onSort={handleSort}
                      className="px-5 py-3.5 text-right"
                    >
                      Credit Days
                    </SortableHeader>
                    <SortableHeader
                      columnKey="erpCode"
                      currentSortKey={sortKey}
                      currentDirection={sortDirection}
                      onSort={handleSort}
                      className="px-5 py-3.5"
                    >
                      AutoCount Term Code
                    </SortableHeader>
                    <th className="px-5 py-3.5">Notes</th>
                  </>
                ) : activeTab === "bays" ? (
                  <>
                    <SortableHeader
                      columnKey="category"
                      currentSortKey={sortKey}
                      currentDirection={sortDirection}
                      onSort={handleSort}
                      className="px-5 py-3.5"
                    >
                      Bay Type
                    </SortableHeader>
                    <th className="px-5 py-3.5 text-center">Underground Pit</th>
                    <SortableHeader
                      columnKey="tonnage"
                      currentSortKey={sortKey}
                      currentDirection={sortDirection}
                      onSort={handleSort}
                      className="px-5 py-3.5 text-right"
                    >
                      Max Capacity
                    </SortableHeader>
                    <SortableHeader
                      columnKey="bayStatus"
                      currentSortKey={sortKey}
                      currentDirection={sortDirection}
                      onSort={handleSort}
                      className="px-5 py-3.5 text-center"
                    >
                      Operational State
                    </SortableHeader>
                  </>
                ) : activeTab === "bins" ? (
                  <>
                    <SortableHeader
                      columnKey="category"
                      currentSortKey={sortKey}
                      currentDirection={sortDirection}
                      onSort={handleSort}
                      className="px-5 py-3.5"
                    >
                      Bin Type
                    </SortableHeader>
                    <SortableHeader
                      columnKey="zone"
                      currentSortKey={sortKey}
                      currentDirection={sortDirection}
                      onSort={handleSort}
                      className="px-5 py-3.5"
                    >
                      Warehouse Zone
                    </SortableHeader>
                    <th className="px-5 py-3.5">Warehouse</th>
                  </>
                ) : (
                  <>
                    <SortableHeader
                      columnKey="debtor"
                      currentSortKey={sortKey}
                      currentDirection={sortDirection}
                      onSort={handleSort}
                      className="px-5 py-3.5"
                    >
                      Debtor Code
                    </SortableHeader>
                    <SortableHeader
                      columnKey="vehicles"
                      currentSortKey={sortKey}
                      currentDirection={sortDirection}
                      onSort={handleSort}
                      className="px-5 py-3.5 text-center"
                    >
                      Fleet Vehicles
                    </SortableHeader>
                    <th className="px-5 py-3.5">Last Synced</th>
                  </>
                )}

                <SortableHeader
                  columnKey="status"
                  currentSortKey={sortKey}
                  currentDirection={sortDirection}
                  onSort={handleSort}
                  className="px-5 py-3.5 text-center"
                >
                  Status
                </SortableHeader>

                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 bg-white">
              {visibleData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-slate-400">
                    <Database className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                    <p className="font-semibold text-slate-600">No matching master data found</p>
                    <p className="text-xs text-slate-400 mt-0.5">Try adjusting your search query or filters.</p>
                  </td>
                </tr>
              ) : (
                visibleData.map((item: any) => {
                  const isActive = activeTab === "erp" ? item.status === "Active" : item.enabled;
                  return (
                    <tr key={item.id} className="transition-colors hover:bg-slate-50/70">
                      {/* Code */}
                      <td className="whitespace-nowrap px-5 py-4 font-mono font-bold text-slate-900">
                        {item.code || item.projectNo}
                      </td>

                      {/* Name / Title */}
                      <td className="px-5 py-4 font-semibold text-slate-800">
                        <p className="max-w-[260px] truncate" title={item.name || item.description}>
                          {item.name || item.description}
                        </p>
                      </td>

                      {/* Service tab columns */}
                      {activeTab === "services" ? (
                        <>
                          <td className="whitespace-nowrap px-5 py-4">
                            <span className="inline-flex items-center rounded-lg bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 border border-blue-100">
                              {item.category}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-right font-mono font-semibold text-slate-700">
                            {item.estimatedHours.toFixed(1)} hrs
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-right font-mono font-bold text-slate-900">
                            RM {item.basePrice.toFixed(2)}
                          </td>
                        </>
                      ) : null}

                      {/* Vehicle Spec tab columns */}
                      {activeTab === "vehicles" ? (
                        <>
                          <td className="whitespace-nowrap px-5 py-4">
                            <span className="inline-flex items-center rounded-lg bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700 border border-indigo-100">
                              {item.type}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-center font-medium text-slate-600">
                            Every {item.inspectionMonths} months
                          </td>
                          <td className="px-5 py-4 text-slate-500 max-w-[220px] truncate" title={item.description}>
                            {item.description || "—"}
                          </td>
                        </>
                      ) : null}

                      {/* Parts Taxonomy tab columns */}
                      {activeTab === "parts" ? (
                        <>
                          <td className="whitespace-nowrap px-5 py-4">
                            <span className="inline-flex items-center rounded-lg bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700 border border-amber-100">
                              {item.type}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 font-mono font-bold text-slate-800">
                            {item.autocountMapCode}
                          </td>
                          <td className="px-5 py-4 text-slate-500 max-w-[220px] truncate" title={item.description}>
                            {item.description || "—"}
                          </td>
                        </>
                      ) : null}

                      {/* Tax Codes tab columns */}
                      {activeTab === "taxes" ? (
                        <>
                          <td className="whitespace-nowrap px-5 py-4 text-right font-mono font-extrabold text-purple-700">
                            {item.rate.toFixed(1)}%
                          </td>
                          <td className="whitespace-nowrap px-5 py-4">
                            <span className="inline-flex items-center rounded-lg bg-purple-50 px-2.5 py-1 text-[11px] font-bold text-purple-700 border border-purple-100">
                              {item.category}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 font-mono font-bold text-slate-800">
                            {item.autocountTaxCode}
                          </td>
                        </>
                      ) : null}

                      {/* Payment Terms tab columns */}
                      {activeTab === "terms" ? (
                        <>
                          <td className="whitespace-nowrap px-5 py-4 text-right font-mono font-extrabold text-cyan-800">
                            {item.days} days
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 font-mono font-bold text-slate-800">
                            {item.autocountTermCode}
                          </td>
                          <td className="px-5 py-4 text-slate-500 max-w-[240px] truncate" title={item.description}>
                            {item.description || "—"}
                          </td>
                        </>
                      ) : null}

                      {/* Workshop Bays tab columns */}
                      {activeTab === "bays" ? (
                        <>
                          <td className="whitespace-nowrap px-5 py-4">
                            <span className="inline-flex items-center rounded-lg bg-orange-50 px-2.5 py-1 text-[11px] font-bold text-orange-700 border border-orange-100">
                              {item.type}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-center">
                            {item.hasPit ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200/60">
                                <Check className="h-3 w-3" /> Inspection Pit
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400">Ground Hoist</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-right font-mono font-bold text-slate-800">
                            {item.maxTonnage} Tons
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-center">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                item.status === "Available"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : item.status === "Occupied"
                                    ? "bg-amber-50 text-amber-700 border border-amber-200"
                                    : "bg-red-50 text-red-700 border border-red-200"
                              }`}
                            >
                              {item.status}
                            </span>
                          </td>
                        </>
                      ) : null}

                      {/* Bin Locations tab columns */}
                      {activeTab === "bins" ? (
                        <>
                          <td className="whitespace-nowrap px-5 py-4">
                            <span className="inline-flex items-center rounded-lg bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700 border border-rose-100">
                              {item.binType}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 font-semibold text-slate-700">
                            {item.zone}
                          </td>
                          <td className="px-5 py-4 text-slate-500 max-w-[200px] truncate" title={item.warehouse}>
                            {item.warehouse}
                          </td>
                        </>
                      ) : null}

                      {/* ERP Projects tab columns */}
                      {activeTab === "erp" ? (
                        <>
                          <td className="whitespace-nowrap px-5 py-4 font-mono font-bold text-slate-800">
                            {item.debtorCode}
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-center font-semibold text-slate-700">
                            {item.linkedVehiclesCount} units
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-slate-500 font-mono text-[11px]">
                            {item.lastSync}
                          </td>
                        </>
                      ) : null}

                      {/* Status indicator button */}
                      <td className="whitespace-nowrap px-5 py-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(item.id)}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold transition-all cursor-pointer ${
                            isActive
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200/80 hover:bg-emerald-100"
                              : "bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200"
                          }`}
                          title="Click to toggle status"
                        >
                          {isActive ? (
                            <>
                              <CheckCircle2 className="h-3 w-3" />
                              <span>Active</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="h-3 w-3" />
                              <span>Inactive</span>
                            </>
                          )}
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="whitespace-nowrap px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(item)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition-colors cursor-pointer"
                            title="Edit entry"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(item.id, item.name || item.description || item.code)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors cursor-pointer"
                            title="Delete entry"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="border-t border-slate-100 px-5 py-3">
          <AdminPagination
            currentPage={safePage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={filteredData.length}
            onPageChange={setPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setPage(1);
            }}
          />
        </div>
      </div>

      {/* Add / Edit Master Data Dialog */}
      {isModalOpen ? (
        <AdminFormDialog labelledBy="master-data-dialog-title">
          <form onSubmit={handleSaveModal}>
            <AdminFormDialogHeader
              id="master-data-dialog-title"
              title={editingItem ? `Edit ${activeTab.toUpperCase()} Entry` : `Add New ${activeTab.toUpperCase()} Entry`}
              description="Define standardized master data records across workshop operations."
              icon={<Database className="h-5 w-5" />}
              badge="Master Data"
              onClose={() => setIsModalOpen(false)}
            />

            <AdminFormDialogBody>
              <AdminFormSection
                number={1}
                title="Basic Identification"
                description="Specify standard code and display name."
                icon={<Layers className="h-4 w-4" />}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={adminLabelClass}>
                      Code / Identifier <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. SV-8, COD, or BAY-01"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                      className={adminFieldClass}
                    />
                  </div>

                  <div>
                    <label className={adminLabelClass}>
                      Display Name / Title <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Service Tax 8% or Quick Inspection Pit"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className={adminFieldClass}
                    />
                  </div>
                </div>

                {/* Subcategory selection */}
                {activeTab !== "erp" && activeTab !== "terms" ? (
                  <div className="mt-4">
                    <label className={adminLabelClass}>
                      {activeTab === "services"
                        ? "Service Category"
                        : activeTab === "vehicles"
                          ? "Specification Type"
                          : activeTab === "parts"
                            ? "Taxonomy Type"
                            : activeTab === "taxes"
                              ? "Applies To"
                              : activeTab === "bays"
                                ? "Bay Type"
                                : "Storage Bin Type"}{" "}
                      <span className="text-red-500">*</span>
                    </label>
                    <AdminSelect
                      value={formData.categoryOrType}
                      onChange={(e) => setFormData({ ...formData, categoryOrType: e.target.value })}
                      className="w-full"
                    >
                      {activeTab === "services" ? (
                        <>
                          <option value="Preventive Maintenance">Preventive Maintenance</option>
                          <option value="Repair & Overhaul">Repair & Overhaul</option>
                          <option value="Diagnostics">Diagnostics</option>
                          <option value="Inspection">Inspection</option>
                        </>
                      ) : activeTab === "vehicles" ? (
                        <>
                          <option value="Equipment Type">Equipment Type</option>
                          <option value="Make / Brand">Make / Brand</option>
                          <option value="Axle Configuration">Axle Configuration</option>
                        </>
                      ) : activeTab === "parts" ? (
                        <>
                          <option value="Parts Category">Parts Category</option>
                          <option value="Unit of Measure (UOM)">Unit of Measure (UOM)</option>
                        </>
                      ) : activeTab === "taxes" ? (
                        <>
                          <option value="Labour">Labour Only (Work Order Services)</option>
                          <option value="Parts">Parts Only (Consumables & Spare Parts)</option>
                          <option value="All">All Invoices & Supplies</option>
                        </>
                      ) : activeTab === "bays" ? (
                        <>
                          <option value="Pit">Underground Inspection Pit</option>
                          <option value="Heavy Overhaul">Heavy Overhaul Bay</option>
                          <option value="Alignment & Tyre">Laser Alignment Station</option>
                          <option value="Brake & Air">Air Brake Overhaul Station</option>
                          <option value="General">General Workshop Bay</option>
                        </>
                      ) : (
                        <>
                          <option value="Shelf Rack">Shelf Rack (Shelves & Levels)</option>
                          <option value="Heavy Pallet">Heavy Pallet (Floor Deck)</option>
                          <option value="Small Bin">Small Bin (Hardware / Seals)</option>
                          <option value="Bulk Drum">Bulk Drum (200L Oils / Fluids)</option>
                        </>
                      )}
                    </AdminSelect>
                  </div>
                ) : null}
              </AdminFormSection>

              <AdminFormSection
                number={2}
                title="Operational & Accounting Parameters"
                description="Configure technical parameters and AutoCount ERP linking attributes."
                icon={<Clock className="h-4 w-4" />}
                tone="indigo"
              >
                {activeTab === "services" ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className={adminLabelClass}>Estimated Labour Hours (Hrs)</label>
                      <input
                        type="number"
                        step="0.5"
                        min="0.5"
                        value={formData.estimatedHours}
                        onChange={(e) => setFormData({ ...formData, estimatedHours: e.target.value })}
                        className={adminFieldClass}
                      />
                    </div>
                    <div>
                      <label className={adminLabelClass}>Base Labour Charge (RM)</label>
                      <input
                        type="number"
                        step="10"
                        min="0"
                        value={formData.basePrice}
                        onChange={(e) => setFormData({ ...formData, basePrice: e.target.value })}
                        className={adminFieldClass}
                      />
                    </div>
                  </div>
                ) : activeTab === "vehicles" ? (
                  <div>
                    <label className={adminLabelClass}>PUSPAKOM Mandatory Cycle (Months)</label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={formData.inspectionMonths}
                      onChange={(e) => setFormData({ ...formData, inspectionMonths: e.target.value })}
                      className={adminFieldClass}
                    />
                  </div>
                ) : activeTab === "parts" ? (
                  <div>
                    <label className={adminLabelClass}>AutoCount ERP Mapping Code</label>
                    <input
                      type="text"
                      placeholder="e.g. ITEM-LUB or PCS"
                      value={formData.autocountMapCode}
                      onChange={(e) => setFormData({ ...formData, autocountMapCode: e.target.value })}
                      className={adminFieldClass}
                    />
                  </div>
                ) : activeTab === "taxes" ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className={adminLabelClass}>Tax Rate (%) <span className="text-red-500">*</span></label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={formData.rate}
                        onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
                        className={adminFieldClass}
                      />
                    </div>
                    <div>
                      <label className={adminLabelClass}>AutoCount Tax Code</label>
                      <input
                        type="text"
                        placeholder="e.g. SV-8, TX, ZRL"
                        value={formData.autocountMapCode}
                        onChange={(e) => setFormData({ ...formData, autocountMapCode: e.target.value })}
                        className={adminFieldClass}
                      />
                    </div>
                  </div>
                ) : activeTab === "terms" ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className={adminLabelClass}>Credit Days (Days) <span className="text-red-500">*</span></label>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        placeholder="e.g. 0 for COD, 30 for NET 30"
                        value={formData.days}
                        onChange={(e) => setFormData({ ...formData, days: e.target.value })}
                        className={adminFieldClass}
                      />
                    </div>
                    <div>
                      <label className={adminLabelClass}>AutoCount Term Code</label>
                      <input
                        type="text"
                        placeholder="e.g. 30 DAYS or C.O.D."
                        value={formData.autocountMapCode}
                        onChange={(e) => setFormData({ ...formData, autocountMapCode: e.target.value })}
                        className={adminFieldClass}
                      />
                    </div>
                  </div>
                ) : activeTab === "bays" ? (
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <label className={adminLabelClass}>Max Tonnage (Tons)</label>
                      <input
                        type="number"
                        step="5"
                        min="1"
                        value={formData.maxTonnage}
                        onChange={(e) => setFormData({ ...formData, maxTonnage: e.target.value })}
                        className={adminFieldClass}
                      />
                    </div>
                    <div>
                      <label className={adminLabelClass}>Operational State</label>
                      <AdminSelect
                        value={formData.bayStatus}
                        onChange={(e) => setFormData({ ...formData, bayStatus: e.target.value as any })}
                        className="w-full"
                      >
                        <option value="Available">Available</option>
                        <option value="Occupied">Occupied</option>
                        <option value="Maintenance">Maintenance</option>
                      </AdminSelect>
                    </div>
                    <div className="flex items-center pt-6">
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.hasPit}
                          onChange={(e) => setFormData({ ...formData, hasPit: e.target.checked })}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        Has Underground Pit
                      </label>
                    </div>
                  </div>
                ) : activeTab === "bins" ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className={adminLabelClass}>Warehouse Location</label>
                      <input
                        type="text"
                        placeholder="e.g. Main Workshop Store"
                        value={formData.warehouse}
                        onChange={(e) => setFormData({ ...formData, warehouse: e.target.value })}
                        className={adminFieldClass}
                      />
                    </div>
                    <div>
                      <label className={adminLabelClass}>Warehouse Zone</label>
                      <input
                        type="text"
                        placeholder="e.g. Zone A (Filters & Lubes)"
                        value={formData.zone}
                        onChange={(e) => setFormData({ ...formData, zone: e.target.value })}
                        className={adminFieldClass}
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className={adminLabelClass}>Debtor Code in AutoCount</label>
                    <input
                      type="text"
                      placeholder="e.g. 300-M0001"
                      value={formData.debtorCode}
                      onChange={(e) => setFormData({ ...formData, debtorCode: e.target.value })}
                      className={adminFieldClass}
                    />
                  </div>
                )}

                <div className="mt-4">
                  <label className={adminLabelClass}>Description & Operational Guidance</label>
                  <textarea
                    rows={3}
                    placeholder="Provide operational guidance, standard scope or instructions..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className={adminTextareaClass}
                  />
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="entry-enabled"
                    checked={formData.enabled}
                    onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="entry-enabled" className="text-xs font-semibold text-slate-800 cursor-pointer">
                    Active & enabled for current operations
                  </label>
                </div>
              </AdminFormSection>
            </AdminFormDialogBody>

            <AdminFormDialogFooter>
              <AdminDialogCancelButton onClick={() => setIsModalOpen(false)}>
                Cancel
              </AdminDialogCancelButton>
              <AdminDialogPrimaryButton type="submit">
                {editingItem ? "Save Changes" : "Create Entry"}
              </AdminDialogPrimaryButton>
            </AdminFormDialogFooter>
          </form>
        </AdminFormDialog>
      ) : null}
    </div>
  );
}
