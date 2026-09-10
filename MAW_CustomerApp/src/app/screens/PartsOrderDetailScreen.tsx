import React from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, Package, Calendar, MapPin, UserCircle, Phone, CheckCircle, Download, Share2 } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useLanguage } from '../context/LanguageContext';
import { useCustomerData } from '../context/CustomerDataContext';
import { DataState } from '../components/DataState';
import { bookingStatusLabel } from '../lib/status';

export function PartsOrderDetailScreen() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { t } = useLanguage();
  const { data, isLoading, error, reload } = useCustomerData();

  const order = data?.bookings.find((b) => b.id === id && b.orderType === 'parts');
  const isPickup = order?.fulfilmentMethod === 'pickup'
    || Boolean(order?.serviceCentre && order.serviceCentre !== 'Customer Parts Order');
  const deliveryContact = !isPickup
    ? data?.user.deliveryAddresses.find((address) => address.address === order?.deliveryAddress)
      || data?.user.deliveryAddresses.find((address) => address.isDefault)
    : undefined;

  if (!data) {
    return <DataState isLoading={isLoading} error={error} onRetry={() => void reload()} />;
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-[#eef3fb] flex flex-col items-center justify-center">
        <div className="text-center">
          <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">{t('Order not found', '订单未找到')}</p>
          <Button
            onClick={() => navigate('/parts')}
            className="mt-4 bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-xl"
          >
            {t('Back to Parts', '返回配件')}
          </Button>
        </div>
    </div>
  );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'preparing':
        return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'ready':
        return 'bg-teal-100 text-teal-700 border-teal-200';
      case 'completed':
        return 'bg-green-100 text-green-700 border-green-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getStatusLabel = (status: string) => {
    return bookingStatusLabel(status, 'parts');
  };

  return (
    <div className="min-h-screen bg-[#eef3fb]">
      {/* Header */}
      <div className="maw-page-header sticky top-0 z-40 relative flex items-center justify-between">
        <button
          onClick={() => navigate('/bookings')}
          className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-gray-700 ring-1 ring-blue-100 shadow-sm hover:bg-blue-50 transition-colors"
          aria-label={t('Back', 'Kembali', '返回')}
        >
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <div className="text-center absolute left-1/2 -translate-x-1/2 pointer-events-none truncate max-w-[180px]">
          <h1 className="text-base font-bold truncate">{t('Order Details', 'Butiran Pesanan', '订单详情')}</h1>
          <p className="text-[10px] text-gray-500 font-medium truncate">{order.bookingNumber}</p>
        </div>
        <div className="w-10" />
      </div>

      <div className="px-5 pt-4 pb-28 space-y-4">
        {/* Status Card */}
        <Card className="rounded-2xl shadow-md border-0">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                <Package className="w-6 h-6 text-green-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-500 mb-1">
                  {t('Order Status', '订单状态')}
                </p>
                <div
                  className={`inline-block px-4 py-2 rounded-full text-sm font-medium border ${getStatusColor(
                    order.status
                  )}`}
                >
                  {getStatusLabel(order.status)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Order Timeline */}
        <Card className="rounded-2xl shadow-md border-0">
          <CardContent className="p-6">
            <h2 className="font-semibold text-lg mb-4">{t('Order Timeline', 'Garis Masa Pesanan', '订单时间线')}</h2>
            <div className="space-y-4">
              {(order.timeline || [
                { id: 'placed', label: 'Order placed', date: order.serviceDate || '', completed: true },
                { id: 'processing', label: 'Processing', date: ['preparing', 'ready', 'shipped', 'completed'].includes(order.status) ? (order.serviceDate || '') : '', completed: ['preparing', 'ready', 'shipped', 'completed'].includes(order.status) },
                { id: 'fulfilled', label: isPickup ? 'Ready for pickup' : 'Dispatched', date: ['ready', 'shipped', 'completed'].includes(order.status) ? (order.serviceDate || '') : '', completed: ['ready', 'shipped', 'completed'].includes(order.status) },
                { id: 'complete', label: 'Completed', date: order.status === 'completed' ? (order.serviceDate || '') : '', completed: order.status === 'completed' },
              ]).map((event, eventIdx) => {
                const isCompleted = Boolean(event.completed);
                const hasDate = Boolean(event.date);
                return (
                  <div key={event.id || eventIdx} className="flex gap-3.5">
                    <div className="flex flex-col items-center">
                      <div className={`mt-1 h-3.5 w-3.5 rounded-full flex-shrink-0 transition-all ${isCompleted ? 'bg-emerald-500 ring-4 ring-emerald-100' : 'bg-slate-200'}`} />
                      {eventIdx < 3 ? <div className={`w-0.5 my-1 flex-1 min-h-6 ${isCompleted ? 'bg-emerald-200' : 'bg-slate-200'}`} /> : null}
                    </div>
                    <div className="flex-1 pb-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-sm ${isCompleted ? 'font-bold text-slate-900' : 'font-medium text-slate-400'}`}>
                          {event.label === 'Order placed' ? t('Order placed', 'Pesanan dibuat', '订单已提交') :
                           event.label === 'Processing' ? t('Processing', 'Sedang diproses', '备货处理中') :
                           event.label === 'Ready for pickup' ? t('Ready for pickup', 'Sedia untuk diambil', '已备好待取') :
                           event.label === 'Dispatched' ? t('Dispatched', 'Dihantar', '已发货') :
                           event.label === 'Completed' ? t('Completed', 'Selesai', '订单已完成') : event.label}
                        </p>
                      </div>
                      {hasDate ? (
                        <p className="text-xs font-mono text-slate-500 mt-0.5">
                          {new Date(event.date).toLocaleString('en-GB', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            hour12: false
                          })}
                        </p>
                      ) : isCompleted ? (
                        <p className="text-xs text-emerald-600 mt-0.5">
                          ✓ {t('Completed', 'Selesai', '已处理完成')}
                        </p>
                      ) : (
                        <p className="text-xs text-slate-400 italic mt-0.5">
                          {t('Pending', 'Menunggu', '待处理')}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Order Items */}
        <Card className="rounded-2xl shadow-md border-0">
          <CardContent className="p-6">
            <h2 className="font-semibold text-lg mb-4">
              {t('Order Items', '订单商品')}
            </h2>
            <div className="space-y-4">
              {order.items?.map((item) => (
                <div key={item.id} className="flex gap-4">
                  {item.image && (
                    <div className="w-20 h-20 bg-gray-100 rounded-xl overflow-hidden flex-shrink-0">
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="flex-1">
                    <h3 className="font-medium mb-1">{item.name}</h3>
                    <p className="text-sm text-gray-500 mb-2">
                      {t('Quantity', '数量')}: {item.quantity}
                    </p>
                    <p className="font-semibold text-[#2563eb]">
                      RM {item.price * item.quantity}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t mt-4 pt-4">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-lg">
                  {t('Total', '总计')}
                </span>
                <span className="font-bold text-xl text-[#2563eb]">
                  RM {order.totalPrice}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Fulfilment Information */}
        <Card className="rounded-2xl shadow-md border-0">
          <CardContent className="p-6">
            <h2 className="font-semibold text-lg mb-4">
              {isPickup
                ? t('Pickup Information', 'Maklumat Pengambilan', '取货信息')
                : t('Delivery Information', 'Maklumat Penghantaran', '送货信息')}
            </h2>
            <div className="space-y-4">
              {order.serviceDate && (
                <div className="flex gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 mb-1">
                      {t('Order Date', '订购日期')}
                    </p>
                    <p className="text-gray-800">
                      {new Date(order.serviceDate).toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true
                      })}
                    </p>
                  </div>
                </div>
              )}

              {(order.deliveryAddress || (isPickup && order.serviceCentre)) && (
                <div className="flex gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 mb-1">
                      {isPickup
                        ? t('Pickup Branch', 'Cawangan Pengambilan', '取货分行')
                        : t('Delivery Address', 'Alamat Penghantaran', '送货地址')}
                    </p>
                    {isPickup && order.serviceCentre && (
                      <p className="font-medium text-gray-800">{order.serviceCentre}</p>
                    )}
                    <p className="text-gray-800 leading-relaxed">
                      {order.deliveryAddress}
                    </p>
                  </div>
                </div>
              )}

              {deliveryContact && (
                <>
                  <div className="flex gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <UserCircle className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 mb-1">
                        {t('Contact Name', '联系人名字')}
                      </p>
                      <p className="text-gray-800">{deliveryContact.contactName}</p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                      <Phone className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 mb-1">
                        {t('Contact Phone', '联系电话')}
                      </p>
                      <p className="text-gray-800">{deliveryContact.contactPhone}</p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Official Invoice & Delivery Order */}
        {order.invoice && (
          <Card className="rounded-2xl shadow-md border-0 bg-gradient-to-br from-blue-50 to-indigo-50/50">
            <CardContent className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-lg text-slate-900">
                    {t('Official Document', 'Dokumen Rasmi', '官方单据')}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {order.invoice.autocountDoNo ? `DO: ${order.invoice.autocountDoNo}` : `Ref: ${order.bookingNumber}`}
                  </p>
                </div>
                <Button
                  onClick={() => navigate(`/invoice/${order.id}`)}
                  className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-xl text-xs font-bold gap-1.5 shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  {t('View / Download Invoice', 'Lihat / Muat Turun Invois', '查看/下载发票')}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  );
}
