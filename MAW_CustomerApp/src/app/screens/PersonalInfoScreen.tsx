import React from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, User, Phone, Mail, LogOut, Lock, Info } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { useLanguage } from '../context/LanguageContext';
import { useCustomerData } from '../context/CustomerDataContext';
import { DataState } from '../components/DataState';
import { useCustomerLogout } from '../lib/use-customer-logout';
import { CustomerLogoutDialog } from '../components/CustomerLogoutDialog';
import { formatMalaysiaPhone } from '../lib/malaysia-phone';

export function PersonalInfoScreen() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { data, isLoading, error, reload } = useCustomerData();
  const {
    isLogoutDialogOpen,
    isLoggingOut,
    openLogoutDialog,
    setLogoutDialogOpen,
    logout,
  } = useCustomerLogout();

  if (!data) {
    return <DataState isLoading={isLoading} error={error} onRetry={() => void reload()} />;
  }

  return (
    <div className="min-h-screen bg-[#eef3fb] max-w-md mx-auto">
      {/* Header */}
      <div className="maw-page-header sticky top-0 z-40 relative flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-gray-700 ring-1 ring-blue-100 shadow-sm hover:bg-blue-50 transition-colors"
          aria-label={t('Back', 'Kembali', '返回')}
        >
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <h1 className="text-base font-bold text-center absolute left-1/2 -translate-x-1/2 pointer-events-none truncate max-w-[200px]">
          {t('Personal Information', 'Maklumat Peribadi', '个人信息')}
        </h1>
        <div className="w-10" />
      </div>

      <div className="px-5 pt-4 pb-28 space-y-4">
        {/* Admin Managed Notice Banner */}
        <div className="rounded-2xl bg-blue-50 border border-blue-100 p-4 flex items-start gap-3 text-blue-900 shadow-sm">
          <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-semibold text-blue-800">
              {t('Admin Managed Information', 'Maklumat Diuruskan oleh Pentadbir', '管理员统一管理信息')}
            </p>
            <p className="text-blue-700 leading-relaxed">
              {t(
                'Personal information is managed by the workshop administration. Please contact support or admin to request updates.',
                'Maklumat peribadi diuruskan oleh pentadbir bengkel. Sila hubungi sokongan atau pentadbir untuk sebarang perubahan.',
                '个人账号与联系资料由车厂管理员统一设置与维护。如需更改信息，请联系管理员或客服。'
              )}
            </p>
          </div>
        </div>

        {/* Contact Information Card */}
        <Card className="rounded-2xl shadow-md border-0">
          <CardContent className="p-4">
            {/* Full Name */}
            <div className="flex items-center justify-between w-full p-3 rounded-lg">
              <div className="flex items-center gap-3 flex-1">
                <User className="w-5 h-5 text-gray-600" />
                <div className="text-left flex-1">
                  <p className="text-sm text-gray-500">{t('Full Name', 'Nama Penuh', '姓名')}</p>
                  <p className="text-gray-800 font-medium">{data.user.name}</p>
                </div>
              </div>
            </div>

            <div className="border-t my-2"></div>

            {/* Phone Number */}
            <div className="flex items-center justify-between w-full p-3 rounded-lg">
              <div className="flex items-center gap-3 flex-1">
                <Phone className="w-5 h-5 text-gray-600" />
                <div className="text-left flex-1">
                  <p className="text-sm text-gray-500">{t('Phone Number', 'Nombor Telefon', '电话号码')}</p>
                  <p className="text-gray-800 font-medium">{formatMalaysiaPhone(data.user.phone)}</p>
                </div>
              </div>
            </div>

            <div className="border-t my-2"></div>

            {/* Email Address */}
            <div className="flex items-center justify-between w-full p-3 rounded-lg">
              <div className="flex items-center gap-3 flex-1">
                <Mail className="w-5 h-5 text-gray-600" />
                <div className="text-left flex-1">
                  <p className="text-sm text-gray-500">{t('Email Address', 'Alamat E-mel', '邮箱地址')}</p>
                  <p className="text-gray-800 font-medium">{data.user.email}</p>
                </div>
              </div>
            </div>

            <div className="border-t my-2"></div>

            {/* Change Password */}
            <div className="flex items-center justify-between w-full p-3 rounded-lg">
              <div className="flex items-center gap-3">
                <Lock className="w-5 h-5 text-gray-600" />
                <div className="text-left">
                  <p className="text-sm text-gray-500">{t('Password', 'Kata Laluan', '密码')}</p>
                  <p className="text-gray-800 font-medium">••••••••</p>
                </div>
              </div>
            </div>

            <div className="border-t my-2"></div>

            {/* Logout */}
            <button
              type="button"
              onClick={openLogoutDialog}
              disabled={isLoggingOut}
              className="flex items-center justify-between w-full p-3 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <LogOut className="w-5 h-5 text-red-600" />
                <div className="text-left">
                  <p className="text-sm text-gray-500">{isLoggingOut ? t('Logging out...', 'Sedang log keluar...', '正在退出...') : t('Logout', 'Log Keluar', '登出')}</p>
                  <p className="text-red-600 font-medium">{t('Sign out of your account', 'Keluar dari akaun anda', '退出您的账户')}</p>
                </div>
              </div>
            </button>
          </CardContent>
        </Card>
      </div>

      <CustomerLogoutDialog
        open={isLogoutDialogOpen}
        isLoggingOut={isLoggingOut}
        onOpenChange={setLogoutDialogOpen}
        onConfirm={logout}
      />
    </div>
  );
}
