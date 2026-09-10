import { useMemo, useState } from "react";
import { Edit, KeyRound, Mail, Phone, Plus, Save, Search, Trash2, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { useConfirmationDialog } from "../contexts/confirmation-dialog-context";
import { EMAIL_PLACEHOLDER, isValidEmail, normalizeEmail } from "../lib/email";
import {
  formatMalaysiaPhone,
  formatMalaysiaPhoneInput,
  isValidMalaysiaPhone,
  MALAYSIA_PHONE_PLACEHOLDER,
  normalizeMalaysiaPhone,
} from "../lib/malaysia-phone";
import { postApi } from "../lib/api";
import { useApiData } from "../lib/use-api-data";
import { PageLoading } from "./ui/page-loading";
import { AdminSelect } from "./ui/admin-select";
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
} from "./ui/admin-form-dialog";
import { AdminPagination } from "./ui/admin-pagination";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordValidationMessage,
} from "../lib/password";
import { getSignedInAdmin, hasAdminPermission } from "../lib/admin-permissions";

export type StaffMember = {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: "Admin" | "Head Manager" | "Foreman" | "Technician";
  status: "Active" | "Inactive";
};

const STAFF_ROLES: StaffMember["role"][] = [
  "Admin",
  "Head Manager",
  "Foreman",
];

type StaffForm = Omit<StaffMember, "id"> & {
  password: string;
};

const EMPTY_FORM: StaffForm = {
  name: "",
  email: "",
  phone: "",
  password: "",
  role: "Foreman",
  status: "Active",
};

function getRoleBadge(role: string) {
  const normalized = (role || "").toLowerCase().trim();
  if (normalized.includes("admin")) {
    return "border-blue-200 bg-blue-50 text-blue-900 font-bold";
  }
  if (normalized.includes("manager") || normalized.includes("head")) {
    return "border-violet-200 bg-violet-50 text-violet-900 font-bold";
  }
  if (normalized.includes("foreman")) {
    return "border-amber-200 bg-amber-50 text-amber-900 font-bold";
  }
  if (normalized.includes("technician")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-900 font-bold";
  }
  return "border-slate-200 bg-slate-50 text-slate-700 font-bold";
}

