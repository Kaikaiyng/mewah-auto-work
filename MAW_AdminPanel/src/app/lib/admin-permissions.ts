export type AdminPermission =
  | "dashboard.view"
  | "dashboard.finance"
  | "booking.view" | "booking.create" | "booking.update" | "booking.delete"
  | "workOrder.view" | "workOrder.create" | "workOrder.updateDetails" | "workOrder.updateStatus" | "workOrder.viewQuotation" | "workOrder.manageQuotation"
  | "company.view" | "company.update"
  | "debtor.view"
  | "supplier.view"
  | "customer.view" | "customer.create" | "customer.update" | "customer.delete"
  | "driver.view" | "driver.update"
  | "vehicle.view" | "vehicle.create" | "vehicle.update" | "vehicle.review"
  | "part.view" | "part.viewCost" | "part.create" | "part.update" | "part.delete"
  | "order.view" | "order.update"
  | "invoice.view" | "invoice.update"
  | "staff.view" | "staff.manage"
  | "notification.view" | "notification.send"
  | "audit.view"
  | "app.logs"
  | "autocount.manage"
  | "report.view"
  | "settings.view";

export type SignedInAdmin = {
  username?: string;
  displayName?: string;
  role?: string;
};

const allPermissions: AdminPermission[] = [
  "dashboard.view",
  "dashboard.finance",
  "booking.view", "booking.create", "booking.update", "booking.delete",
  "workOrder.view", "workOrder.create", "workOrder.updateDetails", "workOrder.updateStatus", "workOrder.viewQuotation", "workOrder.manageQuotation",
  "company.view", "company.update",
  "debtor.view",
  "supplier.view",
  "customer.view", "customer.create", "customer.update", "customer.delete",
  "driver.view", "driver.update",
  "vehicle.view", "vehicle.create", "vehicle.update", "vehicle.review",
  "part.view", "part.viewCost", "part.update",
  "order.view", "order.update",
  "invoice.view", "invoice.update",
  "staff.view", "staff.manage",
  "notification.view", "notification.send",
  "report.view", "settings.view",
];

const rolePermissions: Record<string, Set<AdminPermission>> = {
  "Super Admin": new Set([...allPermissions, "audit.view", "app.logs", "autocount.manage"]),
  Admin: new Set(allPermissions),
  "Head Manager": new Set([
    "dashboard.view",
    "booking.view", "booking.create", "booking.update",
    "workOrder.view", "workOrder.create", "workOrder.updateDetails", "workOrder.updateStatus", "workOrder.viewQuotation", "workOrder.manageQuotation",
    "company.view", "debtor.view", "customer.view", "driver.view",
    "vehicle.view", "vehicle.create", "vehicle.update", "vehicle.review",
    "part.view", "part.viewCost", "part.update",
    "order.view", "order.update",
    "invoice.view", "staff.view",
    "notification.view", "report.view",
  ]),
  Technician: new Set([
    "workOrder.view", "workOrder.updateStatus",
    "vehicle.view",
    "part.view",
  ]),
  Foreman: new Set([
    "dashboard.view",
    "booking.view",
    "workOrder.view", "workOrder.updateStatus", "workOrder.updateDetails",
    "vehicle.view",
    "part.view",
  ]),
};

export const pathPermissions: Record<string, AdminPermission> = {
  "/": "dashboard.view",
  "/bookings": "booking.view",
  "/work-orders": "workOrder.view",
  "/companies": "company.view",
  "/debtors": "debtor.view",
  "/autocount-sync": "autocount.manage",
  "/suppliers": "supplier.view",
  "/customers": "customer.view",
  "/drivers": "driver.view",
  "/equipment": "vehicle.view",
  "/projects": "vehicle.view",
  "/parts": "part.view",
  "/orders": "order.view",
  "/purchase-orders": "order.view",
  "/invoices": "invoice.view",
  "/pending-sync-invoices": "invoice.view",
  "/staff": "staff.view",
  "/notifications": "notification.view",
  "/audit-trail": "audit.view",
  "/app-logs": "app.logs",
  "/reports": "report.view",
  "/master-data": "supplier.view",
  "/settings": "settings.view",
};

export function getSignedInAdmin(): SignedInAdmin {
  try {
    const storedUser = sessionStorage.getItem("maw_admin_user") || localStorage.getItem("maw_admin_user");
    return JSON.parse(storedUser || "{}") as SignedInAdmin;
  } catch {
    return {};
  }
}

function normalizeRole(role?: string) {
  const value = (role || "").trim().toLowerCase();
  if (value === "superadmin") return "Super Admin";
  if (["admin", "administrator"].includes(value)) return "Admin";
  if (["manager", "head manager", "service advisor", "receptionist"].includes(value)) return "Head Manager";
  if (value === "foreman") return "Foreman";
  if (value === "editor") return "Technician";
  if (value === "technician") return "Technician";
  if (value === "mechanic") return "Technician";
  return "";
}

export function hasAdminPermission(permission: AdminPermission, role = getSignedInAdmin().role) {
  const normalizedRole = normalizeRole(role);
  return rolePermissions[normalizedRole]?.has(permission) ?? false;
}

export function canAccessAdminPath(pathname: string, role = getSignedInAdmin().role) {
  const permission = pathPermissions[pathname];
  return permission ? hasAdminPermission(permission, role) : false;
}
