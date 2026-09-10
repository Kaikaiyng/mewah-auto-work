import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bell, Undo2, Search, ChevronLeft, ChevronRight, CheckCheck, Wrench } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useCustomerData } from '../context/CustomerDataContext';
import { useLanguage } from '../context/LanguageContext';
import { DataState } from '../components/DataState';
import { formatDate, formatTime } from '../lib/dateTime';

export function NotificationsScreen() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { data, isLoading, error, reload, markAllNotificationsRead, markNotificationRead } = useCustomerData();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'unread' | 'correction'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 7;

  useEffect(() => { void reload(); }, []);
  if (!data) return <DataState isLoading={isLoading} error={error} onRetry={() => void reload()} />;
  if (!data.user.permissions.canViewNotifications) return <DataState isLoading={false} error="You are not authorised to view notifications" onRetry={() => navigate('/home')} />;

  const unreadCount = data.notifications.filter((item) => !item.isRead).length;

  const filteredNotifications = useMemo(() => {
    let list = data.notifications;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(n =>
        n.title.toLowerCase().includes(q) ||
        n.message.toLowerCase().includes(q)
      );
    }

    if (activeFilter === 'unread') {
      list = list.filter(n => !n.isRead);
    } else if (activeFilter === 'correction') {
      list = list.filter(n => n.type === 'status_rollback');
    }

    return list;
  }, [data.notifications, searchQuery, activeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredNotifications.length / ITEMS_PER_PAGE));
  const currentItems = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredNotifications.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredNotifications, currentPage]);

  return (
    <div className="min-h-screen bg-[#eef3fb] pb-24 max-w-md mx-auto flex flex-col">
      {/* Header */}
      <header className="maw-page-header sticky top-0 z-40 relative flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-gray-700 ring-1 ring-blue-100 shadow-sm hover:bg-blue-50 transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <div className="text-center absolute left-1/2 -translate-x-1/2 pointer-events-none truncate max-w-[180px]">
          <h1 className="text-base font-bold truncate">{t('Notifications', 'Pemberitahuan', '通知')}</h1>
          {unreadCount > 0 && (
            <p className="text-[10px] text-blue-600 font-bold">{unreadCount} {t('unread', 'belum dibaca', '条未读')}</p>
          )}
        </div>
        {unreadCount > 0 ? (
          <button
            onClick={() => void markAllNotificationsRead()}
            className="flex items-center gap-1 rounded-xl bg-blue-50 px-2.5 py-1 text-xs font-bold text-[#2563eb] hover:bg-blue-100 ring-1 ring-blue-200/60 shadow-2xs transition-colors"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            <span>{t('Read all', 'Tanda semua', '全读')}</span>
          </button>
        ) : (
          <div className="w-10" />
        )}
      </header>

      {/* Search & Filter Pills */}
      <div className="px-5 pt-2 pb-2 space-y-2">
        <div className="relative flex items-center">
          <Search className="absolute left-3 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder={t('Search notifications...', 'Cari pemberitahuan...', '搜索通知内容...')}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 text-xs placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 scrollbar-none" data-horizontal-scroll="true">
          {[
            { key: 'all', label: `${t('All', 'Semua', '全部')} (${data.notifications.length})` },
            { key: 'unread', label: `${t('Unread', 'Belum dibaca', '未读')} (${unreadCount})` },
            { key: 'correction', label: t('Corrections', 'Pembetulan', '状态修正') },
          ].map((pill) => (
            <button
              key={pill.key}
              type="button"
              onClick={() => {
                setActiveFilter(pill.key as any);
                setCurrentPage(1);
              }}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold transition-all ${
                activeFilter === pill.key
                  ? 'bg-[#2563eb] text-white shadow-2xs'
                  : 'bg-white border border-slate-200/80 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      {/* Compact Notification List */}
      <main className="px-5 space-y-2 flex-1">
        {currentItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-xs text-slate-500">
            <Bell className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="font-semibold">{t('No notifications found', 'Tiada notifikasi ditemui', '暂无相关通知')}</p>
          </div>
        ) : (
          currentItems.map((notification) => {
            const isStatusCorrection = notification.type === 'status_rollback';
            const isUnread = !notification.isRead;
            return (
              <button
                type="button"
                key={notification.id}
                onClick={async () => {
                  if (isUnread) await markNotificationRead(notification.id);
                  if (notification.actionRoute) navigate(notification.actionRoute);
                }}
                className={`flex w-full items-start justify-between rounded-xl border p-2.5 text-left transition-all ${
                  isStatusCorrection
                    ? 'border-amber-200 bg-amber-50/90 shadow-2xs'
                    : isUnread
                    ? 'border-blue-200 bg-white shadow-xs ring-1 ring-blue-400/20'
                    : 'border-slate-200/70 bg-white/90 shadow-2xs hover:bg-white'
                }`}
              >
                <div className="flex items-start gap-2.5 min-w-0 pr-2">
                  <span
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                      isStatusCorrection
                        ? 'bg-amber-100 text-amber-700'
                        : isUnread
                        ? 'bg-blue-100 text-[#2563eb]'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {isStatusCorrection ? <Undo2 className="h-3.5 w-3.5" /> : <Wrench className="h-3.5 w-3.5" />}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-xs text-slate-900 leading-tight truncate">{notification.title}</span>
                      {isStatusCorrection && (
                        <span className="rounded bg-amber-200/80 px-1 py-0.2 text-[8px] font-black uppercase text-amber-800">
                          Correction
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5 line-clamp-1">{notification.message}</p>
                    <p className="text-[10px] text-slate-400 mt-1">
                      {formatDate(notification.date)} · {formatTime(notification.date)}
                    </p>
                  </div>
                </div>

                {isUnread && (
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#2563eb] ring-2 ring-blue-100" />
                )}
              </button>
            );
          })
        )}
      </main>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-5 pt-3 pb-2">
          <span className="text-[11px] text-slate-400 font-medium">
            {filteredNotifications.length} {t('updates', 'kemas kini', '条记录')}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-xs font-bold text-slate-700 px-1">
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
