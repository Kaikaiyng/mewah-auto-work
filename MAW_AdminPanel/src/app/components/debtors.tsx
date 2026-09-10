import { useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
  Clock3,
  Link2,
  RefreshCw,
  Search,
  UsersRound,
  ChevronRight,
} from "lucide-react";
import { useApiData } from "../lib/use-api-data";
import { AdminSelect } from "./ui/admin-select";
import { AdminPagination } from "./ui/admin-pagination";

import { AutoCountSyncBadge } from "./autocount-sync-badge";

type Debtor = {
  code: string;
  name: string;
  registrationNo: string;
  phone: string;
  mobile: string;
  email: string;
  address: string;
  term: string;
  currency: string;
  creditLimit: number;
  salesAgent: string;
  debtorType: string;
  active: boolean;
  lastModified: string | null;
  linkedCompanyId: number | null;
  linkedCompanyName: string | null;
};

type DebtorSync = {
  status: string;
  remark: string;
  date: string | null;
};

type DebtorResponse = {
  debtors: Debtor[];
  lastSync: DebtorSync | null;
};



function displayDateTime(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(
    value.includes("T") ? value : value.replace(" ", "T"),
  );
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function displayMoney(value: number, currency: string) {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: currency || "MYR",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

export function Debtors() {
  const { data, isLoading, error, reload } = useApiData<DebtorResponse>(
    "admin-debtors",
    {
      debtors: [],
      lastSync: null,
    },
  );
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<
    "all" | "active" | "inactive" | "linked" | "unlinked"
  >("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filteredDebtors = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return data.debtors.filter((debtor) => {
      const matchesStatus =
        status === "all" ||
        (status === "active" && debtor.active) ||
        (status === "inactive" && !debtor.active) ||
        (status === "linked" && debtor.linkedCompanyId !== null) ||
        (status === "unlinked" && debtor.linkedCompanyId === null);
      if (!matchesStatus) return false;
      if (!needle) return true;
      return [
        debtor.code,
        debtor.name,
        debtor.registrationNo,
        debtor.phone,
        debtor.mobile,
        debtor.email,
      ].some((value) => value.toLowerCase().includes(needle));
    });
  }, [data.debtors, search, status]);

  const totalPages = Math.max(1, Math.ceil(filteredDebtors.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleDebtors = filteredDebtors.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );
  const activeCount = data.debtors.reduce(
    (count, debtor) => count + (debtor.active ? 1 : 0),
    0,
  );
  const linkedCount = data.debtors.reduce(
    (count, debtor) => count + (debtor.linkedCompanyId ? 1 : 0),
    0,
  );

  const updateSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const updateStatus = (value: typeof status) => {
    setStatus(value);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-extrabold text-slate-900">Debtors</h1>
            <AutoCountSyncBadge
              label="AutoCount Debtor Master"
              lastSync={data.lastSync?.date}
              onRefresh={() => void reload()}
              isRefreshing={isLoading}
            />
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Synchronized client & debtor accounts from AutoCount ERP
          </p>
        </div>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="group relative flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-5 text-left shadow-xs transition-all duration-200 hover:border-blue-300 hover:shadow-md hover:-translate-y-0.5">
          <div className="flex-1 min-w-0 pr-3">
            <span className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 truncate">Total Debtors</span>
            <div className="mt-1.5 flex items-baseline">
              <span className="text-3xl font-black tracking-tight text-slate-900 truncate">{data.debtors.length}</span>
            </div>
            <div className="mt-2 flex items-center text-xs text-slate-500 font-medium">
              <span>AutoCount debtor ledger</span>
            </div>
          </div>
          <div className="flex flex-col items-end justify-between self-stretch shrink-0 py-0.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700 shadow-2xs group-hover:scale-105 transition-transform">
              <UsersRound className="h-5 w-5" />
            </div>
            <ChevronRight className="h-4 w-4 text-slate-300 group-hover:translate-x-1 group-hover:text-blue-600 transition" />
          </div>
        </div>

        <div className="group relative flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-5 text-left shadow-xs transition-all duration-200 hover:border-blue-300 hover:shadow-md hover:-translate-y-0.5">
          <div className="flex-1 min-w-0 pr-3">
            <span className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 truncate">Active Debtors</span>
            <div className="mt-1.5 flex items-baseline">
              <span className="text-3xl font-black tracking-tight text-emerald-600 truncate">{activeCount}</span>
            </div>
            <div className="mt-2 flex items-center text-xs text-slate-500 font-medium">
              <span>Active billing status</span>
            </div>
          </div>
          <div className="flex flex-col items-end justify-between self-stretch shrink-0 py-0.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 shadow-2xs group-hover:scale-105 transition-transform">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <ChevronRight className="h-4 w-4 text-slate-300 group-hover:translate-x-1 group-hover:text-blue-600 transition" />
          </div>
        </div>

        <div className="group relative flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-5 text-left shadow-xs transition-all duration-200 hover:border-blue-300 hover:shadow-md hover:-translate-y-0.5">
          <div className="flex-1 min-w-0 pr-3">
            <span className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 truncate">Linked Companies</span>
            <div className="mt-1.5 flex items-baseline">
              <span className="text-3xl font-black tracking-tight text-indigo-700 truncate">{linkedCount}</span>
            </div>
            <div className="mt-2 flex items-center text-xs text-slate-500 font-medium">
              <span>Mapped to workshop fleet</span>
            </div>
          </div>
          <div className="flex flex-col items-end justify-between self-stretch shrink-0 py-0.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 shadow-2xs group-hover:scale-105 transition-transform">
              <Link2 className="h-5 w-5" />
            </div>
            <ChevronRight className="h-4 w-4 text-slate-300 group-hover:translate-x-1 group-hover:text-blue-600 transition" />
          </div>
        </div>

        <div className="group relative flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-5 text-left shadow-xs transition-all duration-200 hover:border-blue-300 hover:shadow-md hover:-translate-y-0.5">
          <div className="flex-1 min-w-0 pr-3">
            <span className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 truncate">Last Sync</span>
            <div className="mt-1.5 flex items-baseline">
              <span className="text-xl font-extrabold tracking-tight text-amber-700 truncate" title={displayDateTime(data.lastSync?.date || null)}>
                {data.lastSync?.date ? new Intl.DateTimeFormat("en-MY", { dateStyle: "short", timeStyle: "short" }).format(new Date(data.lastSync.date.replace(" ", "T"))) : "Never"}
              </span>
            </div>
            <div className="mt-2 flex items-center text-xs text-slate-500 font-medium">
              <span className="truncate" title={data.lastSync?.remark || undefined}>{data.lastSync?.status || "No sync log"}</span>
            </div>
          </div>
          <div className="flex flex-col items-end justify-between self-stretch shrink-0 py-0.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600 shadow-2xs group-hover:scale-105 transition-transform">
              <Clock3 className="h-5 w-5" />
            </div>
            <ChevronRight className="h-4 w-4 text-slate-300 group-hover:translate-x-1 group-hover:text-blue-600 transition" />
          </div>
        </div>
      </div>

      <div className="maw-filter-bar flex flex-col gap-3 md:flex-row md:items-center">
        <div className="maw-search-field w-full md:min-w-[320px] md:flex-1">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => updateSearch(event.target.value)}
            placeholder="Search debtor code, company, registration, phone or email..."
            className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="w-full md:w-64">
          <AdminSelect
            value={status}
            onChange={(event) =>
              updateStatus(event.target.value as typeof status)
            }
            className="w-full"
            aria-label="Filter debtors"
          >
            <option value="all">All debtors</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="linked">Linked to MAW company</option>
            <option value="unlinked">Not linked</option>
          </AdminSelect>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {[
                  "Debtor",
                  "Contact",
                  "Terms / Credit",
                  "AutoCount Status",
                  "MAW Company",
                  "Last Modified",
                ].map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {isLoading && data.debtors.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-12 text-center text-sm text-gray-500"
                  >
                    Loading Debtors…
                  </td>
                </tr>
              ) : null}
              {!isLoading && visibleDebtors.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-12 text-center text-sm text-gray-500"
                  >
                    No debtors match the current filters.
                  </td>
                </tr>
              ) : null}
              {visibleDebtors.map((debtor) => (
                <tr
                  key={debtor.code}
                  className="align-top transition-colors hover:bg-gray-50 [content-visibility:auto]"
                >
                  <td className="px-5 py-4">
                    <p className="font-semibold text-gray-900">
                      {debtor.name || "Unnamed debtor"}
                    </p>
                    <p className="mt-1 font-mono text-xs font-bold text-blue-700">
                      {debtor.code}
                    </p>
                    {debtor.registrationNo ? (
                      <p className="mt-1 text-xs text-gray-500">
                        Reg: {debtor.registrationNo}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-600">
                    <p>{debtor.mobile || debtor.phone || "—"}</p>
                    <p
                      className="mt-1 max-w-52 truncate text-xs text-gray-500"
                      title={debtor.email}
                    >
                      {debtor.email || "No email"}
                    </p>
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-700">
                    <p>{debtor.term || "No term"}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {displayMoney(debtor.creditLimit, debtor.currency)}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${debtor.active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}
                    >
                      <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />
                      {debtor.active ? "Active" : "Inactive"}
                    </span>
                    {debtor.debtorType ? (
                      <p className="mt-2 text-xs text-gray-500">
                        {debtor.debtorType}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-5 py-4">
                    {debtor.linkedCompanyId ? (
                      <div className="flex items-start gap-2 text-sm text-indigo-700">
                        <Building2 className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                          {debtor.linkedCompanyName}
                          <span className="block text-xs text-gray-500">
                            Company #{debtor.linkedCompanyId}
                          </span>
                        </span>
                      </div>
                    ) : (
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
                        Not linked
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-xs text-gray-500">
                    {displayDateTime(debtor.lastModified)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <AdminPagination
          currentPage={safePage}
          totalPages={totalPages}
          totalItems={filteredDebtors.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          itemLabel="debtors"
        />
      </div>
    </div>
  );
}
