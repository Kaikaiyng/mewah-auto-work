import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { ArrowLeft, MapPin, Plus, Edit, Save, X } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useLanguage } from '../context/LanguageContext';
import { useCustomerData } from '../context/CustomerDataContext';
import { DataState } from '../components/DataState';
import {
  formatMalaysiaPhone,
  formatMalaysiaPhoneInput,
  isValidMalaysiaPhone,
  MALAYSIA_PHONE_PLACEHOLDER,
  normalizeMalaysiaPhone,
} from '../lib/malaysia-phone';
import { toast } from 'sonner';

interface AddressForm {
  id?: string;
  contactName: string;
  address: string;
  contactPhone: string;
  isDefault: boolean;
}

export function DeliveryAddressesScreen() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { data, isLoading, error, reload, saveAddress, deleteAddress } = useCustomerData();
  const [showDialog, setShowDialog] = useState(false);
  const [isClosingAddress, setIsClosingAddress] = useState(false);
  const [addressDragY, setAddressDragY] = useState(0);
  const [isAddressDragging, setIsAddressDragging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingAddressId, setDeletingAddressId] = useState<string | null>(null);
  const addressTouchStartYRef = useRef<number | null>(null);

  const [editingAddress, setEditingAddress] = useState<AddressForm | null>(null);
  const [formData, setFormData] = useState<AddressForm>({
    contactName: '',
    address: '',
    contactPhone: '',
    isDefault: false,
  });

  const handleEdit = (addressId: string) => {
    const addr = data?.user.deliveryAddresses.find(a => a.id === addressId);
    if (addr) {
      setFormData({
        id: addr.id,
        contactName: addr.contactName,
        address: addr.address,
        contactPhone: formatMalaysiaPhone(addr.contactPhone),
        isDefault: addr.isDefault,
      });
      setEditingAddress(addr);
      setAddressDragY(0);
      setIsClosingAddress(false);
      setShowDialog(true);
    }
  };

  const handleAdd = () => {
    setFormData({
      contactName: '',
      address: '',
      contactPhone: '',
      isDefault: false,
    });
    setEditingAddress(null);
    setAddressDragY(0);
    setIsClosingAddress(false);
    setShowDialog(true);
  };

  const closeAddressDialog = () => {
    setIsClosingAddress(true);
    setTimeout(() => {
      setShowDialog(false);
      setIsClosingAddress(false);
      setEditingAddress(null);
      setFormData({
        contactName: '',
        address: '',
        contactPhone: '',
        isDefault: false,
      });
      setAddressDragY(0);
      setIsAddressDragging(false);
    }, 200);
  };

  const handleAddressHeaderTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    addressTouchStartYRef.current = e.touches[0]?.clientY ?? null;
    setIsAddressDragging(false);
  };

  const handleAddressHeaderTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.cancelable) e.preventDefault();
    if (addressTouchStartYRef.current == null) return;
    const currentY = e.touches[0]?.clientY ?? addressTouchStartYRef.current;
    const deltaY = currentY - addressTouchStartYRef.current;
    if (deltaY > 0) {
      setIsAddressDragging(true);
      setAddressDragY(deltaY);
    }
  };

  const handleAddressHeaderTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    addressTouchStartYRef.current = null;
    setIsAddressDragging(false);
    if (addressDragY > 80) {
      closeAddressDialog();
    } else {
      setAddressDragY(0);
    }
  };

  const handleSave = async () => {
    if (!formData.contactName.trim() || !formData.address.trim() || !formData.contactPhone.trim()) {
      toast.error(t('Complete all address fields', 'Lengkapkan semua medan alamat', '请填写所有地址字段'));
      return;
    }
    if (!isValidMalaysiaPhone(formData.contactPhone)) {
      toast.error(t(
        'Enter a valid Malaysia mobile or landline number',
        'Masukkan nombor mudah alih atau talian tetap Malaysia yang sah',
        '请输入有效的马来西亚手机或固定电话号码',
      ));
      return;
    }
    setIsSaving(true);
    try {
      await saveAddress({
        ...formData,
        id: formData.id || `addr-${Date.now()}`,
        contactPhone: normalizeMalaysiaPhone(formData.contactPhone)!,
      });
      toast.success(t('Address saved', 'Alamat disimpan', '地址已保存'));
      closeAddressDialog();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : t('Unable to save address', 'Alamat tidak dapat disimpan', '无法保存地址'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (addressId: string) => {
    setDeletingAddressId(addressId);
    try {
      await deleteAddress(addressId);
      toast.success(t('Address deleted', 'Alamat dipadam', '地址已删除'));
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : t('Unable to delete address', 'Alamat tidak dapat dipadam', '无法删除地址'));
    } finally {
      setDeletingAddressId(null);
    }
  };

  if (!data) {
    return <DataState isLoading={isLoading} error={error} onRetry={() => void reload()} />;
  }

  return (
    <div className="min-h-screen bg-[#eef3fb] w-full max-w-md mx-auto">
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
          {t('Delivery Address', 'Alamat Penghantaran', '送货地址')}
        </h1>
        <button
          onClick={handleAdd}
          className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-[#2563eb] ring-1 ring-blue-100 shadow-sm hover:bg-blue-50 transition-colors"
          aria-label={t('Add Address', 'Tambah Alamat', '添加地址')}
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      <div className="px-5 pt-4 pb-28 space-y-4">
        {data.user.deliveryAddresses.length > 0 ? (
          data.user.deliveryAddresses.map((addr) => (
            <Card key={addr.id} className="rounded-2xl shadow-sm border border-white/80 bg-white">
              <CardContent className="p-5">
                <div className="bg-white rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <p className="font-semibold text-gray-900">{addr.contactName}</p>
                        {addr.isDefault && (
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                            {t('Default', '默认')}
                          </span>
                        )}
                      </div>
                      <p className="text-gray-700 mb-1">{addr.address}</p>
                      <p className="text-sm text-gray-500">{t('Phone:', '电话:')} {formatMalaysiaPhone(addr.contactPhone)}</p>
                    </div>
                    <button
                      onClick={() => handleEdit(addr.id)}
                      className="p-2 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
                    >
                      <Edit className="w-5 h-5 text-[#2563eb]" />
                    </button>
                    {!addr.isDefault && (
                      <button
                        onClick={() => void handleDelete(addr.id)}
                        disabled={deletingAddressId === addr.id}
                        className="p-2 rounded-lg hover:bg-red-50 transition-colors flex-shrink-0"
                        aria-label={t('Delete address', 'Padam alamat', '删除地址')}
                      >
                        <X className="w-5 h-5 text-red-500" />
                      </button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="text-center py-12">
            <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <MapPin className="w-12 h-12 text-gray-400" />
            </div>
            <p className="text-gray-500 mb-4">
              {t('No addresses added yet', '尚未添加地址')}
            </p>
            <Button
              onClick={handleAdd}
              className="bg-[#2563eb] hover:bg-[#1d4ed8] rounded-xl"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t('Add Address', '添加地址')}
            </Button>
          </div>
        )}
      </div>

      {/* Edit/Add Dialog Bottom Sheet Portal */}
      {showDialog ? createPortal(
        <div
          data-prevent-swipe="true"
          className={`fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-slate-950/60 p-0 sm:p-4 backdrop-blur-[2px] transition-opacity duration-200 ${
            isClosingAddress ? 'opacity-0' : 'opacity-100 animate-in fade-in'
          }`}
          onClick={closeAddressDialog}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[2rem] sm:rounded-3xl bg-[#eef3fb] shadow-2xl"
            style={{
              transform: isClosingAddress ? 'translate3d(0, 100%, 0)' : `translate3d(0, ${addressDragY}px, 0)`,
              transition: isAddressDragging ? 'none' : 'transform 0.22s cubic-bezier(0.25, 1, 0.5, 1)',
              animation: !isClosingAddress && !isAddressDragging && addressDragY === 0 ? 'mawSlideInUp 0.28s cubic-bezier(0.25, 1, 0.5, 1)' : 'none',
              willChange: 'transform',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            {/* Top Drag Handle Bar & Clean Header */}
            <div
              className="flex shrink-0 flex-col border-b border-slate-200/80 bg-white/95 backdrop-blur-md cursor-grab active:cursor-grabbing select-none"
              onTouchStart={handleAddressHeaderTouchStart}
              onTouchMove={handleAddressHeaderTouchMove}
              onTouchEnd={handleAddressHeaderTouchEnd}
            >
              {/* Drag Handle Pill */}
              <div className="flex w-full justify-center pt-2.5 pb-1">
                <div className="h-1.5 w-11 rounded-full bg-slate-300 active:bg-slate-400 transition-colors" />
              </div>

              <div className="flex items-center justify-between px-5 pb-3.5 pt-1">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-[#2563eb] ring-1 ring-blue-200/80 shadow-sm">
                    <MapPin className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      {editingAddress ? t('Edit Address', 'Sunting Alamat', '编辑地址') : t('Add Address', 'Tambah Alamat', '添加地址')}
                    </h2>
                    <p className="text-xs text-slate-500 font-medium">
                      {t('Delivery contact and location details', 'Butiran kenalan dan lokasi penghantaran', '送货联系人和地址资料')}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={closeAddressDialog}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200 active:scale-95"
                  aria-label={t('Close', 'Tutup', '关闭')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Dialog Content */}
            <div className="scrollbar-thin min-h-0 flex-1 space-y-3.5 overflow-y-auto p-4 text-slate-800">
              <section className="space-y-4 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
                {/* Contact Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    {t('Contact Name', 'Nama Kenalan', '联系人姓名')}
                  </label>
                  <input
                    type="text"
                    value={formData.contactName}
                    onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent bg-slate-50/50"
                    placeholder={t('Enter contact name', 'Masukkan nama kenalan', '输入联系人姓名')}
                  />
                </div>

                {/* Address */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    {t('Address', 'Alamat', '地址')}
                  </label>
                  <textarea
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent bg-slate-50/50 resize-none"
                    rows={4}
                    placeholder={t('Enter full address', 'Masukkan alamat penuh', '输入完整地址')}
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    {t('Phone Number', 'Nombor Telefon', '电话号码')}
                  </label>
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={formData.contactPhone}
                    onChange={(e) => setFormData({ ...formData, contactPhone: formatMalaysiaPhoneInput(e.target.value) })}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent bg-slate-50/50"
                    placeholder={MALAYSIA_PHONE_PLACEHOLDER}
                    maxLength={18}
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    {t(
                      'Mobile: +60 00-000 0000 · Landline: +60 00-000 0000',
                      'Mudah alih: +60 00-000 0000 · Talian tetap: +60 00-000 0000',
                      '手机：+60 00-000 0000 · 固话：+60 00-000 0000',
                    )}
                  </p>
                </div>

                {/* Set as Default */}
                <div className="flex items-center gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                  <input
                    type="checkbox"
                    id="isDefault"
                    checked={formData.isDefault}
                    onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                    className="w-4 h-4 text-[#2563eb] border-slate-300 rounded focus:ring-[#2563eb]"
                  />
                  <label htmlFor="isDefault" className="text-slate-700 font-semibold text-xs cursor-pointer select-none">
                    {t('Set as default address', 'Tetapkan sebagai alamat lalai', '设为默认地址')}
                  </label>
                </div>
              </section>
            </div>

            {/* Bottom Actions */}
            <div className="flex gap-3 border-t border-slate-200/80 bg-white/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md">
              <Button
                variant="outline"
                type="button"
                onClick={closeAddressDialog}
                className="h-12 flex-1 rounded-xl border-slate-300 bg-white font-semibold text-slate-700 hover:bg-slate-50"
              >
                {t('Cancel', 'Batal', '取消')}
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="h-12 flex-1 rounded-xl bg-[#2563eb] font-semibold text-white shadow-sm hover:bg-[#1d4ed8]"
              >
                <Save className="mr-2 h-4 w-4" />{isSaving ? t('Saving...', 'Menyimpan...', '保存中...') : editingAddress ? t('Save Changes', 'Simpan Perubahan', '保存更改') : t('Add Address', 'Tambah Alamat', '添加地址')}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  );
}
