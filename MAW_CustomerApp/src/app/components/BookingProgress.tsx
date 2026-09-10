import React from 'react';
import { useLanguage } from '../context/LanguageContext';

interface BookingProgressProps {
  currentStep: number;
}

const TOTAL_STEPS = 6;

export function BookingProgress({ currentStep }: BookingProgressProps) {
  const { t } = useLanguage();

  return (
    <div
      className="border-b bg-white px-6 py-3 select-none transition-all duration-300"
      data-booking-progress
      data-current-step={currentStep}
      aria-label={t(
        `Booking progress: step ${currentStep} of ${TOTAL_STEPS}`,
        `Kemajuan tempahan: langkah ${currentStep} daripada ${TOTAL_STEPS}`,
        `预约进度：第 ${currentStep} 步，共 ${TOTAL_STEPS} 步`,
      )}
    >
      <div className="flex items-center justify-center">
        {Array.from({ length: TOTAL_STEPS }, (_, index) => {
          const step = index + 1;
          const isCompleted = step < currentStep;
          const isCurrent = step === currentStep;
          const isActive = step <= currentStep;

          return (
            <React.Fragment key={step}>
              <div className="relative flex items-center justify-center">
                {/* Radar pulse wave effect for active current step */}
                {isCurrent && (
                  <>
                    <span className="absolute -inset-1.5 rounded-full bg-blue-500/30 animate-ping pointer-events-none duration-1000" />
                    <span className="absolute -inset-0.5 rounded-full ring-2 ring-blue-400/70 animate-pulse pointer-events-none" />
                  </>
                )}
                <div
                  className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-all duration-300 ${
                    isActive
                      ? 'bg-[#2563eb] text-white shadow-[0_2px_8px_rgba(37,99,235,0.3)]'
                      : 'bg-gray-200 text-gray-400'
                  } ${isCurrent ? 'ring-2 ring-white ring-offset-2 ring-offset-blue-500 scale-105' : ''}`}
                  data-progress-step={step}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  {step}
                </div>
              </div>
              {step < TOTAL_STEPS && (
                <div
                  className={`mx-0.5 h-0.5 min-w-0 flex-1 transition-colors duration-300 ${
                    isCompleted ? 'bg-[#2563eb]' : 'bg-gray-200'
                  }`}
                  aria-hidden="true"
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
      <p className="mt-1.5 text-center text-xs text-gray-500 transition-opacity duration-200">
        {t(
          `Step ${currentStep} of ${TOTAL_STEPS}`,
          `Langkah ${currentStep} daripada ${TOTAL_STEPS}`,
          `第 ${currentStep} 步，共 ${TOTAL_STEPS} 步`,
        )}
      </p>
    </div>
  );
}
