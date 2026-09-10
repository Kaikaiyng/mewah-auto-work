import { useMemo, useState } from "react";
import { CheckCircle2, Database, Link2, RefreshCw, Search, Truck, XCircle } from "lucide-react";
import { useApiData } from "../lib/use-api-data";
import { AdminMetricCard } from "./ui/admin-metric-card";
import { AutoCountSyncBadge } from "./autocount-sync-badge";
import { AdminPagination } from "./ui/admin-pagination";
import { PageLoading } from "./ui/page-loading";

type AutoCountProject = {
  projectNo: string;
  description: string;
  debtorCode: string;
  active: boolean;
  lastSyncAt: string | null;
  vehicles: Array<{ id: number; vehicleNo: string }>;
};

function displayDateTime(value?: string | null) {
  if (!value) return "Not synced";
  const parsed = new Date(value.includes("T") ? value : value.replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AutoCountProjects() {
  const { data: projects, isLoading, error, reload, hasLoaded } = useApiData<AutoCountProject[]>(
    "admin-autocount-projects",
    [],
  );
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive" | "linked" | "unlinked">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return projects.filter((project) => {
      if (status === "active" && !project.active) return false;
      if (status === "inactive" && project.active) return false;
      if (status === "linked" && project.vehicles.length === 0) return false;
      if (status === "unlinked" && project.vehicles.length > 0) return false;
      if (!needle) return true;
      return [
        project.projectNo,
        project.description,
        project.debtorCode,
        ...project.vehicles.map((vehicle) => vehicle.vehicleNo),
      ].some((value) => value.toLowerCase().includes(needle));
    });
  }, [projects, search, status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedProjects = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage, pageSize]);

  const linkedCount = projects.filter((project) => project.vehicles.length > 0).length;
  const vehicleCount = projects.reduce((total, project) => total + project.vehicles.length, 0);

  if (isLoading && !hasLoaded) {
    return (
      <PageLoading
        title="Loading AutoCount Projects..."
        description="Fetching AutoCount project mappings and fleet links..."
      />
    );
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-extrabold text-slate-900">AutoCount Projects</h1>
            <AutoCountSyncBadge label="AutoCount Project Master" onRefresh={() => void reload()} isRefreshing={isLoading} />
          </div>
          <p className="mt-1 text-xs text-slate-500">Project and vehicle mappings synchronized from AutoCount ERP.</p>
        </div>
        <button type="button" onClick={() => void reload()} disabled={isLoading} className="inline-flex h-10 items-center rounded-xl bg-[#1e3a8a] px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 disabled:opacity-50">
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />Refresh
        </button>
      </div>

      {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <AdminMetricCard label="Projects" value={projects.length.toLocaleString()} detail="AutoCount project master" icon={Database} />
        <AdminMetricCard label="Linked Projects" value={linkedCount.toLocaleString()} detail="Projects mapped to fleet" icon={Link2} iconClassName="bg-emerald-50 text-emerald-700" valueClassName="text-emerald-600" />
        <AdminMetricCard label="Linked Vehicles" value={vehicleCount.toLocaleString()} detail="Vehicles with project mapping" icon={Truck} iconClassName="bg-indigo-50 text-indigo-700" valueClassName="text-indigo-700" />
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_220px]">
        <label className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search project, description, debtor or vehicle..."
            className="h-10 w-full rounded-lg border border-slate-300 pl-10 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </label>
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as typeof status);
            setPage(1);
          }}
          className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
        >
          <option value="all">All projects</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="linked">Linked to vehicle</option>
          <option value="unlinked">Not linked</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50"><tr>{["Project", "Debtor", "Linked Vehicle", "Status", "Last Sync"].map((heading) => <th key={heading} className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">{heading}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && projects.length === 0 ? <tr><td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-500">Loading AutoCount Projects…</td></tr> : null}
              {!isLoading && filtered.length === 0 ? <tr><td colSpan={5} className="px-5 py-12 text-center"><Database className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-700">No AutoCount Projects found</p><p className="mt-1 text-xs text-slate-500">The page will populate when AutoCount returns Project master rows.</p></td></tr> : null}
              {paginatedProjects.map((project) => (
                <tr key={project.projectNo} className="align-top hover:bg-slate-50">
                  <td className="px-5 py-4"><p className="font-mono text-sm font-extrabold text-blue-700">{project.projectNo}</p><p className="mt-1 max-w-md text-xs text-slate-500">{project.description || "No description"}</p></td>
                  <td className="px-5 py-4"><span className="font-mono text-xs font-bold text-slate-700">{project.debtorCode || "—"}</span></td>
                  <td className="px-5 py-4">{project.vehicles.length > 0 ? <div className="flex flex-wrap gap-1.5">{project.vehicles.map((vehicle) => <span key={vehicle.id} className="rounded-md bg-indigo-50 px-2 py-1 font-mono text-xs font-bold text-indigo-700">{vehicle.vehicleNo || `Vehicle #${vehicle.id}`}</span>)}</div> : <span className="text-xs text-slate-400">Not linked</span>}</td>
                  <td className="px-5 py-4"><span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${project.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{project.active ? <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> : <XCircle className="mr-1 h-3.5 w-3.5" />}{project.active ? "Active" : "Inactive"}</span></td>
                  <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-500">{displayDateTime(project.lastSyncAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <AdminPagination
          currentPage={safePage}
          totalPages={totalPages}
          totalItems={filtered.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          itemLabel="projects"
        />
      </div>
    </div>
  );
}
