import React, { useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { ArrowLeft, Car, Calendar, AlertCircle, Search, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { Button } from '../components/ui/button';
import { useLanguage } from '../context/LanguageContext';
import { useBooking } from '../context/BookingContext';
import { useCustomerData } from '../context/CustomerDataContext';
import { DataState } from '../components/DataState';

export function BookingSelectVehicle() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();
  const { bookingData, updateBookingData } = useBooking();
  const { data, isLoading, error, reload } = useCustomerData();
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(
    bookingData.vehicleId || location.state?.vehicleId || ''
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'eligible' | 'prime' | 'trailer' | 'lorry'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 6;

  React.useEffect(() => {
    if (location.state?.serviceType) {
      updateBookingData({ serviceType: location.state.serviceType, vehicleId: location.state.vehicleId });
    }
  }, [location.state?.serviceType]);

  const isExpiringSoon = (dateStr?: string) => {
    if (!dateStr) return false;
    const expiry = new Date(dateStr);
    const today = new Date();
    const daysUntilExpiry = Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiry <= 30 && daysUntilExpiry >= 0;
  };

  const isExpired = (dateStr?: string) => {
    if (!dateStr) return false;
    const expiry = new Date(dateStr);
    const today = new Date();
    return expiry < today;
  };

  const isVehicleInWorkshop = (vehicleId: string) => {
    return (data?.workOrders || []).some(
      (wo) => wo.vehicleId === vehicleId && wo.status !== 'collected'
    );
  };

  const hasActiveUpcomingBooking = (vehicleId: string) => {
    return (data?.bookings || []).some(
      (b) => b.orderType === 'service' && ['pending', 'confirmed'].includes(b.status) && b.vehicleId === vehicleId
    );
  };

  const checkEligibility = (vehicle: any) => {
    const verificationStatus = vehicle.verificationStatus || 'approved';
    const missingDocumentDate = !vehicle.insuranceExpiry || !vehicle.roadTaxExpiry;
    const insuranceExpired = isExpired(vehicle.insuranceExpiry);
    const roadTaxExpired = isExpired(vehicle.roadTaxExpiry);
    const documentsPending = vehicle.documents?.some((doc: any) => doc.status === 'pending') || false;
    const complianceBlocked = missingDocumentDate || insuranceExpired || roadTaxExpired || documentsPending;
    const inWorkshop = isVehicleInWorkshop(vehicle.id);
    const hasBooking = hasActiveUpcomingBooking(vehicle.id);

    return verificationStatus === 'approved' && !complianceBlocked && !inWorkshop && !hasBooking;
  };

  const filteredVehicles = useMemo(() => {
    if (!data?.user.vehicles) return [];
    let list = data.user.vehicles;

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((v) =>
        v.regNo.toLowerCase().includes(q) ||
        (v.vecNo && v.vecNo.toLowerCase().includes(q)) ||
        (v.equipment && v.equipment.toLowerCase().includes(q)) ||
        (v.brand && v.brand.toLowerCase().includes(q))
      );
    }

    // Category / Status filter
    if (activeFilter === 'eligible') {
      list = list.filter((v) => checkEligibility(v));
    } else if (activeFilter === 'prime') {
      list = list.filter((v) => v.equipment?.toLowerCase().includes('prime mover') || v.equipment?.toLowerCase().includes('truck'));
    } else if (activeFilter === 'trailer') {
      list = list.filter((v) => v.equipment?.toLowerCase().includes('trailer') || v.equipment?.toLowerCase().includes('chassis'));
    } else if (activeFilter === 'lorry') {
      list = list.filter((v) => v.equipment?.toLowerCase().includes('lorry') || v.equipment?.toLowerCase().includes('van'));
    }

    return list;
  }, [data?.user.vehicles, searchQuery, activeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredVehicles.length / ITEMS_PER_PAGE));
  const currentVehicles = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredVehicles.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredVehicles, currentPage]);

  if (!data) {
    return <DataState isLoading={isLoading} error={error} onRetry={() => void reload()} />;
  }
  if (!data.user.permissions.canCreateBooking) {
    return <DataState isLoading={false} error={t('You are not authorised to create bookings', 'Anda tidak dibenarkan membuat tempahan', '您无权创建预约')} onRetry={() => navigate('/home')} />;
  }

  const handleContinue = () => {
    const selectedVehicle = data.user.vehicles.find((vehicle) => vehicle.id === selectedVehicleId);
    if (selectedVehicle && checkEligibility(selectedVehicle)) {
      updateBookingData({ vehicleId: selectedVehicleId });
      if (location.state?.returnToSummary) {
        navigate('/booking/step5');
      } else {
        navigate('/booking/step1');
      }
    }
  };

  const selectedVehicleObj = data.user.vehicles.find((item) => item.id === selectedVehicleId);
  const isSelectedVehicleEligible = selectedVehicleObj ? checkEligibility(selectedVehicleObj) : false;

  return (
    <div className="flex flex-col flex-1 pb-24">
      {/* Search & Quick Filter Pills */}
      <div className="px-5 pt-2 pb-2 space-y-2">
        <div className="relative flex items-center">
          <Search className="absolute left-3 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder={t('Search plate, unit no, or equipment...', 'Cari plat, no unit, atau peralatan...', '搜索车牌、车辆编号或类型...')}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 text-xs placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
          />
        </div>

        {/* Filter Pills */}
        <div className="scrollbar-none flex items-center gap-1.5 overflow-x-auto py-0.5" data-horizontal-scroll="true">
          {[
            { key: 'all', label: t('All', 'Semua', '全部') },
            { key: 'eligible', label: t('Eligible Only', 'Layak Sahaja', '仅合规可用') },
            { key: 'prime', label: t('Prime Mover', 'Prime Mover', '拖头') },
            { key: 'trailer', label: t('Trailer', 'Treler', '挂车') },
            { key: 'lorry', label: t('Lorry', 'Lori', '货车') },
          ].map((pill) => (
            <button
              key={pill.key}
              type="button"
              onClick={() => {
                setActiveFilter(pill.key as any);
                setCurrentPage(1);
              }}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold transition-all ${
                activeFilter === pill.key
                  ? 'bg-[#2563eb] text-white shadow-2xs'
                  : 'bg-white border border-slate-200/80 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      {/* Selectable Vehicle List - High Density (~50px per row) */}
      <div className="px-5 space-y-2 flex-1">
        {currentVehicles.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-xs text-slate-500">
            {t('No matching vehicles found.', 'Tiada kenderaan sepadan ditemui.', '未找到符合条件的车辆。')}
          </div>
        ) : (
          currentVehicles.map((vehicle) => {
            const inWorkshop = isVehicleInWorkshop(vehicle.id);
            const hasBooking = hasActiveUpcomingBooking(vehicle.id);
            const isSelectable = checkEligibility(vehicle);
            const isSelected = selectedVehicleId === vehicle.id;
            const cleanPlate = (s?: string) => (s || '').replace(/[\s\-_]/g, '').toUpperCase();
            const showVecNo = Boolean(
              vehicle.vecNo &&
              vehicle.vecNo !== '-' &&
              cleanPlate(vehicle.vecNo) !== cleanPlate(vehicle.regNo)
            );

            return (
              <button
                key={vehicle.id}
                type="button"
                onClick={() => {
                  if (isSelectable) setSelectedVehicleId(vehicle.id);
                }}
                disabled={!isSelectable}
                className={`flex w-full items-center justify-between rounded-xl border p-2.5 text-left transition-all ${
                  isSelected
                    ? 'border-[#2563eb] bg-blue-50/80 ring-1 ring-blue-500/20 shadow-xs'
                    : isSelectable
                    ? 'border-slate-200/70 bg-white hover:border-blue-200 active:scale-[0.99] shadow-2xs'
                    : 'border-slate-200/50 bg-slate-50 opacity-70 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    isSelected ? 'bg-[#2563eb] text-white' : inWorkshop ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                  }`}>
                    <Car className="h-4 w-4" />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-xs text-slate-900 leading-tight">{vehicle.regNo}</span>
                      {showVecNo && (
                        <span className="rounded bg-slate-100 px-1 py-0.2 text-[9px] font-bold text-slate-600">
                          {vehicle.vecNo}
                        </span>
                      )}
                      {inWorkshop ? (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-100 border border-amber-300 px-1.5 py-0.2 text-[9px] font-bold text-amber-900">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                          {t('In Workshop', 'Di Bengkel', '在厂维修中')}
                        </span>
                      ) : hasBooking ? (
                        <span className="inline-flex items-center gap-1 rounded bg-blue-50 border border-blue-200 px-1.5 py-0.2 text-[9px] font-bold text-blue-700">
                          {t('Already Booked', 'Ditempah', '已有预约')}
                        </span>
                      ) : !isSelectable ? (
                        <span className="rounded bg-red-100 px-1.5 py-0.2 text-[9px] font-bold text-red-700">
                          {t('Blocked', 'Disekat', '不可用')}
                        </span>
                      ) : null}
                    </div>
                    <p className="truncate text-[11px] text-slate-500 mt-0.5">
                      {vehicle.equipment || `${vehicle.brand} ${vehicle.model}`}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  {isSelected ? (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#2563eb] text-white">
                      <Check className="h-3 w-3 stroke-[3]" />
                    </span>
                  ) : (
                    <span className="h-4 w-4 rounded-full border border-slate-300" />
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Compact Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 px-5 pt-3 pb-1">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            className="h-11 w-11 rounded-2xl border border-slate-200/90 bg-white shadow-xs flex items-center justify-center text-slate-800 hover:bg-slate-50 active:scale-90 disabled:opacity-20 transition-all shrink-0"
            aria-label={t('Previous page', 'Halaman Lalu', '上一页')}
          >
            <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
          </button>

          <div className="h-11 px-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex items-center justify-center gap-1.5 font-mono select-none min-w-[5.5rem]">
            <span className="text-sm font-black text-[#2563eb]">{currentPage}</span>
            <span className="text-slate-300 font-bold text-xs">/</span>
            <span className="text-xs font-bold text-slate-500">{totalPages}</span>
          </div>

          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
            className="h-11 w-11 rounded-2xl border border-slate-200/90 bg-white shadow-xs flex items-center justify-center text-slate-800 hover:bg-slate-50 active:scale-90 disabled:opacity-20 transition-all shrink-0"
            aria-label={t('Next page', 'Halaman Seterusnya', '下一页')}
          >
            <ChevronRight className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>
      )}

      {/* Floating Capsule Bottom Button */}
      <div className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-50 w-[calc(100%-2rem)] max-w-[416px] -translate-x-1/2">
        <Button
          onClick={handleContinue}
          disabled={!selectedVehicleId || !isSelectedVehicleEligible}
          className="w-full h-[3.5rem] rounded-[1.25rem] bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-base font-semibold shadow-[0_10px_28px_rgba(37,99,235,0.32)] disabled:bg-gray-300 disabled:shadow-none disabled:cursor-not-allowed transition-all flex items-center justify-center"
        >
          {t('Continue', 'Teruskan', '继续')}
        </Button>
      </div>
    </div>
  );
}
