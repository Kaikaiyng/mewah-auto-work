import React, { useEffect, useRef, useState } from 'react';
import { Outlet, Link, Navigate, useLocation, useNavigate, useNavigationType } from 'react-router';
import { Home, Calendar, Package, Car, User, RefreshCw, ArrowUp, Truck } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useCustomerData } from '../context/CustomerDataContext';
import { useBooking } from '../context/BookingContext';
import { DataState } from './DataState';
import { HomeScreen } from '../screens/HomeScreen';
import { BookingsScreen } from '../screens/BookingsScreen';
import { PartsScreen } from '../screens/PartsScreen';
import { RemindersScreen } from '../screens/RemindersScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { FleetScreen } from '../screens/FleetScreen';
import { VehicleDetailsScreen } from '../screens/VehicleDetailsScreen';
import { getGlobalActiveTabIndex, updateGlobalActiveTabFromPath } from '../lib/tabState';
import { brandLogoSrc } from './BrandLogoBadge';
import { getHasPlayedLaunchAnimation } from '../lib/launchState';
import { AppLaunchFlightOverlay } from './AppLaunchFlightOverlay';
import { NATIVE_BACK_REQUEST_EVENT } from './NativeBackButtonController';

const routeScrollMemory = new Map<string, number>();

export function MobileLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { data, isLoading, isRefreshing, lastUpdatedAt, error, reload } = useCustomerData();
  const { bookingData } = useBooking();
  const [pullDistance, setPullDistance] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isSnappingTabs, setIsSnappingTabs] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);

  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const touchStartTimeRef = useRef<number>(0);
  const startScrollTopRef = useRef<number>(0);
  const gestureLockRef = useRef<'horizontal' | 'vertical' | 'locked' | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tabContainersRef = useRef<(HTMLDivElement | null)[]>([]);
  const refreshThreshold = 64;

  const navItems = [
    { path: '/home', icon: Home, label: t('Home', 'Utama', '首页'), component: HomeScreen },
    { path: '/fleet', icon: Truck, label: t('Fleet & Service', 'Armada & Servis', '车队与维保'), component: FleetScreen },
    { path: '/parts', icon: Package, label: t('Parts', 'Alat Ganti', '配件'), component: PartsScreen },
    { path: '/profile', icon: User, label: t('Profile', 'Profil', '个人'), component: ProfileScreen }
  ];

  const ROOT_TABS = new Set(['/home', '/fleet', '/parts', '/profile', '/vehicles', '/bookings', '/reminders', '/']);
  const activeIndex = updateGlobalActiveTabFromPath(location.pathname);
  const isMainTab = ROOT_TABS.has(location.pathname);

  const handleTouchStart = (event: React.TouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    if (!touch) return;

    // Don't intercept gestures on interactive inputs, modals or horizontal scrollable lists
    const target = touch.target as HTMLElement | null;
    const isModalOrIgnored = Boolean(
      target?.closest('input, textarea, select, [data-prevent-swipe="true"], [data-horizontal-scroll="true"], [role="dialog"], .overflow-x-auto, .overflow-x-scroll')
    );
    if (isModalOrIgnored) {
      gestureLockRef.current = 'locked';
      return;
    }

    // Record initial scroll position of active tab container
    const activeContainer = tabContainersRef.current[activeIndex];
    startScrollTopRef.current = activeContainer?.scrollTop ?? 0;

    touchStartXRef.current = touch.clientX;
    touchStartYRef.current = touch.clientY;
    touchStartTimeRef.current = Date.now();
    gestureLockRef.current = null;
    setIsDragging(false);
    setDragOffset(0);
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLElement>) => {
    if (gestureLockRef.current === 'locked') return;
    if (touchStartXRef.current == null || touchStartYRef.current == null) return;
    const touch = event.touches[0];
    if (!touch) return;

    const deltaX = touch.clientX - touchStartXRef.current;
    const deltaY = touch.clientY - touchStartYRef.current;

    // Lock gesture direction once threshold is crossed
    if (gestureLockRef.current == null) {
      if (Math.abs(deltaX) > 8 && Math.abs(deltaX) > Math.abs(deltaY) * 1.1) {
        gestureLockRef.current = 'horizontal';
      } else if (Math.abs(deltaY) > 8) {
        gestureLockRef.current = 'vertical';
      }
    }

    if (gestureLockRef.current === 'horizontal' && isMainTab) {
      setIsDragging(true);
      // Rubberband effect on boundaries
      let effectiveOffset = deltaX;
      if ((activeIndex === 0 && deltaX > 0) || (activeIndex === navItems.length - 1 && deltaX < 0)) {
        effectiveOffset = deltaX * 0.3;
      }
      setDragOffset(effectiveOffset);
    } else if (gestureLockRef.current === 'vertical') {
      const activeContainer = tabContainersRef.current[activeIndex];
      const currentScrollTop = activeContainer?.scrollTop ?? 0;

      // Only trigger pull to refresh if the user started the gesture at the very top (scrollTop <= 0)
      if (startScrollTopRef.current <= 0 && currentScrollTop <= 0 && deltaY > 0) {
        if (event.cancelable) event.preventDefault();
        setPullDistance(Math.min(96, deltaY * 0.45));
      } else {
        if (pullDistance > 0) setPullDistance(0);
      }
    }
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLElement>) => {
    const startX = touchStartXRef.current;
    const touch = event.changedTouches[0];
    const lock = gestureLockRef.current;
    const wasAtTop = startScrollTopRef.current <= 0;

    touchStartXRef.current = null;
    touchStartYRef.current = null;
    gestureLockRef.current = null;
    setIsDragging(false);

    if (lock === 'locked') {
      setPullDistance(0);
      setDragOffset(0);
      return;
    }

    // Handle pull to refresh strictly when started from top
    const shouldRefresh = wasAtTop && pullDistance >= refreshThreshold;
    setPullDistance(0);
    if (shouldRefresh) {
      void reload({ manual: true });
    }

    // Handle horizontal page snap
    if (lock === 'horizontal' && startX != null && touch && isMainTab) {
      const containerWidth = containerRef.current?.clientWidth || window.innerWidth || 390;
      const threshold = containerWidth * 0.35; // 35% drag to switch page
      const deltaX = touch.clientX - startX;
      const deltaTime = Date.now() - touchStartTimeRef.current;

      setIsSnappingTabs(true);
      setTimeout(() => setIsSnappingTabs(false), 320);

      // Fast flick or passed threshold
      const isFlick = deltaTime < 250 && Math.abs(deltaX) > 40;
      const passedThreshold = Math.abs(deltaX) > threshold || isFlick;

      if (passedThreshold) {
        if (deltaX < 0 && activeIndex < navItems.length - 1) {
          navigate(navItems[activeIndex + 1].path, { replace: true });
        } else if (deltaX > 0 && activeIndex > 0) {
          navigate(navItems[activeIndex - 1].path, { replace: true });
        }
      }
    }

    setDragOffset(0);
  };

  const handleTabScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const top = e.currentTarget.scrollTop;
    if (top > 240) {
      setShowBackToTop(true);
    } else {
      setShowBackToTop(false);
    }
  };

  useEffect(() => {
    const currentContainer = tabContainersRef.current[activeIndex];
    if (currentContainer && currentContainer.scrollTop > 240) {
      setShowBackToTop(true);
    } else {
      setShowBackToTop(false);
    }
  }, [activeIndex]);

  const scrollToActiveTop = (e: React.MouseEvent) => {
    e.stopPropagation();
    const currentContainer = tabContainersRef.current[activeIndex];
    if (currentContainer) {
      currentContainer.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Subpage edge swipe back gesture
  const [subSwipeOffset, setSubSwipeOffset] = useState(0);
  const [isSubSwiping, setIsSubSwiping] = useState(false);
  const [isSubExiting, setIsSubExiting] = useState(false);
  const subSwipeStartXRef = useRef<number | null>(null);
  const subSwipeStartYRef = useRef<number | null>(null);
  const subSwipeStartTimeRef = useRef<number>(0);
  const subGestureLockRef = useRef<'horizontal' | 'vertical' | null>(null);
  const subpageMainRef = useRef<HTMLElement | null>(null);

  React.useLayoutEffect(() => {
    const saved = routeScrollMemory.get(location.pathname);
    if (subpageMainRef.current && saved !== undefined) {
      subpageMainRef.current.scrollTop = saved;
    }
  }, [location.pathname]);

  const handleSubpageScroll = (e: React.UIEvent<HTMLElement>) => {
    routeScrollMemory.set(location.pathname, e.currentTarget.scrollTop);
  };

  const navType = useNavigationType();
  const [isPushEntering, setIsPushEntering] = useState(false);
  const prevPathRef = useRef(location.pathname);

  useEffect(() => {
    const prevPath = prevPathRef.current;
    prevPathRef.current = location.pathname;

    setSubSwipeOffset(0);
    setIsSubSwiping(false);
    setIsSubExiting(false);

    // If navigating within the same subflow (e.g. /booking/... to /booking/...), avoid triggering full-screen slide
    const wasInBooking = prevPath.startsWith('/booking');
    const isNowInBooking = location.pathname.startsWith('/booking');
    const wasInCart = prevPath.startsWith('/cart');
    const isNowInCart = location.pathname.startsWith('/cart');
    const isSameSubflow = (wasInBooking && isNowInBooking) || (wasInCart && isNowInCart);

    if (!isMainTab && navType === 'PUSH' && !isSameSubflow) {
      setIsPushEntering(true);
      const timer = setTimeout(() => {
        setIsPushEntering(false);
      }, 240);
      return () => clearTimeout(timer);
    } else {
      setIsPushEntering(false);
    }
  }, [location.pathname, navType, isMainTab]);

  const getSubpageBackRoute = (pathname: string): { path?: string; useReplace?: boolean } => {
    if (pathname.startsWith('/vehicle-history/')) {
      const vehicleId = pathname.replace('/vehicle-history/', '').split('/')[0].split('?')[0];
      return { path: `/vehicle/${vehicleId}`, useReplace: true };
    }
    if (pathname.startsWith('/vehicle-invoices/')) {
      const vehicleId = pathname.replace('/vehicle-invoices/', '').split('/')[0].split('?')[0];
      return { path: `/vehicle/${vehicleId}`, useReplace: true };
    }
    if (pathname.startsWith('/vehicle/')) {
      return { path: '/vehicles', useReplace: true };
    }
    if (pathname === '/registered-vehicles') {
      return { path: '/vehicles', useReplace: true };
    }
    if (pathname === '/booking/step5') return { path: '/booking/step4' };
    if (pathname === '/booking/step4') return { path: '/booking/step3' };
    if (pathname === '/booking/step3') return { path: '/booking/step2' };
    if (pathname === '/booking/step2') return { path: '/booking/step1' };
    if (pathname === '/booking/step1') {
      if (bookingData?.returnTo && bookingData.returnTo !== '/home') {
        return { path: bookingData.returnTo, useReplace: true };
      }
      return { path: '/booking/select-vehicle' };
    }
    if (pathname === '/booking/select-vehicle') {
      const origin = bookingData?.returnTo || '/home';
      return { path: origin, useReplace: true };
    }
    return {};
  };

  useEffect(() => {
    const handleNativeBack = (event: Event) => {
      if (location.pathname === '/home' || location.pathname === '/') return;

      event.preventDefault();
      if (isSubExiting) return;

      if (!isMainTab) {
        setIsSubExiting(true);
        setSubSwipeOffset(0);
        window.setTimeout(() => navigate('/home', { replace: true }), 220);
        return;
      }

      setIsSnappingTabs(true);
      navigate('/home', { replace: true });
      window.setTimeout(() => setIsSnappingTabs(false), 320);
    };

    window.addEventListener(NATIVE_BACK_REQUEST_EVENT, handleNativeBack);
    return () => window.removeEventListener(NATIVE_BACK_REQUEST_EVENT, handleNativeBack);
  }, [isMainTab, isSubExiting, location.pathname, navigate]);

  const handleSubTouchStart = (e: React.TouchEvent<HTMLElement>) => {
    if (isMainTab || isSubExiting) return;

    // Intermediate booking steps are handled in-place by BookingFlowLayout so the header and progress bar stay fixed
    if (
      location.pathname.startsWith('/booking/step2') ||
      location.pathname.startsWith('/booking/step3') ||
      location.pathname.startsWith('/booking/step4') ||
      location.pathname.startsWith('/booking/step5')
    ) {
      subGestureLockRef.current = 'locked';
      return;
    }

    const touch = e.touches[0];
    if (!touch) return;

    // Don't intercept gestures on interactive inputs, modals, datepickers or horizontal scrollable lists
    const target = touch.target as HTMLElement | null;
    const isInteractiveOrIgnored = Boolean(
      target?.closest('input, textarea, select, [data-prevent-swipe="true"], [data-horizontal-scroll="true"], [role="dialog"], .overflow-x-auto, .overflow-x-scroll')
    );
    if (isInteractiveOrIgnored) {
      subGestureLockRef.current = 'locked';
      return;
    }

    subSwipeStartXRef.current = touch.clientX;
    subSwipeStartYRef.current = touch.clientY;
    subSwipeStartTimeRef.current = Date.now();
    subGestureLockRef.current = null;
    setIsSubSwiping(false);
    setSubSwipeOffset(0);
  };

  const handleSubTouchMove = (e: React.TouchEvent<HTMLElement>) => {
    if (isMainTab || isSubExiting || subGestureLockRef.current === 'locked') return;
    if (subSwipeStartXRef.current == null || subSwipeStartYRef.current == null) return;
    const touch = e.touches[0];
    if (!touch) return;

    const deltaX = touch.clientX - subSwipeStartXRef.current;
    const deltaY = touch.clientY - subSwipeStartYRef.current;

    // Lock gesture direction once movement threshold is crossed
    if (subGestureLockRef.current == null) {
      if (deltaX > 6 && deltaX > Math.abs(deltaY) * 1.05) {
        subGestureLockRef.current = 'horizontal';
      } else if (Math.abs(deltaY) > 6 || deltaX < -6) {
        subGestureLockRef.current = 'vertical';
      }
    }

    if (subGestureLockRef.current === 'horizontal' && deltaX > 0) {
      setIsSubSwiping(true);
      setSubSwipeOffset(deltaX);
    }
  };

  const handleSubTouchEnd = (e: React.TouchEvent<HTMLElement>) => {
    if (isMainTab || isSubExiting) return;
    const startX = subSwipeStartXRef.current;
    const touch = e.changedTouches[0];
    const lock = subGestureLockRef.current;

    subSwipeStartXRef.current = null;
    subSwipeStartYRef.current = null;
    subGestureLockRef.current = null;
    setIsSubSwiping(false);

    if (lock === 'locked') {
      setSubSwipeOffset(0);
      return;
    }

    if (lock === 'horizontal' && startX != null && touch) {
      const deltaX = touch.clientX - startX;
      const deltaTime = Date.now() - subSwipeStartTimeRef.current;
      const screenWidth = typeof window !== 'undefined' ? Math.min(window.innerWidth, 416) : 390;
      const isFlick = deltaTime < 250 && deltaX > 35;
      const passedThreshold = deltaX > screenWidth * 0.32 || isFlick;

      if (passedThreshold) {
        setIsSubExiting(true);
        const backTarget = getSubpageBackRoute(location.pathname);
        setTimeout(() => {
          if (backTarget.path) {
            navigate(backTarget.path, { replace: backTarget.useReplace });
          } else {
            navigate(-1);
          }
        }, 220);
        return;
      }
    }

    setSubSwipeOffset(0);
  };

  if (!data && !isLoading && (!error || /unauthenticated|sign in/i.test(error))) {
    return <Navigate to="/" replace />;
  }
  if (!data) {
    return (
      <div className="maw-app-shell relative mx-auto flex h-[100dvh] w-full max-w-md flex-col overflow-hidden bg-[#eef3fb]">
        {!getHasPlayedLaunchAnimation() ? <AppLaunchFlightOverlay /> : null}
        <DataState isLoading={isLoading} error={error} onRetry={() => void reload()} />
      </div>
    );
  }

  return (
    <div className="maw-app-shell relative mx-auto flex h-[100dvh] w-full max-w-md flex-col overflow-hidden bg-[#eef3fb]">
      {!getHasPlayedLaunchAnimation() && (location.pathname === '/home' || location.pathname === '/') ? (
        <AppLaunchFlightOverlay />
      ) : null}
      {/* Layer 0: Root Main Tabs - Permanently mounted, fixed solid behind secondary pages */}
      <div
        className={`absolute inset-0 z-0 flex flex-col overflow-hidden bg-[#eef3fb] ${
          !isMainTab ? 'pointer-events-none select-none' : 'pointer-events-auto'
        }`}
      >
        {/* Pull to refresh badge */}
        <div
          aria-live="polite"
          className={`pointer-events-none absolute left-1/2 top-[5.25rem] z-30 flex items-center gap-2 rounded-full border border-blue-100 bg-white/95 px-3.5 py-1.5 text-[11px] font-semibold text-blue-700 shadow-[0_8px_20px_rgba(37,99,235,0.14)] backdrop-blur-md transition-all duration-200 ${
            pullDistance > 0 || isRefreshing
              ? 'opacity-100'
              : 'opacity-0'
          }`}
          style={{
            transform: `translateX(-50%) translateY(${
              pullDistance > 0
                ? Math.min(pullDistance * 0.45, 28)
                : isRefreshing
                  ? 12
                  : -28
            }px) scale(${pullDistance > 0 || isRefreshing ? 1 : 0.85})`,
          }}
        >
          <RefreshCw className={`h-3.5 w-3.5 text-[#2563eb] ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>
            {isRefreshing
              ? t('Refreshing...', 'Sedang menyegar semula…', '正在刷新…')
              : pullDistance >= refreshThreshold
                ? t('Release to refresh', 'Lepaskan untuk segar semula', '松开刷新')
                : t('Pull to refresh', 'Tarik untuk segar semula', '下拉刷新')}
          </span>
          {lastUpdatedAt && !isRefreshing && pullDistance === 0 ? (
            <span className="sr-only">{new Date(lastUpdatedAt).toLocaleTimeString()}</span>
          ) : null}
        </div>

        {/* 5 Main Tabs Carousel */}
        <div
          ref={containerRef}
          className="relative flex-1 overflow-hidden"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >
          <div
            className="flex h-full w-[400%] flex-nowrap"
            style={{
              transform: `translate3d(calc(-${activeIndex * 25}% + ${dragOffset / 4}px), 0, 0)`,
              transition: isDragging ? 'none' : isSnappingTabs ? 'transform 0.32s cubic-bezier(0.25, 1, 0.5, 1)' : 'none',
              willChange: isDragging ? 'transform' : 'auto',
            }}
          >
            {navItems.map((item, index) => {
              const ScreenComponent = item.component;
              return (
                <div
                  key={item.path}
                  ref={(el) => { tabContainersRef.current[index] = el; }}
                  onScroll={handleTabScroll}
                  className="h-full w-1/4 flex-shrink-0 overflow-y-auto overscroll-y-contain scroll-smooth"
                >
                  <ScreenComponent />
                </div>
              );
            })}
          </div>
        </div>

        {/* Floating Back-to-Top Button centered above footer capsule */}
        <button
          type="button"
          onClick={scrollToActiveTop}
          aria-label={t('Back to top', 'Kembali ke atas', '回到顶部')}
          className={`absolute bottom-[6.1rem] left-1/2 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-[#2563eb] shadow-[0_10px_28px_rgba(30,58,138,0.24)] ring-1 ring-blue-200/80 backdrop-blur-md transition-all duration-250 active:scale-90 hover:bg-blue-50 hover:text-blue-700 ${
            showBackToTop && isMainTab
              ? 'opacity-100 -translate-x-1/2 translate-y-0 scale-100 pointer-events-auto'
              : 'opacity-0 -translate-x-1/2 translate-y-3 scale-75 pointer-events-none'
          }`}
        >
          <ArrowUp className="h-5 w-5 stroke-[2.5]" />
        </button>

        {/* Bottom Navigation */}
        <nav aria-label={t('Main navigation', 'Navigasi utama', '主导航')} className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-50 w-[calc(100%-2rem)] max-w-[416px] -translate-x-1/2 rounded-[1.5rem] border border-white/80 bg-white/95 shadow-[0_12px_35px_rgba(30,58,138,0.16)] backdrop-blur-xl">
          <div className="relative grid grid-cols-4 items-center h-[4.25rem] px-1.5">
            {/* Real-time synchronized sliding active capsule */}
            {(() => {
              const screenWidth = typeof window !== 'undefined' ? Math.min(window.innerWidth, 416) : 390;
              const dragRatio = dragOffset / screenWidth;
              const visualActiveProgress = Math.max(0, Math.min(navItems.length - 1, activeIndex - dragRatio));
              const closestIndex = Math.round(visualActiveProgress);

              return (
                <>
                  {/* 100% mathematically aligned indicator container matching grid columns */}
                  <div
                    className="pointer-events-none absolute inset-y-0 left-1.5 w-[calc((100%-0.75rem)/4)] flex items-center justify-center p-1"
                    style={{
                      transform: `translate3d(${visualActiveProgress * 100}%, 0, 0)`,
                      transition: isDragging ? 'none' : isSnappingTabs ? 'transform 0.32s cubic-bezier(0.25, 1, 0.5, 1)' : 'transform 0.22s cubic-bezier(0.25, 1, 0.5, 1)',
                      willChange: isDragging ? 'transform' : 'auto',
                    }}
                  >
                    <div className="h-[3.35rem] w-full rounded-2xl bg-blue-50/90 border border-blue-200/60 shadow-[0_2px_10px_rgba(37,99,235,0.08)]" />
                  </div>

                  {navItems.map((item, index) => {
                    const Icon = item.icon;
                    const isHighlighted = isDragging || isSnappingTabs
                      ? closestIndex === index
                      : activeIndex === index;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        aria-current={isHighlighted ? 'page' : undefined}
                        className={`relative z-10 flex flex-col items-center justify-center h-full rounded-2xl transition-colors duration-150 ${
                          isHighlighted
                            ? 'text-[#2563eb]'
                            : 'text-gray-400 hover:text-gray-600'
                        }`}
                      >
                        <span className="mb-0.5 flex h-7 w-7 items-center justify-center">
                          <Icon className={`w-5 h-5 transition-transform duration-150 ${isHighlighted ? 'scale-110' : 'scale-100'}`} />
                        </span>
                        <span className={`text-[11px] transition-all duration-150 ${isHighlighted ? 'font-bold text-[#2563eb]' : 'font-medium text-gray-500'}`}>
                          {item.label}
                        </span>
                      </Link>
                    );
                  })}
                </>
              );
            })()}
          </div>
        </nav>
      </div>

      {/* Layer 0.5: Pinned Level-2 parent page (VehicleDetailsScreen) for Level-3 routes (/vehicle-history/:id, /vehicle-invoices/:id) */}
      {(location.pathname.startsWith('/vehicle-history/') || location.pathname.startsWith('/vehicle-invoices/')) && (() => {
        const prefix = location.pathname.startsWith('/vehicle-history/') ? '/vehicle-history/' : '/vehicle-invoices/';
        const vehicleId = location.pathname.replace(prefix, '').split('/')[0].split('?')[0];
        const parentPath = `/vehicle/${vehicleId}`;
        const parentScrollTop = routeScrollMemory.get(parentPath) || 0;

        return (
          <div
            ref={(el) => {
              if (el && parentScrollTop > 0) {
                el.scrollTop = parentScrollTop;
              }
            }}
            className="absolute inset-0 z-[5] pointer-events-none select-none overflow-y-auto overscroll-y-contain bg-[#eef3fb] w-full max-w-md mx-auto"
          >
            <VehicleDetailsScreen overrideVehicleId={vehicleId} />
          </div>
        );
      })()}

      {/* Layer 1: Secondary Sub-Page Stack - Pinned over Layer 0/0.5 with real-time sliding swipe back */}
      {!isMainTab && (() => {
        const getSubpageContainerKey = (pathname: string) => {
          if (pathname.startsWith('/booking')) return 'booking-flow-container';
          if (pathname.startsWith('/cart')) return 'cart-flow-container';
          return pathname;
        };

        return (
          <main
            key={getSubpageContainerKey(location.pathname)}
            ref={subpageMainRef}
            onScroll={handleSubpageScroll}
            onTouchStart={handleSubTouchStart}
            onTouchMove={handleSubTouchMove}
            onTouchEnd={handleSubTouchEnd}
            onTouchCancel={handleSubTouchEnd}
            className="absolute inset-0 z-10 w-full h-full overflow-y-auto overscroll-y-contain bg-[#eef3fb] shadow-[-16px_0_40px_rgba(15,23,42,0.18)]"
            style={{
              transform: isSubExiting
                ? 'translate3d(100%, 0, 0)'
                : subSwipeOffset > 0
                  ? `translate3d(${subSwipeOffset}px, 0, 0)`
                  : undefined,
              transition: isSubSwiping || (!isSubExiting && subSwipeOffset === 0)
                ? 'none'
                : 'transform 0.22s cubic-bezier(0.25, 1, 0.5, 1)',
              animation: isPushEntering && !isSubSwiping && subSwipeOffset === 0 && !isSubExiting
                ? 'mawSlideInRight 0.24s cubic-bezier(0.25, 1, 0.5, 1)'
                : 'none',
              willChange: isSubSwiping || isSubExiting || isPushEntering ? 'transform' : 'auto',
            }}
          >
            <Outlet />
          </main>
        );
      })()}
    </div>
  );
}
