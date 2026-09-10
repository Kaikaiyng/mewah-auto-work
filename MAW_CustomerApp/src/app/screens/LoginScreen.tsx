import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Eye, EyeOff, Languages, LockKeyhole, Mail, MessageCircle, Phone, UserRound } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Checkbox } from '../components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { useLanguage } from '../context/LanguageContext';
import { clearCustomerAuthentication, DEFAULT_SUPPORT_SETTINGS, getSupportSettings, loginCustomer, usesLocalRecords } from '../lib/api';
import type { SupportSettings } from '../types';
import { clearWorkshopSession, loginWorkshop } from '../lib/workshop-api';
import { useCustomerData } from '../context/CustomerDataContext';
import { BrandLogoBadge, brandLogoSrc } from '../components/BrandLogoBadge';

const REMEMBER_PREFERENCE_KEY = 'maw_customer_remember_preference';
const REMEMBERED_IDENTIFIER_KEY = 'maw_customer_remembered_identifier';
import { getHasPlayedLaunchAnimation, setHasPlayedLaunchAnimation } from '../lib/launchState';

type LaunchLogoFlight = {
  left: number;
  top: number;
  width: number;
  height: number;
  translateX: number;
  translateY: number;
  scale: number;
};

function shouldRememberCustomer() {
  try {
    const val = localStorage.getItem(REMEMBER_PREFERENCE_KEY);
    return val === null ? true : val === 'true';
  } catch {
    return true;
  }
}

function getRememberedCustomerIdentifier() {
  try {
    return shouldRememberCustomer() ? localStorage.getItem(REMEMBERED_IDENTIFIER_KEY) || '' : '';
  } catch {
    return '';
  }
}

