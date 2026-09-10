import { useState, useMemo } from "react";
import { useNavigate } from "react-router";
import {
  Search,
  Eye,
  Edit,
  Phone,
  Mail,
  X,
  MapPin,
  Users,
  Truck,
  ArrowRight,
  Building2,
  Save,
  Database,
  Check,
  CheckCircle2,
  Landmark,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  KeyRound,
  UserRound,
  ShieldCheck,
  ExternalLink,
  RotateCcw,
} from "lucide-react";
import { useLanguage } from "../contexts/language-context";
import { postApi } from "../lib/api";
import { EMAIL_PLACEHOLDER, isValidEmail, normalizeEmail } from "../lib/email";
import {
  formatMalaysiaPhone,
  formatMalaysiaPhoneInput,
  isValidMalaysiaPhone,
  MALAYSIA_PHONE_PLACEHOLDER,
  normalizeMalaysiaPhone,
} from "../lib/malaysia-phone";
import { isValidPassword, passwordValidationMessage } from "../lib/password";
import { useApiData } from "../lib/use-api-data";
import { hasAdminPermission } from "../lib/admin-permissions";
import { useConfirmationDialog } from "../contexts/confirmation-dialog-context";
import { adminFieldClass, adminLabelClass, adminTextareaClass } from "./ui/admin-form-dialog";
import { AutoCountSyncBadge } from "./autocount-sync-badge";
import { AdminSelect } from "./ui/admin-select";
import { AdminCombobox } from "./ui/admin-combobox";
import { DesktopDatePicker } from "./ui/desktop-date-picker";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { AdminPagination } from "./ui/admin-pagination";
import { SortableHeader, useSortState, compareValues } from "./ui/sortable-header";
import { toast } from "sonner";
import { PageLoading } from "./ui/page-loading";

type Company = {
  id: number | null;
  name: string;
  phone: string;
  email: string;
  address: string;
  autocountDebtorCode: string;
  registrationNo?: string;
  term?: string;
  creditLimit?: number;
  currency?: string;
  debtorActive?: boolean;
  vehicles: number;
  customers: number;
};

type CompanyForm = {
  name: string;
  phone: string;
  email: string;
  address: string;
  autocountDebtorCode: string;
};

type CompanyUser = {
  id: number;
  name: string;
  email: string;
  phone: string;
  status: string;
  companyId?: number;
  vehicles?: number;
};

type CompanyVehicle = {
  id: number;
  regNo: string;
  equipment: string;
  brand: string;
  model: string;
  vehicleStatus?: string;
  verificationStatus?: string;
  companyId?: number;
};

const emptyCompanyForm: CompanyForm = {
  name: "",
  phone: "",
  email: "",
  address: "",
  autocountDebtorCode: "",
};

