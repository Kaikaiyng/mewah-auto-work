import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Car, Plus, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useLanguage } from '../context/LanguageContext';
import { useCustomerData } from '../context/CustomerDataContext';
import { DataState } from '../components/DataState';

export function RegisteredVehiclesScreen() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { data, isLoading, error, reload } = useCustomerData();

  const activeWorkOrderVehicleIds = useMemo(() => {
    return new Set((data?.workOrders || []).filter(wo => wo.status !== 'collected').map(wo => wo.vehicleId));
  }, [data?.workOrders]);

  const vehicles = useMemo(() => {
    const list = data?.user.vehicles || [];
    return [...list].sort((a, b) => {
      const aIn = activeWorkOrderVehicleIds.has(a.id) ? 1 : 0;
      const bIn = activeWorkOrderVehicleIds.has(b.id) ? 1 : 0;
      if (aIn !== bIn) return bIn - aIn;
      return a.regNo.localeCompare(b.regNo, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [data?.user.vehicles, activeWorkOrderVehicleIds]);

  if (!data) {
    return <DataState isLoading={isLoading} error={error} onRetry={() => void reload()} />;
  }

  return (
    <div className="min-h-screen bg-[#eef3fb] max-w-md mx-auto">
      {/* Header */}
      <div className="maw-page-header sticky top-0 z-40 relative flex items-center justify-between">
        <button
          onClick={() => navigate('/home', { replace: true })}
          className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-gray-700 ring-1 ring-blue-100 shadow-sm hover:bg-blue-50 transition-colors"
          aria-label={t('Back', 'Kembali', '返回')}
        >
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <h1 className="text-base font-bold text-center absolute left-1/2 -translate-x-1/2 pointer-events-none truncate max-w-[200px]">
          {t('Vehicles & Equipment', 'Kenderaan & Peralatan', '车辆与设备')}
        </h1>
        <div className="w-10" />
      </div>

      <div className="px-5 pt-4 pb-28 space-y-4">
        {vehicles.length > 0 ? (
          vehicles.map((vehicle) => (
            <Card 
              key={vehicle.id} 
              className="rounded-2xl shadow-md border-0 cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => navigate(`/vehicle/${vehicle.id}`)}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <Car className="w-6 h-6 text-[#2563eb]" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800 text-sm">{t('Unit Number', 'Nombor Unit', '单位编号')}: {vehicle.vecNo}</p>
                      <p className="text-gray-600 text-sm">{t('Registration Number', 'Nombor Pendaftaran', '注册号码')}: {vehicle.regNo}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {[vehicle.brand, vehicle.model, vehicle.equipment].filter(Boolean).join(' • ')}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>
                
                {/* Vehicle Details Grid */}
                <div className="space-y-2 pt-3 border-t border-gray-100">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-50 p-2 rounded-lg">
                      <p className="text-xs text-gray-500">{t('Equipment Type', 'Jenis Peralatan', '设备类型')}</p>
                      <p className="text-sm font-medium text-gray-800">{vehicle.equipment}</p>
                    </div>
                    {vehicle.equipment === 'Container Chassis / Skeletal Trailer' ? (
                      <div className="bg-gray-50 p-2 rounded-lg">
                        <p className="text-xs text-gray-500">{t('Container / Axles', 'Kontena / Gandar', '集装箱 / 车轴')}</p>
                        <p className="text-sm font-medium text-gray-800">
                          {[vehicle.containerLength, vehicle.axleConfiguration].filter(Boolean).join(' • ') || t('N/A', 'T/A', '无')}
                        </p>
                      </div>
                    ) : (
                      <div className="bg-gray-50 p-2 rounded-lg">
                        <p className="text-xs text-gray-500">{t('Current Mileage', 'Perbatuan Semasa', '当前里程')}</p>
                        <p className="text-sm font-medium text-gray-800">{vehicle.mileage.toLocaleString()} km</p>
                      </div>
                    )}
                  </div>
                  {data.bookings.some((item) => item.vehicleId === vehicle.id && ['pending', 'confirmed'].includes(item.status)) && (
                    <span className="inline-block text-xs font-medium rounded-full bg-blue-100 text-blue-700 px-2 py-1">Upcoming booking</span>
                  )}
                  {data.workOrders.some((item) => item.vehicleId === vehicle.id && item.status !== 'collected') && (
                    <span className="inline-block ml-2 text-xs font-medium rounded-full bg-orange-100 text-orange-700 px-2 py-1">Repair active</span>
                  )}
                  {vehicle.verificationStatus === 'pending' && (
                    <span className="inline-block ml-2 text-xs font-medium rounded-full bg-amber-100 text-amber-800 px-2 py-1">
                      {t('Pending Verification', 'Menunggu Pengesahan', '待审核')}
                    </span>
                  )}
                  {vehicle.verificationStatus === 'approved' && (
                    <span className="inline-block ml-2 text-xs font-medium rounded-full bg-green-100 text-green-800 px-2 py-1">
                      {t('Approved', 'Diluluskan', '已批准')}
                    </span>
                  )}
                  {vehicle.verificationStatus === 'rejected' && (
                    <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                      <span className="text-xs font-medium text-red-800">
                        {t('Rejected', 'Ditolak', '已拒绝')}
                        {vehicle.rejectionReason ? `: ${vehicle.rejectionReason}` : ''}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="text-center py-12">
            <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <Car className="w-12 h-12 text-gray-400" />
            </div>
            <p className="text-gray-500 mb-4">
              {t('No vehicles added yet', 'Tiada kenderaan ditambah lagi', '尚未添加车辆')}
            </p>
            <Button
              onClick={() => navigate('/add-vehicle')}
              className="bg-[#2563eb] hover:bg-[#1d4ed8] rounded-xl"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t('Add Vehicle', 'Tambah Kenderaan', '添加车辆')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
