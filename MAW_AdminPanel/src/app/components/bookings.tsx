import { useEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  Search,
  Plus,
  Eye,
  Edit,
  CheckCircle,
  XCircle,
  Trash2,
  X,
  ClipboardPlus,
  CalendarPlus2,
  UserRound,
  CalendarClock,
  Wrench,
  Save,
  ArrowLeft,
  Calendar,
  Clock,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  SlidersHorizontal,
  MoreHorizontal,
  CalendarRange,
  RotateCcw,
} from "lucide-react";
import { useLanguage } from "../contexts/language-context";
import { useApiData } from "../lib/use-api-data";
import { postApi } from "../lib/api";
import { toast } from "sonner";
import { PageLoading } from "./ui/page-loading";
import { useConfirmationDialog } from "../contexts/confirmation-dialog-context";
import { DesktopDatePicker } from "./ui/desktop-date-picker";
import { DesktopTimePicker } from "./ui/desktop-time-picker";
import { AdminSelect } from "./ui/admin-select";
import { AdminPagination } from "./ui/admin-pagination";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";
import type { StaffMember } from "./staff";
import { hasAdminPermission } from "../lib/admin-permissions";
import { SortableHeader, compareValues } from "./ui/sortable-header";

interface BookingItem {
  id: string;
  idVal?: number;
  customerId?: number;
  customer: string;
  companyId?: number;
  companyName?: string;
  vehicleId?: number;
  vehicle: string;
  service: string;
  date: string;
  time: string;
  location: string;
  status: string;
  technician: string;
  staffId?: number;
  customerNotes: string;
  reportedProblem: string;
  technicianNotes: string;
}

const mockBookings: BookingItem[] = [];
const bookingStatusFilters = ["All", "Pending", "Confirmed", "In Progress", "Completed", "Cancelled"];

const notifyBookingsUpdated = () => {
  window.dispatchEvent(new CustomEvent("admin-bookings-updated"));
};

const statusColors: Record<string, string> = {
  Pending: "bg-amber-100 text-amber-800",
  Confirmed: "bg-emerald-100 text-emerald-800",
  "In Progress": "bg-blue-100 text-blue-800",
  Completed: "bg-slate-100 text-slate-700",
  Cancelled: "bg-rose-100 text-rose-800",
};

const knownServiceCentres = [
  "Pasir Gudang HQ",
  "MEWAH TRANS LOGISTIC SDN BHD",
  "Mewah AutoWorks Kuala Lumpur",
  "Mewah AutoWorks Petaling Jaya",
];