function displayMoney(value?: number, currency = "MYR") {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: currency || "MYR",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

const COMPANY_VEHICLE_EQUIPMENT_TYPES = [
  "Prime Mover",
  "Container Chassis / Skeletal Trailer",
  "Side Loader / Sidelifter",
  "Other",
];

const COMPANY_VEHICLE_STATUSES = [
  "Active",
  "Inactive",
  "Under Maintenance",
  "Out of Service",
];

const CONTAINER_LENGTH_OPTIONS = [
  "20 ft",
  "40 ft",
  "45 ft",
  "20/40 ft Extendable",
  "Other",
];

const AXLE_CONFIG_OPTIONS = [
  "2 Axle",
  "3 Axle",
  "Other",
];

const PRIME_MOVER_BRANDS = [
  "Volvo Trucks",
  "Scania",
  "MAN",
  "Mercedes-Benz",
  "Isuzu",
  "Hino",
  "Fuso",
  "UD Trucks",
  "Other",
];

const PRIME_MOVER_BRAND_MODELS: Record<string, string[]> = {
  "Volvo Trucks": ["FH", "FH16", "FM", "FMX"],
  "Scania": ["G-Series", "P-Series", "R-Series", "S-Series", "G450", "R450"],
  "MAN": ["TGX", "TGS", "TGM", "TGL"],
  "Mercedes-Benz": ["Actros", "Arocs", "Atego"],
  "Isuzu": ["GIGA", "FORWARD", "CYZ", "EXZ"],
  "Hino": ["700 Series", "500 Series", "Profia"],
  "Fuso": ["Super Great", "Fighter"],
  "UD Trucks": ["Quester", "Croner", "Quon"],
};

const emptyCompanyVehicleForm = {
  equipment: "Prime Mover",
  vehicleStatus: "Active",
  vecNo: "",
  regNo: "",
  brand: "",
  model: "",
  year: "",
  mileage: "",
  chassisNo: "",
  engineNo: "",
  containerLength: "",
  axleConfiguration: "",
  insurance: "",
  roadTax: "",
  puspakom: "",
  autocountProjectNo: "",
};

export function Companies() {
  const navigate = useNavigate();
  const confirmAction = useConfirmationDialog();
  const canCreateUser = hasAdminPermission("customer.create");
  const canViewUsers = hasAdminPermission("customer.view");
  const canUpdateUsers = hasAdminPermission("customer.update");
  const canDeleteUsers = hasAdminPermission("customer.delete");
  const canCreateVehicle = hasAdminPermission("vehicle.create");
  const canViewVehicles = hasAdminPermission("vehicle.view");
  const canUpdate = hasAdminPermission("company.update");
  const { t } = useLanguage();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "linked" | "unlinked" | "with_vehicles">("all");
  const [paymentTermFilter, setPaymentTermFilter] = useState<string>("all");
  const [accountStatusFilter, setAccountStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [isDetailEditing, setIsDetailEditing] = useState(false);
  const [form, setForm] = useState<CompanyForm>(emptyCompanyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const { sortKey, sortDirection, handleSort, setSortKey } = useSortState(null, "asc");

  const onSort = (key: string) => {
    handleSort(key);
    setPage(1);
  };

  // Tab state in detail view
  const [activeDetailTab, setActiveDetailTab] = useState<"overview" | "users" | "vehicles">("overview");
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [vehicleSearchTerm, setVehicleSearchTerm] = useState("");

  // Company User Detail Single Page state
  const [selectedUserDetail, setSelectedUserDetail] = useState<CompanyUser | null>(null);
  const [userPageMode, setUserPageMode] = useState<"view" | "edit">("view");
  const [userEditForm, setUserEditForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    status: "Active" as "Active" | "Inactive",
  });
  const [isUserPageSaving, setIsUserPageSaving] = useState(false);
  const [userPageError, setUserPageError] = useState("");

  // In-place Company User Modal state
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [userModalMode, setUserModalMode] = useState<"create" | "edit">("create");
  const [selectedUserForEdit, setSelectedUserForEdit] = useState<CompanyUser | null>(null);
  const [userForm, setUserForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    status: "Active" as "Active" | "Inactive",
  });
  const [isUserSaving, setIsUserSaving] = useState(false);
  const [userFormError, setUserFormError] = useState("");

  // In-place Company Vehicle Modal state
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [vehicleForm, setVehicleForm] = useState(emptyCompanyVehicleForm);
  const [isVehicleSaving, setIsVehicleSaving] = useState(false);
  const [vehicleFormError, setVehicleFormError] = useState("");

  const vehicleModelSuggestions = useMemo(() => {
    if (vehicleForm.brand && PRIME_MOVER_BRAND_MODELS[vehicleForm.brand]) {
      return PRIME_MOVER_BRAND_MODELS[vehicleForm.brand];
    }
    return ["FH16", "G450", "TGM", "Quester", "GIGA", "Actros", "700 Series", "Super Great"];
  }, [vehicleForm.brand]);

  const { data: companiesData, isLoading, error, reload, hasLoaded } = useApiData<Company[]>("admin-companies", []);
  const {
    data: usersData,
    isLoading: areUsersLoading,
    error: usersError,
    reload: reloadUsers,
  } = useApiData<CompanyUser[]>("admin-customers", []);
  const {
    data: vehiclesData,
    isLoading: areVehiclesLoading,
    error: vehiclesError,
    reload: reloadVehicles,
  } = useApiData<CompanyVehicle[]>("admin-vehicles", []);

  const companies = useMemo(() => {
    if (isLoading && !hasLoaded) return [];
    return companiesData || [];
  }, [companiesData, isLoading, hasLoaded]);

  const activeLinkedCount = useMemo(
    () => companies.filter((c) => Boolean(c.autocountDebtorCode)).length,
    [companies],
  );
  const totalVehiclesCount = useMemo(
    () => companies.reduce((acc, c) => acc + (c.vehicles || 0), 0),
    [companies],
  );
  const totalUsersCount = useMemo(
    () => companies.reduce((acc, c) => acc + (c.customers || 0), 0),
    [companies],
  );

  const openDetailView = (company: Company) => {
    setSelectedCompany(company);
    setSelectedUserDetail(null);
    setUserPageMode("view");
    setActiveDetailTab("overview");
    setUserSearchTerm("");
    setVehicleSearchTerm("");
    setForm({
      name: company.name,
      phone: company.phone === "-" ? "" : formatMalaysiaPhone(company.phone),
      email: company.email === "-" ? "" : normalizeEmail(company.email),
      address: company.address === "-" ? "" : company.address,
      autocountDebtorCode: company.autocountDebtorCode || "",
    });
    setIsDetailEditing(false);
    setFormError("");
  };

  const closeDetailView = () => {
    setSelectedCompany(null);
    setSelectedUserDetail(null);
    setUserPageMode("view");
    setIsDetailEditing(false);
    setForm(emptyCompanyForm);
    setFormError("");
  };

  const handleSubmitCompany = async () => {
    setFormError("");

    if (!form.name.trim()) {
      setFormError("Company name is required.");
      return;
    }

    if (form.phone.trim() && !isValidMalaysiaPhone(form.phone)) {
      setFormError("Enter a valid Malaysia mobile or landline number.");
      return;
    }

    if (form.email.trim() && !isValidEmail(form.email)) {
      setFormError("Enter a valid email address, for example name@example.com.");
      return;
    }

    setIsSaving(true);
    try {
      await postApi("admin-update-company", {
        id: selectedCompany?.id,
        name: form.name.trim(),
        phone: form.phone.trim() ? normalizeMalaysiaPhone(form.phone)! : "",
        email: form.email.trim() ? normalizeEmail(form.email) : "",
        address: form.address.trim(),
        autocountDebtorCode: form.autocountDebtorCode.trim().toUpperCase(),
      });
      toast.success("Company profile updated successfully.");
      setSelectedCompany((prev) =>
        prev
          ? {
              ...prev,
              name: form.name.trim(),
              phone: form.phone.trim() ? normalizeMalaysiaPhone(form.phone)! : "",
              email: form.email.trim() ? normalizeEmail(form.email) : "",
              address: form.address.trim(),
              autocountDebtorCode: form.autocountDebtorCode.trim().toUpperCase(),
            }
          : null,
      );
      setIsDetailEditing(false);
      await reload();
    } catch (apiError) {
      setFormError(apiError instanceof Error ? apiError.message : "Unable to save company.");
    } finally {
      setIsSaving(false);
    }
  };

  const filteredCompanies = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    const list = companies.filter((company) => {
      if (statusFilter === "linked" && !company.autocountDebtorCode) return false;
      if (statusFilter === "unlinked" && company.autocountDebtorCode) return false;
      if (statusFilter === "with_vehicles" && (!company.vehicles || company.vehicles === 0)) return false;

      // Payment Term Filter
      if (paymentTermFilter !== "all") {
        const term = (company.term || "").trim().toLowerCase();
        if (paymentTermFilter === "cod") {
          if (!term.includes("c.o.d") && !term.includes("cod") && !term.includes("cash")) return false;
        } else if (paymentTermFilter === "credit") {
          if (!term || term.includes("c.o.d") || term.includes("cod") || term.includes("cash")) return false;
        } else if (paymentTermFilter === "30") {
          if (!term.includes("30")) return false;
        } else if (paymentTermFilter === "14") {
          if (!term.includes("14")) return false;
        } else {
          if (term !== paymentTermFilter.toLowerCase()) return false;
        }
      }

      // Account Status Filter
      if (accountStatusFilter === "active") {
        if (company.debtorActive === false) return false;
      } else if (accountStatusFilter === "inactive") {
        if (company.debtorActive !== false) return false;
      }

      if (!needle) return true;
      return (
        company.name.toLowerCase().includes(needle) ||
        (company.autocountDebtorCode && company.autocountDebtorCode.toLowerCase().includes(needle)) ||
        (company.registrationNo && company.registrationNo.toLowerCase().includes(needle)) ||
        company.email.toLowerCase().includes(needle) ||
        company.phone.includes(needle) ||
        company.address.toLowerCase().includes(needle)
      );
    });

    if (!sortKey) return list;

    return [...list].sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";

      switch (sortKey) {
        case "debtorCode":
          aVal = a.autocountDebtorCode || "";
          bVal = b.autocountDebtorCode || "";
          break;
        case "name":
          aVal = a.name;
          bVal = b.name;
          break;
        case "phone":
          aVal = a.phone;
          bVal = b.phone;
          break;
        case "email":
          aVal = a.email;
          bVal = b.email;
          break;
        case "term":
          aVal = a.term || "";
          bVal = b.term || "";
          break;
        case "creditLimit":
          aVal = a.creditLimit ?? 0;
          bVal = b.creditLimit ?? 0;
          break;
        case "fleet":
          aVal = (a.vehicles || 0) * 1000 + (a.customers || 0);
          bVal = (b.vehicles || 0) * 1000 + (b.customers || 0);
          break;
        case "status":
          aVal = a.debtorActive ? 1 : 0;
          bVal = b.debtorActive ? 1 : 0;
          break;
        default:
          return 0;
      }
      return compareValues(aVal, bVal, sortDirection);
    });
  }, [companies, searchTerm, statusFilter, paymentTermFilter, accountStatusFilter, sortKey, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(filteredCompanies.length / pageSize));
  const paginatedCompanies = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredCompanies.slice(start, start + pageSize);
  }, [filteredCompanies, page, pageSize]);

  const tabCounts = useMemo(() => {
    return {
      all: companies.length,
      linked: companies.filter((c) => !!c.autocountDebtorCode).length,
      unlinked: companies.filter((c) => !c.autocountDebtorCode).length,
      with_vehicles: companies.filter((c) => (c.vehicles || 0) > 0).length,
    };
  }, [companies]);

  const statusTabs = useMemo(() => {
    return [
      { id: "all" as const, label: "All Companies", count: tabCounts.all },
      { id: "linked" as const, label: "Linked to AutoCount", count: tabCounts.linked, badgeColor: tabCounts.linked > 0 ? "bg-emerald-100 text-emerald-800" : undefined },
      { id: "unlinked" as const, label: "Not Linked", count: tabCounts.unlinked, badgeColor: tabCounts.unlinked > 0 ? "bg-amber-100 text-amber-800" : undefined },
      { id: "with_vehicles" as const, label: "With Fleet Vehicles", count: tabCounts.with_vehicles, badgeColor: tabCounts.with_vehicles > 0 ? "bg-blue-100 text-blue-800" : undefined },
    ];
  }, [tabCounts]);

  const handleClearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setPaymentTermFilter("all");
    setAccountStatusFilter("all");
    setSortKey(null);
    setPage(1);
  };

  const selectedCompanyUsers = useMemo(
    () => (selectedCompany ? usersData.filter((user) => Number(user.companyId) === selectedCompany.id) : []),
    [usersData, selectedCompany],
  );

  const selectedCompanyVehicles = useMemo(
    () => (selectedCompany ? vehiclesData.filter((vehicle) => Number(vehicle.companyId) === selectedCompany.id) : []),
    [vehiclesData, selectedCompany],
  );

  const openCompanyUsers = () => {
    setActiveDetailTab("users");
  };

  const openCompanyVehicles = () => {
    setActiveDetailTab("vehicles");
  };

  const openCompanyVehicleDetail = (vehicleId: number) => {
    navigate(`/equipment?vehicleId=${vehicleId}`);
  };

  const openCompanyUserDetail = (u: CompanyUser) => {
    setSelectedUserDetail(u);
    setUserPageMode("view");
    setUserEditForm({
      name: u.name,
      email: u.email === "—" || u.email === "-" ? "" : u.email,
      phone: u.phone === "—" || u.phone === "-" ? "" : formatMalaysiaPhone(u.phone),
      password: "",
      status: (u.status as "Active" | "Inactive") || "Active",
    });
    setUserPageError("");
  };

  const handleSaveUserPage = async () => {
    if (!selectedUserDetail || !selectedCompany) return;
    setUserPageError("");

    if (!userEditForm.name.trim() || !userEditForm.email.trim() || !userEditForm.phone.trim()) {
      setUserPageError("Name, email, and phone are required.");
      return;
    }

    if (!isValidEmail(userEditForm.email)) {
      setUserPageError("Enter a valid email address (e.g. contact@example.com).");
      return;
    }

    if (!isValidMalaysiaPhone(userEditForm.phone)) {
      setUserPageError("Enter a valid Malaysia mobile or landline number.");
      return;
    }

    if (userEditForm.password) {
      const passwordError = passwordValidationMessage(userEditForm.password, "New password");
      if (passwordError) {
        setUserPageError(passwordError);
        return;
      }
    }

    setIsUserPageSaving(true);
    try {
      await postApi("admin-update-customer", {
        id: selectedUserDetail.id,
        name: userEditForm.name.trim(),
        email: normalizeEmail(userEditForm.email),
        phone: normalizeMalaysiaPhone(userEditForm.phone)!,
        password: userEditForm.password,
        companyId: selectedCompany.id,
        status: userEditForm.status,
      });

      const updatedUser: CompanyUser = {
        ...selectedUserDetail,
        name: userEditForm.name.trim(),
        email: normalizeEmail(userEditForm.email),
        phone: normalizeMalaysiaPhone(userEditForm.phone)!,
        status: userEditForm.status,
      };
      setSelectedUserDetail(updatedUser);
      setUserPageMode("view");
      setUserEditForm((prev) => ({ ...prev, password: "" }));
      toast.success(`User "${userEditForm.name.trim()}" updated successfully.`);
      await reloadUsers();
      await reload();
    } catch (apiError) {
      setUserPageError(apiError instanceof Error ? apiError.message : "Unable to save user.");
    } finally {
      setIsUserPageSaving(false);
    }
  };

  // In-place Company User Actions
  const openAddUserModal = () => {
    if (!selectedCompany) return;
    setUserModalMode("create");
    setSelectedUserForEdit(null);
    setUserForm({
      name: "",
      email: "",
      phone: "",
      password: "",
      status: "Active",
    });
    setUserFormError("");
    setIsUserModalOpen(true);
  };

  const openEditUserModal = (user: CompanyUser) => {
    setUserModalMode("edit");
    setSelectedUserForEdit(user);
    setUserForm({
      name: user.name,
      email: user.email === "—" ? "" : user.email,
      phone: user.phone === "—" ? "" : formatMalaysiaPhone(user.phone),
      password: "",
      status: (user.status as "Active" | "Inactive") || "Active",
    });
    setUserFormError("");
    setIsUserModalOpen(true);
  };

  const handleSubmitUser = async () => {
    if (!selectedCompany) return;
    setUserFormError("");

    if (!userForm.name.trim() || !userForm.email.trim() || !userForm.phone.trim()) {
      setUserFormError("Name, email, and phone are required.");
      return;
    }

    if (!isValidEmail(userForm.email)) {
      setUserFormError("Enter a valid email address (e.g. contact@example.com).");
      return;
    }

    if (!isValidMalaysiaPhone(userForm.phone)) {
      setUserFormError("Enter a valid Malaysia mobile or landline number.");
      return;
    }

    if (userModalMode === "create" && !userForm.password.trim()) {
      setUserFormError("Password is required for new company users.");
      return;
    }

    if (userForm.password) {
      const passwordError = passwordValidationMessage(
        userForm.password,
        userModalMode === "edit" ? "New password" : "Password",
      );
      if (passwordError) {
        setUserFormError(passwordError);
        return;
      }
    }

    setIsUserSaving(true);
    try {
      await postApi(userModalMode === "create" ? "admin-create-customer" : "admin-update-customer", {
        id: selectedUserForEdit?.id,
        name: userForm.name.trim(),
        email: normalizeEmail(userForm.email),
        phone: normalizeMalaysiaPhone(userForm.phone)!,
        password: userForm.password,
        companyId: selectedCompany.id,
        status: userForm.status,
      });

      toast.success(
        userModalMode === "create"
          ? `User "${userForm.name.trim()}" created successfully.`
          : `User "${userForm.name.trim()}" updated successfully.`,
      );
      setIsUserModalOpen(false);
      await reloadUsers();
      await reload();
    } catch (apiError) {
      setUserFormError(apiError instanceof Error ? apiError.message : "Unable to save user.");
    } finally {
      setIsUserSaving(false);
    }
  };

  const handleDeleteUser = async (user: CompanyUser) => {
    if (!selectedCompany) return;
    const confirmed = await confirmAction({
      title: `Delete user "${user.name}"?`,
      description: `This will permanently remove access for ${user.email || user.name} from this company.`,
      confirmLabel: "Delete User",
      tone: "danger",
    });
    if (!confirmed) return;

    try {
      await postApi("admin-delete-customer", { id: user.id });
      toast.success(`User "${user.name}" deleted.`);
      await reloadUsers();
      await reload();
    } catch (apiError) {
      toast.error(apiError instanceof Error ? apiError.message : "Unable to delete user.");
    }
  };

  const handleToggleUserStatus = async (user: CompanyUser) => {
    const nextStatus = user.status === "Active" ? "Inactive" : "Active";
    try {
      await postApi("admin-update-customer", {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        companyId: user.companyId || selectedCompany?.id,
        status: nextStatus,
      });
      toast.success(`User status changed to ${nextStatus}.`);
      await reloadUsers();
    } catch (apiError) {
      toast.error(apiError instanceof Error ? apiError.message : "Failed to update user status.");
    }
  };

  // In-place Company Vehicle Actions
  const openAddVehicleModal = () => {
    if (!selectedCompany) return;
    setVehicleForm(emptyCompanyVehicleForm);
    setVehicleFormError("");
    setIsVehicleModalOpen(true);
  };

  const handleSubmitVehicle = async () => {
    if (!selectedCompany) return;
    setVehicleFormError("");

    const regNo = vehicleForm.regNo.trim().toUpperCase();
    if (!regNo) {
      setVehicleFormError("Registration / Plate number is required.");
      return;
    }

    if (vehicleForm.equipment === "Prime Mover") {
      if (!vehicleForm.brand.trim()) {
        setVehicleFormError("Brand / Manufacturer is required for Prime Movers.");
        return;
      }
      if (!vehicleForm.model.trim()) {
        setVehicleFormError("Model / Series is required for Prime Movers.");
        return;
      }
    }

    if (vehicleForm.equipment === "Container Chassis / Skeletal Trailer") {
      if (!vehicleForm.containerLength) {
        setVehicleFormError("Please select a container length.");
        return;
      }
      if (!vehicleForm.axleConfiguration) {
        setVehicleFormError("Please select an axle configuration.");
        return;
      }
    }

    setIsVehicleSaving(true);
    try {
      await postApi("admin-create-vehicle", {
        vecNo: vehicleForm.vecNo.trim().toUpperCase(),
        regNo,
        equipment: vehicleForm.equipment,
        brand: vehicleForm.brand.trim(),
        model: vehicleForm.model.trim(),
        containerLength: vehicleForm.containerLength,
        axleConfiguration: vehicleForm.axleConfiguration,
        year: vehicleForm.year === "" ? null : Number(vehicleForm.year),
        mileage: vehicleForm.mileage === "" ? null : Number(vehicleForm.mileage),
        companyId: selectedCompany.id,
        ownerName: selectedCompany.name,
        chassisNo: vehicleForm.chassisNo.trim().toUpperCase(),
        engineNo: vehicleForm.engineNo.trim().toUpperCase(),
        insurance: vehicleForm.insurance || "",
        roadTax: vehicleForm.roadTax || "",
        puspakom: vehicleForm.puspakom || "",
        vehicleStatus: vehicleForm.vehicleStatus || "Active",
        autocountProjectNo: vehicleForm.autocountProjectNo.trim(),
      });

      toast.success(`Vehicle "${regNo}" registered successfully.`);
      setIsVehicleModalOpen(false);
      await reloadVehicles();
      await reload();
    } catch (err: any) {
      setVehicleFormError(err?.message || "Failed to create vehicle.");
    } finally {
      setIsVehicleSaving(false);
    }
  };



  if (isLoading && !hasLoaded) {
    return (
      <PageLoading
        title="Loading Companies..."
        description="Fetching corporate debtor accounts and fleet data..."
      />
    );
  }

  // If a company is selected, render the Company Detail View with Tabs
  if (selectedCompany) {
    if (selectedUserDetail) {
      return (
        <div className="w-full space-y-6">
          {/* Navigation & Header */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => {
                setSelectedUserDetail(null);
                setUserPageMode("view");
              }}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4 text-slate-500" />
              Back to Company Users
            </button>

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl font-black tracking-tight text-slate-900">
                    {selectedUserDetail.name}
                  </h1>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                      selectedUserDetail.status === "Active"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 bg-slate-100 text-slate-600"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        selectedUserDetail.status === "Active" ? "bg-emerald-600" : "bg-slate-400"
                      }`}
                    />
                    {selectedUserDetail.status || "Active"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Company User &bull; <strong className="text-slate-700 font-semibold">{selectedCompany.name}</strong>
                </p>
              </div>

              {/* Action buttons (View vs Edit mode) */}
              <div className="flex items-center gap-2.5">
                {userPageMode === "view" ? (
                  canUpdateUsers && (
                    <button
                      type="button"
                      onClick={() => {
                        setUserEditForm({
                          name: selectedUserDetail.name,
                          email: selectedUserDetail.email === "—" || selectedUserDetail.email === "-" ? "" : selectedUserDetail.email,
                          phone: selectedUserDetail.phone === "—" || selectedUserDetail.phone === "-" ? "" : formatMalaysiaPhone(selectedUserDetail.phone),
                          password: "",
                          status: (selectedUserDetail.status as "Active" | "Inactive") || "Active",
                        });
                        setUserPageError("");
                        setIsUserPageSaving(false);
                        setUserPageMode("edit");
                      }}
                      className="inline-flex h-9.5 items-center gap-2 rounded-xl bg-blue-600 px-5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-blue-700 cursor-pointer"
                    >
                      <Edit className="h-3.5 w-3.5" />
                      Edit User
                    </button>
                  )
                ) : (
                  <>
                    <button
                      key="btn-cancel-company-user"
                      type="button"
                      disabled={isUserPageSaving}
                      onClick={() => {
                        setUserPageError("");
                        setUserPageMode("view");
                      }}
                      className="inline-flex h-9.5 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                      Cancel
                    </button>
                    <button
                      key="btn-save-company-user"
                      type="button"
                      disabled={isUserPageSaving}
                      onClick={handleSaveUserPage}
                      className="inline-flex h-9.5 items-center gap-2 rounded-xl bg-blue-600 px-5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                    >
                      <Save className="h-3.5 w-3.5" />
                      {isUserPageSaving ? "Saving..." : "Save Changes"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {userPageError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-medium text-rose-700">
              {userPageError}
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
            <div className="flex items-start gap-3 border-b border-slate-100 bg-white px-5 py-3.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                <UserRound className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">User Profile Details</h3>
                <p className="mt-0.5 text-xs text-slate-500">Contact information and customer application access credentials.</p>
              </div>
            </div>

            <div className="space-y-4 p-5">
              {/* Row 1: 4 columns - Full Name, Email, Phone, Status */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {/* Full Name */}
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-600">
                    Full Name {userPageMode === "edit" && <span className="text-rose-500">*</span>}
                  </label>
                  {userPageMode === "view" ? (
                    <div className="flex h-10 w-full items-center rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 text-xs font-semibold text-slate-900">
                      {selectedUserDetail.name}
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={userEditForm.name}
                      onChange={(e) => setUserEditForm((prev) => ({ ...prev, name: e.target.value }))}
                      className="flex h-10 w-full items-center rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-900 shadow-2xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                      placeholder="e.g. John Doe"
                    />
                  )}
                </div>

                {/* Email Address */}
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-600">
                    Email Address {userPageMode === "edit" && <span className="text-rose-500">*</span>}
                  </label>
                  {userPageMode === "view" ? (
                    <div className="flex h-10 w-full items-center rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 text-xs font-medium text-slate-800 break-all">
                      {selectedUserDetail.email && selectedUserDetail.email !== "-" ? selectedUserDetail.email : "—"}
                    </div>
                  ) : (
                    <input
                      type="email"
                      value={userEditForm.email}
                      onChange={(e) => setUserEditForm((prev) => ({ ...prev, email: e.target.value }))}
                      className="flex h-10 w-full items-center rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-900 shadow-2xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                      placeholder="e.g. contact@example.com"
                    />
                  )}
                </div>

                {/* Phone Number */}
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-600">
                    Phone Number {userPageMode === "edit" && <span className="text-rose-500">*</span>}
                  </label>
                  {userPageMode === "view" ? (
                    <div className="flex h-10 w-full items-center rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 text-xs font-medium text-slate-800">
                      {selectedUserDetail.phone && selectedUserDetail.phone !== "-" ? formatMalaysiaPhone(selectedUserDetail.phone) : "—"}
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={userEditForm.phone}
                      onChange={(e) => setUserEditForm((prev) => ({ ...prev, phone: formatMalaysiaPhoneInput(e.target.value) }))}
                      className="flex h-10 w-full items-center rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-900 shadow-2xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                      placeholder="+60 00-000 0000"
                    />
                  )}
                </div>

                {/* Account Status */}
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-600">Account Status</label>
                  {userPageMode === "view" ? (
                    <div className="flex h-10 w-full items-center rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 text-xs font-medium">
                      <span className={`inline-flex items-center gap-1.5 font-bold ${selectedUserDetail.status === "Active" ? "text-emerald-700" : "text-slate-600"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${selectedUserDetail.status === "Active" ? "bg-emerald-600" : "bg-slate-400"}`} />
                        {selectedUserDetail.status || "Active"}
                      </span>
                    </div>
                  ) : (
                    <AdminSelect
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                      value={userEditForm.status}
                      onChange={(e: any) => {
                        const val = typeof e === "string" ? e : (e?.target?.value ?? e);
                        setUserEditForm((prev) => ({ ...prev, status: val as "Active" | "Inactive" }));
                      }}
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </AdminSelect>
                  )}
                </div>
              </div>

              {/* Row 2: 3 columns - Associated Company, Customer App Access, Password */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {/* Associated Company */}
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-600">Associated Company</label>
                  <div className="flex h-10 w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 text-xs font-medium text-slate-800">
                    <span className="font-bold text-slate-900 truncate mr-2">{selectedCompany.name}</span>
                    {selectedCompany.autocountDebtorCode && (
                      <span className="shrink-0 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold font-mono text-blue-700 border border-blue-100">
                        {selectedCompany.autocountDebtorCode}
                      </span>
                    )}
                  </div>
                </div>

                {/* Customer App Access */}
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-600">Customer App Access</label>
                  <div className="flex h-10 w-full items-center rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 text-xs font-medium">
                    {(userPageMode === "edit" ? userEditForm.status : selectedUserDetail.status) === "Active" ? (
                      <span className="inline-flex items-center gap-1.5 font-bold text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                        Enabled (Can log into customer portal &amp; app)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 font-bold text-slate-500">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                        Disabled (Access temporarily revoked)
                      </span>
                    )}
                  </div>
                </div>

                {/* Password / New Password */}
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-600">
                    {userPageMode === "edit" ? (
                      <>
                        New Password <span className="text-[10px] font-normal text-slate-400">(leave blank to keep current)</span>
                      </>
                    ) : (
                      "Login Password"
                    )}
                  </label>
                  {userPageMode === "view" ? (
                    <div className="flex h-10 w-full items-center rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 text-xs font-medium text-slate-500">
                      <KeyRound className="mr-2 h-3.5 w-3.5 text-slate-400" />
                      <span className="tracking-widest font-mono text-slate-600">••••••••</span>
                      <span className="ml-2 text-[11px] text-slate-400">(Encrypted &amp; secure)</span>
                    </div>
                  ) : (
                    <div className="relative">
                      <KeyRound className="absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <input
                        type="password"
                        value={userEditForm.password}
                        onChange={(e) => setUserEditForm((prev) => ({ ...prev, password: e.target.value }))}
                        className="flex h-10 w-full items-center rounded-xl border border-slate-200 bg-white pl-9 pr-3.5 text-xs font-medium text-slate-900 shadow-2xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                        placeholder="Leave blank to keep current password"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    const matchingUsers = selectedCompanyUsers.filter((u) => {
      if (!userSearchTerm.trim()) return true;
      const q = userSearchTerm.toLowerCase();
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.phone.includes(q);
    });

    const matchingVehicles = selectedCompanyVehicles.filter((v) => {
      if (!vehicleSearchTerm.trim()) return true;
      const q = vehicleSearchTerm.toLowerCase();
      return (
        v.regNo.toLowerCase().includes(q) ||
        (v.brand && v.brand.toLowerCase().includes(q)) ||
        (v.model && v.model.toLowerCase().includes(q)) ||
        (v.equipment && v.equipment.toLowerCase().includes(q))
      );
    });

    return (
      <div className="w-full space-y-4">
        {/* Header & Back Navigation */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={closeDetailView}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4 text-slate-500" />
            Back to Companies
          </button>

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase">
                  {selectedCompany.name}
                </h1>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    selectedCompany.debtorActive === false
                      ? "bg-slate-100 text-slate-600"
                      : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      selectedCompany.debtorActive === false ? "bg-slate-400" : "bg-emerald-600"
                    }`}
                  />
                  {selectedCompany.debtorActive === false ? "Inactive" : "Active"}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Company profile, AutoCount debtor accounting terms, user credentials, and commercial fleet registry.
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              {activeDetailTab === "overview" && (
                !isDetailEditing ? (
                  canUpdate && (
                    <button
                      type="button"
                      onClick={() => {
                        setForm({
                          name: selectedCompany.name,
                          phone: selectedCompany.phone === "-" ? "" : formatMalaysiaPhone(selectedCompany.phone),
                          email: selectedCompany.email === "-" ? "" : normalizeEmail(selectedCompany.email),
                          address: selectedCompany.address === "-" ? "" : selectedCompany.address,
                          autocountDebtorCode: selectedCompany.autocountDebtorCode || "",
                        });
                        setIsSaving(false);
                        setIsDetailEditing(true);
                        setFormError("");
                      }}
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-blue-600 bg-white px-5 text-xs font-bold text-blue-600 shadow-2xs hover:bg-blue-50 transition-colors cursor-pointer"
                    >
                      <Edit className="h-4 w-4" />
                      Edit Company
                    </button>
                  )
                ) : (
                  <>
                    <button
                      key="btn-cancel-company"
                      type="button"
                      disabled={isSaving}
                      onClick={() => {
                        setIsDetailEditing(false);
                        setFormError("");
                      }}
                      className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                      Cancel
                    </button>
                    <button
                      key="btn-save-company"
                      type="button"
                      disabled={isSaving}
                      onClick={handleSubmitCompany}
                      className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      <Save className="h-4 w-4" />
                      {isSaving ? "Saving..." : "Save Changes"}
                    </button>
                  </>
                )
              )}

              {activeDetailTab === "vehicles" && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/equipment?companyId=${selectedCompany.id}`)}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <ExternalLink className="h-3.5 w-3.5 text-slate-500" />
                    Open in Fleet Manager
                  </button>
                  {canCreateVehicle && (
                    <button
                      type="button"
                      onClick={openAddVehicleModal}
                      className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-bold text-white shadow-2xs hover:bg-blue-700 transition-colors cursor-pointer"
                    >
                      <Plus className="h-4 w-4" />
                      Add Vehicle
                    </button>
                  )}
                </div>
              )}

              {activeDetailTab === "users" && canCreateUser && (
                <button
                  type="button"
                  onClick={openAddUserModal}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-bold text-white shadow-2xs hover:bg-blue-700 transition-colors cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  Add Company User
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-8 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setActiveDetailTab("overview")}
            className={`inline-flex items-center gap-2 border-b-2 py-3.5 text-xs font-bold transition-colors cursor-pointer ${
              activeDetailTab === "overview"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <Building2 className="h-4 w-4" />
            <span>Overview &amp; Financials</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveDetailTab("vehicles")}
            className={`inline-flex items-center gap-2 border-b-2 py-3.5 text-xs font-bold transition-colors cursor-pointer ${
              activeDetailTab === "vehicles"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <Truck className="h-4 w-4" />
            <span>Fleet &amp; Vehicles</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                activeDetailTab === "vehicles"
                  ? "bg-blue-50 text-blue-600"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {selectedCompanyVehicles.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveDetailTab("users")}
            className={`inline-flex items-center gap-2 border-b-2 py-3.5 text-xs font-bold transition-colors cursor-pointer ${
              activeDetailTab === "users"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            <Users className="h-4 w-4" />
            <span>Company Users</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                activeDetailTab === "users"
                  ? "bg-blue-50 text-blue-600"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {selectedCompanyUsers.length}
            </span>
          </button>
        </div>

        {/* Tab 1: Overview & Financials */}
        {activeDetailTab === "overview" && (
          <div className="space-y-6">
            {/* Quick Metrics Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div
                onClick={() => setActiveDetailTab("vehicles")}
                className="group flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs hover:border-blue-300 hover:bg-blue-50/20 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-3.5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <Truck className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-500">Commercial Fleet Vehicles</p>
                    <p className="text-xl font-black text-slate-900">{selectedCompanyVehicles.length}</p>
                  </div>
                </div>
                <div className="flex items-center text-xs font-bold text-blue-600">
                  <span>Manage Fleet</span>
                  <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </div>
              </div>

              <div
                onClick={() => setActiveDetailTab("users")}
                className="group flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs hover:border-blue-300 hover:bg-blue-50/20 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-3.5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-500">Authorized App Users</p>
                    <p className="text-xl font-black text-slate-900">{selectedCompanyUsers.length}</p>
                  </div>
                </div>
                <div className="flex items-center text-xs font-bold text-blue-600">
                  <span>Manage Users</span>
                  <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </div>
              </div>
            </div>

            {/* General Information Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs space-y-4">
              <h3 className="text-sm font-extrabold text-slate-900">General Information</h3>

              {formError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-medium text-rose-700">
                  {formError}
                </div>
              )}

              {!isDetailEditing ? (
                <div className="space-y-4">
                  {/* Row 1: 5 columns */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    <div>
                      <span className="block text-[11px] font-bold text-slate-600 mb-1">Debtor Code</span>
                      <div className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 flex items-center text-xs font-bold text-blue-700 font-mono">
                        {selectedCompany.autocountDebtorCode || "—"}
                      </div>
                    </div>
                    <div>
                      <span className="block text-[11px] font-bold text-slate-600 mb-1">Debtor Name</span>
                      <div
                        className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 flex items-center text-xs font-bold text-slate-900 uppercase truncate"
                        title={selectedCompany.name}
                      >
                        {selectedCompany.name}
                      </div>
                    </div>
                    <div>
                      <span className="block text-[11px] font-bold text-slate-600 mb-1">Registration No.</span>
                      <div className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 flex items-center text-xs font-medium text-slate-800">
                        {selectedCompany.registrationNo || "—"}
                      </div>
                    </div>
                    <div>
                      <span className="block text-[11px] font-bold text-slate-600 mb-1">Payment Terms</span>
                      <div className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 flex items-center text-xs font-bold text-slate-800">
                        {selectedCompany.term || "—"}
                      </div>
                    </div>
                    <div>
                      <span className="block text-[11px] font-bold text-slate-600 mb-1">Credit Limit (RM)</span>
                      <div className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 flex items-center text-xs font-semibold text-slate-800">
                        {displayMoney(selectedCompany.creditLimit, selectedCompany.currency)}
                      </div>
                    </div>
                  </div>

                  {/* Row 2: 3 columns */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_2fr] gap-4">
                    <div>
                      <span className="block text-[11px] font-bold text-slate-600 mb-1">Phone</span>
                      <div className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 flex items-center text-xs font-medium text-slate-800">
                        {selectedCompany.phone && selectedCompany.phone !== "-"
                          ? formatMalaysiaPhone(selectedCompany.phone)
                          : "—"}
                      </div>
                    </div>
                    <div>
                      <span className="block text-[11px] font-bold text-slate-600 mb-1">Email</span>
                      <div
                        className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 flex items-center text-xs font-medium text-slate-800 truncate"
                        title={selectedCompany.email}
                      >
                        {selectedCompany.email && selectedCompany.email !== "-" ? selectedCompany.email : "—"}
                      </div>
                    </div>
                    <div>
                      <span className="block text-[11px] font-bold text-slate-600 mb-1">Billing Address</span>
                      <div className="min-h-[40px] py-2 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 flex items-center text-xs font-medium text-slate-800 leading-relaxed">
                        {selectedCompany.address && selectedCompany.address !== "-" ? selectedCompany.address : "—"}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Edit Mode Form */
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Debtor Code</label>
                      <input
                        value={form.autocountDebtorCode}
                        onChange={(e) => setForm((c) => ({ ...c, autocountDebtorCode: e.target.value.toUpperCase() }))}
                        placeholder="e.g. 300-A004"
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-mono font-bold uppercase outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100 shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Debtor Name *</label>
                      <input
                        value={form.name}
                        onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
                        placeholder="Company name"
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100 shadow-2xs"
                      />
                    </div>
                    <div>
                      <span className="block text-[11px] font-bold text-slate-400 mb-1">Registration No.</span>
                      <div className="h-10 w-full rounded-xl border border-slate-200 bg-slate-100 px-3.5 flex items-center text-xs font-medium text-slate-500">
                        {selectedCompany.registrationNo || "—"}
                      </div>
                    </div>
                    <div>
                      <span className="block text-[11px] font-bold text-slate-400 mb-1">Payment Terms</span>
                      <div className="h-10 w-full rounded-xl border border-slate-200 bg-slate-100 px-3.5 flex items-center text-xs font-bold text-slate-500">
                        {selectedCompany.term || "—"}
                      </div>
                    </div>
                    <div>
                      <span className="block text-[11px] font-bold text-slate-400 mb-1">Credit Limit (RM)</span>
                      <div className="h-10 w-full rounded-xl border border-slate-200 bg-slate-100 px-3.5 flex items-center text-xs font-semibold text-slate-500">
                        {displayMoney(selectedCompany.creditLimit, selectedCompany.currency)}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_2fr] gap-4">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Phone</label>
                      <input
                        value={form.phone}
                        onChange={(e) => setForm((c) => ({ ...c, phone: formatMalaysiaPhoneInput(e.target.value) }))}
                        placeholder="+60 00-000 0000"
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100 shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Email</label>
                      <input
                        value={form.email}
                        onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))}
                        placeholder="contact@example.com"
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100 shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Billing Address</label>
                      <textarea
                        rows={2}
                        value={form.address}
                        onChange={(e) => setForm((c) => ({ ...c, address: e.target.value }))}
                        placeholder="Billing address..."
                        className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs font-medium outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100 shadow-2xs"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Fleet & Vehicles */}
        {activeDetailTab === "vehicles" && (
          <div className="space-y-4">
            {/* Search toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search plate no., brand, model..."
                  value={vehicleSearchTerm}
                  onChange={(e) => setVehicleSearchTerm(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-xs shadow-2xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                />
              </div>
              <p className="text-xs font-medium text-slate-500">
                Showing {matchingVehicles.length} of {selectedCompanyVehicles.length} vehicle(s)
              </p>
            </div>

            {/* Vehicles Table */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100 text-xs">
                  <thead className="bg-slate-50/70 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-5 py-3.5 text-left">Registration / Plate No.</th>
                      <th className="px-5 py-3.5 text-left">Equipment Type</th>
                      <th className="px-5 py-3.5 text-left">Brand &amp; Model</th>
                      <th className="px-5 py-3.5 text-left">Operational Status</th>
                      <th className="px-5 py-3.5 text-left">Approval</th>
                      <th className="px-5 py-3.5 text-right whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {matchingVehicles.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-12 text-center">
                          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                            <Truck className="h-6 w-6" />
                          </div>
                          <p className="mt-3 text-sm font-bold text-slate-800">No fleet vehicles found</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {vehicleSearchTerm ? "Try a different search keyword." : "Register Prime Movers or Container Trailers for this company."}
                          </p>
                          {canCreateVehicle && !vehicleSearchTerm && (
                            <button
                              type="button"
                              onClick={openAddVehicleModal}
                              className="mt-4 inline-flex h-9 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-bold text-white shadow-2xs hover:bg-blue-700 cursor-pointer"
                            >
                              <Plus className="h-4 w-4" />
                              Add First Vehicle
                            </button>
                          )}
                        </td>
                      </tr>
                    ) : (
                      matchingVehicles.map((v) => (
                        <tr
                          key={v.id}
                          onClick={() => openCompanyVehicleDetail(v.id)}
                          className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                        >
                          <td className="px-5 py-3.5">
                            <span className="font-extrabold text-blue-700 tracking-wide font-mono text-xs">
                              {v.regNo}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-slate-700 font-medium">{v.equipment || "Vehicle"}</td>
                          <td className="px-5 py-3.5 text-slate-600">
                            {[v.brand, v.model].filter(Boolean).join(" ") || "—"}
                          </td>
                          <td className="px-5 py-3.5">
                            {(() => {
                              const validStatuses = ["Active", "Inactive", "Under Maintenance", "Out of Service", "Disposed"];
                              const opStatus = validStatuses.includes(v.vehicleStatus || "") ? v.vehicleStatus! : "Active";
                              return (
                                <span className={`inline-flex items-center gap-1.5 font-bold ${
                                  opStatus === "Active"
                                    ? "text-emerald-600"
                                    : opStatus === "Under Maintenance"
                                    ? "text-amber-600"
                                    : "text-slate-500"
                                }`}>
                                  <span className={`h-1.5 w-1.5 rounded-full ${
                                    opStatus === "Active"
                                      ? "bg-emerald-600"
                                      : opStatus === "Under Maintenance"
                                      ? "bg-amber-600"
                                      : "bg-slate-400"
                                  }`} />
                                  {opStatus}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap">
                            {(() => {
                              const vStatus = (v.verificationStatus || "approved").toLowerCase();
                              if (vStatus === "pending") {
                                return <span className="font-bold text-amber-600">Pending</span>;
                              }
                              if (vStatus === "rejected") {
                                return <span className="font-bold text-red-600">Rejected</span>;
                              }
                              return <span className="font-bold text-emerald-600">Approved</span>;
                            })()}
                          </td>
                          <td className="px-5 py-3.5 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openCompanyVehicleDetail(v.id);
                                }}
                                className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 cursor-pointer shadow-2xs"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                View Profile
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Company Users */}
        {activeDetailTab === "users" && (
          <div className="space-y-4">
            {/* Search & Actions toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search user name, email, phone..."
                  value={userSearchTerm}
                  onChange={(e) => setUserSearchTerm(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-xs shadow-2xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                />
              </div>
              <p className="text-xs font-medium text-slate-500">
                Showing {matchingUsers.length} of {selectedCompanyUsers.length} authorized user(s)
              </p>
            </div>

            {/* Users Table */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100 text-xs">
                  <thead className="bg-slate-50/70 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-5 py-3.5 text-left">User Name</th>
                      <th className="px-5 py-3.5 text-left">Email</th>
                      <th className="px-5 py-3.5 text-left">Phone</th>
                      <th className="px-5 py-3.5 text-left">App Access Status</th>
                      <th className="px-5 py-3.5 text-right whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {matchingUsers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-5 py-12 text-center">
                          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                            <Users className="h-6 w-6" />
                          </div>
                          <p className="mt-3 text-sm font-bold text-slate-800">No company users found</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {userSearchTerm ? "Try a different search keyword." : "Add a login account for this company's fleet managers or dispatchers."}
                          </p>
                          {canCreateUser && !userSearchTerm && (
                            <button
                              type="button"
                              onClick={openAddUserModal}
                              className="mt-4 inline-flex h-9 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-bold text-white shadow-2xs hover:bg-blue-700 cursor-pointer"
                            >
                              <Plus className="h-4 w-4" />
                              Add First User
                            </button>
                          )}
                        </td>
                      </tr>
                    ) : (
                      matchingUsers.map((u) => (
                        <tr
                          key={u.id}
                          onClick={() => openCompanyUserDetail(u)}
                          className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                        >
                          <td className="px-5 py-3.5">
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                openCompanyUserDetail(u);
                              }}
                              className="font-extrabold text-blue-700 tracking-wide text-xs hover:text-blue-800 hover:underline cursor-pointer"
                            >
                              {u.name}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-slate-600">
                            {u.email && u.email !== "-" ? u.email : "—"}
                          </td>
                          <td className="px-5 py-3.5 text-slate-700 font-medium whitespace-nowrap">
                            {u.phone && u.phone !== "-" ? formatMalaysiaPhone(u.phone) : "—"}
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleUserStatus(u);
                              }}
                              title="Click to toggle status"
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold transition-colors cursor-pointer ${
                                u.status === "Active"
                                  ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  u.status === "Active" ? "bg-emerald-600" : "bg-slate-400"
                                }`}
                              />
                              {u.status || "Active"}
                            </button>
                          </td>
                          <td className="px-5 py-3.5 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openCompanyUserDetail(u);
                                }}
                                className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 cursor-pointer shadow-2xs"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                View Profile
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}


        {/* Modal: In-place Add/Edit Company User */}
        {isUserModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <UserRound className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900">
                      {userModalMode === "create" ? "Add Company User" : "Edit Company User"}
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Company: <strong className="text-slate-700">{selectedCompany.name}</strong>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsUserModalOpen(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {userFormError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700">
                  {userFormError}
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. John Doe"
                    value={userForm.name}
                    onChange={(e) => setUserForm((prev) => ({ ...prev, name: e.target.value }))}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium shadow-2xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Email Address *</label>
                  <input
                    type="email"
                    placeholder="e.g. contact@example.com"
                    value={userForm.email}
                    onChange={(e) => setUserForm((prev) => ({ ...prev, email: e.target.value }))}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium shadow-2xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Phone Number *</label>
                  <input
                    type="text"
                    placeholder="+60 00-000 0000"
                    value={userForm.phone}
                    onChange={(e) => setUserForm((prev) => ({ ...prev, phone: formatMalaysiaPhoneInput(e.target.value) }))}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium shadow-2xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    {userModalMode === "create" ? "Password *" : "New Password (optional)"}
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="password"
                      placeholder={userModalMode === "create" ? "At least 8 characters" : "Leave blank to keep unchanged"}
                      value={userForm.password}
                      onChange={(e) => setUserForm((prev) => ({ ...prev, password: e.target.value }))}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3.5 text-xs font-medium shadow-2xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Account Status</label>
                  <AdminSelect
                    className="h-10 w-full"
                    value={userForm.status}
                    onChange={(e: any) => {
                      const val = typeof e === "string" ? e : (e?.target?.value ?? e);
                      setUserForm((prev) => ({ ...prev, status: val as "Active" | "Inactive" }));
                    }}
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </AdminSelect>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  disabled={isUserSaving}
                  onClick={() => setIsUserModalOpen(false)}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isUserSaving}
                  onClick={handleSubmitUser}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                >
                  <Save className="h-4 w-4" />
                  {isUserSaving ? "Saving..." : userModalMode === "create" ? "Create User" : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: In-place Add Company Vehicle */}
        {isVehicleModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
            <div className="w-full max-w-xl max-h-[92vh] flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <Truck className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900">Add Fleet Vehicle</h3>
                    <p className="text-[11px] text-slate-500">
                      Company: <strong className="text-slate-700">{selectedCompany.name}</strong>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsVehicleModalOpen(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                {vehicleFormError && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700">
                    {vehicleFormError}
                  </div>
                )}


                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Equipment Type *</label>
                    <AdminSelect
                      className="h-10 w-full"
                      value={vehicleForm.equipment}
                      onChange={(e: any) => {
                        const val = typeof e === "string" ? e : (e?.target?.value ?? e);
                        setVehicleForm((prev) => ({
                          ...prev,
                          equipment: val,
                          ...(val === "Container Chassis / Skeletal Trailer"
                            ? { mileage: "", engineNo: "" }
                            : { containerLength: "", axleConfiguration: "" }),
                          ...(val !== "Prime Mover" ? { engineNo: "" } : {}),
                        }));
                      }}
                    >
                      {COMPANY_VEHICLE_EQUIPMENT_TYPES.map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </AdminSelect>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Operational Status *</label>
                    <AdminSelect
                      className="h-10 w-full"
                      value={vehicleForm.vehicleStatus}
                      onChange={(e: any) => {
                        const val = typeof e === "string" ? e : (e?.target?.value ?? e);
                        setVehicleForm((prev) => ({ ...prev, vehicleStatus: val }));
                      }}
                    >
                      {COMPANY_VEHICLE_STATUSES.map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </AdminSelect>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Unit / Fleet Number</label>
                    <input
                      type="text"
                      placeholder="e.g. DEMO-UNIT-001"
                      value={vehicleForm.vecNo}
                      onChange={(e) => setVehicleForm((prev) => ({ ...prev, vecNo: e.target.value.toUpperCase() }))}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium shadow-2xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                    />
                    <p className="mt-1 text-[10px] text-slate-400">Optional internal unit / asset number.</p>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Registration / Plate No. *</label>
                    <input
                      type="text"
                      placeholder="e.g. WKL 1234"
                      value={vehicleForm.regNo}
                      onChange={(e) => setVehicleForm((prev) => ({ ...prev, regNo: e.target.value.toUpperCase() }))}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold tracking-wide shadow-2xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Brand / Manufacturer {vehicleForm.equipment === "Prime Mover" && "*"}
                    </label>
                    <AdminCombobox
                      ariaLabel="Select or type vehicle brand"
                      placeholder={vehicleForm.equipment === "Container Chassis / Skeletal Trailer" ? "e.g. CIMC or Local" : "e.g. Volvo Trucks, Scania, MAN"}
                      value={vehicleForm.brand}
                      onChange={(value) => setVehicleForm((prev) => ({ ...prev, brand: value }))}
                      options={PRIME_MOVER_BRANDS}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium shadow-2xs outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Model / Series {vehicleForm.equipment === "Prime Mover" && "*"}
                    </label>
                    <AdminCombobox
                      ariaLabel="Select or type vehicle model"
                      placeholder={vehicleForm.equipment === "Prime Mover" ? "e.g. FH16, G450, TGM" : "e.g. 3-Axle Skeletal"}
                      value={vehicleForm.model}
                      onChange={(value) => setVehicleForm((prev) => ({ ...prev, model: value }))}
                      options={vehicleModelSuggestions}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium shadow-2xs outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {vehicleForm.equipment === "Container Chassis / Skeletal Trailer" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Container Length *</label>
                      <AdminSelect
                        className="h-10 w-full"
                        value={vehicleForm.containerLength}
                        onChange={(e: any) => {
                          const val = typeof e === "string" ? e : (e?.target?.value ?? e);
                          setVehicleForm((prev) => ({ ...prev, containerLength: val }));
                        }}
                      >
                        <option value="">-- Select Length --</option>
                        {CONTAINER_LENGTH_OPTIONS.map((l) => (
                          <option key={l} value={l}>{l}</option>
                        ))}
                      </AdminSelect>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Axle Configuration *</label>
                      <AdminSelect
                        className="h-10 w-full"
                        value={vehicleForm.axleConfiguration}
                        onChange={(e: any) => {
                          const val = typeof e === "string" ? e : (e?.target?.value ?? e);
                          setVehicleForm((prev) => ({ ...prev, axleConfiguration: val }));
                        }}
                      >
                        <option value="">-- Select Axle --</option>
                        {AXLE_CONFIG_OPTIONS.map((a) => (
                          <option key={a} value={a}>{a}</option>
                        ))}
                      </AdminSelect>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Manufacture Year</label>
                    <input
                      type="number"
                      min={1900}
                      max={new Date().getFullYear() + 1}
                      placeholder="e.g. 2023"
                      value={vehicleForm.year}
                      onChange={(e) => setVehicleForm((prev) => ({ ...prev, year: e.target.value }))}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium shadow-2xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                    />
                  </div>

                  {vehicleForm.equipment !== "Container Chassis / Skeletal Trailer" ? (
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Current Mileage (km)</label>
                      <input
                        type="number"
                        min={0}
                        placeholder="e.g. 125000"
                        value={vehicleForm.mileage}
                        onChange={(e) => setVehicleForm((prev) => ({ ...prev, mileage: e.target.value }))}
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium shadow-2xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Chassis / VIN No.</label>
                      <input
                        type="text"
                        placeholder="Optional"
                        value={vehicleForm.chassisNo}
                        onChange={(e) => setVehicleForm((prev) => ({ ...prev, chassisNo: e.target.value.toUpperCase() }))}
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium shadow-2xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                      />
                    </div>
                  )}
                </div>

                {vehicleForm.equipment !== "Container Chassis / Skeletal Trailer" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Chassis / VIN No.</label>
                      <input
                        type="text"
                        placeholder="Optional"
                        value={vehicleForm.chassisNo}
                        onChange={(e) => setVehicleForm((prev) => ({ ...prev, chassisNo: e.target.value.toUpperCase() }))}
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium shadow-2xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Engine No.</label>
                      <input
                        type="text"
                        placeholder="Optional"
                        value={vehicleForm.engineNo}
                        onChange={(e) => setVehicleForm((prev) => ({ ...prev, engineNo: e.target.value.toUpperCase() }))}
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium shadow-2xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
                      />
                    </div>
                  </div>
                )}

                {/* Expiry Dates Section */}
                <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5 space-y-2.5">
                  <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Compliance Expiry Dates (Optional)</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[10px] font-medium text-slate-500 mb-1">Road Tax Expiry</label>
                      <DesktopDatePicker
                        value={vehicleForm.roadTax || ""}
                        onChange={(value) => setVehicleForm((prev) => ({ ...prev, roadTax: value }))}
                        ariaLabel="Choose road tax expiry date"
                        allowPastDates={true}
                        disablePast={false}
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs shadow-2xs focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-slate-500 mb-1">Insurance Expiry</label>
                      <DesktopDatePicker
                        value={vehicleForm.insurance || ""}
                        onChange={(value) => setVehicleForm((prev) => ({ ...prev, insurance: value }))}
                        ariaLabel="Choose insurance expiry date"
                        allowPastDates={true}
                        disablePast={false}
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs shadow-2xs focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-slate-500 mb-1">Puspakom Expiry</label>
                      <DesktopDatePicker
                        value={vehicleForm.puspakom || ""}
                        onChange={(value) => setVehicleForm((prev) => ({ ...prev, puspakom: value }))}
                        ariaLabel="Choose Puspakom expiry date"
                        allowPastDates={true}
                        disablePast={false}
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs shadow-2xs focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 px-6 py-3.5 bg-slate-50/50">
                <button
                  type="button"
                  disabled={isVehicleSaving}
                  onClick={() => setIsVehicleModalOpen(false)}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isVehicleSaving}
                  onClick={handleSubmitVehicle}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                >
                  <Save className="h-4 w-4" />
                  {isVehicleSaving ? "Registering..." : "Register Vehicle"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Companies &amp; Debtors</h1>
            <AutoCountSyncBadge
              label="AutoCount Debtor Master"
              onRefresh={() => void reload()}
              isRefreshing={isLoading}
            />
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Unified AutoCount debtor financial accounts and company organization management.
          </p>
        </div>

      </div>

      {error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          Database data unavailable: {error}.
        </div>
      ) : null}

      {/* Unified Filter & Tabs Card (matching Work Orders / Bookings design) */}
      <div className="relative z-20 rounded-2xl border border-slate-200 bg-white shadow-2xs">
        {/* Top: Status Tabs */}
        <div className="flex items-center gap-6 sm:gap-8 border-b border-slate-100 px-6 pt-3.5 overflow-x-auto no-scrollbar">
          {statusTabs.map((tab) => {
            const isActive = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setStatusFilter(tab.id);
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
        <div className="grid grid-cols-1 gap-3 px-6 py-4 md:grid-cols-[1.6fr_1.1fr_1fr_auto]">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by company name, AutoCount debtor code, registration no, phone or address..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 shadow-2xs placeholder:text-slate-400"
            />
          </div>

          <div>
            <AdminSelect
              value={paymentTermFilter}
              onChange={(e) => {
                setPaymentTermFilter(e.target.value);
                setPage(1);
              }}
              placement="bottom"
              className="h-10 w-full text-xs"
              aria-label="Filter by payment term"
            >
              <option value="all">All Payment Terms</option>
              <option value="cod">C.O.D. (Cash)</option>
              <option value="credit">Credit Terms (All)</option>
              <option value="30">30 Days (Net 30)</option>
              <option value="14">14 Days</option>
            </AdminSelect>
          </div>

          <div>
            <AdminSelect
              value={accountStatusFilter}
              onChange={(e) => {
                setAccountStatusFilter(e.target.value as typeof accountStatusFilter);
                setPage(1);
              }}
              placement="bottom"
              className="h-10 w-full text-xs"
              aria-label="Filter by account status"
            >
              <option value="all">All Status</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </AdminSelect>
          </div>

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

      {/* Main Unified Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50/70">
              <tr className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                <SortableHeader columnKey="debtorCode" currentSortKey={sortKey} currentDirection={sortDirection} onSort={onSort} className="px-5 py-3.5 text-left">
                  Debtor Code
                </SortableHeader>
                <SortableHeader columnKey="name" currentSortKey={sortKey} currentDirection={sortDirection} onSort={onSort} className="px-5 py-3.5 text-left">
                  Debtor Name
                </SortableHeader>
                <th scope="col" className="px-5 py-3.5 text-left">Contact</th>
                <th scope="col" className="px-5 py-3.5 text-left">Email</th>
                <SortableHeader columnKey="term" currentSortKey={sortKey} currentDirection={sortDirection} onSort={onSort} className="px-5 py-3.5 text-left">
                  Payment Term
                </SortableHeader>
                <SortableHeader columnKey="creditLimit" currentSortKey={sortKey} currentDirection={sortDirection} onSort={onSort} className="px-5 py-3.5 text-left">
                  Credit Limit (RM)
                </SortableHeader>
                <SortableHeader columnKey="fleet" currentSortKey={sortKey} currentDirection={sortDirection} onSort={onSort} className="px-5 py-3.5 text-left">
                  Fleet &amp; Users
                </SortableHeader>
                <SortableHeader columnKey="status" currentSortKey={sortKey} currentDirection={sortDirection} onSort={onSort} className="px-5 py-3.5 text-left">
                  Status
                </SortableHeader>
                <th scope="col" className="px-5 py-3.5 text-right whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-xs">
              {isLoading && companies.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-16 text-center text-slate-400 font-medium">
                    Loading companies &amp; debtors…
                  </td>
                </tr>
              ) : filteredCompanies.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-16 text-center text-slate-400 font-medium">
                    No companies match the current filter criteria.
                  </td>
                </tr>
              ) : (
                paginatedCompanies.map((company) => (
                  <tr
                    key={company.id ? `c-${company.id}` : `d-${company.autocountDebtorCode}`}
                    className="transition-colors hover:bg-slate-50/50"
                  >
                    <td className="px-5 py-4 whitespace-nowrap">
                      {company.autocountDebtorCode ? (
                        <button
                          type="button"
                          onClick={() => openDetailView(company)}
                          className="font-bold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                        >
                          {company.autocountDebtorCode}
                        </button>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    <td className="px-5 py-4 font-bold text-slate-900 uppercase">
                      <button
                        type="button"
                        onClick={() => openDetailView(company)}
                        className="text-left font-bold text-slate-900 uppercase hover:text-blue-600 transition-colors cursor-pointer"
                      >
                        {company.name}
                      </button>
                    </td>

                    <td className="px-5 py-4 whitespace-nowrap text-slate-600">
                      {company.phone && company.phone !== "-" ? formatMalaysiaPhone(company.phone) : "—"}
                    </td>

                    <td className="px-5 py-4 whitespace-nowrap text-slate-600">
                      {company.email && company.email !== "-" ? company.email : "—"}
                    </td>

                    <td className="px-5 py-4 whitespace-nowrap font-bold text-slate-800">
                      {company.term || "—"}
                    </td>

                    <td className="px-5 py-4 whitespace-nowrap font-medium text-slate-700">
                      {displayMoney(company.creditLimit, company.currency)}
                    </td>

                    <td className="px-5 py-4 whitespace-nowrap font-semibold text-slate-700">
                      {company.vehicles || 0} / {company.customers || 0}
                    </td>

                    <td className="px-5 py-4 whitespace-nowrap">
                      <span
                        className={`font-bold ${
                          company.debtorActive === false ? "text-slate-400" : "text-emerald-600"
                        }`}
                      >
                        {company.debtorActive === false ? "Inactive" : "Active"}
                      </span>
                    </td>

                    <td className="px-5 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => openDetailView(company)}
                          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-2xs hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer"
                          title="View Details"
                        >
                          <Eye className="h-3.5 w-3.5 text-slate-500" />
                          View Details
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <AdminPagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={filteredCompanies.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          itemLabel="companies"
        />
      </div>
    </div>
  );
}
