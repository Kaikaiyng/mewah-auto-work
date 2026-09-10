import React, { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { MobileLayout } from './MobileLayout';

const ROOT_TABS = new Set(['/home', '/bookings', '/parts', '/vehicles', '/reminders', '/profile', '/', '/workshop/jobs']);

const getSubPageGroupKey = (pathname: string) => {
  if (pathname.startsWith('/booking')) return '/booking';
  return pathname;
};

export function SwipeBackWrapper() {
  const location = useLocation();
  const navigate = useNavigate();
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const touchStartTimeRef = useRef<number>(0);
  const gestureLockRef = useRef<'horizontal' | 'vertical' | null>(null);

  const isSecondaryPage = !ROOT_TABS.has(location.pathname);
  const subGroupKey = isSecondaryPage ? getSubPageGroupKey(location.pathname) : '';
  const [activeSubPath, setActiveSubPath] = useState(subGroupKey);
  const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 390;

  useEffect(() => {
    if (isSecondaryPage) {
      setActiveSubPath(subGroupKey);
      setDragOffset(0);
      setIsExiting(false);
    } else {
      setActiveSubPath('');
      setDragOffset(0);
      setIsExiting(false);
    }
  }, [isSecondaryPage, subGroupKey]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isSecondaryPage || isExiting) return;
    const touch = e.touches[0];
    if (!touch) return;

    // Don't intercept if user touches input, select, textarea, button or horizontal scroll containers
    const target = touch.target as HTMLElement | null;
    const isHorizontalScroll = Boolean(
      target?.closest('input, textarea, select, [data-prevent-swipe="true"], [data-horizontal-scroll="true"], .overflow-x-auto, .overflow-x-scroll')
    );
    if (isHorizontalScroll) {
      gestureLockRef.current = 'vertical';
      return;
    }

    touchStartXRef.current = touch.clientX;
    touchStartYRef.current = touch.clientY;
    touchStartTimeRef.current = Date.now();
    gestureLockRef.current = null;
    setIsDragging(false);
    setDragOffset(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSecondaryPage || isExiting || touchStartXRef.current == null || touchStartYRef.current == null) return;
    const touch = e.touches[0];
    if (!touch) return;

    const deltaX = touch.clientX - touchStartXRef.current;
    const deltaY = touch.clientY - touchStartYRef.current;

    // Lock gesture direction: only swipe right (from left to right to go back)
    if (gestureLockRef.current == null) {
      if (deltaX > 8 && deltaX > Math.abs(deltaY) * 1.1) {
        gestureLockRef.current = 'horizontal';
      } else if (Math.abs(deltaY) > 8 || deltaX < -8) {
        gestureLockRef.current = 'vertical';
      }
    }

    if (gestureLockRef.current === 'horizontal') {
      setIsDragging(true);
      setDragOffset(Math.max(0, deltaX));
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!isSecondaryPage || isExiting) return;
    const startX = touchStartXRef.current;
    const touch = e.changedTouches[0];
    const lock = gestureLockRef.current;

    touchStartXRef.current = null;
    touchStartYRef.current = null;
    gestureLockRef.current = null;
    setIsDragging(false);

    if (lock === 'horizontal' && startX != null && touch) {
      const deltaX = touch.clientX - startX;
      const deltaTime = Date.now() - touchStartTimeRef.current;
      const isFlick = deltaTime < 250 && deltaX > 45;
      const passedThreshold = deltaX > screenWidth * 0.3 || isFlick;

      if (passedThreshold) {
        setIsExiting(true);
        setDragOffset(screenWidth);
        setTimeout(() => {
          navigate(-1);
        }, 200);
        return;
      }
    }

    setDragOffset(0);
  };

  return (
    <div
      className="maw-app-shell relative mx-auto h-[100dvh] w-full max-w-md overflow-hidden bg-[#eef3fb]"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* Root Layer: Permanently mounted in DOM, 100% static, zero destruction, zero shift */}
      <div
        className={`absolute inset-0 z-0 h-full w-full overflow-hidden ${
          isSecondaryPage ? 'pointer-events-none select-none' : 'pointer-events-auto'
        }`}
      >
        <MobileLayout />
      </div>

      {/* Secondary Sub-Page Overlay Layer: Smooth slide-in from right on enter, follow-finger swipe-out on exit */}
      {isSecondaryPage && (
        <div
          key={activeSubPath}
          className="absolute inset-0 z-10 h-full w-full overflow-y-auto bg-[#eef3fb] shadow-[-20px_0_48px_rgba(15,23,42,0.22)]"
          style={{
            transform: `translate3d(${dragOffset}px, 0, 0)`,
            transition: isDragging ? 'none' : 'transform 0.22s cubic-bezier(0.25, 1, 0.5, 1)',
            animation: !isDragging && dragOffset === 0 && !isExiting ? 'mawSlideInRight 0.26s cubic-bezier(0.25, 1, 0.5, 1)' : 'none',
            willChange: 'transform',
          }}
        >
          <Outlet />
        </div>
      )}
    </div>
  );
}
