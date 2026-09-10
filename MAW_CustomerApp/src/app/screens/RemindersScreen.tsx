import React from 'react';
import { useNavigate } from 'react-router';
import { Bell, Calendar, Gauge, ChevronRight, Car, Plus } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useLanguage } from '../context/LanguageContext';
import { useCustomerData } from '../context/CustomerDataContext';
import { DataState } from '../components/DataState';
import { getMileageState, getReminderDateState, formatDate } from '../lib/dateTime';
import { useBooking } from '../context/BookingContext';

export function RemindersScreen() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { data, isLoading, error, reload } = useCustomerData();
  const { updateBookingData } = useBooking();
  const reminder = data?.reminders[0];

  const reminderVehicle = data?.user.vehicles.find(v => v.id === reminder?.vehicleId);
  const dateState = reminder ? getReminderDateState(reminder.nextServiceDate) : null;
  const mileageState = reminderVehicle && reminder
    ? getMileageState(reminderVehicle.mileage, reminder.recommendedMileage)
    : null;

  if (!data) {
    return <DataState isLoading={isLoading} error={error} onRetry={() => void reload()} />;
  }

  const vehicles = data.user.vehicles || [];

  return (
    <div className="min-h-screen bg-[#eef3fb] max-w-md mx-auto">
      {/* Header */}
      <div className="maw-page-header sticky top-0 z-40 relative flex items-center justify-between">
        <div className="w-10" />
        <h1 className="text-base font-bold text-center truncate max-w-[220px]">
          {t('Vehicles & Equipment', 'Kenderaan & Peralatan', '车辆与设备')}
        </h1>
        <button
          type="button"
          onClick={() => navigate('/add-vehicle')}
          className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-[#2563eb] ring-1 ring-blue-100 shadow-sm hover:bg-blue-50 transition-colors"
          aria-label={t('Add Vehicle', 'Tambah Kenderaan', '添加车辆')}
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* Main Content */}
      <div className="px-5 pt-4 pb-28 space-y-4">
        {/* Next Service Due Reminder Alert (Prominently featured when active) */}
        {reminder && reminderVehicle && (
          <Card className="rounded-2xl shadow-lg border-0 bg-gradient-to-br from-[#2563eb] to-[#3b82f6]">
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                      <Bell className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-white/80 text-xs">
                        {t('Next Service Due', 'Servis Seterusnya', '下次服务到期')}
                      </p>
                      <h3 className="text-white font-bold text-base">
                        {reminder.serviceType}
                      </h3>
                    </div>
                  </div>
                </div>
                <span className="px-3 py-1 bg-yellow-400 text-yellow-900 text-xs rounded-full font-semibold capitalize">
                  {reminder.status === 'booked' || reminder.status === 'completed'
                    ? reminder.status
                    : dateState?.status === 'overdue'
                    ? t('Overdue', 'Lewat', '已逾期')
                    : t('Due Soon', 'Akan Tiba', '即将到期')}
                </span>
              </div>

              {/* Vehicle Information */}
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
                    <Car className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-white">
                      {reminderVehicle.regNo}
                    </p>
                    <p className="text-xs text-white/70 mt-0.5">
                      {reminderVehicle.equipment && reminderVehicle.equipment !== '-'
                        ? reminderVehicle.equipment
                        : t('Vehicle', 'Kenderaan', '车辆')}
                    </p>
                    {reminderVehicle.vecNo && reminderVehicle.vecNo !== '-' ? (
                      <p className="text-xs text-white/70 mt-0.5">
                        {t('Unit Number', 'Nombor Unit', '单位编号')}: {reminderVehicle.vecNo}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="space-y-2.5 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 flex items-center justify-between">
                    <div>
                      <p className="text-white/70 text-xs">
                        {t('Date', 'Tarikh', '日期')}
                      </p>
                      <p className="text-white font-semibold text-sm">
                        {formatDate(reminder.nextServiceDate)}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-2xl font-bold text-white">
                        {dateState?.days}
                      </span>
                      <p className="text-xs text-white/70">
                        {dateState?.status === 'overdue'
                          ? t('days overdue', 'hari lewat', '天逾期')
                          : t('days left', 'hari lagi', '天剩余')}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Gauge className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 flex items-center justify-between">
                    <div>
                      <p className="text-white/70 text-xs">
                        {t('Mileage', 'Perbatuan', '里程')}
                      </p>
                      <p className="text-white font-semibold text-sm">
                        {reminder.recommendedMileage.toLocaleString()} km
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-2xl font-bold text-white">
                        {mileageState?.kilometres.toLocaleString()}
                      </span>
                      <p className="text-xs text-white/70">
                        {mileageState?.status === 'overdue'
                          ? t('km overdue', 'km lewat', '公里逾期')
                          : t('km left', 'km lagi', '公里剩余')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <Button
                disabled={reminder.status === 'booked' || reminder.status === 'completed'}
                onClick={() => {
                  updateBookingData({
                    vehicleId: reminder.vehicleId,
                    serviceType: reminder.serviceType.toLowerCase().includes('repair') ? 'repair' : 'maintenance',
                    reminderId: reminder.id,
                    returnTo: '/vehicles',
                  });
                  navigate('/booking/step1', { state: { from: '/vehicles' } });
                }}
                className="w-full h-12 bg-white hover:bg-white/90 text-[#2563eb] rounded-xl font-semibold flex items-center justify-center gap-2 transition-all"
              >
                {reminder.status === 'booked'
                  ? t('Service Booked', 'Servis Ditempah', '服务已预约')
                  : reminder.status === 'completed'
                  ? t('Service Completed', 'Servis Selesai', '服务已完成')
                  : t('Book Service Now', 'Tempah Servis Sekarang', '立即预订服务')}
                <ChevronRight className="w-5 h-5" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Vehicles List Section */}
        <div>
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="font-bold text-gray-800 text-sm">
              {t('Registered Vehicles', 'Kenderaan Berdaftar', '已登记车辆')} ({vehicles.length})
            </h3>
            <span className="text-xs font-medium text-slate-500">
              {t('Tap for history & details', 'Tekan untuk sejarah', '点击查看历史与详情')}
            </span>
          </div>

          {vehicles.length === 0 ? (
            <Card className="rounded-2xl border-0 shadow-md">
              <CardContent className="p-8 text-center">
                <Car className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-700 mb-1">
                  {t('No vehicles registered yet', 'Tiada kenderaan didaftarkan', '尚未登记任何车辆')}
                </p>
                <p className="text-xs text-slate-400 mb-4">
                  {t('Add your vehicle to track maintenance and book services', 'Tambah kenderaan anda untuk menjejak penyelenggaraan', '添加您的车辆以跟踪维保并快捷预约服务')}
                </p>
                <Button
                  onClick={() => navigate('/add-vehicle')}
                  className="bg-[#2563eb] text-white rounded-xl"
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  {t('Add Vehicle', 'Tambah Kenderaan', '添加车辆')}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {vehicles.map((vehicle) => (
                <Card 
                  key={vehicle.id}
                  className="rounded-2xl shadow-sm border border-white/80 bg-white cursor-pointer hover:shadow-md transition-shadow active:scale-[0.99]"
                  onClick={() => navigate(`/vehicle/${vehicle.id}`, { state: { from: '/vehicles' } })}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">
                          <Car className="w-6 h-6 text-[#2563eb]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-gray-900 text-base leading-snug truncate">{vehicle.regNo}</p>
                          <p className="text-xs text-gray-500 truncate">
                            {vehicle.equipment && vehicle.equipment !== '-'
                              ? vehicle.equipment
                              : t('Vehicle', 'Kenderaan', '车辆')}
                          </p>
                          {vehicle.vecNo && vehicle.vecNo !== '-' ? (
                            <p className="text-[11px] font-medium text-blue-600 truncate mt-0.5">
                              {t('Unit', 'Unit', '单位')}: {vehicle.vecNo}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400 shrink-0" />
                    </div>
                    
                    <div className="mt-3.5 pt-3 border-t border-gray-100 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-gray-400 text-[11px] mb-0.5">
                          {t('Current Mileage', 'Perbatuan Semasa', '当前里程')}
                        </p>
                        <p className="font-semibold text-gray-800">
                          {(vehicle.mileage || 0).toLocaleString()} km
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-400 text-[11px] mb-0.5">
                          {t('Last Service', 'Servis Terakhir', '上次服务')}
                        </p>
                        <p className="font-semibold text-gray-800">
                          {vehicle.lastServiceMileage ? `${vehicle.lastServiceMileage.toLocaleString()} km` : '-'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
