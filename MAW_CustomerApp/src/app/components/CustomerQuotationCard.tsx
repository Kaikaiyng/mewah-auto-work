import { useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Eye, FileText, Printer, X, XCircle } from 'lucide-react';
import logo from 'figma:asset/9579c9865ae700123383ca50bc26e6829232a00d.png';
import type { Vehicle, WorkOrder } from '../types';

function money(value: number) {
  return Number(value || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function date(value?: string) {
  if (!value) return '—';
  const normalized = value.includes('T') ? value : value.includes(' ') ? value.replace(' ', 'T') : `${value}T00:00:00`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('en-GB');
}

export function CustomerQuotationCard({
  workOrder,
  vehicle,
  companyName,
  workshopSettings,
  onRespond,
}: {
  workOrder: WorkOrder;
  vehicle: Vehicle;
  companyName: string;
  workshopSettings?: { legalName: string; registrationNo: string; groupName: string; address: string; phone: string; email: string };
  onRespond: (action: 'accept' | 'reject', note: string) => Promise<void>;
}) {
  const quote = workOrder.quotation;
  const workshop = workshopSettings || {
    legalName: 'MEWAH AUTOWORKS SDN BHD',
    registrationNo: 'YOUR-REGISTRATION-NO',
    groupName: '',
    address: 'Configure your workshop address',
    phone: '+60 00-000 0000',
    email: 'contact@example.com',
  };
  const [open, setOpen] = useState(false);
  const [responseMode, setResponseMode] = useState<'accept' | 'reject' | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  if (!quote) return null;

  const respond = async () => {
    if (!responseMode) return;
    if (responseMode === 'reject' && !note.trim()) {
      setError('Please tell the workshop why you are rejecting this quotation.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onRespond(responseMode, note.trim());
      setResponseMode(null);
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to submit your response.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrint = () => {
    try {
      if ((window as any).AndroidPrinter?.print) {
        (window as any).AndroidPrinter.print(quote.quotationNo || 'Quotation');
        return;
      }
    } catch (err) {
      console.warn('AndroidPrinter failed, falling back to window.print', err);
    }
    window.print();
  };

  const statusClasses = quote.status === 'approved'
    ? 'bg-emerald-100 text-emerald-700'
    : quote.status === 'rejected'
      ? 'bg-rose-100 text-rose-700'
      : 'bg-blue-100 text-blue-700';

  return (
    <>
      <section className="rounded-2xl border border-blue-100 bg-white p-5 shadow-md">
        <div className="flex items-start justify-between gap-3">
          <div className="flex gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><FileText className="h-5 w-5" /></span><div><p className="font-bold text-slate-900">Repair Quotation</p><p className="text-xs text-slate-500">{quote.quotationNo} · Rev {quote.revision}</p></div></div>
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${statusClasses}`}>{quote.status}</span>
        </div>
        <div className="mt-4 flex items-end justify-between border-t border-slate-100 pt-4"><div><p className="text-xs text-slate-500">Total quotation</p><p className="text-xl font-extrabold text-slate-900">RM {money(quote.total)}</p><p className="mt-0.5 text-[10px] text-slate-500">Valid until {date(quote.validUntil)}</p></div><button type="button" onClick={() => setOpen(true)} className="inline-flex items-center rounded-full bg-[#2563eb] px-4 py-2.5 text-xs font-bold text-white"><Eye className="mr-1.5 h-4 w-4" />View Quotation</button></div>
      </section>

      {open ? createPortal(
        <div data-auto-refresh-pause="true" className="customer-quotation-print-shell fixed inset-0 z-[80] overflow-y-auto bg-slate-950/70 p-3 backdrop-blur-sm">
          <style>{`@media print {
            @page { size: A4 portrait; margin: 10mm; }
            html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
            #root { display: none !important; }
            body * { visibility: hidden !important; }
            .quotation-no-print { display: none !important; }
            .customer-quotation-print-shell, #customer-quotation-document, #customer-quotation-document * { visibility: visible !important; }
            .customer-quotation-print-shell { display: block !important; position: static !important; inset: auto !important; width: auto !important; height: auto !important; overflow: visible !important; margin: 0 !important; padding: 0 !important; background: #fff !important; backdrop-filter: none !important; }
            #customer-quotation-document { position: static !important; width: 100% !important; min-height: 0 !important; max-width: none !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; font-size: 10px !important; line-height: 1.35 !important; }
            #customer-quotation-document .quotation-letterhead { display: grid !important; grid-template-columns: 200px minmax(0, 1fr) !important; column-gap: 16px !important; border-bottom-width: 2px !important; padding-bottom: 12px !important; }
            #customer-quotation-document .quotation-letterhead-logo { width: 180px !important; height: auto !important; max-height: 80px !important; object-fit: contain !important; transform: none !important; }
            #customer-quotation-document .quotation-items-table { display: table !important; width: 100% !important; min-width: 0 !important; table-layout: fixed !important; margin-top: 16px !important; }
            #customer-quotation-document .quotation-bottom-grid { display: grid !important; grid-template-columns: 1fr 270px !important; gap: 16px !important; margin-top: 40px !important; border-top-width: 1px !important; padding-top: 8px !important; }
            #customer-quotation-document header, #customer-quotation-document > div { break-inside: avoid-page; }
            #customer-quotation-document thead { display: table-header-group; }
            #customer-quotation-document tr { break-inside: avoid-page; }
          }`}</style>
          <div className="quotation-no-print sticky top-0 z-10 mx-auto mb-3 flex max-w-3xl items-center justify-between rounded-xl bg-white px-4 py-3 shadow-lg"><div><p className="text-sm font-extrabold text-slate-900">{quote.quotationNo}</p><p className="text-[10px] text-slate-500">Review all items before responding</p></div><div className="flex gap-2"><button type="button" onClick={handlePrint} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" aria-label="Print or save PDF"><Printer className="h-4 w-4" /></button><button type="button" onClick={() => { setOpen(false); setResponseMode(null); }} className="rounded-lg bg-slate-100 p-2 text-slate-600 hover:bg-slate-200" aria-label="Close"><X className="h-4 w-4" /></button></div></div>

          <article id="customer-quotation-document" className="mx-auto min-h-[960px] max-w-3xl bg-white p-4 text-[9px] text-slate-900 shadow-xl sm:p-9 print:min-h-0 print:max-w-none print:p-0 print:shadow-none">
            <header className="quotation-letterhead grid grid-cols-1 items-center gap-2 border-b-2 border-slate-800 pb-3 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-4">
              <div className="mx-auto flex h-20 w-full max-w-[200px] items-center justify-center overflow-hidden sm:h-24">
                <img src={logo} alt="Mewah AutoWorks" className="quotation-letterhead-logo block h-auto max-h-20 w-full object-contain" />
              </div>
              <div className="min-w-0 text-center leading-tight">
                <h1 className="text-base font-black tracking-tight sm:text-lg">{workshop.legalName}</h1>
                <p className="mt-0.5 font-semibold text-slate-700">({workshop.registrationNo})</p>
                <p className="text-slate-700">({workshop.groupName})</p>
                <p className="mt-0.5 text-slate-600">{workshop.address}</p>
                <p className="text-slate-600">Tel: {workshop.phone} · {workshop.email}</p>
              </div>
            </header>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-6"><section className="border border-slate-700 p-2.5 sm:p-3"><p className="font-black text-slate-900">{companyName}</p><p className="text-slate-700">{workOrder.workOrderNumber}</p></section><section><h2 className="mb-1 text-center text-lg font-black tracking-wide sm:text-2xl">QUOTATION</h2><dl className="grid grid-cols-[80px_8px_1fr] gap-y-0.5 sm:grid-cols-[95px_8px_1fr]"><dt className="font-bold text-slate-700">No.</dt><dd>:</dd><dd className="font-semibold">{quote.quotationNo}</dd><dt className="font-bold text-slate-700">Revision</dt><dd>:</dd><dd>{quote.revision}</dd><dt className="font-bold text-slate-700">Date</dt><dd>:</dd><dd>{date(quote.issuedAt || quote.createdAt)}</dd><dt className="font-bold text-slate-700">Valid Until</dt><dd>:</dd><dd>{date(quote.validUntil)}</dd><dt className="font-bold text-slate-700">Job No.</dt><dd>:</dd><dd>{workOrder.workOrderNumber}</dd><dt className="font-bold text-slate-700">Vehicle</dt><dd>:</dd><dd>{vehicle.equipment || `${vehicle.brand} ${vehicle.model}`}</dd><dt className="font-bold text-slate-700">Vehicle No.</dt><dd>:</dd><dd className="font-semibold">{vehicle.regNo}</dd></dl></section></div>
            <div className="mt-4 overflow-x-auto"><table className="quotation-items-table w-full min-w-[480px] sm:min-w-0 border-collapse"><thead><tr className="border-y-2 border-slate-800"><th className="w-[8%] py-2 text-left">Item</th><th className="w-[46%] py-2 text-left">Code / Description</th><th className="w-[14%] py-2 text-right">Qty</th><th className="w-[16%] py-2 text-right">Unit Price<br />RM</th><th className="w-[16%] py-2 text-right">Amount<br />RM</th></tr></thead><tbody>{(quote.items || []).map((item, index) => <tr key={item.id || index} className="align-top border-b border-slate-100"><td className="py-2 text-left">{index + 1}.</td><td className="py-2 text-left"><p className="font-bold text-slate-900">{item.code ? `${item.code} · ` : ''}{item.description}</p><p className="text-[8px] uppercase text-slate-500">{item.type}</p></td><td className="py-2 text-right">{Number(item.quantity ?? 0).toFixed(2)}</td><td className="py-2 text-right">{money(item.unitPrice)}</td><td className="py-2 text-right">{money(item.amount)}</td></tr>)}</tbody></table></div>
            <div className="mt-8 sm:mt-24 quotation-bottom-grid flex flex-col gap-4 border-t border-slate-800 pt-3 sm:grid sm:grid-cols-[1fr_270px]">
              <div className="w-full">{quote.notes ? <><p className="font-black text-slate-900">Note:</p><p className="whitespace-pre-wrap text-slate-700">{quote.notes}</p></> : null}</div>
              <div className="w-full sm:w-auto"><dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-right"><dt className="font-bold text-slate-700">Sub Total</dt><dd className="font-semibold">{money(quote.subtotal)}</dd><dt className="text-slate-600">Discount</dt><dd>{money(quote.discount)}</dd><dt className="text-slate-600">Tax @ {Number(quote.taxRate || 0).toFixed(2)}%</dt><dd>{money(quote.taxAmount)}</dd><dt className="border-t border-slate-800 pt-2 text-xs font-black">Total (RM)</dt><dd className="border-t border-slate-800 pt-2 text-xs font-black">{money(quote.total)}</dd></dl></div>
            </div>
          </article>

          <div className="quotation-no-print mx-auto mt-3 max-w-3xl rounded-2xl bg-white p-4 shadow-xl">
            {quote.status === 'issued' ? (
              <>
                {responseMode ? (
                  <div className="space-y-3">
                    <div className={`rounded-xl p-3 text-sm ${responseMode === 'accept' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
                      <p className="font-bold">{responseMode === 'accept' ? 'Accept this quotation?' : 'Reject this quotation?'}</p>
                      <p className="mt-1 text-xs">{responseMode === 'accept' ? 'This records your approval and allows the workshop to proceed with repairs.' : 'Please explain what should be revised. The workshop will prepare a new revision.'}</p>
                    </div>
                    {responseMode === 'reject' ? (
                      <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder="Reason for rejection" className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-blue-400" />
                    ) : null}
                    {error ? <p className="text-xs font-medium text-rose-600">{error}</p> : null}
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" disabled={submitting} onClick={() => setResponseMode(null)} className="rounded-full border border-slate-200 py-3 text-sm font-bold text-slate-700">Back</button>
                      <button type="button" disabled={submitting} onClick={() => void respond()} className={`rounded-full py-3 text-sm font-bold text-white ${responseMode === 'accept' ? 'bg-emerald-600' : 'bg-rose-600'}`}>{submitting ? 'Submitting...' : 'Confirm response'}</button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setResponseMode('reject')} className="inline-flex items-center justify-center rounded-full border border-rose-200 py-3 text-sm font-bold text-rose-700"><XCircle className="mr-1.5 h-4 w-4" />Reject</button>
                    <button type="button" onClick={() => setResponseMode('accept')} className="inline-flex items-center justify-center rounded-full bg-emerald-600 py-3 text-sm font-bold text-white"><CheckCircle2 className="mr-1.5 h-4 w-4" />Accept</button>
                  </div>
                )}
              </>
            ) : quote.status === 'approved' ? (
              <div className="rounded-xl bg-emerald-50 p-3 text-center text-sm font-bold text-emerald-700">
                Quotation approved. Repair in progress.
              </div>
            ) : quote.status === 'rejected' ? (
              <div className="rounded-xl bg-rose-50 p-3 text-center text-sm font-bold text-rose-700">
                Quotation rejected. The workshop will provide a revised quotation.
              </div>
            ) : (
              <div className="rounded-xl bg-blue-50 p-3 text-center text-sm font-bold text-blue-700">
                Quotation prepared. Pending final workshop authorization.
              </div>
            )}
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
