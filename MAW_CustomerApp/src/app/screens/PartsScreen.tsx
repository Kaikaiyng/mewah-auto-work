import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { ShoppingCart, Search, Package, Plus, Minus, ChevronRight, ChevronLeft, X, CheckCircle2 } from 'lucide-react';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { useLanguage } from '../context/LanguageContext';
import { useCart } from '../context/CartContext';
import { useCustomerData } from '../context/CustomerDataContext';
import { DataState } from '../components/DataState';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';
import { formatDate } from '../lib/dateTime';
import type { SparePart } from '../types';

const PARTS_PER_PAGE = 6;
const ORDERS_PER_PAGE = 7;

export function PartsScreen() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { addToCart, getTotalItems } = useCart();
  const [activeView, setActiveView] = useState<'browse' | 'orders'>('browse');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [partQuantities, setPartQuantities] = useState<Record<string, number>>({});
  const [orderStatusFilter, setOrderStatusFilter] = useState<'pending' | 'completed' | 'all'>('pending');
  const [partsPage, setPartsPage] = useState(1);
  const [ordersPage, setOrdersPage] = useState(1);
  const { data, isLoading, error, reload } = useCustomerData();

  const parts = data?.parts || [];
  const bookings = data?.bookings || [];

  const categoryLabel = (cat: string) => {
    const key = cat.trim().toLowerCase();
    if (key === 'engine parts' || key === 'engine') return t('Engine Parts', 'Alat Enjin', '发动机配件');
    if (key === 'brake parts' || key === 'brake') return t('Brake Parts', 'Alat Brek', '刹车配件');
    if (key === 'oil and filters' || key === 'oil & filter' || key === 'oil & filters' || key === 'oil' || key === 'filters') return t('Oil & Filters', 'Minyak & Penapis', '机油和滤清器');
    if (key === 'car accessories' || key === 'accessories' || key === 'accessory') return t('Accessories', 'Aksesori', '配件饰品');
    if (key === 'spare parts' || key === 'spare part') return t('Spare Parts', 'Alat Ganti', '备件');
    if (key === 'tyre' || key === 'tyres' || key === 'tires') return t('Tyres', 'Tayar', '轮胎');
    if (key === 'battery' || key === 'batteries') return t('Battery', 'Bateri', '电池');
    if (key === 'lubricants' || key === 'lubricant') return t('Lubricants', 'Pelincir', '润滑油');
    if (key === 'hardware') return t('Hardware', 'Perkakasan', '五金零件');
    if (key === 'electrical') return t('Electrical', 'Elektrikal', '电子元件');
    if (key === 'body parts' || key === 'body') return t('Body Parts', 'Bahagian Badan', '车身外观');
    return cat;
  };

  const validParts = useMemo(() => {
    return (parts || []).filter((p) => Number(p.price || 0) > 0);
  }, [parts]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    const originalNames = new Map<string, string>();

    for (let i = 0; i < validParts.length; i++) {
      const cat = (validParts[i].category || '').trim();
      if (!cat) continue;
      const lower = cat.toLowerCase();
      counts.set(lower, (counts.get(lower) || 0) + 1);
      if (!originalNames.has(lower)) {
        originalNames.set(lower, cat);
      }
    }

    const dynamicList: Array<{ id: string; label: string; count: number }> = [];
    counts.forEach((count, lower) => {
      const originalCat = originalNames.get(lower) || lower;
      dynamicList.push({
        id: originalCat,
        label: categoryLabel(originalCat),
        count,
      });
    });

    dynamicList.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

    return [
      { id: 'all', label: t('All', 'Semua', '全部'), count: validParts.length },
      ...dynamicList,
    ];
  }, [validParts, t]);

  const filteredParts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const selectedLower = selectedCategory.trim().toLowerCase();

    return validParts
      .filter((part) => {
        const partCat = (part.category || '').trim().toLowerCase();
        const matchesCategory =
          selectedCategory === 'all' ||
          partCat === selectedLower;
        const matchesSearch =
          query === '' ||
          part.name.toLowerCase().includes(query) ||
          partCat.includes(query);
        return matchesCategory && matchesSearch;
      })
      .sort((a, b) => {
        const stockA = Number(a.stock ?? (a.inStock ? 1 : 0));
        const stockB = Number(b.stock ?? (b.inStock ? 1 : 0));
        if (stockB !== stockA) return stockB - stockA;
        return a.name.localeCompare(b.name);
      });
  }, [validParts, selectedCategory, searchQuery]);

  const totalPartsPages = Math.max(1, Math.ceil(filteredParts.length / PARTS_PER_PAGE));
  const paginatedParts = useMemo(() => {
    const start = (partsPage - 1) * PARTS_PER_PAGE;
    return filteredParts.slice(start, start + PARTS_PER_PAGE);
  }, [filteredParts, partsPage]);

  // Orders logic
  const partsOrders = useMemo(() => {
    return bookings.filter(b => b.orderType === 'parts');
  }, [bookings]);

  const filteredOrders = useMemo(() => {
    return partsOrders.filter(order => {
      if (orderStatusFilter === 'pending') {
        return ['pending', 'confirmed', 'preparing', 'ready'].includes(order.status);
      }
      if (orderStatusFilter === 'completed') {
        return ['shipped', 'completed'].includes(order.status);
      }
      return true;
    });
  }, [partsOrders, orderStatusFilter]);

  const totalOrdersPages = Math.max(1, Math.ceil(filteredOrders.length / ORDERS_PER_PAGE));
  const paginatedOrders = useMemo(() => {
    const start = (ordersPage - 1) * ORDERS_PER_PAGE;
    return filteredOrders.slice(start, start + ORDERS_PER_PAGE);
  }, [filteredOrders, ordersPage]);

  const handleAddToCart = (part: SparePart) => {
    const qty = partQuantities[part.id] || 1;
    for (let i = 0; i < qty; i++) {
      addToCart(part);
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return t('Pending', 'Belum Selesai', '待处理');
      case 'confirmed': return t('Confirmed', 'Disahkan', '已确认');
      case 'preparing': return t('Preparing', 'Disediakan', '备货中');
      case 'ready': return t('Ready for Collection', 'Sedia Diambil', '可自取');
      case 'shipped': return t('Shipped', 'Dihantar', '已发货');
      case 'completed': return t('Completed', 'Selesai', '已完成');
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'confirmed': return 'bg-blue-100 text-blue-800';
      case 'preparing': return 'bg-purple-100 text-purple-800';
      case 'ready': return 'bg-emerald-100 text-emerald-800';
      case 'shipped': return 'bg-indigo-100 text-indigo-800';
      case 'completed': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (!data) {
    return <DataState isLoading={isLoading} error={error} onRetry={() => void reload()} />;
  }

  if (!data.user.permissions.canOrderParts) {
    return <DataState isLoading={false} error={t('You are not authorised to order parts', 'Anda tidak dibenarkan memesan alat ganti', '您无权订购配件')} onRetry={() => navigate('/home')} />;
  }

  return (
    <div className="min-h-screen bg-[#eef3fb] max-w-md mx-auto flex flex-col justify-between">
      {/* 1. Standard Minimalist Header */}
      <div className="maw-page-header sticky top-0 z-40 relative flex items-center justify-between shrink-0">
        <div className="w-10" />
        <h1 className="text-base font-bold text-center absolute left-1/2 -translate-x-1/2 pointer-events-none truncate max-w-[200px]">
          {t('Spare Parts', 'Alat Ganti', '备件商城')}
        </h1>
        <button
          onClick={() => navigate('/cart')}
          className="relative w-10 h-10 rounded-full bg-white flex items-center justify-center text-[#2563eb] ring-1 ring-blue-100 shadow-sm hover:bg-blue-50 transition-colors"
          aria-label={t('Shopping Cart', '购物车')}
        >
          <ShoppingCart className="w-5 h-5" />
          {getTotalItems() > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center">
              {getTotalItems()}
            </span>
          )}
        </button>
      </div>

      {/* 2. Top Segmented Tabs (Browse Parts | My Orders) */}
      <div className="px-5 pt-3 pb-1 shrink-0">
        <div className="flex gap-2 rounded-2xl bg-slate-200/60 p-1">
          <button
            onClick={() => { setActiveView('browse'); setPartsPage(1); }}
            className={`flex-1 py-2 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeView === 'browse'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            {t('Browse Parts', 'Cari Alat Ganti', '浏览配件')}
          </button>
          <button
            onClick={() => { setActiveView('orders'); setOrdersPage(1); }}
            className={`flex-1 py-2 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeView === 'orders'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Package className="w-4 h-4" />
            {t('My Orders', 'Pesanan Saya', '我的订单')}
            {partsOrders.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200/70 text-slate-700 font-bold">
                {partsOrders.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 3. Filter & Search Panel */}
      {activeView === 'browse' ? (
        <div className="px-5 pt-1.5 pb-2 shrink-0 space-y-2">
          {/* Instant Search Bar */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              type="text"
              placeholder={t('Search parts name, code, model...', 'Cari alat ganti...', '搜索配件名称、编号...')}
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPartsPage(1); }}
              className="pl-9 pr-8 h-10 rounded-xl border-slate-200/80 bg-white shadow-2xs text-xs font-semibold text-slate-900"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => { setSearchQuery(''); setPartsPage(1); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Quick Category Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {categories.map((category) => {
              const isActive = selectedCategory.toLowerCase() === category.id.toLowerCase();
              return (
                <button
                  key={category.id}
                  onClick={() => { setSelectedCategory(category.id); setPartsPage(1); }}
                  className={`px-2.5 py-1 rounded-lg whitespace-nowrap text-xs font-bold transition-all shrink-0 flex items-center gap-1 ${
                    isActive
                      ? 'bg-[#1e3a8a] text-white shadow-xs'
                      : 'bg-white border border-slate-200/80 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span>{category.label}</span>
                  <span className={`text-[10px] px-1 rounded-full ${
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {category.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="px-5 pt-1.5 pb-2 shrink-0">
          {/* Order Status Filter Chips */}
          <div className="flex gap-1.5 rounded-xl bg-slate-100/90 p-1 border border-slate-200/70">
            {[
              { id: 'all', label: t('All', 'Semua', '全部') },
              { id: 'pending', label: t('Pending', 'Belum Selesai', '待处理') },
              { id: 'completed', label: t('Completed', 'Selesai', '已完成') },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setOrderStatusFilter(tab.id as any); setOrdersPage(1); }}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all text-center ${
                  orderStatusFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 4. Single-Screen Content Area */}
      <div className="flex-1 px-5 pb-4 min-h-0 flex flex-col justify-between">
        {activeView === 'browse' ? (
          <div className="flex-1 flex flex-col justify-between">
            {filteredParts.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-xs my-auto">
                <ShoppingCart className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-700">
                  {t('No parts found', 'Tiada alat ganti dijumpai', '未找到匹配配件')}
                </p>
                <button
                  type="button"
                  onClick={() => { setSelectedCategory('all'); setSearchQuery(''); setPartsPage(1); }}
                  className="mt-3 text-xs text-[#2563eb] font-bold hover:underline"
                >
                  {t('Reset Filters', 'Tetapkan Semula', '重置筛选条件')}
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                {paginatedParts.map((part) => (
                  <div
                    key={part.id}
                    onClick={() => navigate(`/part/${part.id}`)}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200/70 bg-white hover:border-blue-300 hover:shadow-xs transition-all cursor-pointer active:scale-[0.99]"
                  >
                    {/* Left: Thumbnail + Name + Category */}
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <div className="w-10 h-10 rounded-lg bg-slate-100 overflow-hidden shrink-0 border border-slate-100">
                        <ImageWithFallback
                          src={part.image}
                          alt={part.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="font-extrabold text-xs text-slate-900 truncate leading-tight">
                          {part.name}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate mt-0.5">
                          {part.category}
                        </p>
                      </div>
                    </div>

                    {/* Right: Price + InStock + Quick Add Button */}
                    <div className="flex items-center gap-2.5 shrink-0">
                      <div className="text-right">
                        <p className="font-black text-xs text-[#2563eb] font-mono leading-tight">
                          RM {part.price}
                        </p>
                        <span className={`inline-block mt-0.5 px-1.5 py-0.2 rounded-full text-[9px] font-bold ${
                          part.inStock
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          {part.inStock ? t('In Stock', 'Ada Stok', '现货') : t('Out of Stock', 'Tiada', '缺货')}
                        </span>
                      </div>

                      <button
                        type="button"
                        disabled={!part.inStock}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddToCart(part);
                        }}
                        className="h-8.5 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#2563eb] text-xs font-bold transition-all disabled:opacity-40 active:scale-95 flex items-center gap-1.5 border border-blue-200/60 shadow-2xs shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>{t('Add', 'Tambah', '加购')}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination Controls (Centered Large Thumb-Friendly Mobile Bar) */}
            {filteredParts.length > 0 && (
              <div className="flex items-center justify-center gap-3 pt-2.5 pb-2 border-t border-slate-200/60 mt-1.5">
                <button
                  type="button"
                  disabled={partsPage <= 1}
                  onClick={() => setPartsPage(prev => Math.max(1, prev - 1))}
                  className="h-11 w-11 rounded-2xl border border-slate-200/90 bg-white shadow-xs flex items-center justify-center text-slate-800 hover:bg-slate-50 active:scale-90 disabled:opacity-20 transition-all shrink-0"
                  aria-label={t('Previous Page', 'Halaman Lalu', '上一页')}
                >
                  <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
                </button>

                <div className="h-11 px-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex items-center justify-center gap-1.5 font-mono select-none min-w-[5.5rem]">
                  <span className="text-sm font-black text-[#2563eb]">{partsPage}</span>
                  <span className="text-slate-300 font-bold text-xs">/</span>
                  <span className="text-xs font-bold text-slate-500">{totalPartsPages}</span>
                </div>

                <button
                  type="button"
                  disabled={partsPage >= totalPartsPages}
                  onClick={() => setPartsPage(prev => Math.min(totalPartsPages, prev + 1))}
                  className="h-11 w-11 rounded-2xl border border-slate-200/90 bg-white shadow-xs flex items-center justify-center text-slate-800 hover:bg-slate-50 active:scale-90 disabled:opacity-20 transition-all shrink-0"
                  aria-label={t('Next Page', 'Halaman Seterusnya', '下一页')}
                >
                  <ChevronRight className="w-5 h-5 stroke-[2.5]" />
                </button>
              </div>
            )}
          </div>
        ) : (
          // Orders List
          <div className="flex-1 flex flex-col justify-between">
            {filteredOrders.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-xs my-auto">
                <Package className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-700">
                  {t('No parts orders found', 'Tiada pesanan alat ganti', '未找到配件订单')}
                </p>
                <button
                  type="button"
                  onClick={() => setActiveView('browse')}
                  className="mt-3 text-xs text-[#2563eb] font-bold hover:underline"
                >
                  {t('Browse Catalog', 'Lihat Katalog', '去商城选购')}
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                {paginatedOrders.map((order) => (
                  <div
                    key={order.id}
                    onClick={() => navigate(`/parts-order/${order.id}`)}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200/70 bg-white hover:border-blue-300 hover:shadow-xs transition-all cursor-pointer active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                        <Package className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-mono font-bold text-xs text-slate-900 tracking-tight">
                          {order.bookingNumber}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                          {order.serviceDate ? formatDate(order.serviceDate) : ''} · {order.items?.length || 1} {t('items', 'item', '件商品')}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 text-right">
                      <div>
                        <p className="font-black text-xs text-[#2563eb] font-mono leading-tight">
                          RM {order.totalPrice}
                        </p>
                        <span className={`inline-block mt-0.5 px-1.5 py-0.2 rounded-full text-[9px] font-bold ${getStatusColor(order.status)}`}>
                          {getStatusLabel(order.status)}
                        </span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {filteredOrders.length > 0 && (
              <div className="flex items-center justify-center gap-3 pt-2.5 pb-2 border-t border-slate-200/60 mt-1.5">
                <button
                  type="button"
                  disabled={ordersPage <= 1}
                  onClick={() => setOrdersPage(prev => Math.max(1, prev - 1))}
                  className="h-11 w-11 rounded-2xl border border-slate-200/90 bg-white shadow-xs flex items-center justify-center text-slate-800 hover:bg-slate-50 active:scale-90 disabled:opacity-20 transition-all shrink-0"
                  aria-label={t('Previous Page', 'Halaman Lalu', '上一页')}
                >
                  <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
                </button>

                <div className="h-11 px-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex items-center justify-center gap-1.5 font-mono select-none min-w-[5.5rem]">
                  <span className="text-sm font-black text-[#2563eb]">{ordersPage}</span>
                  <span className="text-slate-300 font-bold text-xs">/</span>
                  <span className="text-xs font-bold text-slate-500">{totalOrdersPages}</span>
                </div>

                <button
                  type="button"
                  disabled={ordersPage >= totalOrdersPages}
                  onClick={() => setOrdersPage(prev => Math.min(totalOrdersPages, prev + 1))}
                  className="h-11 w-11 rounded-2xl border border-slate-200/90 bg-white shadow-xs flex items-center justify-center text-slate-800 hover:bg-slate-50 active:scale-90 disabled:opacity-20 transition-all shrink-0"
                  aria-label={t('Next Page', 'Halaman Seterusnya', '下一页')}
                >
                  <ChevronRight className="w-5 h-5 stroke-[2.5]" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
