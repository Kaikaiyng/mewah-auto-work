import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { ArrowLeft, MapPin, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useLanguage } from '../context/LanguageContext';
import { useBooking } from '../context/BookingContext';
import { BookingProgress } from '../components/BookingProgress';
import { useCustomerData } from '../context/CustomerDataContext';
import { DataState } from '../components/DataState';

export function BookingStep2() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();
  const { bookingData, updateBookingData } = useBooking();
  const { data, isLoading, error, reload } = useCustomerData();
  const [selectedCentre, setSelectedCentre] = useState<string | null>(bookingData.serviceCentre || null);

  const handleContinue = () => {
    if (selectedCentre) {
      updateBookingData({ serviceCentre: selectedCentre });
      navigate('/booking/step3', { 
        state: { 
          ...location.state, 
          serviceCentre: selectedCentre 
        } 
      });
    }
  };

  if (!data) return <DataState isLoading={isLoading} error={error} onRetry={() => void reload()} />;

  return (
    <div className="flex flex-col flex-1">
      {/* Content */}
      <div className="px-5 pt-4 pb-28 space-y-4 flex-1">
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-2">
            {t('Service Centre Location', 'Lokasi Pusat Servis', '服务中心位置')}
          </h2>
          <p className="text-gray-600 text-sm">
            {t('We will service your vehicle at our location', 'Kami akan menservis kenderaan anda di lokasi kami', '我们将在我们的地点为您的车辆提供服务')}
          </p>
        </div>

        {data.serviceCentres.map((centre) => {
          const isSelected = selectedCentre === centre.name;
          return (
            <button
              key={centre.id}
              onClick={() => setSelectedCentre(centre.name)}
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
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 ${isSelected ? 'bg-[#2563eb]' : 'bg-gray-100'} rounded-xl flex items-center justify-center flex-shrink-0`}>
                      <MapPin className={`w-6 h-6 ${isSelected ? 'text-white' : 'text-gray-600'}`} />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-800">{centre.name}</h3>
                      <p className="text-gray-600 text-sm mt-2">
                        {centre.address}
                      </p>
                      <p className="text-[#2563eb] text-sm font-medium mt-2">
                        {t('Tel:', 'Tel:', '电话:')} {centre.phone}
                      </p>
                    </div>
                    <div
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors flex-shrink-0 ${isSelected ? 'border-[#2563eb] bg-[#2563eb]' : 'border-gray-300'}`}
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
          disabled={!selectedCentre}
          className="w-full h-[3.5rem] rounded-[1.25rem] bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-base font-semibold shadow-[0_10px_28px_rgba(37,99,235,0.32)] disabled:bg-gray-300 disabled:shadow-none disabled:cursor-not-allowed transition-all flex items-center justify-center"
        >
          {t('Continue', 'Teruskan', '继续')}
          <ChevronRight className="w-5 h-5 ml-2" />
        </Button>
      </div>
    </div>
  );
}
