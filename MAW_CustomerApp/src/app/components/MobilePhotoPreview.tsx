import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

type MobilePhotoPreviewProps = {
  src: string;
  alt: string;
  category?: string;
  caption?: string;
  meta?: string;
  onClose: () => void;
};

export function MobilePhotoPreview({ src, alt, category, caption, meta, onClose }: MobilePhotoPreviewProps) {
  const onCloseRef = useRef(onClose);
  const closedByHistoryRef = useRef(false);
  const historyTokenRef = useRef(`maw-photo-${Date.now()}-${Math.random()}`);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.history.pushState({ mawPhotoPreview: historyTokenRef.current }, '');

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    const handlePopState = () => {
      closedByHistoryRef.current = true;
      onCloseRef.current();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('popstate', handlePopState);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('popstate', handlePopState);
      if (!closedByHistoryRef.current && window.history.state?.mawPhotoPreview === historyTokenRef.current) {
        window.history.back();
      }
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] flex min-h-[100dvh] items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm animate-in fade-in-0 duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="Photo preview"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-[1.75rem] border border-white/70 bg-white shadow-[0_24px_80px_rgba(2,6,23,0.38)] animate-in fade-in-0 zoom-in-95 duration-200"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/80 bg-white/90 text-slate-700 shadow-lg backdrop-blur active:bg-white"
          aria-label="Close photo preview"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex max-h-[72dvh] min-h-48 items-center justify-center overflow-hidden bg-slate-100">
          <img src={src} alt={alt} className="max-h-[72dvh] w-full select-none object-contain" />
        </div>
        {(category || caption || meta) ? (
          <div className="border-t border-slate-100 px-5 pb-5 pt-4 text-slate-800">
            <div className="flex flex-wrap items-center gap-2">
              {category ? <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#2563eb]">{category.replaceAll('_', ' ')}</span> : null}
              {meta ? <span className="text-xs font-medium text-slate-400">{meta}</span> : null}
            </div>
            {caption ? <p className="mt-2 text-sm leading-5 text-slate-600">{caption}</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
