import { useEffect, useState } from "react";
import { Bell, Building2, CheckCircle2, DollarSign, Headphones, Loader2, Mail, MessageCircle, Pencil, Phone, Plus, Save, ShieldCheck, Trash2, Users, Wrench } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import { PageLoading } from "./ui/page-loading";
import { useLanguage } from "../contexts/language-context";
import { useConfirmationDialog } from "../contexts/confirmation-dialog-context";
import { apiRequest, postApi } from "../lib/api";
import { EMAIL_PLACEHOLDER, isValidEmail, normalizeEmail } from "../lib/email";
import { formatMalaysiaPhoneInput, isValidMalaysiaPhone, normalizeMalaysiaPhone } from "../lib/malaysia-phone";

type CompanySettingsData = {
  legalName: string;
  registrationNo: string;
  groupName: string;
  address: string;
  phone: string;
  email: string;
  operatingHours: string;
};

type SupportSettingsData = {
  phone: string;
  whatsapp: string;
  email: string;
  operatingHours: string;
};

type PricingSettingsData = {
  taxRate: number;
  laborRate: number;
  partsMarkup: number;
  automaticRounding: boolean;
};

type NotificationSettingsData = {
  serviceReminders: boolean;
  insuranceReminders: boolean;
  bookingUpdates: boolean;
  lowStockAlerts: boolean;
};

type ServiceType = {
  id: number;
  name: string;
  description: string;
  basePrice: number;
  enabled: boolean;
  sortOrder: number;
};

type SystemSettingsPayload = {
  company: CompanySettingsData;
  support?: SupportSettingsData;
  pricing: PricingSettingsData;
  notifications: NotificationSettingsData;
  serviceTypes: ServiceType[];
};

type SettingsTab = "company" | "support" | "services" | "pricing" | "users" | "notifications";

const tabs: Array<{ id: SettingsTab; nameKey: string; description: string; icon: typeof Building2 }> = [
  { id: "company", nameKey: "company_info_tab", description: "Legal and workshop contact details", icon: Building2 },
  { id: "support", nameKey: "support_settings_tab", description: "Customer App contact and help channels", icon: Headphones },
  { id: "services", nameKey: "services_pricing_tab", description: "Tax, labour rates & service catalogue", icon: Wrench },
  { id: "users", nameKey: "user_management_tab", description: "Accounts, roles and access boundaries", icon: Users },
  { id: "notifications", nameKey: "notification_settings_tab", description: "Automatic customer and stock alerts", icon: Bell },
];

function inputClass(hasError = false) {
  return `w-full rounded-xl border bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 outline-none transition-colors focus:bg-white focus:ring-2 ${hasError ? "border-red-300 focus:border-red-400 focus:ring-red-100" : "border-slate-200 focus:border-blue-400 focus:ring-blue-100"}`;
}

