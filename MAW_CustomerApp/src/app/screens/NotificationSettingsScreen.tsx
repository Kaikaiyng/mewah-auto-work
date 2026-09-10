import { ArrowLeft, Bell, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Card, CardContent } from '../components/ui/card';
import { DataState } from '../components/DataState';
import { useCustomerData } from '../context/CustomerDataContext';
import { useLanguage } from '../context/LanguageContext';
import type { NotificationPreferences } from '../types';

interface PreferenceItem {
  key: keyof NotificationPreferences;
  title: { en: string; ms: string; zh: string };
  desc: { en: string; ms: string; zh: string };
}

const preferenceItems: PreferenceItem[] = [
  {
    key: 'bookingUpdates',
    title: { en: 'Booking updates', ms: 'Kemas kini tempahan', zh: '预约状态更新' },
    desc: { en: 'Confirmations, cancellations and reschedules', ms: 'Pengesahan, pembatalan dan jadual semula', zh: '预约确认、取消及改期即时通知' },
  },
  {
    key: 'repairUpdates',
    title: { en: 'Repair updates', ms: 'Kemas kini pembaikan', zh: '车间维修进度' },
    desc: { en: 'Workshop progress and collection readiness', ms: 'Kemajuan bengkel dan kesediaan pengambilan', zh: '工单进度更新与完工取车提醒' },
  },
  {
    key: 'serviceReminders',
    title: { en: 'Service reminders', ms: 'Peringatan servis', zh: '定期保养提醒' },
    desc: { en: 'Maintenance dates and mileage', ms: 'Tarikh penyelenggaraan dan perbatuan', zh: '车辆保养到期与里程数提醒' },
  },
  {
    key: 'partsOrders',
    title: { en: 'Parts orders', ms: 'Pesanan alat ganti', zh: '配件订单状态' },
    desc: { en: 'Order processing and fulfilment', ms: 'Pemprosesan dan penghantaran pesanan', zh: '配件订单处理与发货物流更新' },
  },
  {
    key: 'invoiceUpdates',
    title: { en: 'Invoice updates', ms: 'Kemas kini invois', zh: '账单发票更新' },
    desc: { en: 'Issued, due and paid invoices', ms: 'Invois dikeluarkan, tertunggak dan dibayar', zh: '发票开具、待付账单及收款确认' },
  },
  {
    key: 'email',
    title: { en: 'Email delivery', ms: 'Penghantaran e-mel', zh: '邮件同步通知' },
    desc: { en: 'Also send updates by email', ms: 'Hantar juga kemas kini melalui e-mel', zh: '将重要业务通知同步发送至邮箱' },
  },
  {
    key: 'push',
    title: { en: 'Push notifications', ms: 'Pemberitahuan tolak', zh: '应用内推送' },
    desc: { en: 'Show updates in the app', ms: 'Tunjukkan kemas kini dalam aplikasi', zh: '在手机应用顶部弹出即时通知' },
  },
];

export function NotificationSettingsScreen() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { data, isLoading, error, reload, updateNotificationPreferences } = useCustomerData();
  const [togglingKey, setTogglingKey] = useState<keyof NotificationPreferences | null>(null);

  if (!data) return <DataState isLoading={isLoading} error={error} onRetry={() => void reload()} />;

  const toggle = async (key: keyof NotificationPreferences) => {
    if (togglingKey) return;
    const nextValue = !data.notificationPreferences[key];
    setTogglingKey(key);
    try {
      await updateNotificationPreferences({
        ...data.notificationPreferences,
        [key]: nextValue,
      });
      toast.success(
        t('Notification settings saved', 'Tetapan pemberitahuan disimpan', '通知偏好已保存'),
        { duration: 1800 }
      );
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : t('Failed to save settings', 'Gagal menyimpan tetapan', '保存设置失败')
      );
    } finally {
      setTogglingKey(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#eef3fb] max-w-md mx-auto">
      <header className="maw-page-header sticky top-0 z-40 relative flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-gray-700 ring-1 ring-blue-100 shadow-sm hover:bg-blue-50 transition-colors"
          aria-label={t('Back', 'Kembali', '返回')}
        >
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <h1 className="text-base font-bold text-center absolute left-1/2 -translate-x-1/2 pointer-events-none truncate max-w-[200px]">
          {t('Notification Settings', 'Tetapan Pemberitahuan', '通知设置')}
        </h1>
        <div className="w-10" />
      </header>

      <main className="px-5 pt-4 pb-28 space-y-4">
        <Card className="rounded-2xl border-0 shadow-md bg-white">
          <CardContent className="p-5">
            <div className="flex gap-3 items-center mb-5 pb-3 border-b border-slate-100">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                <Bell className="w-5 h-5 text-[#2563eb]" />
              </div>
              <div>
                <p className="font-bold text-slate-900">
                  {t('Notification preferences', 'Pilihan pemberitahuan', '通知推送偏好')}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t('Choose what updates you want to receive', 'Pilih kemas kini yang ingin anda terima', '自定义接收哪些业务消息')}
                </p>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {preferenceItems.map((item) => {
                const enabled = !!data.notificationPreferences[item.key];
                const isUpdating = togglingKey === item.key;
                const titleText = t(item.title.en, item.title.ms, item.title.zh);
                const descText = t(item.desc.en, item.desc.ms, item.desc.zh);

                return (
                  <div key={item.key} className="py-4 flex gap-3 items-center justify-between">
                    <div className="flex-1 pr-3">
                      <p className="font-semibold text-sm text-slate-900">{titleText}</p>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">{descText}</p>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-label={`Toggle ${titleText}`}
                      aria-checked={enabled}
                      disabled={isUpdating}
                      onClick={() => void toggle(item.key)}
                      className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                        enabled ? 'bg-[#2563eb]' : 'bg-slate-300'
                      } ${isUpdating ? 'opacity-60 cursor-wait' : ''}`}
                    >
                      <span
                        aria-hidden="true"
                        className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                          enabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

