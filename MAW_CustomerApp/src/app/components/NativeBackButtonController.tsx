import { useEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import { useLanguage } from '../context/LanguageContext';

export const NATIVE_BACK_REQUEST_EVENT = 'maw:native-back-request';

const EXIT_CONFIRM_WINDOW_MS = 2000;

export function NativeBackButtonController() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const lastBackPressAtRef = useRef(0);

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;

    let disposed = false;
    let removeListener: (() => Promise<void>) | undefined;

    void CapacitorApp.addListener('backButton', () => {
      const request = new CustomEvent(NATIVE_BACK_REQUEST_EVENT, { cancelable: true });
      const handledByScreen = !window.dispatchEvent(request);
      if (handledByScreen) return;

      const isHome = location.pathname === '/home';
      const isExitScreen = isHome || location.pathname === '/' || location.pathname === '/workshop/jobs';

      if (!isExitScreen) {
        navigate('/home', { replace: true });
        return;
      }

      const now = Date.now();
      if (now - lastBackPressAtRef.current <= EXIT_CONFIRM_WINDOW_MS) {
        toast.dismiss('android-exit-confirm');
        void CapacitorApp.exitApp();
        return;
      }

      lastBackPressAtRef.current = now;
      toast(t(
        'Press back again to exit the app',
        'Tekan kembali sekali lagi untuk keluar aplikasi',
        '再次按返回键即可退出应用',
      ), {
        id: 'android-exit-confirm',
        duration: EXIT_CONFIRM_WINDOW_MS,
      });
    }).then((handle) => {
      if (disposed) {
        void handle.remove();
      } else {
        removeListener = handle.remove;
      }
    });

    return () => {
      disposed = true;
      if (removeListener) void removeListener();
    };
  }, [location.pathname, navigate, t]);

  return <Outlet />;
}