export function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("company");
  const [settings, setSettings] = useState<SystemSettingsPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState("");
  const { t } = useLanguage();

  const loadSettings = async () => {
    setIsLoading(true);
    setError("");
    try {
      setSettings(await apiRequest<SystemSettingsPayload>("admin-system-settings"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load System Settings.");
    } finally {
      setIsLoading(false);
      setHasLoaded(true);
    }
  };

  useEffect(() => { void loadSettings(); }, []);

  if (isLoading && !hasLoaded) {
    return (
      <PageLoading
        title="Loading Settings..."
        description="Fetching system preferences and workshop configuration..."
      />
    );
  }

  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{t("system_settings")}</h1>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid min-h-[520px] grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="border-b border-slate-200 bg-slate-50/80 p-4 lg:border-b-0 lg:border-r">
            <nav className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1" aria-label="System settings sections">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const selected = activeTab === tab.id;
                return (
                  <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} aria-current={selected ? "page" : undefined} className={`flex items-start rounded-xl px-4 py-3 text-left transition-colors ${selected ? "bg-[#1e3a8a] text-white shadow-sm" : "text-slate-700 hover:bg-white"}`}>
                    <Icon className={`mr-3 mt-0.5 h-5 w-5 shrink-0 ${selected ? "text-blue-100" : "text-slate-500"}`} />
                    <span><span className="block text-sm font-bold">{t(tab.nameKey)}</span><span className={`mt-0.5 block text-[10px] leading-4 ${selected ? "text-blue-100" : "text-slate-500"}`}>{tab.description}</span></span>
                  </button>
                );
              })}
            </nav>
          </aside>

          <main className="min-w-0 p-5 sm:p-6">
            {isLoading ? <div className="flex min-h-[420px] items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading system configuration...</div> : null}
            {!isLoading && error ? <div className="rounded-xl border border-red-200 bg-red-50 p-5"><p className="font-bold text-red-800">Unable to load System Settings</p><p className="mt-1 text-sm text-red-700">{error}</p><button type="button" onClick={() => void loadSettings()} className="mt-4 rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white">Try Again</button></div> : null}
            {!isLoading && settings ? (
              <>
                {activeTab === "company" ? <CompanySettings value={settings.company} onSaved={setSettings} /> : null}
                {activeTab === "support" ? <SupportSettings value={settings.support || { phone: "+60 00-000 0000", whatsapp: "+60 00-000 0000", email: "contact@example.com", operatingHours: "Monday - Saturday, 8:00 AM - 6:00 PM" }} onSaved={setSettings} /> : null}
                {activeTab === "services" || activeTab === "pricing" ? <ServicesAndPricingSettings value={settings} onChanged={setSettings} /> : null}
                {activeTab === "users" ? <UserSettings /> : null}
                {activeTab === "notifications" ? <NotificationSettings value={settings.notifications} onSaved={setSettings} /> : null}
              </>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ title, description }: { title: string; description?: string }) {
  return <div className="border-b border-slate-100 pb-4"><h2 className="text-lg font-extrabold text-slate-900">{title}</h2>{description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}</div>;
}

function CompanySettings({ value, onSaved }: { value: CompanySettingsData; onSaved: (value: SystemSettingsPayload) => void }) {
  const [form, setForm] = useState(value);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const nextErrors: Record<string, string> = {};
    if (!form.legalName.trim()) nextErrors.legalName = "Company legal name is required.";
    if (!form.address.trim()) nextErrors.address = "Company address is required.";
    if (!isValidMalaysiaPhone(form.phone)) nextErrors.phone = "Enter a valid Malaysia phone number.";
    if (!isValidEmail(form.email)) nextErrors.email = "Enter a valid email address.";
    if (!form.operatingHours.trim()) nextErrors.operatingHours = "Operating hours are required.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSaving(true);
    try {
      const normalized = { ...form, phone: normalizeMalaysiaPhone(form.phone)!, email: normalizeEmail(form.email) };
      const result = await postApi<SystemSettingsPayload>("admin-save-system-settings", { section: "company", company: normalized });
      setForm(result.company);
      onSaved(result);
      toast.success("Company information saved.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Unable to save company information.");
    } finally { setSaving(false); }
  };

  return <div className="space-y-5">
    <SectionHeading title="Company Information" description="Used as the official workshop identity on quotations, invoices and customer-facing records." />
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-xs font-bold text-slate-700 sm:col-span-2">Legal company name<input value={form.legalName} onChange={(event) => setForm({ ...form, legalName: event.target.value })} className={`mt-1.5 ${inputClass(Boolean(errors.legalName))}`} />{errors.legalName ? <span className="mt-1 block text-[11px] text-red-600">{errors.legalName}</span> : null}</label>
      <label className="text-xs font-bold text-slate-700">Registration number<input value={form.registrationNo} onChange={(event) => setForm({ ...form, registrationNo: event.target.value })} className={`mt-1.5 ${inputClass()}`} /></label>
      <label className="text-xs font-bold text-slate-700">Group / member line<input value={form.groupName} onChange={(event) => setForm({ ...form, groupName: event.target.value })} className={`mt-1.5 ${inputClass()}`} /></label>
      <label className="text-xs font-bold text-slate-700 sm:col-span-2">Address<textarea rows={3} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} className={`mt-1.5 resize-none ${inputClass(Boolean(errors.address))}`} />{errors.address ? <span className="mt-1 block text-[11px] text-red-600">{errors.address}</span> : null}</label>
      <label className="text-xs font-bold text-slate-700">Phone<input type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: formatMalaysiaPhoneInput(event.target.value) })} className={`mt-1.5 ${inputClass(Boolean(errors.phone))}`} />{errors.phone ? <span className="mt-1 block text-[11px] text-red-600">{errors.phone}</span> : null}</label>
      <label className="text-xs font-bold text-slate-700">Email<input type="email" value={form.email} placeholder={EMAIL_PLACEHOLDER} onChange={(event) => setForm({ ...form, email: event.target.value })} className={`mt-1.5 ${inputClass(Boolean(errors.email))}`} />{errors.email ? <span className="mt-1 block text-[11px] text-red-600">{errors.email}</span> : null}</label>
      <label className="text-xs font-bold text-slate-700 sm:col-span-2">Operating hours<input value={form.operatingHours} onChange={(event) => setForm({ ...form, operatingHours: event.target.value })} className={`mt-1.5 ${inputClass(Boolean(errors.operatingHours))}`} />{errors.operatingHours ? <span className="mt-1 block text-[11px] text-red-600">{errors.operatingHours}</span> : null}</label>
    </div>
    <SaveButton saving={saving} label="Save Company Info" onClick={save} />
  </div>;
}

