import { useState } from "react";
import { ArrowLeft, Database, Link2, X } from "lucide-react";
import { toast } from "sonner";
import { postApi } from "../lib/api";
import type { InvoiceWorkOrder } from "./work-order-invoice-dialog";
import { AdminSelect } from "./ui/admin-select";
import { DesktopDatePicker } from "./ui/desktop-date-picker";

export type AutoCountInvoiceRecord = {
  invoiceNo: string;
  autocountJobNo?: string;
  vehicleNoRaw?: string;
  invoiceDate: string;
  currency?: string;
  subtotal?: number;
  taxAmount?: number;
  total: number;
  balance: number;
  summaryOnly?: boolean;
  items?: Array<{
    id?: number;
    type?: string;
    code?: string;
    description: string;
    quantity: number;
    unitPrice: number;
    taxCode?: string;
    taxRate?: number;
    taxAmount?: number;
    amount: number;
  }>;
  documentStatus?: "approved" | "void" | "expired";
  eInvoiceStatus?: "" | "valid" | "cancelled" | "invalid";
  eInvoiceUuid?: string;
};

type Props = {
  workOrder?: InvoiceWorkOrder | null;
  invoice?: AutoCountInvoiceRecord | null;
  onClose: () => void;
  onChanged?: () => void | Promise<void>;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function money(value?: number) {
  return Number(value || 0).toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function AutoCountInvoiceDialog({ workOrder, invoice, onClose, onChanged }: Props) {
  const readOnly = Boolean(invoice) || !workOrder || workOrder.id <= 0;
  const [invoiceNo, setInvoiceNo] = useState(invoice?.invoiceNo || "");
  const [jobNo, setJobNo] = useState(invoice?.autocountJobNo || "");
  const [vehicleNoRaw, setVehicleNoRaw] = useState(invoice?.vehicleNoRaw || workOrder?.vehicleNo || "");
  const [invoiceDate, setInvoiceDate] = useState(invoice?.invoiceDate || today());
  const [total, setTotal] = useState(invoice?.total ?? 0);
  const [outstanding, setOutstanding] = useState(invoice?.balance ?? invoice?.total ?? 0);
  const [documentStatus, setDocumentStatus] = useState(invoice?.documentStatus || "approved");
  const [eInvoiceStatus, setEInvoiceStatus] = useState(invoice?.eInvoiceStatus || "");
  const [eInvoiceUuid, setEInvoiceUuid] = useState(invoice?.eInvoiceUuid || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const items = invoice?.items || [];
  const lineSubtotal = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const lineTax = items.reduce((sum, item) => sum + Number(item.taxAmount || 0), 0);

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      await postApi("admin-link-autocount-invoice", {
        workOrderId: workOrder?.id || 0,
        invoiceNo,
        autocountJobNo: jobNo,
        vehicleNoRaw,
        invoiceDate,
        total: Number(total),
        outstanding: Number(outstanding),
        documentStatus,
        eInvoiceStatus,
        eInvoiceUuid,
      });
      toast.success(invoice ? "AutoCount invoice link updated." : "AutoCount invoice linked.");
      await onChanged?.();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to link AutoCount invoice.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header with Back Button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Invoices
          </button>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1e3a8a] ring-1 ring-blue-100">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">{invoice ? "AutoCount Invoice" : "Link AutoCount Invoice"}</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              {workOrder?.workOrderNo
                ? `${workOrder.workOrderNo} · ${workOrder.companyName || "—"} · ${workOrder.vehicleNo || "—"}`
                : `${invoice?.invoiceNo || "AutoCount Document"} · ${invoice?.vehicleNoRaw || "External / Unlinked"}`}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs leading-5 text-blue-800">
          AutoCount remains the official accounting source. Synchronized document values and item lines are read-only here; only the MAW work-order link can be maintained.
        </div>
        {readOnly ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            This is a historical AutoCount invoice without a linked MAW work order. It is view-only.
          </div>
        ) : null}
        {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div> : null}

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-slate-900">1. AutoCount document</h3>
            <p className="mt-0.5 text-xs text-slate-500">Record the accounting reference, values and e-Invoice state.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-700">
              AutoCount Invoice No.
              <input
                required
                disabled={readOnly || Boolean(invoice)}
                value={invoiceNo}
                onChange={(event) => setInvoiceNo(event.target.value.toUpperCase())}
                placeholder="MA26080001"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 uppercase"
              />
            </label>
            <label className="text-xs font-bold text-slate-700">
              AutoCount Job No.
              <input
                disabled={readOnly}
                value={jobNo}
                onChange={(event) => setJobNo(event.target.value.toUpperCase())}
                placeholder="MAJ2527"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 uppercase"
              />
            </label>
            <label className="text-xs font-bold text-slate-700">
              Invoice date
              <DesktopDatePicker
                disabled={readOnly}
                value={invoiceDate}
                onChange={setInvoiceDate}
                ariaLabel="Choose AutoCount invoice date"
                className="mt-1 h-10 bg-slate-50"
              />
            </label>
            <label className="text-xs font-bold text-slate-700">
              Vehicle No. as shown in AutoCount
              <input
                disabled={readOnly}
                value={vehicleNoRaw}
                onChange={(event) => setVehicleNoRaw(event.target.value.toUpperCase())}
                placeholder="Prime mover / trailer text"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 uppercase"
              />
            </label>
            <label className="text-xs font-bold text-slate-700">
              Total (RM)
              <input
                type="number"
                min="0"
                step="0.01"
                disabled={readOnly}
                value={total}
                onChange={(event) => setTotal(Number(event.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"
              />
            </label>
            <label className="text-xs font-bold text-slate-700">
              Outstanding (RM)
              <input
                type="number"
                min="0"
                max={total}
                step="0.01"
                disabled={readOnly}
                value={outstanding}
                onChange={(event) => setOutstanding(Number(event.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"
              />
            </label>
            <label className="text-xs font-bold text-slate-700">
              Document status
              <AdminSelect
                disabled={readOnly}
                value={documentStatus}
                onChange={(event) => setDocumentStatus(event.target.value as typeof documentStatus)}
                className="mt-1 w-full"
              >
                <option value="approved">Approved</option>
                <option value="void">Void</option>
                <option value="expired">Expired</option>
              </AdminSelect>
            </label>
            <label className="text-xs font-bold text-slate-700">
              e-Invoice status
              <AdminSelect
                disabled={readOnly}
                value={eInvoiceStatus}
                onChange={(event) => setEInvoiceStatus(event.target.value as typeof eInvoiceStatus)}
                className="mt-1 w-full"
              >
                <option value="">Not available</option>
                <option value="valid">Valid</option>
                <option value="cancelled">Cancelled</option>
                <option value="invalid">Invalid</option>
              </AdminSelect>
            </label>
          </div>
          <label className="mt-4 block text-xs font-bold text-slate-700">
            e-Invoice UUID
            <input
              disabled={readOnly}
              value={eInvoiceUuid}
              onChange={(event) => setEInvoiceUuid(event.target.value)}
              placeholder="Optional until synced"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5"
            />
          </label>
        </section>

        {invoice ? (
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-4 sm:px-6">
              <div>
                <h3 className="text-sm font-bold text-slate-900">2. Synchronized invoice items</h3>
                <p className="mt-0.5 text-xs text-slate-500">Prices and tax values read directly from the AutoCount invoice.</p>
              </div>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
                {items.length} line{items.length === 1 ? "" : "s"}
              </span>
            </div>

            {items.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-xs">
                    <thead className="bg-slate-50 text-left font-bold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Item / Description</th>
                        <th className="px-4 py-3 text-right">Qty</th>
                        <th className="px-4 py-3 text-right">Unit Price</th>
                        <th className="px-4 py-3">Tax</th>
                        <th className="px-4 py-3 text-right">Tax Amount</th>
                        <th className="px-4 py-3 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {items.map((item, index) => (
                        <tr key={item.id || `${item.code || "line"}-${index}`} className="align-top">
                          <td className="max-w-md px-4 py-3">
                            <p className="font-mono text-[11px] font-bold text-blue-700">{item.code || "NON-STOCK"}</p>
                            <p className="mt-1 whitespace-pre-wrap font-semibold text-slate-800">{item.description}</p>
                            {item.type ? <p className="mt-1 uppercase text-slate-400">{item.type}</p> : null}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-700">{Number(item.quantity || 0).toLocaleString("en-MY", { maximumFractionDigits: 3 })}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">RM {money(item.unitPrice)}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                            <p className="font-bold">{item.taxCode || "@0%"}</p>
                            <p className="text-slate-400">{Number(item.taxRate || 0).toFixed(2)}%</p>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">RM {money(item.taxAmount)}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-bold text-slate-900">RM {money(item.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <dl className="ml-auto grid max-w-sm grid-cols-[1fr_auto] gap-x-6 gap-y-2 border-t border-slate-200 bg-slate-50 px-6 py-4 text-sm">
                  <dt className="text-slate-500">Line subtotal</dt><dd className="text-right font-semibold">RM {money(lineSubtotal)}</dd>
                  <dt className="text-slate-500">Tax</dt><dd className="text-right font-semibold">RM {money(lineTax)}</dd>
                  <dt className="border-t border-slate-300 pt-2 font-bold text-slate-900">Invoice total</dt><dd className="border-t border-slate-300 pt-2 text-right font-extrabold text-slate-900">RM {money(invoice.total)}</dd>
                  <dt className="text-slate-500">Outstanding</dt><dd className="text-right font-bold text-amber-700">RM {money(invoice.balance)}</dd>
                </dl>
              </>
            ) : (
              <div className="px-6 py-10 text-center">
                <Database className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm font-semibold text-slate-700">No synchronized detail rows</p>
                <p className="mt-1 text-xs text-slate-500">The AutoCount invoice header is available, but no matching detail rows were returned.</p>
              </div>
            )}
          </section>
        ) : null}

        {!readOnly ? (
          <div className="flex flex-col-reverse gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="text-xs text-slate-500"><span className="font-bold text-red-500">*</span> Required fields must be completed</p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="h-10 rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || !invoiceNo.trim() || !invoiceDate}
                onClick={() => void submit()}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#1e3a8a] px-6 text-sm font-bold text-white shadow-sm hover:bg-blue-800 disabled:opacity-50"
              >
                <Link2 className="h-4 w-4" />
                {saving ? "Saving..." : invoice ? "Update Link" : "Link Invoice"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
