import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router';
import { ArrowLeft, Car, Calendar, FileText, Wrench, History, Upload, Eye, Download, LoaderCircle, Pencil, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useLanguage } from '../context/LanguageContext';
import { useCustomerData } from '../context/CustomerDataContext';
import { DataState } from '../components/DataState';
import { useBooking } from '../context/BookingContext';
import { bookingStatusLabel, workOrderLabels } from '../lib/status';
import type { WorkOrderStatus } from '../types';
import { fetchCustomerVehicleDocument, uploadCustomerVehicleDocument } from '../lib/api';
import { MobileDatePicker } from '../components/ui/mobile-date-picker';
import { formatDate } from '../lib/dateTime';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { toast } from 'sonner';
import type { VehicleDocument, VehicleDocumentType } from '../types';

interface VehicleDetailsScreenProps {
  overrideVehicleId?: string;
  isUnderlay?: boolean;
}

function toLocalIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function VehicleDetailsScreen({ overrideVehicleId }: VehicleDetailsScreenProps = {}) {
  const navigate = useNavigate();
  const { vehicleId: routeVehicleId } = useParams();
  const vehicleId = overrideVehicleId || routeVehicleId;
  const location = useLocation();
  const { t } = useLanguage();
  const { data, isLoading, error, reload } = useCustomerData();
  const { updateBookingData } = useBooking();
  const [uploadType, setUploadType] = useState<VehicleDocumentType | null>(null);
  const [uploadExpiry, setUploadExpiry] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<VehicleDocument | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewMimeType, setPreviewMimeType] = useState('');
  const previewRequestId = useRef(0);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  // Get the 'from' path from navigation state
  const from = (location.state as any)?.from || '/vehicles';

  // Find the vehicle
  const vehicle = data?.user.vehicles.find(v => String(v.id) === String(vehicleId)) || data?.user.vehicles[0];
  const activeVehicleId = vehicle?.id;
  const vehicleBookings = data?.bookings.filter((item) => String(item.vehicleId) === String(activeVehicleId) && item.orderType === 'service') || [];
  const upcomingBooking = vehicleBookings.find((item) => item.status === 'pending' || item.status === 'confirmed');
  const activeRepair = data?.workOrders.find((item) => String(item.vehicleId) === String(activeVehicleId) && item.status !== 'collected');
  const reminder = data?.reminders.find((item) => String(item.vehicleId) === String(activeVehicleId));
  const invoices = vehicleBookings.filter((item) => item.invoice);

  // Extended mock data
  const extendedVehicle = vehicle ? {
    ...vehicle,
    lastServiceKm: vehicle.lastServiceMileage,
    nextServiceKm: vehicle.nextServiceMileage
  } : null;
  const isContainerChassis = extendedVehicle?.equipment === 'Container Chassis / Skeletal Trailer';
  const isPrimeMover = extendedVehicle?.equipment === 'Prime Mover';

  if (!data) {
    return <DataState isLoading={isLoading} error={error} onRetry={() => void reload()} />;
  }

  if (!extendedVehicle) {
    return (
      <div className="min-h-screen bg-[#eef3fb] flex items-center justify-center max-w-md mx-auto">
        <div className="text-center">
          <Car className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">{t('Vehicle not found', 'Kenderaan tidak dijumpai', '未找到车辆')}</p>
          <Button
            onClick={() => navigate('/vehicles')}
            className="mt-4 bg-[#2563eb] hover:bg-[#1d4ed8]"
          >
            {t('Back to Vehicles', 'Kembali ke Kenderaan', '返回车辆列表')}
          </Button>
        </div>
      </div>
    );
  }

  const handleBack = () => {
    navigate('/vehicles', { replace: true });
  };

  const resetUploadDialog = () => {
    setUploadType(null);
    setUploadExpiry('');
    setUploadFile(null);
  };

  const closeUploadDialog = () => {
    if (!isUploading) {
      resetUploadDialog();
    }
  };

  const closeDocumentPreview = () => {
    previewRequestId.current += 1;
    setPreviewDocument(null);
    setPreviewUrl('');
    setPreviewMimeType('');
  };

  const showDocumentPreview = async (document: VehicleDocument) => {
    const requestId = previewRequestId.current + 1;
    previewRequestId.current = requestId;
    setPreviewDocument(document);
    setPreviewUrl('');
    setPreviewMimeType(document.mimeType);
    try {
      const blob = await fetchCustomerVehicleDocument(document.id);
      if (previewRequestId.current !== requestId) return;
      setPreviewMimeType(blob.type || document.mimeType);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (caught) {
      if (previewRequestId.current !== requestId) return;
      closeDocumentPreview();
      toast.error(caught instanceof Error ? caught.message : t('Unable to preview document.', 'Tidak dapat pratonton dokumen.', '无法预览证件。'));
    }
  };

  const currentUploadExpiry = uploadType === 'insurance'
    ? extendedVehicle.insuranceExpiry
    : uploadType === 'road_tax'
    ? extendedVehicle.roadTaxExpiry
    : uploadType === 'puspakom'
    ? extendedVehicle.puspakomExpiry
    : '';
  const today = toLocalIsoDate(new Date());
  const minimumUploadExpiry = currentUploadExpiry && currentUploadExpiry > today ? currentUploadExpiry : today;

  const submitDocument = async () => {
    if (!uploadType || !uploadExpiry || !uploadFile || !vehicleId) {
      toast.error(t('Choose an expiry date and document file.', 'Pilih tarikh tamat dan fail dokumen.', '请选择到期日期和证件文件。'));
      return;
    }
    if (uploadExpiry < minimumUploadExpiry) {
      toast.error(t(
        'The new expiry date cannot be earlier than the current expiry date or today.',
        'Tarikh tamat baharu tidak boleh lebih awal daripada tarikh tamat semasa atau hari ini.',
        '新的到期日期不能早于当前到期日期或今天。',
      ));
      return;
    }
    setIsUploading(true);
    try {
      await uploadCustomerVehicleDocument({ vehicleId, documentType: uploadType, expiryDate: uploadExpiry, document: uploadFile });
      await reload({ silent: true });
      resetUploadDialog();
      toast.success(t('Document submitted for admin review.', 'Dokumen dihantar untuk semakan admin.', '证件已提交管理员审核。'));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : t('Unable to upload document.', 'Tidak dapat memuat naik dokumen.', '无法上传证件。'));
    } finally {
      setIsUploading(false);
    }
  };

  const [activeTab, setActiveTab] = useState<'overview' | 'specs' | 'docs' | 'history'>('overview');

  const showVecNo = extendedVehicle.vecNo && extendedVehicle.vecNo !== '-' && extendedVehicle.vecNo.trim().toUpperCase() !== extendedVehicle.regNo.trim().toUpperCase();

  return (
    <div className="min-h-screen bg-[#eef3fb] pb-24 w-full max-w-md mx-auto">
      {/* Header */}
      <div className="maw-page-header sticky top-0 z-40 relative flex items-center justify-between">
        <button
          onClick={handleBack}
          className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-gray-700 ring-1 ring-blue-100 shadow-sm hover:bg-blue-50 transition-colors"
          aria-label={t('Back', 'Kembali', '返回')}
        >
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <div className="text-center absolute left-1/2 -translate-x-1/2 pointer-events-none truncate max-w-[200px]">
          <h1 className="text-base font-bold truncate">
            {extendedVehicle.regNo}
          </h1>
          {showVecNo && (
            <p className="text-[10px] font-semibold text-slate-500 truncate">
              {t('Unit', 'Unit', '编号')}: {extendedVehicle.vecNo}
            </p>
          )}
        </div>
        {extendedVehicle.verificationStatus === 'rejected' ? (
          <button
            type="button"
            onClick={() => navigate(`/vehicles/add?editVehicleId=${extendedVehicle.id}`)}
            className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-600 ring-1 ring-red-200 shadow-sm hover:bg-red-100 transition-colors"
            aria-label={t('Edit', 'Edit', '编辑')}
          >
            <Pencil className="w-4 h-4" />
          </button>
        ) : (
          <div className="w-10" />
        )}
      </div>

      <div className="px-5 pt-2 pb-24 space-y-3">
        {/* Compact Vehicle Header Badge */}
        <div className="flex items-center justify-between rounded-2xl border border-white/80 bg-white px-3.5 py-2.5 shadow-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#2563eb]">
              <Car className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-black text-slate-900">{extendedVehicle.regNo}</span>
                {showVecNo && (
                  <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[10px] font-bold text-slate-600">
                    {extendedVehicle.vecNo}
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-slate-500 font-medium">
                {extendedVehicle.equipment || `${extendedVehicle.brand} ${extendedVehicle.model}`}
              </p>
            </div>
          </div>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
            extendedVehicle.verificationStatus === 'rejected'
              ? 'bg-red-100 text-red-700'
              : extendedVehicle.verificationStatus === 'pending'
              ? 'bg-amber-100 text-amber-700'
              : activeRepair
              ? 'bg-blue-100 text-[#2563eb]'
              : 'bg-emerald-100 text-emerald-700'
          }`}>
            {extendedVehicle.verificationStatus === 'rejected'
              ? t('Rejected', 'Ditolak', '未通过')
              : extendedVehicle.verificationStatus === 'pending'
              ? t('Pending', 'Menunggu', '审核中')
              : activeRepair
              ? t('In Workshop', 'Di Bengkel', '维修中')
              : t('Ready', 'Sedia', '正常运行')}
          </span>
        </div>

        {/* Verification Warning (if not approved) */}
        {extendedVehicle.verificationStatus !== 'approved' && (
          <div className={`rounded-xl border px-3 py-2 text-xs ${
            extendedVehicle.verificationStatus === 'rejected'
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}>
            <p className="font-bold">
              {extendedVehicle.verificationStatus === 'rejected'
                ? t('Vehicle Rejected', 'Kenderaan Ditolak', '车辆审核未通过')
                : t('Pending Verification', 'Menunggu Pengesahan', '等待审核')}
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed">
              {extendedVehicle.verificationStatus === 'rejected'
                ? extendedVehicle.rejectionReason || t('Please contact support.', 'Sila hubungi sokongan.', '请联系支持。')
                : t('Admin approval is required before service booking.', 'Kelulusan admin diperlukan sebelum tempahan servis.', '管理员批准后才能预约服务。')}
            </p>
          </div>
        )}

        {/* Segmented Pill Tabs */}
        <div className="grid grid-cols-4 gap-1 rounded-2xl bg-white/80 p-1 border border-slate-200/70 shadow-2xs">
          {[
            { key: 'overview', label: t('Overview', 'Gambaran', '概览') },
            { key: 'specs', label: t('Specs', 'Spesifikasi', '参数') },
            { key: 'docs', label: t('Docs', 'Dokumen', '证件') },
            { key: 'history', label: t('History', 'Sejarah', '历史') },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key as any)}
              className={`rounded-xl py-1.5 text-center text-xs font-bold transition-all ${
                activeTab === tab.key
                  ? 'bg-[#2563eb] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-3">
            {/* Primary Action Button (Track Repair / View Booking / Book Service) */}
            {activeRepair ? (
              <Button
                onClick={() => navigate(`/repair-progress/${activeRepair.id}`)}
                className="w-full h-11 rounded-xl bg-[#2563eb] hover:bg-blue-700 font-bold text-white shadow-sm flex items-center justify-center gap-2 active:scale-[0.99]"
              >
                <Wrench className="w-4 h-4 mr-1" />
                <span>{t('Track Repair in Progress', 'Jejak Pembaikan Sedang Berjalan', '跟踪当前厂内维修进度')}</span>
              </Button>
            ) : upcomingBooking ? (
              <Button
                onClick={() => navigate(`/booking/${upcomingBooking.id}`)}
                className="w-full h-11 rounded-xl bg-[#2563eb] hover:bg-blue-700 font-bold text-white shadow-sm flex items-center justify-center gap-2 active:scale-[0.99]"
              >
                <Calendar className="w-4 h-4 mr-1" />
                <span>{t('View Upcoming Booking', 'Lihat Tempahan Akan Datang', '查看当前已有预约')}</span>
              </Button>
            ) : (
              <Button
                onClick={() => {
                  updateBookingData({ vehicleId, returnTo: '/vehicles' });
                  navigate('/booking/step1', { state: { from: '/vehicles' } });
                }}
                disabled={(extendedVehicle.verificationStatus || 'approved') !== 'approved'}
                className="w-full h-11 rounded-xl bg-[#2563eb] hover:bg-blue-700 font-bold text-white shadow-sm disabled:bg-gray-300 active:scale-[0.99]"
              >
                <Wrench className="w-4 h-4 mr-2" />
                {t('Book Service for this Vehicle', 'Tempah Servis Kenderaan Ini', '为此车预约服务')}
              </Button>
            )}

            {/* Active Repair Card */}
            {activeRepair && (
              <button
                type="button"
                onClick={() => navigate(`/repair-progress/${activeRepair.id}`)}
                className="flex w-full items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-[#173b75] to-[#1d4f91] p-3.5 text-left text-white shadow-sm active:scale-[0.99]"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
                    <Wrench className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold uppercase text-blue-200">{t('Active Repair', 'Pembaikan Aktif', '当前维修')}</span>
                      <span className="rounded bg-white/20 px-1.5 py-0.2 text-[9px] font-bold uppercase">
                        {workOrderLabels[activeRepair.status as WorkOrderStatus] || activeRepair.status}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs font-bold text-white font-mono">{activeRepair.workOrderNumber}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs font-bold text-white">
                  <span>{t('Track', 'Kesan', '跟踪')}</span>
                </div>
              </button>
            )}

            {/* Upcoming Booking Card */}
            {upcomingBooking && (
              <button
                type="button"
                onClick={() => navigate(`/booking/${upcomingBooking.id}`)}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50/70 p-3.5 text-left shadow-xs active:scale-[0.99]"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#2563eb] text-white">
                    <Calendar className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase text-[#2563eb]">{t('Upcoming Booking', 'Tempahan Akan Datang', '预约待处理')}</p>
                    <p className="text-xs font-bold text-slate-900 mt-0.5">{upcomingBooking.serviceType}</p>
                    <p className="text-[11px] text-slate-500">{upcomingBooking.serviceDate ? new Date(upcomingBooking.serviceDate).toLocaleDateString() : '-'}</p>
                  </div>
                </div>
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-[#2563eb]">
                  {bookingStatusLabel(upcomingBooking.status, 'service')}
                </span>
              </button>
            )}

            {/* Reminder Card */}
            {reminder && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">{t('Service Reminder', 'Peringatan Servis', '服务提醒')}</p>
                <p className="mt-1 text-xs font-bold text-slate-900">{reminder.serviceType}</p>
                <p className="mt-0.5 text-[11px] text-slate-600">
                  {new Date(reminder.nextServiceDate).toLocaleDateString()} · {reminder.status || 'due soon'}
                </p>
              </div>
            )}

            {/* Service & Mileage Quick Snapshot (Items 2, 3, 4, 5, 6 Parity) */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-2xl border border-slate-200/70 bg-white p-3 shadow-xs">
                <p className="text-[10px] font-bold uppercase text-slate-400">{t('Current Mileage', 'Perbatuan Semasa', '当前里程')}</p>
                <p className="mt-1 text-base font-black text-slate-900 font-mono">{(extendedVehicle.mileage || 0).toLocaleString()} km</p>
                <p className="mt-0.5 text-[10px] text-slate-500 truncate">{t('Last recorded', 'Rekod terkini', '最新里程读数')}</p>
              </div>
              <div className="rounded-2xl border border-slate-200/70 bg-white p-3 shadow-xs">
                <p className="text-[10px] font-bold uppercase text-blue-600">{t('Next Service Due', 'Servis Seterusnya', '下次服务建议')}</p>
                <p className="mt-1 text-base font-black text-blue-700 font-mono">
                  {extendedVehicle.nextServiceMileage ? `${extendedVehicle.nextServiceMileage.toLocaleString()} km` : (extendedVehicle.nextServiceDate ? formatDate(extendedVehicle.nextServiceDate) : '-')}
                </p>
                <p className="mt-0.5 text-[10px] text-blue-600/80 truncate">
                  {extendedVehicle.nextServiceDate ? formatDate(extendedVehicle.nextServiceDate) : t('No date set', 'Tiada tarikh', '未设日期')}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200/70 bg-white p-3 shadow-xs">
                <p className="text-[10px] font-bold uppercase text-slate-400">{t('Last Day at Workshop', 'Tarikh Bengkel Lalu', '上次进厂日期')}</p>
                <p className="mt-1 text-xs font-black text-slate-900">
                  {extendedVehicle.lastServiceDate ? formatDate(extendedVehicle.lastServiceDate) : t('No past visit', 'Tiada rekod', '暂无进厂')}
                </p>
                <p className="mt-0.5 text-[10px] text-slate-500 truncate">{t('Workshop visit', 'Tarikh keluar bengkel', '进厂完工时间')}</p>
              </div>
              <div className="rounded-2xl border border-slate-200/70 bg-white p-3 shadow-xs">
                <p className="text-[10px] font-bold uppercase text-slate-400">{t('Last Service Mileage', 'Perbatuan Servis Lalu', '上次保养里程')}</p>
                <p className="mt-1 text-xs font-black text-slate-900 font-mono">
                  {extendedVehicle.lastServiceMileage ? `${extendedVehicle.lastServiceMileage.toLocaleString()} km` : t('N/A', 'T/A', '无')}
                </p>
                <p className="mt-0.5 text-[10px] text-slate-500 truncate">{t('Recorded at workshop', 'Direkod di bengkel', '进厂时读数')}</p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: SPECS */}
        {activeTab === 'specs' && (
          <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-xs divide-y divide-slate-100 text-xs">
            <div className="flex justify-between py-2">
              <span className="text-slate-500">{t('Registration No', 'No Pendaftaran', '注册号码')}</span>
              <span className="font-bold text-slate-900">{extendedVehicle.regNo}</span>
            </div>
            {showVecNo && (
              <div className="flex justify-between py-2">
                <span className="text-slate-500">{t('Unit Number', 'Nombor Unit', '单位编号')}</span>
                <span className="font-bold text-slate-900">{extendedVehicle.vecNo}</span>
              </div>
            )}
            <div className="flex justify-between py-2">
              <span className="text-slate-500">{t('Equipment Type', 'Jenis Peralatan', '设备类型')}</span>
              <span className="font-bold text-slate-900">{extendedVehicle.equipment}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-slate-500">{t('Brand / Make', 'Jenama', '品牌')}</span>
              <span className="font-bold text-slate-900">{extendedVehicle.brand || '-'}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-slate-500">{t('Model / Series', 'Model', '型号')}</span>
              <span className="font-bold text-slate-900">{extendedVehicle.model || '-'}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-slate-500">{t('Last Day at Workshop', 'Tarikh Bengkel Lalu', '上次进厂日期')}</span>
              <span className="font-bold text-slate-900">
                {extendedVehicle.lastServiceDate ? formatDate(extendedVehicle.lastServiceDate) : t('No record', 'Tiada rekod', '暂无记录')}
              </span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-slate-500">{t('Last Service Mileage', 'Perbatuan Servis Lalu', '上次保养里程')}</span>
              <span className="font-bold font-mono text-slate-900">
                {extendedVehicle.lastServiceMileage ? `${extendedVehicle.lastServiceMileage.toLocaleString()} km` : t('N/A', 'T/A', '无')}
              </span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-slate-500">{t('Next Service Due', 'Servis Seterusnya', '下次服务建议')}</span>
              <span className="font-bold font-mono text-slate-900">
                {extendedVehicle.nextServiceMileage ? `${extendedVehicle.nextServiceMileage.toLocaleString()} km` : (extendedVehicle.nextServiceDate ? formatDate(extendedVehicle.nextServiceDate) : t('N/A', 'T/A', '无'))}
              </span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-slate-500">{t('Chassis No', 'No Casis', '车架/底盘号')}</span>
              <span className="font-bold font-mono text-slate-900 text-[11px]">{extendedVehicle.chassisNo || '-'}</span>
            </div>
            {isPrimeMover && (
              <div className="flex justify-between py-2">
                <span className="text-slate-500">{t('Engine No', 'No Enjin', '发动机号')}</span>
                <span className="font-bold font-mono text-slate-900 text-[11px]">{extendedVehicle.engineNo || '-'}</span>
              </div>
            )}
            {isContainerChassis && (
              <>
                <div className="flex justify-between py-2">
                  <span className="text-slate-500">{t('Container Length', 'Panjang Kontena', '集装箱长度')}</span>
                  <span className="font-bold text-slate-900">{extendedVehicle.containerLength || '-'}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-slate-500">{t('Axle Configuration', 'Konfigurasi Gandar', '车轴配置')}</span>
                  <span className="font-bold text-slate-900">{extendedVehicle.axleConfiguration || '-'}</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB 3: DOCUMENTS */}
        {activeTab === 'docs' && (
          <div className="space-y-2.5">
            {([
              ['insurance', t('Insurance Policy', 'Polisi Insurans', '保险单'), extendedVehicle.insuranceExpiry],
              ['road_tax', t('Road Tax (LKM)', 'Cukai Jalan', '路税'), extendedVehicle.roadTaxExpiry],
              ['puspakom', t('PUSPAKOM Inspection', 'Pemeriksaan PUSPAKOM', 'PUSPAKOM 验车'), extendedVehicle.puspakomExpiry],
            ] as const).map(([type, label, expiry]) => {
              const latest = extendedVehicle.documents?.find((doc) => doc.type === type);
              const statusClass = latest?.status === 'approved'
                ? 'bg-emerald-100 text-emerald-800'
                : latest?.status === 'pending'
                ? 'bg-amber-100 text-amber-800'
                : latest?.status === 'rejected'
                ? 'bg-red-100 text-red-800'
                : 'bg-slate-100 text-slate-600';

              return (
                <div key={type} className="rounded-2xl border border-slate-200/70 bg-white p-3.5 shadow-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-slate-900">{label}</p>
                      <p className="mt-0.5 text-[11px] font-semibold text-slate-600">
                        {expiry ? `${t('Expires', 'Tamat', '到期')}: ${new Date(`${expiry}T00:00:00`).toLocaleDateString()}` : t('Expiry Not Set', 'Tarikh Belum Ditetapkan', '未设置到期日')}
                      </p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusClass}`}>
                      {latest?.status || (expiry ? t('Active', 'Aktif', '有效') : t('Missing', 'Tiada', '缺失'))}
                    </span>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
                    {latest ? (
                      <button
                        type="button"
                        onClick={() => void showDocumentPreview(latest)}
                        className="flex items-center gap-1 font-bold text-[#2563eb] hover:underline"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>{t('View Document', 'Lihat Dokumen', '查看文件')}</span>
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-400">{t('No file uploaded', 'Tiada fail', '暂无文件')}</span>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setUploadType(type);
                        setUploadExpiry(expiry || '');
                        setUploadFile(null);
                      }}
                      className="flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 font-bold text-[#2563eb] hover:bg-blue-100"
                    >
                      <Upload className="h-3 w-3" />
                      <span>{t('Upload', 'Muat Naik', '上传更新')}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* TAB 4: HISTORY */}
        {activeTab === 'history' && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-slate-700">{t('Service Records', 'Rekod Servis', '服务记录')} ({vehicleBookings.length})</span>
              <button
                type="button"
                onClick={() => navigate(`/vehicle-history/${vehicleId}`)}
                className="text-xs font-bold text-[#2563eb] hover:underline"
              >
                {t('Full Timeline', 'Garis Masa Penuh', '完整时间轴')}
              </button>
            </div>

            {vehicleBookings.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
                {t('No past service records found for this vehicle.', 'Tiada rekod servis ditemui untuk kenderaan ini.', '暂无此车辆的历史服务记录。')}
              </div>
            ) : (
              vehicleBookings.slice(0, 5).map((booking) => (
                <div
                  key={booking.id}
                  onClick={() => navigate(`/booking/${booking.id}`)}
                  className="flex items-center justify-between rounded-xl border border-slate-200/70 bg-white p-3 shadow-2xs active:scale-[0.99] cursor-pointer hover:border-blue-200"
                >
                  <div className="min-w-0 pr-2">
                    <p className="text-xs font-bold text-slate-900 truncate">{booking.serviceType}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {booking.serviceDate ? formatDate(booking.serviceDate) : '-'} · {booking.serviceCentre || 'HQ'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                      {bookingStatusLabel(booking.status, 'service')}
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-300" />
                  </div>
                </div>
              ))
            )}

            {data.user.permissions.canViewInvoices && (
              <Button
                onClick={() => navigate(`/vehicle-invoices/${vehicleId}`)}
                variant="outline"
                className="mt-2 w-full h-10 rounded-xl text-xs font-bold"
              >
                <FileText className="w-4 h-4 mr-1.5 text-[#2563eb]" />
                {t(`View Vehicle Invoices (${invoices.length})`, `Lihat Invois Kenderaan (${invoices.length})`, `查看车辆发票 (${invoices.length})`)}
              </Button>
            )}
          </div>
        )}
      </div>

      <Dialog
        open={uploadType !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeUploadDialog();
          }
        }}
      >
        <DialogContent
          data-auto-refresh-pause="true"
          className="max-h-[90vh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl bg-white p-5"
          onEscapeKeyDown={(event) => {
            if (isUploading) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (isUploading) event.preventDefault();
          }}
        >
          <DialogHeader className="pr-8 text-left">
            <DialogTitle>{t('Upload renewed document', 'Muat naik dokumen baharu', '上传更新后的证件')}</DialogTitle>
            <DialogDescription>
              {t('PDF or image, maximum 10 MB.', 'PDF atau imej, maksimum 10 MB.', '支持 PDF 或图片，最大 10 MB。')}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-4">
            <MobileDatePicker value={uploadExpiry} onChange={setUploadExpiry} minDate={minimumUploadExpiry} ariaLabel={t('Document expiry date', 'Tarikh tamat dokumen', '证件到期日期')} title={t('Expiry date', 'Tarikh tamat', '到期日期')} />
            <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-dashed border-blue-300 bg-blue-50 px-3 py-2 text-sm text-slate-700">
              <Upload className="h-5 w-5 text-[#2563eb]" />
              <span className="min-w-0 flex-1 truncate">{uploadFile?.name || t('Choose PDF or image', 'Pilih PDF atau imej', '选择 PDF 或图片')}</span>
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  if (file && file.size > 10 * 1024 * 1024) {
                    toast.error(t('Document must be smaller than 10 MB.', 'Dokumen mestilah kurang daripada 10 MB.', '文件必须小于 10 MB。'));
                    event.target.value = '';
                    return;
                  }
                  setUploadFile(file);
                }}
              />
            </label>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" disabled={isUploading} onClick={closeUploadDialog}>{t('Cancel', 'Batal', '取消')}</Button>
              <Button type="button" className="flex-1 bg-[#2563eb]" disabled={isUploading || !uploadExpiry || uploadExpiry < minimumUploadExpiry || !uploadFile} onClick={() => void submitDocument()}>
                {isUploading ? t('Uploading...', 'Memuat naik...', '上传中…') : t('Submit', 'Hantar', '提交')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={previewDocument !== null}
        onOpenChange={(open) => {
          if (!open) closeDocumentPreview();
        }}
      >
        <DialogContent
          data-auto-refresh-pause="true"
          className="flex max-h-[92vh] w-[calc(100%-1rem)] max-w-4xl flex-col overflow-hidden rounded-2xl bg-white p-0"
        >
          <DialogHeader className="shrink-0 border-b border-slate-200 px-5 py-4 pr-12 text-left">
            <DialogTitle>{t('Document preview', 'Pratonton dokumen', '证件预览')}</DialogTitle>
            <DialogDescription className="truncate">
              {previewDocument ? `${previewDocument.originalName} · ${(previewDocument.byteSize / 1024).toFixed(0)} KB` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-64 flex-1 items-center justify-center overflow-auto bg-slate-100 p-3 sm:p-5">
            {!previewUrl ? (
              <div className="flex flex-col items-center gap-3 text-sm text-slate-500">
                <LoaderCircle className="h-7 w-7 animate-spin text-[#2563eb]" />
                <span>{t('Loading document...', 'Memuatkan dokumen...', '正在加载证件…')}</span>
              </div>
            ) : previewMimeType.startsWith('image/') || /\.(?:jpe?g|png|webp|heic|heif)$/i.test(previewDocument?.originalName || '') ? (
              <img
                src={previewUrl}
                alt={previewDocument ? t(`Preview of ${previewDocument.originalName}`, `Pratonton ${previewDocument.originalName}`, `${previewDocument.originalName} 预览`) : ''}
                className="max-h-[74vh] max-w-full rounded-lg bg-white object-contain shadow-sm"
              />
            ) : previewMimeType === 'application/pdf' || /\.pdf$/i.test(previewDocument?.originalName || '') ? (
              <iframe
                src={previewUrl}
                title={previewDocument ? `PDF preview of ${previewDocument.originalName}` : 'PDF preview'}
                className="h-[72vh] min-h-[28rem] w-full rounded-lg border border-slate-200 bg-white"
              />
            ) : (
              <div className="rounded-xl bg-white p-6 text-center shadow-sm">
                <p className="text-sm text-slate-600">{t('This file cannot be previewed on this device.', 'Fail ini tidak boleh dipratonton pada peranti ini.', '此设备无法预览该文件。')}</p>
                <a href={previewUrl} download={previewDocument?.originalName || 'document'} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white">
                  <Download className="h-4 w-4" />
                  {t('Download document', 'Muat turun dokumen', '下载证件')}
                </a>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