const blankService: Omit<ServiceType, "id"> = { name: "", description: "", basePrice: 0, enabled: true, sortOrder: 10 };

function ServiceSettings({ value, onChanged }: { value: SystemSettingsPayload; onChanged: (value: SystemSettingsPayload) => void }) {
  const [editor, setEditor] = useState<Omit<ServiceType, "id"> & { id?: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const confirmAction = useConfirmationDialog();

  const saveService = async () => {
    if (!editor) return;
    if (!editor.name.trim()) { toast.error("Service name is required."); return; }
    setSaving(true);
    try {
      const result = await postApi<SystemSettingsPayload>(editor.id ? "admin-update-service-type" : "admin-create-service-type", editor);
      onChanged(result);
      setEditor(null);
      toast.success(editor.id ? "Service type updated." : "Service type added.");
    } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Unable to save service type."); }
    finally { setSaving(false); }
  };

  const toggleService = async (service: ServiceType) => {
    try {
      const result = await postApi<SystemSettingsPayload>("admin-update-service-type", { ...service, enabled: !service.enabled });
      onChanged(result);
      toast.success(`${service.name} ${service.enabled ? "disabled" : "enabled"}.`);
    } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Unable to update service type."); }
  };

  const deleteService = async (service: ServiceType) => {
    const confirmed = await confirmAction({ title: `Delete ${service.name}?`, description: "Existing bookings retain their recorded service name, but this option will be removed from the service catalogue.", confirmLabel: "Delete service", tone: "danger" });
    if (!confirmed) return;
    try {
      const result = await postApi<SystemSettingsPayload>("admin-delete-service-type", { id: service.id });
      onChanged(result);
      toast.success("Service type deleted.");
    } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Unable to delete service type."); }
  };

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><SectionHeading title="Service Types" description="Maintain the selectable workshop services and their base pricing reference." /><button type="button" onClick={() => setEditor({ ...blankService, sortOrder: (value.serviceTypes.length + 1) * 10 })} className="inline-flex items-center rounded-xl bg-[#1e3a8a] px-4 py-2.5 text-xs font-bold text-white"><Plus className="mr-1.5 h-4 w-4" />Add Service</button></div>
    {editor ? <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4"><h3 className="text-sm font-extrabold text-blue-950">{editor.id ? "Edit Service Type" : "New Service Type"}</h3><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-slate-700">Service name<input value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} className={`mt-1.5 ${inputClass()}`} /></label><label className="text-xs font-bold text-slate-700">Base price (RM)<input type="number" min="0" step="0.01" value={editor.basePrice} onChange={(event) => setEditor({ ...editor, basePrice: Number(event.target.value) })} className={`mt-1.5 ${inputClass()}`} /></label><label className="text-xs font-bold text-slate-700 sm:col-span-2">Description<textarea rows={2} value={editor.description} onChange={(event) => setEditor({ ...editor, description: event.target.value })} className={`mt-1.5 resize-none ${inputClass()}`} /></label><label className="text-xs font-bold text-slate-700">Sort order<input type="number" min="0" value={editor.sortOrder} onChange={(event) => setEditor({ ...editor, sortOrder: Number(event.target.value) })} className={`mt-1.5 ${inputClass()}`} /></label><label className="flex items-center self-end rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700"><input type="checkbox" checked={editor.enabled} onChange={(event) => setEditor({ ...editor, enabled: event.target.checked })} className="mr-2 h-4 w-4 rounded border-slate-300" />Enabled for new bookings</label></div><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setEditor(null)} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700">Cancel</button><button type="button" disabled={saving} onClick={() => void saveService()} className="rounded-lg bg-[#1e3a8a] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? "Saving..." : "Save Service"}</button></div></div> : null}
    <div className="space-y-2">{value.serviceTypes.length ? value.serviceTypes.map((service) => <div key={service.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-extrabold text-slate-900">{service.name}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${service.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{service.enabled ? "Enabled" : "Disabled"}</span><span className="text-xs font-bold text-blue-700">RM {service.basePrice.toFixed(2)}</span></div><p className="mt-1 text-xs text-slate-500">{service.description || "No description"}</p></div><div className="flex items-center gap-1"><button type="button" onClick={() => void toggleService(service)} className="rounded-lg px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100">{service.enabled ? "Disable" : "Enable"}</button><button type="button" onClick={() => setEditor({ ...service })} className="rounded-lg p-2 text-blue-700 hover:bg-blue-50" aria-label={`Edit ${service.name}`}><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => void deleteService(service)} className="rounded-lg p-2 text-red-600 hover:bg-red-50" aria-label={`Delete ${service.name}`}><Trash2 className="h-4 w-4" /></button></div></div>) : <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No service types configured.</div>}</div>
  </div>;
}

function PricingSettings({ value, onSaved }: { value: PricingSettingsData; onSaved: (value: SystemSettingsPayload) => void }) {
  const [form, setForm] = useState(value);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (form.taxRate < 0 || form.taxRate > 100 || form.laborRate < 0 || form.partsMarkup < 0) { toast.error("Enter valid non-negative pricing values."); return; }
    setSaving(true);
    try { const result = await postApi<SystemSettingsPayload>("admin-save-system-settings", { section: "pricing", pricing: form }); onSaved(result); setForm(result.pricing); toast.success("Pricing defaults saved."); }
    catch (caught) { toast.error(caught instanceof Error ? caught.message : "Unable to save pricing defaults."); }
    finally { setSaving(false); }
  };
  return <div className="space-y-6"><SectionHeading title="Pricing Defaults" description="Default commercial values used when preparing quotations. Individual quotations can still be adjusted before issue." /><div className="grid gap-4 sm:grid-cols-3"><label className="text-xs font-bold text-slate-700">Tax rate (%)<input type="number" min="0" max="100" step="0.01" value={form.taxRate} onChange={(event) => setForm({ ...form, taxRate: Number(event.target.value) })} className={`mt-1.5 ${inputClass()}`} /></label><label className="text-xs font-bold text-slate-700">Labour rate / hour (RM)<input type="number" min="0" step="0.01" value={form.laborRate} onChange={(event) => setForm({ ...form, laborRate: Number(event.target.value) })} className={`mt-1.5 ${inputClass()}`} /></label><label className="text-xs font-bold text-slate-700">Parts markup (%)<input type="number" min="0" step="0.01" value={form.partsMarkup} onChange={(event) => setForm({ ...form, partsMarkup: Number(event.target.value) })} className={`mt-1.5 ${inputClass()}`} /></label></div><label className="flex items-start rounded-xl border border-slate-200 bg-slate-50 p-4"><input type="checkbox" checked={form.automaticRounding} onChange={(event) => setForm({ ...form, automaticRounding: event.target.checked })} className="mr-3 mt-0.5 h-4 w-4 rounded border-slate-300" /><span><span className="block text-sm font-bold text-slate-800">Automatic currency rounding</span><span className="mt-1 block text-xs text-slate-500">Round calculated monetary totals to two decimal places.</span></span></label><SaveButton saving={saving} label="Save Pricing Defaults" onClick={save} /></div>;
}

function ServicesAndPricingSettings({
  value,
  onChanged,
}: {
  value: SystemSettingsPayload;
  onChanged: (value: SystemSettingsPayload) => void;
}) {
  return (
    <div className="space-y-8">
      {/* 1. Global Pricing Defaults */}
      <PricingSettings value={value.pricing} onSaved={onChanged} />

      <div className="relative pt-2">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <div className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-white px-3 text-xs font-bold uppercase tracking-wider text-slate-400">
            Workshop Service Catalogue
          </span>
        </div>
      </div>

      {/* 2. Service Catalogue */}
      <ServiceSettings value={value} onChanged={onChanged} />
    </div>
  );
}

function UserSettings() {
  const roles = [
    { name: "Admin / Super Admin", detail: "Full configuration, financial, staff and lifecycle access.", tone: "border-blue-200 bg-blue-50 text-blue-900" },
    { name: "Head Manager", detail: "Lifecycle updates and quotation viewing; no system configuration access.", tone: "border-violet-200 bg-violet-50 text-violet-900" },
    { name: "Foreman", detail: "Assigned work orders, vehicle viewing and parts reference only.", tone: "border-amber-200 bg-amber-50 text-amber-900" },
  ];
  return <div className="space-y-6"><SectionHeading title="Users & Access" description="Admin accounts and operational staff use separate account sources with role-based permissions." /><div className="grid gap-3">{roles.map((role) => <div key={role.name} className={`rounded-xl border p-4 ${role.tone}`}><div className="flex items-center"><ShieldCheck className="mr-2 h-4 w-4" /><p className="text-sm font-extrabold">{role.name}</p></div><p className="mt-1 pl-6 text-xs leading-5 opacity-80">{role.detail}</p></div>)}</div><div className="grid gap-3 sm:grid-cols-2"><Link to="/staff" className="rounded-xl border border-slate-200 p-4 transition-colors hover:border-blue-300 hover:bg-blue-50"><p className="text-sm font-extrabold text-slate-900">Manage Staff Accounts</p><p className="mt-1 text-xs text-slate-500">Head Managers and Foremen</p></Link><Link to="/customers" className="rounded-xl border border-slate-200 p-4 transition-colors hover:border-blue-300 hover:bg-blue-50"><p className="text-sm font-extrabold text-slate-900">Manage Customer Accounts</p><p className="mt-1 text-xs text-slate-500">Company contacts and drivers</p></Link></div></div>;
}

function NotificationSettings({ value, onSaved }: { value: NotificationSettingsData; onSaved: (value: SystemSettingsPayload) => void }) {
  const [form, setForm] = useState(value);
  const [saving, setSaving] = useState(false);
  const items: Array<{ key: keyof NotificationSettingsData; title: string; description: string }> = [
    { key: "serviceReminders", title: "Service reminders", description: "Automatic reminders for upcoming vehicle service dates." },
    { key: "insuranceReminders", title: "Insurance reminders", description: "Warnings when vehicle insurance expiry is approaching." },
    { key: "bookingUpdates", title: "Booking and work-order updates", description: "Customer notifications when booking or repair progress changes." },
    { key: "lowStockAlerts", title: "Low-stock alerts", description: "Admin alerts when parts fall below their reorder level." },
  ];
  const save = async () => { setSaving(true); try { const result = await postApi<SystemSettingsPayload>("admin-save-system-settings", { section: "notifications", notifications: form }); onSaved(result); setForm(result.notifications); toast.success("Notification preferences saved."); } catch (caught) { toast.error(caught instanceof Error ? caught.message : "Unable to save notification preferences."); } finally { setSaving(false); } };
  return <div className="space-y-6"><SectionHeading title="Notification Rules" description="Master switches for automatic operational and customer notifications." /><div className="space-y-3">{items.map((item) => <label key={item.key} className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-slate-200 p-4 hover:bg-slate-50"><span><span className="block text-sm font-bold text-slate-800">{item.title}</span><span className="mt-1 block text-xs text-slate-500">{item.description}</span></span><input type="checkbox" checked={form[item.key]} onChange={(event) => setForm({ ...form, [item.key]: event.target.checked })} className="h-5 w-5 shrink-0 rounded border-slate-300 text-blue-700" /></label>)}</div><SaveButton saving={saving} label="Save Notifications" onClick={save} /></div>;
}

function SupportSettings({ value, onSaved }: { value: SupportSettingsData; onSaved: (value: SystemSettingsPayload) => void }) {
  const [form, setForm] = useState<SupportSettingsData>(value || { phone: "+60 00-000 0000", whatsapp: "+60 00-000 0000", email: "contact@example.com", operatingHours: "Monday - Saturday, 8:00 AM - 6:00 PM" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const whatsappDigits = form.whatsapp.replace(/\D/g, '');

  const save = async () => {
    const nextErrors: Record<string, string> = {};
    if (!isValidMalaysiaPhone(form.phone)) nextErrors.phone = "Enter a valid Malaysia phone number for Call Support.";
    if (!isValidMalaysiaPhone(form.whatsapp)) nextErrors.whatsapp = "Enter a valid Malaysia phone number for WhatsApp Support.";
    if (!isValidEmail(form.email)) nextErrors.email = "Enter a valid support email address.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSaving(true);
    try {
      const normalized = {
        ...form,
        phone: normalizeMalaysiaPhone(form.phone)!,
        whatsapp: normalizeMalaysiaPhone(form.whatsapp)!,
        email: normalizeEmail(form.email)
      };
      const result = await postApi<SystemSettingsPayload>("admin-save-system-settings", { section: "support", support: normalized });
      setForm(result.support || normalized);
      onSaved(result);
      toast.success("Customer App support settings saved.");
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Unable to save support settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Customer App Support Channels"
        description="Configure the direct contact channels displayed in the Customer App Login screen and Support screen."
      />

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Form Controls */}
        <div className="space-y-4 lg:col-span-7">
          <div>
            <label className="text-xs font-bold text-slate-700">
              Call Support Phone Number
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: formatMalaysiaPhoneInput(e.target.value) })}
                className={`mt-1.5 ${inputClass(Boolean(errors.phone))}`}
                placeholder="+60 00-000 0000"
              />
            </label>
            {errors.phone ? <span className="mt-1 block text-[11px] text-red-600">{errors.phone}</span> : null}
            <p className="mt-1 text-[11px] text-slate-400">Direct phone call trigger when customer taps "Call Support".</p>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700">
              WhatsApp Support Number
              <input
                type="tel"
                value={form.whatsapp}
                onChange={(e) => setForm({ ...form, whatsapp: formatMalaysiaPhoneInput(e.target.value) })}
                className={`mt-1.5 ${inputClass(Boolean(errors.whatsapp))}`}
                placeholder="+60 00-000 0000"
              />
            </label>
            {errors.whatsapp ? <span className="mt-1 block text-[11px] text-red-600">{errors.whatsapp}</span> : null}
            <p className="mt-1 text-[11px] text-slate-400">
              Generates WhatsApp link: <span className="font-mono text-blue-600">https://wa.me/{whatsappDigits || '60123456789'}</span>
            </p>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700">
              Email Support Address
              <input
                type="email"
                value={form.email}
                placeholder="contact@example.com"
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={`mt-1.5 ${inputClass(Boolean(errors.email))}`}
              />
            </label>
            {errors.email ? <span className="mt-1 block text-[11px] text-red-600">{errors.email}</span> : null}
            <p className="mt-1 text-[11px] text-slate-400">Used for customer inquiry emails and support tickets.</p>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700">
              Support Operating Hours
              <input
                type="text"
                value={form.operatingHours}
                placeholder="Monday - Saturday, 8:00 AM - 6:00 PM"
                onChange={(e) => setForm({ ...form, operatingHours: e.target.value })}
                className={`mt-1.5 ${inputClass()}`}
              />
            </label>
            <p className="mt-1 text-[11px] text-slate-400">Displayed in Customer App support details.</p>
          </div>

          <div className="pt-2">
            <SaveButton saving={saving} label="Save Support Settings" onClick={save} />
          </div>
        </div>

        {/* Live Preview Card */}
        <div className="lg:col-span-5">
          <div className="sticky top-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Customer App Live Preview</span>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">Modal View</span>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#2563eb]">
                    <MessageCircle className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Contact Support</h4>
                    <p className="text-xs text-slate-500">Choose the easiest way to reach us</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2.5 bg-slate-50/50 p-4">
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600">
                    <Phone className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800">Call Support</p>
                    <p className="truncate text-[11px] font-medium text-slate-500">{form.phone || "+60 00-000 0000"}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600">
                    <MessageCircle className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800">WhatsApp Support</p>
                    <p className="truncate text-[11px] font-medium text-slate-500">Chat with us ({form.whatsapp || "+60 00-000 0000"})</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                    <Mail className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800">Email Support</p>
                    <p className="truncate text-[11px] font-medium text-slate-500">{form.email || "contact@example.com"}</p>
                  </div>
                </div>
              </div>

              {form.operatingHours ? (
                <div className="border-t border-slate-100 bg-blue-50/40 px-4 py-2.5 text-[11px] text-slate-600">
                  <span className="font-semibold text-slate-700">Hours:</span> {form.operatingHours}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SaveButton({ saving, label, onClick }: { saving: boolean; label: string; onClick: () => void | Promise<void> }) {
  return <button type="button" disabled={saving} onClick={() => void onClick()} className="inline-flex items-center rounded-xl bg-[#1e3a8a] px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-800 disabled:opacity-50">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}{saving ? "Saving..." : label}{!saving ? <CheckCircle2 className="ml-2 h-3.5 w-3.5 opacity-0" /> : null}</button>;
}
