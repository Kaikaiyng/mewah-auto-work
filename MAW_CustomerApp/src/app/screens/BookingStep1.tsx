import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { ArrowLeft, Wrench, Settings, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useLanguage } from '../context/LanguageContext';
import { useBooking } from '../context/BookingContext';
import { BookingProgress } from '../components/BookingProgress';

export function BookingStep1() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();
  const { bookingData, updateBookingData } = useBooking();
  const [selectedService, setSelectedService] = useState<string | null>(bookingData.serviceType || null);

  const serviceTypes = [
    {
      id: 'maintenance',
      icon: Wrench,
      title: t('Maintenance', 'Penyelenggaraan', '保养'),
      description: t('Regular service and checkups', 'Servis dan pemeriksaan berkala', '定期保养与检查'),
      color: 'bg-blue-500'
    },
    {
      id: 'repair',
      icon: Settings,
      title: t('Repair', 'Pembaikan', '维修'),
      description: t('Fix issues and component repairs', 'Pembaikan kerosakan dan komponen', '故障检修与零部件维修'),
      color: 'bg-orange-500'
    }
  ];

  const handleContinue = () => {
    if (selectedService) {
      updateBookingData({ serviceType: selectedService });

      // If coming from summary, go back to summary
      if (location.state?.returnToSummary) {
        navigate('/booking/step5');
      } else {
        navigate('/booking/step2', { state: location.state });
      }
    }
  };

  return (
    <div className="flex flex-col flex-1">
      {/* Content */}
      <div className="px-5 pt-4 pb-28 space-y-4 flex-1">
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-2">
            {t('What service do you need?', 'Apakah servis yang anda perlukan?', '您需要什么服务？')}
          </h2>
          <p className="text-gray-600 text-sm">
            {t('Select the type of service you want to book', 'Pilih jenis servis yang ingin ditempah', '选择您要预订的服务类型')}
          </p>
        </div>

        {serviceTypes.map((service) => {
          const Icon = service.icon;
          const isSelected = selectedService === service.id;
          return (
            <button
              key={service.id}
              onClick={() => setSelectedService(service.id)}
              className="w-full text-left"
            >
              <Card
                className={`rounded-2xl transition-all border-2 ${
                  isSelected
                    ? 'border-[#2563eb] shadow-lg'
                    : 'border-transparent shadow-md hover:shadow-lg'
                }`}
              >
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 ${service.color} rounded-xl flex items-center justify-center`}>
                      <Icon className="w-7 h-7 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">{service.title}</h3>
                      <p className="text-gray-600 text-sm mt-1">
                        {service.description}
                      </p>
                    </div>
                    <div
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'border-[#2563eb] bg-[#2563eb]'
                          : 'border-gray-300'
                      }`}
                    >
                      {isSelected && (
                        <div className="w-3 h-3 bg-white rounded-full" />
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>

      {/* Floating Capsule Bottom Button - Matching Home Footer Height & Position */}
      <div className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-50 w-[calc(100%-2rem)] max-w-[416px] -translate-x-1/2">
        <Button
          onClick={handleContinue}
          disabled={!selectedService}
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