export function LoginScreen() {
  const navigate = useNavigate();
  const { language, setLanguage, t } = useLanguage();
  const { reload } = useCustomerData();
  const [identifier, setIdentifier] = useState(() =>
    getRememberedCustomerIdentifier(),
  );
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(shouldRememberCustomer);
  const [showSupportDialog, setShowSupportDialog] = useState(false);
  const [supportSettings, setSupportSettings] = useState<SupportSettings>(DEFAULT_SUPPORT_SETTINGS);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    void getSupportSettings().then(setSupportSettings);
  }, []);
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState<{ identifier?: string; password?: string }>({});
  const shouldPlayLaunchAnimation = useRef(!getHasPlayedLaunchAnimation());
  const loginLogoTargetRef = useRef<HTMLDivElement>(null);
  const [launchPhase, setLaunchPhase] = useState<'preparing' | 'moving' | 'done'>(() =>
    shouldPlayLaunchAnimation.current ? 'preparing' : 'done',
  );
  const [launchLogoFlight, setLaunchLogoFlight] = useState<LaunchLogoFlight | null>(null);

  useLayoutEffect(() => {
    if (!shouldPlayLaunchAnimation.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setHasPlayedLaunchAnimation(true);
      setLaunchPhase('done');
      return;
    }

    let moveTimer = 0;
    let finishTimer = 0;
    let measureTimer = 0;
    let cancelled = false;

    const measureAndStart = () => {
      const target = loginLogoTargetRef.current?.querySelector('img')?.getBoundingClientRect();
      if (!target || target.width < 120 || target.height < 30) {
        measureTimer = window.setTimeout(measureAndStart, 30);
        return;
      }
      const targetCenterX = target.left + target.width / 2;
      const targetCenterY = target.top + target.height / 2;
      const launchWidth = Math.min(window.innerWidth * 0.82, 340);
      const scale = launchWidth / target.width;
      if (cancelled) return;
      setLaunchLogoFlight({
        left: target.left,
        top: target.top,
        width: target.width,
        height: target.height,
        translateX: window.innerWidth / 2 - targetCenterX,
        translateY: window.innerHeight / 2 - targetCenterY,
        scale,
      });
      moveTimer = window.setTimeout(() => setLaunchPhase('moving'), 1_050);
      finishTimer = window.setTimeout(() => {
        setHasPlayedLaunchAnimation(true);
        setLaunchPhase('done');
      }, 1_990);
    };

    const firstFrame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(measureAndStart);
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(firstFrame);
      window.clearTimeout(measureTimer);
      window.clearTimeout(moveTimer);
      window.clearTimeout(finishTimer);
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const nextValidationErrors: { identifier?: string; password?: string } = {};
    if (!identifier.trim()) {
      nextValidationErrors.identifier = t(
        'Please enter your email, name or username',
        'Sila masukkan e-mel, nama atau nama pengguna anda',
        '请输入邮箱、姓名或用户名',
      );
    }
    if (!password) {
      nextValidationErrors.password = t(
        'Please enter your password',
        'Sila masukkan kata laluan anda',
        '请输入密码',
      );
    }
    setValidationErrors(nextValidationErrors);
    if (Object.keys(nextValidationErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      let destination: '/home' | '/workshop/jobs' = '/home';
      try {
        await loginCustomer(identifier, password, rememberMe);
        clearWorkshopSession();
      } catch (customerError) {
        const customerMessage = customerError instanceof Error ? customerError.message : String(customerError || '');
        if (!/invalid .*(?:email|name|password)|invalid credentials/i.test(customerMessage)) throw customerError;
        await loginWorkshop(identifier.trim(), password, rememberMe);
        clearCustomerAuthentication();
        destination = '/workshop/jobs';
      }
      if (rememberMe) {
        localStorage.setItem(REMEMBER_PREFERENCE_KEY, 'true');
        localStorage.setItem(REMEMBERED_IDENTIFIER_KEY, identifier.trim());
      } else {
        localStorage.removeItem(REMEMBER_PREFERENCE_KEY);
        localStorage.removeItem(REMEMBERED_IDENTIFIER_KEY);
      }
      if (destination === '/home') await reload();
      navigate(destination);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to sign in');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col overflow-hidden bg-[#f4f8fd] text-slate-900">
      {launchPhase !== 'done' ? (
        <div className={`maw-launch-screen fixed inset-0 z-[100] ${launchPhase === 'moving' ? 'maw-launch-screen-moving' : ''}`} aria-label="Mewah AutoWorks" aria-live="polite">
          {launchLogoFlight ? (
            <div
              className="maw-launch-logo fixed"
              data-moving={launchPhase === 'moving' ? 'true' : 'false'}
              style={{
                left: launchLogoFlight.left,
                top: launchLogoFlight.top,
                width: launchLogoFlight.width,
                height: launchLogoFlight.height,
                '--maw-launch-x': `${launchLogoFlight.translateX}px`,
                '--maw-launch-y': `${launchLogoFlight.translateY}px`,
                '--maw-launch-scale': launchLogoFlight.scale,
              } as React.CSSProperties}
            >
              <img src={brandLogoSrc} alt="Mewah AutoWorks" className="block h-full w-full object-contain" />
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center px-6">
              <img
                src={brandLogoSrc}
                alt="Mewah AutoWorks"
                className="block h-auto object-contain"
                style={{ width: Math.min(typeof window !== 'undefined' ? window.innerWidth * 0.82 : 320, 340) }}
              />
            </div>
          )}
        </div>
      ) : null}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_86%_10%,rgba(96,165,250,0.14),transparent_30%),radial-gradient(circle_at_8%_70%,rgba(14,165,233,0.10),transparent_34%),linear-gradient(180deg,#f8fbff_0%,#eef4fb_100%)]" />
      <div className="maw-login-orb pointer-events-none absolute -right-16 top-16 h-44 w-44 rounded-full bg-blue-200/20 blur-2xl" />
      <div className="maw-login-orb pointer-events-none absolute -left-20 bottom-20 h-48 w-48 rounded-full bg-sky-200/20 blur-2xl [animation-delay:-3s]" />

      <div className="relative z-10 px-6 pt-5">
        <div className="flex justify-end">
          <div className="relative">
            <button
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/80 bg-white/90 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-white"
              onClick={() => {
                const languages = ['en', 'bm', 'zh'];
                const currentIndex = languages.indexOf(language);
                setLanguage(languages[(currentIndex + 1) % languages.length] as 'en' | 'bm' | 'zh');
              }}
              aria-label={t('Change language', 'Tukar bahasa', '切换语言')}
            >
              <Languages className="h-4 w-4 text-[#2563eb]" />
            </button>
            <span className="absolute -bottom-1 -right-1 rounded-full bg-[#2583f8] px-1.5 py-0.5 text-[9px] font-bold text-white shadow-sm">
              {language === 'en' ? 'EN' : language === 'bm' ? 'BM' : 'CN'}
            </span>
          </div>
        </div>

        <div className={`${shouldPlayLaunchAnimation.current ? '' : 'maw-login-enter-up'} mt-5 flex flex-col items-center text-center`}>
          <div ref={loginLogoTargetRef} className={launchPhase === 'done' ? 'opacity-100' : 'opacity-0'}>
            <BrandLogoBadge
              plain
              className="bg-transparent p-0 [&_img]:!h-auto [&_img]:!w-[190px]"
            />
          </div>
          <h1 className="mt-5 text-[1.65rem] font-black tracking-[-0.025em] text-slate-950">
            {t('Welcome Back', 'Selamat Kembali', '欢迎回来')}
          </h1>
        </div>
      </div>

      <section className="maw-login-enter-up relative z-10 mx-6 mb-5 mt-7 [animation-delay:100ms]">
        <form onSubmit={handleLogin} className="space-y-3">
          <div>
            <Label htmlFor="identifier" className="sr-only">
              {t('Email, Name or Username', 'E-mel, Nama atau Nama Pengguna', '邮箱、姓名或用户名')}
            </Label>
            <div className="relative">
              <UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="identifier"
                type="text"
                autoComplete="username"
                placeholder={t('Enter email, name or username', 'Masukkan e-mel, nama atau nama pengguna', '输入邮箱、姓名或用户名')}
                value={identifier}
                onChange={(e) => {
                  setIdentifier(e.target.value);
                  if (validationErrors.identifier) setValidationErrors((current) => ({ ...current, identifier: undefined }));
                }}
                aria-invalid={Boolean(validationErrors.identifier)}
                aria-describedby={validationErrors.identifier ? 'identifier-error' : undefined}
                className={`h-12 rounded-xl bg-white pl-10 text-sm shadow-[0_3px_12px_rgba(15,23,42,0.05)] ${validationErrors.identifier ? 'border-red-300 focus-visible:border-red-400 focus-visible:ring-red-100' : 'border-slate-200 focus-visible:border-blue-300 focus-visible:ring-blue-100'}`}
              />
            </div>
            {validationErrors.identifier ? (
              <p id="identifier-error" className="mt-1.5 text-xs text-red-500" role="alert">
                {validationErrors.identifier}
              </p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="password" className="sr-only">
              {t('Password', 'Kata Laluan', '密码')}
            </Label>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (validationErrors.password) setValidationErrors((current) => ({ ...current, password: undefined }));
                }}
                aria-invalid={Boolean(validationErrors.password)}
                aria-describedby={validationErrors.password ? 'password-error' : undefined}
                className={`h-12 rounded-xl bg-white pl-10 pr-10 text-sm shadow-[0_3px_12px_rgba(15,23,42,0.05)] ${validationErrors.password ? 'border-red-300 focus-visible:border-red-400 focus-visible:ring-red-100' : 'border-slate-200 focus-visible:border-blue-300 focus-visible:ring-blue-100'}`}
              />
              <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-2.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white hover:text-slate-600" aria-label={showPassword ? t('Hide password', 'Sembunyikan kata laluan', '隐藏密码') : t('Show password', 'Tunjukkan kata laluan', '显示密码')}>
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {validationErrors.password ? (
              <p id="password-error" className="mt-1.5 text-xs text-red-500" role="alert">
                {validationErrors.password}
              </p>
            ) : null}
          </div>

          <div className="flex items-center gap-2 px-0.5 pt-1">
            <Checkbox
              id="remember-customer"
              checked={rememberMe}
              onCheckedChange={(checked) => setRememberMe(checked === true)}
            />
            <Label htmlFor="remember-customer" className="cursor-pointer text-sm font-normal text-gray-700">
              {t('Remember me', 'Ingat saya', '记住我')}
            </Label>
          </div>

          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600" role="alert">{error}</div>}

          <Button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 h-12 w-full rounded-xl bg-gradient-to-r from-[#168ec6] to-[#2563eb] text-sm font-bold text-white shadow-[0_10px_24px_rgba(37,99,235,0.22)] transition-all hover:-translate-y-0.5 hover:from-[#107caf] hover:to-[#1d4ed8]"
          >
            {isSubmitting ? t('Signing in...', 'Sedang log masuk...', '正在登录...') : t('Login', 'Log Masuk', '登录')}
          </Button>
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={(e) => { e.preventDefault(); setShowSupportDialog(true); }}
            className="h-11 w-full cursor-pointer rounded-xl border border-slate-200 bg-white text-xs font-semibold text-[#2563eb] shadow-[0_3px_12px_rgba(15,23,42,0.04)] transition-all hover:-translate-y-0.5 hover:border-blue-200"
          >
            {t('Contact Support', 'Hubungi Sokongan', '联系客服')}
          </button>
        </div>
      </section>

      {/* Support Dialog */}
      <Dialog open={showSupportDialog} onOpenChange={setShowSupportDialog}>
        <DialogContent className="max-w-xs">
          <DialogHeader className="border-b border-slate-200 bg-white px-5 py-4 pr-12 text-left">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#2563eb]">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-slate-900">
                  {t('Contact Support', 'Hubungi Sokongan', '联系客服')}
                </DialogTitle>
                <p className="mt-0.5 text-xs text-slate-500">
                  {t('Choose the easiest way to reach us', 'Pilih cara paling mudah untuk menghubungi kami', '选择最方便的联系方法')}
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-2 bg-slate-50 p-4">
            <a
              href={`tel:${supportSettings.phone || '+60 00-000 0000'}`}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-all hover:border-[#2563eb] hover:bg-blue-50"
            >
              <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <Phone className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-800 text-sm">
                  {t('Call Support', 'Hubungi Sokongan', '电话支持')}
                </p>
                <p className="text-xs text-gray-500">{supportSettings.phone || '+60 00-000 0000'}</p>
              </div>
            </a>

            <a
              href={`https://wa.me/${(supportSettings.whatsapp || '').replace(/\D/g, '') || (supportSettings.phone || '').replace(/\D/g, '') || '60123456789'}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-all hover:border-[#2563eb] hover:bg-blue-50"
            >
              <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <MessageCircle className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-800 text-sm">
                  {t('WhatsApp Support', 'WhatsApp Sokongan', 'WhatsApp支持')}
                </p>
                <p className="text-xs text-gray-500">
                  {t('Chat with us', 'Sembang dengan kami', '与我们聊天')}
                </p>
              </div>
            </a>

            <a
              href={`mailto:${supportSettings.email || 'contact@example.com'}`}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-all hover:border-[#2563eb] hover:bg-blue-50"
            >
              <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                <Mail className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-800 text-sm">
                  {t('Email Support', 'E-mel Sokongan', '电子邮件支持')}
                </p>
                <p className="text-xs text-gray-500">{supportSettings.email || 'contact@example.com'}</p>
              </div>
            </a>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
