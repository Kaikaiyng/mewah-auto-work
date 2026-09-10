import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type TouchEvent } from 'react';
import { createPortal } from 'react-dom';
import { Navigate, useNavigate } from 'react-router';
import { AlertTriangle, ArrowUp, Camera, Check, ChevronDown, ChevronUp, Languages, LogOut, Package, PackagePlus, Plus, RefreshCw, Save, Search, Trash2, Undo2, Upload, Wrench, X } from 'lucide-react';
import { toast } from 'sonner';
import { Capacitor } from '@capacitor/core';
import { Camera as NativeCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import {
  clearWorkshopSession,
  assignWorkshopTechnician,
  getWorkshopUser,
  hasWorkshopSession,
  loadWorkshopJobs,
  loadWorkshopPartsCatalog,
  loadWorkOrderPartRequirements,
  saveWorkOrderPartRequirements,
  uploadWorkshopPhoto,
  workshopPhotoUrl,
  type WorkshopJob,
  type WorkshopNotification,
  type WorkshopPartItem,
  type WorkshopTeamMember,
  type WorkOrderPartRequirementItem,
  type WorkOrderPartsOverview,
} from '../lib/workshop-api';
import { MobilePhotoPreview } from '../components/MobilePhotoPreview';
import { BrandLogoBadge, brandLogoSrc } from '../components/BrandLogoBadge';
import { AppLaunchFlightOverlay } from '../components/AppLaunchFlightOverlay';
import { getHasPlayedLaunchAnimation } from '../lib/launchState';
import { CustomerLogoutDialog } from '../components/CustomerLogoutDialog';
import { useLanguage } from '../context/LanguageContext';
import { MobileSelect } from '../components/ui/mobile-select';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '../components/ui/drawer';

type Translate = (en: string, bm?: string, zh?: string) => string;
type WorkshopFilterOption = { value: string; label: string };

function WorkshopFilterMenu({
  value,
  options,
  open,
  onToggle,
  onChange,
  closeLabel,
}: {
  value: string;
  options: WorkshopFilterOption[];
  open: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
  closeLabel: string;
}) {
  const selectedLabel = options.find((option) => option.value === value)?.label || options[0]?.label || '';
  return (
    <div className="relative min-w-0 flex-1">
      <button type="button" onClick={onToggle} className="flex h-10 w-full items-center justify-between gap-2 rounded-full border border-blue-100 bg-white px-4 text-left shadow-sm active:bg-blue-50" aria-expanded={open}>
        <span className="min-w-0 truncate text-xs font-semibold text-slate-700">{selectedLabel}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[#2563eb] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <>
          <button type="button" className="fixed inset-0 z-20 cursor-default" onClick={onToggle} aria-label={closeLabel} />
          <div className="maw-expand-popover absolute left-0 right-0 top-[calc(100%+0.5rem)] z-30 max-h-64 overflow-y-auto rounded-2xl border border-blue-100 bg-white p-1.5 shadow-[0_16px_40px_rgba(30,58,138,0.18)]">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onChange(option.value)}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition-colors ${option.value === value ? 'bg-blue-50 text-[#2563eb]' : 'text-slate-600 active:bg-slate-50'}`}
              >
                <span className="truncate">{option.label}</span>
                {option.value === value ? <Check className="h-4 w-4 shrink-0" /> : null}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

const categories = [
  ['check_in', 'Check-in', 'Daftar masuk', '入厂'],
  ['inspection', 'Inspection', 'Pemeriksaan', '检查'],
  ['repair', 'Repair', 'Pembaikan', '维修'],
  ['parts', 'Parts', 'Alat ganti', '配件'],
  ['completion', 'Completion', 'Siap', '完成'],
] as const;

function workshopCategoryLabel(value: string, t: Translate) {
  const match = categories.find(([categoryValue]) => categoryValue === value);
  return match ? t(match[1], match[2], match[3]) : value.replaceAll('_', ' ');
}

const progressStages = [
  { en: 'Checked In', bm: 'Daftar Masuk', zh: '已入厂', timestamp: 'checkinAt' },
  { en: 'Inspection', bm: 'Pemeriksaan', zh: '检查', timestamp: 'inspectedAt' },
  { en: 'Repair Approved', bm: 'Pembaikan Diluluskan', zh: '维修已批准', timestamp: 'approvedAt' },
  { en: 'Parts Ready', bm: 'Alat Ganti Sedia', zh: '配件已齐', timestamp: 'partsReadyAt' },
  { en: 'Under Repair', bm: 'Dalam Pembaikan', zh: '维修中', timestamp: 'underRepairAt' },
  { en: 'Ready for Collection', bm: 'Sedia Diambil', zh: '可以取车', timestamp: 'completedAt' },
] as const satisfies ReadonlyArray<{ en: string; bm: string; zh: string; timestamp: keyof WorkshopJob }>;

const statusProgressIndex: Record<string, number> = {
  scheduled: -1,
  checked_in: 0,
  inspected: 1,
  quotation_issued: 1,
  approved: 2,
  parts_ready: 3,
  under_repair: 4,
  ready_for_collection: 5,
  collected: 5,
};

function workshopStatusLabel(status: string, t: Translate) {
  const labels: Record<string, string> = {
    scheduled: t('Scheduled', 'Dijadualkan', '已预约'),
    checked_in: t('Checked In', 'Daftar Masuk', '已入厂'),
    inspected: t('Inspection Complete', 'Pemeriksaan Selesai', '检查完成'),
    quotation_issued: t('Awaiting Approval', 'Menunggu Kelulusan', '等待批准'),
    approved: t('Repair Approved', 'Pembaikan Diluluskan', '维修已批准'),
    parts_ready: t('Parts Ready', 'Alat Ganti Sedia', '配件已齐'),
    under_repair: t('Under Repair', 'Dalam Pembaikan', '维修中'),
    ready_for_collection: t('Ready for Collection', 'Sedia Diambil', '可以取车'),
    collected: t('Collected', 'Telah Diambil', '已取车'),
  };
  return labels[status] || status.replaceAll('_', ' ');
}

function workshopPriorityLabel(priority: string, t: Translate) {
  const labels: Record<string, string> = {
    Normal: t('Normal', 'Biasa', '普通'),
    High: t('High', 'Tinggi', '高'),
    Urgent: t('Urgent', 'Segera', '紧急'),
  };
  return labels[priority] || labels.Normal;
}

function workshopPriorityStyle(priority: string) {
  const styles: Record<string, { badge: string; card: string }> = {
    Normal: { badge: 'border-blue-100 bg-blue-50 text-blue-600', card: 'maw-workshop-priority-normal' },
    High: { badge: 'border-orange-200 bg-orange-50 text-orange-700', card: 'maw-workshop-priority-high' },
    Urgent: { badge: 'border-red-200 bg-red-50 text-red-700', card: 'maw-workshop-priority-urgent' },
  };
  return styles[priority] || styles.Normal;
}

function formatProgressTime(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('en-MY', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function RepairProgress({ job, t, id }: { job: WorkshopJob; t: Translate; id?: string }) {
  const currentIndex = statusProgressIndex[job.status] ?? -1;

  return (
    <section id={id} className="mb-5 scroll-mt-28 rounded-2xl border border-blue-100 bg-blue-50/45 p-4" aria-label={t('Repair progress', 'Kemajuan pembaikan', '维修进度')}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-slate-800">{t('Repair Progress', 'Kemajuan Pembaikan', '维修进度')}</h3>
        <span className="rounded-full border border-blue-100 bg-white px-2.5 py-1 text-[10px] font-bold uppercase text-[#2563eb]">{workshopStatusLabel(job.status, t)}</span>
      </div>
      <ol>
        {progressStages.map((stage, index) => {
          const timestamp = formatProgressTime(job[stage.timestamp] as string | null);
          const isCurrent = index === currentIndex;
          const isComplete = index < currentIndex || job.status === 'collected';
          return (
            <li key={stage.en} className="relative flex min-h-14 gap-3 last:min-h-0">
              {index < progressStages.length - 1 ? <span className={`absolute left-[11px] top-6 h-[calc(100%-0.25rem)] w-0.5 ${index < currentIndex ? 'bg-emerald-400' : 'bg-slate-200'}`} aria-hidden="true" /> : null}
              <span
                className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-all duration-300 ${
                  isComplete
                    ? 'border-2 border-emerald-500 bg-emerald-500 text-white shadow-xs'
                    : isCurrent
                      ? 'border-2 border-[#2563eb] bg-[#2563eb] text-white maw-breathe-node'
                      : 'border-2 border-slate-300 bg-white text-transparent'
                }`}
              >
                {isComplete ? (
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                ) : isCurrent ? (
                  <span className="relative flex h-2 w-2 items-center justify-center">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white shadow-xs" />
                  </span>
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                )}
              </span>
              <div className="min-w-0 pb-4">
                <p className={`text-sm font-semibold ${isCurrent ? 'text-blue-700' : isComplete ? 'text-slate-800' : 'text-slate-400'}`}>{t(stage.en, stage.bm, stage.zh)}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">{timestamp || (isCurrent ? t('In progress', 'Sedang berjalan', '进行中') : isComplete ? t('Completed', 'Selesai', '已完成') : t('Pending', 'Belum selesai', '待处理'))}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function MobilePartPickerDrawer({
  catalog,
  open,
  onOpenChange,
  onSelect,
  t,
}: {
  catalog: WorkshopPartItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (part: { itemCode: string; description: string; stock: number }) => void;
  t: Translate;
}) {
  const [query, setQuery] = useState('');
  const [isClosing, setIsClosing] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchStartYRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const deferredQuery = useDeferredValue(query.trim());
  const normalizedQuery = deferredQuery.toLocaleLowerCase();
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);

  useEffect(() => {
    if (open) {
      setIsClosing(false);
      setDragY(0);
      setQuery('');
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const closeDrawer = () => {
    setIsClosing(true);
    setTimeout(() => {
      onOpenChange(false);
      setIsClosing(false);
      setDragY(0);
    }, 200);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    touchStartYRef.current = e.touches[0]?.clientY ?? null;
    setIsDragging(false);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.cancelable) e.preventDefault();
    if (touchStartYRef.current == null) return;
    const currentY = e.touches[0]?.clientY ?? touchStartYRef.current;
    const deltaY = currentY - touchStartYRef.current;
    if (deltaY > 0) {
      setIsDragging(true);
      setDragY(deltaY);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    touchStartYRef.current = null;
    setIsDragging(false);
    if (dragY > 80) {
      closeDrawer();
    } else {
      setDragY(0);
    }
  };

  const filteredParts = catalog
    .filter((p) => {
      if (tokens.length === 0) return true;
      const skuLower = (p.sku || '').toLocaleLowerCase();
      const nameLower = (p.name || '').toLocaleLowerCase();
      return tokens.every((token) => skuLower.includes(token) || nameLower.includes(token));
    })
    .sort((a, b) => {
      const stockA = Number(a.stock) || 0;
      const stockB = Number(b.stock) || 0;
      if (stockB !== stockA) return stockB - stockA;
      return (a.name || '').localeCompare(b.name || '');
    });

  const handleSelect = (part: WorkshopPartItem) => {
    onSelect({
      itemCode: part.sku,
      description: part.name,
      stock: part.stock ?? 0,
    });
    closeDrawer();
  };

  const handleCustomSelect = () => {
    if (!deferredQuery) return;
    onSelect({
      itemCode: deferredQuery,
      description: deferredQuery,
      stock: 0,
    });
    closeDrawer();
  };

  if (!open) return null;

  return createPortal(
    <div
      data-prevent-swipe="true"
      className={`fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-[2px] transition-opacity duration-200 ${
        isClosing ? 'opacity-0' : 'opacity-100 animate-in fade-in'
      }`}
      onClick={closeDrawer}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl"
        style={{
          transform: isClosing ? 'translate3d(0, 100%, 0)' : `translate3d(0, ${dragY}px, 0)`,
          transition: isDragging ? 'none' : 'transform 0.22s cubic-bezier(0.25, 1, 0.5, 1)',
          animation: !isClosing && !isDragging && dragY === 0 ? 'mawSlideInUp 0.28s cubic-bezier(0.25, 1, 0.5, 1)' : 'none',
          willChange: 'transform',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Drag Handle & Header */}
        <div
          className="flex shrink-0 flex-col border-b border-slate-100 bg-white px-5 pt-3 pb-3.5 cursor-grab active:cursor-grabbing select-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Drag Handle Pill */}
          <div className="flex w-full justify-center pt-1 pb-2">
            <div className="h-1.5 w-11 rounded-full bg-slate-300 active:bg-slate-400 transition-colors" />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-[#2563eb] ring-1 ring-blue-100">
                <Package className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {t('Select Spare Part', 'Pilih Alat Ganti', '选择配件')}
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  {t('Search from inventory', 'Cari dari inventori', '从零件库搜索配件')} ({catalog.length})
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={closeDrawer}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-95"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-2.5">
          <div className="flex h-11 items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 shadow-inner focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/15">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              inputMode="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('Search code or description…', 'Cari kod atau nama…', '搜索零件编号或名称…')}
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
            />
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
                className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:bg-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>

        {/* Parts List */}
        <div className="scrollbar-thin max-h-[55vh] overflow-y-auto bg-slate-50/50 p-4 space-y-2 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {filteredParts.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              <p>{t('No matching parts found in inventory.', 'Tiada alat ganti sepadan dalam inventori.', '零件库中未找到匹配项。')}</p>
              {deferredQuery ? (
                <button
                  type="button"
                  onClick={handleCustomSelect}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-[#2563eb] shadow-sm active:bg-blue-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t(`Use custom: "${deferredQuery}"`, `Gunakan tersuai: "${deferredQuery}"`, `使用自定义: "${deferredQuery}"`)}
                </button>
              ) : null}
            </div>
          ) : (
            filteredParts.map((part) => {
              const inStock = (part.stock ?? 0) > 0;
              return (
                <button
                  key={part.sku}
                  type="button"
                  onClick={() => handleSelect(part)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-xs transition-all hover:border-blue-400 active:bg-blue-50/60"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-900">{part.name}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                        {part.sku}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                          inStock ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {inStock ? t(`In Stock (${part.stock})`, `Ada Stok (${part.stock})`, `现货 (${part.stock})`) : t('Out of Stock', 'Tiada Stok', '暂无现货')}
                      </span>
                    </div>
                  </div>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-[#2563eb]">
                    <Plus className="h-4 w-4" />
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function WorkshopPartsSection({
  workOrderId,
  catalog,
  canManage,
  t,
  onUpdated,
}: {
  workOrderId: number;
  catalog: WorkshopPartItem[];
  canManage: boolean;
  t: Translate;
  onUpdated?: () => void;
}) {
  const [items, setItems] = useState<WorkOrderPartRequirementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [overviewStatus, setOverviewStatus] = useState<'parts_ready' | 'pending_parts' | 'not_required'>('not_required');
  const [shortageCount, setShortageCount] = useState(0);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmingPart, setConfirmingPart] = useState<{
    itemCode: string;
    description: string;
    stock: number;
    quantity: number;
  } | null>(null);
  const [removingPart, setRemovingPart] = useState<{
    index: number;
    name: string;
    sku?: string;
  } | null>(null);

  const executeConfirmRemovePart = async () => {
    if (!removingPart) return;
    const next = items.filter((_, i) => i !== removingPart.index);
    setRemovingPart(null);
    await autoPersist(next);
    toast.success(t('Part removed from work order', 'Alat ganti dikeluarkan dari pesanan kerja', '已从工单中移除配件'));
  };

  const localCatalog = useMemo(() => {
    return catalog;
  }, [catalog]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const overview = await loadWorkOrderPartRequirements(workOrderId);
      setItems(overview.requirements);
      setOverviewStatus(overview.status);
      setShortageCount(overview.shortageCount);
    } catch {
      // Handled silently
    } finally {
      setLoading(false);
    }
  }, [workOrderId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const autoPersist = async (nextItems: WorkOrderPartRequirementItem[]) => {
    setItems(nextItems);
    try {
      setSaving(true);
      const validItems = nextItems.filter((i) => (i.itemCode || '').trim() || (i.description || '').trim());
      const payload = validItems.map((item) => ({
        code: item.itemCode,
        itemCode: item.itemCode,
        description: item.description || item.itemCode,
        quantity: Math.max(1, Number(item.quantity) || 1),
      }));
      await saveWorkOrderPartRequirements(workOrderId, payload);
      const updatedOverview = await loadWorkOrderPartRequirements(workOrderId);
      setOverviewStatus(updatedOverview.status);
      setShortageCount(updatedOverview.shortageCount);
      setItems(updatedOverview.requirements);
      onUpdated?.();
    } catch {
      // Error handled silently
    } finally {
      setSaving(false);
    }
  };

  const handlePickPart = (selected: { itemCode: string; description: string; stock: number }) => {
    const existingItem = editingIndex !== null ? items[editingIndex] : items.find((i) => (i.itemCode || '').trim().toUpperCase() === selected.itemCode.trim().toUpperCase());
    const initialQty = existingItem?.quantity ? Number(existingItem.quantity) : 1;
    setConfirmingPart({
      itemCode: selected.itemCode,
      description: selected.description,
      stock: selected.stock,
      quantity: Math.max(1, initialQty),
    });
  };

  const executeConfirmAddPart = async () => {
    if (!confirmingPart) return;
    const { itemCode, description, stock, quantity } = confirmingPart;
    if (editingIndex !== null && editingIndex >= 0 && editingIndex < items.length) {
      // Update existing
      const next = [...items];
      const target = { ...next[editingIndex] };
      target.itemCode = itemCode;
      target.description = description;
      target.stock = stock;
      target.quantity = quantity;
      target.shortage = Math.max(0, quantity - stock);
      next[editingIndex] = target;
      await autoPersist(next);
      toast.success(t('Part requirement updated', 'Keperluan alat ganti dikemas kini', '已更新配件需求'));
    } else {
      // Add new or update quantity
      const existingIdx = items.findIndex(
        (i) => (i.itemCode || '').trim().toUpperCase() === itemCode.trim().toUpperCase()
      );
      let next: WorkOrderPartRequirementItem[];
      if (existingIdx >= 0) {
        next = [...items];
        const target = { ...next[existingIdx] };
        target.quantity = quantity;
        target.shortage = Math.max(0, quantity - (target.stock ?? stock));
        next[existingIdx] = target;
      } else {
        const newItem: WorkOrderPartRequirementItem = {
          itemCode,
          description,
          quantity,
          stock,
          shortage: Math.max(0, quantity - stock),
        };
        next = [...items, newItem];
      }
      await autoPersist(next);
      toast.success(t('Part added to work order', 'Alat ganti ditambah ke pesanan kerja', '已成功添加配件到工单'));
    }
    setConfirmingPart(null);
    setEditingIndex(null);
  };

  const handleQtyChange = (index: number, delta: number) => {
    const next = [...items];
    const target = { ...next[index] };
    const currentQty = Number(target.quantity) || 1;
    const newQty = Math.max(1, currentQty + delta);
    target.quantity = newQty;
    target.shortage = Math.max(0, newQty - (target.stock ?? 0));
    next[index] = target;
    void autoPersist(next);
  };

  const handleRemove = (index: number) => {
    const next = items.filter((_, i) => i !== index);
    void autoPersist(next);
  };

  return (
    <div className="mb-5 rounded-2xl border border-blue-100 bg-[#f8fbff] p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <Package className="h-4 w-4 text-[#2563eb]" />
          {t('Required Spare Parts', 'Alat Ganti Diperlukan', '所需配件清单')}
          {items.length > 0 ? (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
              {items.length}
            </span>
          ) : null}
        </h3>
        {overviewStatus === 'parts_ready' && items.length > 0 ? (
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-800">
            {t('🟢 Ready in Stock', '🟢 Stok Sedia', '🟢 现货充足')}
          </span>
        ) : overviewStatus === 'pending_parts' || shortageCount > 0 ? (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-800">
            {t(`🟡 Shortage (${shortageCount})`, `🟡 Kurang (${shortageCount})`, `🟡 缺货 (${shortageCount} 件)`)}
          </span>
        ) : null}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4 text-xs text-slate-400">
          <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin text-blue-600" />
          {t('Loading parts…', 'Memuatkan alat ganti…', '加载配件中…')}
        </div>
      ) : (
        <div className="space-y-3">
          {items.length === 0 ? (
            <p className="rounded-xl border border-dashed border-blue-100 bg-white/70 p-3.5 text-center text-xs text-slate-500">
              {t('No extra parts requested for this repair yet.', 'Belum ada alat ganti tambahan diminta.', '目前未添加额外配件。')}
            </p>
          ) : (
            <div className="space-y-2">
              {items.map((item, idx) => {
                const stock = item.stock ?? 0;
                const qty = item.quantity ?? 1;
                const hasShortage = stock < qty;
                return (
                  <div key={idx} className="rounded-xl border border-blue-100 bg-white p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-900">{item.description || item.itemCode}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          {item.itemCode ? (
                            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                              {item.itemCode}
                            </span>
                          ) : null}
                          {stock > 0 ? (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                                hasShortage ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {t(`Stock: ${stock}`, `Stok: ${stock}`, `现货: ${stock}`)}
                            </span>
                          ) : (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[9px] font-bold text-red-700">
                              {t('Out of Stock', 'Tiada Stok', '暂无现货')}
                            </span>
                          )}
                        </div>
                      </div>

                      {canManage ? (
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Quantity Stepper */}
                          <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                            <button
                              type="button"
                              onClick={() => handleQtyChange(idx, -1)}
                              disabled={qty <= 1}
                              className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-100 active:scale-95 disabled:opacity-30"
                              aria-label="Decrease quantity"
                            >
                              -
                            </button>
                            <span className="min-w-7 px-1 text-center text-xs font-extrabold text-slate-900">
                              {qty}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleQtyChange(idx, 1)}
                              className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-100 active:scale-95"
                              aria-label="Increase quantity"
                            >
                              +
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => setRemovingPart({ index: idx, name: item.description || item.itemCode, sku: item.itemCode })}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 active:bg-red-100"
                            aria-label="Remove part"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-800">
                          Qty: {qty}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {canManage ? (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => {
                  setEditingIndex(null);
                  setPickerOpen(true);
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-blue-300 bg-white py-2.5 text-xs font-bold text-[#2563eb] shadow-sm hover:bg-blue-50 active:bg-blue-100"
              >
                <Plus className="h-4 w-4" />
                {t('Add Part from Inventory', 'Tambah Alat Ganti dari Inventori', '从零件库添加配件')}
              </button>
            </div>
          ) : null}
        </div>
      )}

      {/* Part Picker Drawer */}
      <MobilePartPickerDrawer
        catalog={localCatalog}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={handlePickPart}
        t={t}
      />

      {/* Manager Confirm Add Part Modal */}
      {confirmingPart ? createPortal(
        <div
          data-prevent-swipe="true"
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px] animate-in fade-in duration-200"
          onClick={() => setConfirmingPart(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="border-b border-slate-100 px-5 pt-5 pb-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-[#2563eb] ring-1 ring-blue-100">
                    <PackagePlus className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      {editingIndex !== null
                        ? t('Confirm Update Part', 'Sahkan Kemas Kini Alat Ganti', '确认修改配件需求')
                        : t('Confirm Add Part', 'Sahkan Tambah Alat Ganti', '确认添加配件需求')}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      {t('Work order spare part requirement', 'Keperluan alat ganti pesanan kerja', '当前工单所需维修配件')}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmingPart(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              {/* Part Details Box */}
              <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 space-y-2.5">
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    {t('Part Description', 'Penerangan Alat Ganti', '配件名称')}
                  </p>
                  <p className="text-sm font-bold text-slate-900 mt-0.5 leading-snug">
                    {confirmingPart.description || confirmingPart.itemCode}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {confirmingPart.itemCode ? (
                    <span className="rounded-lg bg-white border border-slate-200 px-2 py-0.5 text-xs font-mono font-bold text-slate-700">
                      {confirmingPart.itemCode}
                    </span>
                  ) : null}
                  {confirmingPart.stock > 0 ? (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                      {t(`In Stock: ${confirmingPart.stock}`, `Stok: ${confirmingPart.stock}`, `库存: ${confirmingPart.stock}`)}
                    </span>
                  ) : (
                    <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-700">
                      {t('Out of Stock', 'Tiada Stok', '暂无现货')}
                    </span>
                  )}
                </div>
              </div>

              {/* Quantity Counter Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  {t('Required Quantity', 'Kuantiti Diperlukan', '所需数量')}
                </label>
                <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-2 shadow-xs">
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmingPart((prev) =>
                        prev ? { ...prev, quantity: Math.max(1, prev.quantity - 1) } : null
                      )
                    }
                    disabled={confirmingPart.quantity <= 1}
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-base font-bold text-slate-700 transition-colors hover:bg-slate-200 active:scale-95 disabled:opacity-40"
                  >
                    -
                  </button>
                  <div className="text-center">
                    <span className="text-xl font-extrabold text-slate-900">
                      {confirmingPart.quantity}
                    </span>
                    <span className="text-xs font-bold text-slate-400 ml-1">PCS</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmingPart((prev) =>
                        prev ? { ...prev, quantity: prev.quantity + 1 } : null
                      )
                    }
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-base font-bold text-[#2563eb] transition-colors hover:bg-blue-100 active:scale-95"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Shortage notice if applicable */}
              {confirmingPart.quantity > confirmingPart.stock && (
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-900">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                  <p>
                    {t(
                      `Shortage of ${confirmingPart.quantity - confirmingPart.stock} units. This work order will be marked as shortage for procurement.`,
                      `Kekurangan ${confirmingPart.quantity - confirmingPart.stock} unit. Pesanan kerja ini akan ditandakan untuk perolehan.`,
                      `库存尚缺 ${confirmingPart.quantity - confirmingPart.stock} 件。此工单将自动标记为缺货待采购状态。`
                    )}
                  </p>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-4">
              <button
                type="button"
                onClick={() => setConfirmingPart(null)}
                className="h-11 flex-1 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 active:bg-slate-100"
              >
                {t('Cancel', 'Batal', '取消')}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void executeConfirmAddPart()}
                className="h-11 flex-1 rounded-xl bg-[#2563eb] text-xs font-bold text-white shadow-sm transition-all hover:bg-[#1d4ed8] active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {saving ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {editingIndex !== null
                  ? t('Update', 'Kemas Kini', '确认修改')
                  : t('Confirm Add', 'Sahkan Tambah', '确认添加')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      ) : null}

      {/* Manager Confirm Remove Part Modal */}
      {removingPart ? createPortal(
        <div
          data-prevent-swipe="true"
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px] animate-in fade-in duration-200"
          onClick={() => setRemovingPart(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="border-b border-slate-100 px-5 pt-5 pb-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-rose-100">
                    <Trash2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      {t('Remove Spare Part?', 'Keluarkan Alat Ganti?', '移除配件需求？')}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      {t('Confirm removing part from work order', 'Sahkan pengeluaran alat ganti dari pesanan', '确认从工单中移除此配件')}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setRemovingPart(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-3">
              <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                <p className="text-sm font-bold text-slate-900 leading-snug">
                  {removingPart.name}
                </p>
                {removingPart.sku ? (
                  <span className="mt-1.5 inline-block font-mono text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                    {removingPart.sku}
                  </span>
                ) : null}
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                {t(
                  'Are you sure you want to remove this spare part requirement from the work order?',
                  'Adakah anda pasti ingin mengeluarkan keperluan alat ganti ini dari pesanan kerja?',
                  '确定要将此配件从当前维修工单需求清单中移除吗？'
                )}
              </p>
            </div>

            {/* Modal Actions */}
            <div className="flex gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-4">
              <button
                type="button"
                onClick={() => setRemovingPart(null)}
                className="h-11 flex-1 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 active:bg-slate-100"
              >
                {t('Cancel', 'Batal', '取消')}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void executeConfirmRemovePart()}
                className="h-11 flex-1 rounded-xl bg-rose-600 text-xs font-bold text-white shadow-sm transition-all hover:bg-rose-700 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {saving ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {t('Confirm Remove', 'Sahkan Buang', '确认移除')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  );
}

function WorkshopJobFlow({
  expanded,
  id,
  children,
}: {
  expanded: boolean;
  id?: string;
  children: React.ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(expanded ? undefined : 0);
  const isInitialMount = useRef(true);

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (expanded) {
      // Measure actual scroll height
      const targetHeight = el.scrollHeight;
      setHeight(targetHeight);

      const timer = setTimeout(() => {
        setHeight(undefined); // Release to auto after animation finishes
      }, 500);

      return () => clearTimeout(timer);
    } else {
      // First explicitly snap to current measured height
      const currentHeight = el.scrollHeight;
      setHeight(currentHeight);

      // In the very next paint frame, animate to 0
      const frame = requestAnimationFrame(() => {
        setHeight(0);
      });

      return () => cancelAnimationFrame(frame);
    }
  }, [expanded]);

  return (
    <div
      id={id}
      style={{
        height: height === undefined ? 'auto' : `${height}px`,
        overflow: height === undefined ? 'visible' : 'hidden',
        transition: isInitialMount.current ? 'none' : 'height 480ms cubic-bezier(0.22, 1, 0.36, 1), opacity 380ms ease-out',
        opacity: expanded ? 1 : 0,
        willChange: 'height, opacity',
      }}
      aria-hidden={!expanded}
    >
      <div ref={contentRef} className="border-t border-slate-200/60 bg-white/95 p-5">
        {children}
      </div>
    </div>
  );
}

export function WorkshopJobsScreen() {
  const navigate = useNavigate();
  const { language, setLanguage, t } = useLanguage();
  const user = getWorkshopUser();
  const correctionDismissKey = `maw-workshop-dismissed-corrections:${user?.id || 'unknown'}`;
  const [jobs, setJobs] = useState<WorkshopJob[]>([]);
  const [team, setTeam] = useState<WorkshopTeamMember[]>([]);
  const [catalog, setCatalog] = useState<WorkshopPartItem[]>([]);
  const [notifications, setNotifications] = useState<WorkshopNotification[]>([]);
  const [dismissedCorrectionSignature, setDismissedCorrectionSignature] = useState(() => {
    try {
      return window.localStorage.getItem(correctionDismissKey) || '';
    } catch {
      return '';
    }
  });
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState('repair');
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [caption, setCaption] = useState('');
  const [customerVisible, setCustomerVisible] = useState(true);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState('');
  const [photoPreviewFailed, setPhotoPreviewFailed] = useState(false);
  const [recordPreview, setRecordPreview] = useState<WorkshopJob['photos'][number] | null>(null);
  const [bayFilter, setBayFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [openFilter, setOpenFilter] = useState<'bay' | 'status' | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const headerLogoRef = useRef<HTMLDivElement>(null);
  const [launchAnimationDone, setLaunchAnimationDone] = useState(() => getHasPlayedLaunchAnimation());
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const reloadPromiseRef = useRef<Promise<void> | null>(null);
  const pullStartYRef = useRef<number | null>(null);
  const startScrollTopRef = useRef<number>(0);
  const mainRef = useRef<HTMLElement | null>(null);
  const pullRefreshThreshold = 64;

  const reload = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (reloadPromiseRef.current) return reloadPromiseRef.current;
    if (silent) setRefreshing(true);
    else {
      setLoading(true);
      setError('');
    }
    const operation = (async () => {
      try {
        const [result, catalogParts] = await Promise.all([
          loadWorkshopJobs(),
          loadWorkshopPartsCatalog(),
        ]);
        setJobs(result.jobs);
        setTeam(result.team);
        setCatalog(catalogParts);
        setNotifications(result.notifications || []);
        setLastUpdatedAt(Date.now());
        setError('');
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Unable to load jobs.');
      } finally {
        setLoading(false);
        setRefreshing(false);
        reloadPromiseRef.current = null;
      }
    })();
    reloadPromiseRef.current = operation;
    return operation;
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const hasPendingPhoto = Boolean(photo);
  useEffect(() => {
    if (!photo) {
      setPhotoPreviewUrl('');
      setPhotoPreviewFailed(false);
      return;
    }
    const objectUrl = URL.createObjectURL(photo);
    setPhotoPreviewUrl(objectUrl);
    setPhotoPreviewFailed(false);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photo]);

  useEffect(() => {
    const refreshIfAllowed = () => {
      const focusedElement = document.activeElement;
      const isEditing = focusedElement instanceof HTMLElement
        && focusedElement.matches('input, textarea, select, [contenteditable="true"]');
      if (document.hidden || uploading || hasPendingPhoto || isEditing || !hasWorkshopSession()) return;
      void reload({ silent: true });
    };
    const onVisibilityChange = () => {
      if (!document.hidden) refreshIfAllowed();
    };
    window.addEventListener('focus', refreshIfAllowed);
    window.addEventListener('online', refreshIfAllowed);
    document.addEventListener('visibilitychange', onVisibilityChange);
    const intervalId = window.setInterval(refreshIfAllowed, 20_000);
    return () => {
      window.removeEventListener('focus', refreshIfAllowed);
      window.removeEventListener('online', refreshIfAllowed);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [hasPendingPhoto, reload, uploading]);

  const handlePullStart = (event: TouchEvent<HTMLElement>) => {
    const target = event.target;
    if (target instanceof Element && target.closest('input, textarea, select, button, [contenteditable="true"]')) {
      pullStartYRef.current = null;
      return;
    }
    const currentScroll = event.currentTarget.scrollTop;
    startScrollTopRef.current = currentScroll;
    pullStartYRef.current = currentScroll <= 0 ? event.touches[0]?.clientY ?? null : null;
  };

  const handlePullMove = (event: TouchEvent<HTMLElement>) => {
    const currentScroll = event.currentTarget.scrollTop;
    if (pullStartYRef.current == null || startScrollTopRef.current > 0 || currentScroll > 0 || loading || refreshing || uploading) return;
    const distance = (event.touches[0]?.clientY ?? pullStartYRef.current) - pullStartYRef.current;
    if (distance <= 0) {
      setPullDistance(0);
      return;
    }
    if (event.cancelable) event.preventDefault();
    setPullDistance(Math.min(96, distance * 0.45));
  };

  const handleMainScroll = (event: React.UIEvent<HTMLElement>) => {
    const top = event.currentTarget.scrollTop;
    if (top > 240) {
      setShowBackToTop(true);
    } else {
      setShowBackToTop(false);
    }
  };

  const scrollToTop = (e: React.MouseEvent) => {
    e.stopPropagation();
    mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const finishPull = () => {
    const shouldRefresh = startScrollTopRef.current <= 0 && pullDistance >= pullRefreshThreshold;
    pullStartYRef.current = null;
    setPullDistance(0);
    if (shouldRefresh && !loading && !refreshing && !uploading) void reload();
  };

  const logoutWorkshop = async () => {
    setLoggingOut(true);
    clearWorkshopSession();
    navigate('/', { replace: true });
  };

  if (!hasWorkshopSession()) return <Navigate to="/" replace />;

  const chooseNativePhoto = async (source: CameraSource) => {
    setError('');
    try {
      const captured = await NativeCamera.getPhoto({
        source,
        resultType: CameraResultType.Uri,
        quality: 85,
        width: 2048,
        correctOrientation: true,
        saveToGallery: false,
      });
      if (!captured.webPath) throw new Error('The camera did not return a photo.');
      const blob = await fetch(captured.webPath).then((response) => response.blob());
      const extension = captured.format === 'png' ? 'png' : captured.format === 'webp' ? 'webp' : 'jpg';
      setPhoto(new File([blob], `workshop-${Date.now()}.${extension}`, {
        type: blob.type || `image/${extension === 'jpg' ? 'jpeg' : extension}`,
        lastModified: Date.now(),
      }));
      setUploadError('');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught || '');
      if (!/cancel/i.test(message)) setError(message || 'Unable to open the camera.');
    }
  };

  const clearSelectedPhoto = () => {
    setPhoto(null);
    setPhotoPreviewUrl('');
    setPhotoPreviewFailed(false);
    setUploadError('');
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  };

  const requestPhoto = (source: CameraSource) => {
    if (Capacitor.isNativePlatform()) {
      void chooseNativePhoto(source);
      return;
    }
    if (source === CameraSource.Camera) cameraInputRef.current?.click();
    else galleryInputRef.current?.click();
  };

  const submitPhoto = async (event: FormEvent<HTMLFormElement>, workOrderId: number) => {
    event.preventDefault();
    if (!photo || uploading) return;
    setUploading(true);
    setUploadError('');
    try {
      await uploadWorkshopPhoto({ workOrderId, photo, category, caption: caption.trim(), customerVisible });
      clearSelectedPhoto();
      await reload();
      setExpandedIds((current) => new Set(current).add(workOrderId));
    } catch (caught) {
      setUploadError(caught instanceof Error ? caught.message : 'Unable to upload photo.');
    } finally {
      setUploading(false);
    }
  };

  const canManageParts = ['Admin', 'Head Manager', 'Manager', 'Superadmin'].includes(user?.role || '');

  const canUploadToJob = (job: WorkshopJob) => ['Admin', 'Head Manager', 'Foreman'].includes(user?.role || '')
    || job.foremanId === user?.id
    || (user?.role === 'Technician' && Boolean(user?.id) && job.assignedTechnicianIds.includes(user.id));

  const bayOptions: WorkshopFilterOption[] = [
    { value: 'all', label: t('All', 'Semua', '全部') },
    ...Array.from(new Set<string>(jobs.map((job) => String(job.bay || '')).filter(Boolean)))
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
      .map((bay) => ({ value: bay, label: bay })),
  ];
  const statusOptions: WorkshopFilterOption[] = [
    { value: 'all', label: t('All', 'Semua', '全部') },
    ...Array.from(new Set<string>(jobs.map((job) => String(job.status))))
      .map((status) => ({ value: status, label: workshopStatusLabel(status, t) })),
  ];
  const priorityRank: Record<string, number> = { Urgent: 0, High: 1, Normal: 2 };
  const filteredJobs = jobs
    .filter((job) => (
      (bayFilter === 'all' || job.bay === bayFilter)
      && (statusFilter === 'all' || job.status === statusFilter)
    ))
    .sort((left, right) => (
      (priorityRank[left.priority] ?? priorityRank.Normal)
      - (priorityRank[right.priority] ?? priorityRank.Normal)
      || right.id - left.id
    ));
  const correctionSignature = notifications.slice(0, 3).map((notification) => String(notification.id)).join('|');
  const showStatusCorrections = notifications.length > 0 && correctionSignature !== dismissedCorrectionSignature;

  const dismissStatusCorrections = () => {
    setDismissedCorrectionSignature(correctionSignature);
    try {
      window.localStorage.setItem(correctionDismissKey, correctionSignature);
    } catch {
      // Dismissal still works for the current session when storage is unavailable.
    }
  };

  return (
    <div className="maw-app-shell relative mx-auto flex h-[100dvh] w-full max-w-md flex-col overflow-hidden">
      <AppLaunchFlightOverlay
        targetRef={headerLogoRef}
        onDone={() => setLaunchAnimationDone(true)}
        delayMoveMs={350}
        durationMs={880}
      />

      {/* Pull to refresh badge emerging from beneath the header */}
      <div
        aria-live="polite"
        className={`pointer-events-none absolute left-1/2 top-[5.25rem] z-30 flex items-center gap-2 rounded-full border border-blue-100 bg-white/95 px-3.5 py-1.5 text-[11px] font-semibold text-blue-700 shadow-[0_8px_20px_rgba(37,99,235,0.14)] backdrop-blur-md transition-all duration-200 ${
          pullDistance > 0 || refreshing
            ? 'opacity-100'
            : 'opacity-0'
        }`}
        style={{
          transform: `translateX(-50%) translateY(${
            pullDistance > 0
              ? Math.min(pullDistance * 0.45, 28)
              : refreshing
                ? 12
                : -28
          }px) scale(${pullDistance > 0 || refreshing ? 1 : 0.85})`,
        }}
      >
        <RefreshCw className={`h-3.5 w-3.5 text-[#2563eb] ${refreshing ? 'animate-spin' : ''}`} />
        <span>
          {refreshing
            ? t('Refreshing...', 'Sedang menyegar semula…', '正在刷新…')
            : pullDistance >= pullRefreshThreshold
              ? t('Release to refresh', 'Lepaskan untuk segar semula', '松开刷新')
              : t('Pull to refresh', 'Tarik untuk segar semula', '下拉刷新')}
        </span>
      </div>

      {/* Locked Header */}
      <header className="maw-page-header relative z-40 grid min-h-[5rem] grid-cols-[5.5rem_1fr_5.5rem] items-center px-4 py-3 shrink-0">
          <div className="flex justify-start">
            <button type="button" onClick={() => setLogoutDialogOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-500 ring-1 ring-blue-100 shadow-sm transition-colors active:bg-blue-50 active:text-[#2563eb]" aria-label={t('Log out', 'Log keluar', '退出登录')}><LogOut className="h-5 w-5" /></button>
          </div>
          <div
            data-header-logo="true"
            ref={headerLogoRef}
            className="flex justify-center"
          >
            <BrandLogoBadge compact plain />
          </div>
          <div className="flex justify-end">
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  const languages: Array<'en' | 'bm' | 'zh'> = ['en', 'bm', 'zh'];
                  setLanguage(languages[(languages.indexOf(language) + 1) % languages.length]);
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#2563eb] ring-1 ring-blue-100 shadow-sm transition-colors active:bg-blue-50"
                aria-label={t('Change language', 'Tukar bahasa', '切换语言')}
              >
                <Languages className="h-5 w-5" />
              </button>
              <span className="absolute -bottom-1 -right-1 rounded-full bg-[#2563eb] px-1.5 py-0.5 text-[9px] font-bold text-white shadow-sm">{language === 'en' ? 'EN' : language === 'bm' ? 'BM' : 'CN'}</span>
            </div>
          </div>
      </header>

      {/* Main Content Area */}
      <main
        ref={mainRef}
        onScroll={handleMainScroll}
        className="flex-1 scroll-smooth overscroll-y-contain overflow-y-auto pb-10"
        onTouchStart={handlePullStart}
        onTouchMove={handlePullMove}
        onTouchEnd={finishPull}
        onTouchCancel={finishPull}
      >
        <section className="space-y-4 p-5">
        <div className="flex gap-2">
            <WorkshopFilterMenu
              value={bayFilter}
              options={bayOptions}
              open={openFilter === 'bay'}
              onToggle={() => setOpenFilter((current) => current === 'bay' ? null : 'bay')}
              onChange={(value) => { setBayFilter(value); setOpenFilter(null); }}
              closeLabel={t('Close bay filter', 'Tutup penapis ruang', '关闭工位筛选')}
            />
            <WorkshopFilterMenu
              value={statusFilter}
              options={statusOptions}
              open={openFilter === 'status'}
              onToggle={() => setOpenFilter((current) => current === 'status' ? null : 'status')}
              onChange={(value) => { setStatusFilter(value); setOpenFilter(null); }}
              closeLabel={t('Close status filter', 'Tutup penapis status', '关闭状态筛选')}
            />
        </div>
        <div className="flex items-center justify-between rounded-2xl border border-white/80 bg-white px-4 py-3 text-xs shadow-[0_8px_24px_rgba(30,58,138,0.07)]">
          <span className="inline-flex items-center gap-2 font-bold text-emerald-700"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />{t('Live data', 'Data langsung', '实时数据')}</span>
          <span className="text-slate-400">{lastUpdatedAt ? `${t('Updated', 'Dikemas kini', '更新于')} ${new Date(lastUpdatedAt).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : t('Connecting…', 'Menyambung…', '连接中…')}</span>
        </div>
        {showStatusCorrections ? <section className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 shadow-[0_8px_24px_rgba(146,64,14,0.08)]"><div className="flex items-center justify-between gap-2 border-b border-amber-200 px-3 py-2 text-amber-900"><div className="flex min-w-0 items-center gap-2"><Undo2 className="h-4 w-4 shrink-0" /><h2 className="truncate text-xs font-extrabold uppercase tracking-wide">{t('Recent status corrections', 'Pembetulan status terkini', '最近状态更正')}</h2></div><button type="button" onClick={dismissStatusCorrections} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-amber-700 transition-colors active:bg-amber-200/70" aria-label={t('Dismiss status corrections', 'Tutup pembetulan status', '关闭状态更正提醒')}><X className="h-4 w-4" /></button></div><div className="divide-y divide-amber-200/70">{notifications.slice(0, 3).map((notification) => <button type="button" key={notification.id} onClick={() => setExpandedIds((current) => new Set(current).add(notification.workOrderId))} className="block w-full px-4 py-3 text-left active:bg-amber-100"><p className="text-xs font-bold text-amber-950">{notification.title}</p><p className="mt-1 text-[11px] leading-4 text-amber-800">{notification.message}</p><p className="mt-1 text-[9px] text-amber-600">{formatProgressTime(notification.date)}</p></button>)}</div></section> : null}
        {error ? <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        {!loading && jobs.length === 0 ? <p className="rounded-[1.5rem] border border-white/80 bg-white p-8 text-center text-sm text-slate-500 shadow-[0_8px_24px_rgba(30,58,138,0.07)]">{t('No work orders are assigned to you.', 'Tiada pesanan kerja ditugaskan kepada anda.', '目前没有分配给您的工单。')}</p> : null}
        {!loading && jobs.length > 0 && filteredJobs.length === 0 ? <p className="rounded-[1.5rem] border border-white/80 bg-white p-8 text-center text-sm text-slate-500 shadow-[0_8px_24px_rgba(30,58,138,0.07)]">{t('No work orders match these filters.', 'Tiada pesanan kerja sepadan dengan penapis ini.', '没有符合筛选条件的工单。')}</p> : null}
        {filteredJobs.map((job) => {
          const expanded = expandedIds.has(job.id);
          const canManageJob = canUploadToJob(job);
          const priorityStyle = workshopPriorityStyle(job.priority);
          return (
            <article key={job.id} className={`maw-workshop-priority-card overflow-hidden rounded-[1.5rem] border border-l-4 shadow-sm transition-all duration-200 ${priorityStyle.card}`}>
              <button type="button" onClick={() => { setExpandedIds((current) => { const next = new Set(current); if (next.has(job.id)) next.delete(job.id); else next.add(job.id); return next; }); if (!expanded) { setPhoto(null); setUploadError(''); } }} className="flex w-full items-start justify-between gap-3 p-5 text-left transition-colors active:bg-black/5" aria-expanded={expanded}>
                <div className="flex min-w-0 gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/80 text-[#2563eb] shadow-xs backdrop-blur-xs"><Wrench className="h-5 w-5" /></span><div className="min-w-0"><h2 className="truncate font-bold text-slate-900">{job.unitNo || job.regNo}</h2><p className="truncate text-sm text-slate-600">{job.unitNo ? `${job.regNo} · ` : ''}{job.workOrderNo}</p><p className="mt-1 truncate text-xs text-slate-500">{job.companyName}{job.bay ? ` · ${job.bay}` : ''}</p></div></div>
                <span className="flex shrink-0 items-center gap-1.5"><span className="flex flex-col items-end gap-1"><span className="max-w-24 rounded-full bg-white/90 px-2 py-1 text-center text-[9px] font-bold uppercase leading-3 text-[#2563eb] shadow-xs">{workshopStatusLabel(job.status, t)}</span><span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase shadow-xs ${priorityStyle.badge}`}>{workshopPriorityLabel(job.priority, t)}</span></span><ChevronDown className={`h-5 w-5 text-slate-400 transition-transform duration-500 ease-out ${expanded ? 'rotate-180' : 'rotate-0'}`} /></span>
              </button>
              <WorkshopJobFlow id={`workshop-job-flow-${job.id}`} expanded={expanded}>
                {job.reportedProblem ? <div className="mb-4 rounded-2xl border border-blue-50 bg-[#f8fbff] p-3.5"><p className="text-[10px] font-bold uppercase tracking-wide text-blue-500">{t('Reported problem', 'Masalah dilaporkan', '报告的问题')}</p><p className="mt-1 text-sm leading-5 text-slate-700">{job.reportedProblem}</p></div> : null}
                <RepairProgress job={job} t={t} id={`workshop-progress-${job.id}`} />
                <WorkshopPartsSection
                  workOrderId={job.id}
                  catalog={catalog}
                  canManage={canManageParts && !['ready_for_collection', 'collected'].includes(job.status)}
                  t={t}
                  onUpdated={reload}
                />
                <div id={`workshop-photos-${job.id}`} className="mb-5 scroll-mt-28">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800"><Camera className="h-4 w-4 text-blue-600" />{t('Photo record', 'Rekod foto', '照片记录')} ({job.photos.length})</h3>
                  {job.photos.length ? <div className="grid grid-cols-3 gap-2">{job.photos.map((item) => <figure key={item.id} className="overflow-hidden rounded-xl border border-blue-100 bg-[#f8fbff]"><button type="button" onClick={() => setRecordPreview(item)} className="block w-full overflow-hidden bg-slate-100 text-left active:opacity-90" aria-label={t('Enlarge workshop photo', 'Besarkan foto bengkel', '放大维修照片')}><img src={workshopPhotoUrl(item.id)} alt={item.caption || t('Workshop photo', 'Foto bengkel', '维修照片')} loading="lazy" className="aspect-square w-full object-cover" /></button><figcaption className="p-2 text-[9px] font-semibold uppercase text-blue-600">{workshopCategoryLabel(item.category, t)}</figcaption></figure>)}</div> : <p className="rounded-2xl border border-dashed border-blue-100 bg-blue-50/30 p-4 text-center text-xs text-slate-400">{t('No photos yet.', 'Belum ada foto.', '暂无照片。')}</p>}
                </div>
                {canManageJob ? <form id={`workshop-upload-${job.id}`} onSubmit={(event) => void submitPhoto(event, job.id)} className="scroll-mt-28 space-y-3 rounded-2xl border border-blue-100 bg-[#f8fbff] p-4">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-blue-900"><Upload className="h-4 w-4" />{t('Take or upload photo', 'Ambil atau muat naik foto', '拍摄或上传照片')}</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => requestPhoto(CameraSource.Camera)} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#2563eb] px-3 text-sm font-bold text-white shadow-sm active:bg-blue-700"><Camera className="h-4 w-4" />{t('Take Photo', 'Ambil Foto', '拍照')}</button>
                    <button type="button" onClick={() => requestPhoto(CameraSource.Photos)} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-3 text-sm font-bold text-[#2563eb] active:bg-blue-50"><Upload className="h-4 w-4" />{t('Gallery', 'Galeri', '相册')}</button>
                  </div>
                  <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={(event) => { setPhoto(event.target.files?.[0] || null); setUploadError(''); }} className="sr-only" aria-label="Take workshop photo" />
                  <input ref={galleryInputRef} type="file" accept="image/*" onChange={(event) => { setPhoto(event.target.files?.[0] || null); setUploadError(''); }} className="sr-only" aria-label="Choose workshop photo from gallery" />
                  {photo ? <div className="overflow-hidden rounded-xl border border-blue-100 bg-white">
                    <div className="relative flex min-h-40 items-center justify-center bg-slate-100">
                      {photoPreviewUrl && !photoPreviewFailed ? <img src={photoPreviewUrl} alt={t('Selected photo preview', 'Pratonton foto dipilih', '所选照片预览')} onError={() => setPhotoPreviewFailed(true)} className="max-h-72 w-full object-contain" /> : <p className="px-6 text-center text-xs text-slate-500">{t('Preview is not supported for this photo format, but the photo can still be uploaded.', 'Pratonton tidak disokong untuk format ini, tetapi foto masih boleh dimuat naik.', '此照片格式不支持预览，但仍可上传。')}</p>}
                      <button type="button" onClick={clearSelectedPhoto} className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-red-700 shadow-md" aria-label={`Remove ${photo.name}`}><X className="h-5 w-5" /></button>
                    </div>
                    <p className="truncate px-3 py-2 text-xs text-slate-600"><span className="font-semibold">{photo.name}</span> · {(photo.size / 1024 / 1024).toFixed(1)} MB</p>
                  </div> : null}
                  <div className="space-y-1.5">
                    <button
                      type="button"
                      onClick={() => setCategoryOpen((open) => !open)}
                      className="flex min-h-11 w-full items-center justify-between rounded-xl border border-blue-200 bg-white px-3 text-left text-sm font-medium text-slate-800 shadow-sm"
                      aria-haspopup="listbox"
                      aria-expanded={categoryOpen}
                    >
                      <span>{workshopCategoryLabel(category, t) || t('Select category', 'Pilih kategori', '选择类别')}</span>
                      <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${categoryOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {categoryOpen ? <div role="listbox" aria-label="Photo category" className="maw-expand-enter overflow-hidden rounded-xl border border-blue-100 bg-white p-1.5 shadow-md">
                      {categories.map(([value, en, bm, zh]) => {
                        const selected = category === value;
                        return <button
                          key={value}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => { setCategory(value); setCategoryOpen(false); }}
                          className={`flex min-h-10 w-full items-center justify-between rounded-lg px-3 text-left text-sm ${selected ? 'bg-blue-50 font-bold text-blue-700' : 'text-slate-700'}`}
                        >
                          <span>{t(en, bm, zh)}</span>
                          {selected ? <Check className="h-4 w-4" strokeWidth={3} /> : null}
                        </button>;
                      })}
                    </div> : null}
                  </div>
                  <textarea value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={500} rows={2} placeholder={t('Photo note (optional)', 'Nota foto (pilihan)', '照片备注（可选）')} className="w-full resize-none rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm" />
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={customerVisible} onChange={(event) => setCustomerVisible(event.target.checked)} /> {t('Vehicle customer can view this photo', 'Pelanggan kenderaan boleh melihat foto ini', '车辆客户可以查看此照片')}</label>
                  {uploadError ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{uploadError}</p> : null}
                  <button type="submit" disabled={!photo || uploading} className="h-12 w-full rounded-xl bg-[#2563eb] text-sm font-bold text-white shadow-sm active:bg-blue-700 disabled:opacity-50">{uploading ? t('Uploading…', 'Memuat naik…', '上传中…') : t('Upload photo', 'Muat naik foto', '上传照片')}</button>
                </form> : <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center text-xs text-slate-500">{t('View only — another Foreman is responsible for updates and photo uploads.', 'Paparan sahaja — Foreman lain bertanggungjawab untuk kemas kini dan muat naik foto.', '仅供查看——另一位 Foreman 负责更新和上传照片。')}</p>}
              </WorkshopJobFlow>
            </article>
          );
        })}
      </section>
      </main>

      {/* Floating Back-to-Top Button centered */}
      <button
        type="button"
        onClick={scrollToTop}
        aria-label={t('Back to top', 'Kembali ke atas', '回到顶部')}
        className={`absolute bottom-6 left-1/2 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-[#2563eb] shadow-[0_10px_28px_rgba(30,58,138,0.24)] ring-1 ring-blue-200/80 backdrop-blur-md transition-all duration-250 active:scale-90 hover:bg-blue-50 hover:text-blue-700 ${
          showBackToTop
            ? 'opacity-100 -translate-x-1/2 translate-y-0 scale-100 pointer-events-auto'
            : 'opacity-0 -translate-x-1/2 translate-y-3 scale-75 pointer-events-none'
        }`}
      >
        <ArrowUp className="h-5 w-5 stroke-[2.5]" />
      </button>

      {loading ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/15 p-6 backdrop-blur-[1px]" role="status" aria-live="polite" aria-label={t('Loading assigned jobs', 'Memuatkan kerja yang ditugaskan', '正在加载分配的工单')}>
          <div className="flex min-w-40 flex-col items-center rounded-2xl border border-white/80 bg-white/95 px-6 py-5 shadow-[0_18px_50px_rgba(30,58,138,0.20)]">
            <RefreshCw className="h-7 w-7 animate-spin text-[#2563eb]" />
            <p className="mt-3 text-sm font-semibold text-slate-700">{t('Loading…', 'Memuatkan…', '加载中…')}</p>
          </div>
        </div>
      ) : null}
      {recordPreview ? (
        <MobilePhotoPreview
          src={workshopPhotoUrl(recordPreview.id)}
          alt={recordPreview.caption || 'Workshop photo'}
          category={workshopCategoryLabel(recordPreview.category, t)}
          caption={recordPreview.caption}
          meta={recordPreview.uploadedBy}
          onClose={() => setRecordPreview(null)}
        />
      ) : null}
      <CustomerLogoutDialog
        open={logoutDialogOpen}
        isLoggingOut={loggingOut}
        onOpenChange={setLogoutDialogOpen}
        onConfirm={logoutWorkshop}
      />
    </div>
  );
}
