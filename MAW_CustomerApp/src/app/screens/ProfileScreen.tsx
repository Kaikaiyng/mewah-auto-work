import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { Mail, Phone, MapPin, Car, FileText, HeadphonesIcon, Bell, ChevronRight, Plus, User, ArrowLeft, Languages, Camera, Upload, LogOut } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { useLanguage } from '../context/LanguageContext';
import { useCustomerData } from '../context/CustomerDataContext';
import { DataState } from '../components/DataState';
import { toast } from 'sonner';
import { useCustomerLogout } from '../lib/use-customer-logout';
import { CustomerLogoutDialog } from '../components/CustomerLogoutDialog';

export function ProfileScreen() {
  const navigate = useNavigate();
  const { t, language, setLanguage } = useLanguage();
  const { data, isLoading, error, reload } = useCustomerData();
  const {
    isLogoutDialogOpen,
    isLoggingOut,
    openLogoutDialog,
    setLogoutDialogOpen,
    logout,
  } = useCustomerLogout();
  const [showAvatarDialog, setShowAvatarDialog] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(t('File size must be less than 5MB', 'Saiz fail mestilah kurang daripada 5MB', '文件大小必须小于5MB'));
        return;
      }
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarUrl(reader.result as string);
        setShowAvatarDialog(false);
        toast.success(t('Avatar updated successfully', 'Avatar berjaya dikemas kini', '头像更新成功'));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveAvatar = () => {
    setAvatarUrl(null);
    setShowAvatarDialog(false);
    toast.success(t('Avatar removed', 'Avatar dibuang', '头像已移除'));
  };

  if (!data) {
    return <DataState isLoading={isLoading} error={error} onRetry={() => void reload()} />;
  }

  return (
    <div className="min-h-screen bg-[#eef3fb]">
      {/* Header */}
      <div className="maw-page-header sticky top-0 z-40 relative flex items-center justify-between">
        <div className="w-10" />
        <h1 className="text-base font-bold text-center absolute left-1/2 -translate-x-1/2 pointer-events-none truncate max-w-[200px]">
          {t('My Profile', 'Profil Saya', '我的资料')}
        </h1>
        {/* Language Switcher Icon */}
        <div className="relative">
          <button
            className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-[#2563eb] ring-1 ring-blue-100 shadow-sm hover:bg-blue-50 transition-colors"
            onClick={() => {
              const languages = ['en', 'bm', 'zh'];
              const currentIndex = languages.indexOf(language);
              const nextIndex = (currentIndex + 1) % languages.length;
              setLanguage(languages[nextIndex] as 'en' | 'bm' | 'zh');
            }}
          >
            <Languages className="w-5 h-5" />
          </button>
          <span className="absolute -bottom-1 -right-1 bg-[#2563eb] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            {language === 'en' ? 'EN' : language === 'bm' ? 'BM' : 'CN'}
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div className="px-5 pt-2 pb-24 space-y-3">
        {/* Profile Info Card - Compact */}
        <Card className="rounded-2xl shadow-xs border border-white/80 bg-white">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="relative shrink-0">
                {avatarUrl ? (
                  <img 
                    src={avatarUrl} 
                    alt="Avatar" 
                    className="w-12 h-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-2xl bg-[#1e3a8a] flex items-center justify-center text-white shadow-xs">
                    <User className="w-6 h-6" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <h2 className="text-base font-black text-slate-900 truncate">
                    {data.user.name}
                  </h2>
                  {data.user.contactReference && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[10px] font-bold text-slate-600 shrink-0">
                      ID: {data.user.contactReference}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 font-medium truncate">{data.user.contactRole || 'Fleet Manager'}</p>
                <p className="text-[11px] text-slate-400 truncate">{data.user.companyName}</p>
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">{t('Phone', 'Telefon', '电话')}</span>
                <span className="font-semibold text-slate-700 truncate block text-[11px]">{data.user.phone || '-'}</span>
              </div>
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">{t('Email', 'E-mel', '电子邮箱')}</span>
                <span className="font-semibold text-slate-700 truncate block text-[11px]">{data.user.email || '-'}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions List - Compact */}
        <Card className="rounded-2xl shadow-xs border border-white/80 bg-white overflow-hidden">
          <CardContent className="p-1.5 divide-y divide-slate-100">
            <button
              onClick={() => navigate('/personal-info')}
              className="flex items-center justify-between w-full px-3 py-2.5 hover:bg-slate-50 rounded-xl transition-colors text-xs"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-[#2563eb]">
                  <User className="w-3.5 h-3.5" />
                </span>
                <span className="font-bold text-slate-800">
                  {t('Personal Information', 'Maklumat Peribadi', '个人信息')}
                </span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300" />
            </button>

            <button
              onClick={() => navigate('/delivery-addresses')}
              className="flex items-center justify-between w-full px-3 py-2.5 hover:bg-slate-50 rounded-xl transition-colors text-xs"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <MapPin className="w-3.5 h-3.5" />
                </span>
                <span className="font-bold text-slate-800">
                  {t('Delivery Address', 'Alamat Penghantaran', '送货地址')}
                </span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300" />
            </button>

            <button
              onClick={() => navigate('/invoices')}
              className="flex items-center justify-between w-full px-3 py-2.5 hover:bg-slate-50 rounded-xl transition-colors text-xs"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                  <FileText className="w-3.5 h-3.5" />
                </span>
                <span className="font-bold text-slate-800">
                  {t('My Invoices', 'Invois Saya', '我的账单')}
                </span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300" />
            </button>

            <button
              onClick={() => navigate('/notification-settings')}
              className="flex items-center justify-between w-full px-3 py-2.5 hover:bg-slate-50 rounded-xl transition-colors text-xs"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                  <Bell className="w-3.5 h-3.5" />
                </span>
                <span className="font-bold text-slate-800">{t('Notification Settings', 'Tetapan Pemberitahuan', '通知设置')}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300" />
            </button>

            <button
              onClick={() => navigate('/support')}
              className="flex items-center justify-between w-full px-3 py-2.5 hover:bg-slate-50 rounded-xl transition-colors text-xs"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                  <HeadphonesIcon className="w-3.5 h-3.5" />
                </span>
                <span className="font-bold text-slate-800">
                  {t('Customer Support', 'Sokongan Pelanggan', '客户支持')}
                </span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300" />
            </button>

            <button
              type="button"
              onClick={openLogoutDialog}
              disabled={isLoggingOut}
              className="flex items-center justify-between w-full px-3 py-2.5 hover:bg-red-50 rounded-xl transition-colors text-xs"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50 text-red-600">
                  <LogOut className="w-3.5 h-3.5 text-red-600" />
                </span>
                <span className="font-bold text-red-600">{isLoggingOut ? t('Logging out...', 'Sedang log keluar...', '正在退出...') : t('Logout', 'Log Keluar', '登出')}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-red-300" />
            </button>
          </CardContent>
        </Card>
      </div>

      {/* Avatar Edit Dialog */}
      <Dialog open={showAvatarDialog} onOpenChange={setShowAvatarDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader className="border-b border-slate-200 bg-white px-5 py-4 pr-12 text-left">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#2563eb]">
                <Camera className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-slate-900">
                  {t('Change Avatar', 'Tukar Avatar', '更改头像')}
                </DialogTitle>
                <p className="mt-0.5 text-xs text-slate-500">
                  {t('Choose a clear profile photo', 'Pilih foto profil yang jelas', '选择清晰的个人头像')}
                </p>
              </div>
            </div>
          </DialogHeader>
          
          <div className="bg-slate-50 p-4">
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            {/* Current Avatar Preview */}
            <div className="flex justify-center mb-4">
              {avatarUrl ? (
                <img 
                  src={avatarUrl} 
                  alt="Current Avatar" 
                  className="w-24 h-24 rounded-full object-cover border-4 border-gray-100"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-[#2563eb] flex items-center justify-center border-4 border-gray-100">
                  <User className="w-12 h-12 text-white" />
                </div>
              )}
            </div>

            {/* Upload Button */}
            <label className="block">
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
                id="avatar-upload"
              />
              <Button
                type="button"
                onClick={() => document.getElementById('avatar-upload')?.click()}
                className="w-full bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-xl h-12 font-semibold flex items-center justify-center gap-2"
              >
                <Upload className="w-4 h-4" />
                {t('Upload Photo', 'Muat Naik Foto', '上传照片')}
              </Button>
            </label>

            {/* Remove Avatar Button */}
            {avatarUrl && (
              <Button
                onClick={handleRemoveAvatar}
                variant="outline"
                className="w-full rounded-xl h-12 font-semibold border-2 border-red-500 text-red-500 hover:bg-red-50 hover:text-red-600"
              >
                {t('Remove Avatar', 'Buang Avatar', '移除头像')}
              </Button>
            )}

            {/* Info Text */}
            <p className="text-xs text-gray-500 text-center px-4">
              {t(
                'Supported formats: JPG, PNG, GIF (Max 5MB)',
                'Format disokong: JPG, PNG, GIF (Maks 5MB)',
                '支持格式：JPG、PNG、GIF（最大5MB）'
              )}
            </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <CustomerLogoutDialog
        open={isLogoutDialogOpen}
        isLoggingOut={isLoggingOut}
        onOpenChange={setLogoutDialogOpen}
        onConfirm={logout}
      />
    </div>
  );
}
