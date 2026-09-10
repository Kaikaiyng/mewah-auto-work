import { useMemo, useState } from "react";
import { Database, Edit, Lock, Save, Search, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useConfirmationDialog } from "../contexts/confirmation-dialog-context";
import {
  formatMalaysiaPhone,
  formatMalaysiaPhoneInput,
  isValidMalaysiaPhone,
  MALAYSIA_PHONE_PLACEHOLDER,
  normalizeMalaysiaPhone,
} from "../lib/malaysia-phone";
import { hasAdminPermission } from "../lib/admin-permissions";
import { postApi } from "../lib/api";
import { useApiData } from "../lib/use-api-data";
import { AdminSelect } from "./ui/admin-select";
import { AutoCountSyncBadge } from "./autocount-sync-badge";
import {
  AdminDialogCancelButton,
  AdminDialogPrimaryButton,
  AdminFormDialog,
  AdminFormDialogBody,
  AdminFormDialogFooter,
  AdminFormDialogHeader,
  AdminFormSection,
  adminFieldClass,
  adminLabelClass,
  adminTextareaClass,
} from "./ui/admin-form-dialog";

type CompanyDriver = {
  id: number;
  companyId: number;
  companyName: string;
  name: string;
  phone: string;
  licenceNo: string;
  status: "Active" | "Inactive";
  notes: string;
};

type DriverForm = Omit<CompanyDriver, "id" | "companyName">;

const emptyForm: DriverForm = {
  companyId: 0,
  name: "",
  phone: "",
  licenceNo: "",
  status: "Active",
  notes: "",
};

