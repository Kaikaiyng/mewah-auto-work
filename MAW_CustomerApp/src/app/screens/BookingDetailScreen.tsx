import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Calendar, MapPin, FileText, Download, Car, Clock, Edit2, Wrench } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Separator } from '../components/ui/separator';
import { useLanguage } from '../context/LanguageContext';
import { useCustomerData } from '../context/CustomerDataContext';
import { DataState } from '../components/DataState';
import { bookingStatusLabel, serviceStatusColorClass, workOrderLabels } from '../lib/status';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../components/ui/dialog';
import { toast } from 'sonner';
import { useBooking } from '../context/BookingContext';
import { useConfirmationDialog } from '../context/ConfirmationDialogContext';

export function BookingDetailScreen() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { t } = useLanguage();
  const [showEditDialog, setShowEditDialog] = useState(false);
  const { data, isLoading, error, reload, cancelBooking, confirmBooking, convertBooking } = useCustomerData();
  const { updateBookingData } = useBooking();
  const confirmAction = useConfirmationDialog();

  const booking = data?.bookings.find((b) => b.id === id);
  const vehicle = data?.user.vehicles.find((item) => item.id === booking?.vehicleId);

  if (!data) {
    return <DataState isLoading={isLoading} error={error} onRetry={() => void reload()} />;
  }

  if (!booking || !vehicle) {
    return (
      <div className="min-h-screen bg-[#eef3fb] flex flex-col items-center justify-center">
        <p className="text-gray-500">{t('Booking not found', '未找到预订')}</p>
    </div>
  );
  }

  const handleEditBooking = () => {
    setShowEditDialog(true);
  };

  const handleEditDateTime = () => {
    setShowEditDialog(false);
    updateBookingData({
      vehicleId: booking.vehicleId,
      serviceType: booking.serviceType,
      serviceCentre: booking.serviceCentre,
      serviceDate: booking.serviceDate?.slice(0, 10),
      serviceTime: booking.timeSlot,
      editingBookingId: booking.id,
    });
    navigate('/booking/step3', {
      state: {
        fromEdit: true,
        bookingId: booking.id,
        vehicleId: vehicle.id,
        serviceType: booking.serviceType,
        serviceCentre: booking.serviceCentre,
      },
    });
  };

  const handleEditService = () => {
    setShowEditDialog(false);
    updateBookingData({
      vehicleId: booking.vehicleId,
      serviceType: booking.serviceType,
      serviceCentre: booking.serviceCentre,
      editingBookingId: booking.id,
    });
    navigate('/booking/step1', {
      state: {
        fromEdit: true,
        bookingId: booking.id,
        vehicleId: vehicle.id,
        serviceCentre: booking.serviceCentre,
      },
    });
  };

  const canEdit = (booking.status === 'pending' || booking.status === 'confirmed') && data.user.permissions.canRescheduleBooking;
  const displayStatus = booking.workOrderStatus || booking.status;

  const getStatusLabel = (status: string) => {
    if (booking.workOrderStatus) return workOrderLabels[booking.workOrderStatus];
    return bookingStatusLabel(status, 'service');
  };

  return (
    <div className="min-h-screen bg-[#eef3fb] pb-24">
      {/* Header */}
      <div className="maw-page-header sticky top-0 z-40 relative flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-gray-700 ring-1 ring-blue-100 shadow-sm hover:bg-blue-50 transition-colors"
          aria-label={t('Back', 'Kembali', '返回')}
        >
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <div className="text-center absolute left-1/2 -translate-x-1/2 pointer-events-none truncate max-w-[180px]">
          <h1 className="text-base font-bold truncate">
            {t('Booking Details', 'Butiran Tempahan', '预订详情')}
          </h1>
          <p className="text-[10px] text-gray-500 font-medium truncate">
            {booking.bookingNumber}
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${serviceStatusColorClass(displayStatus)}`}
        >
          {getStatusLabel(displayStatus)}
        </span>
      </div>

      <div className="px-5 pt-4 pb-28 space-y-4">
        {canEdit && (
          <Button
            onClick={handleEditBooking}
            variant="outline"
            className="w-full h-11 rounded-xl border-[#2563eb] text-[#2563eb] hover:bg-blue-50"
          >
            <Edit2 className="w-4 h-4 mr-2" />
            {t('Edit Booking', 'Edit Tempahan', '编辑预订')}
          </Button>
        )}
        {booking.workOrderId && (
          <Button
            onClick={() => navigate(`/repair-progress/${booking.workOrderId}`)}
            className="h-12 w-full rounded-xl bg-[#2563eb] shadow-[0_8px_20px_rgba(37,99,235,0.20)]"
          >
            <Wrench className="h-4 w-4" />
            {t('View Repair Progress', 'Lihat Kemajuan Pembaikan', '查看维修进度')}
          </Button>
        )}

        {/* Date & Time */}
        <Card className="rounded-2xl shadow-sm border border-white/80 bg-white">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#2563eb] flex items-center justify-center">
                <Calendar className="w-5 h-5 text-white" />
              </div>
              <h3 className="font-bold text-gray-800">
                {t('Date & Time', 'Tarikh & Masa', '日期和时间')}
              </h3>
            </div>

            <div className="bg-white rounded-xl p-4 space-y-3">
              <div><p className="text-xs text-gray-500 mb-1">{t('Company', 'Syarikat', '公司')}</p><p className="text-gray-900 font-semibold">{data.user.companyName}</p></div>
              {booking.contactName && <div className="pt-2 border-t border-gray-100"><p className="text-xs text-gray-500 mb-1">{t('Booking Contact', 'Hubungan Tempahan', '预约联系人')}</p><p className="text-gray-900 font-semibold">{booking.contactName}</p></div>}
              <div>
                <p className="text-xs text-gray-500 mb-1">
                  {t('Service Date', 'Tarikh Servis', '服务日期')}
                </p>
                <p className="text-gray-900 font-semibold text-base">
                  {new Date(booking.serviceDate).toLocaleDateString('en-GB', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                  })}
                </p>
              </div>

              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-1">
                  {t('Time Slot', 'Masa', '时间段')}
                </p>
                <p className="text-gray-900 font-semibold">
                  {booking.timeSlot || new Date(booking.serviceDate).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                  })}
                </p>
              </div>

              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-1">
                  {t('Service Centre', 'Pusat Servis', '服务中心')}
                </p>
                <p className="text-gray-900 font-semibold leading-snug">
                  {booking.serviceCentre}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Vehicle Information */}
        <Card className="rounded-2xl shadow-sm border border-white/80 bg-white">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#2563eb] flex items-center justify-center">
                <Car className="w-5 h-5 text-white" />
              </div>
              <h3 className="font-bold text-gray-800">
                {t('Vehicle Information', 'Maklumat Kenderaan', '车辆信息')}
              </h3>
            </div>
            <div className="bg-white rounded-xl p-4 space-y-2">
              <div>
                <p className="text-xs text-gray-500 mb-1">
                  {t('Equipment', 'Peralatan', '设备')}
                </p>
                <p className="text-gray-900 font-semibold text-base">
                  {vehicle.vecNo} - {vehicle.equipment}
                </p>
              </div>
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-1">
                  {t('Registration No.', 'No. Pendaftaran', '注册号码')}
                </p>
                <p className="text-gray-700 font-medium">{vehicle.regNo}</p>
              </div>
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-1">
                  {t('Mileage', 'Perbatuan', '里程')}
                </p>
                <p className="text-gray-700 font-medium">
                  {(booking.mileage || vehicle.mileage).toLocaleString()} km
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Service Details */}
        <Card className="rounded-2xl shadow-sm border border-white/80 bg-white">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <h3 className="font-bold text-gray-800">
                {t('Service Details', 'Butiran Servis', '服务详情')}
              </h3>
            </div>
            <div className="bg-white rounded-xl p-4 space-y-3">
              <div>
                <p className="text-xs text-gray-500 mb-1">
                  {t('Service Type', 'Jenis Servis', '服务类型')}
                </p>
                <p className="text-gray-900 font-semibold">{booking.serviceType}</p>
              </div>
              {booking.notes && (
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-500 mb-1">
                    {t('Customer Notes', 'Nota Pelanggan', '客户备注')}
                  </p>
                  <p className="text-gray-700 leading-relaxed">{booking.notes}</p>
                </div>
              )}
              {booking.reportedProblem && (
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-500 mb-1">{t('Reported Problem', 'Masalah Dilaporkan', '报告的问题')}</p>
                  <p className="text-gray-700 leading-relaxed">{booking.reportedProblem}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Invoice */}
        {booking.status === 'completed' && booking.invoice && (
          <Card className="rounded-2xl shadow-md border-0">
            <CardContent className="p-6">
              <h3 className="font-semibold mb-4">{t('Invoice', '发票')}</h3>
              
              <div className="space-y-3">
                {booking.invoice.items.map((item) => (
                  <div key={item.id} className="flex justify-between">
                    <div className="flex-1">
                      <p className="text-gray-800">{item.name}</p>
                      <p className="text-sm text-gray-500">
                        {item.quantity} x RM {item.unitPrice}
                      </p>
                    </div>
                    <p className="font-medium">RM {item.total}</p>
                  </div>
                ))}
              </div>

              <Separator className="my-4" />

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">{t('Subtotal', '小计')}</span>
                  <span className="text-gray-800">RM {booking.invoice.subtotal}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">{t('Tax (SST)', '税费')}</span>
                  <span className="text-gray-800">RM {booking.invoice.tax}</span>
                </div>
                <Separator className="my-2" />
                <div className="flex justify-between">
                  <span className="font-semibold text-lg">{t('Total', '总计')}</span>
                  <span className="font-semibold text-lg text-[#2563eb]">
                    RM {booking.invoice.total}
                  </span>
                </div>
              </div>

            </CardContent>
          </Card>
        )}

        {canEdit && data.user.permissions.canCancelBooking && (
          <Button
            variant="outline"
            onClick={async () => {
              const confirmed = await confirmAction({
                title: t('Cancel booking?', 'Batalkan tempahan?', '取消预约？'),
                description: t(
                  'This booking will be cancelled and cannot be restored.',
                  'Tempahan ini akan dibatalkan dan tidak boleh dipulihkan.',
                  '此预约将被取消，并且无法恢复。',
                ),
                confirmLabel: t('Cancel booking', 'Batalkan tempahan', '确认取消'),
                cancelLabel: t('Keep booking', 'Kekalkan tempahan', '保留预约'),
              });
              if (!confirmed) return;
              await cancelBooking(booking.id);
              toast.success(t('Booking cancelled', 'Tempahan dibatalkan', '预约已取消'));
            }}
            className="w-full h-12 rounded-xl border-red-200 text-red-700"
          >
            {t('Cancel Booking', 'Batalkan Tempahan', '取消预约')}
          </Button>
        )}
        {import.meta.env.DEV && booking.status === 'pending' && (
          <Button variant="outline" className="w-full rounded-xl" onClick={() => void confirmBooking(booking.id)}>
            {t('Local preview: confirm booking', 'Pratonton tempatan: sahkan tempahan', '本地预览：确认预约')}
          </Button>
        )}
        {import.meta.env.DEV && booking.status === 'confirmed' && (
          <Button variant="outline" className="w-full rounded-xl" onClick={() => void convertBooking(booking.id)}>
            {t('Local preview: check in vehicle', 'Pratonton tempatan: daftar masuk kenderaan', '本地预览：车辆登记')}
          </Button>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader className="flex-row items-start gap-3.5 border-b border-slate-200 bg-white px-5 py-5 text-left">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#2563eb] ring-1 ring-blue-100"><Edit2 className="h-5 w-5" /></div>
            <div className="pr-8">
              <DialogTitle className="text-xl font-bold tracking-tight text-slate-900">
                {t('Edit Booking', 'Edit Tempahan', '编辑预订')}
              </DialogTitle>
            <DialogDescription className="mt-1 text-sm leading-5 text-slate-500">
              {t('What would you like to change?', 'Apa yang anda ingin ubah?', '您想更改什么？')}
            </DialogDescription>
            </div>
          </DialogHeader>

          <div className="space-y-3 bg-slate-50/80 p-4">
            <Button
              onClick={handleEditDateTime}
              variant="outline"
              className="h-auto min-h-16 w-full justify-start rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm hover:border-[#2563eb] hover:bg-blue-50"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-[#2563eb]" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">
                    {t('Change Date & Time', 'Tukar Tarikh & Masa', '更改日期和时间')}
                  </p>
                  <p className="text-xs text-gray-500">
                    {t('Reschedule your appointment', 'Jadual semula temujanji', '重新安排您的预约')}
                  </p>
                </div>
              </div>
            </Button>

            <Button
              onClick={handleEditService}
              variant="outline"
              className="h-auto min-h-16 w-full justify-start rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm hover:border-[#2563eb] hover:bg-blue-50"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">
                    {t('Change Service Type', 'Tukar Jenis Servis', '更改服务类型')}
                  </p>
                  <p className="text-xs text-gray-500">
                    {t('Select a different service', 'Pilih servis berbeza', '选择不同的服务')}
                  </p>
                </div>
              </div>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