const formatBookingTime = (value: string) => {
  const match = /^(\d{1,2}):(\d{2})/.exec(value || "");
  if (!match) return value || "-";
  const hour = Number(match[1]);
  const minute = match[2];
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${String(displayHour).padStart(2, "0")}:${minute} ${period}`;
};

const formatBookingDateDisplay = (dateStr: string, timeStr: string) => {
  if (!dateStr) return "-";
  let datePart = dateStr;
  try {
    const parts = dateStr.slice(0, 10).split("-");
    if (parts.length === 3) {
      const year = Number(parts[0]);
      const month = Number(parts[1]) - 1;
      const day = Number(parts[2]);
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime())) {
        datePart = d.toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
      }
    }
  } catch {
    datePart = dateStr;
  }
  const timePart = formatBookingTime(timeStr);
  return timePart && timePart !== "-" ? `${datePart} · ${timePart}` : datePart;
};

export function Bookings() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const canCreate = hasAdminPermission("booking.create");
  const canUpdate = hasAdminPermission("booking.update");
  const canDelete = hasAdminPermission("booking.delete");
  const [searchTerm, setSearchTerm] = useState("");
  const requestedStatus = searchParams.get("status") || "All";
  const [selectedStatus, setSelectedStatus] = useState(() =>
    bookingStatusFilters.includes(requestedStatus) ? requestedStatus : "All"
  );
  const [selectedCompany, setSelectedCompany] = useState("All");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sortBy, setSortBy] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const handleHeaderSort = (key: string) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDirection("asc");
      setCurrentPage(1);
      if (key === "date") setSortBy("date_asc");
      else if (key === "id") setSortBy("id_asc");
      else if (key === "customer") setSortBy("customer_asc");
      else setSortBy("");
    } else if (sortDirection === "asc") {
      setSortDirection("desc");
      setCurrentPage(1);
      if (key === "date") setSortBy("date_desc");
      else if (key === "id") setSortBy("id_desc");
      else if (key === "customer") setSortBy("customer_desc");
      else setSortBy("");
    } else {
      // 3rd click: Reset to default (no column active, neutral gray)
      setSortKey(null);
      setSortDirection("desc");
      setSortBy("");
      setCurrentPage(1);
    }
  };

  const handleDropdownSort = (val: string) => {
    setSortBy(val);
    setCurrentPage(1);
    switch (val) {
      case "date_desc":
        setSortKey("date");
        setSortDirection("desc");
        break;
      case "date_asc":
        setSortKey("date");
        setSortDirection("asc");
        break;
      case "id_asc":
        setSortKey("id");
        setSortDirection("asc");
        break;
      case "id_desc":
        setSortKey("id");
        setSortDirection("desc");
        break;
      case "customer_asc":
        setSortKey("customer");
        setSortDirection("asc");
        break;
      case "customer_desc":
        setSortKey("customer");
        setSortDirection("desc");
        break;
    }
  };

  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<BookingItem | null>(null);
  const [isDetailEditing, setIsDetailEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [checkInTarget, setCheckInTarget] = useState<BookingItem | null>(null);
  const [checkInForm, setCheckInForm] = useState({
    priority: "Normal",
    bay: "",
    estimatedOut: "",
    technicianIds: [] as number[],
    checkinMileage: "",
  });
  const [isCheckingIn, setIsCheckingIn] = useState(false);

  const { t } = useLanguage();
  const confirmAction = useConfirmationDialog();

  useEffect(() => {
    setSelectedStatus(bookingStatusFilters.includes(requestedStatus) ? requestedStatus : "All");
  }, [requestedStatus]);

  const applyStatusFilter = (status: string) => {
    const normalizedStatus = bookingStatusFilters.includes(status) ? status : "All";
    setSelectedStatus(normalizedStatus);
    const nextParams = new URLSearchParams(searchParams);
    if (normalizedStatus === "All") nextParams.delete("status");
    else nextParams.set("status", normalizedStatus);
    setSearchParams(nextParams, { replace: true });
  };
  
  // Api Data Fetching
  const { data: bookingsData, isLoading, error, reload, hasLoaded } = useApiData<BookingItem[]>("admin-bookings", []);
  const { data: customersData } = useApiData<{ id: number; name: string; phone: string; companyId: number }[]>("admin-customers", []);
  const { data: vehiclesData } = useApiData<{ id: number; regNo: string; brand: string; model: string; companyId: number; mileage?: string | number }[]>("admin-vehicles", []);
  const { data: companiesData } = useApiData<{ id: number; name: string }[]>("admin-companies", []);
  const { data: staffData } = useApiData<StaffMember[]>("admin-staff", []);

  // Form State
  const [form, setForm] = useState({
    id: "",
    idVal: 0,
    customerId: 0,
    vehicleId: 0,
    service: "",
    date: "",
    time: "",
    location: "Pasir Gudang HQ",
    status: "Pending",
    technician: "",
    staffId: "",
    customerNotes: "",
    reportedProblem: "",
    technicianNotes: "",
  });

  const bookings = useMemo(() => {
    if (isLoading && !hasLoaded) {
      return [];
    }
    if (error && bookingsData.length === 0) {
      return mockBookings;
    }
    return bookingsData;
  }, [bookingsData, isLoading, hasLoaded, error]);

  const tabCounts = useMemo(() => {
    return {
      All: bookings.length,
      Pending: bookings.filter((b) => b.status === "Pending").length,
      Confirmed: bookings.filter((b) => b.status === "Confirmed").length,
      "In Progress": bookings.filter((b) => b.status === "In Progress").length,
      Completed: bookings.filter((b) => b.status === "Completed").length,
      Cancelled: bookings.filter((b) => b.status === "Cancelled").length,
    };
  }, [bookings]);

  const filteredBookings = useMemo(() => {
    return bookings.filter((booking) => {
      const query = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !query ||
        booking.id.toLowerCase().includes(query) ||
        booking.customer.toLowerCase().includes(query) ||
        (booking.companyName && booking.companyName.toLowerCase().includes(query)) ||
        booking.vehicle.toLowerCase().includes(query) ||
        booking.service.toLowerCase().includes(query);

      const matchesStatus = selectedStatus === "All" || booking.status === selectedStatus;

      const matchesCompany =
        selectedCompany === "All" ||
        (booking.companyName && booking.companyName.toLowerCase() === selectedCompany.toLowerCase()) ||
        (booking.companyId && String(booking.companyId) === selectedCompany);

      let matchesDate = true;
      if (startDate) {
        matchesDate = matchesDate && (booking.date || "").slice(0, 10) >= startDate;
      }
      if (endDate) {
        matchesDate = matchesDate && (booking.date || "").slice(0, 10) <= endDate;
      }

      return matchesSearch && matchesStatus && matchesCompany && matchesDate;
    });
  }, [bookings, searchTerm, selectedStatus, selectedCompany, startDate, endDate]);

  const sortedBookings = useMemo(() => {
    const list = [...filteredBookings];
    list.sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";
      switch (sortKey) {
        case "id":
          aVal = a.id;
          bVal = b.id;
          break;
        case "customer":
          aVal = a.customer;
          bVal = b.customer;
          break;
        case "company":
          aVal = a.companyName || "";
          bVal = b.companyName || "";
          break;
        case "vehicle":
          aVal = a.vehicle || "";
          bVal = b.vehicle || "";
          break;
        case "service":
          aVal = a.service || "";
          bVal = b.service || "";
          break;
        case "date": {
          const aDateTime = `${a.date || ""} ${a.time || ""}`;
          const bDateTime = `${b.date || ""} ${b.time || ""}`;
          return compareValues(aDateTime, bDateTime, sortDirection);
        }
        case "technician":
          aVal = a.technician || "";
          bVal = b.technician || "";
          break;
        case "status":
          aVal = a.status || "";
          bVal = b.status || "";
          break;
        default:
          return 0;
      }
      return compareValues(aVal, bVal, sortDirection);
    });
    return list;
  }, [filteredBookings, sortKey, sortDirection]);

  const totalItems = sortedBookings.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const paginatedBookings = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedBookings.slice(start, start + pageSize);
  }, [sortedBookings, currentPage, pageSize]);

  const handleClearFilters = () => {
    setSearchTerm("");
    setSelectedStatus("All");
    setSelectedCompany("All");
    setStartDate("");
    setEndDate("");
    setSortBy("");
    setSortKey(null);
    setSortDirection("desc");
    setCurrentPage(1);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("status");
    setSearchParams(nextParams, { replace: true });
  };

  // Dynamic filter for vehicles selection based on selected customer's company
  const filteredVehiclesForForm = useMemo(() => {
    if (!form.customerId) return vehiclesData;
    const selectedCust = customersData.find((c) => c.id === form.customerId);
    if (!selectedCust || !selectedCust.companyId) return vehiclesData;
    return vehiclesData.filter((v) => v.companyId === selectedCust.companyId);
  }, [form.customerId, customersData, vehiclesData]);

  // Find customer company name dynamically for Form display
  const formCustomerCompanyName = useMemo(() => {
    if (!form.customerId) return "";
    const selectedCust = customersData.find((c) => c.id === form.customerId);
    if (!selectedCust || !selectedCust.companyId) return "";
    const comp = companiesData.find((c) => c.id === selectedCust.companyId);
    return comp ? comp.name : "";
  }, [form.customerId, customersData, companiesData]);

  const openCreateModal = () => {
    setForm({
      id: "",
      idVal: 0,
      customerId: 0,
      vehicleId: 0,
      service: "",
      date: new Date().toISOString().substring(0, 10),
      time: "09:00",
      location: "Pasir Gudang HQ",
      status: "Pending",
      technician: "",
      staffId: "",
      customerNotes: "",
      reportedProblem: "",
      technicianNotes: "",
    });
    setModalMode("create");
  };

  const populateForm = (booking: BookingItem) => {
    setForm({
      id: booking.id,
      idVal: booking.idVal || 0,
      customerId: booking.customerId || 0,
      vehicleId: booking.vehicleId || 0,
      service: booking.service || "",
      date: booking.date || "",
      time: booking.time || "",
      location: booking.location || "Pasir Gudang HQ",
      status: booking.status || "Pending",
      technician: booking.technician === "-" ? "" : booking.technician,
      staffId: booking.staffId
        ? String(booking.staffId)
        : booking.technician && booking.technician !== "-"
          ? `legacy:${booking.technician}`
          : "",
      customerNotes: booking.customerNotes || "",
      reportedProblem: booking.reportedProblem || "",
      technicianNotes: booking.technicianNotes || "",
    });
  };

  const openViewModal = (booking: BookingItem) => {
    setSelectedBooking(booking);
    setIsDetailEditing(false);
    setFormError("");
    setModalMode(null);
  };

  const handleSaveDetail = async () => {
    if (!form.customerId || !form.vehicleId || !form.service) {
      setFormError("Please fill in all required fields (Company user, Vehicle, Service type).");
      return;
    }
    try {
      setIsSaving(true);
      setFormError("");
      const idParam = form.idVal > 0 ? form.idVal : (selectedBooking?.idVal || selectedBooking?.id);
      const payload = {
        id: idParam,
        customerId: form.customerId,
        vehicleId: form.vehicleId,
        service: form.service,
        date: form.date,
        time: form.time,
        location: form.location,
        status: form.status,
        technician: form.technician,
        staffId: Number(form.staffId) || null,
        customerNotes: form.customerNotes,
        reportedProblem: form.reportedProblem,
        technicianNotes: form.technicianNotes,
      };

      const result = await postApi<{ timeChanged?: boolean; notificationSent?: boolean } | null>("admin-update-booking", payload);
      if (result?.timeChanged) {
        toast.success(
          result.notificationSent
            ? "Booking time updated and customer notified."
            : "Booking time updated. Customer notification is disabled or unavailable.",
        );
      } else {
        toast.success("Booking updated successfully.");
      }

      const chosenCustomer = customersData.find((c) => c.id === form.customerId);
      const chosenVehicle = vehiclesData.find((v) => v.id === form.vehicleId);
      const chosenStaff = staffData.find((s) => String(s.id) === String(form.staffId));
      setSelectedBooking((prev) => prev ? ({
        ...prev,
        customerId: form.customerId,
        customer: chosenCustomer?.name || prev.customer,
        vehicleId: form.vehicleId,
        vehicle: chosenVehicle ? `${chosenVehicle.regNo} - ${chosenVehicle.brand} ${chosenVehicle.model}` : prev.vehicle,
        service: form.service,
        date: form.date,
        time: form.time,
        location: form.location,
        status: form.status,
        technician: chosenStaff?.name || form.technician || "-",
        staffId: Number(form.staffId) || prev.staffId,
        customerNotes: form.customerNotes,
        reportedProblem: form.reportedProblem,
        technicianNotes: form.technicianNotes,
      }) : null);

      setIsDetailEditing(false);
      reload();
      notifyBookingsUpdated();
    } catch (err: any) {
      setFormError(err.message || "Failed to update booking.");
      toast.error("Failed to save booking: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerId || !form.vehicleId || !form.service) {
      toast.error("Please fill in all required fields (*).");
      return;
    }

    try {
      const idParam = form.idVal > 0 ? form.idVal : form.id;
      const endpoint = modalMode === "create" ? "admin-create-booking" : "admin-update-booking";
      const payload = {
        id: modalMode === "edit" ? idParam : undefined,
        customerId: form.customerId,
        vehicleId: form.vehicleId,
        service: form.service,
        date: form.date,
        time: form.time,
        location: form.location,
        technician: form.technician,
        staffId: Number(form.staffId) || null,
        customerNotes: form.customerNotes,
        reportedProblem: form.reportedProblem,
        technicianNotes: form.technicianNotes,
      };

      const result = await postApi<{ timeChanged?: boolean; notificationSent?: boolean } | null>(endpoint, payload);
      if (modalMode === "edit" && result?.timeChanged) {
        toast.success(
          result.notificationSent
            ? "Booking time updated and customer notified."
            : "Booking time updated. Customer notification is disabled or unavailable.",
        );
      } else {
        toast.success(modalMode === "create" ? "Booking created successfully." : "Booking updated successfully.");
      }
      setModalMode(null);
      reload();
      notifyBookingsUpdated();
    } catch (err: any) {
      toast.error("Failed to save booking: " + err.message);
    }
  };

  const handleUpdateStatus = async (booking: BookingItem, newStatus: string) => {
    try {
      const idParam = booking.idVal && booking.idVal > 0 ? booking.idVal : booking.id;
      const payload = {
        id: idParam,
        status: newStatus,
        statusOnly: true,
      };

      await postApi("admin-update-booking", payload);
      reload();
      notifyBookingsUpdated();
    } catch (err: any) {
      toast.error("Failed to update status: " + err.message);
    }
  };

  const workOrderStaff = useMemo(
    () => staffData.filter((member) =>
      member.status === "Active" && ["Foreman", "Technician"].includes(member.role)
    ),
    [staffData],
  );

  const openCheckInModal = (booking: BookingItem) => {
    const preselectedStaffId = booking.staffId && workOrderStaff.some((member) => member.id === booking.staffId)
      ? [booking.staffId]
      : [];
    setCheckInForm({
      priority: "Normal",
      bay: "",
      estimatedOut: "",
      technicianIds: preselectedStaffId,
      checkinMileage: "",
    });
    setCheckInTarget(booking);
  };

  const checkInVehicle = useMemo(() => {
    if (!checkInTarget) return null;
    return vehiclesData.find(
      (v) => v.id === checkInTarget.vehicleId || (v.regNo && checkInTarget.vehicle && v.regNo.toLowerCase() === checkInTarget.vehicle.toLowerCase())
    ) || null;
  }, [checkInTarget, vehiclesData]);

  const checkInVehicleMileage = useMemo(() => {
    if (!checkInVehicle) return 0;
    return Number(String(checkInVehicle.mileage || 0).replace(/\D/g, "")) || 0;
  }, [checkInVehicle]);

  const handleCheckIn = async () => {
    if (!checkInTarget) return;
    if (checkInForm.checkinMileage && checkInVehicleMileage > 0 && Number(checkInForm.checkinMileage) < checkInVehicleMileage) {
      toast.error(`Check-in mileage (${Number(checkInForm.checkinMileage).toLocaleString()} km) cannot be less than vehicle's current recorded mileage (${checkInVehicleMileage.toLocaleString()} km).`);
      return;
    }
    setIsCheckingIn(true);
    try {
      const idParam = checkInTarget.idVal && checkInTarget.idVal > 0
        ? checkInTarget.idVal
        : checkInTarget.id;
      const workOrder = await postApi<{ id: number; workOrderNo: string }>("admin-check-in-booking", {
        id: idParam,
        priority: checkInForm.priority,
        bay: checkInForm.bay || null,
        estimatedOut: checkInForm.estimatedOut || null,
        technicianIds: checkInForm.technicianIds,
        checkinMileage: checkInForm.checkinMileage ? Number(checkInForm.checkinMileage) : null,
      });
      setCheckInTarget(null);
      reload();
      notifyBookingsUpdated();
      toast.success(`Vehicle checked in. Work order ${workOrder.workOrderNo} created.`);
      navigate("/work-orders?status=checked_in");
    } catch (err: any) {
      toast.error("Failed to check in vehicle: " + err.message);
    } finally {
      setIsCheckingIn(false);
    }
  };

  const handleDeleteBooking = async (booking: BookingItem) => {
    const confirmed = await confirmAction({
      title: `Delete booking "${booking.id}"?`,
      description: "This booking will be permanently removed. This action cannot be undone.",
      confirmLabel: "Delete booking",
      tone: "danger",
    });
    if (!confirmed) {
      return;
    }
    try {
      const idParam = booking.idVal && booking.idVal > 0 ? booking.idVal : booking.id;
      await postApi("admin-delete-booking", { id: idParam });
      reload();
      notifyBookingsUpdated();
      toast.success(`Booking "${booking.id}" deleted.`);
    } catch (err: any) {
      toast.error("Failed to delete booking: " + err.message);
    }
  };

  if (isLoading && !hasLoaded) {
    return (
      <PageLoading
        title="Loading Bookings..."
        description="Fetching appointment schedules and service requests..."
      />
    );
  }

  // If a booking is selected, render the Service Booking Details Single Page View (matching companies.tsx view)
  if (selectedBooking && !modalMode) {
    return (
      <div className="w-full space-y-6">
        {/* Header & Back Navigation */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => {
              setSelectedBooking(null);
              setIsDetailEditing(false);
              setFormError("");
            }}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4 text-slate-500" />
            Back to Bookings
          </button>

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-black tracking-tight text-slate-900">
                  Service Booking Details
                </h1>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    statusColors[selectedBooking.status] || "bg-slate-100 text-slate-700"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      selectedBooking.status === "Confirmed"
                        ? "bg-emerald-600"
                        : selectedBooking.status === "Pending"
                        ? "bg-amber-500"
                        : selectedBooking.status === "Completed"
                        ? "bg-blue-600"
                        : "bg-slate-400"
                    }`}
                  />
                  {selectedBooking.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                View detailed service booking information.
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              {!isDetailEditing ? (
                canUpdate && ["Pending", "Confirmed"].includes(selectedBooking.status) && (
                  <button
                    type="button"
                    onClick={() => {
                      populateForm(selectedBooking);
                      setIsDetailEditing(true);
                      setFormError("");
                    }}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-blue-600 bg-white px-5 text-xs font-bold text-blue-600 shadow-2xs hover:bg-blue-50 transition-colors cursor-pointer"
                  >
                    <Edit className="h-4 w-4" />
                    Edit Booking
                  </button>
                )
              ) : (
                <>
                  <button
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
                    type="button"
                    disabled={isSaving}
                    onClick={handleSaveDetail}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    <Save className="h-4 w-4" />
                    {isSaving ? "Saving..." : "Save Changes"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Card: Booking Information */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs space-y-6">
          {formError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-medium text-rose-700">
              {formError}
            </div>
          )}

          {/* Row 1: 4 columns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <span className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5">Booking ID</span>
              <div className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 flex items-center text-xs font-bold text-slate-900 font-mono">
                {selectedBooking.id}
              </div>
            </div>
            <div>
              <span className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5">Status</span>
              {!isDetailEditing ? (
                <div className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 flex items-center">
                  <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-bold rounded-full ${statusColors[selectedBooking.status] || "bg-slate-100 text-slate-700"}`}>
                    {selectedBooking.status}
                  </span>
                </div>
              ) : (
                <AdminSelect
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="h-10 text-xs w-full"
                >
                  <option value="Pending">Pending</option>
                  <option value="Confirmed">Confirmed</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
                </AdminSelect>
              )}
            </div>
            <div>
              <span className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5">Company User</span>
              {!isDetailEditing ? (
                <div className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 flex items-center text-xs font-bold text-slate-900 truncate" title={selectedBooking.customer}>
                  {selectedBooking.customer}
                </div>
              ) : (
                <AdminSelect
                  value={form.customerId}
                  onChange={(e) => setForm({ ...form, customerId: Number(e.target.value), vehicleId: 0 })}
                  className="h-10 text-xs w-full"
                >
                  <option value={0}>Select company user</option>
                  {customersData.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
                  ))}
                </AdminSelect>
              )}
            </div>
            <div>
              <span className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5">Company</span>
              <div className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 flex items-center text-xs font-bold text-slate-900 truncate" title={!isDetailEditing ? (selectedBooking.companyName || "—") : (formCustomerCompanyName || "—")}>
                {!isDetailEditing ? (selectedBooking.companyName || "—") : (formCustomerCompanyName || "Selected automatically")}
              </div>
            </div>
          </div>

          {/* Row 2: 3 columns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1.2fr_1.5fr] gap-4">
            <div>
              <span className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5">Vehicle</span>
              {!isDetailEditing ? (
                <div className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 flex items-center text-xs font-bold text-slate-900 font-mono">
                  {selectedBooking.vehicle}
                </div>
              ) : (
                <AdminSelect
                  value={form.vehicleId}
                  onChange={(e) => setForm({ ...form, vehicleId: Number(e.target.value) })}
                  className="h-10 text-xs w-full"
                  disabled={!form.customerId}
                >
                  <option value={0}>{!form.customerId ? "Select user first" : "Select vehicle"}</option>
                  {filteredVehiclesForForm.map((v) => (
                    <option key={v.id} value={v.id}>{v.regNo} - {v.brand} {v.model}</option>
                  ))}
                </AdminSelect>
              )}
            </div>
            <div>
              <span className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5">Service Type</span>
              {!isDetailEditing ? (
                <div className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 flex items-center text-xs font-bold text-slate-900">
                  {selectedBooking.service}
                </div>
              ) : (
                <input
                  type="text"
                  value={form.service}
                  onChange={(e) => setForm({ ...form, service: e.target.value })}
                  placeholder="e.g. Maintenance"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100 shadow-2xs"
                />
              )}
            </div>
            <div>
              <span className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5">Service Centre</span>
              {!isDetailEditing ? (
                <div className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 flex items-center text-xs font-bold text-slate-900 truncate" title={selectedBooking.location}>
                  {selectedBooking.location}
                </div>
              ) : (
                <AdminSelect
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  className="h-10 text-xs w-full"
                >
                  {form.location && !knownServiceCentres.includes(form.location) ? <option value={form.location}>{form.location}</option> : null}
                  {knownServiceCentres.map((centre) => <option key={centre} value={centre}>{centre}</option>)}
                </AdminSelect>
              )}
            </div>
          </div>

          {/* Row 3: Date & Time */}
          <div className={`grid grid-cols-1 sm:grid-cols-2 ${selectedBooking.technician && selectedBooking.technician !== "-" ? "lg:grid-cols-3" : ""} gap-4`}>
            <div>
              <span className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5">Date</span>
              {!isDetailEditing ? (
                <div className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 flex items-center text-xs font-bold text-slate-900 font-mono">
                  {selectedBooking.date}
                </div>
              ) : (
                <DesktopDatePicker
                  value={form.date}
                  onChange={(value) => setForm({ ...form, date: value })}
                  ariaLabel="Choose service date"
                  className="h-10 w-full"
                />
              )}
            </div>
            <div>
              <span className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5">Time</span>
              {!isDetailEditing ? (
                <div className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 flex items-center text-xs font-bold text-slate-900">
                  {formatBookingTime(selectedBooking.time)}
                </div>
              ) : (
                <DesktopTimePicker
                  value={form.time}
                  onChange={(value) => setForm({ ...form, time: value })}
                  ariaLabel="Choose service time"
                  className="h-10"
                />
              )}
            </div>
            {selectedBooking.technician && selectedBooking.technician !== "-" ? (
              <div>
                <span className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5">Assigned Staff</span>
                <div className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 flex items-center text-xs font-bold text-slate-900">
                  {selectedBooking.technician}
                </div>
              </div>
            ) : null}
          </div>

          {/* Row 4: Reported Problem */}
          <div>
            <span className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5">Reported Problem</span>
            {!isDetailEditing ? (
              <div className="min-h-[44px] py-2.5 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 flex items-center text-xs font-medium text-slate-800 leading-relaxed">
                {selectedBooking.reportedProblem || "No reported problem."}
              </div>
            ) : (
              <textarea
                value={form.reportedProblem}
                onChange={(e) => setForm({ ...form, reportedProblem: e.target.value })}
                placeholder="Describe reported problem..."
                className="min-h-24 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100 shadow-2xs"
              />
            )}
          </div>

          {/* Row 5: Driver Remarks & Notes */}
          <div>
            <span className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5">Driver Remarks &amp; Notes</span>
            {!isDetailEditing ? (
              <div className="min-h-[44px] py-2.5 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 flex items-center text-xs font-medium text-slate-800 leading-relaxed">
                {selectedBooking.customerNotes || "No driver notes recorded."}
              </div>
            ) : (
              <textarea
                value={form.customerNotes}
                onChange={(e) => setForm({ ...form, customerNotes: e.target.value })}
                placeholder="Driver comments or special requests..."
                className="min-h-20 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100 shadow-2xs"
              />
            )}
          </div>

          {/* Row 6: Workshop Remarks & Notes */}
          <div>
            <span className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5">Workshop Remarks &amp; Notes</span>
            {!isDetailEditing ? (
              <div className="min-h-[44px] py-2.5 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 flex items-center text-xs font-medium text-slate-800 leading-relaxed">
                {selectedBooking.technicianNotes || "No workshop notes recorded."}
              </div>
            ) : (
              <textarea
                value={form.technicianNotes}
                onChange={(e) => setForm({ ...form, technicianNotes: e.target.value })}
                placeholder="Internal checks, measurements or workshop notes..."
                className="min-h-20 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100 shadow-2xs"
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  if (modalMode === "create") {
    return (
      <div className="space-y-4">
        {/* Header with Back Button */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setModalMode(null)}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Bookings
            </button>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900">
                New Service Booking
              </h1>
              <p className="mt-0.5 text-xs text-slate-500">
                Record and schedule a vehicle maintenance appointment.
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-start gap-3 rounded-t-xl border-b border-slate-100 bg-white px-4 py-3.5 sm:px-5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                <UserRound className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">1. Customer &amp; vehicle</h3>
                <p className="mt-0.5 text-xs text-slate-500">Choose the company user first to show their available vehicles.</p>
              </div>
            </div>
            <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-2">
              <div>
                <label htmlFor="booking-customer" className="mb-1.5 block text-xs font-semibold text-slate-700">
                  Company user <span className="text-red-500">*</span>
                </label>
                <AdminSelect
                  id="booking-customer"
                  value={form.customerId}
                  onChange={(e) => setForm({ ...form, customerId: Number(e.target.value), vehicleId: 0 })}
                  className="w-full"
                  required
                >
                  <option value={0}>Select company user</option>
                  {customersData.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
                  ))}
                </AdminSelect>
              </div>
              <div>
                <label htmlFor="booking-vehicle" className="mb-1.5 block text-xs font-semibold text-slate-700">
                  Vehicle <span className="text-red-500">*</span>
                </label>
                <AdminSelect
                  id="booking-vehicle"
                  value={form.vehicleId}
                  onChange={(e) => setForm({ ...form, vehicleId: Number(e.target.value) })}
                  className="w-full"
                  required
                  disabled={!form.customerId}
                >
                  <option value={0}>{!form.customerId ? "Select a company user first" : "Select company vehicle"}</option>
                  {filteredVehiclesForForm.map((v) => (
                    <option key={v.id} value={v.id}>{v.regNo} - {v.brand} {v.model}</option>
                  ))}
                </AdminSelect>
              </div>
              <div className="md:col-span-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-blue-100 bg-blue-50/70 px-3.5 py-2.5 text-xs">
                <span className="font-semibold text-blue-900">Linked company</span>
                <span className="text-blue-700">{form.customerId ? (formCustomerCompanyName || "No company linked") : "Selected automatically after choosing a user"}</span>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-start gap-3 rounded-t-xl border-b border-slate-100 bg-white px-4 py-3.5 sm:px-5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
                <CalendarClock className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">2. Appointment</h3>
                <p className="mt-0.5 text-xs text-slate-500">Set what service is needed, then choose when and where.</p>
              </div>
            </div>
            <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-2">
              <div className="md:col-span-2">
                <label htmlFor="booking-service" className="mb-1.5 block text-xs font-semibold text-slate-700">
                  Service type <span className="text-red-500">*</span>
                </label>
                <input
                  id="booking-service"
                  type="text"
                  placeholder="e.g. Maintenance or brake repair"
                  value={form.service}
                  onChange={(e) => setForm({ ...form, service: e.target.value })}
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">Service date <span className="text-red-500">*</span></label>
                <DesktopDatePicker
                  value={form.date}
                  onChange={(value) => setForm({ ...form, date: value })}
                  ariaLabel="Choose service date"
                  className="h-10 w-full"
                  required
                />
              </div>
              <div>
                <label htmlFor="booking-time" className="mb-1.5 block text-xs font-semibold text-slate-700">Service time <span className="text-red-500">*</span></label>
                <DesktopTimePicker
                  value={form.time}
                  onChange={(value) => setForm({ ...form, time: value })}
                  ariaLabel="Choose service time"
                  className="h-10"
                  required
                />
              </div>
              <div className="md:col-span-2">
                <label htmlFor="booking-location" className="mb-1.5 block text-xs font-semibold text-slate-700">Service centre</label>
                <AdminSelect
                  id="booking-location"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  className="w-full"
                >
                  {form.location && !knownServiceCentres.includes(form.location) ? <option value={form.location}>{form.location}</option> : null}
                  {knownServiceCentres.map((centre) => <option key={centre} value={centre}>{centre}</option>)}
                </AdminSelect>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-start gap-3 rounded-t-xl border-b border-slate-100 bg-white px-4 py-3.5 sm:px-5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                <Wrench className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">3. Service request</h3>
                <p className="mt-0.5 text-xs text-slate-500">Capture the main issue first; supporting notes can be added below.</p>
              </div>
            </div>
            <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-2">
              <div className="md:col-span-2">
                <label htmlFor="booking-problem" className="mb-1.5 block text-xs font-semibold text-slate-700">Reported problem</label>
                <textarea
                  id="booking-problem"
                  placeholder="Describe the symptoms or issue reported by the driver..."
                  value={form.reportedProblem}
                  onChange={(e) => setForm({ ...form, reportedProblem: e.target.value })}
                  className="min-h-24 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label htmlFor="booking-customer-notes" className="mb-1.5 block text-xs font-semibold text-slate-700">Customer notes <span className="font-normal text-slate-400">(optional)</span></label>
                <textarea
                  id="booking-customer-notes"
                  placeholder="Driver comments or special requests..."
                  value={form.customerNotes}
                  onChange={(e) => setForm({ ...form, customerNotes: e.target.value })}
                  className="min-h-20 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label htmlFor="booking-technician-notes" className="mb-1.5 block text-xs font-semibold text-slate-700">Workshop notes <span className="font-normal text-slate-400">(optional)</span></label>
                <textarea
                  id="booking-technician-notes"
                  placeholder="Planned checks, measurements or workshop notes..."
                  value={form.technicianNotes}
                  onChange={(e) => setForm({ ...form, technicianNotes: e.target.value })}
                  className="min-h-20 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>
          </section>

          <div className="flex flex-col-reverse gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="text-xs text-slate-500"><span className="font-bold text-red-500">*</span> Required fields must be completed</p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="h-10 rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1e3a8a] px-6 text-sm font-semibold text-white shadow-sm hover:bg-blue-800"
              >
                <Save className="h-4 w-4" />
                {modalMode === "create" ? "Create Booking" : "Save Changes"}
              </button>
            </div>
          </div>
        </form>
      </div>
    );
  }


  const tabs = [
    { key: "All", label: "All", count: tabCounts.All, textColor: "text-blue-900" },
    { key: "Pending", label: "Pending", count: tabCounts.Pending, textColor: "text-amber-500" },
    { key: "Confirmed", label: "Confirmed", count: tabCounts.Confirmed, textColor: "text-emerald-600" },
    { key: "In Progress", label: "In Progress", count: tabCounts["In Progress"], textColor: "text-blue-600" },
    { key: "Completed", label: "Completed", count: tabCounts.Completed, textColor: "text-slate-600" },
    { key: "Cancelled", label: "Cancelled", count: tabCounts.Cancelled, textColor: "text-rose-600" },
  ];

  return (
    <div className="w-full space-y-4">
      {/* Top Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Booking Management</h1>
          <p className="text-xs text-slate-500 mt-0.5">Manage and track all workshop bookings.</p>
        </div>
        <div className="flex items-center gap-2.5">
          {canCreate ? (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#1e3a8a] px-4 text-xs font-bold text-white shadow-xs transition-colors hover:bg-blue-800 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              New Booking
            </button>
          ) : null}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-xs text-yellow-800">
          Database connection check: {error}. Showing local data values.
        </div>
      )}

      {/* Unified Filter & Tabs Card (matching Parts Management design) */}
      <div className="relative z-20 rounded-2xl border border-slate-200 bg-white shadow-2xs">
        {/* Top: Status Tabs */}
        <div className="flex items-center gap-6 sm:gap-8 border-b border-slate-100 px-6 pt-3.5 overflow-x-auto no-scrollbar">
          {(
            [
              { id: "All", label: "All Bookings", count: tabCounts.All },
              { id: "Pending", label: "Pending", count: tabCounts.Pending, badgeColor: tabCounts.Pending > 0 ? "bg-amber-100 text-amber-800" : undefined },
              { id: "Confirmed", label: "Confirmed", count: tabCounts.Confirmed, badgeColor: tabCounts.Confirmed > 0 ? "bg-emerald-100 text-emerald-800" : undefined },
              { id: "In Progress", label: "In Progress", count: tabCounts["In Progress"], badgeColor: tabCounts["In Progress"] > 0 ? "bg-blue-100 text-blue-800" : undefined },
              { id: "Completed", label: "Completed", count: tabCounts.Completed, badgeColor: tabCounts.Completed > 0 ? "bg-slate-100 text-slate-700" : undefined },
              { id: "Cancelled", label: "Cancelled", count: tabCounts.Cancelled, badgeColor: tabCounts.Cancelled > 0 ? "bg-rose-100 text-rose-700" : undefined },
            ] as { id: string; label: string; count: number; badgeColor?: string }[]
          ).map((tab) => {
            const isActive = selectedStatus === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  applyStatusFilter(tab.id);
                  setCurrentPage(1);
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
        <div className="grid grid-cols-1 gap-3 px-6 py-4 md:grid-cols-[1.5fr_1.1fr_1.1fr_auto]">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search booking, customer, vehicle..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-xs shadow-2xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100"
            />
          </div>

          {/* Company Filter */}
          <div>
            <AdminSelect
              value={selectedCompany}
              onChange={(e) => {
                setSelectedCompany(e.target.value);
                setCurrentPage(1);
              }}
              placement="bottom"
              className="h-10 w-full text-xs"
            >
              <option value="All">All Companies</option>
              {companiesData.map((comp) => (
                <option key={comp.id} value={comp.name}>
                  {comp.name}
                </option>
              ))}
            </AdminSelect>
          </div>

          {/* Date Range Picker */}
          <div>
            <DesktopDatePicker
              value={startDate}
              onChange={(val) => {
                setStartDate(val);
                setCurrentPage(1);
              }}
              placeholder="Date Range"
              ariaLabel="Date Range"
              allowPastDates
              className="h-10 text-xs w-full bg-white rounded-xl border-slate-200"
            />
          </div>

          {/* Reset Button */}
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

      {/* Bookings Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50/70">
              <tr>
                <SortableHeader columnKey="id" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleHeaderSort} className="px-5 py-3.5 text-left">
                  Booking No.
                </SortableHeader>
                <SortableHeader columnKey="customer" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleHeaderSort} className="px-5 py-3.5 text-left">
                  Customer / Contact
                </SortableHeader>
                <SortableHeader columnKey="company" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleHeaderSort} className="px-5 py-3.5 text-left">
                  Company
                </SortableHeader>
                <SortableHeader columnKey="vehicle" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleHeaderSort} className="px-5 py-3.5 text-left">
                  Vehicle
                </SortableHeader>
                <th className="px-5 py-3.5 text-left text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                  Service Type
                </th>
                <SortableHeader columnKey="date" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleHeaderSort} className="px-5 py-3.5 text-left">
                  Date &amp; Time
                </SortableHeader>
                <SortableHeader columnKey="status" currentSortKey={sortKey} currentDirection={sortDirection} onSort={handleHeaderSort} className="px-5 py-3.5 text-left">
                  Status
                </SortableHeader>
                <th className="px-5 py-3.5 text-right whitespace-nowrap text-[11px] font-extrabold uppercase tracking-wider text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-xs">
              {paginatedBookings.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-xs text-slate-500">
                    No bookings found matching the selected filters.
                  </td>
                </tr>
              ) : (
                paginatedBookings.map((booking) => (
                  <tr key={booking.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-4 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openViewModal(booking)}
                        className="font-bold text-slate-900 transition-colors hover:text-blue-600 cursor-pointer text-left"
                      >
                        {booking.id}
                      </button>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-slate-800 font-medium">
                      {booking.customer}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-slate-600">
                      {booking.companyName && booking.companyName !== "-" ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/companies?${booking.companyId ? `companyId=${booking.companyId}` : `search=${encodeURIComponent(booking.companyName || "")}`}`);
                          }}
                          className="font-bold text-slate-900 transition-colors hover:text-blue-600 cursor-pointer text-left"
                        >
                          {booking.companyName}
                        </button>
                      ) : "-"}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap font-medium text-slate-800">
                      {booking.vehicle && booking.vehicle !== "-" ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/equipment?${booking.vehicleId ? `vehicleId=${booking.vehicleId}` : `plate=${encodeURIComponent(booking.vehicle)}`}`);
                          }}
                          className="font-bold text-slate-900 transition-colors hover:text-blue-600 cursor-pointer text-left"
                        >
                          {booking.vehicle}
                        </button>
                      ) : "-"}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-slate-700">
                      {booking.service || "-"}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-slate-700">
                      {formatBookingDateDisplay(booking.date, booking.time)}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-3 py-1 text-xs font-semibold rounded-full ${statusColors[booking.status] || "bg-slate-100 text-slate-700"}`}>
                        {booking.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openViewModal(booking)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-blue-700 transition-colors cursor-pointer"
                          title="View Details"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </button>
                        
                        {((canUpdate && ["Pending", "Confirmed"].includes(booking.status)) || (canDelete && ["Pending", "Cancelled"].includes(booking.status))) ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-2xs hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer"
                                aria-label="More actions"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48 text-xs font-medium">
                              {canUpdate && booking.status === "Pending" ? (
                                <DropdownMenuItem onClick={() => handleUpdateStatus(booking, "Confirmed")} className="cursor-pointer text-emerald-700">
                                  <CheckCircle className="mr-2 h-4 w-4 text-emerald-600" />
                                  Confirm Booking
                                </DropdownMenuItem>
                              ) : null}
                              {canUpdate && booking.status === "Confirmed" ? (
                                <DropdownMenuItem onClick={() => openCheckInModal(booking)} className="cursor-pointer text-blue-700">
                                  <ClipboardPlus className="mr-2 h-4 w-4 text-blue-600" />
                                  Check In / Work Order
                                </DropdownMenuItem>
                              ) : null}
                              {canUpdate && ["Pending", "Confirmed"].includes(booking.status) ? (
                                <DropdownMenuItem onClick={() => handleUpdateStatus(booking, "Cancelled")} className="cursor-pointer text-amber-700">
                                  <XCircle className="mr-2 h-4 w-4 text-amber-600" />
                                  Cancel Booking
                                </DropdownMenuItem>
                              ) : null}
                              {canDelete && ["Pending", "Cancelled"].includes(booking.status) ? (
                                <DropdownMenuItem onClick={() => handleDeleteBooking(booking)} className="cursor-pointer text-rose-700">
                                  <Trash2 className="mr-2 h-4 w-4 text-rose-600" />
                                  Delete Booking
                                </DropdownMenuItem>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <AdminPagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={pageSize}
          pageSizeOptions={[10, 25, 50, 100]}
          onPageChange={setCurrentPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setCurrentPage(1);
          }}
          itemLabel="bookings"
        />
      </div>



      {checkInTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-5">
          <div className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-7 sm:py-5">
              <div className="flex items-start gap-3.5"><div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-[#1e3a8a] ring-1 ring-blue-100"><ClipboardPlus className="h-5 w-5" /></div><div>
                <h2 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">Check In &amp; Create Work Order</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500 sm:text-sm">{checkInTarget.id} · {checkInTarget.vehicle}</p>
              </div></div>
              <button
                type="button"
                disabled={isCheckingIn}
                onClick={() => setCheckInTarget(null)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                aria-label="Close check-in dialog"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/80 p-4 sm:p-6">
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                This will record the vehicle check-in time, create a linked work order, and move the booking to In Progress.
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Booked Appointment</p>
                <div className="mt-2 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500">Service Date</p>
                    <p className="mt-0.5 text-sm font-semibold text-gray-900">{checkInTarget.date || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Service Time</p>
                    <p className="mt-0.5 text-sm font-semibold text-gray-900">{formatBookingTime(checkInTarget.time)}</p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-gray-500">Actual check-in time is recorded when you confirm.</p>
              </div>

              <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-700">Priority</label>
                  <AdminSelect
                    value={checkInForm.priority}
                    onChange={(event) => setCheckInForm({ ...checkInForm, priority: event.target.value })}
                    className="w-full"
                  >
                    {["Low", "Normal", "High", "Urgent"].map((priority) => (
                      <option key={priority} value={priority}>{priority}</option>
                    ))}
                  </AdminSelect>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-700">Workshop Bay</label>
                  <AdminSelect
                    value={checkInForm.bay}
                    onChange={(event) => setCheckInForm({ ...checkInForm, bay: event.target.value })}
                    className="w-full"
                  >
                    <option value="">Unassigned</option>
                    {["Bay 1", "Bay 2", "Bay 3", "Bay 4", "Engine Bay", "Trailer Bay"].map((bay) => (
                      <option key={bay} value={bay}>{bay}</option>
                    ))}
                  </AdminSelect>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-700">Check-in Mileage (km)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder={checkInVehicleMileage > 0 ? `Min ${checkInVehicleMileage.toLocaleString()} km` : "e.g. 125000"}
                    value={checkInForm.checkinMileage}
                    onChange={(event) => setCheckInForm({ ...checkInForm, checkinMileage: event.target.value })}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  {checkInVehicleMileage > 0 && (
                    <p className="mt-1 text-xs text-slate-500">
                      Last recorded: <span className="font-semibold text-slate-700">{checkInVehicleMileage.toLocaleString()} km</span> (Cannot decrease)
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-700">Expected Completion Date</label>
                  <DesktopDatePicker
                    value={checkInForm.estimatedOut}
                    onChange={(estimatedOut) => setCheckInForm({ ...checkInForm, estimatedOut })}
                    ariaLabel="Choose expected completion date"
                    disablePast
                    className="w-full"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-700">Foreman</label>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-2">
                  {workOrderStaff.length === 0 ? (
                    <p className="px-2 py-3 text-center text-xs text-gray-500">No active foreman. You can assign one later in Work Orders.</p>
                  ) : workOrderStaff.map((member) => (
                    <label key={member.id} className="flex cursor-pointer items-center justify-between rounded-md bg-white px-3 py-2 text-sm hover:bg-blue-50">
                      <span>
                        <span className="font-medium text-gray-900">{member.name}</span>
                        <span className="ml-2 text-xs text-gray-500">{member.role}</span>
                      </span>
                      <input
                        type="radio"
                        name="checkin_technician"
                        checked={checkInForm.technicianIds.includes(member.id)}
                        onChange={() => setCheckInForm({
                          ...checkInForm,
                          technicianIds: [member.id],
                        })}
                        className="h-4 w-4 border-gray-300 text-blue-700 focus:ring-blue-500"
                      />
                    </label>
                  ))}
                </div>
              </div>
              </section>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-white px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
              <p className="text-xs text-slate-500">Actual check-in time is recorded on confirmation</p><div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={isCheckingIn}
                onClick={() => setCheckInTarget(null)}
                className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isCheckingIn}
                onClick={handleCheckIn}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#1e3a8a] px-5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 disabled:opacity-50"
              >
                <ClipboardPlus className="h-4 w-4" />{isCheckingIn ? "Checking In..." : "Confirm Check In"}
              </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
