import { LoaderCircle, LogOut } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';

type CustomerLogoutDialogProps = {
  open: boolean;
  isLoggingOut: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
};

export function CustomerLogoutDialog({
  open,
  isLoggingOut,
  onOpenChange,
  onConfirm,
}: CustomerLogoutDialogProps) {
  const { t } = useLanguage();

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isLoggingOut) onOpenChange(nextOpen);
      }}
    >
      <AlertDialogContent className="w-[calc(100%-2.5rem)] max-w-sm overflow-hidden rounded-3xl border-0 bg-white p-0 shadow-2xl">
        <div className="px-6 pb-5 pt-7">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50">
            <LogOut className="h-7 w-7 text-red-600" />
          </div>

          <AlertDialogHeader className="gap-2 text-center sm:text-center">
            <AlertDialogTitle className="text-xl font-bold text-gray-900">
              {t('Log out?', 'Log keluar?', '退出登录？')}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-6 text-gray-500">
              {t(
                'You will need to sign in again to access your account.',
                'Anda perlu log masuk semula untuk mengakses akaun anda.',
                '退出后需要重新登录才能访问您的账户。',
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
        </div>

        <AlertDialogFooter className="grid grid-cols-2 gap-3 border-t border-gray-100 bg-gray-50 p-4 sm:grid-cols-2">
          <AlertDialogCancel
            type="button"
            disabled={isLoggingOut}
            className="m-0 h-11 rounded-xl border-gray-200 bg-white font-semibold text-gray-700 hover:bg-gray-100"
          >
            {t('Cancel', 'Batal', '取消')}
          </AlertDialogCancel>
          <button
            type="button"
            disabled={isLoggingOut}
            aria-busy={isLoggingOut}
            onClick={() => void onConfirm()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-70"
          >
            {isLoggingOut ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            {isLoggingOut
              ? t('Logging out...', 'Sedang log keluar...', '正在退出...')
              : t('Log out', 'Log keluar', '退出')}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
