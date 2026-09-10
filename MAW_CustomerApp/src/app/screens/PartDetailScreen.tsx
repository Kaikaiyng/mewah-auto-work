import { useState } from 'react';
import { ArrowLeft, CheckCircle, Minus, Package, Plus, ShoppingCart, XCircle } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { DataState } from '../components/DataState';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';
import { useCart } from '../context/CartContext';
import { useCustomerData } from '../context/CustomerDataContext';
import { useLanguage } from '../context/LanguageContext';

export function PartDetailScreen() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { id } = useParams();
  const { data, isLoading, error, reload } = useCustomerData();
  const { addToCart, getTotalItems } = useCart();
  const [quantity, setQuantity] = useState(1);
  if (!data) return <DataState isLoading={isLoading} error={error} onRetry={() => void reload()} />;
  const part = data.parts.find((item) => item.id === id);
  if (!part) return <div className="min-h-screen grid place-items-center text-gray-500">Part not found</div>;
  return (
    <div className="min-h-screen bg-[#eef3fb] pb-44 max-w-md mx-auto">
      <header className="maw-page-header sticky top-0 z-40 relative flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-gray-700 ring-1 ring-blue-100 shadow-sm hover:bg-blue-50 transition-colors"
          aria-label={t('Back', 'Kembali', '返回')}
        >
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <h1 className="text-base font-bold text-center absolute left-1/2 -translate-x-1/2 pointer-events-none truncate max-w-[200px]">
          {t('Part Details', 'Butiran Alat Ganti', '配件详情')}
        </h1>
        <button
          onClick={() => navigate('/cart')}
          className="relative w-10 h-10 rounded-full bg-white flex items-center justify-center text-[#2563eb] ring-1 ring-blue-100 shadow-sm hover:bg-blue-50 transition-colors"
          aria-label={t('Cart', 'Troli', '购物车')}
        >
          <ShoppingCart className="w-5 h-5" />
          {getTotalItems() > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center">
              {getTotalItems()}
            </span>
          )}
        </button>
      </header>
      <ImageWithFallback src={part.image} alt={part.name} className="w-full aspect-square object-cover bg-gray-100" />
      <main className="px-5 pt-4 pb-28 space-y-4">
        <div>
          <p className="text-sm text-[#2563eb] font-medium">{part.category}</p>
          <h2 className="text-2xl font-bold mt-1">{part.name}</h2>
          <p className="text-2xl font-bold text-[#2563eb] mt-3">RM {part.price.toFixed(2)}</p>
        </div>
        <Card className="rounded-2xl border-0 shadow-sm"><CardContent className="p-5 space-y-3">
          {part.inStock ? (
            <div className="flex items-center gap-2 font-medium text-green-700"><CheckCircle className="h-5 w-5" />{t('In Stock', 'Ada Stok', '现货')}</div>
          ) : (
            <div className="flex items-center gap-2 font-medium text-red-600"><XCircle className="h-5 w-5" />{t('Out of Stock', 'Tiada Stok', '缺货')}</div>
          )}
          <p className="text-gray-600 leading-relaxed">{part.description || `Workshop-grade ${part.name.toLowerCase()} for commercial vehicle servicing and maintenance.`}</p>
          <div className="flex items-center gap-2 text-sm text-gray-500"><Package className="w-4 h-4" />{t('Pickup or delivery available at checkout', 'Pengambilan atau penghantaran tersedia semasa pembayaran', '结账时可选择自提或送货')}</div>
        </CardContent></Card>
      </main>
      <div className="fixed bottom-0 left-1/2 z-50 w-full max-w-md -translate-x-1/2 border-t border-slate-200 bg-white/95 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur-xl">
        {part.inStock && (
          <div className="mb-3 flex items-center justify-center gap-4">
            <button
              type="button"
              aria-label="Decrease quantity"
              disabled={quantity <= 1}
              onClick={() => setQuantity((current) => Math.max(1, current - 1))}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 disabled:opacity-35"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-10 text-center text-lg font-semibold">{quantity}</span>
            <button
              type="button"
              aria-label="Increase quantity"
              disabled={part.stock !== undefined && quantity >= part.stock}
              onClick={() => setQuantity((current) => Math.min(current + 1, part.stock ?? Number.MAX_SAFE_INTEGER))}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 disabled:opacity-35"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        )}
        <Button
          disabled={!part.inStock}
          onClick={() => {
            addToCart({
              id: part.id,
              name: part.name,
              price: part.price,
              image: part.image,
              category: part.category,
              maxStock: part.stock,
            }, quantity);
            toast.success(`Added ${quantity} to cart`);
            setQuantity(1);
          }}
          className="w-full h-12 rounded-xl bg-[#2563eb]"
        >
          Add to Cart
        </Button>
      </div>
    </div>
  );
}
