import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { ArrowLeft, Check, ChevronDown, ChevronRight, UserRound } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '../components/ui/drawer';
import { useLanguage } from '../context/LanguageContext';
import { useBooking } from '../context/BookingContext';
import { BookingProgress } from '../components/BookingProgress';
import { useCustomerData } from '../context/CustomerDataContext';
import { Input } from '../components/ui/input';

export function BookingStep4() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();
  const { bookingData, updateBookingData } = useBooking();
  const { data } = useCustomerData();
  const selectedVehicle = data?.user.vehicles.find((v) => v.id === bookingData.vehicleId);
  const [notes, setNotes] = useState(bookingData.notes || '');
  const [reportedProblem, setReportedProblem] = useState(bookingData.reportedProblem || '');
  const [mileage, setMileage] = useState<string>(
    bookingData.mileage !== undefined && bookingData.mileage !== null
      ? String(bookingData.mileage)
      : selectedVehicle?.mileage
      ? String(selectedVehicle.mileage)
      : ''
  );
  const [contactId, setContactId] = useState(bookingData.contactId || data?.contacts.find((item) => item.isDefault)?.id || '');
  const [isContactPickerOpen, setIsContactPickerOpen] = useState(false);
  const selectedContact = data?.contacts.find((item) => item.id === contactId);
  const commonIssues = [
    t('Oil change needed', 'Perlu tukar minyak', '需要更换机油'),
    t('Brake inspection', 'Pemeriksaan brek', '刹车检查'),
    t('Engine noise', 'Bunyi enjin', '发动机噪音'),
    t('AC not cooling', 'Penyaman udara tidak sejuk', '空调不冷'),
    t('Battery issue', 'Masalah bateri', '电池问题'),
    t('Tire rotation', 'Putaran tayar', '轮胎换位'),
  ];

  React.useEffect(() => {
    if (!contactId && data?.contacts.length) {
      setContactId(data.contacts.find((item) => item.isDefault)?.id || data.contacts[0].id);
    }
  }, [contactId, data?.contacts]);

  const getNoteItems = (value: string) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

  const isIssueSelected = (issue: string) => getNoteItems(notes).includes(issue);

  const toggleIssue = (issue: string) => {
    const noteItems = getNoteItems(notes);

    if (noteItems.includes(issue)) {
      setNotes(noteItems.filter((item) => item !== issue).join(', '));
      return;
    }

    setNotes([...noteItems, issue].join(', '));
  };

  const handleContinue = () => {
    const contact = data?.contacts.find((item) => item.id === contactId);
    const parsedMileage = mileage ? Number(mileage.replace(/\D/g, '')) : undefined;
    updateBookingData({ notes, reportedProblem, contactId, contactName: contact?.name, mileage: parsedMileage });
    
    // Always go to summary (Step5) from notes
    navigate('/booking/step5');
  };

  return (
    <div className="flex flex-col flex-1">
      {/* Content */}
      <div className="px-5 pt-4 pb-28 space-y-4 flex-1">
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-2">
            {t('Additional information', '附加信息')}
          </h2>
          <p className="text-gray-600 text-sm">
            {t('Tell us about any specific issues or requests (optional)', '告诉我们您的具体问题或要求（可选）')}
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label id="contact-label">{t('Booking contact', 'Hubungan tempahan', '预约联系人')}</Label>
            <Drawer open={isContactPickerOpen} onOpenChange={setIsContactPickerOpen}>
              <DrawerTrigger asChild>
                <button
                  type="button"
                  aria-labelledby="contact-label contact-value"
                  disabled={!data?.contacts.length}
                  className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-gray-300 bg-white px-4 text-left transition-colors hover:border-[#2563eb]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[#2563eb]">
                    <UserRound className="h-4.5 w-4.5" />
                  </span>
                  <span id="contact-value" className="min-w-0 flex-1">
                    {selectedContact ? (
                      <>
                        <span className="block truncate font-medium text-gray-900">
                          {selectedContact.name}
                        </span>
                        <span className="block truncate text-sm text-gray-500">
                          {selectedContact.role}
                        </span>
                      </>
                    ) : (
                      <span className="text-gray-500">
                        {t('Select a company user', 'Pilih pengguna syarikat', '选择公司用户')}
                      </span>
                    )}
                  </span>
                  <ChevronDown className="h-5 w-5 shrink-0 text-gray-400" />
                </button>
              </DrawerTrigger>

              <DrawerContent className="mx-auto max-w-md rounded-t-3xl border-slate-200 bg-white shadow-2xl">
                <DrawerHeader className="border-b border-slate-200 px-5 pb-4 pt-3 text-left">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#2563eb]">
                      <UserRound className="h-5 w-5" />
                    </span>
                    <div>
                      <DrawerTitle className="text-lg text-slate-900">
                        {t('Select booking contact', 'Pilih hubungan tempahan', '选择预约联系人')}
                      </DrawerTitle>
                      <DrawerDescription>
                        {t(
                          'Choose who the workshop should contact about this service.',
                          'Pilih individu yang perlu dihubungi oleh bengkel mengenai servis ini.',
                          '选择维修中心应就此次服务联系的人员。',
                        )}
                      </DrawerDescription>
                    </div>
                  </div>
                </DrawerHeader>

                <div className="max-h-[50vh] space-y-2 overflow-y-auto bg-slate-50 px-4 py-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
                  {data?.contacts.map((contact) => {
                    const isSelected = contact.id === contactId;

                    return (
                      <DrawerClose asChild key={contact.id}>
                        <button
                          type="button"
                          onClick={() => setContactId(contact.id)}
                          className={`flex min-h-16 w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${
                            isSelected
                              ? 'border-[#2563eb] bg-blue-50'
                              : 'border-gray-200 bg-white shadow-sm hover:bg-gray-50'
                          }`}
                        >
                          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                            isSelected
                              ? 'bg-[#2563eb] text-white'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            <UserRound className="h-5 w-5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold text-gray-900">
                              {contact.name}
                            </span>
                            <span className="block truncate text-sm text-gray-500">
                              {contact.role}
                              {contact.isDefault && (
                                <> · {t('Default', 'Lalai', '默认')}</>
                              )}
                            </span>
                          </span>
                          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                            isSelected
                              ? 'border-[#2563eb] bg-[#2563eb] text-white'
                              : 'border-gray-300 text-transparent'
                          }`}>
                            <Check className="h-4 w-4" />
                          </span>
                        </button>
                      </DrawerClose>
                    );
                  })}
                </div>
              </DrawerContent>
            </Drawer>
          </div>
          <div className="space-y-2">
            <Label htmlFor="problem">{t('Reported problem', 'Masalah dilaporkan', '报告的问题')}</Label>
            <Input
              id="problem"
              value={reportedProblem}
              onChange={(event) => setReportedProblem(event.target.value)}
              placeholder={t('What should the workshop inspect?', 'Apakah yang perlu diperiksa?', '维修中心需要检查什么？')}
              className="h-12 rounded-xl bg-white"
            />
          </div>

          {/* Current Mileage input (Maintenance - fill in) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="mileage">{t('Current Mileage (km)', 'Perbatuan Semasa (km)', '当前里程 (公里)')}</Label>
              {selectedVehicle?.mileage ? (
                <span className="text-[11px] text-slate-500">
                  {t('Last record', 'Rekod terkini', '系统记录')}: <span className="font-semibold font-mono text-slate-700">{selectedVehicle.mileage.toLocaleString()} km</span>
                </span>
              ) : null}
            </div>
            <Input
              id="mileage"
              type="text"
              inputMode="numeric"
              value={mileage}
              onChange={(event) => {
                const val = event.target.value.replace(/\D/g, '');
                setMileage(val);
              }}
              placeholder={selectedVehicle?.mileage ? `e.g. ${selectedVehicle.mileage}` : 'e.g. 125000'}
              className="h-12 rounded-xl bg-white font-mono text-sm"
            />
            <p className="text-[11px] text-slate-500">
              {t('Odometer reading helps our mechanics prepare scheduled maintenance items.', 'Bacaan odometer membantu mekanik menyediakan jadual servis berkala.', '里程表读数有助于技师提前准备定期保养项目。')}
            </p>
          </div>

          <Label htmlFor="notes" className="text-base">
            {t('Service notes and requests', '服务备注和要求')}
          </Label>
          <Textarea
            id="notes"
            placeholder={t(
              'Example: Check brake noise, replace engine oil, inspect air conditioning...',
              '例如：检查刹车噪音、更换机油、检查空调...'
            )}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-40 rounded-xl text-base bg-white"
            rows={6}
          />
          <p className="text-sm text-gray-500">
            {t(
              'Our mechanics will review your notes before the service',
              '我们的技师会在服务前查看您的备注'
            )}
          </p>
        </div>

        {/* Common Issues */}
        <div>
          <h3 className="font-medium mb-3">
            {t('Common issues', '常见问题')}
          </h3>
          <div className="flex flex-wrap gap-2">
            {commonIssues.map((issue) => {
              const isSelected = isIssueSelected(issue);

              return (
                <button
                  key={issue}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => toggleIssue(issue)}
                  className={`rounded-full border px-4 py-2 text-sm font-medium shadow-sm transition-colors ${
                    isSelected
                      ? 'border-[#2563eb] bg-[#2563eb] text-white'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-[#2563eb]/40 hover:bg-blue-50'
                  }`}
                >
                  {isSelected ? '✓' : '+'} {issue}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Floating Capsule Bottom Button - Matching Home Footer Height & Position */}
      <div className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-50 w-[calc(100%-2rem)] max-w-[416px] -translate-x-1/2">
        <Button
          onClick={handleContinue}
          className="w-full h-[3.5rem] rounded-[1.25rem] bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-base font-semibold shadow-[0_10px_28px_rgba(37,99,235,0.32)] transition-all flex items-center justify-center"
        >
          {t('Continue', 'Teruskan', '继续')}
          <ChevronRight className="w-5 h-5 ml-2" />
        </Button>
      </div>
    </div>
  );
}
