import { createBrowserRouter, isRouteErrorResponse, Navigate, useRouteError } from "react-router";
import type { ReactNode } from "react";
import { DashboardLayout } from "./components/dashboard-layout";
import { Dashboard } from "./components/dashboard";
import { Customers } from "./components/customers";
import { Companies } from "./components/companies";
import { Suppliers } from "./components/suppliers";
import { Equipment } from "./components/equipment";
import { Bookings } from "./components/bookings";
import { PartsInventory } from "./components/parts-inventory";
import { Orders } from "./components/orders";
import { PurchaseOrders } from "./components/purchase-orders";
import { Invoices } from "./components/invoices";
import { Notifications } from "./components/notifications";
import { Reports } from "./components/reports";
import { Settings } from "./components/settings";
import { WorkOrders } from "./components/work-orders";
import { Staff } from "./components/staff";
import { AuditTrail } from "./components/audit-trail";
import { AppLogs } from "./components/app-logs";
import { AutocountSyncHealth } from "./components/autocount-sync-health";
import { AutoCountProjects } from "./components/autocount-projects";
import { MasterData } from "./components/master-data";
import { isAdminAuthenticated, LoginPage } from "./components/login-page";
import { canAccessAdminPath } from "./lib/admin-permissions";

function ProtectedDashboardLayout() {
  if (!isAdminAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  return <DashboardLayout />;
}

function RoleProtectedPage({ path, children }: { path: string; children: ReactNode }) {
  if (!canAccessAdminPath(path)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function DashboardIndex() {
  return canAccessAdminPath("/")
    ? <Dashboard />
    : <Navigate to="/work-orders" replace />;
}

function AdminRouteError() {
  const routeError = useRouteError();
  const message = isRouteErrorResponse(routeError)
    ? routeError.statusText || `Request failed (${routeError.status})`
    : routeError instanceof Error
      ? `${routeError.message}\n${routeError.stack || ""}`
      : "An unexpected screen error occurred.";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <section className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-sm">
        <h1 className="text-xl font-extrabold text-slate-900">This screen could not be displayed</h1>
        <p className="mt-2 text-sm text-slate-600">Your data has not been changed. Reload the screen or return to Work Orders.</p>
        <pre className="mt-4 overflow-auto max-h-48 rounded-xl bg-slate-950 p-3 text-left text-xs font-mono text-rose-300">{message}</pre>
        <div className="mt-5 flex justify-center gap-3">
          <button type="button" onClick={() => window.location.reload()} className="rounded-lg bg-[#1e3a8a] px-4 py-2 text-sm font-bold text-white">Reload</button>
          <a href="/work-orders" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">Work Orders</a>
        </div>
      </section>
    </main>
  );
}

// Router configuration
export const router = createBrowserRouter([
  {
    path: "/login",
    Component: LoginPage,
  },
  {
    path: "/",
    Component: ProtectedDashboardLayout,
    errorElement: <AdminRouteError />,
    children: [
      { index: true, Component: DashboardIndex },
      { path: "work-orders", element: <RoleProtectedPage path="/work-orders"><WorkOrders /></RoleProtectedPage> },
      { path: "staff", element: <RoleProtectedPage path="/staff"><Staff /></RoleProtectedPage> },
      { path: "customers", element: <Navigate to="/companies" replace /> },
      { path: "drivers", element: <Navigate to="/equipment" replace /> },
      { path: "companies", element: <RoleProtectedPage path="/companies"><Companies /></RoleProtectedPage> },
      { path: "debtors", element: <Navigate to="/companies" replace /> },
      { path: "autocount-sync", element: <RoleProtectedPage path="/autocount-sync"><AutocountSyncHealth /></RoleProtectedPage> },
      { path: "suppliers", element: <Navigate to="/master-data" replace /> },
      { path: "equipment", element: <RoleProtectedPage path="/equipment"><Equipment /></RoleProtectedPage> },
      { path: "projects", element: <RoleProtectedPage path="/projects"><AutoCountProjects /></RoleProtectedPage> },
      { path: "bookings", element: <RoleProtectedPage path="/bookings"><Bookings /></RoleProtectedPage> },
      { path: "parts", element: <RoleProtectedPage path="/parts"><PartsInventory /></RoleProtectedPage> },
      { path: "orders", element: <RoleProtectedPage path="/orders"><Orders /></RoleProtectedPage> },
      { path: "purchase-orders", element: <RoleProtectedPage path="/purchase-orders"><PurchaseOrders /></RoleProtectedPage> },
      { path: "invoices", element: <RoleProtectedPage path="/invoices"><Invoices /></RoleProtectedPage> },
      { path: "pending-sync-invoices", element: <Navigate to="/invoices?view=pending_sync" replace /> },
      { path: "billing/pending-sync", element: <Navigate to="/invoices?view=pending_sync" replace /> },
      { path: "notifications", element: <RoleProtectedPage path="/notifications"><Notifications /></RoleProtectedPage> },
      { path: "audit-trail", element: <RoleProtectedPage path="/audit-trail"><AuditTrail /></RoleProtectedPage> },
      { path: "app-logs", element: <RoleProtectedPage path="/app-logs"><AppLogs /></RoleProtectedPage> },
      { path: "master-data", element: <RoleProtectedPage path="/master-data"><Suppliers /></RoleProtectedPage> },
      { path: "reports", element: <RoleProtectedPage path="/reports"><Reports /></RoleProtectedPage> },
      { path: "settings", element: <RoleProtectedPage path="/settings"><Settings /></RoleProtectedPage> },
    ],
  },
]);
