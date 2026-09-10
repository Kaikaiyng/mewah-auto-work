import { Link, useLocation, useNavigate, useOutlet } from "react-router";
import {
  Home,
  Users,
  Building2,
  Car,
  Calendar,
  Package,
  ShoppingCart,
  FileText,
  Bell,
  BarChart3,
  Settings,
  Menu,
  X,
  LogOut,
  ClipboardList,
  UserCog,
  Info,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CalendarClock,
  Landmark,
  Handshake,
  ShieldCheck,
  Activity,
  LayoutDashboard,
  AlertTriangle,
  CheckCircle2,
  Check,
} from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";
import { useLanguage } from "../contexts/language-context";
import { clearAdminAuth } from "./login-page";
import { useApiData } from "../lib/use-api-data";
import { postApi } from "../lib/api";
import { canAccessAdminPath, getSignedInAdmin } from "../lib/admin-permissions";
import mawLogo from "../../MAW_logo.png";

const APP_VERSION = "0.2.0";
const SIDEBAR_COLLAPSED_KEY = "maw-admin-sidebar-collapsed";
const EXPANDED_SECTIONS_KEY = "maw-admin-expanded-sections";
const READ_NOTIFICATIONS_KEY = "maw-admin-read-notifications";

interface NotificationItem {
  id: number | string;
  title: string;
  message: string;
  type: string;
  date: string;
  actionRoute?: string;
}

const navStructure: Array<
  | {
      type: "single";
      path: string;
      nameKey: string;
      icon: any;
    }
  | {
      type: "group";
      id: string;
      titleKey: string;
      icon: any;
      items: Array<{ nameKey: string; path: string }>;
    }
> = [
  {
    type: "single",
    path: "/",
    nameKey: "dashboard",
    icon: LayoutDashboard,
  },
  {
    type: "group",
    id: "workshop",
    titleKey: "workshop",
    icon: ClipboardList,
    items: [
      { nameKey: "bookings_nav", path: "/bookings" },
      { nameKey: "work_orders", path: "/work-orders" },
    ],
  },
  {
    type: "group",
    id: "customers_group",
    titleKey: "customers_group",
    icon: Building2,
    items: [
      { nameKey: "companies", path: "/companies" },
      { nameKey: "vehicles", path: "/equipment" },
    ],
  },
  {
    type: "group",
    id: "inventory",
    titleKey: "inventory",
    icon: Package,
    items: [
      { nameKey: "parts_inventory", path: "/parts" },
      { nameKey: "parts_orders", path: "/orders" },
      { nameKey: "purchase_orders", path: "/purchase-orders" },
    ],
  },
  {
    type: "group",
    id: "finance",
    titleKey: "finance",
    icon: FileText,
    items: [
      { nameKey: "invoices", path: "/invoices" },
      { nameKey: "reports", path: "/reports" },
    ],
  },
  {
    type: "group",
    id: "admin_group",
    titleKey: "admin_group",
    icon: ShieldCheck,
    items: [
      { nameKey: "master_data", path: "/master-data" },
      { nameKey: "staff", path: "/staff" },
      { nameKey: "autocount_sync", path: "/autocount-sync" },
      { nameKey: "audit_trail", path: "/audit-trail" },
      { nameKey: "app_logs", path: "/app-logs" },
    ],
  },
  {
    type: "single",
    path: "/settings",
    nameKey: "settings",
    icon: Settings,
  },
];

function getNotificationVisual(type?: string, title?: string) {
  const t = (type || "").toLowerCase();
  const text = (title || "").toLowerCase();
  if (t.includes("quotation") || text.includes("quotation") || text.includes("invoice") || text.includes("bill")) {
    return {
      icon: FileText,
      iconClass: "text-blue-600 bg-blue-50 border-blue-200/60",
    };
  }
  if (t.includes("warning") || t.includes("alert") || text.includes("urgent") || text.includes("warning") || text.includes("overdue")) {
    return {
      icon: AlertTriangle,
      iconClass: "text-amber-600 bg-amber-50 border-amber-200/60",
    };
  }
  if (t.includes("success") || text.includes("approved") || text.includes("ready") || text.includes("completed") || text.includes("collected")) {
    return {
      icon: CheckCircle2,
      iconClass: "text-emerald-600 bg-emerald-50 border-emerald-200/60",
    };
  }
  if (t.includes("work") || text.includes("work order") || text.includes("wo-")) {
    return {
      icon: ClipboardList,
      iconClass: "text-indigo-600 bg-indigo-50 border-indigo-200/60",
    };
  }
  if (t.includes("booking") || text.includes("booking") || text.includes("appointment")) {
    return {
      icon: Calendar,
      iconClass: "text-purple-600 bg-purple-50 border-purple-200/60",
    };
  }
  return {
    icon: Bell,
    iconClass: "text-slate-600 bg-slate-100 border-slate-200/60",
  };
}

