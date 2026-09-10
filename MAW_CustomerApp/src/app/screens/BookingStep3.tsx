import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Calendar } from '../components/ui/calendar';
import { useLanguage } from '../context/LanguageContext';
import { useBooking } from '../context/BookingContext';
import { BookingProgress } from '../components/BookingProgress';
import { toast } from 'sonner';
import { useCustomerData } from '../context/CustomerDataContext';

export function BookingStep3() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();
  const { bookingData, updateBookingData } = useBooking();
  const { updateBooking } = useCustomerData();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(() => {
    if (bookingData.serviceDate) {
      const [y, m, d] = bookingData.serviceDate.slice(0, 10).split('-').map(Number);
      if (y && m && d) return new Date(y, m - 1, d);
    }
    return undefined;
  });
  const [selectedTime, setSelectedTime] = useState<string | null>(bookingData.serviceTime || null);

  const timeSlots = [
    '09:00 AM',
    '10:00 AM',
    '11:00 AM',
    '12:00 PM',
    '02:00 PM',
    '03:00 PM',
    '04:00 PM',
    '05:00 PM'
  ];

  const toLocalIsoDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleContinue = async () => {
    if (selectedDate && selectedTime) {
      const localDateStr = toLocalIsoDate(selectedDate);

      const nextBookingData = {
        serviceDate: localDateStr,
        serviceTime: selectedTime
      };

      updateBookingData(nextBookingData);

      // Check if coming from edit mode
      if (location.state?.fromEdit) {
        const bookingId = location.state.bookingId;
        const time24 = toTime24(selectedTime);
        await updateBooking(bookingId, {
          serviceDate: `${localDateStr}T${time24}:00+08:00`,
          timeSlot: selectedTime,
        });
        toast.success(t('Booking rescheduled', 'Tempahan dijadualkan semula', '预约已重新安排'));
        navigate(`/booking/${bookingId}`);
        return;
      }

      // Check sessionStorage for return flag
      const shouldReturnToSummary = sessionStorage.getItem('returnToSummary') === 'true';

      if (shouldReturnToSummary) {
        sessionStorage.removeItem('returnToSummary');
        navigate('/booking/step5');
      } else {
        navigate('/booking/step4');
      }
    }
  };

  const toTime24 = (value: string) => {
    const [clock, period] = value.split(' ');
    let [hours, minutes] = clock.split(':').map(Number);
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col flex-1">
      {/* Content */}
      <div className="px-5 pt-4 pb-28 space-y-4 flex-1">
        {/* Date Selection */}
        <div>
          <h2 className="text-lg font-semibold mb-3">
            {t('Choose a date', 'Pilih tarikh', '选择日期')}
          </h2>
          <div className="bg-white rounded-2xl p-4 shadow-md border border-gray-100 flex justify-center">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              disabled={(date) => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                return date < today;
              }}
              className="rounded-xl"
            />
          </div>
        </div>

        {/* Time Selection */}
        {selectedDate && (
          <div>
            <h2 className="text-lg font-semibold mb-3">
              {t('Select time slot', 'Pilih slot masa', '选择时间段')}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {timeSlots.map((time) => {
                const isSelected = selectedTime === time;
                return (
                  <button
                    key={time}
                    onClick={() => setSelectedTime(time)}
                    className={`p-3.5 rounded-xl font-medium text-sm transition-all ${
                      isSelected
                        ? 'bg-[#2563eb] text-white shadow-md'
                        : 'bg-white text-gray-700 shadow-sm border border-gray-100 hover:border-blue-200'
                    }`}
                  >
                    {time}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Floating Capsule Bottom Button - Matching Home Footer Height & Position */}
      <div className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-50 w-[calc(100%-2rem)] max-w-[416px] -translate-x-1/2">
        <Button
          onClick={handleContinue}
          disabled={!selectedDate || !selectedTime}
          className="w-full h-[3.5rem] rounded-[1.25rem] bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-base font-semibold shadow-[0_10px_28px_rgba(37,99,235,0.32)] disabled:bg-gray-300 disabled:shadow-none disabled:cursor-not-allowed transition-all flex items-center justify-center"
        >
          {location.state?.fromEdit
            ? t('Save Changes', 'Simpan Perubahan', '保存更改')
            : t('Continue', 'Teruskan', '继续')
          }
          {!location.state?.fromEdit && <ChevronRight className="w-5 h-5 ml-2" />}
        </Button>
      </div>
    </div>
  );
}
