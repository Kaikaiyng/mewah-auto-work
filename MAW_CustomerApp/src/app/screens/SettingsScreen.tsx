import React from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Languages, LogOut } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { useLanguage } from '../context/LanguageContext';

export function SettingsScreen() {
  const navigate = useNavigate();
  const { language, setLanguage, t } = useLanguage();

  const handleLogout = () => {
    navigate('/');
  };

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'zh' : 'en');
  };

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
          {t('Account Settings', 'Tetapan Akaun', '账户设置')}
        </h1>
        <div className="w-10" />
      </div>

      {/* Settings Menu */}
      <div className="px-5 pt-4 pb-28 space-y-4">
        {/* Language Toggle */}
        <Card className="rounded-2xl shadow-md border-0">
          <CardContent className="p-4">
            <button
              onClick={toggleLanguage}
              className="w-full flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors"
            >
              <div className="flex items-center gap-3">
                <Languages className="w-5 h-5 text-gray-600" />
                <div className="text-left">
                  <span className="text-gray-800 font-medium">{t('Language', '语言')}</span>
                  <p className="text-sm text-gray-500">
                    {language === 'en' ? 'English' : '中文'}
                  </p>
                </div>
              </div>
            </button>
          </CardContent>
        </Card>

        {/* Logout */}
        <Card className="rounded-2xl shadow-md border-0">
          <CardContent className="p-4">
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors"
            >
              <div className="flex items-center gap-3">
                <LogOut className="w-5 h-5 text-red-600" />
                <span className="text-red-600 font-medium">{t('Logout', '登出')}</span>
              </div>
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
