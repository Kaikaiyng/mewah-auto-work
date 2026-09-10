import { useEffect, useRef, useState, useMemo } from "react";
import { useSearchParams } from "react-router";
import { Search, Plus, Eye, Edit, Trash2, Phone, X, UserRound, KeyRound, Save, ChevronLeft, ChevronRight, MapPin, Filter, ArrowLeft } from "lucide-react";
import { useLanguage } from "../contexts/language-context";
import { postApi } from "../lib/api";
import { EMAIL_PLACEHOLDER, isValidEmail, normalizeEmail } from "../lib/email";
import {
  formatMalaysiaPhone,
  formatMalaysiaPhoneInput,
  isValidMalaysiaPhone,
  MALAYSIA_PHONE_PLACEHOLDER,
  normalizeMalaysiaPhone,
} from "../lib/malaysia-phone";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordValidationMessage,
} from "../lib/password";
import { useApiData } from "../lib/use-api-data";
import { toast } from "sonner";
import { PageLoading } from "./ui/page-loading";
import { useConfirmationDialog } from "../contexts/confirmation-dialog-context";
import { AdminSelect } from "./ui/admin-select";
import { AdminPagination } from "./ui/admin-pagination";
import { hasAdminPermission } from "../lib/admin-permissions";
import { adminFieldClass, adminLabelClass } from "./ui/admin-form-dialog";

type DeliveryAddress = {
  id: string;
  contactName: string;
  address: string;
  contactPhone: string;
  isDefault?: boolean;
};

type Customer = {
  id: number;
  name: string;
  email: string;
  phone: string;
  vehicles: number;
  totalBookings: number;
  lastVisit: string;
  status: string;
  companyId?: number;
  companyName?: string;
  deliveryAddresses: DeliveryAddress[];
};

type CustomerForm = {
  name: string;
  email: string;
  phone: string;
  password: string;
  companyId: number;
  status: "Active" | "Inactive";
  deliveryAddresses: DeliveryAddress[];
};

const emptyCustomerForm: CustomerForm = {
  name: "",
  email: "",
  phone: "",
  password: "",
  companyId: 0,
  status: "Active",
  deliveryAddresses: [],
};

const mockCustomers: Customer[] = [];



function CompanyUserReadOnlyField({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <span className="mb-1 block text-[11px] font-bold text-slate-600">{label}</span>
      <div className="flex h-10 w-full items-center rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 text-xs font-medium text-slate-800">
        {value === null || value === undefined || value === "" ? "—" : value}
      </div>
    </div>
  );
}

