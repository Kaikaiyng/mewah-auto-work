import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Car, Wrench, Calendar, DollarSign, FileText, MapPin, Download, Share2, Search, ChevronLeft, ChevronRight, X, Clock, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { useLanguage } from '../context/LanguageContext';
import { useCustomerData } from '../context/CustomerDataContext';
import { DataState } from '../components/DataState';
import { fetchCustomerVehicleHistory, type CustomerVehicleHistoryData } from '../lib/api';
import { formatDate } from '../lib/dateTime';
import { toast } from 'sonner';

interface ServiceRecord {
  id: string;
  invoiceNumber: string;
  workOrderNumber?: string;
  date: string;
  type: string;
  description: string;
  mileage: number;
  cost: number;
  location: string;
  status: string;
  bookingId?: string;
}

export function VehicleHistoryScreen() {
  const navigate = useNavigate();
  const { vehicleId } = useParams();
  const { t } = useLanguage();
  const { data, isLoading, error, reload } = useCustomerData();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'maintenance' | 'repair' | 'brake' | 'tire'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRecord, setSelectedRecord] = useState<ServiceRecord | null>(null);
  const [historyData, setHistoryData] = useState<CustomerVehicleHistoryData | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const ITEMS_PER_PAGE = 6;

  const vehicle = data?.user.vehicles.find(v => v.id === vehicleId) || data?.user.vehicles[0];

  useEffect(() => {
    let active = true;
    if (vehicle?.id) {
      setLoadingHistory(true);
      fetchCustomerVehicleHistory(vehicle.id, vehicle.regNo)
        .then((res) => {
          if (!active) return;
          const payload = ((res as any)?.data || res) as CustomerVehicleHistoryData;
          if (payload && (payload.workOrders || payload.summary)) {
            setHistoryData(payload);
          }
        })
        .catch((err) => {
          console.error('Failed to load vehicle history:', err);
        })
        .finally(() => {
          if (active) setLoadingHistory(false);
        });
    }
    return () => {
      active = false;
    };
  }, [vehicle?.id, vehicle?.regNo]);

  // Combine real backend history work orders with context bookings
  const serviceRecords: ServiceRecord[] = useMemo(() => {
    const records: ServiceRecord[] = [];
    const seenKeys = new Set<string>();

    // 1. From backend history endpoint if loaded
    if (historyData?.workOrders && historyData.workOrders.length > 0) {
      for (const wo of historyData.workOrders) {
        const key = wo.workOrderNo || `wo-${wo.id}`;
        seenKeys.add(key);
        const issue = wo.primaryIssue || t('Regular Maintenance', 'Penyelenggaraan Berkala', '常规保养');
        records.push({
          id: `wo-${wo.id}`,
          invoiceNumber: wo.workOrderNo || `WO-${wo.id}`,
          workOrderNumber: wo.workOrderNo,
          date: (wo.completedAt || wo.checkinAt || '').slice(0, 10) || '',
          type: issue,
          description: `${wo.statusLabel || wo.status} · ${wo.primaryIssue || 'Workshop Service'}`,
          mileage: wo.checkinMileage || wo.currentMileage || vehicle?.mileage || 0,
          cost: wo.totalAmount || 0,
          location: 'Mewah AutoWorks HQ',
          status: wo.status === 'collected' ? 'completed' : wo.status
        });
      }
    }

    // 2. From CustomerData context bookings for this vehicle
    const vehicleBookings = data?.bookings.filter((b) => String(b.vehicleId) === String(vehicle?.id) && b.orderType === 'service') || [];
    for (const b of vehicleBookings) {
      const key = b.workOrderNumber || b.invoiceNumber || b.bookingNumber;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        records.push({
          id: b.id,
          bookingId: b.id,
          invoiceNumber: b.invoiceNumber || b.workOrderNumber || b.bookingNumber,
          workOrderNumber: b.workOrderNumber,
          date: (b.serviceDate || b.createdAt || '').slice(0, 10) || '',
          type: b.serviceType || t('Regular Maintenance', 'Penyelenggaraan Berkala', '定期保养'),
          description: b.notes || b.reportedProblem || t('Scheduled service inspection', 'Pemeriksaan servis berjadual', '定期保养与检查'),
          mileage: b.mileage || vehicle?.mileage || 0,
          cost: b.totalPrice || 0,
          location: b.serviceCentre || 'Mewah AutoWorks',
          status: b.status === 'completed' ? 'completed' : b.status
        });
      }
    }

    // Sort descending by date
    return records.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
  }, [historyData, data?.bookings, vehicle, t]);

  const handleBack = () => {
    navigate(`/vehicle/${vehicleId}`, { replace: true });
  };

  if (!data || !vehicle) {
    return <DataState isLoading={isLoading} error={error || t('Vehicle not found', 'Kenderaan tidak dijumpai', '未找到车辆')} onRetry={() => void reload()} />;
  }

  // Filter and search logic
  const filteredRecords = useMemo(() => {
    return serviceRecords.filter(record => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matches = 
          record.invoiceNumber.toLowerCase().includes(q) ||
          record.type.toLowerCase().includes(q) ||
          record.description.toLowerCase().includes(q);
        if (!matches) return false;
      }

      if (activeFilter === 'maintenance') {
        const tLower = record.type.toLowerCase();
        return tLower.includes('maintenance') || tLower.includes('oil') || tLower.includes('regular') || tLower.includes('penyelenggaraan') || tLower.includes('保养');
      }
      if (activeFilter === 'repair') {
        const tLower = record.type.toLowerCase();
        return tLower.includes('repair') || tLower.includes('pembaikan') || tLower.includes('维修');
      }
      if (activeFilter === 'brake') {
        const tLower = record.type.toLowerCase();
        return tLower.includes('brake') || tLower.includes('brek') || tLower.includes('刹车');
      }
      if (activeFilter === 'tire') {
        const tLower = record.type.toLowerCase();
        return tLower.includes('tire') || tLower.includes('tayar') || tLower.includes('wheel') || tLower.includes('轮胎');
      }

      return true;
    });
  }, [serviceRecords, searchQuery, activeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / ITEMS_PER_PAGE));
  const currentRecords = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredRecords.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredRecords, currentPage]);

  const handleDownloadPDF = (record: ServiceRecord) => {
    toast.success(t(
      `Downloading invoice ${record.invoiceNumber}...`,
      `Memuat turun invois ${record.invoiceNumber}...`,
      `正在下载发票 ${record.invoiceNumber}...`
    ));
  };

  const handleShareWhatsApp = (record: ServiceRecord) => {
    const message = encodeURIComponent(
      `Mewah AutoWorks Service Record\n` +
      `Reference: ${record.invoiceNumber}\n` +
      `Date: ${record.date ? formatDate(record.date) : '-'}\n` +
      `Service: ${record.type}\n` +
      `Mileage: ${record.mileage ? `${record.mileage.toLocaleString()} km` : '-'}\n` +
      `Cost: RM ${Number(record.cost || 0).toFixed(2)}\n` +
      `Vehicle: ${vehicle.model} (${vehicle.regNo})`
    );
    window.open(`https://wa.me/?text=${message}`, '_blank');
  };

  const showVecNo = vehicle.vecNo && vehicle.vecNo !== '-' && vehicle.vecNo.trim().toUpperCase() !== vehicle.regNo.trim().toUpperCase();

  // Summary figures
  const displayLastDay = historyData?.summary?.lastServiceDate || vehicle.lastServiceDate || (serviceRecords[0]?.date ? serviceRecords[0].date : null);
  const displayLastMileage = historyData?.summary?.lastServiceMileage || vehicle.lastServiceMileage || vehicle.mileage || 0;
  const displayNextMileage = historyData?.summary?.nextServiceMileage || vehicle.nextServiceMileage || null;

  return (
    <div className="min-h-screen bg-[#eef3fb] max-w-md mx-auto pb-24 flex flex-col">
      {/* Header */}
      <header className="maw-page-header sticky top-0 z-40 relative flex items-center justify-between">
        <button
          onClick={handleBack}
          className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-gray-700 ring-1 ring-blue-100 shadow-sm hover:bg-blue-50 transition-colors"
          aria-label={t('Back', 'Kembali', '返回')}
        >
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <div className="text-center absolute left-1/2 -translate-x-1/2 pointer-events-none truncate max-w-[200px]">
          <h1 className="text-base font-bold truncate">
            {t('Service History', 'Sejarah Servis', '服务历史')}
          </h1>
          <p className="text-[10px] font-semibold text-slate-500 truncate">
            {vehicle.regNo} {showVecNo ? `(${vehicle.vecNo})` : ''}
          </p>
        </div>
        <div className="w-10" />
      </header>

      {/* Maintenance & Mileage Quick Snapshot Bar */}
      <div className="px-5 pt-3 pb-1">
        <div className="grid grid-cols-3 gap-2 bg-white p-3 rounded-2xl border border-slate-200/70 shadow-xs text-xs">
          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">{t('Last Workshop', 'Bengkel Lalu', '上次进厂')}</p>
            <p className="font-bold text-slate-900 mt-0.5 truncate text-[11px]">
              {displayLastDay ? formatDate(displayLastDay) : t('No record', 'Tiada rekod', '无记录')}
            </p>
          </div>
          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">{t('Last Mileage', 'Perbatuan', '上次里程')}</p>
            <p className="font-bold font-mono text-slate-900 mt-0.5 text-[11px]">
              {displayLastMileage ? `${displayLastMileage.toLocaleString()} km` : '—'}
            </p>
          </div>
          <div>
            <p className="text-[9px] font-bold text-blue-600 uppercase tracking-tight">{t('Next Due', 'Seterusnya', '下次到期')}</p>
            <p className="font-bold font-mono text-blue-700 mt-0.5 text-[11px]">
              {displayNextMileage ? `${displayNextMileage.toLocaleString()} km` : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Search & Filter Pills */}
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
            placeholder={t('Search invoices or services...', 'Cari invois atau servis...', '搜索工单、发票或服务类型...')}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 text-xs placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
          />
        </div>

        {/* 1-Tap Filter Pills */}
        <div className="scrollbar-none flex items-center gap-1.5 overflow-x-auto py-0.5" data-horizontal-scroll="true">
          {[
            { key: 'all', label: t('All', 'Semua', '全部') },
            { key: 'maintenance', label: t('Maintenance', 'Penyelenggaraan', '保养') },
            { key: 'repair', label: t('Repair', 'Pembaikan', '维修') },
            { key: 'brake', label: t('Brake', 'Brek', '刹车') },
            { key: 'tire', label: t('Tire', 'Tayar', '轮胎') },
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

      {/* High-Density Service Record Rows (~52px) */}
      <main className="px-5 space-y-2 flex-1">
        {currentRecords.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-xs text-slate-500 space-y-3">
            <p>{t('No service records found for this vehicle.', 'Tiada rekod servis ditemui untuk kenderaan ini.', '暂无此车辆的历史服务记录。')}</p>
            <Button
              onClick={() => navigate('/booking/step1', { state: { vehicleId: vehicle.id } })}
              className="bg-[#2563eb] text-white text-xs font-bold rounded-xl h-9 px-4"
            >
              {t('Book Service', 'Tempah Servis', '预约服务')}
            </Button>
          </div>
        ) : (
          currentRecords.map((record) => (
            <div
              key={record.id}
              onClick={() => setSelectedRecord(record)}
              className="flex items-center justify-between rounded-xl border border-slate-200/70 bg-white p-3 shadow-2xs active:scale-[0.99] cursor-pointer hover:border-blue-200"
            >
              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#2563eb]">
                  <Wrench className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-xs text-slate-900 truncate">{record.type}</span>
                    <span className="font-mono text-[10px] text-[#2563eb] font-semibold">{record.invoiceNumber}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {record.date ? formatDate(record.date) : '—'} {record.mileage > 0 ? `· ${record.mileage.toLocaleString()} km` : ''}
                  </p>
                </div>
              </div>

              <div className="shrink-0 text-right">
                <span className="block font-mono text-xs font-black text-slate-900">
                  {record.cost > 0 ? `RM ${record.cost.toFixed(2)}` : t('Pending', 'Menunggu', '待结算')}
                </span>
                <span className="mt-0.5 inline-block rounded-full bg-emerald-100 px-1.5 py-0.2 text-[9px] font-bold text-emerald-800 uppercase">
                  {record.status}
                </span>
              </div>
            </div>
          ))
        )}
      </main>

      {/* Pagination Controls (Centered Large Thumb-Friendly Mobile Bar) */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 px-5 pt-3 pb-2">
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

      {/* Record Quick Detail Drawer / Bottom Sheet */}
      {selectedRecord && (
        <div
          data-prevent-swipe="true"
          className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/60 p-0 sm:p-4 backdrop-blur-xs"
          onClick={() => setSelectedRecord(null)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white p-5 shadow-2xl space-y-4 animate-in slide-in-from-bottom-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">{selectedRecord.type}</h3>
                <p className="font-mono text-xs text-[#2563eb] font-semibold">{selectedRecord.invoiceNumber}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs text-slate-600">
              <p className="text-slate-700">{selectedRecord.description}</p>
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">{t('Cost', 'Kos', '费用')}</span>
                  <span className="font-mono text-sm font-black text-slate-900">
                    {selectedRecord.cost > 0 ? `RM ${selectedRecord.cost.toFixed(2)}` : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">{t('Mileage', 'Perbatuan', '里程')}</span>
                  <span className="font-bold text-slate-900">
                    {selectedRecord.mileage > 0 ? `${selectedRecord.mileage.toLocaleString()} km` : '—'}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {selectedRecord.location}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button
                onClick={() => handleDownloadPDF(selectedRecord)}
                className="h-10 bg-[#2563eb] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                {t('PDF Invoice', 'Invois PDF', '下载发票')}
              </Button>
              <Button
                onClick={() => handleShareWhatsApp(selectedRecord)}
                className="h-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <Share2 className="w-3.5 h-3.5" />
                WhatsApp
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
