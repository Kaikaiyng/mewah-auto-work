import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import {
  Wrench,
  Package,
  ChevronRight,
  Bell,
  X,
  Calendar,
  Clock,
  MapPin,
  Languages,
  Undo2,
  Car,
  ReceiptText,
  ShoppingBag,
  UserRound,
  PhoneCall,
  MessageCircle,
  AlertTriangle,
  LifeBuoy,
  ShieldAlert,
  Phone,
  ChevronDown,
  Check,
  CheckCheck,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useCustomerData } from '../context/CustomerDataContext';
import { useBooking } from '../context/BookingContext';
import { DataState } from '../components/DataState';
import { formatDate, formatTime, isFutureBooking } from '../lib/dateTime';
import { workOrderLabels } from '../lib/status';
import { BrandLogoBadge } from '../components/BrandLogoBadge';
import { DEFAULT_SUPPORT_SETTINGS } from '../lib/api';
import { AppLaunchFlightOverlay } from '../components/AppLaunchFlightOverlay';
import { getHasPlayedLaunchAnimation } from '../lib/launchState';

export function HomeScreen() {
  const navigate = useNavigate();
  const { t, language, setLanguage } = useLanguage();
  const { data, isLoading, error, reload, markAllNotificationsRead, markNotificationRead } = useCustomerData();
  const { updateBookingData } = useBooking();
  const [showNotifications, setShowNotifications] = useState(false);
  const [isClosingNoti, setIsClosingNoti] = useState(false);
  const [showRescueDialog, setShowRescueDialog] = useState(false);
  const [isClosingRescue, setIsClosingRescue] = useState(false);
  const [selectedRescueVehicleId, setSelectedRescueVehicleId] = useState<number | 'other'>('other');
  const [isRescueVehicleMenuOpen, setIsRescueVehicleMenuOpen] = useState(false);
  const headerLogoRef = useRef<HTMLDivElement>(null);
  const [launchAnimationDone, setLaunchAnimationDone] = useState(() => getHasPlayedLaunchAnimation());

  // Drag-to-dismiss for Notifications Sheet
  const [notiDragY, setNotiDragY] = useState(0);
  const [isNotiDragging, setIsNotiDragging] = useState(false);
  const notiTouchStartYRef = useRef<number | null>(null);

  // Drag-to-dismiss for Rescue Sheet
  const [rescueDragY, setRescueDragY] = useState(0);
  const [isRescueDragging, setIsRescueDragging] = useState(false);
  const rescueTouchStartYRef = useRef<number | null>(null);

  const closeNotifications = () => {
    if (isClosingNoti) return;
    setIsClosingNoti(true);
    setTimeout(() => {
      setShowNotifications(false);
      setIsClosingNoti(false);
      setNotiDragY(0);
    }, 220);
  };

  const closeRescueDialog = () => {
    if (isClosingRescue) return;
    setIsClosingRescue(true);
    setTimeout(() => {
      setShowRescueDialog(false);
      setIsClosingRescue(false);
      setRescueDragY(0);
      setIsRescueVehicleMenuOpen(false);
    }, 220);
  };

  const handleNotiHeaderTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    notiTouchStartYRef.current = e.touches[0]?.clientY ?? null;
    setIsNotiDragging(false);
  };

  const handleNotiHeaderTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.cancelable) e.preventDefault();
    if (notiTouchStartYRef.current == null) return;
    const currentY = e.touches[0]?.clientY ?? notiTouchStartYRef.current;
    const deltaY = currentY - notiTouchStartYRef.current;
    if (deltaY > 0) {
      setIsNotiDragging(true);
      setNotiDragY(deltaY);
    }
  };

  const handleNotiHeaderTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    notiTouchStartYRef.current = null;
    setIsNotiDragging(false);
    if (notiDragY > 80) {
      closeNotifications();
    } else {
      setNotiDragY(0);
    }
  };

  const handleRescueHeaderTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    rescueTouchStartYRef.current = e.touches[0]?.clientY ?? null;
    setIsRescueDragging(false);
  };

  const handleRescueHeaderTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.cancelable) e.preventDefault();
    if (rescueTouchStartYRef.current == null) return;
    const currentY = e.touches[0]?.clientY ?? rescueTouchStartYRef.current;
    const deltaY = currentY - rescueTouchStartYRef.current;
    if (deltaY > 0) {
      setIsRescueDragging(true);
      setRescueDragY(deltaY);
    }
  };

  const handleRescueHeaderTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    rescueTouchStartYRef.current = null;
    setIsRescueDragging(false);
    if (rescueDragY > 80) {
      closeRescueDialog();
    } else {
      setRescueDragY(0);
    }
  };

  useEffect(() => {
    if (!showNotifications) {
      setNotiDragY(0);
      setIsClosingNoti(false);
    }
    if (!showRescueDialog) {
      setRescueDragY(0);
      setIsClosingRescue(false);
      setIsRescueVehicleMenuOpen(false);
    }
  }, [showNotifications, showRescueDialog]);

  useEffect(() => {
    const refreshOnFocus = () => { void reload(); };
    window.addEventListener('focus', refreshOnFocus);
    return () => window.removeEventListener('focus', refreshOnFocus);
  }, [reload]);

  useEffect(() => {
    if (!showNotifications && !showRescueDialog) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (showNotifications) closeNotifications();
        if (showRescueDialog) closeRescueDialog();
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [showNotifications, showRescueDialog]);

  const upcomingBooking = data?.bookings
    .filter((booking) => booking.orderType === 'service' && isFutureBooking(booking.serviceDate, booking.status))
    .sort((a, b) => new Date(a.serviceDate || 0).getTime() - new Date(b.serviceDate || 0).getTime())[0];
  const vehicle = data?.user.vehicles.find((item) => item.id === upcomingBooking?.vehicleId);
  const activeWorkOrder = data?.workOrders.find((order) => order.status !== 'collected');
  const repairVehicle = data?.user.vehicles.find((item) => item.id === activeWorkOrder?.vehicleId);
  const latestPartsOrder = data?.bookings.find((item) => item.orderType === 'parts');
  const dueReminder = data?.reminders.find((item) => item.status !== 'completed');
  const latestInvoiceBooking = data?.bookings.find((item) => item.invoice);

  const rescuePhone = data?.systemSettings?.support?.phone || DEFAULT_SUPPORT_SETTINGS.phone;
  const rescueWhatsapp = data?.systemSettings?.support?.whatsapp || DEFAULT_SUPPORT_SETTINGS.whatsapp;
  const rescueAddress = data?.systemSettings?.company?.address || DEFAULT_SUPPORT_SETTINGS.company?.address;
  const whatsappDigits = (rescueWhatsapp || '').replace(/\D/g, '') || (rescuePhone || '').replace(/\D/g, '') || '60123456789';

  const selectedVehicleObj = data?.user.vehicles.find((v) => v.id === selectedRescueVehicleId);
  const rescueWhatsappMessage = encodeURIComponent(
    `🚨 *${t('EMERGENCY RESCUE / BREAKDOWN REQUEST', 'PERMINTAAN BANTUAN KECEMASAN / KEROSAKAN', '紧急道路故障救援申请')}*\n` +
    `🏢 *${t('Company', 'Syarikat', '公司')}*: ${data?.user.companyName || data?.user.name || 'Customer'}\n` +
    `👤 *${t('Contact Person', 'Orang Dihubungi', '联络人')}*: ${data?.user.name || '-'} (${data?.user.phone || '-'})\n` +
    `🚛 *${t('Vehicle', 'Kenderaan', '车辆')}*: ${selectedVehicleObj ? `${selectedVehicleObj.regNo} (${selectedVehicleObj.brand} ${selectedVehicleObj.model})` : t('Fleet Vehicle', 'Kenderaan Armada', '车队车辆')}\n` +
    `📍 *${t('Status', 'Status', '状态')}*: ${t('Breakdown on road. Please assist with towing / on-site rescue.', 'Kerosakan di jalan raya. Sila bantu dengan tunda / pembaikan tapak.', '车辆发生道路故障，请求拖车/现场应急救援。')}`
  );

  const quickActions = [
    {
      icon: Wrench,
      label: t('Book Service', 'Tempah Servis', '预订服务'),
      color: 'bg-blue-500',
      path: '/booking/select-vehicle',
      allowed: data?.user.permissions.canCreateBooking ?? false
    },
    {
      icon: Package,
      label: t('Buy Parts', 'Beli Alat Ganti', '购买配件'),
      color: 'bg-green-500',
      path: '/parts',
      allowed: data?.user.permissions.canOrderParts ?? false
    }
  ];
  const availableQuickActions = quickActions.filter((action) => action.allowed);

  const notifications = data?.notifications || [];
  const unreadCount = notifications.filter(n => !n.isRead).length;
  const firstName = data?.user.name.trim().split(/\s+/)[0] || t('there', 'anda', '您好');

  const markAllAsRead = () => {
    void markAllNotificationsRead();
  };

  if (!data) {
    return <DataState isLoading={isLoading} error={error} onRetry={() => void reload()} />;
  }

  return (
    <div className="mx-auto min-h-screen max-w-md bg-transparent">
      {/* Header */}
      <header className="maw-page-header sticky top-0 z-40 grid min-h-[5rem] grid-cols-[1fr_auto_1fr] items-center px-5 py-3">
        {/* Left: Call for Rescue SOS Button */}
        <div className="flex justify-start items-center">
          <button
            type="button"
            onClick={() => setShowRescueDialog(true)}
            className="relative flex h-11 w-11 items-center justify-center rounded-full bg-rose-50 text-rose-600 shadow-sm ring-1 ring-rose-200/80 transition-all hover:bg-rose-100 active:scale-95"
            aria-label={t('Call for Rescue', 'Bantuan Kecemasan', '道路救援')}
          >
            <PhoneCall className="h-5 w-5" />
            <span className="absolute -bottom-1 -right-1 rounded-full bg-rose-600 px-1 py-0.2 text-[8px] font-black uppercase tracking-tighter text-white shadow-sm">
              SOS
            </span>
          </button>
        </div>

        {/* Center: Brand Logo */}
        <div
          data-header-logo="true"
          ref={headerLogoRef}
          className="flex justify-center items-center"
        >
          <BrandLogoBadge compact plain />
        </div>

        {/* Right: Language & Notifications */}
        <div className="flex justify-end items-center gap-3">
          {/* Language Switcher */}
          <div className="relative">
            <button
              onClick={() => {
                const languages: Array<'en' | 'bm' | 'zh'> = ['en', 'bm', 'zh'];
                const currentIndex = languages.indexOf(language);
                const nextIndex = (currentIndex + 1) % languages.length;
                setLanguage(languages[nextIndex]);
              }}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#2563eb] shadow-sm ring-1 ring-blue-100 transition-colors hover:bg-blue-50"
              aria-label={t('Change language', 'Tukar bahasa', '切换语言')}
            >
              <Languages className="h-5 w-5" />
            </button>
            <span className="absolute -bottom-1 -right-1 rounded-full bg-[#2563eb] px-1.5 py-0.5 text-[10px] font-bold text-white">
              {language === 'en' ? 'EN' : language === 'bm' ? 'BM' : 'CN'}
            </span>
          </div>

          {/* Notification Bell */}
          <div className="relative">
            <button
              onClick={() => {
                const willOpen = !showNotifications;
                setShowNotifications(willOpen);
                if (willOpen) void reload();
              }}
              className="relative flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#2563eb] shadow-sm ring-1 ring-blue-100 transition-colors hover:bg-blue-50"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white shadow-lg">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Notifications Dialog */}
      {showNotifications ? createPortal(
        <div
          data-prevent-swipe="true"
          className={`fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-950/60 p-0 sm:p-4 backdrop-blur-[2px] transition-opacity duration-200 ${
            isClosingNoti ? 'opacity-0' : 'opacity-100 animate-in fade-in'
          }`}
          onClick={closeNotifications}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="notification-dialog-title"
        >
          <div
            className="flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[2rem] sm:rounded-3xl bg-[#eef3fb] shadow-2xl"
            style={{
              transform: isClosingNoti ? 'translate3d(0, 100%, 0)' : `translate3d(0, ${notiDragY}px, 0)`,
              transition: isNotiDragging ? 'none' : 'transform 0.22s cubic-bezier(0.25, 1, 0.5, 1)',
              animation: !isClosingNoti && !isNotiDragging && notiDragY === 0 ? 'mawSlideInUp 0.28s cubic-bezier(0.25, 1, 0.5, 1)' : 'none',
              willChange: 'transform',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            {/* Top Drag Handle Bar & Clean Header */}
            <div
              className="flex shrink-0 flex-col border-b border-slate-200/80 bg-white/95 backdrop-blur-md cursor-grab active:cursor-grabbing select-none"
              onTouchStart={handleNotiHeaderTouchStart}
              onTouchMove={handleNotiHeaderTouchMove}
              onTouchEnd={handleNotiHeaderTouchEnd}
            >
              {/* Drag Handle Pill */}
              <div className="flex w-full justify-center pt-2.5 pb-1">
                <div className="h-1.5 w-11 rounded-full bg-slate-300 active:bg-slate-400 transition-colors" />
              </div>

              <div className="flex items-center justify-between px-5 pb-3.5 pt-1">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-[#2563eb] ring-1 ring-blue-100/80 shadow-sm">
                    <Bell className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 id="notification-dialog-title" className="text-base font-bold text-slate-900">
                        {t('Notifications', 'Pemberitahuan', '通知')}
                      </h2>
                      {unreadCount > 0 && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-[#2563eb]">
                          {unreadCount} {t('new', 'baru', '条未读')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 font-medium">
                      {notifications.length} {t('total updates', 'jumlah kemas kini', '条动态记录')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={markAllAsRead}
                    disabled={unreadCount === 0}
                    className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all active:scale-95 ${
                      unreadCount > 0
                        ? 'bg-blue-50 text-[#2563eb] hover:bg-blue-100 ring-1 ring-blue-200/70 shadow-sm'
                        : 'bg-slate-100/70 text-slate-400 opacity-60 cursor-default'
                    }`}
                  >
                    <CheckCheck className="h-3.5 w-3.5 shrink-0" />
                    <span>{t('Mark all as read', 'Tanda semua dibaca', '全部已读')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={closeNotifications}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200 active:scale-95"
                    aria-label={t('Close notifications', 'Tutup notifikasi', '关闭通知')}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Notification Card List on #eef3fb surface */}
            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 space-y-3">
              {notifications.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
                    <Bell className="h-7 w-7 text-slate-300" />
                  </div>
                  <p className="text-sm font-semibold text-slate-600">{t('No notifications', 'Tiada notifikasi', '暂无通知')}</p>
                  <p className="mt-1 text-xs text-slate-400">{t('New service and order updates will appear here.', 'Kemas kini servis dan pesanan akan dipaparkan di sini.', '最新服务与订单变动会在此显示。')}</p>
                </div>
              ) : (
                notifications.map((notification) => {
                  const isStatusCorrection = notification.type === 'status_rollback';
                  const isUnread = !notification.isRead;
                  return (
                    <button
                      type="button"
                      key={notification.id}
                      className={`group relative flex w-full flex-col rounded-2xl p-4 text-left transition-all active:scale-[0.99] ${
                        isStatusCorrection
                          ? 'border border-amber-200/80 bg-amber-50/90 shadow-sm'
                          : isUnread
                            ? 'border border-blue-200/80 bg-white shadow-sm ring-1 ring-blue-400/20'
                            : 'border border-slate-200/60 bg-white/90 shadow-sm hover:bg-white'
                      }`}
                      onClick={async () => {
                        if (isUnread) await markNotificationRead(notification.id);
                        setShowNotifications(false);
                        if (notification.actionRoute) navigate(notification.actionRoute);
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                              isStatusCorrection
                                ? 'bg-amber-100 text-amber-700'
                                : isUnread
                                  ? 'bg-blue-100 text-[#2563eb]'
                                  : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {isStatusCorrection ? (
                              <Undo2 className="h-4 w-4" />
                            ) : (
                              <Wrench className="h-4 w-4" />
                            )}
                          </span>
                          <div>
                            <span className="block text-sm font-bold text-slate-900 leading-tight">
                              {notification.title}
                            </span>
                            {isStatusCorrection && (
                              <span className="mt-0.5 inline-block rounded-md bg-amber-200/70 px-1.5 py-0.2 text-[9px] font-extrabold uppercase tracking-wide text-amber-800">
                                Status Correction
                              </span>
                            )}
                          </div>
                        </div>

                        {isUnread && (
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#2563eb] ring-4 ring-blue-100" />
                        )}
                      </div>

                      <p className="mt-2 text-xs leading-relaxed text-slate-600">
                        {notification.message}
                      </p>

                      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-[11px] text-slate-400">
                        <span className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          {new Date(notification.date).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                        {notification.actionRoute && (
                          <span className="flex items-center text-xs font-semibold text-[#2563eb] group-hover:translate-x-0.5 transition-transform">
                            {t('View', 'Lihat', '查看')}
                            <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>,
        document.body
      ) : null}

      {/* Call for Rescue Action Sheet / Dialog */}
      {showRescueDialog ? createPortal(
        <div
          data-prevent-swipe="true"
          className={`fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-950/60 p-0 sm:p-4 backdrop-blur-[2px] transition-opacity duration-200 ${
            isClosingRescue ? 'opacity-0' : 'opacity-100 animate-in fade-in'
          }`}
          onClick={closeRescueDialog}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="rescue-dialog-title"
        >
          <div
            className="flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[2rem] sm:rounded-3xl bg-[#eef3fb] shadow-2xl"
            style={{
              transform: isClosingRescue ? 'translate3d(0, 100%, 0)' : `translate3d(0, ${rescueDragY}px, 0)`,
              transition: isRescueDragging ? 'none' : 'transform 0.22s cubic-bezier(0.25, 1, 0.5, 1)',
              animation: !isClosingRescue && !isRescueDragging && rescueDragY === 0 ? 'mawSlideInUp 0.28s cubic-bezier(0.25, 1, 0.5, 1)' : 'none',
              willChange: 'transform',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            {/* Top Drag Handle Bar & Clean Header */}
            <div
              className="flex shrink-0 flex-col border-b border-slate-200/80 bg-white/95 backdrop-blur-md cursor-grab active:cursor-grabbing select-none"
              onTouchStart={handleRescueHeaderTouchStart}
              onTouchMove={handleRescueHeaderTouchMove}
              onTouchEnd={handleRescueHeaderTouchEnd}
            >
              {/* Drag Handle Pill */}
              <div className="flex w-full justify-center pt-2.5 pb-1">
                <div className="h-1.5 w-11 rounded-full bg-slate-300 active:bg-slate-400 transition-colors" />
              </div>

              <div className="flex items-center justify-between px-5 pb-3.5 pt-1">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-rose-200/80 shadow-sm">
                    <LifeBuoy className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 id="rescue-dialog-title" className="text-base font-bold text-slate-900">
                        {t('Call for Rescue', 'Bantuan Kecemasan', '道路故障紧急救援')}
                      </h2>
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-rose-700">
                        24/7 SOS
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-medium">
                      {t('Emergency Breakdown Assistance', 'Bantuan Kerosakan Kecemasan', '24小时应急现场抢修与拖车')}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={closeRescueDialog}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200 active:scale-95"
                  aria-label={t('Close', 'Tutup', '关闭')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Rescue Body on #eef3fb surface */}
            <div className="scrollbar-thin min-h-0 flex-1 space-y-3.5 overflow-y-auto p-4 text-slate-800">
              {/* Vehicle Selection for Rescue Card */}
              {data.user.vehicles && data.user.vehicles.length > 0 ? (
                <div className="relative z-30 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
                  <label className="mb-2 flex items-center justify-between text-xs font-bold text-slate-700">
                    <span className="flex items-center gap-1.5">
                      <Car className="h-3.5 w-3.5 text-slate-400" />
                      {t('Vehicle needing rescue', 'Kenderaan yang memerlukan bantuan', '需要救援的车辆')}
                    </span>
                    <span className="text-[10px] font-semibold text-slate-400">
                      {selectedRescueVehicleId === 'other' ? t('Unregistered', 'Tidak berdaftar', '未登记') : 'Selected'}
                    </span>
                  </label>

                  {/* Relative wrapper for trigger & floating popover */}
                  <div className="relative">
                    {/* Custom Trigger Button */}
                    <button
                      type="button"
                      onClick={() => setIsRescueVehicleMenuOpen((prev) => !prev)}
                      className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-left text-xs font-bold transition-all ${
                        isRescueVehicleMenuOpen
                          ? 'border-rose-500 bg-rose-50/40 ring-2 ring-rose-500/20'
                          : 'border-slate-200 bg-slate-50 hover:bg-slate-100/80 text-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white shadow-xs text-slate-600">
                          <Car className="h-3.5 w-3.5" />
                        </span>
                        <span className="truncate">
                          {selectedVehicleObj
                            ? `${selectedVehicleObj.regNo} ${selectedVehicleObj.vecNo ? `(${selectedVehicleObj.vecNo})` : ''} - ${selectedVehicleObj.equipment || `${selectedVehicleObj.brand} ${selectedVehicleObj.model}`}`
                            : t('Other / Unregistered Vehicle', 'Lain-lain / Kenderaan Tidak Berdaftar', '其他 / 未登记车辆')}
                        </span>
                      </div>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
                          isRescueVehicleMenuOpen ? 'rotate-180 text-rose-600' : ''
                        }`}
                      />
                    </button>

                    {/* Floating Absolute Popover (Zero Page Stretch) */}
                    {isRescueVehicleMenuOpen && (
                      <div className="absolute top-[calc(100%+6px)] left-0 right-0 z-50 space-y-1 rounded-2xl border border-slate-200/90 bg-white p-1.5 shadow-[0_16px_36px_rgba(15,23,42,0.18)] ring-1 ring-black/5 max-h-48 overflow-y-auto scrollbar-thin">
                        {data.user.vehicles.map((v) => {
                          const isSelected = selectedRescueVehicleId === v.id;
                          return (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => {
                                setSelectedRescueVehicleId(v.id);
                                setIsRescueVehicleMenuOpen(false);
                              }}
                              className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition-colors ${
                                isSelected
                                  ? 'bg-rose-50 font-bold text-rose-700'
                                  : 'hover:bg-slate-50 font-medium text-slate-700'
                              }`}
                            >
                              <div className="min-w-0 pr-2">
                                <span className="font-bold text-slate-900">{v.regNo}</span>
                                {v.vecNo && <span className="ml-1 text-[11px] text-slate-500">({v.vecNo})</span>}
                                <p className="truncate text-[10px] text-slate-400">
                                  {v.equipment || `${v.brand} ${v.model}`}
                                </p>
                              </div>
                              {isSelected && <Check className="h-4 w-4 shrink-0 text-rose-600" />}
                            </button>
                          );
                        })}

                        {/* Option: Other / Unregistered Vehicle */}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedRescueVehicleId('other');
                            setIsRescueVehicleMenuOpen(false);
                          }}
                          className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition-colors ${
                            selectedRescueVehicleId === 'other'
                              ? 'bg-rose-50 font-bold text-rose-700'
                              : 'hover:bg-slate-50 font-medium text-slate-700'
                          }`}
                        >
                          <div className="min-w-0 pr-2">
                            <span className="font-bold text-slate-900">
                              {t('Other / Unregistered Vehicle', 'Lain-lain / Kenderaan Tidak Berdaftar', '其他 / 未登记车辆')}
                            </span>
                            <p className="text-[10px] text-slate-400">
                              {t('Temporary or replacement vehicle', 'Kenderaan gantian / sementara', '临时或外雇车辆')}
                            </p>
                          </div>
                          {selectedRescueVehicleId === 'other' && <Check className="h-4 w-4 shrink-0 text-rose-600" />}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {/* Action 1: Direct Hotline Call Card */}
              <a
                href={`tel:${rescuePhone}`}
                className="group flex items-center justify-between gap-3 rounded-2xl border-2 border-rose-500 bg-white p-4 shadow-sm transition-all hover:bg-rose-50/50 hover:shadow-md active:scale-[0.99]"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-600 text-white shadow-md shadow-rose-500/25 group-hover:scale-105 transition-transform">
                    <Phone className="h-5 w-5" />
                  </span>
                  <div>
                    <span className="block text-[11px] font-extrabold uppercase tracking-wide text-rose-600">
                      {t('One-Touch Direct Call', 'Panggilan Terus Satu Sentuhan', '一键拨打救援热线')}
                    </span>
                    <span className="block font-mono text-base font-black text-slate-900 leading-snug">{rescuePhone}</span>
                  </div>
                </div>
                <span className="rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-extrabold text-white shadow-sm group-hover:bg-rose-700 transition-colors">
                  {t('Call Now', 'Panggil Sekarang', '立即拨打')}
                </span>
              </a>

              {/* Action 2: WhatsApp Live Location & Rescue Card */}
              <a
                href={`https://wa.me/${whatsappDigits}?text=${rescueWhatsappMessage}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center justify-between gap-3 rounded-2xl border border-emerald-300 bg-white p-4 shadow-sm transition-all hover:bg-emerald-50/50 hover:shadow-md active:scale-[0.99]"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md shadow-emerald-500/25 group-hover:scale-105 transition-transform">
                    <MessageCircle className="h-5 w-5" />
                  </span>
                  <div>
                    <span className="block text-[11px] font-extrabold uppercase tracking-wide text-emerald-700">
                      {t('WhatsApp Breakdown Desk', 'WhatsApp Meja Bantuan', 'WhatsApp 应急客服')}
                    </span>
                    <span className="block text-xs font-semibold text-slate-700">
                      {t('Share Live Location & Details', 'Kongsi Lokasi Langsung & Maklumat', '发送实时位置与故障详情')}
                    </span>
                  </div>
                </div>
                <span className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-extrabold text-white shadow-sm group-hover:bg-emerald-700 transition-colors">
                  WhatsApp
                </span>
              </a>

              {/* Safety Checklist Notice Card */}
              <div className="rounded-2xl border border-amber-200/80 bg-amber-50/85 p-4">
                <div className="flex items-center gap-2 text-amber-900">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                  <span className="text-xs font-extrabold">{t('Road Safety Reminder', 'Peringatan Keselamatan Jalan', '道路应急安全提示')}</span>
                </div>
                <ul className="mt-2 space-y-1.5 text-[11px] text-amber-900/90 leading-relaxed">
                  <li>• {t('Turn on hazard warning lights immediately.', 'Nyalakan lampu amaran kecemasan serta-merta.', '立即开启危险双闪灯。')}</li>
                  <li>• {t('Place reflective warning triangle 45m behind.', 'Letakkan segi tiga amaran 45m di belakang kenderaan.', '在车后45米放置反光三角警示牌。')}</li>
                  <li>• {t('Driver & passengers wait behind safe road barriers.', 'Pemandu & penumpang tunggu di belakang penghadang jalan yang selamat.', '驾驶员与随车人员请撤离至护栏外安全区域。')}</li>
                </ul>
              </div>

              {/* Workshop Base Address Card */}
              {rescueAddress ? (
                <div className="rounded-2xl border border-slate-200/60 bg-white p-3.5 text-xs text-slate-600 flex items-start gap-2.5 shadow-sm">
                  <MapPin className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="font-bold text-slate-800">{t('Workshop Dispatch Base', 'Pangkalan Bengkel', '救援调度基地')}:</span>
                    <p className="mt-0.5 text-[11px] text-slate-500 leading-relaxed">{rescueAddress}</p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>,
        document.body
      ) : null}

      <div className="flex flex-col gap-3 px-5 pt-2 pb-24">
        {/* Welcome Section - Compact High-Efficiency Card */}
        <section className="order-0 relative overflow-hidden rounded-2xl border border-white/80 bg-gradient-to-br from-white via-blue-50/70 to-sky-100/60 p-3.5 shadow-[0_4px_16px_rgba(30,58,138,0.06)]">
          <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-blue-300/20 blur-xl" />
          <div className="relative flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#1e3a8a] text-white shadow-xs">
                <UserRound className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">{t('Welcome', 'Selamat', '欢迎')}</span>
                  <span className="text-slate-400 font-light">·</span>
                  <h1 className="truncate text-sm font-black text-slate-900">{firstName}</h1>
                </div>
                <p className="truncate text-[11px] text-slate-500 font-medium">{data.user.companyName || data.user.contactRole}</p>
              </div>
            </div>
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={() => setShowNotifications(true)}
                className="shrink-0 rounded-full bg-red-50 border border-red-200/80 px-2 py-0.5 text-[10px] font-bold text-red-600 flex items-center gap-1"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                {unreadCount} {t('new', 'baru', '条新消息')}
              </button>
            ) : null}
          </div>

          {/* Quick Actions Bar */}
          {availableQuickActions.length > 0 ? (
            <div className={`relative mt-2.5 grid gap-2 ${availableQuickActions.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {availableQuickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.path}
                    type="button"
                    onClick={() => {
                      if (action.path.includes('/booking/')) {
                        updateBookingData({ returnTo: '/home' });
                      }
                      navigate(action.path, { state: { from: '/home' } });
                    }}
                    className="flex h-11 items-center gap-2.5 rounded-xl border border-white bg-white/95 px-3 py-1.5 text-left shadow-xs transition-transform active:scale-[0.98] hover:bg-white"
                  >
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${action.color} text-white shadow-2xs`}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1 text-xs font-bold text-slate-800 truncate">{action.label}</span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                  </button>
                );
              })}
            </div>
          ) : null}
        </section>

        {/* Live Workshop Strip (Active Work Order / Upcoming Booking) */}
        {activeWorkOrder && repairVehicle ? (
          <section className="order-1">
            <button
              type="button"
              onClick={() => navigate(`/repair-progress/${activeWorkOrder.id}`)}
              className="relative flex w-full items-center justify-between gap-3 overflow-hidden rounded-2xl bg-gradient-to-r from-[#173b75] via-[#1d4f91] to-[#1e5aa0] p-3 text-left text-white shadow-[0_6px_20px_rgba(29,79,145,0.2)] transition-transform active:scale-[0.99]"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
                  <Wrench className="h-4 w-4 text-white" />
                  <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-[#173b75] animate-pulse" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono text-[10px] font-bold text-blue-200">{activeWorkOrder.workOrderNumber}</span>
                    <span className="rounded-md bg-white/20 px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider text-white">
                      {workOrderLabels[activeWorkOrder.status]}
                    </span>
                  </div>
                  <p className="truncate text-xs font-bold text-white mt-0.5">
                    {repairVehicle.regNo} {repairVehicle.vecNo && repairVehicle.vecNo !== repairVehicle.regNo ? `(${repairVehicle.vecNo})` : ''} · {repairVehicle.equipment || `${repairVehicle.brand} ${repairVehicle.model}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0 rounded-xl bg-white/15 px-2.5 py-1.5 text-xs font-bold text-white">
                <span>{t('Track', 'Kesan', '跟踪')}</span>
                <ChevronRight className="h-3.5 w-3.5 text-blue-200" />
              </div>
            </button>
          </section>
        ) : upcomingBooking ? (
          <section className="order-1">
            <button
              type="button"
              onClick={() => navigate(`/booking/${upcomingBooking.id}`)}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-blue-200/80 bg-blue-50/70 p-3 text-left shadow-xs transition-transform active:scale-[0.99] hover:bg-blue-50"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#2563eb] text-white shadow-xs">
                  <Calendar className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-md bg-blue-100 px-1.5 py-0.2 text-[9px] font-bold text-[#2563eb] uppercase">
                      {t('Upcoming', 'Akan Datang', '即将到来')}
                    </span>
                    <span className="text-[11px] font-bold text-slate-700 truncate">{formatDate(upcomingBooking.serviceDate)}</span>
                  </div>
                  <p className="truncate text-xs font-bold text-slate-900 mt-0.5">
                    {upcomingBooking.serviceType || t('Workshop service', 'Servis bengkel', '车间服务')} · {vehicle?.regNo || '-'}
                  </p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
            </button>
          </section>
        ) : (
          <section className="order-1 flex items-center justify-between rounded-xl border border-slate-200/60 bg-white/80 px-3.5 py-2 text-xs text-slate-500 shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="font-semibold text-slate-700">{t('Workshop Status', 'Status Bengkel', '车间状态')}:</span>
              <span>{t('All clear · No active repairs', 'Semua selesai · Tiada pembaikan aktif', '一切就绪 · 暂无进行中的维修')}</span>
            </div>
            <button
              type="button"
              onClick={() => navigate('/fleet')}
              className="text-[11px] font-bold text-[#2563eb] hover:underline"
            >
              {t('View Fleet', 'Lihat Armada', '查看车队')}
            </button>
          </section>
        )}

        {/* Account Summary - High-Density 2x2 Grid */}
        <section className="order-2">
          <div className="mb-1.5 flex items-center justify-between px-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">{t('Account Summary', 'Ringkasan Akaun', '账户摘要')}</h2>
            <span className="text-[10px] text-slate-400 font-medium">{t('Quick Access', 'Akses Pantas', '快速直达')}</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {/* Fleet Tile */}
            <button
              type="button"
              onClick={() => navigate('/fleet')}
              className="group flex flex-col justify-between rounded-2xl border border-slate-200/70 bg-white p-3 text-left shadow-xs transition-all active:scale-[0.98] hover:border-blue-200"
            >
              <div className="flex items-center justify-between">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-[#2563eb]">
                  <Car className="h-3.5 w-3.5" />
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-blue-500 transition-colors" />
              </div>
              <div className="mt-2">
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-black text-slate-900">{data.user.vehicles.length}</span>
                  <span className="text-[10px] text-slate-400 font-medium">{t('units', 'unit', '台')}</span>
                </div>
                <p className="text-[11px] font-semibold text-slate-600 truncate">{t('Fleet Vehicles', 'Kenderaan Armada', '车队车辆')}</p>
              </div>
            </button>

            {/* Compliance & Reminders Tile */}
            <button
              type="button"
              onClick={() => navigate('/fleet?tab=compliance')}
              className="group flex flex-col justify-between rounded-2xl border border-slate-200/70 bg-white p-3 text-left shadow-xs transition-all active:scale-[0.98] hover:border-amber-200"
            >
              <div className="flex items-center justify-between">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                  <Bell className="h-3.5 w-3.5" />
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-amber-500 transition-colors" />
              </div>
              <div className="mt-2">
                <span className="truncate block text-sm font-black text-slate-900 leading-tight">
                  {dueReminder ? t('Action Due', 'Perlu Tindakan', '待处理提醒') : t('Up to Date', 'Terkini', '全部正常')}
                </span>
                <p className="text-[11px] font-semibold text-slate-600 truncate">{t('Compliance & Expiry', 'Pematuhan & Tamat', '合规与证件')}</p>
              </div>
            </button>

            {/* Parts Order Tile */}
            <button
              type="button"
              onClick={() => navigate(latestPartsOrder ? `/parts-order/${latestPartsOrder.id}` : '/parts')}
              className="group flex flex-col justify-between rounded-2xl border border-slate-200/70 bg-white p-3 text-left shadow-xs transition-all active:scale-[0.98] hover:border-emerald-200"
            >
              <div className="flex items-center justify-between">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <ShoppingBag className="h-3.5 w-3.5" />
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-emerald-500 transition-colors" />
              </div>
              <div className="mt-2">
                <span className="truncate block text-xs font-black text-slate-900 font-mono leading-tight">
                  {latestPartsOrder?.bookingNumber || t('No orders', 'Tiada pesanan', '暂无订单')}
                </span>
                <p className="text-[11px] font-semibold text-slate-600 truncate">{t('Spare Parts Orders', 'Pesanan Alat Ganti', '配件订单')}</p>
              </div>
            </button>

            {/* Invoices Tile */}
            {data.user.permissions.canViewInvoices ? (
              <button
                type="button"
                onClick={() => navigate(latestInvoiceBooking ? `/invoice/${latestInvoiceBooking.id}` : '/invoices')}
                className="group flex flex-col justify-between rounded-2xl border border-slate-200/70 bg-white p-3 text-left shadow-xs transition-all active:scale-[0.98] hover:border-violet-200"
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                    <ReceiptText className="h-3.5 w-3.5" />
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-violet-500 transition-colors" />
                </div>
                <div className="mt-2">
                  <span className="truncate block text-xs font-black text-slate-900 font-mono leading-tight">
                    {latestInvoiceBooking?.invoiceNumber || t('No invoices', 'Tiada invois', '暂无发票')}
                  </span>
                  <p className="text-[11px] font-semibold text-slate-600 truncate">{t('Billing & Invoices', 'Invois & Bil', '账单与发票')}</p>
                </div>
              </button>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
