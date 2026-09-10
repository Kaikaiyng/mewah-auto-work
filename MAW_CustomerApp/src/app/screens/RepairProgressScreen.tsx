import { ArrowLeft, Calendar, Camera, Car, Phone, Wrench, PhoneCall } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useCustomerData } from '../context/CustomerDataContext';
import { useLanguage } from '../context/LanguageContext';
import { DataState } from '../components/DataState';
import { formatDate } from '../lib/dateTime';
import { workOrderLabels } from '../lib/status';
import type { WorkOrderStatus } from '../types';
import { CustomerQuotationCard } from '../components/CustomerQuotationCard';
import { apiAssetUrl, respondToQuotation } from '../lib/api';
import { MobilePhotoPreview } from '../components/MobilePhotoPreview';

const stages: WorkOrderStatus[] = [
  'scheduled',
  'checked_in',
  'inspected',
  'quotation_issued',
  'approved',
  'parts_ready',
  'under_repair',
  'ready_for_collection',
  'collected',
];

function formatTimelineDate(value: string) {
  if (!value) return { date: '', time: '' };
  const parsed = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return { date: value, time: '' };
  return {
    date: parsed.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }),
    time: parsed.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
  };
}

export function RepairProgressScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { data, isLoading, error, reload } = useCustomerData();
  const [previewPhoto, setPreviewPhoto] = useState<{ id: number; category: string; caption: string } | null>(null);
  const workOrder = data?.workOrders.find((item) => item.id === id);
  const vehicle = data?.user.vehicles.find((item) => item.id === workOrder?.vehicleId);

  if (!data) return <DataState isLoading={isLoading} error={error} onRetry={() => void reload()} />;
  if (!data.user.permissions.canViewRepairProgress) {
    return <DataState isLoading={false} error={t('You are not authorised to view repair progress', 'Anda tidak dibenarkan melihat kemajuan pembaikan', '您无权查看维修进度')} onRetry={() => navigate('/home')} />;
  }
  if (!workOrder || !vehicle) {
    return <DataState isLoading={false} error={t('Repair record not found', 'Rekod pembaikan tidak dijumpai', '未找到维修记录')} onRetry={() => navigate('/bookings')} />;
  }

  const isRescue = Boolean(
    workOrder.intakeType === 'rescue' ||
    workOrder.requestChannel?.toLowerCase().includes('rescue') ||
    workOrder.serviceType?.toLowerCase().includes('rescue') ||
    workOrder.reportedProblem?.includes('🚨') ||
    workOrder.reportedProblem?.toLowerCase().includes('rescue') ||
    workOrder.reportedProblem?.includes('救援')
  );

  const currentIndex = stages.indexOf(workOrder.status);
  const timeline = workOrder.timeline || stages.map((stage, index) => ({
    id: stage,
    label: workOrderLabels[stage],
    date: '',
    completed: index <= currentIndex,
  }));

  return (
    <div className="min-h-screen bg-[#eef3fb] pb-24 max-w-md mx-auto">
      <header className="maw-page-header sticky top-0 z-40 relative flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-gray-700 ring-1 ring-blue-100 shadow-sm hover:bg-blue-50 transition-colors"
          aria-label={t('Back', 'Kembali', '返回')}
        >
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <div className="text-center absolute left-1/2 -translate-x-1/2 pointer-events-none truncate max-w-[180px]">
          <h1 className="text-base font-bold truncate">{t('Repair Progress', 'Kemajuan Pembaikan', '维修进度')}</h1>
          <p className="text-[10px] text-gray-500 font-medium truncate">{workOrder.workOrderNumber}</p>
        </div>
        <div className="w-10" />
      </header>

      <main className="px-5 pt-4 pb-28 space-y-4">
        {isRescue ? (
          <div className="flex items-center justify-between rounded-2xl border border-red-200 bg-gradient-to-r from-red-50 to-rose-50 px-4 py-3 text-red-900 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-600 text-white shadow-xs">
                <PhoneCall className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs font-bold">{t('Emergency Rescue Order', 'Pesanan Penyelamatan Kecemasan', '紧急道路救援单')}</p>
                <p className="text-[10px] text-red-600">{t('24/7 Roadside breakdown assistance', 'Bantuan kerosakan tepi jalan 24/7', '24小时道路抛锚抢修与救援')}</p>
              </div>
            </div>
            <span className="rounded-full bg-red-600 px-2 py-0.5 text-[9px] font-black uppercase text-white shadow-xs">
              SOS
            </span>
          </div>
        ) : null}

        <Card className="rounded-2xl border-0 shadow-md">
          <CardContent className="p-5">
            <div className="flex gap-3">
              <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                <Car className="w-6 h-6 text-[#2563eb]" />
              </div>
              <div>
                <p className="font-semibold">{t('Unit Number', 'Nombor Unit', '单位编号')}: {vehicle.vecNo}</p>
                <p className="text-sm text-gray-600">{t('Registration Number', 'Nombor Pendaftaran', '注册号码')}: {vehicle.regNo}</p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t flex flex-wrap items-center justify-between gap-2">
              {workOrder.bookingId ? (
                <p className="text-xs text-gray-500">{t('Booking', 'Tempahan', '预约')}: {data.bookings.find((item) => item.id === workOrder.bookingId)?.bookingNumber || workOrder.bookingId}</p>
              ) : <div />}
              <div className="flex items-center gap-2">
                {isRescue ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700 border border-red-200">
                    <PhoneCall className="h-3 w-3" />
                    {t('Rescue', 'Penyelamatan', '救援单')}
                  </span>
                ) : null}
                <span className="inline-flex px-3 py-1 rounded-full bg-orange-100 text-orange-700 text-xs font-semibold">
                  {workOrderLabels[workOrder.status]}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {workOrder.quotation ? (
          <CustomerQuotationCard
            workOrder={workOrder}
            vehicle={vehicle}
            companyName={data.user.companyName}
            workshopSettings={data.systemSettings?.company}
            onRespond={async (action, note) => {
              await respondToQuotation(workOrder.id, action, note);
              await reload();
            }}
          />
        ) : null}

        <Card className="rounded-2xl border-0 shadow-md">
          <CardContent className="p-5">
            <h2 className="font-semibold flex items-center gap-2 mb-5"><Wrench className="w-5 h-5 text-[#2563eb]" />{t('Progress Timeline', 'Garis Masa Kemajuan', '进度时间线')}</h2>
            <div className="pl-1">
              {timeline.map((event, index) => {
                const eventDate = formatTimelineDate(event.date);
                const isLast = index === timeline.length - 1;
                const isComplete = event.completed && (workOrder.status === 'collected' || !isLast || index < timeline.findIndex((e) => !e.completed));
                const isCurrent = event.completed && (index === timeline.length - 1 || !timeline[index + 1]?.completed) && workOrder.status !== 'collected';
                return (
                  <div
                    key={event.id}
                    className={`relative grid grid-cols-[18px_minmax(0,1fr)] gap-x-3 ${isLast ? '' : 'pb-4'}`}
                  >
                    <div className="relative flex justify-center">
                      {!isLast ? (
                        <span className={`absolute left-1/2 top-[10px] bottom-[-26px] w-px -translate-x-1/2 ${event.completed ? 'bg-emerald-400' : 'bg-slate-200'}`} aria-hidden="true" />
                      ) : null}
                      <span
                        className={`relative z-[2] mt-1 flex h-4 w-4 items-center justify-center rounded-full transition-all duration-300 ${
                          isCurrent
                            ? 'border-2 border-[#2563eb] bg-[#2563eb] maw-breathe-node'
                            : event.completed
                              ? 'border-2 border-emerald-500 bg-emerald-500 text-white'
                              : 'border-2 border-slate-300 bg-white'
                        }`}
                        aria-hidden="true"
                      >
                        {isCurrent ? (
                          <span className="relative flex h-1.5 w-1.5 items-center justify-center">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-80" />
                            <span className="relative inline-flex h-1 w-1 rounded-full bg-white" />
                          </span>
                        ) : null}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className={`font-semibold leading-5 ${event.completed ? 'text-slate-700' : 'text-slate-400'}`}>{event.label}</p>
                      <p className={`mt-0.5 text-[10px] leading-4 ${event.completed ? 'text-slate-500' : 'text-slate-400'}`}>
                        {eventDate.date
                          ? `${eventDate.date} · ${eventDate.time}`
                          : event.completed
                            ? t('Time not recorded', 'Masa tidak direkodkan', '未记录时间')
                            : t('Pending', 'Belum selesai', '待处理')}
                      </p>
                      {event.description && <p className={`text-sm leading-5 mt-1 ${event.completed ? 'text-slate-500' : 'text-slate-400'}`}>{event.description}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {workOrder.photos?.length ? (
          <Card className="rounded-2xl border-0 shadow-md">
            <CardContent className="p-5">
              <h2 className="mb-4 flex items-center gap-2 font-semibold">
                <Camera className="h-5 w-5 text-[#2563eb]" />
                {t('Workshop Photos', 'Foto Bengkel', '维修照片')}
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {workOrder.photos.map((photo) => (
                  <figure key={photo.id} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                    <button
                      type="button"
                      onClick={() => setPreviewPhoto(photo)}
                      className="block w-full overflow-hidden bg-slate-100 text-left active:opacity-90"
                      aria-label={t('Enlarge workshop photo', 'Besarkan foto bengkel', '放大维修照片')}
                    >
                      <img
                        src={apiAssetUrl('work-order-photo-file', { id: photo.id })}
                        alt={photo.caption || t('Workshop repair photo', 'Foto pembaikan bengkel', '维修现场照片')}
                        loading="lazy"
                        className="aspect-square w-full object-cover"
                      />
                    </button>
                    <figcaption className="p-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-blue-700">{photo.category.replaceAll('_', ' ')}</p>
                      {photo.caption ? <p className="mt-1 text-xs text-slate-600">{photo.caption}</p> : null}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card className="rounded-2xl border-0 shadow-md">
          <CardContent className="p-5 space-y-3">
            {workOrder.checkedInAt && <p className="text-sm text-gray-700"><Calendar className="inline w-4 h-4 mr-2" />{t('Checked in', 'Daftar masuk', '入厂')}: {formatDate(workOrder.checkedInAt)}</p>}
            {workOrder.expectedCompletionAt && <p className="text-sm text-gray-700"><Calendar className="inline w-4 h-4 mr-2" />{t('Expected completion', 'Jangkaan siap', '预计完成')}: {formatDate(workOrder.expectedCompletionAt)}</p>}
            {workOrder.latestCustomerUpdate && <p className="text-sm text-gray-700 pt-3 border-t">{workOrder.latestCustomerUpdate}</p>}
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-0 shadow-md">
          <CardContent className="p-5 space-y-3">
            <h2 className="font-semibold">{t('Workshop Details', 'Butiran Bengkel', '维修中心详情')}</h2>
            {workOrder.workshopName && <p className="text-sm"><span className="text-gray-500">{t('Workshop', 'Bengkel', '维修中心')}:</span> {workOrder.workshopName}</p>}
            {workOrder.assignedAdvisor && <p className="text-sm"><span className="text-gray-500">{t('Service advisor', 'Penasihat servis', '服务顾问')}:</span> {workOrder.assignedAdvisor}</p>}
            {workOrder.reportedProblem && <div className="pt-3 border-t"><p className="text-xs text-gray-500">{t('Reported problem', 'Masalah dilaporkan', '报告的问题')}</p><p className="text-sm mt-1">{workOrder.reportedProblem}</p></div>}
            {workOrder.diagnosis && <div><p className="text-xs text-gray-500">{t('Diagnosis', 'Diagnosis', '诊断')}</p><p className="text-sm mt-1">{workOrder.diagnosis}</p></div>}
            {workOrder.customerVisibleItems?.length ? <div><p className="text-xs text-gray-500">{t('Customer-visible work', 'Kerja yang boleh dilihat pelanggan', '客户可见工作')}</p><ul className="text-sm mt-1 list-disc pl-5">{workOrder.customerVisibleItems.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
            {workOrder.estimatedTotal != null && <p className="pt-3 border-t font-semibold">{t('Current estimate', 'Anggaran semasa', '当前估价')}: RM {workOrder.estimatedTotal.toFixed(2)}</p>}
          </CardContent>
        </Card>

        {workOrder.workshopPhone && (
          <Button asChild className="w-full h-12 rounded-xl bg-[#2563eb]">
            <a href={`tel:${workOrder.workshopPhone}`}><Phone className="w-4 h-4 mr-2" />{t('Contact Workshop', 'Hubungi Bengkel', '联系维修中心')}</a>
          </Button>
        )}
      </main>
      {previewPhoto ? (
        <MobilePhotoPreview
          src={apiAssetUrl('work-order-photo-file', { id: previewPhoto.id })}
          alt={previewPhoto.caption || t('Workshop repair photo', 'Foto pembaikan bengkel', '维修现场照片')}
          category={previewPhoto.category}
          caption={previewPhoto.caption}
          onClose={() => setPreviewPhoto(null)}
        />
      ) : null}
    </div>
  );
}