export function DashboardLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const outlet = useOutlet();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
    } catch {
      return false;
    }
  });

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
    // Check if current route belongs to any group initially
    for (const nav of navStructure) {
      if (nav.type === "group") {
        const hasActiveChild = nav.items.some((item) => item.path === location.pathname);
        if (hasActiveChild) {
          return { [nav.id]: true };
        }
      }
    }
    try {
      const saved = window.localStorage.getItem(EXPANDED_SECTIONS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const activeKey = Object.keys(parsed).find((k) => parsed[k] === true);
        if (activeKey) {
          return { [activeKey]: true };
        }
        return {};
      }
    } catch {
      // fallback
    }
    return {
      workshop: true,
    };
  });

  const toggleSection = (sectionKey: string) => {
    setExpandedSections((prev) => {
      const isCurrentlyExpanded = Boolean(prev[sectionKey]);
      const next: Record<string, boolean> = isCurrentlyExpanded ? {} : { [sectionKey]: true };
      try {
        window.localStorage.setItem(EXPANDED_SECTIONS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Auto-expand section if current route is inside it (and close others)
  useEffect(() => {
    for (const nav of navStructure) {
      if (nav.type === "group") {
        const hasActiveChild = nav.items.some((item) => item.path === location.pathname);
        if (hasActiveChild) {
          setExpandedSections((prev) => {
            const activeKeys = Object.keys(prev).filter((k) => prev[k]);
            if (prev[nav.id] && activeKeys.length === 1) {
              return prev;
            }
            const next = { [nav.id]: true };
            try {
              window.localStorage.setItem(EXPANDED_SECTIONS_KEY, JSON.stringify(next));
            } catch {}
            return next;
          });
          break;
        }
      }
    }
  }, [location.pathname]);
  const { t } = useLanguage();
  const signedInAdmin = getSignedInAdmin();
  const canViewNotifications = canAccessAdminPath("/notifications", signedInAdmin.role);
  const canViewBookings = canAccessAdminPath("/bookings", signedInAdmin.role);
  const canViewVehicles = canAccessAdminPath("/equipment", signedInAdmin.role);
  const { currentGroupName, currentPageName } = (() => {
    if (location.pathname === "/") {
      return { currentGroupName: null, currentPageName: t("dashboard") };
    }
    for (const nav of navStructure) {
      if (nav.type === "single" && nav.path === location.pathname) {
        return { currentGroupName: null, currentPageName: t(nav.nameKey) };
      }
      if (nav.type === "group") {
        const found = nav.items.find((item) => item.path === location.pathname);
        if (found) {
          return { currentGroupName: t(nav.titleKey), currentPageName: t(found.nameKey) };
        }
      }
    }
    if (location.pathname === "/notifications") {
      return { currentGroupName: t("admin_group"), currentPageName: t("notifications") };
    }
    return { currentGroupName: null, currentPageName: "Admin Panel" };
  })();

  // Notification states & API
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(() => {
    try {
      const saved = window.localStorage.getItem(READ_NOTIFICATIONS_KEY);
      if (saved) return new Set(JSON.parse(saved));
    } catch {
      // fallback
    }
    return new Set();
  });
  const dropdownRef = useRef<HTMLDivElement>(null);

  const saveReadNotificationIds = (newSet: Set<string>) => {
    setReadNotificationIds(newSet);
    try {
      window.localStorage.setItem(READ_NOTIFICATIONS_KEY, JSON.stringify(Array.from(newSet)));
    } catch {}
  };

  const markSingleNotificationRead = (id: number | string) => {
    const next = new Set(readNotificationIds);
    next.add(String(id));
    saveReadNotificationIds(next);
  };

  const markAllNotificationsRead = () => {
    const next = new Set(readNotificationIds);
    notifications.forEach((n) => next.add(String(n.id)));
    saveReadNotificationIds(next);
  };

  const { data: partsAlertData, reload: reloadPartsAlert } = useApiData<{ hasUnacknowledgedParts: boolean; count: number }>(
    "admin-unacknowledged-parts-alert",
    { hasUnacknowledgedParts: false, count: 0 },
    true,
  );

  const { data: pendingBookingsData, reload: reloadPendingBookings } = useApiData<{ hasPendingBookings: boolean; count: number }>(
    "admin-pending-bookings-alert",
    { hasPendingBookings: false, count: 0 },
    canViewBookings,
  );

  const {
    data: pendingVehiclesAlertData,
    reload: reloadPendingVehiclesAlert,
    error: pendingVehiclesAlertError,
  } = useApiData<{ hasPendingVehicles: boolean; count: number }>(
    "admin-pending-vehicles-alert",
    { hasPendingVehicles: false, count: 0 },
    canViewVehicles,
  );

  const {
    data: vehiclesData,
    reload: reloadVehiclesData,
  } = useApiData<Array<{ verificationStatus?: string; status?: string }>>(
    "admin-vehicles",
    [],
    canViewVehicles && Boolean(pendingVehiclesAlertError),
  );

  const { data: notifications, reload: reloadNotifications } = useApiData<NotificationItem[]>(
    "admin-notifications",
    [],
    canViewNotifications,
  );

  const unreadNotificationsCount = useMemo(() => {
    return notifications.filter((n) => !readNotificationIds.has(String(n.id))).length;
  }, [notifications, readNotificationIds]);

  useEffect(() => {
    const interval = setInterval(() => {
      void reloadPartsAlert();
      if (canViewBookings) void reloadPendingBookings();
      if (canViewVehicles) {
        void reloadPendingVehiclesAlert();
        if (pendingVehiclesAlertError) void reloadVehiclesData();
      }
      if (canViewNotifications) void reloadNotifications();
    }, 8000);
    const handlePartsUpdate = () => {
      void reloadPartsAlert();
      if (canViewNotifications) void reloadNotifications();
    };
    window.addEventListener("work-order-parts-updated", handlePartsUpdate);
    const handleBookingsUpdate = () => {
      if (canViewBookings) void reloadPendingBookings();
    };
    window.addEventListener("admin-bookings-updated", handleBookingsUpdate);
    const handleVehiclesUpdate = () => {
      if (canViewVehicles) {
        void reloadPendingVehiclesAlert();
        void reloadVehiclesData();
      }
    };
    window.addEventListener("admin-vehicles-updated", handleVehiclesUpdate);
    return () => {
      clearInterval(interval);
      window.removeEventListener("work-order-parts-updated", handlePartsUpdate);
      window.removeEventListener("admin-bookings-updated", handleBookingsUpdate);
      window.removeEventListener("admin-vehicles-updated", handleVehiclesUpdate);
    };
  }, [
    canViewBookings,
    canViewNotifications,
    canViewVehicles,
    pendingVehiclesAlertError,
    reloadNotifications,
    reloadPartsAlert,
    reloadPendingBookings,
    reloadPendingVehiclesAlert,
    reloadVehiclesData,
  ]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleLogout = async () => {
    try {
      await postApi<void>("admin-logout", {});
    } catch {
      // Local credentials are still cleared if the server is unavailable.
    } finally {
      clearAdminAuth();
      navigate("/login", { replace: true });
    }
  };

  const toggleDesktopSidebar = () => {
    setSidebarCollapsed((currentValue) => {
      const nextValue = !currentValue;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(nextValue));
      } catch {
        // The sidebar still works when browser storage is unavailable.
      }
      return nextValue;
    });
  };

  const sidebarLabelClass = (compact: boolean) => `min-w-0 shrink-0 whitespace-nowrap transition-[opacity,transform] duration-100 ${
    compact
      ? "pointer-events-none translate-x-1 opacity-0"
      : "translate-x-0 opacity-100 delay-75"
  }`;

  const hasWorkOrderPartsAlert = useMemo(() => {
    return Boolean(partsAlertData?.hasUnacknowledgedParts);
  }, [partsAlertData]);

  const pendingBookingsCount = Math.max(0, Number(pendingBookingsData?.count || 0));
  const hasPendingBookings = pendingBookingsCount > 0;

  const pendingVehiclesCount = useMemo(() => {
    if (!canViewVehicles) return 0;
    if (!pendingVehiclesAlertError && pendingVehiclesAlertData?.count !== undefined) {
      return Math.max(0, Number(pendingVehiclesAlertData.count));
    }
    return vehiclesData.filter((v) => {
      const vStatus = (v.verificationStatus || "").toLowerCase();
      const status = (v.status || "").toLowerCase();
      return vStatus === "pending" || status === "pending verification";
    }).length;
  }, [canViewVehicles, pendingVehiclesAlertError, pendingVehiclesAlertData, vehiclesData]);
  const hasPendingVehicles = pendingVehiclesCount > 0;

  const renderNavItems = (onItemClick?: () => void, compact = false) => {
    return (
      <nav className="space-y-1.5 font-sans">
        {navStructure.map((entry) => {
          if (entry.type === "single") {
            if (!canAccessAdminPath(entry.path, signedInAdmin.role)) return null;
            const isActive = location.pathname === entry.path;
            return (
              <Link
                key={entry.path}
                to={entry.path}
                onClick={onItemClick}
                title={compact ? t(entry.nameKey) : undefined}
                aria-label={compact ? t(entry.nameKey) : undefined}
                className={`group relative flex items-center rounded-xl px-3.5 py-2.5 text-[13px] font-semibold transition-all ${
                  isActive
                    ? "bg-blue-50/90 text-[#1e3a8a] font-bold shadow-xs"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <div className="relative mr-3 flex-shrink-0">
                  <entry.icon
                    className={`h-[18px] w-[18px] transition-colors ${
                      isActive
                        ? "text-[#1e3a8a]"
                        : "text-slate-500 group-hover:text-slate-700"
                    }`}
                  />
                </div>
                <span className={sidebarLabelClass(compact)}>{t(entry.nameKey)}</span>
              </Link>
            );
          }

          // Group item
          const accessibleItems = entry.items.filter((item) =>
            canAccessAdminPath(item.path, signedInAdmin.role)
          );
          if (accessibleItems.length === 0) return null;

          const isExpanded = expandedSections[entry.id] ?? false;
          const hasActiveChild = accessibleItems.some(
            (item) => location.pathname === item.path
          );
          const hasAlert =
            (entry.id === "workshop" && (hasWorkOrderPartsAlert || hasPendingBookings)) ||
            (entry.id === "customers_group" && hasPendingVehicles);

          if (compact) {
            return (
              <div key={entry.id} className="space-y-1 pt-1 border-t border-slate-100/70">
                {accessibleItems.map((item) => {
                  const isActive = location.pathname === item.path;
                  const showItemDot =
                    (item.path === "/bookings" && hasPendingBookings) ||
                    (item.path === "/equipment" && hasPendingVehicles) ||
                    (item.path === "/work-orders" && hasWorkOrderPartsAlert);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={onItemClick}
                      title={t(item.nameKey)}
                      aria-label={t(item.nameKey)}
                      className={`group relative flex items-center justify-center rounded-xl p-2.5 text-[13px] font-semibold transition-colors ${
                        isActive
                          ? "bg-blue-50 text-[#1e3a8a] font-bold"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                    >
                      <entry.icon
                        className={`h-[18px] w-[18px] transition-colors ${
                          isActive
                            ? "text-[#1e3a8a]"
                            : "text-slate-500 group-hover:text-slate-700"
                        }`}
                      />
                      {showItemDot ? (
                        <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500"></span>
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            );
          }

          return (
            <div key={entry.id} className="space-y-0.5">
              {/* Group Header Button */}
              <button
                type="button"
                onClick={() => toggleSection(entry.id)}
                className={`group flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-[13px] font-semibold transition-all cursor-pointer ${
                  isExpanded || hasActiveChild
                    ? "bg-blue-50/80 text-[#1e3a8a] font-bold"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
                aria-expanded={isExpanded}
              >
                <div className="flex items-center min-w-0">
                  <entry.icon
                    className={`mr-3 h-[18px] w-[18px] flex-shrink-0 transition-colors ${
                      isExpanded || hasActiveChild
                        ? "text-[#1e3a8a]"
                        : "text-slate-500 group-hover:text-slate-700"
                    }`}
                  />
                  <span className={sidebarLabelClass(compact)}>{t(entry.titleKey)}</span>
                  {hasAlert ? (
                    <span className="relative ml-2 flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500"></span>
                    </span>
                  ) : null}
                </div>
                {!compact && (
                  <ChevronRight
                    className={`h-4 w-4 transition-transform duration-300 ease-in-out ${
                      isExpanded
                        ? "rotate-90 text-[#1e3a8a]"
                        : "rotate-0 text-slate-400 group-hover:text-slate-600"
                    }`}
                  />
                )}
              </button>

              {/* Sub-items list with silky smooth grid-height accordion transition */}
              <div
                className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${
                  isExpanded
                    ? "grid-rows-[1fr] opacity-100"
                    : "grid-rows-[0fr] opacity-0 pointer-events-none"
                }`}
              >
                <div className="overflow-hidden">
                  <div className="ml-5 border-l-2 border-blue-200/80 pl-4 py-1 space-y-1">
                    {accessibleItems.map((item) => {
                      const isActive = location.pathname === item.path;
                      const showPartsDot =
                        item.path === "/work-orders" && hasWorkOrderPartsAlert;
                      const showBookingsCount =
                        item.path === "/bookings" && hasPendingBookings;
                      const showVehiclesCount =
                        item.path === "/equipment" && hasPendingVehicles;
                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          onClick={onItemClick}
                          className={`group relative flex items-center justify-between rounded-lg px-2 py-1.5 text-[13px] transition-colors ${
                            isActive
                              ? "font-bold text-[#1e3a8a]"
                              : "font-medium text-slate-500 hover:text-[#1e3a8a]"
                          }`}
                        >
                          <span className="truncate">{t(item.nameKey)}</span>
                          {showBookingsCount ? (
                            <span
                              className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white"
                              aria-label={`${pendingBookingsCount} pending bookings`}
                              title={`${pendingBookingsCount} pending bookings`}
                            >
                              {pendingBookingsCount > 99 ? "99+" : pendingBookingsCount}
                            </span>
                          ) : null}
                          {showVehiclesCount ? (
                            <span
                              className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white"
                              aria-label={`${pendingVehiclesCount} pending vehicle applications`}
                              title={`${pendingVehiclesCount} pending vehicle applications`}
                            >
                              {pendingVehiclesCount > 99 ? "99+" : pendingVehiclesCount}
                            </span>
                          ) : null}
                          {showPartsDot ? (
                            <span className="relative flex h-2 w-2">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
                              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500"></span>
                            </span>
                          ) : null}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </nav>
    );
  };

  const renderSidebarFooter = (onLogout?: () => void, compact = false) => (
    <div className="mt-auto flex-shrink-0 pt-2 border-t border-slate-100/80 space-y-1">
      <div
        className="flex items-center overflow-hidden rounded-xl px-3.5 py-2 text-slate-500"
        title={compact ? `Admin Portal · Version ${APP_VERSION}` : undefined}
      >
        <Info className="mr-3 h-[18px] w-[18px] flex-shrink-0 text-slate-400" />
        <div className={sidebarLabelClass(compact)}>
          <p className="text-xs font-semibold text-slate-700">Admin Portal</p>
          <p className="text-[10px] text-slate-400">Version {APP_VERSION}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          onLogout?.();
          void handleLogout();
        }}
        title={compact ? "Log out" : undefined}
        aria-label={compact ? "Log out" : undefined}
        className="group flex w-full items-center overflow-hidden rounded-xl px-3.5 py-2 text-left text-[13px] font-semibold text-slate-600 transition-colors hover:bg-red-50 hover:text-red-600"
      >
        <LogOut className="mr-3 h-[18px] w-[18px] flex-shrink-0 text-red-500 transition-colors group-hover:text-red-600" />
        <span className={sidebarLabelClass(compact)}>Log out</span>
      </button>
    </div>
  );

  return (
    <div className="maw-admin-shell min-h-screen overflow-x-hidden bg-[#f6f7fb]">
      {/* Sidebar for desktop with smoothly gliding attached toggle tab */}
      <div className={`maw-admin-sidebar hidden z-30 transform-gpu transition-transform duration-200 ease-out lg:fixed lg:inset-y-0 lg:flex lg:flex-col lg:w-64 ${sidebarCollapsed ? "lg:-translate-x-full" : "lg:translate-x-0"}`}>
        <div className="relative flex h-full flex-grow flex-col overflow-visible border-r border-slate-200 bg-white shadow-[5px_0_24px_rgba(15,23,42,0.04)]">
          <div className="flex h-20 flex-shrink-0 items-center justify-center overflow-hidden border-b border-slate-100 bg-white px-3">
            <div className="flex h-14 w-full items-center justify-center">
              <img
                src={mawLogo}
                className="h-auto w-[145px] object-contain"
                alt="Mewah AutoWorks"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={toggleDesktopSidebar}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full z-30 flex h-11 w-6 items-center justify-center rounded-r-xl border border-l-0 border-slate-200 bg-white text-slate-400 shadow-sm transition-all hover:w-7.5 hover:bg-slate-50 hover:text-slate-700 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 cursor-pointer"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
          <div className="maw-sidebar-scroll flex min-h-0 flex-1 flex-col justify-between px-2.5 py-3">
            {renderNavItems(undefined, false)}
            {renderSidebarFooter(undefined, false)}
          </div>
        </div>
      </div>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-gray-600 bg-opacity-75"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 flex w-64 flex-col bg-white shadow-2xl">
            <div className="flex h-20 flex-shrink-0 items-center justify-between overflow-hidden border-b border-slate-100 bg-white px-4">
              <div className="flex h-14 w-36 items-center justify-center">
                <img
                  src={mawLogo}
                  className="h-auto w-[145px] object-contain"
                  alt="Mewah AutoWorks"
                />
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close navigation"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="maw-sidebar-scroll flex min-h-0 flex-1 flex-col justify-between px-2.5 py-3">
              {renderNavItems(() => setSidebarOpen(false))}
              {renderSidebarFooter(() => setSidebarOpen(false))}
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className={`maw-admin-main flex flex-1 flex-col transition-[padding] duration-200 ease-out ${sidebarCollapsed ? "lg:pl-0" : "lg:pl-64"}`}>
        {/* Top bar */}
        <div className={`sticky top-0 ${notificationsOpen ? "z-50" : "z-40"} flex h-14 border-b border-slate-200 bg-white/95 backdrop-blur`}>
          <button
            type="button"
            className="px-4 text-gray-500 lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex flex-1 justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex flex-1 items-center gap-2 text-sm min-w-0">
              <span className="hidden text-gray-400 sm:inline flex-shrink-0">MewahAutoWorks</span>
              {currentGroupName ? (
                <>
                  <span className="hidden text-gray-300 sm:inline flex-shrink-0">/</span>
                  <span className="hidden text-gray-500 sm:inline flex-shrink-0">{currentGroupName}</span>
                </>
              ) : null}
              <span className="hidden text-gray-300 sm:inline flex-shrink-0">/</span>
              <h2 className="text-sm font-semibold text-gray-800 truncate">{currentPageName}</h2>
            </div>
            <div className="flex items-center space-x-4">
              {canViewNotifications ? <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setNotificationsOpen(!notificationsOpen)}
                  className={`relative flex h-9 w-9 items-center justify-center rounded-xl border transition-all cursor-pointer focus:outline-none ${
                    notificationsOpen
                      ? "border-blue-300 bg-blue-50 text-[#1e3a8a] shadow-xs"
                      : "border-slate-200 bg-white text-slate-600 shadow-2xs hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                  aria-label="Notifications"
                >
                  <Bell className="h-4.5 w-4.5" />
                  {unreadNotificationsCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white ring-2 ring-white shadow-xs animate-in zoom-in">
                      {unreadNotificationsCount > 99 ? "99+" : unreadNotificationsCount}
                    </span>
                  )}
                </button>

                {/* Dropdown Popover */}
                {notificationsOpen && (
                  <div className="absolute right-0 mt-2.5 w-84 sm:w-[410px] rounded-2xl border border-slate-200/90 bg-white shadow-2xl z-50 overflow-hidden ring-1 ring-black/5 animate-in fade-in slide-in-from-top-1.5 duration-150">
                    <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/75 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">Notifications</span>
                        {unreadNotificationsCount > 0 ? (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-extrabold text-blue-700">
                            {unreadNotificationsCount} unread
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                            All read
                          </span>
                        )}
                      </div>
                      {unreadNotificationsCount > 0 ? (
                        <button
                          type="button"
                          onClick={markAllNotificationsRead}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
                        >
                          <Check className="h-3.5 w-3.5" />
                          Mark all read
                        </button>
                      ) : null}
                    </div>
                    
                    <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100/80">
                      {notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 mb-2.5 shadow-2xs">
                            <Bell className="h-5 w-5" />
                          </div>
                          <p className="text-xs font-bold text-slate-700">No notifications</p>
                          <p className="mt-0.5 text-[11px] text-slate-400">You're all caught up for now.</p>
                        </div>
                      ) : (
                        notifications.slice(0, 8).map((n) => {
                          const isUnread = !readNotificationIds.has(String(n.id));
                          const visual = getNotificationVisual(n.type, n.title);
                          const Icon = visual.icon;
                          return (
                            <div
                              key={n.id}
                              onClick={() => {
                                markSingleNotificationRead(n.id);
                                setNotificationsOpen(false);
                                navigate(n.actionRoute || "/notifications");
                              }}
                              className={`group relative flex items-start gap-3 p-3.5 cursor-pointer transition-all ${
                                isUnread
                                  ? "bg-blue-50/40 hover:bg-blue-50/70"
                                  : "hover:bg-slate-50/80"
                              }`}
                            >
                              {/* Left Accent indicator for unread */}
                              {isUnread ? (
                                <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-blue-600 rounded-r" />
                              ) : null}

                              {/* Icon badge */}
                              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border shadow-2xs transition-transform group-hover:scale-105 ${visual.iconClass}`}>
                                <Icon className="h-4 w-4" />
                              </div>

                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1">
                                  <p className={`text-xs truncate ${isUnread ? "font-bold text-slate-900" : "font-semibold text-slate-700"}`}>
                                    {n.title}
                                  </p>
                                  {isUnread ? (
                                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600 ring-2 ring-blue-100" />
                                  ) : null}
                                </div>
                                <p className="mt-0.5 text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                                  {n.message}
                                </p>
                                <div className="mt-1.5 flex items-center gap-2 text-[10px] text-slate-400">
                                  <span>{n.date}</span>
                                  {n.type ? (
                                    <>
                                      <span>·</span>
                                      <span className="font-medium text-slate-500">{n.type}</span>
                                    </>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    <div className="border-t border-slate-100 bg-slate-50/70 p-2.5">
                      <Link
                        to="/notifications"
                        onClick={() => {
                          markAllNotificationsRead();
                          setNotificationsOpen(false);
                        }}
                        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200/80 bg-white py-2 text-xs font-bold text-[#1e3a8a] shadow-2xs hover:bg-slate-50 hover:border-slate-300 transition-all"
                      >
                        <span>View all notifications</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                )}
              </div> : null}
              <div className="flex items-center space-x-3">
                <div className="h-8 w-8 rounded-full bg-[#1e3a8a] flex items-center justify-center text-white text-sm">
                  {(signedInAdmin.displayName || signedInAdmin.username || "A").charAt(0).toUpperCase()}
                </div>
                <span className="hidden sm:block text-sm text-gray-700">
                  {signedInAdmin.displayName || signedInAdmin.username || "Admin"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1">
          <div className="maw-admin-content w-full px-4 py-6 sm:px-6 lg:px-8">
            {outlet}
          </div>
        </main>
      </div>
    </div>
  );
}
