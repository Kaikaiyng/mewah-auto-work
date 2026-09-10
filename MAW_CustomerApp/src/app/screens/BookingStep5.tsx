import React from 'react';
import { useNavigate, useLocation } from 'react-router';
import { ArrowLeft, Car, Calendar, MapPin, FileText, ChevronRight } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { useLanguage } from '../context/LanguageContext';
import { useBooking } from '../context/BookingContext';
import { BookingProgress } from '../components/BookingProgress';
import { useCustomerData } from '../context/CustomerDataContext';
import { DataState } from '../components/DataState';
import { toast } from 'sonner';
import logo from 'figma:asset/9579c9865ae700123383ca50bc26e6829232a00d.png';

// Booking confirmation screen - Step 5
export function BookingStep5() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { bookingData, clearBookingData } = useBooking();
  const { data, isLoading, error, reload, createBooking } = useCustomerData();
  const [submitting, setSubmitting] = React.useState(false);
  
  const selectedVehicle = data?.user.vehicles.find(v => v.id === bookingData.vehicleId);

  const handleConfirm = async () => {
    if (!bookingData.vehicleId || !bookingData.serviceType || !bookingData.serviceDate || !bookingData.serviceCentre) {
      toast.error(t('Please complete all required booking details', 'Sila lengkapkan semua maklumat tempahan', '请完成所有必填预约信息'));
      return;
    }
    if ((selectedVehicle?.verificationStatus || 'approved') !== 'approved') {
      toast.error(t(
        'This vehicle must be approved before booking.',
        'Kenderaan ini mesti diluluskan sebelum tempahan.',
        '此车辆必须审核通过后才能预约。',
      ));
      return;
    }
    setSubmitting(true);
    try {
      await createBooking({
        vehicleId: bookingData.vehicleId,
        serviceType: getServiceTypeLabel(bookingData.serviceType),
        serviceDate: `${bookingData.serviceDate}T${toTime24(bookingData.serviceTime || '09:00 AM')}:00+08:00`,
        serviceCentre: bookingData.serviceCentre,
        timeSlot: bookingData.serviceTime,
        notes: bookingData.notes,
        reportedProblem: bookingData.reportedProblem,
        mileage: bookingData.mileage,
        contactId: bookingData.contactId,
        contactName: bookingData.contactName,
        reminderId: bookingData.reminderId,
      });
      toast.success(t('Booking submitted', 'Tempahan dihantar', '预约已提交'), {
        description: t('The workshop will confirm your appointment', 'Bengkel akan mengesahkan janji temu anda', '维修中心将确认您的预约')
      });
      clearBookingData();
      navigate('/bookings');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : t('Unable to submit booking', 'Tempahan tidak dapat dihantar', '无法提交预约'));
    } finally {
      setSubmitting(false);
    }
  };

  const toTime24 = (value: string) => {
    if (!value.includes(' ')) return value;
    const [clock, period] = value.split(' ');
    let [hours, minutes] = clock.split(':').map(Number);
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  };

  const getServiceTypeLabel = (type: string) => {
    const labels: Record<string, { en: string; bm: string; zh: string }> = {
      maintenance: { en: 'Maintenance', bm: 'Penyelenggaraan', zh: '保养' },
      repair: { en: 'Repair', bm: 'Pembaikan', zh: '维修' },
      parts: { en: 'Spare Parts Purchase', bm: 'Pembelian Alat Ganti', zh: '配件购买' }
    };
    const item = labels[type];
    if (item) {
      return t(item.en, item.bm, item.zh);
    }
    return type;
  };

  if (!data) {
    return <DataState isLoading={isLoading} error={error} onRetry={() => void reload()} />;
  }

  return (
    <div className="flex flex-col flex-1">
      {/* Content */}
      <div className="px-5 pt-4 pb-28 space-y-4 flex-1">
        {/* Company Logo */}
        <div className="flex justify-center mb-4">
          <img src={logo} alt="Mewah AutoWorks" className="h-12 w-auto" />
        </div>

        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-2">
            {t('Booking Summary', '预订摘要')}
          </h2>
          <p className="text-gray-600 text-sm">
            {t('Please review your booking details', '请查看您的预订详情')}
          </p>
        </div>

        {/* Vehicle Info */}
        <Card 
          className="rounded-2xl shadow-md border-0 cursor-pointer hover:shadow-lg transition-shadow active:scale-[0.98]"
          onClick={() => {
            sessionStorage.setItem('returnToSummary', 'true');
            navigate('/booking/select-vehicle', { state: { returnToSummary: true } });
          }}
        >
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#2563eb]/10 flex items-center justify-center">
                  <Car className="w-5 h-5 text-[#2563eb]" />
                </div>
                <h3 className="font-semibold">{t('Vehicle', '车辆')}</h3>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </div>
            <div className="space-y-2">
              <p className="text-gray-800">{selectedVehicle?.equipment}</p>
              <p className="text-gray-600 text-sm font-semibold">{selectedVehicle?.regNo}</p>
              {bookingData.mileage ? (
                <p className="text-blue-700 font-mono text-xs font-semibold bg-blue-50 px-2.5 py-1 rounded-lg inline-block">
                  {t('Odometer reading', 'Bacaan odometer', '当前报备里程')}: {bookingData.mileage.toLocaleString()} km
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {/* Service Type - Clickable */}
        <Card 
          className="rounded-2xl shadow-md border-0 cursor-pointer hover:shadow-lg transition-shadow active:scale-[0.98]"
          onClick={() => navigate('/booking/step1', { replace: false, state: { returnToSummary: true } })}
        >
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-blue-500" />
                </div>
                <h3 className="font-semibold">{t('Service Type', '服务类型')}</h3>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </div>
            <p className="text-gray-800">
              {bookingData.serviceType 
                ? getServiceTypeLabel(bookingData.serviceType)
                : t('Not selected', '未选择')
              }
            </p>
          </CardContent>
        </Card>

        {/* Date & Time - Clickable */}
        <Card 
          className="rounded-2xl shadow-md border-0 cursor-pointer hover:shadow-lg transition-shadow active:scale-[0.98]"
          onClick={() => {
            sessionStorage.setItem('returnToSummary', 'true');
            navigate('/booking/step3');
          }}
        >
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-orange-500" />
                </div>
                <h3 className="font-semibold">{t('Date & Time', '日期和时间')}</h3>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </div>
            {bookingData.serviceDate ? (
              <div className="space-y-1">
                <p className="text-gray-800 font-medium">
                  {(() => {
                    const [y, m, d] = bookingData.serviceDate.slice(0, 10).split('-').map(Number);
                    const dt = y && m && d ? new Date(y, m - 1, d) : new Date(bookingData.serviceDate);
                    return dt.toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    });
                  })()}
                </p>
                {bookingData.serviceTime && (
                  <p className="text-gray-600">{bookingData.serviceTime}</p>
                )}
              </div>
            ) : (
              <p className="text-orange-600">{t('Not selected', '未选择')}</p>
            )}
          </CardContent>
        </Card>

        {/* Location */}
        <Card className="rounded-2xl shadow-md border-0">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <MapPin className="w-5 h-5 text-green-500" />
              </div>
              <h3 className="font-semibold">{t('Service Centre', '服务中心')}</h3>
            </div>
            <p className="text-gray-800">
              {bookingData.serviceCentre || t('Not selected', '未选择')}
            </p>
          </CardContent>
        </Card>

        {/* Notes - Clickable */}
        <Card 
          className="rounded-2xl shadow-md border-0 cursor-pointer hover:shadow-lg transition-shadow active:scale-[0.98]"
          onClick={() => navigate('/booking/step4', { state: { fromSummary: true } })}
        >
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">{t('Additional Notes', '备注信息')}</h3>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </div>
            <p className="text-gray-700">
              {bookingData.notes || t('Tap to add notes', '点击添加备注')}
            </p>
            {bookingData.reportedProblem && <p className="text-sm text-gray-500 mt-2">{bookingData.reportedProblem}</p>}
            {bookingData.contactName && <p className="text-sm text-gray-500 mt-1">{t('Contact', 'Hubungan', '联系人')}: {bookingData.contactName}</p>}
          </CardContent>
        </Card>

        {/* Important Notice */}
        <Card className="rounded-2xl shadow-md border-0 bg-blue-50">
          <CardContent className="p-6">
            <h3 className="font-semibold mb-3 text-[#2563eb]">
              {t('Important Notice', '重要提示')}
            </h3>
            <ul className="space-y-2 text-sm text-gray-700">
              <li>• {t('Please arrive 10 minutes before your scheduled time', '请在预定时间前10分钟到达')}</li>
              <li>• {t('Bring your vehicle registration card', '请携带您的车辆登记证')}</li>
              <li>• {t('Final price will be confirmed after inspection', '最终价格将在检查后确认')}</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Floating Capsule Bottom Button - Matching Home Footer Height & Position */}
      <div className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-50 w-[calc(100%-2rem)] max-w-[416px] -translate-x-1/2">
        <Button
          onClick={handleConfirm}
          disabled={submitting}
          className="w-full h-[3.5rem] rounded-[1.25rem] bg-green-600 hover:bg-green-700 text-white text-base font-semibold shadow-[0_10px_28px_rgba(22,163,74,0.32)] disabled:bg-gray-300 disabled:shadow-none disabled:cursor-not-allowed transition-all flex items-center justify-center"
        >
          {submitting ? t('Submitting...', 'Menghantar...', '正在提交...') : t('Submit Booking', 'Hantar Tempahan', '提交预约')}
          <ChevronRight className="w-5 h-5 ml-2" />
        </Button>
      </div>
    </div>
  );
}