export function Staff() {
  const canManageStaff = hasAdminPermission("staff.manage");
  const isHeadManager = ["head manager", "manager", "service advisor", "receptionist"].includes(
    (getSignedInAdmin().role || "").trim().toLowerCase(),
  );
  const assignableRoles = isHeadManager ? (["Foreman"] as StaffMember["role"][]) : STAFF_ROLES;
  const { data, isLoading, error, reload, hasLoaded } = useApiData<StaffMember[]>("admin-staff", []);
  const confirmAction = useConfirmationDialog();
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [form, setForm] = useState<StaffForm>(EMPTY_FORM);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filteredStaff = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return data.filter((member) => {
      const matchesSearch =
        !query ||
        member.name.toLowerCase().includes(query) ||
        member.email.toLowerCase().includes(query) ||
        member.phone.toLowerCase().includes(query);
      return matchesSearch && (!roleFilter || member.role === roleFilter);
    });
  }, [data, roleFilter, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredStaff.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedStaff = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredStaff.slice(start, start + pageSize);
  }, [filteredStaff, safePage, pageSize]);

  const closeModal = () => {
    setSelectedStaff(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setModalMode(null);
  };

  const openCreateModal = () => {
    setSelectedStaff(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setIsSaving(false);
    setModalMode("create");
  };

  const openEditModal = (member: StaffMember) => {
    setSelectedStaff(member);
    setForm({
      name: member.name,
      email: member.email,
      phone: member.phone ? formatMalaysiaPhone(member.phone) : "",
      password: "",
      role: member.role,
      status: member.status,
    });
    setFormError("");
    setIsSaving(false);
    setModalMode("edit");
  };

  const handleSave = async () => {
    setFormError("");
    if (!form.name.trim()) {
      setFormError("Staff name is required.");
      return;
    }
    if (!form.email.trim() || !isValidEmail(form.email)) {
      setFormError("Enter a valid email address, for example name@example.com.");
      return;
    }
    if (!form.phone.trim() || !isValidMalaysiaPhone(form.phone)) {
      setFormError("Enter a valid Malaysia mobile or landline number.");
      return;
    }
    if (modalMode === "create" && !form.password) {
      setFormError("Password is required for new staff.");
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

    setIsSaving(true);
    try {
      await postApi(modalMode === "create" ? "admin-create-staff" : "admin-update-staff", {
        id: selectedStaff?.id,
        name: form.name.trim().replace(/\s+/g, " "),
        email: form.email.trim() ? normalizeEmail(form.email) : "",
        phone: form.phone.trim() ? normalizeMalaysiaPhone(form.phone) : "",
        password: form.password,
        role: form.role,
        status: form.status,
      });
      await reload();
      closeModal();
      toast.success(modalMode === "create" ? "Staff member added." : "Staff member updated.");
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : "Unable to save staff member.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (member: StaffMember) => {
    const confirmed = await confirmAction({
      title: `Delete staff member "${member.name}"?`,
      description: "Deletion is blocked while this staff member is assigned to a work order.",
      confirmLabel: "Delete staff",
      tone: "danger",
    });
    if (!confirmed) return;

    try {
      await postApi("admin-delete-staff", { id: member.id });
      await reload();
      toast.success(`Staff member "${member.name}" deleted.`);
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : "Unable to delete staff member.");
    }
  };



  if (isLoading && !hasLoaded) {
    return (
      <PageLoading
        title="Loading Staff..."
        description="Fetching employee profiles and access permissions..."
      />
    );
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Staff Management</h1>
        </div>
        <div className="flex items-center gap-2">
          {canManageStaff ? <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-[#1e3a8a] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-800"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Staff
          </button> : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Staff data unavailable: {error}
        </div>
      ) : null}

      <div className="maw-filter-bar">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="md:col-span-2">
            <div className="maw-search-field">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search staff by name, email or phone..."
                value={searchTerm}
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  setPage(1);
                }}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
          </div>
          <div>
            <AdminSelect
              value={roleFilter}
              onChange={(event) => {
                setRoleFilter(event.target.value);
                setPage(1);
              }}
              className="w-full"
              aria-label="Filter staff role"
            >
              <option value="">All Roles</option>
              {assignableRoles.map((role) => <option key={role} value={role}>{role}</option>)}
            </AdminSelect>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {["ID", "Staff", "Phone", "Email", "Role", "Status"].map((heading) => (
                  <th key={heading} className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {heading}
                  </th>
                ))}
                <th className="px-6 py-3 text-right whitespace-nowrap"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {isLoading ? (
                <tr><td colSpan={7} className="px-6 py-10 text-center text-sm text-gray-500">Loading staff...</td></tr>
              ) : filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <UsersRound className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                    <p className="text-sm text-gray-500">No staff members found.</p>
                  </td>
                </tr>
              ) : paginatedStaff.map((member) => (
                <tr key={member.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {canManageStaff ? (
                      <button
                        type="button"
                        onClick={() => openEditModal(member)}
                        className="font-bold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                      >
                        #{member.id}
                      </button>
                    ) : (
                      <span className="font-semibold text-gray-700">#{member.id}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {canManageStaff ? (
                      <button
                        type="button"
                        onClick={() => openEditModal(member)}
                        className="text-left text-sm font-semibold text-gray-900 hover:text-blue-600 transition-colors cursor-pointer"
                      >
                        {member.name}
                      </button>
                    ) : (
                      <p className="text-sm font-semibold text-gray-900">{member.name}</p>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {member.phone ? (
                      <p className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-gray-400" />
                        {formatMalaysiaPhone(member.phone)}
                      </p>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {member.email ? (
                      <p className="flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 text-gray-400" />
                        {member.email}
                      </p>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs ${getRoleBadge(member.role)}`}>
                      {member.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${member.status === "Active" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                      <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />
                      {member.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    {canManageStaff ? <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => openEditModal(member)} className="p-1 text-gray-400 hover:text-amber-600" aria-label={`Edit ${member.name}`}>
                        <Edit className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => handleDelete(member)} className="p-1 text-gray-400 hover:text-red-600" aria-label={`Delete ${member.name}`}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <AdminPagination
          currentPage={safePage}
          totalPages={totalPages}
          totalItems={filteredStaff.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          itemLabel="staff members"
        />
      </div>

      {modalMode ? (
        <AdminFormDialog size="md" labelledBy="staff-dialog-title">
          <AdminFormDialogHeader id="staff-dialog-title" title={modalMode === "create" ? "New Staff Member" : "Edit Staff Member"} description="Maintain staff contact details, Admin Panel credentials and access level." icon={<UsersRound className="h-5 w-5" />} badge={modalMode === "create" ? "New" : "Editing"} onClose={closeModal} />
          <AdminFormDialogBody>
              {formError ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-600">{formError}</div> : null}
              <AdminFormSection number={1} title="Profile & contact" description="Enter the details used to identify and contact this staff member." icon={<UsersRound className="h-4 w-4" />}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div><label htmlFor="staff-name" className={adminLabelClass}>Name <span className="text-red-500">*</span></label><input id="staff-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={adminFieldClass} /></div>
                  <div><label htmlFor="staff-phone" className={adminLabelClass}>Phone <span className="text-red-500">*</span></label><input id="staff-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder={MALAYSIA_PHONE_PLACEHOLDER} value={form.phone} onChange={(event) => setForm({ ...form, phone: formatMalaysiaPhoneInput(event.target.value) })} maxLength={18} className={adminFieldClass} /></div>
                  <div className="md:col-span-2"><label htmlFor="staff-email" className={adminLabelClass}>Email <span className="text-red-500">*</span></label><input id="staff-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder={EMAIL_PLACEHOLDER} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} onBlur={() => setForm({ ...form, email: normalizeEmail(form.email) })} maxLength={254} className={adminFieldClass} /></div>
                </div>
              </AdminFormSection>
              <AdminFormSection number={2} title="Login & access" description="Set Admin Panel credentials, role and account availability." icon={<KeyRound className="h-4 w-4" />} tone="indigo">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2"><label htmlFor="staff-password" className={adminLabelClass}>{modalMode === "create" ? <>Password <span className="text-red-500">*</span></> : "New password"}</label><input id="staff-password" type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder={modalMode === "edit" ? "Leave blank to keep current password" : "At least 8 characters"} minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} pattern="[!-~]{8,128}" className={adminFieldClass} /><p className="mt-1.5 text-xs text-slate-500">8–128 characters without spaces.{modalMode === "edit" ? " Leave blank to keep the current password." : ""}</p></div>
                <div>
                  <label className={adminLabelClass}>Role <span className="text-red-500">*</span></label>
                  <AdminSelect value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as StaffMember["role"] })} className="w-full">
                    {assignableRoles.map((role) => <option key={role} value={role}>{role}</option>)}
                  </AdminSelect>
                </div>
                <div>
                  <label className={adminLabelClass}>Status <span className="text-red-500">*</span></label>
                  <AdminSelect value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as StaffMember["status"] })} className="w-full">
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </AdminSelect>
                </div>
              </div>
              </AdminFormSection>
          </AdminFormDialogBody>
          <AdminFormDialogFooter>
            <AdminDialogCancelButton onClick={closeModal}>Cancel</AdminDialogCancelButton>
            <AdminDialogPrimaryButton disabled={isSaving} onClick={handleSave}><Save className="h-4 w-4" />{isSaving ? "Saving..." : modalMode === "create" ? "Create Staff" : "Save Changes"}</AdminDialogPrimaryButton>
          </AdminFormDialogFooter>
        </AdminFormDialog>
      ) : null}
    </div>
  );
}
