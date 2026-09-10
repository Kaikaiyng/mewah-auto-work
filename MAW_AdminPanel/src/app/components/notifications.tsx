import { useState, useMemo } from "react";
import { Send, Bell, AlertTriangle, CheckCircle, Info, User, Search, UsersRound, MessageSquareText, Calendar, CheckCircle2, ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { postApi } from "../lib/api";
import { useApiData } from "../lib/use-api-data";
import { useLanguage } from "../contexts/language-context";
import { toast } from "sonner";
import { PageLoading } from "./ui/page-loading";
import { AdminSelect } from "./ui/admin-select";
import { hasAdminPermission } from "../lib/admin-permissions";
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

interface NotificationItem {
  id: number | string;
  title: string;
  message: string;
  recipient: string;
  type: string;
  status: string;
  date: string;
  channel?: string;
  actionRoute?: string;
}

interface CustomerRecipient {
  id: number;
  name: string;
  companyId?: number;
  companyName?: string;
}

interface CompanyRecipient {
  id: number;
  name: string;
}

const typeIcons: Record<string, LucideIcon> = {
  Reminder: Bell,
  Warning: AlertTriangle,
  Info: Info,
  Success: CheckCircle,
};

const typeColors: Record<string, string> = {
  Reminder: "text-blue-600 bg-blue-100 border border-blue-200",
  Warning: "text-yellow-600 bg-yellow-100 border border-yellow-200",
  Info: "text-gray-600 bg-gray-100 border border-gray-200",
  Success: "text-green-600 bg-green-100 border border-green-200",
};

export function Notifications() {
  const canSend = hasAdminPermission("notification.send");
  const { t } = useLanguage();
  const [showSendModal, setShowSendModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [sending, setSending] = useState(false);

  // API Integration
  const { data: notifications, isLoading, error, reload, hasLoaded } = useApiData<NotificationItem[]>(
    "admin-notifications",
    []
  );
  const { data: customers } = useApiData<CustomerRecipient[]>("admin-customers", []);
  const { data: companies } = useApiData<CompanyRecipient[]>("admin-companies", []);

  const filteredNotifications = useMemo(() => {
    return notifications.filter((notification) => {
      const matchSearch =
        notification.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        notification.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
        notification.recipient.toLowerCase().includes(searchTerm.toLowerCase());
      return matchSearch;
    });
  }, [notifications, searchTerm]);

  const [notificationForm, setNotificationForm] = useState({
    recipient: "all",
    title: "",
    message: "",
    type: "Info",
    channels: {
      push: true,
      email: false,
      sms: false,
    },
  });

  const resetForm = () => {
    setNotificationForm({
      recipient: "all",
      title: "",
      message: "",
      type: "Info",
      channels: {
        push: true,
        email: false,
        sms: false,
      },
    });
  };

  const handleSendNotification = async () => {
    if (!notificationForm.title.trim() || !notificationForm.message.trim()) {
      toast.error("Title and message are required.");
      return;
    }

    setSending(true);
    try {
      const result = await postApi<{ sent: number }>("admin-send-notification", notificationForm);
      reload();
      setShowSendModal(false);
      resetForm();
      toast.success(`Notification sent to ${result.sent} customer${result.sent === 1 ? "" : "s"}.`);
    } catch (apiError) {
      toast.error(apiError instanceof Error ? apiError.message : "Unable to send notification");
    } finally {
      setSending(false);
    }
  };

  if (isLoading && !hasLoaded) {
    return (
      <PageLoading
        title="Loading Notifications..."
        description="Fetching broadcast messages and notification logs..."
      />
    );
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("notification_center")}</h1>
        </div>
        {canSend ? <button
          type="button"
          onClick={() => setShowSendModal(true)}
          className="inline-flex h-10 items-center justify-center rounded-xl bg-[#1e3a8a] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-800"
        >
          <Send className="mr-2 h-4 w-4" />
          Send Notification
        </button> : null}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Notifications are unavailable: {error}. No substitute data is being shown.
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="group relative flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-5 text-left shadow-xs transition-all duration-200 hover:border-blue-300 hover:shadow-md hover:-translate-y-0.5">
          <div className="flex-1 min-w-0 pr-3">
            <span className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 truncate">Total Sent</span>
            <div className="mt-1.5 flex items-baseline">
              <span className="text-3xl font-black tracking-tight text-slate-900 truncate">{notifications.length}</span>
            </div>
            <div className="mt-2 flex items-center text-xs text-slate-500 font-medium">
              <span>All broadcast logs</span>
            </div>
          </div>
          <div className="flex flex-col items-end justify-between self-stretch shrink-0 py-0.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700 shadow-2xs group-hover:scale-105 transition-transform">
              <Bell className="h-5 w-5" />
            </div>
            <ChevronRight className="h-4 w-4 text-slate-300 group-hover:translate-x-1 group-hover:text-blue-600 transition" />
          </div>
        </div>

        <div className="group relative flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-5 text-left shadow-xs transition-all duration-200 hover:border-blue-300 hover:shadow-md hover:-translate-y-0.5">
          <div className="flex-1 min-w-0 pr-3">
            <span className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 truncate">Sent Today</span>
            <div className="mt-1.5 flex items-baseline">
              <span className="text-3xl font-black tracking-tight text-blue-600 truncate">{notifications.filter((n) => n.date && n.date.startsWith(new Date().toISOString().slice(0, 10))).length}</span>
            </div>
            <div className="mt-2 flex items-center text-xs text-slate-500 font-medium">
              <span>Dispatched today</span>
            </div>
          </div>
          <div className="flex flex-col items-end justify-between self-stretch shrink-0 py-0.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 shadow-2xs group-hover:scale-105 transition-transform">
              <Calendar className="h-5 w-5" />
            </div>
            <ChevronRight className="h-4 w-4 text-slate-300 group-hover:translate-x-1 group-hover:text-blue-600 transition" />
          </div>
        </div>

        <div className="group relative flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-5 text-left shadow-xs transition-all duration-200 hover:border-blue-300 hover:shadow-md hover:-translate-y-0.5">
          <div className="flex-1 min-w-0 pr-3">
            <span className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 truncate">Reminders</span>
            <div className="mt-1.5 flex items-baseline">
              <span className="text-3xl font-black tracking-tight text-amber-600 truncate">{notifications.filter((n) => n.type === "Reminder" || n.type === "Warning").length}</span>
            </div>
            <div className="mt-2 flex items-center text-xs text-slate-500 font-medium">
              <span>Service & inspection alerts</span>
            </div>
          </div>
          <div className="flex flex-col items-end justify-between self-stretch shrink-0 py-0.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600 shadow-2xs group-hover:scale-105 transition-transform">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <ChevronRight className="h-4 w-4 text-slate-300 group-hover:translate-x-1 group-hover:text-blue-600 transition" />
          </div>
        </div>

        <div className="group relative flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-5 text-left shadow-xs transition-all duration-200 hover:border-blue-300 hover:shadow-md hover:-translate-y-0.5">
          <div className="flex-1 min-w-0 pr-3">
            <span className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 truncate">Successful</span>
            <div className="mt-1.5 flex items-baseline">
              <span className="text-3xl font-black tracking-tight text-emerald-600 truncate">{notifications.filter((n) => n.type === "Success").length}</span>
            </div>
            <div className="mt-2 flex items-center text-xs text-slate-500 font-medium">
              <span>Confirmed receipts</span>
            </div>
          </div>
          <div className="flex flex-col items-end justify-between self-stretch shrink-0 py-0.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 shadow-2xs group-hover:scale-105 transition-transform">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <ChevronRight className="h-4 w-4 text-slate-300 group-hover:translate-x-1 group-hover:text-blue-600 transition" />
          </div>
        </div>
      </div>

      {/* Search Filter */}
      <div className="maw-filter-bar">
        <div className="maw-search-field">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search notification, message or recipient..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
      </div>

      {/* Notifications Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr><th className="px-4 py-3">Notification</th><th className="px-4 py-3">Recipient</th><th className="px-4 py-3">Channel</th><th className="px-4 py-3">Sent Date</th><th className="px-4 py-3">Type</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-500">Loading notifications...</td></tr> : filteredNotifications.length === 0 ? <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-500">No notifications found.</td></tr> : filteredNotifications.map((notification) => {
                const Icon = typeIcons[notification.type] || Info;
                return <tr key={notification.id}>
                  <td className="px-4 py-3"><div className="flex items-start gap-3"><span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${typeColors[notification.type] || "border border-gray-200 bg-gray-50 text-gray-600"}`}><Icon className="h-4 w-4" /></span><div className="min-w-0"><p className="max-w-[360px] truncate text-sm font-semibold text-gray-900" title={notification.title}>{notification.title}</p><p className="mt-1 max-w-[440px] truncate text-xs text-gray-500" title={notification.message}>{notification.message}</p></div></div></td>
                  <td className="px-4 py-3"><span className="inline-flex items-center text-sm text-gray-700"><User className="mr-2 h-3.5 w-3.5 text-gray-400" />{notification.recipient}</span></td>
                  <td className="px-4 py-3 text-sm text-gray-600">{notification.channel || "In-app"}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{notification.date || "-"}</td>
                  <td className="px-4 py-3"><span className="inline-flex rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-700">{notification.type}</span></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-gray-200 bg-gray-50/70 px-4 py-3 text-xs text-gray-500">{filteredNotifications.length.toLocaleString()} notifications</div>
      </div>

      {/* Send Notification Modal */}
      {showSendModal && (
        <AdminFormDialog size="md" labelledBy="notification-dialog-title">
          <AdminFormDialogHeader id="notification-dialog-title" title="New Notification" description="Choose the audience and compose an in-app message for Customer App users." icon={<Bell className="h-5 w-5" />} badge="New" onClose={() => setShowSendModal(false)} closeDisabled={sending} />
          <AdminFormDialogBody>
            <AdminFormSection number={1} title="Audience" description="Select who should receive this notification and how it should be categorised." icon={<UsersRound className="h-4 w-4" />}>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                <label className={adminLabelClass}>Recipient</label>
                <AdminSelect
                  value={notificationForm.recipient}
                  onChange={(e) =>
                    setNotificationForm({ ...notificationForm, recipient: e.target.value })
                  }
                  className="w-full"
                >
                  <option value="all">All Customers</option>
                  <option value="active">Active Customers</option>
                  {companies.length > 0 && (
                    <optgroup label="Companies">
                      {companies.map((company) => (
                        <option key={`company-${company.id}`} value={`company:${company.id}`}>
                          {company.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {customers.length > 0 && (
                    <optgroup label="Individual Customers">
                      {customers.map((customer) => (
                        <option key={`customer-${customer.id}`} value={`customer:${customer.id}`}>
                          {customer.name}{customer.companyName && customer.companyName !== "-" ? ` — ${customer.companyName}` : ""}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </AdminSelect>
              </div>
              <div>
                <label className={adminLabelClass}>Type</label>
                <AdminSelect
                  value={notificationForm.type}
                  onChange={(e) => setNotificationForm({ ...notificationForm, type: e.target.value })}
                  className="w-full"
                >
                  <option value="Info">Info</option>
                  <option value="Reminder">Reminder</option>
                  <option value="Warning">Warning</option>
                  <option value="Success">Success</option>
                </AdminSelect>
              </div>
              </div>
            </AdminFormSection>
            <AdminFormSection number={2} title="Message" description="Keep the title clear and place the action or important detail in the message." icon={<MessageSquareText className="h-4 w-4" />} tone="indigo">
              <div className="space-y-4">
              <div>
                <label className={adminLabelClass}>Title <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={notificationForm.title}
                  onChange={(e) => setNotificationForm({ ...notificationForm, title: e.target.value })}
                  placeholder="Enter notification title"
                  className={adminFieldClass}
                />
              </div>
              <div>
                <label className={adminLabelClass}>Message <span className="text-red-500">*</span></label>
                <textarea
                  value={notificationForm.message}
                  onChange={(e) => setNotificationForm({ ...notificationForm, message: e.target.value })}
                  placeholder="Enter notification message"
                  rows={4}
                  className={adminTextareaClass}
                />
              </div>
                <div className="rounded-lg border border-blue-100 bg-blue-50/70 px-3.5 py-2.5">
                  <p className="text-xs font-semibold text-blue-900">Delivery channel · Customer App</p>
                  <p className="mt-0.5 text-xs text-blue-700">Recipients will see the message from the notification bell.</p>
                </div>
              </div>
            </AdminFormSection>
          </AdminFormDialogBody>
          <AdminFormDialogFooter>
            <AdminDialogCancelButton onClick={() => setShowSendModal(false)} disabled={sending}>Cancel</AdminDialogCancelButton>
            <AdminDialogPrimaryButton onClick={handleSendNotification} disabled={sending}><Send className="h-4 w-4" />{sending ? "Sending..." : "Send Notification"}</AdminDialogPrimaryButton>
          </AdminFormDialogFooter>
        </AdminFormDialog>
      )}
    </div>
  );
}
