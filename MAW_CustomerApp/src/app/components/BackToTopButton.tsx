import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface BackToTopButtonProps {
  threshold?: number;
  className?: string;
}

export function BackToTopButton({ threshold = 260, className = '' }: BackToTopButtonProps) {
  const { t } = useLanguage();
  const [isVisible, setIsVisible] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const scrollParentRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const btn = buttonRef.current;
    if (!btn) return;

    // Find closest scrollable ancestor container or fallback to documentElement
    const scrollParent = (btn.closest('.overflow-y-auto, .overflow-y-scroll, main') as HTMLElement) || document.documentElement;
    scrollParentRef.current = scrollParent;

    const handleScroll = () => {
      const currentScroll = scrollParent === document.documentElement
        ? window.scrollY || document.documentElement.scrollTop
        : scrollParent.scrollTop;

      if (currentScroll > threshold) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    const targetToListen = scrollParent === document.documentElement ? window : scrollParent;
    targetToListen.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      targetToListen.removeEventListener('scroll', handleScroll);
    };
  }, [threshold]);

  const handleScrollToTop = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (scrollParentRef.current && scrollParentRef.current !== document.documentElement) {
      scrollParentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={handleScrollToTop}
      aria-label={t('Back to top', 'Kembali ke atas', '回到顶部')}
      className={`fixed bottom-[5.75rem] right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-[#2563eb] shadow-[0_10px_25px_rgba(37,99,235,0.22)] ring-1 ring-blue-100/90 backdrop-blur-md transition-all duration-250 active:scale-90 hover:bg-blue-50 hover:text-blue-700 ${
        isVisible
          ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto'
          : 'opacity-0 translate-y-4 scale-75 pointer-events-none'
      } ${className}`}
    >
      <ArrowUp className="h-5 w-5 stroke-[2.5]" />
    </button>
  );
}
