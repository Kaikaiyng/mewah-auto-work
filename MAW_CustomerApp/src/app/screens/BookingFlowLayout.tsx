import React, { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useBooking } from '../context/BookingContext';
import { BookingProgress } from '../components/BookingProgress';

export function BookingFlowLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { bookingData, updateBookingData } = useBooking();

  // Track and remember return destination (e.g. /home or /vehicles)
  useEffect(() => {
    if (location.state?.from && location.state.from !== bookingData.returnTo) {
      updateBookingData({ returnTo: location.state.from });
    }
  }, [location.state?.from]);

  const getStepInfo = () => {
    const path = location.pathname;
    if (path.includes('select-vehicle')) {
      return {
        step: 1,
        title: location.state?.fromEdit 
          ? t('Edit Booking', 'Edit Tempahan', '编辑预约') 
          : t('Select Vehicle', 'Pilih Kenderaan', '选择车辆'),
      };
    }
    if (path.includes('step1')) {
      return {
        step: 2,
        title: location.state?.fromEdit 
          ? t('Edit Service', 'Edit Servis', '编辑服务') 
          : t('Select Service Type', 'Pilih Jenis Servis', '选择服务类型'),
      };
    }
    if (path.includes('step2')) {
      return {
        step: 3,
        title: t('Select Location', 'Pilih Lokasi', '选择地点'),
      };
    }
    if (path.includes('step3')) {
      return {
        step: 4,
        title: t('Select Date & Time', 'Pilih Tarikh & Masa', '选择日期与时间'),
      };
    }
    if (path.includes('step4')) {
      return {
        step: 5,
        title: t('Contact & Details', 'Maklumat Hubungan', '联系人与详情'),
      };
    }
    if (path.includes('step5')) {
      return {
        step: 6,
        title: t('Booking Summary', 'Ringkasan Tempahan', '预约确认'),
      };
    }
    return {
      step: 1,
      title: t('Book Service', 'Tempah Servis', '预订服务'),
    };
  };

  const { step, title } = getStepInfo();

  const [contentSwipeOffset, setContentSwipeOffset] = React.useState(0);
  const [isContentSwiping, setIsContentSwiping] = React.useState(false);
  const contentTouchStartXRef = React.useRef<number | null>(null);
  const contentTouchStartYRef = React.useRef<number | null>(null);
  const contentStartTimeRef = React.useRef<number>(0);
  const contentGestureLockRef = React.useRef<'horizontal' | 'vertical' | 'locked' | null>(null);

  useEffect(() => {
    setContentSwipeOffset(0);
    setIsContentSwiping(false);
  }, [location.pathname]);

  const handleBack = () => {
    const originTarget = bookingData.returnTo || location.state?.from || '/home';
    if (step === 1) {
      navigate(originTarget, { replace: true });
    } else if (step === 2 && bookingData.returnTo && bookingData.returnTo !== '/home' && !location.pathname.includes('select-vehicle')) {
      navigate(originTarget, { replace: true });
    } else {
      navigate(-1);
    }
  };

  const handleContentTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    // Only handle steps > 1 for in-place step back
    if (step <= 1) return;
    const touch = e.touches[0];
    if (!touch) return;

    const target = touch.target as HTMLElement | null;
    const isInteractive = Boolean(
      target?.closest('input, textarea, select, [data-prevent-swipe="true"], [data-horizontal-scroll="true"], [role="dialog"], .overflow-x-auto, .overflow-x-scroll')
    );
    if (isInteractive) {
      contentGestureLockRef.current = 'locked';
      return;
    }

    contentTouchStartXRef.current = touch.clientX;
    contentTouchStartYRef.current = touch.clientY;
    contentStartTimeRef.current = Date.now();
    contentGestureLockRef.current = null;
    setIsContentSwiping(false);
    setContentSwipeOffset(0);
  };

  const handleContentTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (step <= 1 || contentGestureLockRef.current === 'locked') return;
    if (contentTouchStartXRef.current == null || contentTouchStartYRef.current == null) return;
    const touch = e.touches[0];
    if (!touch) return;

    const deltaX = touch.clientX - contentTouchStartXRef.current;
    const deltaY = touch.clientY - contentTouchStartYRef.current;

    if (contentGestureLockRef.current == null) {
      if (deltaX > 6 && deltaX > Math.abs(deltaY) * 1.05) {
        contentGestureLockRef.current = 'horizontal';
      } else if (Math.abs(deltaY) > 6 || deltaX < -6) {
        contentGestureLockRef.current = 'vertical';
      }
    }

    if (contentGestureLockRef.current === 'horizontal' && deltaX > 0) {
      setIsContentSwiping(true);
      setContentSwipeOffset(deltaX);
    }
  };

  const handleContentTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (step <= 1) return;
    const startX = contentTouchStartXRef.current;
    const touch = e.changedTouches[0];
    const lock = contentGestureLockRef.current;

    contentTouchStartXRef.current = null;
    contentTouchStartYRef.current = null;
    contentGestureLockRef.current = null;
    setIsContentSwiping(false);

    if (lock === 'locked') {
      setContentSwipeOffset(0);
      return;
    }

    if (lock === 'horizontal' && startX != null && touch) {
      const deltaX = touch.clientX - startX;
      const deltaTime = Date.now() - contentStartTimeRef.current;
      const isFlick = deltaTime < 250 && deltaX > 35;
      const screenWidth = typeof window !== 'undefined' ? Math.min(window.innerWidth, 416) : 390;
      const passedThreshold = deltaX > screenWidth * 0.3 || isFlick;

      if (passedThreshold) {
        handleBack();
        return;
      }
    }

    setContentSwipeOffset(0);
  };

  return (
    <div className="min-h-screen bg-[#eef3fb] max-w-md mx-auto flex flex-col">
      {/* Permanent Static Header - Never Unmounts or Jumps */}
      <div className="maw-page-header sticky top-0 z-40 relative flex items-center justify-between bg-white border-b border-gray-100 shadow-sm transition-colors">
        <button
          onClick={handleBack}
          className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-gray-700 ring-1 ring-blue-100 shadow-sm hover:bg-blue-50 transition-colors"
          aria-label={t('Back', 'Kembali', '返回')}
        >
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <h1 className="text-base font-bold text-center absolute left-1/2 -translate-x-1/2 pointer-events-none truncate max-w-[220px] transition-all duration-200">
          {title}
        </h1>
        <div className="w-10" />
      </div>

      {/* Permanent Progress Bar - Animated Smooth Transitions In Place */}
      {!location.state?.fromEdit && (
        <BookingProgress currentStep={step} />
      )}

      {/* Step Content Area - Slides in-place without moving Header or Progress Bar */}
      <div
        key={location.pathname}
        onTouchStart={handleContentTouchStart}
        onTouchMove={handleContentTouchMove}
        onTouchEnd={handleContentTouchEnd}
        onTouchCancel={handleContentTouchEnd}
        className="flex-1 maw-step-fade-in"
        style={{
          transform: contentSwipeOffset > 0 ? `translate3d(${contentSwipeOffset}px, 0, 0)` : undefined,
          transition: isContentSwiping ? 'none' : 'transform 0.22s cubic-bezier(0.25, 1, 0.5, 1)',
          willChange: isContentSwiping ? 'transform' : 'auto',
        }}
      >
        <Outlet />
      </div>
    </div>
  );
}
