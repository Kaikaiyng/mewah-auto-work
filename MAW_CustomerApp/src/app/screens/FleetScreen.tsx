import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router';
import {
  Car,
  Calendar,
  Wrench,
  Search,
  X,
  ChevronRight,
  ShieldCheck,
  Clock,
  MapPin,
  Building2,
  AlertTriangle,
  Plus,
  SlidersHorizontal,
  FileCheck2,
  Gauge,
  PhoneCall,
  CheckCircle2,
  ChevronLeft,
  ChevronDown,
  Info,
  ExternalLink,
  ShieldAlert
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { useLanguage } from '../context/LanguageContext';
import { useCustomerData } from '../context/CustomerDataContext';
import { useBooking } from '../context/BookingContext';
import { DataState } from '../components/DataState';
import { serviceStatusColorClass, bookingStatusLabel, workOrderLabels } from '../lib/status';
import { formatDate, formatTime } from '../lib/dateTime';
import type { Booking, Vehicle, WorkOrder } from '../types';

type FleetTab = 'vehicles' | 'bookings' | 'compliance';
type VehicleCategoryFilter = 'all' | 'prime_mover' | 'trailer' | 'side_loader' | 'lorry' | 'other';
type BookingFilter = 'all' | 'in_workshop' | 'upcoming' | 'completed';
type ComplianceFilter = 'all' | 'due_soon' | 'road_tax' | 'puspakom' | 'insurance';

const ITEMS_PER_PAGE = 7; // Perfectly tuned to fit within standard mobile viewports without scrolling

export function FleetScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();
  const { data, isLoading, error, reload } = useCustomerData();
  const { updateBookingData } = useBooking();

  // URL or State tab resolution
  const queryParams = new URLSearchParams(location.search);
  const initialTabFromQuery = queryParams.get('tab') as FleetTab | null;
  const initialTabFromState = (location.state as any)?.initialTab as FleetTab | null;
  const initialTab: FleetTab = (
    initialTabFromQuery ||
    initialTabFromState ||
    (location.pathname === '/bookings' ? 'bookings' : location.pathname === '/reminders' ? 'compliance' : 'vehicles')
  );

  const [activeTab, setActiveTab] = useState<FleetTab>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState<VehicleCategoryFilter>('all');
  const [bookingFilter, setBookingFilter] = useState<BookingFilter>('all');
  const [complianceFilter, setComplianceFilter] = useState<ComplianceFilter>('due_soon');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedVehicleForDrawer, setSelectedVehicleForDrawer] = useState<Vehicle | null>(null);

  const vehicles = useMemo(() => data?.user?.vehicles || [], [data?.user?.vehicles]);
  const bookings = useMemo(() => data?.bookings || [], [data?.bookings]);
  const workOrders = useMemo(() => data?.workOrders || [], [data?.workOrders]);

  // Active work orders map by vehicle ID
  const activeWorkOrdersByVehicle = useMemo(() => {
    const map = new Map<string, WorkOrder>();
    for (const wo of workOrders) {
      if (wo.status !== 'collected') {
        map.set(wo.vehicleId, wo);
      }
    }
    return map;
  }, [workOrders]);

  // Upcoming bookings map by vehicle ID
  const upcomingBookingsByVehicle = useMemo(() => {
    const map = new Map<string, Booking>();
    for (const b of bookings) {
      if (b.orderType === 'service' && ['pending', 'confirmed'].includes(b.status) && b.vehicleId) {
        if (!map.has(b.vehicleId)) {
          map.set(b.vehicleId, b);
        }
      }
    }
    return map;
  }, [bookings]);

  // Compliance calculations for fleet
  const complianceItems = useMemo(() => {
    const items: Array<{
      vehicle: Vehicle;
      type: 'puspakom' | 'road_tax' | 'insurance';
      expiryDate: string;
      daysRemaining: number;
      isOverdue: boolean;
    }> = [];

    const now = new Date();
    const todayMalaysia = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kuala_Lumpur',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    const todayMs = new Date(todayMalaysia).getTime();

    for (const v of vehicles) {
      const checkExpiry = (dateStr: string | undefined, type: 'puspakom' | 'road_tax' | 'insurance') => {
        if (!dateStr) return;
        const expiryMs = new Date(dateStr).getTime();
        if (Number.isNaN(expiryMs)) return;
        const diffDays = Math.ceil((expiryMs - todayMs) / (1000 * 60 * 60 * 24));
        items.push({
          vehicle: v,
          type,
          expiryDate: dateStr,
          daysRemaining: diffDays,
          isOverdue: diffDays < 0,
        });
      };

      checkExpiry(v.puspakomExpiry, 'puspakom');
      checkExpiry(v.roadTaxExpiry, 'road_tax');
      checkExpiry(v.insuranceExpiry, 'insurance');
    }

    return items.sort((a, b) => a.daysRemaining - b.daysRemaining);
  }, [vehicles]);

  const urgentComplianceCount = useMemo(() => {
    return complianceItems.filter(i => i.daysRemaining <= 30).length;
  }, [complianceItems]);

  const complianceTypeCounts = useMemo(() => {
    let dueSoon = 0;
    let roadTax = 0;
    let puspakom = 0;
    let insurance = 0;

    for (const item of complianceItems) {
      if (item.daysRemaining <= 30) dueSoon++;
      if (item.type === 'road_tax') roadTax++;
      else if (item.type === 'puspakom') puspakom++;
      else if (item.type === 'insurance') insurance++;
    }

    return {
      all: complianceItems.length,
      dueSoon,
      roadTax,
      puspakom,
      insurance,
    };
  }, [complianceItems]);

  const inWorkshopCount = activeWorkOrdersByVehicle.size;

  const upcomingCount = useMemo(() => {
    return bookings.filter(b => b.orderType === 'service' && ['pending', 'confirmed'].includes(b.status) && (!b.workOrderStatus || b.workOrderStatus === 'scheduled')).length;
  }, [bookings]);

  const completedBookingsCount = useMemo(() => {
    return bookings.filter(b => b.orderType === 'service' && (b.status === 'completed' || b.workOrderStatus === 'collected')).length;
  }, [bookings]);

  const allServiceBookingsCount = useMemo(() => {
    return bookings.filter(b => b.orderType === 'service').length;
  }, [bookings]);

  // Vehicle Type breakdown counts for pure vehicle-type filtering
  const vehicleTypeCounts = useMemo(() => {
    let prime = 0;
    let trailer = 0;
    let sideLoader = 0;
    let lorry = 0;
    let other = 0;

    for (const v of vehicles) {
      const eq = (v.equipment || '').toLowerCase();
      if (eq.includes('prime mover') || eq.includes('head') || eq.includes('kepala')) {
        prime++;
      } else if (eq.includes('side loader') || eq.includes('sidelifter')) {
        sideLoader++;
      } else if (eq.includes('trailer') || eq.includes('chassis') || eq.includes('skeletal') || eq.includes('treler')) {
        trailer++;
      } else if (eq.includes('lorry') || eq.includes('rigid') || eq.includes('truck') || eq.includes('van') || eq.includes('lori')) {
        lorry++;
      } else {
        other++;
      }
    }

    return {
      all: vehicles.length,
      prime,
      trailer,
      sideLoader,
      lorry,
      other,
    };
  }, [vehicles]);

  // Filtered Vehicles
  const filteredVehicles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = vehicles.filter(v => {
      if (q) {
        const matchesRegNo = v.regNo.toLowerCase().includes(q);
        const matchesVecNo = v.vecNo?.toLowerCase().includes(q);
        const matchesBrand = v.brand?.toLowerCase().includes(q);
        const matchesModel = v.model?.toLowerCase().includes(q);
        const matchesEquipment = v.equipment?.toLowerCase().includes(q);
        if (!matchesRegNo && !matchesVecNo && !matchesBrand && !matchesModel && !matchesEquipment) {
          return false;
        }
      }

      if (vehicleFilter === 'prime_mover') {
        const eq = (v.equipment || '').toLowerCase();
        return eq.includes('prime mover') || eq.includes('head') || eq.includes('kepala');
      }
      if (vehicleFilter === 'trailer') {
        const eq = (v.equipment || '').toLowerCase();
        return (eq.includes('trailer') || eq.includes('chassis') || eq.includes('skeletal') || eq.includes('treler')) && !eq.includes('side loader') && !eq.includes('sidelifter');
      }
      if (vehicleFilter === 'side_loader') {
        const eq = (v.equipment || '').toLowerCase();
        return eq.includes('side loader') || eq.includes('sidelifter');
      }
      if (vehicleFilter === 'lorry') {
        const eq = (v.equipment || '').toLowerCase();
        return eq.includes('lorry') || eq.includes('rigid') || eq.includes('truck') || eq.includes('van') || eq.includes('lori');
      }
      if (vehicleFilter === 'other') {
        const eq = (v.equipment || '').toLowerCase();
        const isPrime = eq.includes('prime mover') || eq.includes('head') || eq.includes('kepala');
        const isTrailer = eq.includes('trailer') || eq.includes('chassis') || eq.includes('skeletal') || eq.includes('treler');
        const isSideLoader = eq.includes('side loader') || eq.includes('sidelifter');
        const isLorry = eq.includes('lorry') || eq.includes('rigid') || eq.includes('truck') || eq.includes('van') || eq.includes('lori');
        return !isPrime && !isTrailer && !isSideLoader && !isLorry;
      }
      return true;
    });

    // Default Sorting:
    // 1. Vehicles with active repair in workshop (有在工单修理中的排最前面)
    // 2. Vehicles with upcoming scheduled bookings
    // 3. Natural alphanumeric plate order
    return [...list].sort((a, b) => {
      const aInWorkshop = activeWorkOrdersByVehicle.has(a.id) ? 1 : 0;
      const bInWorkshop = activeWorkOrdersByVehicle.has(b.id) ? 1 : 0;
      if (aInWorkshop !== bInWorkshop) {
        return bInWorkshop - aInWorkshop;
      }

      const aUpcoming = upcomingBookingsByVehicle.has(a.id) ? 1 : 0;
      const bUpcoming = upcomingBookingsByVehicle.has(b.id) ? 1 : 0;
      if (aUpcoming !== bUpcoming) {
        return bUpcoming - aUpcoming;
      }

      return a.regNo.localeCompare(b.regNo, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [vehicles, searchQuery, vehicleFilter, activeWorkOrdersByVehicle, upcomingBookingsByVehicle]);

  // Paginated Vehicles (One-page view)
  const totalVehiclePages = Math.max(1, Math.ceil(filteredVehicles.length / ITEMS_PER_PAGE));
  const paginatedVehicles = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredVehicles.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredVehicles, currentPage]);

  // Filtered Bookings
  const filteredBookings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = bookings.filter(b => {
      if (b.orderType !== 'service') return false;
      const vehicle = vehicles.find(v => v.id === b.vehicleId);

      if (q) {
        const matchesNumber = b.bookingNumber?.toLowerCase().includes(q);
        const matchesWorkOrder = b.workOrderNumber?.toLowerCase().includes(q);
        const matchesServiceType = b.serviceType?.toLowerCase().includes(q);
        const matchesRegNo = vehicle?.regNo?.toLowerCase().includes(q);
        const matchesVecNo = vehicle?.vecNo?.toLowerCase().includes(q);
        if (!matchesNumber && !matchesWorkOrder && !matchesServiceType && !matchesRegNo && !matchesVecNo) {
          return false;
        }
      }

      if (bookingFilter === 'in_workshop') {
        return b.workOrderStatus && b.workOrderStatus !== 'collected';
      }
      if (bookingFilter === 'upcoming') {
        return ['pending', 'confirmed'].includes(b.status) && (!b.workOrderStatus || b.workOrderStatus === 'scheduled');
      }
      if (bookingFilter === 'completed') {
        return b.status === 'completed' || b.workOrderStatus === 'collected';
      }
      return true;
    });

    return [...list].sort((a, b) => {
      const aInShop = a.workOrderStatus && a.workOrderStatus !== 'collected' ? 1 : 0;
      const bInShop = b.workOrderStatus && b.workOrderStatus !== 'collected' ? 1 : 0;
      if (aInShop !== bInShop) return bInShop - aInShop;

      const aUpcoming = ['pending', 'confirmed'].includes(a.status) && (!a.workOrderStatus || a.workOrderStatus === 'scheduled') ? 1 : 0;
      const bUpcoming = ['pending', 'confirmed'].includes(b.status) && (!b.workOrderStatus || b.workOrderStatus === 'scheduled') ? 1 : 0;
      if (aUpcoming !== bUpcoming) return bUpcoming - aUpcoming;

      const aDate = a.serviceDate || a.createdAt || '';
      const bDate = b.serviceDate || b.createdAt || '';
      return bDate.localeCompare(aDate);
    });
  }, [bookings, vehicles, searchQuery, bookingFilter]);

  const totalBookingPages = Math.max(1, Math.ceil(filteredBookings.length / ITEMS_PER_PAGE));
  const paginatedBookings = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredBookings.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredBookings, currentPage]);

  // Filtered Compliance
  const filteredCompliance = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return complianceItems.filter(item => {
      if (complianceFilter === 'due_soon') {
        if (item.daysRemaining > 30) return false;
      } else if (complianceFilter === 'road_tax') {
        if (item.type !== 'road_tax') return false;
      } else if (complianceFilter === 'puspakom') {
        if (item.type !== 'puspakom') return false;
      } else if (complianceFilter === 'insurance') {
        if (item.type !== 'insurance') return false;
      }

      if (!q) return true;
      const matchesRegNo = item.vehicle.regNo.toLowerCase().includes(q);
      const matchesVecNo = item.vehicle.vecNo?.toLowerCase().includes(q);
      const matchesBrand = item.vehicle.brand?.toLowerCase().includes(q);
      const matchesType = item.type.toLowerCase().includes(q);
      return matchesRegNo || matchesVecNo || matchesBrand || matchesType;
    });
  }, [complianceItems, complianceFilter, searchQuery]);

  const totalCompliancePages = Math.max(1, Math.ceil(filteredCompliance.length / ITEMS_PER_PAGE));
  const paginatedCompliance = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredCompliance.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredCompliance, currentPage]);

  // Reset page when filter or search changes
  const handleFilterChange = (filter: VehicleCategoryFilter) => {
    setVehicleFilter(filter);
    setCurrentPage(1);
  };

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    setCurrentPage(1);
  };

  const handleTabChange = (tab: FleetTab) => {
    setActiveTab(tab);
    setCurrentPage(1);
    if (tab === 'compliance') {
      setComplianceFilter(urgentComplianceCount > 0 ? 'due_soon' : 'all');
    }
    if (tab === 'bookings') {
      setBookingFilter('all');
    }
  };

  const handleQuickBook = (vehicle: Vehicle) => {
    const activeWo = activeWorkOrdersByVehicle.get(vehicle.id);
    if (activeWo) {
      setSelectedVehicleForDrawer(null);
      navigate(`/repair-progress/${activeWo.id}`);
      return;
    }
    const upcomingB = upcomingBookingsByVehicle.get(vehicle.id);
    if (upcomingB) {
      setSelectedVehicleForDrawer(null);
      navigate(`/booking/${upcomingB.id}`);
      return;
    }
    setSelectedVehicleForDrawer(null);
    updateBookingData({
      vehicleId: vehicle.id,
      serviceType: 'maintenance',
      returnTo: '/fleet',
    });
    navigate('/booking/step1', { state: { from: '/fleet' } });
  };

  if (!data) {
    return <DataState isLoading={isLoading} error={error} onRetry={() => void reload()} />;
  }

  return (
    <div className="min-h-screen bg-[#eef3fb] max-w-md mx-auto flex flex-col justify-between">
      {/* 1. Header (Minimalist Standard Header) */}
      <div className="maw-page-header sticky top-0 z-40 relative flex items-center justify-between shrink-0">
        <div className="w-10" />
        <h1 className="text-base font-bold text-center absolute left-1/2 -translate-x-1/2 pointer-events-none truncate max-w-[200px]">
          {t('Fleet & Service', 'Armada & Servis', '车队与维保')}
        </h1>
        <button
          type="button"
          onClick={() => navigate('/add-vehicle')}
          className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-[#2563eb] ring-1 ring-blue-100 shadow-sm hover:bg-blue-50 transition-colors"
          aria-label={t('Add Vehicle', 'Tambah Kenderaan', '添加车辆')}
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* 2. Top Segmented Tabs (Minimalist Pill Bar) */}
      <div className="px-5 pt-3 pb-1 shrink-0">
        <div className="flex gap-1.5 rounded-2xl bg-slate-200/60 p-1">
          <button
            type="button"
            onClick={() => handleTabChange('vehicles')}
            className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'vehicles'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Car className="w-4 h-4" />
            <span>{t('Vehicles', 'Kenderaan', '车辆')}</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200/70 text-slate-700 font-bold">
              {vehicles.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('bookings')}
            className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'bookings'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Wrench className="w-4 h-4" />
            <span>{t('Bookings', 'Tempahan', '预约')}</span>
            {inWorkshopCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500 text-white font-black">
                {inWorkshopCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('compliance')}
            className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'compliance'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{t('Compliance', 'Pematuhan', '合规')}</span>
            {urgentComplianceCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-rose-500 text-white font-black">
                {urgentComplianceCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 3. Filter & Search Panel (Compact, Filter-Driven) */}
      <div className="px-5 pt-1.5 pb-2 shrink-0 space-y-2">
        {/* Instant Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={
              activeTab === 'vehicles'
                ? t('Search plate, unit no, model...', 'Cari no plat, unit, model...', '输入车牌、单位号或车型即查...')
                : activeTab === 'bookings'
                ? t('Search booking, WO, plate...', 'Cari tempahan, no WO, plat...', '搜索预约号、工单号、车牌...')
                : t('Search compliance, vehicle...', 'Cari pematuhan, kenderaan...', '搜索合规项目、车牌...')
            }
            className="w-full h-10 pl-9 pr-8 rounded-xl bg-white border border-slate-200/80 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563eb] shadow-2xs transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => handleSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* 1-Tap Quick Filter Pills (Vehicle Type Driven) */}
        {activeTab === 'vehicles' && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden" data-prevent-swipe="true">
            {[
              { id: 'all', label: t('All', 'Semua', '全部'), count: vehicleTypeCounts.all },
              { id: 'prime_mover', label: t('Prime Mover', 'Kepala', '拖车头'), count: vehicleTypeCounts.prime },
              { id: 'trailer', label: t('Trailer / Chassis', 'Treler / Casis', '挂车/骨架车'), count: vehicleTypeCounts.trailer },
              ...(vehicleTypeCounts.sideLoader > 0 ? [{ id: 'side_loader', label: t('Side Loader', 'Side Loader', '侧装吊'), count: vehicleTypeCounts.sideLoader }] : []),
              { id: 'lorry', label: t('Lorry / Truck', 'Lori / Trak', '卡车/货车'), count: vehicleTypeCounts.lorry },
              ...(vehicleTypeCounts.other > 0 ? [{ id: 'other', label: t('Other', 'Lain-lain', '其他类型'), count: vehicleTypeCounts.other }] : []),
            ].map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => handleFilterChange(chip.id as VehicleCategoryFilter)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 ${
                  vehicleFilter === chip.id
                    ? 'bg-[#1e3a8a] text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-50'
                }`}
              >
                <span>{chip.label}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  vehicleFilter === chip.id
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-100 text-slate-500'
                }`}>
                  {chip.count}
                </span>
              </button>
            ))}
          </div>
        )}

        {activeTab === 'bookings' && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden" data-prevent-swipe="true">
            {[
              { id: 'all', label: t('All', 'Semua', '全部'), count: allServiceBookingsCount },
              { id: 'in_workshop', label: t('In Workshop', 'Sedang Dibaiki', '在修中'), count: inWorkshopCount },
              { id: 'upcoming', label: t('Upcoming', 'Akan Datang', '待入厂'), count: upcomingCount },
              { id: 'completed', label: t('Completed', 'Selesai', '已完成'), count: completedBookingsCount },
            ].map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => { setBookingFilter(chip.id as BookingFilter); setCurrentPage(1); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 ${
                  bookingFilter === chip.id
                    ? 'bg-[#1e3a8a] text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-50'
                }`}
              >
                <span>{chip.label}</span>
                {chip.count !== undefined && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    bookingFilter === chip.id
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-100 text-slate-500'
                  }`}>
                    {chip.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {activeTab === 'compliance' && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden" data-prevent-swipe="true">
            {[
              { id: 'all', label: t('All', 'Semua', '全部'), count: complianceTypeCounts.all },
              { id: 'due_soon', label: t('Due Soon', 'Perlu Tindakan', '待处理'), count: complianceTypeCounts.dueSoon },
              { id: 'road_tax', label: t('Road Tax', 'Cukai Jalan', '路税'), count: complianceTypeCounts.roadTax },
              { id: 'puspakom', label: t('PUSPAKOM', 'PUSPAKOM', '电脑验车'), count: complianceTypeCounts.puspakom },
              { id: 'insurance', label: t('Insurance', 'Insurans', '车险'), count: complianceTypeCounts.insurance },
            ].map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => { setComplianceFilter(chip.id as ComplianceFilter); setCurrentPage(1); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 ${
                  complianceFilter === chip.id
                    ? 'bg-[#1e3a8a] text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-50'
                }`}
              >
                <span>{chip.label}</span>
                {chip.count !== undefined && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    complianceFilter === chip.id
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-100 text-slate-500'
                  }`}>
                    {chip.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 4. High-Density Single-Screen Content Area */}
      <div className="flex-1 px-5 pb-2 min-h-0 flex flex-col justify-between">
        {/* ================= TAB 1: VEHICLES (High-Density Rows) ================= */}
        {activeTab === 'vehicles' && (
          <div className="flex-1 flex flex-col justify-between">
            {filteredVehicles.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-xs my-auto">
                <Car className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-700">
                  {t('No matching vehicles found', 'Tiada kenderaan sepadan', '未找到匹配的车辆')}
                </p>
                <button
                  onClick={() => { setSearchQuery(''); setVehicleFilter('all'); setCurrentPage(1); }}
                  className="mt-3 text-xs text-[#2563eb] font-bold hover:underline"
                >
                  {t('Reset Filters', 'Tetapkan Semula', '重置筛选条件')}
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                {paginatedVehicles.map((vehicle) => {
                  const activeWo = activeWorkOrdersByVehicle.get(vehicle.id);
                  const upcomingB = upcomingBookingsByVehicle.get(vehicle.id);
                  const vehicleCompliance = complianceItems.filter(i => i.vehicle.id === vehicle.id && i.daysRemaining <= 30);
                  const mostUrgentDoc = vehicleCompliance[0];
                  const hasDistinctUnitNo = Boolean(
                    vehicle.vecNo &&
                    vehicle.vecNo !== '-' &&
                    vehicle.vecNo.trim().toUpperCase() !== vehicle.regNo.trim().toUpperCase()
                  );

                  return (
                    <div
                      key={vehicle.id}
                      onClick={() => setSelectedVehicleForDrawer(vehicle)}
                      className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200/70 bg-white hover:border-blue-300 hover:shadow-xs transition-all cursor-pointer active:scale-[0.99]"
                    >
                      {/* Left: Plate, Unit, Specs */}
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#2563eb] flex items-center justify-center shrink-0">
                          <Car className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 leading-tight min-w-0">
                            <span className="font-extrabold text-sm text-slate-900 tracking-tight whitespace-nowrap">
                              {vehicle.regNo}
                            </span>
                            {hasDistinctUnitNo && (
                              <span className="px-1.5 py-0.2 rounded bg-blue-50 border border-blue-200 text-blue-700 font-mono font-bold text-[10px]">
                                {vehicle.vecNo}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 truncate mt-0.5 font-medium">
                            {vehicle.equipment || `${vehicle.brand || ''} ${vehicle.model || ''}`}
                            {vehicle.mileage ? (
                              <span className="text-slate-400 font-mono font-normal"> · {(vehicle.mileage).toLocaleString()} km</span>
                            ) : null}
                          </p>
                        </div>
                      </div>

                      {/* Right: Status Pill & Arrow */}
                      <div className="flex items-center gap-2 shrink-0">
                        {activeWo ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-black border border-amber-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            <span>{workOrderLabels[activeWo.status] || t('In Workshop', 'Di Bengkel', '在厂')}</span>
                          </span>
                        ) : upcomingB ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-bold border border-blue-200">
                            <Calendar className="w-3 h-3" />
                            <span>{formatDate(upcomingB.serviceDate || '')}</span>
                          </span>
                        ) : mostUrgentDoc ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            mostUrgentDoc.isOverdue
                              ? 'bg-rose-100 text-rose-800 border-rose-200'
                              : 'bg-yellow-50 text-yellow-800 border-yellow-200'
                          }`}>
                            <AlertTriangle className="w-3 h-3" />
                            <span>{mostUrgentDoc.type === 'puspakom' ? 'PUSPAKOM' : t('Road Tax', 'Cukai', '路税')}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>{t('Active', 'Aktif', '在用')}</span>
                          </span>
                        )}
                        <ChevronRight className="w-4 h-4 text-slate-300" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination Controls (Centered Large Thumb-Friendly Mobile Bar) */}
            {filteredVehicles.length > 0 && (
              <div className="flex items-center justify-center gap-3 pt-2.5 pb-1 border-t border-slate-200/60 mt-1.5">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  className="h-11 w-11 rounded-2xl border border-slate-200/90 bg-white shadow-xs flex items-center justify-center text-slate-800 hover:bg-slate-50 active:scale-90 disabled:opacity-20 transition-all shrink-0"
                  aria-label={t('Previous Page', 'Halaman Lalu', '上一页')}
                >
                  <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
                </button>

                <div className="h-11 px-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex items-center justify-center gap-1.5 font-mono select-none min-w-[5.5rem]">
                  <span className="text-sm font-black text-[#2563eb]">{currentPage}</span>
                  <span className="text-slate-300 font-bold text-xs">/</span>
                  <span className="text-xs font-bold text-slate-500">{totalVehiclePages}</span>
                </div>

                <button
                  type="button"
                  disabled={currentPage >= totalVehiclePages}
                  onClick={() => setCurrentPage(prev => Math.min(totalVehiclePages, prev + 1))}
                  className="h-11 w-11 rounded-2xl border border-slate-200/90 bg-white shadow-xs flex items-center justify-center text-slate-800 hover:bg-slate-50 active:scale-90 disabled:opacity-20 transition-all shrink-0"
                  aria-label={t('Next Page', 'Halaman Seterusnya', '下一页')}
                >
                  <ChevronRight className="w-5 h-5 stroke-[2.5]" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 2: BOOKINGS & WORKSHOP ================= */}
        {activeTab === 'bookings' && (
          <div className="flex-1 flex flex-col justify-between">
            {filteredBookings.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-xs my-auto">
                <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-700">
                  {t('No bookings or services found', 'Tiada tempahan ditemui', '未找到服务预约记录')}
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/booking/select-vehicle')}
                  className="mt-3 inline-flex items-center gap-1 text-xs text-[#2563eb] font-bold hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('Book a Service', 'Tempah Servis', '立即预约服务')}</span>
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                {paginatedBookings.map((booking) => {
                  const vehicle = vehicles.find((item) => item.id === booking.vehicleId);
                  const isWorkOrder = Boolean(booking.workOrderId);

                  return (
                    <div
                      key={booking.id}
                      onClick={() => {
                        if (booking.workOrderId) {
                          navigate(`/repair-progress/${booking.workOrderId}`);
                        } else {
                          navigate(`/booking/${booking.id}`);
                        }
                      }}
                      className="p-2.5 rounded-xl border border-slate-200/70 bg-white hover:border-blue-300 hover:shadow-xs transition-all cursor-pointer active:scale-[0.99] space-y-1.5"
                    >
                      {/* Top Line: Icon + Plate (NO WRAP) + Status Badge */}
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            isWorkOrder ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-[#2563eb]'
                          }`}>
                            {isWorkOrder ? <Wrench className="w-4 h-4" /> : <Calendar className="w-4 h-4" />}
                          </div>
                          <span className="font-extrabold text-sm text-slate-900 tracking-tight whitespace-nowrap">
                            {vehicle?.regNo || '—'}
                          </span>
                          {vehicle?.vecNo && vehicle.vecNo !== '-' && vehicle.vecNo.trim().toUpperCase() !== (vehicle.regNo || '').trim().toUpperCase() && (
                            <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-mono font-bold text-[10px] whitespace-nowrap">
                              {vehicle.vecNo}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${serviceStatusColorClass(booking.workOrderStatus || booking.status)}`}>
                            {booking.workOrderStatus
                              ? workOrderLabels[booking.workOrderStatus]
                              : bookingStatusLabel(booking.status, 'service')}
                          </span>
                          <ChevronRight className="w-4 h-4 text-slate-300" />
                        </div>
                      </div>

                      {/* Bottom Line: WO Number · Service Type · Date */}
                      <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium pl-9">
                        <div className="flex items-center gap-1.5 min-w-0 truncate">
                          <span className="font-mono text-slate-400 font-semibold shrink-0">
                            {booking.workOrderNumber || booking.bookingNumber}
                          </span>
                          <span className="text-slate-300">·</span>
                          <span className="truncate text-slate-600 font-medium">
                            {booking.serviceType}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-medium shrink-0 ml-2 whitespace-nowrap">
                          {booking.serviceDate ? formatDate(booking.serviceDate) : t('Pending schedule', 'Menunggu jadual', '待排期')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination Controls (Centered Large Thumb-Friendly Mobile Bar) */}
            {filteredBookings.length > 0 && (
              <div className="flex items-center justify-center gap-3 pt-2.5 pb-1 border-t border-slate-200/60 mt-1.5">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  className="h-11 w-11 rounded-2xl border border-slate-200/90 bg-white shadow-xs flex items-center justify-center text-slate-800 hover:bg-slate-50 active:scale-90 disabled:opacity-20 transition-all shrink-0"
                  aria-label={t('Previous Page', 'Halaman Lalu', '上一页')}
                >
                  <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
                </button>

                <div className="h-11 px-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex items-center justify-center gap-1.5 font-mono select-none min-w-[5.5rem]">
                  <span className="text-sm font-black text-[#2563eb]">{currentPage}</span>
                  <span className="text-slate-300 font-bold text-xs">/</span>
                  <span className="text-xs font-bold text-slate-500">{totalBookingPages}</span>
                </div>

                <button
                  type="button"
                  disabled={currentPage >= totalBookingPages}
                  onClick={() => setCurrentPage(prev => Math.min(totalBookingPages, prev + 1))}
                  className="h-11 w-11 rounded-2xl border border-slate-200/90 bg-white shadow-xs flex items-center justify-center text-slate-800 hover:bg-slate-50 active:scale-90 disabled:opacity-20 transition-all shrink-0"
                  aria-label={t('Next Page', 'Halaman Seterusnya', '下一页')}
                >
                  <ChevronRight className="w-5 h-5 stroke-[2.5]" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 3: COMPLIANCE ================= */}
        {activeTab === 'compliance' && (
          <div className="flex-1 flex flex-col justify-between">
            {filteredCompliance.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-xs my-auto">
                <ShieldCheck className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-700">
                  {complianceFilter === 'due_soon'
                    ? t('No urgent compliance items', 'Tiada pematuhan mendesak', '暂无即将到期或逾期项目')
                    : t('No matching records found', 'Tiada rekod sepadan', '未找到匹配的记录')}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {complianceFilter === 'due_soon'
                    ? t('All vehicles road tax and PUSPAKOM are up to date', 'Semua cukai jalan dan PUSPAKOM teratur', '全车队路税及检验皆在有效期内')
                    : t('Try adjusting your search or filter', 'Cuba ubah carian atau penapis anda', '请尝试调整搜索词或筛选条件')}
                </p>
                {(complianceFilter !== 'all' || searchQuery) && (
                  <button
                    type="button"
                    onClick={() => { setSearchQuery(''); setComplianceFilter('all'); setCurrentPage(1); }}
                    className="mt-3 text-xs text-[#2563eb] font-bold hover:underline"
                  >
                    {t('View All Compliance', 'Lihat Semua Pematuhan', '查看全部合规项目')}
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                {paginatedCompliance.map((item, idx) => {
                  const isOverdue = item.isOverdue;
                  const isUrgent = item.daysRemaining <= 30;

                  return (
                    <div
                      key={`${item.vehicle.id}-${item.type}-${idx}`}
                      onClick={() => handleQuickBook(item.vehicle)}
                      className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer active:scale-[0.99] ${
                        isOverdue
                          ? 'border-rose-300 bg-rose-50/40'
                          : isUrgent
                          ? 'border-amber-300 bg-amber-50/40'
                          : 'border-slate-200/70 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          isOverdue
                            ? 'bg-rose-100 text-rose-700'
                            : isUrgent
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-emerald-50 text-emerald-600'
                        }`}>
                          {isOverdue || isUrgent ? (
                            <AlertTriangle className="w-4 h-4" />
                          ) : (
                            <ShieldCheck className="w-4 h-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 leading-tight">
                            <span className="font-extrabold text-sm text-slate-900 tracking-tight whitespace-nowrap">
                              {item.vehicle.regNo}
                            </span>
                            <span className="text-[10px] font-bold text-slate-600">
                              {item.type === 'puspakom' ? 'PUSPAKOM' : item.type === 'road_tax' ? t('Road Tax', 'Cukai', '路税') : t('Insurance', 'Insurans', '车险')}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 truncate mt-0.5">
                            {t('Expires', 'Tamat', '到期')}: {formatDate(item.expiryDate)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                          isOverdue
                            ? 'bg-rose-600 text-white'
                            : isUrgent
                            ? 'bg-amber-400 text-amber-950'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200/70'
                        }`}>
                          {isOverdue
                            ? `${Math.abs(item.daysRemaining)}d ${t('overdue', 'lewat', '逾期')}`
                            : `${item.daysRemaining}d ${t('left', 'lagi', '剩余')}`}
                        </span>
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination Controls (Centered Large Thumb-Friendly Mobile Bar) */}
            {filteredCompliance.length > 0 && (
              <div className="flex items-center justify-center gap-3 pt-2.5 pb-1 border-t border-slate-200/60 mt-1.5">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  className="h-11 w-11 rounded-2xl border border-slate-200/90 bg-white shadow-xs flex items-center justify-center text-slate-800 hover:bg-slate-50 active:scale-90 disabled:opacity-20 transition-all shrink-0"
                  aria-label={t('Previous Page', 'Halaman Lalu', '上一页')}
                >
                  <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
                </button>

                <div className="h-11 px-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex items-center justify-center gap-1.5 font-mono select-none min-w-[5.5rem]">
                  <span className="text-sm font-black text-[#2563eb]">{currentPage}</span>
                  <span className="text-slate-300 font-bold text-xs">/</span>
                  <span className="text-xs font-bold text-slate-500">{totalCompliancePages}</span>
                </div>

                <button
                  type="button"
                  disabled={currentPage >= totalCompliancePages}
                  onClick={() => setCurrentPage(prev => Math.min(totalCompliancePages, prev + 1))}
                  className="h-11 w-11 rounded-2xl border border-slate-200/90 bg-white shadow-xs flex items-center justify-center text-slate-800 hover:bg-slate-50 active:scale-90 disabled:opacity-20 transition-all shrink-0"
                  aria-label={t('Next Page', 'Halaman Seterusnya', '下一页')}
                >
                  <ChevronRight className="w-5 h-5 stroke-[2.5]" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. Compact, High-Focal Vehicle Detail Card (Rendered via Portal to float above entire app shell & bottom nav) */}
      {selectedVehicleForDrawer && typeof document !== 'undefined' && createPortal(
        (() => {
          const activeWo = activeWorkOrdersByVehicle.get(selectedVehicleForDrawer.id);
          const upcomingB = upcomingBookingsByVehicle.get(selectedVehicleForDrawer.id);
          const cleanPlate = (s?: string) => (s || '').replace(/[\s\-_]/g, '').toUpperCase();
          const isVecNoDifferent = Boolean(
            selectedVehicleForDrawer.vecNo &&
            selectedVehicleForDrawer.vecNo !== '-' &&
            cleanPlate(selectedVehicleForDrawer.vecNo) !== cleanPlate(selectedVehicleForDrawer.regNo)
          );

          return (
            <div
              data-prevent-swipe="true"
              className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-950/65 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-150"
              onClick={() => setSelectedVehicleForDrawer(null)}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <div
                className="w-full max-w-md bg-white rounded-t-[2rem] sm:rounded-3xl p-5 pb-[max(1.75rem,env(safe-area-inset-bottom))] space-y-3.5 shadow-[0_-16px_50px_rgba(15,23,42,0.28)] animate-in slide-in-from-bottom duration-200 border-t border-slate-100"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Top Drag Indicator */}
                <div className="w-10 h-1 rounded-full bg-slate-200 mx-auto -mt-1 mb-1" />

                {/* 1. Header: Vehicle Identity & Live Status (Visual Focal Point #1) */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-2xl font-black text-slate-900 tracking-tight font-mono">
                        {selectedVehicleForDrawer.regNo}
                      </h3>
                      {isVecNoDifferent && (
                        <span className="px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-[#2563eb] font-mono font-bold text-xs">
                          {selectedVehicleForDrawer.vecNo}
                        </span>
                      )}
                      {activeWo ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[11px] font-black border border-amber-300">
                          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                          <span>{workOrderLabels[activeWo.status] || t('In Workshop', 'Di Bengkel', '在厂维修')}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{t('Active Fleet', 'Armada Aktif', '在役车辆')}</span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 font-medium mt-1 truncate">
                      {selectedVehicleForDrawer.equipment || `${selectedVehicleForDrawer.brand || ''} ${selectedVehicleForDrawer.model || ''}`}
                      {selectedVehicleForDrawer.brand ? ` · ${selectedVehicleForDrawer.brand} ${selectedVehicleForDrawer.model || ''}` : ''}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedVehicleForDrawer(null)}
                    className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 hover:text-slate-700 hover:bg-slate-200 flex items-center justify-center shrink-0 transition-colors"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* 2. Core Metric Dashboard (2x2 Grid: Current Mileage, Next Due, Last Workshop, Last Mileage - Visual Focal Point #2) */}
                <div className="grid grid-cols-2 gap-2 bg-slate-50/90 p-3 rounded-2xl border border-slate-200/70 text-xs">
                  {/* Metric 1: Current Mileage */}
                  <div className="bg-white p-2.5 rounded-xl border border-slate-100 shadow-2xs">
                    <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <Gauge className="w-3.5 h-3.5 text-slate-400" />
                      <span>{t('Current Mileage', 'Perbatuan Semasa', '当前里程')}</span>
                    </div>
                    <p className="font-extrabold text-slate-900 font-mono text-base mt-1">
                      {(selectedVehicleForDrawer.mileage || 0).toLocaleString()} <span className="text-[11px] font-semibold text-slate-500">km</span>
                    </p>
                    <p className="text-[9px] text-slate-400 mt-0.5 truncate">{t('Latest recorded', 'Terkini direkod', '最新系统读数')}</p>
                  </div>

                  {/* Metric 2: Next Service Due */}
                  <div className="bg-white p-2.5 rounded-xl border border-blue-100 shadow-2xs bg-gradient-to-br from-white to-blue-50/30">
                    <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-600">
                      <Clock className="w-3.5 h-3.5 text-blue-600" />
                      <span>{t('Next Service Due', 'Servis Seterusnya', '下次建议保养')}</span>
                    </div>
                    <p className="font-extrabold text-[#2563eb] font-mono text-base mt-1">
                      {selectedVehicleForDrawer.nextServiceMileage ? (
                        <>{selectedVehicleForDrawer.nextServiceMileage.toLocaleString()} <span className="text-[11px] font-semibold text-blue-600">km</span></>
                      ) : selectedVehicleForDrawer.nextServiceDate ? (
                        formatDate(selectedVehicleForDrawer.nextServiceDate)
                      ) : (
                        <span className="text-slate-400 font-sans text-xs">{t('Not Scheduled', 'Belum Dijadualkan', '未排期')}</span>
                      )}
                    </p>
                    <p className="text-[9px] text-blue-500 font-medium mt-0.5 truncate">
                      {selectedVehicleForDrawer.nextServiceDate ? formatDate(selectedVehicleForDrawer.nextServiceDate) : t('Recommended schedule', 'Jadual disyorkan', '建议保养周期')}
                    </p>
                  </div>

                  {/* Metric 3: Last Day at Workshop */}
                  <div className="bg-white p-2.5 rounded-xl border border-slate-100 shadow-2xs">
                    <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>{t('Last Workshop Date', 'Tarikh Bengkel Lalu', '上次进厂日期')}</span>
                    </div>
                    <p className="font-extrabold text-slate-900 text-xs mt-1 truncate">
                      {selectedVehicleForDrawer.lastServiceDate ? formatDate(selectedVehicleForDrawer.lastServiceDate) : t('No record', 'Tiada rekod', '暂无记录')}
                    </p>
                    <p className="text-[9px] text-slate-400 mt-0.5 truncate">{t('Departure / Completed', 'Tarikh selesai', '出厂完工日期')}</p>
                  </div>

                  {/* Metric 4: Last Service Mileage */}
                  <div className="bg-white p-2.5 rounded-xl border border-slate-100 shadow-2xs">
                    <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <Wrench className="w-3.5 h-3.5 text-slate-400" />
                      <span>{t('Last Service Mileage', 'Perbatuan Servis', '上次保养里程')}</span>
                    </div>
                    <p className="font-extrabold text-slate-900 font-mono text-xs mt-1">
                      {selectedVehicleForDrawer.lastServiceMileage ? (
                        <>{selectedVehicleForDrawer.lastServiceMileage.toLocaleString()} <span className="text-[10px] font-semibold text-slate-500">km</span></>
                      ) : (
                        <span className="text-slate-400 font-sans text-xs">{t('N/A', 'T/A', '无记录')}</span>
                      )}
                    </p>
                    <p className="text-[9px] text-slate-400 mt-0.5 truncate">{t('Intake odometer', 'Odometer masuk', '进厂保养时读数')}</p>
                  </div>
                </div>

                {/* 3. Compliance Expiry Micro-Strip */}
                {(selectedVehicleForDrawer.puspakomExpiry || selectedVehicleForDrawer.roadTaxExpiry) && (
                  <div className="flex items-center gap-2 text-[11px] text-slate-600 px-1">
                    {selectedVehicleForDrawer.puspakomExpiry && (
                      <div className="flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-md">
                        <span className="font-bold text-slate-500 text-[10px]">PUSPAKOM:</span>
                        <span className="font-semibold text-slate-800">{formatDate(selectedVehicleForDrawer.puspakomExpiry)}</span>
                      </div>
                    )}
                    {selectedVehicleForDrawer.roadTaxExpiry && (
                      <div className="flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-md">
                        <span className="font-bold text-slate-500 text-[10px]">{t('Road Tax', 'Cukai', '路税')}:</span>
                        <span className="font-semibold text-slate-800">{formatDate(selectedVehicleForDrawer.roadTaxExpiry)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* 4. Active Repair or Upcoming Booking Notice Banner */}
                {activeWo ? (
                  <div
                    onClick={() => {
                      setSelectedVehicleForDrawer(null);
                      navigate(`/repair-progress/${activeWo.id}`);
                    }}
                    className="p-2.5 rounded-xl border border-amber-300 bg-amber-50 flex items-center justify-between text-xs cursor-pointer active:scale-[0.99] transition-all hover:bg-amber-100"
                  >
                    <div className="flex items-center gap-2 text-amber-950 font-bold min-w-0 pr-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping shrink-0" />
                      <span className="truncate">
                        {t('Active Repair in Workshop', 'Pembaikan Aktif di Bengkel', '厂内维修中')}: {workOrderLabels[activeWo.status] || activeWo.status}
                      </span>
                    </div>
                    <span className="text-[#2563eb] font-bold text-xs flex items-center gap-0.5 shrink-0">
                      {t('Track', 'Jejak', '跟踪进度')} <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                ) : upcomingB ? (
                  <div
                    onClick={() => {
                      setSelectedVehicleForDrawer(null);
                      navigate(`/booking/${upcomingB.id}`);
                    }}
                    className="p-2.5 rounded-xl border border-blue-200 bg-blue-50 flex items-center justify-between text-xs cursor-pointer active:scale-[0.99] transition-all hover:bg-blue-100/70"
                  >
                    <div className="flex items-center gap-2 text-blue-950 font-bold min-w-0 pr-2">
                      <Calendar className="w-4 h-4 text-[#2563eb] shrink-0" />
                      <span className="truncate">
                        {t('Upcoming Service', 'Servis Akan Datang', '已有待服务预约')}: {formatDate(upcomingB.serviceDate || '')}
                      </span>
                    </div>
                    <span className="text-[#2563eb] font-bold text-xs flex items-center gap-0.5 shrink-0">
                      {t('View', 'Lihat', '查看')} <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                ) : null}

                {/* 5. Clear Action Buttons (Visual Focal Point #3) */}
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  {activeWo ? (
                    <Button
                      type="button"
                      onClick={() => {
                        setSelectedVehicleForDrawer(null);
                        navigate(`/repair-progress/${activeWo.id}`);
                      }}
                      className="h-11 bg-[#2563eb] hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center justify-center gap-1.5 active:scale-[0.98]"
                    >
                      <Wrench className="w-4 h-4" />
                      <span>{t('Track Repair', 'Jejak Pembaikan', '跟踪施工进度')}</span>
                    </Button>
                  ) : upcomingB ? (
                    <Button
                      type="button"
                      onClick={() => {
                        setSelectedVehicleForDrawer(null);
                        navigate(`/booking/${upcomingB.id}`);
                      }}
                      className="h-11 bg-[#2563eb] hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center justify-center gap-1.5 active:scale-[0.98]"
                    >
                      <Calendar className="w-4 h-4" />
                      <span>{t('View Booking', 'Lihat Tempahan', '查看已有预约')}</span>
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={() => {
                        const v = selectedVehicleForDrawer;
                        setSelectedVehicleForDrawer(null);
                        handleQuickBook(v);
                      }}
                      className="h-11 bg-[#2563eb] hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center justify-center gap-1.5 active:scale-[0.98]"
                    >
                      <Calendar className="w-4 h-4" />
                      <span>{t('Book Service', 'Tempah Servis', '预约服务')}</span>
                    </Button>
                  )}

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const id = selectedVehicleForDrawer.id;
                      setSelectedVehicleForDrawer(null);
                      navigate(`/vehicle/${id}`, { state: { from: '/fleet' } });
                    }}
                    className="h-11 border-slate-200 hover:bg-slate-50 text-slate-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-[0.98]"
                  >
                    <Info className="w-4 h-4 text-slate-500" />
                    <span>{t('Full Profile', 'Profil Penuh', '完整档案与历史')}</span>
                  </Button>
                </div>
              </div>
            </div>
          );
        })(),
        document.body
      )}

      {/* Bottom spacing to account for floating navigation bar */}
      <div className="h-20 shrink-0" />
    </div>
  );
}
