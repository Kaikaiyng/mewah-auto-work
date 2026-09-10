import { ArrowLeft, FileText, Printer } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import logo from 'figma:asset/9579c9865ae700123383ca50bc26e6829232a00d.png';
import { DataState } from '../components/DataState';
import { Button } from '../components/ui/button';
import { useCustomerData } from '../context/CustomerDataContext';
import { useLanguage } from '../context/LanguageContext';

function money(value: number) {
  return Number(value || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function displayDate(value?: string) {
  if (!value) return '—';
  const parsed = new Date(value.includes('T') ? value : `${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('en-GB');
}

function statusClass(status?: string) {
  if (status === 'paid') return 'bg-emerald-100 text-emerald-700';
  if (status === 'overdue') return 'bg-rose-100 text-rose-700';
  if (status === 'partially_paid') return 'bg-amber-100 text-amber-700';
  return 'bg-blue-100 text-blue-700';
}

export function InvoiceDetailScreen() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { t } = useLanguage();
  const { data, isLoading, error, reload } = useCustomerData();
  const booking = data?.bookings.find((item) => item.id === id && item.invoice);

  if (!data) return <DataState isLoading={isLoading} error={error} onRetry={() => void reload()} />;
  if (!booking?.invoice) return <div className="mx-auto flex min-h-screen max-w-md items-center justify-center bg-[#eef3fb] p-6"><div className="text-center"><FileText className="mx-auto mb-4 h-16 w-16 text-slate-300" /><p className="text-slate-500">{t('Invoice not found', 'Invois tidak dijumpai', '未找到发票')}</p><Button onClick={() => navigate(-1)} className="mt-4 bg-[#2563eb]">{t('Go Back', 'Kembali', '返回')}</Button></div></div>;

  const invoice = booking.invoice;
  const vehicle = data.user.vehicles.find((item) => item.id === booking.vehicleId);
  const hasItemDetails = invoice.items.length > 0;
  const taxSummary = [...invoice.items.reduce((grouped, item) => {
    const rate = Number(item.taxRate || 0);
    const code = item.taxCode || (rate > 0 ? `TAX-${rate}` : '@0%');
    const key = `${code}-${rate}`;
    const current = grouped.get(key) || { code, rate, taxable: 0, tax: 0 };
    current.taxable += Number(item.total || 0);
    current.tax += Number(item.taxAmount ?? Number(item.total || 0) * rate / 100);
    grouped.set(key, current);
    return grouped;
  }, new Map<string, { code: string; rate: number; taxable: number; tax: number }>()).values()];
  const workshop = data.systemSettings?.company || {
    legalName: 'MEWAH AUTOWORKS SDN BHD', registrationNo: 'YOUR-REGISTRATION-NO', groupName: '', address: 'Configure your workshop address', phone: '+60 00-000 0000', email: 'contact@example.com', operatingHours: '',
  };

  const handlePrint = () => {
    try {
      if ((window as any).AndroidPrinter?.print) {
        (window as any).AndroidPrinter.print(booking.invoiceNumber || 'Invoice');
        return;
      }
    } catch (err) {
      console.warn('AndroidPrinter failed, falling back to window.print', err);
    }
    window.print();
  };

  return <div className="min-h-screen bg-[#dfe7f3] pb-28">
    <style>{`@media print {
      @page { size: A4 portrait; margin: 10mm; }
      html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
      body * { visibility: hidden !important; }
      .invoice-screen-toolbar { display: none !important; }
      #customer-invoice-document, #customer-invoice-document * { visibility: visible !important; }
      #customer-invoice-document {
        display: block !important;
        position: absolute !important;
        left: 0 !important;
        top: 0 !important;
        width: 100% !important;
        min-height: 0 !important;
        max-width: none !important;
        margin: 0 !important;
        padding: 0 !important;
        box-shadow: none !important;
        font-size: 10px !important;
        line-height: 1.35 !important;
        background: #fff !important;
      }
      #customer-invoice-document thead { display: table-header-group; }
      #customer-invoice-document tr { break-inside: avoid-page; }
      #customer-invoice-document header, #customer-invoice-document > div { break-inside: avoid-page; }
      #customer-invoice-document .invoice-letterhead {
        display: grid !important;
        grid-template-columns: 200px minmax(0, 1fr) !important;
        column-gap: 16px !important;
        border-bottom-width: 2px !important;
        padding-bottom: 12px !important;
      }
      #customer-invoice-document .invoice-letterhead-logo {
        width: 180px !important;
        height: auto !important;
        max-height: 80px !important;
        object-fit: contain !important;
        transform: none !important;
      }
      #customer-invoice-document .invoice-info-grid {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important;
        gap: 16px !important;
        margin-top: 16px !important;
      }
      #customer-invoice-document .invoice-items-table {
        display: table !important;
        width: 100% !important;
        min-width: 0 !important;
        table-layout: fixed !important;
        margin-top: 16px !important;
      }
      #customer-invoice-document .invoice-bottom-grid {
        display: grid !important;
        grid-template-columns: 1fr 270px !important;
        gap: 16px !important;
        margin-top: 40px !important;
        border-top-width: 1px !important;
        padding-top: 8px !important;
      }
    }`}</style>
    <header className="maw-page-header invoice-screen-toolbar sticky top-0 z-40 relative flex items-center justify-between">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-gray-700 ring-1 ring-blue-100 shadow-sm hover:bg-blue-50 transition-colors"
        aria-label={t('Back', 'Kembali', '返回')}
      >
        <ArrowLeft className="w-5 h-5 text-gray-700" />
      </button>
      <div className="text-center absolute left-1/2 -translate-x-1/2 pointer-events-none truncate max-w-[180px]">
        <h1 className="text-base font-bold truncate">{t('Invoice', 'Invois', '发票')}</h1>
        <p className="truncate text-[10px] text-gray-500 font-medium">{booking.invoiceNumber}</p>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={handlePrint}
          className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center text-[#2563eb] hover:bg-blue-100 transition-colors"
          aria-label={t('Print', 'Cetak', '打印')}
        >
          <Printer className="w-4 h-4" />
        </button>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${statusClass(invoice.status)}`}>
          {(invoice.status || 'issued').replaceAll('_', ' ')}
        </span>
      </div>
    </header>
    <main className="p-2.5 sm:p-5 pb-32"><article id="customer-invoice-document" className="mx-auto min-h-[960px] max-w-3xl bg-white p-4 text-[9px] text-slate-900 shadow-xl sm:p-9">
      <header className="invoice-letterhead grid grid-cols-1 items-center gap-2 border-b-2 border-slate-800 pb-3 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-4">
        <div className="mx-auto flex h-20 w-full max-w-[200px] items-center justify-center overflow-hidden sm:h-24">
          <img src={logo} alt="Mewah AutoWorks" className="invoice-letterhead-logo block h-auto max-h-20 w-full object-contain" />
        </div>
        <div className="min-w-0 text-center leading-tight">
          <h1 className="text-base font-black sm:text-lg">{workshop.legalName}</h1>
          <p className="mt-0.5 font-semibold text-slate-700">({workshop.registrationNo})</p>
          <p className="text-slate-700">({workshop.groupName})</p>
          <p className="mt-0.5 text-slate-600">{workshop.address}</p>
          <p className="text-slate-600">Tel: {workshop.phone} · {workshop.email}</p>
        </div>
      </header>
      <div className="invoice-info-grid mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-6">
        <section className="min-h-24 border border-slate-700 p-2.5 sm:p-3">
          <p className="text-[8px] font-bold uppercase tracking-wider text-slate-500">{invoice.debtorCode || 'DEBTOR CODE'}</p>
          <p className="font-black text-slate-900">{invoice.billingCompany || data.user.companyName}</p>
          <p className="text-slate-700">{data.user.name}</p>
          <p className="text-slate-700">{data.user.phone}</p>
        </section>
        <section>
          <h2 className="mb-1 text-center text-lg font-black tracking-wide sm:text-2xl">INVOICE</h2>
          <dl className="grid grid-cols-[80px_8px_1fr] gap-y-0.5 sm:grid-cols-[95px_8px_1fr]">
            <dt className="font-bold text-slate-700">No.</dt><dd>:</dd><dd className="font-semibold">{booking.invoiceNumber}</dd>
            <dt className="font-bold text-slate-700">Date</dt><dd>:</dd><dd>{displayDate(invoice.issuedAt || booking.serviceDate)}</dd>
            <dt className="font-bold text-slate-700">Term</dt><dd>:</dd><dd>{invoice.creditTermDays ?? 30} days</dd>
            <dt className="font-bold text-slate-700">Job No.</dt><dd>:</dd><dd>{invoice.workOrderId || booking.workOrderNumber}</dd>
            <dt className="font-bold text-slate-700">Vehicle Type</dt><dd>:</dd><dd>{invoice.vehicleType || vehicle?.equipment || `${vehicle?.brand || ''} ${vehicle?.model || ''}`}</dd>
            <dt className="font-bold text-slate-700">Vehicle No.</dt><dd>:</dd><dd className="font-semibold">{invoice.vehicleNoRaw || vehicle?.regNo || '—'}</dd>
            {invoice.eInvoiceStatus ? <><dt className="font-bold text-slate-700">e-Invoice</dt><dd>:</dd><dd className="uppercase font-semibold">{invoice.eInvoiceStatus}</dd></> : null}
          </dl>
        </section>
      </div>
      {invoice.source === 'autocount' && invoice.summaryOnly ? <div className="mt-4 rounded border border-blue-300 bg-blue-50 p-3 text-[10px] leading-4 text-blue-900"><strong>AutoCount invoice summary.</strong> The official total and payment status are shown below. Item details will appear after the AutoCount sync program is connected.</div> : null}
      {hasItemDetails ? (
        <div className="mt-4 overflow-x-auto">
          <table className="invoice-items-table w-full min-w-[480px] sm:min-w-0 border-collapse">
            <thead>
              <tr className="border-y-2 border-slate-800">
                <th className="w-[8%] py-2 text-left">Item</th>
                <th className="w-[46%] py-2 text-left">Code / Description</th>
                <th className="w-[14%] py-2 text-right">Qty</th>
                <th className="w-[16%] py-2 text-right">Unit Price<br />RM</th>
                <th className="w-[16%] py-2 text-right">Amount<br />RM</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, index) => (
                <tr key={item.id} className="align-top border-b border-slate-100">
                  <td className="py-2 text-left">{index + 1}.</td>
                  <td className="py-2 text-left">
                    <p className="font-bold text-slate-900">{item.code ? `${item.code} · ` : ''}{item.name}</p>
                    <p className="text-[8px] uppercase text-slate-500">{item.itemType || item.category} · {item.taxCode || '@0%'}</p>
                  </td>
                  <td className="py-2 text-right">{Number(item.quantity).toFixed(2)}</td>
                  <td className="py-2 text-right">{money(item.unitPrice)}</td>
                  <td className="py-2 text-right">{money(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className={`${hasItemDetails ? 'mt-8 sm:mt-24' : 'mt-6 sm:mt-12'} invoice-bottom-grid flex flex-col gap-4 border-t border-slate-800 pt-3 sm:grid sm:grid-cols-[1fr_270px]`}>
        <div className="w-full">
          {invoice.notes ? (
            <div className="mb-2">
              <p className="font-black text-slate-900">Note:</p>
              <p className="whitespace-pre-wrap text-slate-700">{invoice.notes}</p>
            </div>
          ) : null}
          {taxSummary.length ? (
            <div className="overflow-x-auto">
              <table className="mt-2 w-full max-w-[240px] text-[8px]">
                <thead>
                  <tr className="border-b border-slate-300">
                    <th className="pr-3 text-left">Tax Code</th>
                    <th className="pr-3 text-right">Amount (RM)</th>
                    <th className="text-right">Tax (RM)</th>
                  </tr>
                </thead>
                <tbody>
                  {taxSummary.map((tax) => (
                    <tr key={`${tax.code}-${tax.rate}`}>
                      <td className="pr-3 text-left">{tax.code} @ {tax.rate}%</td>
                      <td className="pr-3 text-right">{money(tax.taxable)}</td>
                      <td className="text-right">{money(tax.tax)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
        <div className="w-full sm:w-auto">
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-right">
            {hasItemDetails ? (
              <>
                <dt className="font-bold text-slate-700">Sub Total</dt>
                <dd className="font-semibold">{money(invoice.subtotal)}</dd>
                <dt className="text-slate-600">Discount</dt>
                <dd>{money(invoice.discount || 0)}</dd>
                <dt className="text-slate-600">Service Tax</dt>
                <dd>{money(invoice.tax)}</dd>
              </>
            ) : null}
            <dt className="border-t border-slate-800 pt-2 text-xs font-black">Total (RM)</dt>
            <dd className="border-t border-slate-800 pt-2 text-xs font-black">{money(invoice.total)}</dd>
            <dt className="pt-1 text-slate-600">Paid</dt>
            <dd className="pt-1">{money(invoice.paidAmount || 0)}</dd>
            <dt className="font-black text-slate-900">Balance</dt>
            <dd className="font-black text-slate-900">{money(invoice.balance ?? invoice.total)}</dd>
          </dl>
        </div>
      </div>
      {invoice.paymentInstructions ? (
        <div className="mt-4 border-t border-slate-400 pt-3">
          <p className="font-black text-slate-900">Payment Instructions:</p>
          <p className="mt-1 whitespace-pre-wrap text-slate-700">{invoice.paymentInstructions}</p>
          {invoice.paymentMethod ? <p className="mt-2 text-slate-700"><strong>Last payment method:</strong> {invoice.paymentMethod}</p> : null}
        </div>
      ) : null}
      <p className="mt-10 text-center text-[10px] font-bold text-slate-700">This is a computer generated invoice, no signature required.</p>
    </article></main>
    <div className="invoice-screen-toolbar fixed bottom-0 left-0 right-0 z-20 mx-auto max-w-md border-t border-slate-200 bg-white/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg backdrop-blur-md">
      <Button variant="outline" onClick={handlePrint} className="h-12 w-full rounded-xl border-[#2563eb] bg-white text-[#2563eb] shadow-sm hover:bg-blue-50 font-bold">
        <Printer className="mr-2 h-5 w-5" />{t('Print / Save PDF', 'Cetak / Simpan PDF', '打印 / 保存 PDF')}
      </Button>
    </div>
  </div>;
}
