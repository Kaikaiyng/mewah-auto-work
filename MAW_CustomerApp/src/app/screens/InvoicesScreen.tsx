import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, FileText, ChevronRight, Calendar, Search, X, ChevronLeft, CheckCircle2, AlertTriangle, Building2 } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useCustomerData } from '../context/CustomerDataContext';
import { DataState } from '../components/DataState';
import { formatDate } from '../lib/dateTime';

type InvoiceFilterStatus = 'all' | 'unpaid' | 'paid' | 'autocount';
const ITEMS_PER_PAGE = 7;

export function InvoicesScreen() {
  const navigate = useNavigate();
  const { vehicleId } = useParams();
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<InvoiceFilterStatus>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const { data, isLoading, error, reload } = useCustomerData();

  const bookings = useMemo(() => data?.bookings || [], [data?.bookings]);
  const completedBookings = useMemo(() => bookings.filter(booking => booking.invoice), [bookings]);

  const getVehicleInfo = (vId?: string) => {
    return data?.user.vehicles.find(v => String(v.id) === String(vId));
  };

  // Filter logic
  const filteredBookings = useMemo(() => {
    return completedBookings.filter(booking => {
      if (vehicleId && String(booking.vehicleId) !== String(vehicleId)) {
        return false;
      }
      const vehicle = getVehicleInfo(booking.vehicleId);
      const searchLower = searchQuery.toLowerCase().trim();

      if (searchLower) {
        const matchesSearch =
          booking.invoiceNumber?.toLowerCase().includes(searchLower) ||
          booking.bookingNumber?.toLowerCase().includes(searchLower) ||
          booking.serviceType?.toLowerCase().includes(searchLower) ||
          booking.invoice?.vehicleNoRaw?.toLowerCase().includes(searchLower) ||
          booking.invoice?.workOrderId?.toLowerCase().includes(searchLower) ||
          vehicle?.equipment?.toLowerCase().includes(searchLower) ||
          vehicle?.regNo?.toLowerCase().includes(searchLower) ||
          vehicle?.vecNo?.toLowerCase().includes(searchLower) ||
          vehicle?.model?.toLowerCase().includes(searchLower);

        if (!matchesSearch) return false;
      }

      const invStatus = (booking.invoice?.status || 'issued').toLowerCase();
      const isPaid = invStatus === 'paid';
      const isUnpaid = invStatus === 'overdue' || invStatus === 'issued' || invStatus === 'partially_paid' || (booking.invoice?.balance ?? booking.totalPrice) > 0;

      if (statusFilter === 'unpaid') return isUnpaid && !isPaid;
      if (statusFilter === 'paid') return isPaid;
      if (statusFilter === 'autocount') return booking.invoice?.source === 'autocount';

      return true;
    });
  }, [completedBookings, vehicleId, searchQuery, statusFilter, data?.user.vehicles]);

  const totalPages = Math.max(1, Math.ceil(filteredBookings.length / ITEMS_PER_PAGE));
  const paginatedBookings = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredBookings.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredBookings, currentPage]);

  const handleFilterChange = (filter: InvoiceFilterStatus) => {
    setStatusFilter(filter);
    setCurrentPage(1);
  };

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    setCurrentPage(1);
  };

  const handleBack = () => {
    if (vehicleId) {
      navigate(`/vehicle/${vehicleId}`, { replace: true });
    } else {
      navigate(-1);
    }
  };

  if (!data) {
    return <DataState isLoading={isLoading} error={error} onRetry={() => void reload()} />;
  }

  if (!data.user.permissions.canViewInvoices) {
    return <DataState isLoading={false} error={t('You are not authorised to view invoices', 'Anda tidak dibenarkan melihat invois', '您无权查看发票')} onRetry={() => navigate('/profile')} />;
  }

  return (
    <div className="min-h-screen bg-[#eef3fb] max-w-md mx-auto flex flex-col justify-between">
      {/* 1. Standard Minimalist Header */}
      <div className="maw-page-header sticky top-0 z-40 relative flex items-center justify-between shrink-0">
        <button
          onClick={handleBack}
          className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-gray-700 ring-1 ring-blue-100 shadow-sm hover:bg-blue-50 transition-colors"
          aria-label={t('Back', 'Kembali', '返回')}
        >
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <h1 className="text-base font-bold text-center absolute left-1/2 -translate-x-1/2 pointer-events-none truncate max-w-[200px]">
          {vehicleId ? t('Vehicle Invoices', 'Invois Kenderaan', '车辆发票') : t('Invoices', 'Invois', '发票')}
        </h1>
        <div className="w-10" />
      </div>

      {/* 2. Compact Search & Status Filter Panel */}
      <div className="px-5 pt-3 pb-2 shrink-0 space-y-2">
        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={t('Search invoice no, plate, booking...', 'Cari no invois, plat...', '搜索发票号、车牌、单号...')}
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full h-10 pl-9 pr-8 rounded-xl bg-white border border-slate-200/80 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563eb] shadow-2xs transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => handleSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* 1-Tap Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {[
            { id: 'all', label: t('All', 'Semua', '全部'), count: completedBookings.length },
            { id: 'unpaid', label: t('Unpaid / Outstanding', 'Belum Bayar', '待付款'), count: completedBookings.filter(b => (b.invoice?.balance ?? b.totalPrice) > 0).length, alert: true },
            { id: 'paid', label: t('Paid', 'Selesai', '已结清'), count: completedBookings.filter(b => (b.invoice?.status || '').toLowerCase() === 'paid').length },
            { id: 'autocount', label: 'AutoCount Sync', count: completedBookings.filter(b => b.invoice?.source === 'autocount').length },
          ].map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => handleFilterChange(chip.id as InvoiceFilterStatus)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all shrink-0 ${
                statusFilter === chip.id
                  ? 'bg-[#1e3a8a] text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-50'
              }`}
            >
              <span>{chip.label}</span>
              <span className={`text-[10px] px-1 rounded-full ${
                statusFilter === chip.id
                  ? 'bg-white/20 text-white'
                  : chip.alert && chip.count > 0
                  ? 'bg-amber-100 text-amber-900 font-black'
                  : 'bg-slate-100 text-slate-500'
              }`}>
                {chip.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 3. Compact Single-Screen List */}
      <div className="flex-1 px-5 pb-4 min-h-0 flex flex-col justify-between">
        {filteredBookings.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-xs my-auto">
            <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-bold text-slate-700">
              {t('No invoices found', 'Tiada invois ditemui', '未找到发票记录')}
            </p>
            <button
              onClick={() => { setSearchQuery(''); setStatusFilter('all'); setCurrentPage(1); }}
              className="mt-3 text-xs text-[#2563eb] font-bold hover:underline"
            >
              {t('Reset Filters', 'Tetapkan Semula', '重置筛选条件')}
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {paginatedBookings.map((booking) => {
              const vehicle = getVehicleInfo(booking.vehicleId);
              const invStatus = (booking.invoice?.status || 'issued').toLowerCase();
              const isPaid = invStatus === 'paid';
              const isOverdue = invStatus === 'overdue';

              return (
                <div
                  key={booking.id}
                  onClick={() => navigate(`/invoice/${booking.id}`)}
                  className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200/70 bg-white hover:border-blue-300 hover:shadow-xs transition-all cursor-pointer active:scale-[0.99]"
                >
                  {/* Left: Invoice No, Plate, Date */}
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 leading-tight">
                        <span className="font-extrabold text-sm text-slate-900 tracking-tight font-mono">
                          {booking.invoiceNumber}
                        </span>
                        {booking.invoice?.source === 'autocount' && (
                          <span className="px-1 py-0.1 rounded bg-blue-50 text-blue-700 font-bold text-[9px] uppercase border border-blue-200">
                            AutoCount
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">
                        {vehicle?.regNo ? `${vehicle.regNo} · ` : ''}{formatDate(booking.serviceDate || '')}
                      </p>
                    </div>
                  </div>

                  {/* Right: Amount, Status Pill, Chevron */}
                  <div className="flex items-center gap-2 shrink-0 text-right">
                    <div>
                      <p className="font-black text-xs text-[#2563eb] font-mono leading-tight">
                        RM {Number(booking.totalPrice || 0).toFixed(2)}
                      </p>
                      <span className={`inline-block mt-0.5 px-1.5 py-0.2 rounded-full text-[9px] font-bold ${
                        isPaid
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : isOverdue
                          ? 'bg-rose-100 text-rose-800 border border-rose-200'
                          : 'bg-amber-50 text-amber-800 border border-amber-200'
                      }`}>
                        {isPaid ? t('Paid', 'Selesai', '已结清') : isOverdue ? t('Overdue', 'Lewat', '逾期') : t('Unpaid', 'Belum Bayar', '待付')}
                      </span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Controls (Centered Large Thumb-Friendly Mobile Bar) */}
        {filteredBookings.length > 0 && (
          <div className="flex items-center justify-center gap-3 pt-2.5 pb-2 border-t border-slate-200/60 mt-1.5">
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
              <span className="text-xs font-bold text-slate-500">{totalPages}</span>
            </div>

            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              className="h-11 w-11 rounded-2xl border border-slate-200/90 bg-white shadow-xs flex items-center justify-center text-slate-800 hover:bg-slate-50 active:scale-90 disabled:opacity-20 transition-all shrink-0"
              aria-label={t('Next Page', 'Halaman Seterusnya', '下一页')}
            >
              <ChevronRight className="w-5 h-5 stroke-[2.5]" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
