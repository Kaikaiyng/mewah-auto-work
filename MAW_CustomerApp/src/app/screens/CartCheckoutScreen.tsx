import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, MapPin, Phone, UserCircle, CheckCircle } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { useLanguage } from '../context/LanguageContext';
import { useCart } from '../context/CartContext';
import { useCustomerData } from '../context/CustomerDataContext';
import { DataState } from '../components/DataState';
import { toast } from 'sonner';

export function CartCheckoutScreen() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { items, getTotalPrice, clearCart } = useCart();
  const { data, isLoading, error, reload, createPartsOrder } = useCustomerData();
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAddressDialog, setShowAddressDialog] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState<string | undefined>();
  const [selectedPickupCentreId, setSelectedPickupCentreId] = useState<string | undefined>();
  const [fulfilmentMethod, setFulfilmentMethod] = useState<'pickup' | 'delivery'>('delivery');
  const orderSubmitted = React.useRef(false);

  useEffect(() => {
    if (!selectedAddressId && data) {
      setSelectedAddressId(data.user.deliveryAddresses.find((address) => address.isDefault)?.id);
    }
  }, [data, selectedAddressId]);

  // Redirect to parts if no items
  useEffect(() => {
    if (items.length === 0 && !orderSubmitted.current) {
      navigate('/parts', { replace: true });
    }
  }, [items.length, navigate]);

  // Get selected delivery address
  const selectedAddress = data?.user.deliveryAddresses?.find(
    addr => addr.id === selectedAddressId
  );
  const selectedPickupCentre = data?.serviceCentres.find(
    centre => centre.id === selectedPickupCentreId
  );

  const handleSelectAddress = (addressId: string) => {
    setSelectedAddressId(addressId);
    setShowAddressDialog(false);
    toast.success(t('Address updated', '地址已更新'));
  };

  const handleSubmitOrder = async () => {
    if (items.length === 0) {
      navigate('/parts', { replace: true });
      return;
    }

    if (fulfilmentMethod === 'delivery' && !selectedAddress) {
      toast.error(t('Please select a delivery address', '请选择送货地址'))
      return;
    }
    if (fulfilmentMethod === 'pickup' && !selectedPickupCentre) {
      toast.error(t('Please select a pickup branch', 'Sila pilih cawangan pengambilan', '请选择取货分行'));
      return;
    }

    setLoading(true);
    try {
      const order = await createPartsOrder({
        totalPrice: getTotalPrice(),
        deliveryAddress: fulfilmentMethod === 'delivery'
          ? selectedAddress?.address
          : selectedPickupCentre?.address,
        serviceCentre: fulfilmentMethod === 'pickup' ? selectedPickupCentre?.name : undefined,
        fulfilmentMethod,
        notes: notes || undefined,
        items: items.map(item => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          image: item.image
        }))
      });
      orderSubmitted.current = true;
      clearCart();
      toast.success(t('Order placed successfully!', 'Pesanan berjaya dibuat!', '订单提交成功！'), {
        description: `${t('Order Number', 'Nombor Pesanan', '订单号')}: ${order.bookingNumber}`
      });
      navigate(`/parts-order/${order.id}`, { replace: true });
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : t('Unable to place order', 'Pesanan tidak dapat dibuat', '无法提交订单'));
    } finally {
      setLoading(false);
    }
  };

  if (!data) {
    return <DataState isLoading={isLoading} error={error} onRetry={() => void reload()} />;
  }

  return (
    <div className="min-h-screen bg-[#eef3fb] pb-32 max-w-md mx-auto">
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
          {t('Checkout', 'Pembayaran', '结账')}
        </h1>
        <div className="w-10" />
      </div>

      <div className="px-5 pt-4 pb-28 space-y-4">
        <Card className="rounded-2xl shadow-md border-0">
          <CardContent className="p-4">
            <h2 className="font-semibold mb-3">{t('Fulfilment', 'Pemenuhan', '履行方式')}</h2>
            <div className="grid grid-cols-2 gap-2">
              {(['delivery', 'pickup'] as const).map((method) => (
                <button
                  key={method}
                  onClick={() => setFulfilmentMethod(method)}
                  className={`rounded-xl border-2 p-3 text-sm font-medium capitalize ${fulfilmentMethod === method ? 'border-[#2563eb] bg-blue-50 text-[#2563eb]' : 'border-gray-200'}`}
                >
                  {method}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
        {/* Order Summary */}
        <Card className="rounded-2xl shadow-md border-0">
          <CardContent className="p-4">
            <h2 className="font-semibold mb-3">
              {t('Order Summary', '订单摘要')}
            </h2>
            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex justify-between items-center py-2 border-b last:border-0"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium line-clamp-1">{item.name}</p>
                    <p className="text-xs text-gray-500">
                      {item.quantity} x RM {item.price}
                    </p>
                  </div>
                  <span className="font-semibold text-sm">
                    RM {(item.price * item.quantity).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center pt-3 mt-3 border-t-2">
              <span className="font-semibold">
                {t('Total', '总计')}
              </span>
              <span className="text-xl font-bold text-[#2563eb]">
                RM {getTotalPrice().toFixed(2)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Delivery Address */}
        {fulfilmentMethod === 'delivery' && <Card className="rounded-2xl shadow-md border-0">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">
                {t('Delivery Address', '送货地址')}
              </h2>
              <button
                onClick={() => setShowAddressDialog(true)}
                className="text-[#2563eb] text-sm font-medium hover:underline"
              >
                {t('Change', '更改')}
              </button>
            </div>
            {selectedAddress ? (
              <div className="space-y-2">
                {/* Address */}
                <div className="flex gap-3 items-start">
                  <MapPin className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-gray-700 leading-relaxed">
                      {selectedAddress.address}
                    </p>
                  </div>
                </div>
                
                {/* Contact Name */}
                <div className="flex gap-3 items-start">
                  <UserCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs text-gray-500">
                      {t('Contact Name', '联系人名字')}
                    </p>
                    <p className="text-sm text-gray-800">
                      {selectedAddress.contactName}
                    </p>
                  </div>
                </div>
                
                {/* Contact Phone */}
                <div className="flex gap-3 items-start">
                  <Phone className="w-5 h-5 text-green-600 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs text-gray-500">
                      {t('Contact Phone', '联系电话')}
                    </p>
                    <p className="text-sm text-gray-800">
                      {selectedAddress.contactPhone}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-amber-50 rounded-xl p-3 border border-amber-200">
                <p className="text-sm text-amber-800">
                  {t(
                    'Please select a delivery address.',
                    '请选择送货地址。'
                  )}
                </p>
                <button
                  onClick={() => setShowAddressDialog(true)}
                  className="text-[#2563eb] text-sm font-medium mt-2 hover:underline"
                >
                  {t('Select Address', '选择地址')}
                </button>
              </div>
            )}
          </CardContent>
        </Card>}

        {/* Pickup Branch */}
        {fulfilmentMethod === 'pickup' && (
          <Card className="rounded-2xl shadow-md border-0">
            <CardContent className="p-4">
              <h2 className="font-semibold mb-1">
                {t('Pickup Branch', 'Cawangan Pengambilan', '取货分行')}
              </h2>
              <p className="mb-3 text-sm text-gray-500">
                {t('Select where you would like to collect your order.', 'Pilih lokasi untuk mengambil pesanan anda.', '选择您要领取订单的地点。')}
              </p>
              <div className="space-y-3">
                {data.serviceCentres.map((centre) => {
                  const isSelected = selectedPickupCentreId === centre.id;
                  return (
                    <button
                      key={centre.id}
                      type="button"
                      onClick={() => setSelectedPickupCentreId(centre.id)}
                      className={`w-full rounded-xl border-2 p-4 text-left transition-all ${
                        isSelected
                          ? 'border-[#2563eb] bg-blue-50'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                          isSelected ? 'bg-[#2563eb]' : 'bg-gray-100'
                        }`}>
                          <MapPin className={`h-5 w-5 ${isSelected ? 'text-white' : 'text-gray-500'}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-gray-800">{centre.name}</p>
                          <p className="mt-1 text-sm leading-relaxed text-gray-600">{centre.address}</p>
                          <p className="mt-1 text-sm font-medium text-[#2563eb]">
                            {t('Tel:', 'Tel:', '电话：')} {centre.phone}
                          </p>
                        </div>
                        <div className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                          isSelected ? 'border-[#2563eb] bg-[#2563eb]' : 'border-gray-300'
                        }`}>
                          {isSelected && <div className="h-2 w-2 rounded-full bg-white" />}
                        </div>
                      </div>
                    </button>
                  );
                })}
                {data.serviceCentres.length === 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    {t('No pickup branch is currently available.', 'Tiada cawangan pengambilan tersedia.', '目前没有可用的取货分行。')}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Additional Notes */}
        <Card className="rounded-2xl shadow-md border-0">
          <CardContent className="p-4">
            <h2 className="font-semibold mb-3">
              {t('Additional Notes', '附加备注')} ({t('Optional', '可选')})
            </h2>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t(
                'Any special requests or instructions...',
                '任何特殊要求或说明...'
              )}
              className="min-h-24 rounded-xl"
            />
          </CardContent>
        </Card>
      </div>

      {/* Bottom Button */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4 shadow-lg">
        <div className="max-w-lg mx-auto">
          <Button
            onClick={handleSubmitOrder}
            disabled={
              loading
              || (fulfilmentMethod === 'delivery' && !selectedAddress)
              || (fulfilmentMethod === 'pickup' && !selectedPickupCentre)
            }
            className="w-full bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-xl h-12 font-semibold disabled:opacity-50"
          >
            {loading
              ? t('Processing...', '处理中...')
              : t('Place Order', '提交订单')}
          </Button>
        </div>
      </div>

      {/* Address Selection Dialog */}
      <Dialog open={showAddressDialog} onOpenChange={setShowAddressDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader className="border-b border-slate-200 bg-white px-5 py-4 pr-12 text-left">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#2563eb]">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-slate-900">
                  {t('Select Delivery Address', '选择送货地址')}
                </DialogTitle>
                <p className="mt-0.5 text-xs text-slate-500">
                  {t('Choose where this order should be delivered', '选择此订单的送货地点')}
                </p>
              </div>
            </div>
          </DialogHeader>
          
          <div className="max-h-[68vh] space-y-3 overflow-y-auto bg-slate-50 p-4">
            {data.user.deliveryAddresses.length > 0 ? (
              data.user.deliveryAddresses.map((addr) => (
                <div
                  key={addr.id}
                  onClick={() => handleSelectAddress(addr.id)}
                  className={`
                    relative cursor-pointer rounded-xl border-2 p-4 shadow-sm transition-all
                    ${
                      selectedAddressId === addr.id
                        ? 'border-[#2563eb] bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }
                  `}
                >
                  {/* Selected Indicator */}
                  {selectedAddressId === addr.id && (
                    <div className="absolute top-3 right-3">
                      <CheckCircle className="w-5 h-5 text-[#2563eb]" />
                    </div>
                  )}

                  {/* Address Info */}
                  <div className="space-y-2 pr-8">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-800">{addr.contactName}</p>
                      {addr.isDefault && (
                        <span className="text-xs bg-[#2563eb] text-white px-2 py-0.5 rounded">
                          {t('Default', '默认')}
                        </span>
                      )}
                    </div>
                    
                    <div className="flex gap-2 items-start">
                      <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-gray-600 leading-relaxed">
                        {addr.address}
                      </p>
                    </div>
                    
                    <div className="flex gap-2 items-center">
                      <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <p className="text-sm text-gray-600">
                        {addr.contactPhone}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 mb-4">
                  {t('No addresses found', '未找到地址')}
                </p>
                <Button
                  onClick={() => {
                    setShowAddressDialog(false);
                    navigate('/profile');
                  }}
                  className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-xl"
                >
                  {t('Add Address in Profile', '在个人资料中添加地址')}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