export function Customers() {
  const [searchParams, setSearchParams] = useSearchParams();
  const companyFilter = Number(searchParams.get("companyId") || 0);
  const userDetailId = Number(searchParams.get("userId") || 0);
  const editUserId = Number(searchParams.get("editUserId") || 0);
  const canCreate = hasAdminPermission("customer.create");
  const canUpdate = hasAdminPermission("customer.update");
  const canDelete = hasAdminPermission("customer.delete");
  const { t } = useLanguage();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [modalMode, setModalMode] = useState<"view" | "create" | "edit" | null>(null);
  const [form, setForm] = useState<CustomerForm>(emptyCustomerForm);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const handledUserDetailId = useRef(0);
  const handledEditUserId = useRef(0);
  const { data: customersData, isLoading, error, reload, hasLoaded } = useApiData<Customer[]>("admin-customers", []);
  const { data: companiesData } = useApiData<{ id: number; name: string }[]>("admin-companies", []);
  const confirmAction = useConfirmationDialog();

  const customers = useMemo(() => {
    if (isLoading && !hasLoaded) {
      return [];
    }
    if (error && customersData.length === 0) {
      return mockCustomers;
    }
    return customersData;
  }, [customersData, isLoading, hasLoaded, error]);

  const openCreateModal = () => {
    setSelectedCustomer(null);
    setForm({
      ...emptyCustomerForm,
      companyId: companiesData[0]?.id ?? 0,
    });
    setFormError("");
    setIsSaving(false);
    setModalMode("create");
  };

  const openEditModal = (customer: Customer) => {
    setSelectedCustomer(customer);
    setForm({
      name: customer.name,
      email: customer.email,
      phone: formatMalaysiaPhone(customer.phone),
      password: "",
      companyId: customer.companyId ?? 0,
      status: customer.status === "Inactive" ? "Inactive" : "Active",
      deliveryAddresses: (customer.deliveryAddresses || []).map((address) => ({ ...address })),
    });
    setFormError("");
    setIsSaving(false);
    setModalMode("edit");
  };

  const openViewModal = (customer: Customer) => {
    setSelectedCustomer(customer);
    setFormError("");
    setModalMode("view");
  };

  const closeModal = () => {
    if (searchParams.has("userId")) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("userId");
      setSearchParams(nextParams, { replace: true });
    }
    setSelectedCustomer(null);
    setForm(emptyCustomerForm);
    setFormError("");
    setModalMode(null);
  };

  useEffect(() => {
    if (!userDetailId) {
      handledUserDetailId.current = 0;
      return;
    }
    if (isLoading || handledUserDetailId.current === userDetailId) return;
    const requestedUser = customers.find((customer) => customer.id === userDetailId);
    if (!requestedUser) return;
    handledUserDetailId.current = userDetailId;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("userId");
    setSearchParams(nextParams, { replace: true });
    setSelectedCustomer(requestedUser);
    setFormError("");
    setModalMode("view");
  }, [customers, userDetailId, isLoading, searchParams, setSearchParams]);

  useEffect(() => {
    if (!editUserId || !canUpdate) {
      handledEditUserId.current = 0;
      return;
    }
    if (isLoading || handledEditUserId.current === editUserId) return;
    const requestedUser = customers.find((customer) => customer.id === editUserId);
    if (!requestedUser) return;
    handledEditUserId.current = editUserId;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("editUserId");
    setSearchParams(nextParams, { replace: true });
    openEditModal(requestedUser);
  }, [canUpdate, customers, editUserId, isLoading, searchParams, setSearchParams]);

  const handleSubmitCustomer = async () => {
    setFormError("");

    if (!form.name.trim() || !form.email.trim() || !form.phone.trim()) {
      setFormError("Name, email, and phone are required.");
      return;
    }

    if (!form.companyId) {
      setFormError("Select a company.");
      return;
    }

    if (!isValidEmail(form.email)) {
      setFormError("Enter a valid email address, for example name@example.com.");
      return;
    }

    if (!isValidMalaysiaPhone(form.phone)) {
      setFormError("Enter a valid Malaysia mobile or landline number.");
      return;
    }

    if (modalMode === "create" && !form.password.trim()) {
      setFormError("Password is required for new company users.");
      return;
    }

    if (form.password) {
      const passwordError = passwordValidationMessage(
        form.password,
        modalMode === "edit" ? "New password" : "Password",
      );
      if (passwordError) {
        setFormError(passwordError);
        return;
      }
    }

    for (const address of form.deliveryAddresses) {
      if (!address.contactName.trim() || !address.address.trim() || !address.contactPhone.trim()) {
        setFormError("Complete the contact name, phone, and full address for every delivery address.");
        return;
      }
      if (!isValidMalaysiaPhone(address.contactPhone)) {
        setFormError(`Enter a valid Malaysia phone number for ${address.contactName.trim() || "the delivery address"}.`);
        return;
      }
    }

    setIsSaving(true);
    try {
      await postApi(modalMode === "create" ? "admin-create-customer" : "admin-update-customer", {
        id: selectedCustomer?.id,
        name: form.name.trim(),
        email: normalizeEmail(form.email),
        phone: normalizeMalaysiaPhone(form.phone)!,
        password: form.password,
        companyId: form.companyId,
        status: form.status,
        deliveryAddresses: form.deliveryAddresses.map((address) => ({
          ...address,
          contactName: address.contactName.trim(),
          address: address.address.trim(),
          contactPhone: normalizeMalaysiaPhone(address.contactPhone)!,
        })),
      });
      await reload();
      if (modalMode === "edit" && selectedCustomer) {
        const selectedCompany = companiesData.find((company) => Number(company.id) === Number(form.companyId));
        setSelectedCustomer({
          ...selectedCustomer,
          name: form.name.trim(),
          email: normalizeEmail(form.email),
          phone: normalizeMalaysiaPhone(form.phone)!,
          companyId: form.companyId,
          companyName: selectedCompany?.name || selectedCustomer.companyName,
          status: form.status,
          deliveryAddresses: form.deliveryAddresses.map((address) => ({
            ...address,
            contactName: address.contactName.trim(),
            address: address.address.trim(),
            contactPhone: normalizeMalaysiaPhone(address.contactPhone)!,
          })),
        });
        setModalMode("view");
        setFormError("");
      } else {
        closeModal();
      }
    } catch (apiError) {
      setFormError(apiError instanceof Error ? apiError.message : "Unable to save company user.");
    } finally {
      setIsSaving(false);
    }
  };

  const addDeliveryAddress = () => {
    setForm((current) => ({
      ...current,
      deliveryAddresses: [
        ...current.deliveryAddresses,
        {
          id: `addr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          contactName: "",
          address: "",
          contactPhone: "",
          isDefault: current.deliveryAddresses.length === 0,
        },
      ],
    }));
    setFormError("");
  };

  const updateDeliveryAddress = (id: string, changes: Partial<DeliveryAddress>) => {
    setForm((current) => ({
      ...current,
      deliveryAddresses: current.deliveryAddresses.map((address) =>
        address.id === id ? { ...address, ...changes } : address,
      ),
    }));
    setFormError("");
  };

  const makeDefaultDeliveryAddress = (id: string) => {
    setForm((current) => ({
      ...current,
      deliveryAddresses: current.deliveryAddresses.map((address) => ({
        ...address,
        isDefault: address.id === id,
      })),
    }));
  };

  const removeDeliveryAddress = async (id: string) => {
    const target = form.deliveryAddresses.find((a) => a.id === id);
    const addrLabel = target?.contactName?.trim() || target?.address?.trim() || "this address";
    const confirmed = await confirmAction({
      title: "Remove Delivery Address?",
      description: `Are you sure you want to remove the delivery address for "${addrLabel}"?`,
      confirmLabel: "Remove Address",
      tone: "danger",
    });
    if (!confirmed) return;

    setForm((current) => {
      const removedWasDefault = current.deliveryAddresses.some((address) => address.id === id && address.isDefault);
      const remaining = current.deliveryAddresses.filter((address) => address.id !== id);
      if (removedWasDefault && remaining.length > 0) {
        remaining[0] = { ...remaining[0], isDefault: true };
      }
      return { ...current, deliveryAddresses: remaining };
    });
    setFormError("");
  };

  const handleDeleteCustomer = async (customer: Customer) => {
    const confirmed = await confirmAction({
      title: `Delete company user "${customer.name}"?`,
      description: "The company must retain at least one app user. This action cannot be undone.",
      confirmLabel: "Delete company user",
      tone: "danger",
    });
    if (!confirmed) {
      return;
    }

    try {
      await postApi("admin-delete-customer", { id: customer.id });
      await reload();
      toast.success(`Company user "${customer.name}" deleted.`);
      if (selectedCustomer?.id === customer.id) closeModal();
    } catch (apiError) {
      toast.error(apiError instanceof Error ? apiError.message : "Unable to delete company user.");
    }
  };

  const filteredCustomers = customers.filter((customer) => {
    const matchesSearch =
      customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.phone.includes(searchTerm);
    const matchesStatus = selectedStatus === "All" || customer.status === selectedStatus;
    const matchesCompany = companyFilter === 0 || Number(customer.companyId) === companyFilter;
    return matchesSearch && matchesStatus && matchesCompany;
  });
  const filteredCompanyName = companiesData.find((company) => Number(company.id) === companyFilter)?.name;
  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / pageSize));
  const paginatedCustomers = filteredCustomers.slice((page - 1) * pageSize, page * pageSize);
  const isStandaloneUserPage = Boolean(selectedCustomer && (modalMode === "view" || modalMode === "edit"));

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setPage(1);
  }, [companyFilter]);

  const clearCompanyFilter = () => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("companyId");
    setSearchParams(nextParams);
  };



  if (isLoading && !hasLoaded) {
    return (
      <PageLoading
        title="Loading Company Users..."
        description="Fetching drivers, fleet managers, and customer user accounts..."
      />
    );
  }

  if (isStandaloneUserPage && selectedCustomer) {
    const isEditing = modalMode === "edit";
    return (
      <div className="w-full space-y-6">
        <div className="space-y-3">
          <button type="button" onClick={closeModal} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 cursor-pointer">
            <ArrowLeft className="h-4 w-4 text-slate-500" />
            Back to Company Users
          </button>

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-black tracking-tight text-slate-900">{selectedCustomer.name}</h1>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${selectedCustomer.status === "Active" ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${selectedCustomer.status === "Active" ? "bg-emerald-600" : "bg-slate-400"}`} />
                  {selectedCustomer.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">Customer App user profile, company access and delivery address information.</p>
            </div>
            <div className="flex items-center gap-2.5">
              {!isEditing ? (
                canUpdate ? <button key="btn-edit-customer" type="button" onClick={() => openEditModal(selectedCustomer)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-blue-600 bg-white px-5 text-xs font-bold text-blue-600 shadow-2xs transition-colors hover:bg-blue-50 cursor-pointer"><Edit className="h-4 w-4" />Edit User</button> : null
              ) : (
                <>
                  <button key="btn-cancel-customer" type="button" disabled={isSaving} onClick={() => openViewModal(selectedCustomer)} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 cursor-pointer"><X className="h-4 w-4" />Cancel</button>
                  <button key="btn-save-customer" type="button" disabled={isSaving} onClick={handleSubmitCustomer} className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-blue-700 disabled:opacity-50 cursor-pointer"><Save className="h-4 w-4" />{isSaving ? "Saving..." : "Save Changes"}</button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs">
          <h3 className="text-sm font-extrabold text-slate-900">General Information</h3>
          {formError ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-medium text-rose-700">{formError}</div> : null}
          {!isEditing ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <CompanyUserReadOnlyField label="User ID" value={selectedCustomer.id} />
                <CompanyUserReadOnlyField label="User Name" value={selectedCustomer.name} />
                <CompanyUserReadOnlyField label="Company" value={selectedCustomer.companyName} />
                <CompanyUserReadOnlyField label="Status" value={selectedCustomer.status} />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <CompanyUserReadOnlyField label="Phone" value={formatMalaysiaPhone(selectedCustomer.phone)} />
                <CompanyUserReadOnlyField label="Email" value={selectedCustomer.email} />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <CompanyUserReadOnlyField label="User ID" value={selectedCustomer.id} />
                <div><label className={adminLabelClass}>User Name *</label><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={adminFieldClass} /></div>
                <div><label className={adminLabelClass}>Company *</label><AdminSelect value={form.companyId} onChange={(event) => setForm({ ...form, companyId: Number(event.target.value) })} className="h-10 w-full text-xs"><option value="">{t('select_company')}</option>{companiesData.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</AdminSelect></div>
                <div><label className={adminLabelClass}>Status *</label><AdminSelect value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as "Active" | "Inactive" })} className="h-10 w-full text-xs"><option value="Active">Active</option><option value="Inactive">Inactive</option></AdminSelect></div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div><label className={adminLabelClass}>Phone *</label><input type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: formatMalaysiaPhoneInput(event.target.value) })} className={adminFieldClass} placeholder={MALAYSIA_PHONE_PLACEHOLDER} /></div>
                <div><label className={adminLabelClass}>Email *</label><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} onBlur={() => setForm({ ...form, email: normalizeEmail(form.email) })} className={adminFieldClass} placeholder={EMAIL_PLACEHOLDER} /></div>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs">
          <h3 className="text-sm font-extrabold text-slate-900">Activity &amp; App Access</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <CompanyUserReadOnlyField label="Vehicles" value={selectedCustomer.vehicles} />
            <CompanyUserReadOnlyField label="Bookings" value={selectedCustomer.totalBookings} />
            <CompanyUserReadOnlyField label="Last Visit" value={selectedCustomer.lastVisit} />
            {isEditing ? <div><label className={adminLabelClass}>New Password</label><input type="password" autoComplete="new-password" value={form.password} onChange={(event) => { setForm({ ...form, password: event.target.value }); setFormError(""); }} className={adminFieldClass} placeholder="Leave blank to keep current" minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} /></div> : <CompanyUserReadOnlyField label="App Access" value={selectedCustomer.status === "Active" ? "Enabled" : "Disabled"} />}
          </div>
          {isEditing ? <p className="text-xs text-slate-500">Password must be 8–128 characters without spaces. Leave blank to keep the current password.</p> : null}
        </div>

        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs">
          <div className="flex items-center justify-between gap-4">
            <div><h3 className="text-sm font-extrabold text-slate-900">Delivery Addresses</h3><p className="mt-1 text-xs text-slate-500">Addresses shared with the Customer App.</p></div>
            {isEditing ? <button type="button" onClick={addDeliveryAddress} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-blue-200 bg-white px-3.5 text-xs font-bold text-blue-600 transition-colors hover:bg-blue-50 cursor-pointer"><Plus className="h-3.5 w-3.5" />Add Address</button> : <span className="text-xs font-bold text-slate-400">Total {selectedCustomer.deliveryAddresses.length} addresses</span>}
          </div>
          {!isEditing ? (
            selectedCustomer.deliveryAddresses.length === 0 ? <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center text-xs font-medium text-slate-400">No delivery addresses added.</div> : <div className="grid gap-4 md:grid-cols-2">{selectedCustomer.deliveryAddresses.map((address) => <div key={address.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4"><div className="flex items-center gap-2"><span className="text-xs font-bold text-slate-900">{address.contactName}</span>{address.isDefault ? <span className="text-[10px] font-bold text-blue-600">Default</span> : null}</div><p className="mt-2 whitespace-pre-line text-xs leading-5 text-slate-700">{address.address}</p><p className="mt-2 text-xs text-slate-500">{formatMalaysiaPhone(address.contactPhone)}</p></div>)}</div>
          ) : (
            form.deliveryAddresses.length === 0 ? <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center text-xs font-medium text-slate-400">No delivery addresses added.</div> : <div className="space-y-4">{form.deliveryAddresses.map((address, index) => <div key={address.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4"><div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2"><span className="text-xs font-bold text-slate-700">Address {index + 1}</span>{address.isDefault ? <span className="text-[10px] font-bold text-blue-600">Default</span> : null}</div><button type="button" onClick={() => void removeDeliveryAddress(address.id)} className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:text-red-700"><Trash2 className="h-3.5 w-3.5" />Remove</button></div><div className="grid gap-4 md:grid-cols-2"><div><label className={adminLabelClass}>Contact Name *</label><input value={address.contactName} onChange={(event) => updateDeliveryAddress(address.id, { contactName: event.target.value })} className={adminFieldClass} /></div><div><label className={adminLabelClass}>Contact Phone *</label><input value={address.contactPhone} onChange={(event) => updateDeliveryAddress(address.id, { contactPhone: formatMalaysiaPhoneInput(event.target.value) })} className={adminFieldClass} placeholder={MALAYSIA_PHONE_PLACEHOLDER} /></div><div className="md:col-span-2"><label className={adminLabelClass}>Full Address *</label><textarea value={address.address} onChange={(event) => updateDeliveryAddress(address.id, { address: event.target.value })} className={`${adminFieldClass} min-h-20 resize-y py-2.5`} /></div></div><label className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-slate-600"><input type="radio" name="default-delivery-address" checked={Boolean(address.isDefault)} onChange={() => makeDefaultDeliveryAddress(address.id)} className="h-4 w-4 accent-blue-600" />Use as default delivery address</label></div>)}</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
    {!isStandaloneUserPage ? <div className="w-full space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">{t('customer_management')}</h1>
          <p className="mt-1 text-xs text-slate-500">Manage Customer App users, company access and delivery addresses.</p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate ? <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#1e3a8a] px-4 text-xs font-bold text-white shadow-sm transition-colors hover:bg-blue-800 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            {t('add_customer')}
          </button> : null}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          Database data unavailable: {error}. Showing fallback data.
        </div>
      )}

      {companyFilter ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <span>
            Showing users for <strong>{filteredCompanyName || `Company #${companyFilter}`}</strong>
          </span>
          <button type="button" onClick={clearCompanyFilter} className="font-semibold text-[#1e3a8a] hover:text-blue-700">
            Clear company filter
          </button>
        </div>
      ) : null}



      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[280px] flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder={t('search_customers')}
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-xs outline-none shadow-2xs placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100"
              />
          </div>
          <div className="w-48 sm:w-56">
            <AdminSelect
              value={selectedStatus}
              onChange={(e) => { setSelectedStatus(e.target.value); setPage(1); }}
              className="h-10 text-xs"
              aria-label="Filter company user status"
            >
              <option value="All">{t('all')}</option>
              <option value="Active">{t('active')}</option>
              <option value="Inactive">{t('inactive')}</option>
            </AdminSelect>
          </div>
          <button
            type="button"
            onClick={() => { setSearchTerm(""); setSelectedStatus("All"); setPage(1); }}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 cursor-pointer"
          >
            <Filter className="h-3.5 w-3.5 text-slate-500" />
            Clear Filters
          </button>
      </div>

      {/* Customers Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50/70">
              <tr className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3.5 text-left">User ID</th>
                <th className="px-5 py-3.5 text-left">User Name</th>
                <th className="px-5 py-3.5 text-left">Email</th>
                <th className="px-5 py-3.5 text-left">Phone</th>
                <th className="px-5 py-3.5 text-left">
                  {t('company')}
                </th>
                <th className="px-5 py-3.5 text-left">
                  Delivery Address
                </th>
                <th className="px-5 py-3.5 text-left">
                  {t('vehicles')}
                </th>
                <th className="px-5 py-3.5 text-left">
                  {t('bookings')}
                </th>
                <th className="px-5 py-3.5 text-left">
                  {t('last_visit')}
                </th>
                <th className="px-5 py-3.5 text-left">
                  {t('status')}
                </th>
                <th className="px-5 py-3.5 text-right whitespace-nowrap">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-xs">
              {!isLoading && filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-5 py-16 text-center font-medium text-slate-400">
                    No company users found matching these criteria.
                  </td>
                </tr>
              ) : null}
              {paginatedCustomers.map((customer) => (
                <tr key={customer.id} className="align-middle transition-colors hover:bg-slate-50/50">
                  <td className="px-5 py-4 whitespace-nowrap">
                    <button type="button" onClick={() => openViewModal(customer)} className="font-bold text-blue-600 transition-colors hover:text-blue-800 hover:underline cursor-pointer">
                      {customer.id}
                    </button>
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap">
                    <button type="button" onClick={() => openViewModal(customer)} className="font-bold text-slate-900 transition-colors hover:text-blue-600 cursor-pointer">{customer.name}</button>
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap text-slate-700">
                    {customer.email}
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap text-slate-700">
                    {formatMalaysiaPhone(customer.phone)}
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap font-semibold text-slate-900">
                    {customer.companyName || "-"}
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap text-slate-700">
                    {(customer.deliveryAddresses || []).length > 0 ? (() => {
                      const defaultAddress = customer.deliveryAddresses.find((address) => address.isDefault) || customer.deliveryAddresses[0];
                      return <button type="button" onClick={() => openViewModal(customer)} className="flex items-center gap-1.5 font-semibold text-slate-900 transition-colors hover:text-blue-600 cursor-pointer"><MapPin className="h-3.5 w-3.5 shrink-0 text-blue-600" />{customer.deliveryAddresses.length} address{customer.deliveryAddresses.length === 1 ? "" : "es"}</button>;
                    })() : <span className="text-slate-400">Not added</span>}
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap font-semibold text-slate-900">
                    {customer.vehicles}
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap font-semibold text-slate-900">
                    {customer.totalBookings}
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap text-slate-500">
                    {customer.lastVisit}
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap">
                    <span className={`font-bold ${customer.status === "Active" ? "text-emerald-600" : "text-slate-500"}`}>
                      {t(customer.status.toLowerCase())}
                    </span>
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => openViewModal(customer)}
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 cursor-pointer"
                        aria-label="View company user"
                        title="View company user"
                      >
                        <Eye className="h-3.5 w-3.5 text-slate-500" />
                        View Details
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <AdminPagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={filteredCustomers.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          itemLabel="company users"
        />
      </div>
    </div> : null}

      {modalMode && (
        <div className={modalMode === "create" ? "fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm transition-opacity sm:p-5" : "w-full space-y-6"}>
          <div className={modalMode === "create" ? "flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150" : "w-full space-y-6"}>
            {modalMode === "create" ? <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-7 sm:py-5">
              <div className="flex min-w-0 items-start gap-3.5">
                <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1e3a8a] ring-1 ring-blue-100"><UserRound className="h-5 w-5" /></div>
                <div>
                <h2 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
                  New Company User
                </h2>
                <p className="mt-1 text-xs leading-5 text-slate-500 sm:text-sm">
                  Manage Customer App login and contact details.
                </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div> : selectedCustomer ? <div className="space-y-4">
              <button type="button" onClick={closeModal} className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50"><ArrowLeft className="h-4 w-4" />Back to Company Users</button>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div><div className="flex flex-wrap items-center gap-2.5"><h1 className="text-2xl font-extrabold text-slate-900">{selectedCustomer.name}</h1><span className={`text-xs font-bold ${selectedCustomer.status === "Active" ? "text-emerald-600" : "text-slate-500"}`}>{selectedCustomer.status}</span></div><p className="mt-1 text-xs text-slate-500">Customer App user, company access and delivery address information.</p></div>
                <div className="flex items-center gap-2">
                  {modalMode === "view" && canDelete ? <button type="button" onClick={() => handleDeleteCustomer(selectedCustomer)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-200 bg-white px-4 text-xs font-bold text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" />Delete User</button> : null}
                  {modalMode === "view" && canUpdate ? <button type="button" onClick={() => openEditModal(selectedCustomer)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-blue-600 bg-white px-4 text-xs font-bold text-blue-600 hover:bg-blue-50"><Edit className="h-4 w-4" />Edit User</button> : null}
                  {modalMode === "edit" ? <><button type="button" onClick={() => openViewModal(selectedCustomer)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 hover:bg-slate-50"><X className="h-4 w-4" />Cancel</button><button type="button" onClick={handleSubmitCustomer} disabled={isSaving} className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"><Save className="h-4 w-4" />{isSaving ? "Saving..." : "Save Changes"}</button></> : null}
                </div>
              </div>
            </div> : null}

            {modalMode === "view" && selectedCustomer ? (
              <div className="space-y-6">
                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs">
                  <h2 className="mb-5 text-sm font-bold text-slate-900">Profile &amp; Company</h2>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <CompanyUserReadOnlyField label="Name" value={selectedCustomer.name} />
                    <CompanyUserReadOnlyField label="Email" value={selectedCustomer.email} />
                    <CompanyUserReadOnlyField label="Phone" value={formatMalaysiaPhone(selectedCustomer.phone)} />
                    <CompanyUserReadOnlyField label="Company" value={selectedCustomer.companyName} />
                    <CompanyUserReadOnlyField label="User ID" value={selectedCustomer.id} />
                    <CompanyUserReadOnlyField label="Vehicles" value={selectedCustomer.vehicles} />
                    <CompanyUserReadOnlyField label="Bookings" value={selectedCustomer.totalBookings} />
                    <CompanyUserReadOnlyField label="Last Visit" value={selectedCustomer.lastVisit} />
                  </div>
                </section>
                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs">
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <div><h2 className="text-sm font-bold text-slate-900">Delivery Addresses</h2><p className="mt-1 text-xs text-slate-500">Addresses maintained through the Customer App.</p></div>
                    <span className="text-xs font-bold text-slate-500">{(selectedCustomer.deliveryAddresses || []).length} address{(selectedCustomer.deliveryAddresses || []).length === 1 ? "" : "es"}</span>
                  </div>
                  {(selectedCustomer.deliveryAddresses || []).length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-8 text-center text-xs text-slate-500">No delivery addresses added in the Customer App.</div>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                      {selectedCustomer.deliveryAddresses.map((address) => (
                        <div key={address.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                          <div className="flex flex-wrap items-center gap-2"><p className="text-xs font-bold text-slate-900">{address.contactName}</p>{address.isDefault ? <span className="text-[10px] font-bold text-blue-600">Default</span> : null}</div>
                          <p className="mt-2 whitespace-pre-line text-xs leading-5 text-slate-700">{address.address}</p>
                          <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500"><Phone className="h-3.5 w-3.5" />{formatMalaysiaPhone(address.contactPhone)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            ) : (
              <div className={modalMode === "create" ? "flex-1 space-y-4 overflow-y-auto bg-slate-50/80 p-4 sm:p-6" : "space-y-6"}>
                {formError && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-600">{formError}</div>}
                <section className="rounded-2xl border border-slate-200 bg-white shadow-2xs">
                  <div className="flex items-start gap-3 rounded-t-xl border-b border-slate-100 bg-white px-4 py-3.5 sm:px-5">{modalMode === "create" ? <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><UserRound className="h-4 w-4" /></div> : null}<div><h3 className="text-sm font-bold text-slate-900">{modalMode === "create" ? "1. Profile & company" : "Profile & Company"}</h3><p className="mt-0.5 text-xs text-slate-500">Customer App user identity and company relationship.</p></div></div>
                  <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-2">
                <div>
                  <label className={adminLabelClass}>Name <span className="text-red-500">*</span></label>
                  <input
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    className={adminFieldClass}
                    placeholder="e.g. John Doe"
                  />
                </div>
                <div>
                  <label className={adminLabelClass}>Email <span className="text-red-500">*</span></label>
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={form.email}
                    onChange={(event) => {
                      setForm({ ...form, email: event.target.value });
                      setFormError("");
                    }}
                    onBlur={() => setForm({ ...form, email: normalizeEmail(form.email) })}
                    className={adminFieldClass}
                    placeholder={EMAIL_PLACEHOLDER}
                    maxLength={254}
                  />
                </div>
                <div>
                  <label className={adminLabelClass}>Phone <span className="text-red-500">*</span></label>
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={form.phone}
                    onChange={(event) => setForm({ ...form, phone: formatMalaysiaPhoneInput(event.target.value) })}
                    placeholder={MALAYSIA_PHONE_PLACEHOLDER}
                    maxLength={18}
                    className={adminFieldClass}
                  />
                  <p className="mt-1 text-xs text-gray-500">Mobile: +60 00-000 0000 · Landline: +60 00-000 0000</p>
                </div>
                <div>
                  <label className={adminLabelClass}>Company</label>
                  <AdminSelect
                    value={form.companyId}
                    onChange={(event) => setForm({ ...form, companyId: Number(event.target.value) })}
                    className="w-full"
                  >
                    <option value="">{t('select_company')}</option>
                    {companiesData.map((comp) => (
                      <option key={comp.id} value={comp.id}>
                        {comp.name}
                      </option>
                    ))}
                  </AdminSelect>
                </div>
                  </div>
                </section>
                <section className="rounded-2xl border border-slate-200 bg-white shadow-2xs">
                  <div className="flex flex-wrap items-start justify-between gap-3 rounded-t-xl border-b border-slate-100 bg-white px-4 py-3.5 sm:px-5">
                    <div className="flex items-start gap-3">{modalMode === "create" ? <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><MapPin className="h-4 w-4" /></div> : null}<div><h3 className="text-sm font-bold text-slate-900">{modalMode === "create" ? "2. Delivery addresses" : "Delivery Addresses"}</h3><p className="mt-0.5 text-xs text-slate-500">Addresses maintained through the Customer App.</p></div></div>
                    <button type="button" onClick={addDeliveryAddress} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100"><Plus className="h-3.5 w-3.5" />Add address</button>
                  </div>
                  <div className="space-y-3 p-4 sm:p-5">
                    {form.deliveryAddresses.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">No delivery addresses yet. Click “Add address” to create one.</div>
                    ) : form.deliveryAddresses.map((address, index) => (
                      <div key={address.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2"><span className="text-xs font-bold uppercase tracking-wide text-slate-500">Address {index + 1}</span>{address.isDefault ? <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700">Default</span> : null}</div>
                          <button type="button" onClick={() => void removeDeliveryAddress(address.id)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" />Remove</button>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div><label className={adminLabelClass}>Contact name <span className="text-red-500">*</span></label><input value={address.contactName} onChange={(event) => updateDeliveryAddress(address.id, { contactName: event.target.value })} className={adminFieldClass} placeholder="e.g. Ali" maxLength={100} /></div>
                          <div><label className={adminLabelClass}>Contact phone <span className="text-red-500">*</span></label><input type="tel" inputMode="tel" value={address.contactPhone} onChange={(event) => updateDeliveryAddress(address.id, { contactPhone: formatMalaysiaPhoneInput(event.target.value) })} className={adminFieldClass} placeholder={MALAYSIA_PHONE_PLACEHOLDER} maxLength={18} /></div>
                          <div className="md:col-span-2"><label className={adminLabelClass}>Full address <span className="text-red-500">*</span></label><textarea value={address.address} onChange={(event) => updateDeliveryAddress(address.id, { address: event.target.value })} className={`${adminFieldClass} min-h-24 resize-y py-3`} placeholder="Enter the complete delivery address" maxLength={500} /></div>
                        </div>
                        <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700"><input type="radio" name="default-delivery-address" checked={Boolean(address.isDefault)} onChange={() => makeDefaultDeliveryAddress(address.id)} className="h-4 w-4 accent-blue-700" />Use as default delivery address</label>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="rounded-2xl border border-slate-200 bg-white shadow-2xs">
                  <div className="flex items-start gap-3 rounded-t-xl border-b border-slate-100 bg-white px-4 py-3.5 sm:px-5"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700"><KeyRound className="h-4 w-4" /></div><div><h3 className="text-sm font-bold text-slate-900">3. App credentials</h3><p className="mt-0.5 text-xs text-slate-500">Set the password used to sign in to the Customer App.</p></div></div>
                  <div className="p-4 sm:p-5"><label className={adminLabelClass}>{modalMode === "create" ? <>Password <span className="text-red-500">*</span></> : "New password"}</label><input type="password" autoComplete="new-password" value={form.password} onChange={(event) => { setForm({ ...form, password: event.target.value }); setFormError(""); }} placeholder={modalMode === "edit" ? "Leave blank to keep current password" : "At least 8 characters"} minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} pattern="[!-~]{8,128}" className={adminFieldClass} /><p className="mt-1.5 text-xs text-slate-500">8–128 characters without spaces.{modalMode === "edit" ? " Leave blank to keep the current password." : ""}</p></div>
                </section>
              </div>
            )}

            {modalMode === "create" ? <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-white px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
              <p className="text-xs text-slate-500"><span className="font-bold text-red-500">*</span> Required fields must be completed</p>
              <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={closeModal}
                className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                {t('cancel')}
              </button>
              {(
                <button
                  type="button"
                  onClick={handleSubmitCustomer}
                  disabled={isSaving}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#1e3a8a] px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-800 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />{isSaving ? "Saving..." : "Create User"}
                </button>
              )}
              </div>
            </div> : null}
          </div>
        </div>
      )}
    </>
  );
}
