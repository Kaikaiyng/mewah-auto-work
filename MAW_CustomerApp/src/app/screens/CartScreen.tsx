import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Trash2, Plus, Minus, ShoppingCart } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useLanguage } from '../context/LanguageContext';
import { useCart } from '../context/CartContext';
import { toast } from 'sonner';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';

export function CartScreen() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { items, removeFromCart, updateQuantity, getTotalPrice, clearCart } = useCart();

  const handleCheckout = () => {
    if (items.length === 0) return;
    
    // Navigate to checkout page
    navigate('/cart/checkout');
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-[#eef3fb] max-w-md mx-auto">
        {/* Header */}
        <div className="maw-page-header sticky top-0 z-40 bg-[#2563eb] text-white p-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/parts')}
              className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold">{t('Shopping Cart', '购物车')}</h1>
            </div>
          </div>
        </div>

        {/* Empty Cart */}
        <div className="flex flex-col items-center justify-center py-20 px-4">
          <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center mb-6">
            <ShoppingCart className="w-12 h-12 text-gray-400" />
          </div>
          <h2 className="text-xl font-semibold mb-2">
            {t('Your cart is empty', '购物车是空的')}
          </h2>
          <p className="text-gray-500 text-center mb-6">
            {t('Add some parts to get started', '添加一些配件以开始购物')}
          </p>
          <Button
            onClick={() => navigate('/parts')}
            className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-xl px-8"
          >
            {t('Browse Parts', '浏览配件')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#eef3fb] pb-32 max-w-md mx-auto">
      {/* Header */}
      <div className="maw-page-header sticky top-0 z-40 relative flex items-center justify-between">
        <button
          onClick={() => navigate('/parts')}
          className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-gray-700 ring-1 ring-blue-100 shadow-sm hover:bg-blue-50 transition-colors"
          aria-label={t('Back', 'Kembali', '返回')}
        >
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <div className="text-center absolute left-1/2 -translate-x-1/2 pointer-events-none truncate max-w-[180px]">
          <h1 className="text-base font-bold truncate">{t('Shopping Cart', 'Troli Beli-belah', '购物车')}</h1>
          <p className="text-[10px] text-gray-500 font-medium">
            {items.length} {t('items', 'item', '件商品')}
          </p>
        </div>
        <button
          onClick={() => {
            clearCart();
            toast.success(t('Cart cleared', 'Troli dikosongkan', '购物车已清空'));
          }}
          className="text-xs font-semibold text-red-600 hover:text-red-700 px-2 py-1"
        >
          {t('Clear All', 'Kosongkan', '清空')}
        </button>
      </div>

      {/* Cart Items */}
      <div className="px-5 pt-4 pb-28 space-y-4">
        {items.map((item) => (
          <Card key={item.id} className="rounded-2xl shadow-md border-0">
            <CardContent className="p-4">
              <div className="flex gap-3">
                <ImageWithFallback
                  src={item.image}
                  alt={item.name}
                  className="w-20 h-20 rounded-xl bg-gray-100 object-cover flex-shrink-0"
                />

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="text-xs text-gray-500 mb-1">{item.category}</p>
                      <h3 className="font-medium text-sm line-clamp-2">
                        {item.name}
                      </h3>
                    </div>
                    <button
                      onClick={() => {
                        removeFromCart(item.id);
                        toast.success(t('Removed from cart', '已从购物车移除'));
                      }}
                      className="text-red-500 hover:text-red-600 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Price and Quantity */}
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#2563eb]">
                      RM {(item.price * item.quantity).toFixed(2)}
                    </span>
                    
                    {/* Quantity Controls */}
                    <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        className="w-7 h-7 rounded flex items-center justify-center hover:bg-white transition-colors"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-8 text-center font-medium text-sm">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        disabled={item.maxStock !== undefined && item.quantity >= item.maxStock}
                        className="w-7 h-7 rounded flex items-center justify-center hover:bg-white transition-colors disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Bottom Summary */}
      <div className="sticky bottom-0 border-t border-slate-200/80 bg-[#eef3fb] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">
                {t('Total', '总计')} ({items.reduce((sum, item) => sum + item.quantity, 0)} {t('items', '件')})
              </p>
              <p className="text-2xl font-black text-[#2563eb]">
                RM {getTotalPrice().toFixed(2)}
              </p>
            </div>
            <Button
              onClick={handleCheckout}
              className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-2xl px-8 h-12 shadow-[0_8px_20px_rgba(37,99,235,0.25)] font-bold text-base active:scale-[0.98] transition-all"
            >
              {t('Checkout', '结账')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
