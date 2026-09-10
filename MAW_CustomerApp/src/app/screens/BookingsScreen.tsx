import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { Calendar, ChevronRight, Clock, Package, Wrench, MapPin, Building2, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { useLanguage } from '../context/LanguageContext';
import { useCustomerData } from '../context/CustomerDataContext';
import { DataState } from '../components/DataState';
import { bookingStatusLabel, serviceStatusColorClass, workOrderLabels } from '../lib/status';
import { BackToTopButton } from '../components/BackToTopButton';
import type { Booking } from '../types';

function getServiceDisplayStatus(booking: Booking) {
  return booking.workOrderStatus || booking.status;
}

function getServiceStatusLabel(booking: Booking) {
  return booking.workOrderStatus
    ? workOrderLabels[booking.workOrderStatus]
    : bookingStatusLabel(booking.status, 'service');
}

export function BookingsScreen() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('pending');
  const { data, isLoading, error, reload } = useCustomerData();
  const bookings = data?.bookings || [];

  const filteredBookings = bookings.filter((booking) => {
    // Only show service bookings, not parts orders
    if (booking.orderType !== 'service') {
      return false;
    }
    
    if (activeTab === 'pending') {
      return booking.workOrderStatus
        ? booking.workOrderStatus !== 'collected'
        : ['pending', 'confirmed', 'converted'].includes(booking.status);
    } else if (activeTab === 'completed') {
      return booking.workOrderStatus
        ? booking.workOrderStatus === 'collected'
        : booking.status === 'completed';
    }
    return true; // 'all' shows everything
  });

  const getStatusColor = (status: string) => {
    return serviceStatusColorClass(status);
  };

  const getStatusLabel = (status: string) => {
    return bookingStatusLabel(status, 'service');
  };

  if (!data) {
    return <DataState isLoading={isLoading} error={error} onRetry={() => void reload()} />;
  }

  return (
    <div className="min-h-screen bg-[#eef3fb] max-w-md mx-auto">
      {/* Header */}
      <div className="maw-page-header sticky top-0 z-40">
        <h1 className="text-base font-bold text-center w-full">{t('My Bookings', 'Tempahan Saya', '我的预订')}</h1>
      </div>

      {/* Tabs */}
      <div className="px-5 pt-3 pb-1">
        <div className="flex gap-2 rounded-2xl bg-slate-200/60 p-1">
          <button
            onClick={() => setActiveTab('pending')}
            className={`flex-1 rounded-xl py-2 px-3 text-xs font-bold transition-all ${
              activeTab === 'pending'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t('Pending', 'Belum Selesai', '待处理')}
          </button>
          <button
            onClick={() => setActiveTab('completed')}
            className={`flex-1 rounded-xl py-2 px-3 text-xs font-bold transition-all ${
              activeTab === 'completed'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t('Completed', 'Selesai', '已完成')}
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`flex-1 rounded-xl py-2 px-3 text-xs font-bold transition-all ${
              activeTab === 'all'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t('All', 'Semua', '全部')}
          </button>
        </div>
      </div>

      {/* Bookings List */}
      <div className="px-5 pt-4 pb-28 space-y-4">
        {filteredBookings.length === 0 ? (
          <div className="rounded-2xl border border-blue-100 bg-white/95 px-6 py-10 text-center shadow-[0_8px_24px_rgba(30,58,138,0.06)]">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
              <Calendar className="h-7 w-7 text-[#2563eb]" />
            </div>
            <h2 className="font-bold text-slate-900">{t('No bookings here yet', 'Belum ada tempahan di sini', '这里还没有预约')}</h2>
            <p className="mt-1 text-sm leading-5 text-gray-500">
              {activeTab === 'completed'
                ? t('Completed services will appear here.', 'Servis yang selesai akan dipaparkan di sini.', '已完成的服务会显示在这里。')
                : t('Book a service when your vehicle needs attention.', 'Tempah servis apabila kenderaan anda memerlukan pemeriksaan.', '车辆需要检查时可在这里预约服务。')}
            </p>
            {activeTab !== 'completed' && data.user.permissions.canCreateBooking ? (
              <button type="button" onClick={() => navigate('/booking/select-vehicle')} className="mt-5 h-11 rounded-xl bg-[#2563eb] px-5 text-sm font-semibold text-white shadow-sm active:bg-blue-700">
                {t('Book a Service', 'Tempah Servis', '预约服务')}
              </button>
            ) : null}
          </div>
        ) : (
          filteredBookings.map((booking) => {
            const vehicle = data.user.vehicles.find((item) => item.id === booking.vehicleId);
            const displayStatus = getServiceDisplayStatus(booking);
            return (
            <Card
              key={booking.id}
              className="rounded-2xl shadow-sm border border-white/80 cursor-pointer hover:shadow-md transition-shadow bg-white"
              onClick={() => {
                if (booking.workOrderId) {
                  navigate(`/repair-progress/${booking.workOrderId}`);
                } else {
                  navigate(`/booking/${booking.id}`);
                }
              }}
            >
              <CardContent className="p-5">
                <div className="bg-white rounded-xl p-4">
                {booking.orderType === 'parts' ? (
                  // Parts Order Card
                  <>
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                          <Package className="w-5 h-5 text-green-600" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg mb-1">
                            {t('Parts Order', '配件订单')}
                          </h3>
                          <p className="text-sm text-gray-500 mb-2">
                            {booking.bookingNumber}
                          </p>
                          <span
                            className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(
                              booking.status
                            )}`}
                          >
                            {getStatusLabel(booking.status)}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    </div>

                    {/* Parts Items Preview */}
                    {booking.items && booking.items.length > 0 && (
                      <div className="mb-3 space-y-2">
                        {booking.items.slice(0, 2).map((item) => (
                          <div key={item.id} className="flex items-center gap-2 text-sm text-gray-600">
                            <Package className="w-4 h-4" />
                            <span>
                              {item.quantity}x {item.name}
                            </span>
                          </div>
                        ))}
                        {booking.items.length > 2 && (
                          <p className="text-xs text-gray-500 ml-6">
                            +{booking.items.length - 2} {t('more items', '更多商品')}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="space-y-3">
                      {booking.serviceDate && (
                        <div className="flex items-center gap-3 text-sm text-gray-600">
                          <Calendar className="w-4 h-4" />
                          <span>
                            {t('Ordered on', '订购于')} {new Date(booking.serviceDate).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </span>
                        </div>
                      )}

                      {booking.deliveryAddress && (
                        <div className="flex items-start gap-3 text-sm text-gray-600">
                          <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                          <span className="line-clamp-1">{booking.deliveryAddress}</span>
                        </div>
                      )}

                      {booking.status === 'completed' && booking.totalPrice && (
                        <div className="flex justify-between items-center pt-3 border-t">
                          <span className="text-sm text-gray-600">
                            {t('Total', '总计')}
                          </span>
                          <span className="text-lg font-semibold text-[#2563eb]">
                            RM {booking.totalPrice}
                          </span>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  // Service Booking Card
                  <>
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex-1">
                        {/* Vehicle Info */}
                        <div className="mb-3">
                          <h3 className="font-bold text-base text-gray-900 mb-0.5">
                            {vehicle?.equipment || t('Vehicle', 'Kenderaan', '车辆')}
                          </h3>
                          <p className="text-sm text-gray-600 font-medium mb-1.5">
                            {vehicle?.regNo || '—'}
                          </p>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs text-gray-500 font-mono">
                                {booking.bookingNumber}
                              </span>
                              {booking.intakeType === 'rescue' || booking.requestChannel?.toLowerCase().includes('rescue') ? (
                                <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                                  <AlertTriangle className="h-3 w-3 text-rose-600" />
                                  {t('Rescue', '救援')}
                                </span>
                              ) : booking.intakeType === 'walk_in' ? (
                                <span className="inline-flex items-center gap-1 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                                  <Building2 className="h-3 w-3 text-blue-600" />
                                  {t('Walk-in', '到厂')}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                  <Calendar className="h-3 w-3 text-slate-500" />
                                  {t('Booking', '预约')}
                                </span>
                              )}
                            </div>
                        </div>

                        {/* Service Type */}
                        <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
                          <p className="text-xs text-gray-500">
                            {t('Service', 'Servis', '服务')}:
                          </p>
                          <p className="text-sm text-gray-900 font-medium">
                            {booking.serviceType}
                          </p>
                        </div>

                        <span
                          className={`inline-block px-3 py-1 rounded-full text-xs font-medium mt-2 ${getStatusColor(
                            displayStatus
                          )}`}
                        >
                          {getServiceStatusLabel(booking)}
                        </span>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0 ml-2" />
                    </div>

                    <div className="space-y-3">
                      {booking.serviceDate && (
                        <div className="flex items-center gap-3 text-sm text-gray-800">
                          <Calendar className="w-4 h-4" />
                          <span>
                            {new Date(booking.serviceDate).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </span>
                          <Clock className="w-4 h-4 ml-2" />
                          <span>
                            {new Date(booking.serviceDate).toLocaleTimeString('en-US', {
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true
                            })}
                          </span>
                        </div>
                      )}

                      {booking.serviceCentre && (
                        <p className="text-sm text-gray-700">
                          {booking.serviceCentre}
                        </p>
                      )}

                      {booking.status === 'completed' && booking.totalPrice && (
                        <div className="flex justify-between items-center pt-3 border-t">
                          <span className="text-sm text-gray-600">
                            {t('Total', '总计')}
                          </span>
                          <span className="text-lg font-semibold text-[#2563eb]">
                            RM {booking.totalPrice}
                          </span>
                        </div>
                      )}
                    </div>
                  </>
                )}
                </div>
              </CardContent>
            </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