export function Drivers() {
  const canUpdate = hasAdminPermission("driver.update");
  const { data, isLoading, error, reload } = useApiData<CompanyDriver[]>("admin-drivers", []);
  const { data: companies } = useApiData<{ id: number; name: string }[]>("admin-companies", []);
  const confirmAction = useConfirmationDialog();
  const [searchTerm, setSearchTerm] = useState("");
  const [companyFilter, setCompanyFilter] = useState(0);
  const [selectedDriver, setSelectedDriver] = useState<CompanyDriver | null>(null);
  const [modalMode, setModalMode] = useState<"edit" | null>(null);
  const [form, setForm] = useState<DriverForm>(emptyForm);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const filteredDrivers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return data.filter((driver) => {
      const matchesCompany = !companyFilter || driver.companyId === companyFilter;
      const matchesQuery = !query || [driver.name, driver.phone, driver.licenceNo, driver.companyName]
        .some((value) => value.toLowerCase().includes(query));
      return matchesCompany && matchesQuery;
    });
  }, [companyFilter, data, searchTerm]);

  const closeModal = () => {
    setSelectedDriver(null);
    setModalMode(null);
    setForm(emptyForm);
    setFormError("");
    setIsSaving(false);
  };

  const openEdit = (driver: CompanyDriver) => {
    setSelectedDriver(driver);
    setIsSaving(false);
    setModalMode("edit");
    setForm({
      companyId: driver.companyId,
      name: driver.name,
      phone: driver.phone,
      licenceNo: driver.licenceNo,
      status: driver.status,
      notes: driver.notes,
    });
    setFormError("");
  };

  const saveDriver = async () => {
    setFormError("");
    if (!form.companyId || !form.name.trim()) {
      setFormError("Company and driver name are required.");
      return;
    }
    if (form.phone.trim() && !isValidMalaysiaPhone(form.phone)) {
      setFormError("Enter a valid Malaysia mobile or landline number.");
      return;
    }
    setIsSaving(true);
    try {
      await postApi("admin-update-driver", {
        id: selectedDriver?.id,
        ...form,
        name: form.name.trim(),
        phone: form.phone.trim() ? normalizeMalaysiaPhone(form.phone) : "",
        licenceNo: form.licenceNo.trim().toUpperCase(),
        notes: form.notes.trim(),
      });
      await reload();
      closeModal();
      toast.success("Driver updated.");
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : "Unable to save driver.");
    } finally {
      setIsSaving(false);
    }
  };


  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-extrabold text-slate-900">Driver Management</h1>
            <AutoCountSyncBadge
              label="AutoCount Driver Master"
              onRefresh={() => void reload()}
              isRefreshing={isLoading}
            />
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Company drivers are managed in AutoCount and synchronized to workshop fleet records.
          </p>
        </div>

      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Driver data unavailable: {error}</div> : null}

      <div className="maw-filter-bar">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="md:col-span-2">
            <div className="maw-search-field">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search drivers by name, phone, licence no..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
          </div>
          <div>
            <AdminSelect
              value={companyFilter}
              onChange={(event) => setCompanyFilter(Number(event.target.value))}
              className="w-full"
              aria-label="Filter drivers by company"
            >
              <option value={0}>All Companies</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </AdminSelect>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50"><tr>
              {['Driver', 'Company', 'Phone', 'Licence No.', 'Status'].map((heading) => <th key={heading} className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{heading}</th>)}
              <th className="px-6 py-3 text-right whitespace-nowrap"><span className="sr-only">Actions</span></th>
            </tr></thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? <tr><td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-500">Loading drivers...</td></tr> : null}
              {!isLoading && filteredDrivers.length === 0 ? <tr><td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-500"><UserRound className="mx-auto mb-2 h-8 w-8 text-gray-300" />No drivers found.</td></tr> : null}
              {filteredDrivers.map((driver) => <tr key={driver.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm font-semibold text-gray-900">{driver.name}</td>
                <td className="px-6 py-4 text-sm text-gray-700">{driver.companyName}</td>
                <td className="px-6 py-4 text-sm text-gray-700">{driver.phone || '-'}</td>
                <td className="px-6 py-4 text-sm text-gray-700">{driver.licenceNo || '-'}</td>
                <td className="px-6 py-4"><span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${driver.status === 'Active' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}><span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />{driver.status}</span></td>
                <td className="px-6 py-4 text-right whitespace-nowrap"><div className="flex justify-end gap-1">
                  {canUpdate ? <button type="button" onClick={() => openEdit(driver)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label={`Edit ${driver.name}`}><Edit className="h-4 w-4" /></button> : null}
                </div></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </div>

      {modalMode ? (
        <AdminFormDialog size="md" labelledBy="driver-dialog-title">
          <AdminFormDialogHeader
            id="driver-dialog-title"
            title="Edit Driver"
            description="Driver master identity is synced from AutoCount. Maintain operational contact details and status."
            icon={<UserRound className="h-5 w-5" />}
            badge="Editing"
            onClose={closeModal}
          />
          <AdminFormDialogBody>
            {formError ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</div> : null}
            <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 flex items-start gap-2.5 text-xs text-slate-700">
              <Database className="h-4 w-4 text-[#1e3a8a] shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-900">AutoCount Master Entity:</strong> Driver name, company, and licence number are synchronized from AutoCount master. Operational contact numbers and notes can be maintained here.
              </div>
            </div>
            <AdminFormSection number={1} title="Company & identity" description="Driver identity details." icon={<UserRound className="h-4 w-4" />}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className={adminLabelClass}>Company</label>
                  <input
                    value={companies.find((c) => c.id === form.companyId)?.name || `Company #${form.companyId}`}
                    disabled
                    className={`${adminFieldClass} bg-slate-100 text-slate-600 cursor-not-allowed`}
                  />
                </div>
                <div>
                  <label className={adminLabelClass}>Driver name</label>
                  <input
                    value={form.name}
                    disabled
                    className={`${adminFieldClass} bg-slate-100 text-slate-600 cursor-not-allowed`}
                  />
                </div>
                <div>
                  <label className={adminLabelClass}>Phone</label>
                  <input value={form.phone} onChange={(event) => setForm({ ...form, phone: formatMalaysiaPhoneInput(event.target.value) })} placeholder={MALAYSIA_PHONE_PLACEHOLDER} className={adminFieldClass} />
                </div>
                <div>
                  <label className={adminLabelClass}>Licence number</label>
                  <input value={form.licenceNo} onChange={(event) => setForm({ ...form, licenceNo: event.target.value })} className={`${adminFieldClass} uppercase`} />
                </div>
                <div>
                  <label className={adminLabelClass}>Status</label>
                  <AdminSelect value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as DriverForm["status"] })} className="w-full"><option>Active</option><option>Inactive</option></AdminSelect>
                </div>
              </div>
            </AdminFormSection>
            <AdminFormSection number={2} title="Internal notes" description="Optional information for the operations team." icon={<Edit className="h-4 w-4" />} tone="slate">
              <label className={adminLabelClass}>Notes <span className="font-normal text-slate-400">(optional)</span></label>
              <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} maxLength={500} rows={3} className={adminTextareaClass} />
            </AdminFormSection>
          </AdminFormDialogBody>
          <AdminFormDialogFooter>
            <AdminDialogCancelButton onClick={closeModal}>Cancel</AdminDialogCancelButton>
            <AdminDialogPrimaryButton onClick={saveDriver} disabled={isSaving}><Save className="h-4 w-4" />{isSaving ? "Saving..." : "Save Changes"}</AdminDialogPrimaryButton>
          </AdminFormDialogFooter>
        </AdminFormDialog>
      ) : null}
    </div>
  );
}
