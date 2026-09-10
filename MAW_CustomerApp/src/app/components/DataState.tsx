import { AlertCircle, LoaderCircle } from 'lucide-react';
import { Button } from './ui/button';
import { clearCustomerAuthentication, isCustomerAuthenticationError } from '../lib/api';
import { useLanguage } from '../context/LanguageContext';

export function DataState({
  isLoading,
  error,
  onRetry,
}: {
  isLoading: boolean;
  error: string;
  onRetry: () => void;
}) {
  const { t } = useLanguage();

  if (isLoading) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center px-6" role="status">
        <div className="flex min-w-40 flex-col items-center rounded-2xl border border-blue-100 bg-white/95 px-6 py-5 shadow-[0_14px_38px_rgba(30,58,138,0.10)]">
          <LoaderCircle className="h-7 w-7 animate-spin text-[#2563eb]" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-slate-700">{t('Loading your information…', 'Memuatkan maklumat anda…', '正在加载您的资料…')}</p>
        </div>
      </div>
    );
  }
  if (!error) return null;
  const isAuthenticationError = isCustomerAuthenticationError(error);
  const returnToLogin = () => {
    clearCustomerAuthentication();
    const basename = (import.meta.env.VITE_ROUTER_BASENAME || '').replace(/\/+$/, '');
    window.location.assign(`${basename}/`);
  };

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-6 text-center">
      <div className="w-full max-w-sm rounded-2xl border border-red-100 bg-white/95 p-6 shadow-[0_14px_38px_rgba(30,58,138,0.08)]">
      <AlertCircle className="mx-auto mb-3 h-10 w-10 text-red-500" aria-hidden="true" />
      <h2 className="font-bold text-slate-900">{isAuthenticationError ? t('Please sign in again', 'Sila log masuk semula', '请重新登录') : t('Something went wrong', 'Sesuatu tidak kena', '出现了一些问题')}</h2>
      <p className="mb-5 mt-2 break-words text-sm leading-5 text-gray-500">{error}</p>
      {isAuthenticationError ? (
        <Button onClick={returnToLogin} className="h-11 w-full bg-[#2563eb]">{t('Back to Login', 'Kembali ke Log Masuk', '返回登录')}</Button>
      ) : (
        <Button onClick={onRetry} className="h-11 w-full bg-[#2563eb]">{t('Try Again', 'Cuba Lagi', '重试')}</Button>
      )}
      </div>
    </div>
  );
}
