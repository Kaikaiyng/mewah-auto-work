import { apiAssetUrl } from './api';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'api/api.php';
const WORKSHOP_AUTH_KEY = 'maw_workshop_authenticated';
const WORKSHOP_USER_KEY = 'maw_workshop_user';
const WORKSHOP_CSRF_KEY = 'maw_workshop_csrf';

export type WorkshopPhoto = {
  id: number;
  workOrderId: number;
  category: string;
  caption: string;
  uploadedBy: string;
  customerVisible: boolean;
  takenAt: string | null;
  createdAt: string | null;
};

export type WorkshopJob = {
  id: number;
  workOrderNo: string;
  status: string;
  companyName: string;
  vehicleId: number;
  regNo: string;
  unitNo: string;
  reportedProblem: string;
  bay: string;
  priority: string;
  foremanId: number;
  checkinAt: string | null;
  inspectedAt: string | null;
  approvedAt: string | null;
  partsReadyAt: string | null;
  underRepairAt: string | null;
  completedAt: string | null;
  assignedTechnicianIds: number[];
  photos: WorkshopPhoto[];
};

export type WorkshopTeamMember = { id: number; name: string };
export type WorkshopNotification = { id: string; workOrderId: number; title: string; message: string; date: string; type: string };

export type WorkshopPartItem = {
  id: number;
  name: string;
  sku: string;
  price: number;
  stock: number;
};

export type WorkOrderPartRequirementItem = {
  id?: number;
  itemCode: string;
  description: string;
  quantity: number;
  requiredQuantity?: number;
  unitPrice?: number;
  stock?: number;
  shortage?: number;
};

export type WorkOrderPartsOverview = {
  status: 'not_required' | 'pending_parts' | 'partially_arrived' | 'parts_ready';
  partsReady: boolean;
  shortageCount: number;
  requirements: WorkOrderPartRequirementItem[];
};

type ApiEnvelope<T> = { success: boolean; message: string; data: T };

async function workshopRequest<T>(
  mode: string,
  init: RequestInit = {},
  query: Record<string, string | number | boolean | undefined> = {},
) {
  const separator = API_BASE_URL.includes('?') ? '&' : '?';
  const queryParams = new URLSearchParams();
  queryParams.set('mode', mode);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) {
      queryParams.set(key, String(value));
    }
  }
  const isForm = init.body instanceof FormData;
  const csrfToken = sessionStorage.getItem(WORKSHOP_CSRF_KEY) || localStorage.getItem(WORKSHOP_CSRF_KEY);
  const url = `${API_BASE_URL.split('?')[0]}${separator}${queryParams.toString()}`;
  const response = await fetch(url, {
    credentials: 'include',
    cache: 'no-store',
    ...init,
    headers: {
      ...(!isForm ? { 'Content-Type': 'application/json' } : {}),
      'X-MAW-Portal': 'admin',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      ...(init.headers || {}),
    },
  });
  const responseText = await response.text();
  let payload: ApiEnvelope<T>;
  try {
    payload = JSON.parse(responseText) as ApiEnvelope<T>;
  } catch {
    const serverMessage = responseText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    throw new Error(serverMessage || `Workshop server error (HTTP ${response.status}).`);
  }
  if (!response.ok || !payload.success) {
    if (response.status === 401) clearWorkshopSession();
    throw new Error(payload.message || 'Workshop request failed.');
  }
  return payload.data;
}

export function hasWorkshopSession() {
  return sessionStorage.getItem(WORKSHOP_AUTH_KEY) === 'true' || localStorage.getItem(WORKSHOP_AUTH_KEY) === 'true';
}

export function getWorkshopUser() {
  const value = sessionStorage.getItem(WORKSHOP_USER_KEY) || localStorage.getItem(WORKSHOP_USER_KEY);
  return value ? JSON.parse(value) as { id: number; displayName: string; role: string } : null;
}

function storeWorkshopCsrf(token: string) {
  if (!token) return;
  const storage = localStorage.getItem(WORKSHOP_AUTH_KEY) === 'true' ? localStorage : sessionStorage;
  storage.setItem(WORKSHOP_CSRF_KEY, token);
}

export function clearWorkshopSession() {
  for (const storage of [sessionStorage, localStorage]) {
    storage.removeItem(WORKSHOP_AUTH_KEY);
    storage.removeItem(WORKSHOP_USER_KEY);
    storage.removeItem(WORKSHOP_CSRF_KEY);
  }
}

export async function loginWorkshop(username: string, password: string, rememberMe = true) {
  const user = await workshopRequest<{ id: number; displayName: string; role: string; csrfToken: string }>('admin-login', {
    method: 'POST',
    body: JSON.stringify({ username, password, rememberMe: true }),
  });
  clearWorkshopSession();
  for (const storage of [localStorage, sessionStorage]) {
    storage.setItem(WORKSHOP_AUTH_KEY, 'true');
    storage.setItem(WORKSHOP_USER_KEY, JSON.stringify(user));
    storage.setItem(WORKSHOP_CSRF_KEY, user.csrfToken);
  }
  return user;
}

export async function loadWorkshopJobs() {
  try {
    const result = await workshopRequest<{ csrfToken?: string; staff: { id: number; role: string }; team: WorkshopTeamMember[]; jobs: WorkshopJob[]; notifications: WorkshopNotification[] }>('workshop-work-orders');
    if (result.csrfToken) storeWorkshopCsrf(result.csrfToken);
    return result;
  } catch (caught) {
    if (!(caught instanceof Error) || !/invalid api mode/i.test(caught.message)) throw caught;
    const legacy = await workshopRequest<{
      workOrders: Array<{
        id: number;
        workOrderNo: string;
        canonicalStatus: string;
        companyName: string;
        vehicleId: number;
        vehicleNo: string;
        reportedProblem: string;
        bay: string | null;
        foremanId: number | null;
        checkinAt?: string | null;
        inspectedAt?: string | null;
        approvedAt?: string | null;
        partsReadyAt?: string | null;
        underRepairAt?: string | null;
        completedAt?: string | null;
        technicians?: Array<{ id: number }>;
      }>;
    }>('admin-work-orders', {
      method: 'POST',
      body: JSON.stringify({ recordScope: 'active', page: 1, limit: 100 }),
    });
    const user = getWorkshopUser();
    return {
      staff: { id: user?.id || 0, role: user?.role || 'Technician' },
      team: [],
      notifications: [],
      jobs: (legacy.workOrders || []).map((job) => ({
        id: job.id,
        workOrderNo: job.workOrderNo,
        status: job.canonicalStatus,
        companyName: job.companyName,
        vehicleId: job.vehicleId,
        regNo: job.vehicleNo,
        unitNo: '',
        reportedProblem: job.reportedProblem,
        bay: job.bay || '',
        foremanId: job.foremanId || 0,
        checkinAt: job.checkinAt || null,
        inspectedAt: job.inspectedAt || null,
        approvedAt: job.approvedAt || null,
        partsReadyAt: job.partsReadyAt || null,
        underRepairAt: job.underRepairAt || null,
        completedAt: job.completedAt || null,
        assignedTechnicianIds: (job.technicians || []).map((member) => member.id),
        photos: [],
      })),
    };
  }
}

export async function assignWorkshopTechnician(workOrderId: number, technicianId: number) {
  return workshopRequest<{ workOrderId: number; technicianId: number }>('workshop-assign-technician', {
    method: 'POST',
    body: JSON.stringify({ workOrderId, technicianId }),
  });
}

export async function uploadWorkshopPhoto(input: {
  workOrderId: number;
  photo: File;
  category: string;
  caption: string;
  customerVisible: boolean;
}) {
  const form = new FormData();
  const csrfToken = sessionStorage.getItem(WORKSHOP_CSRF_KEY) || localStorage.getItem(WORKSHOP_CSRF_KEY) || '';
  form.set('workOrderId', String(input.workOrderId));
  form.set('photo', input.photo);
  form.set('category', input.category);
  form.set('caption', input.caption);
  form.set('customerVisible', input.customerVisible ? '1' : '0');
  form.set('takenAt', new Date(input.photo.lastModified || Date.now()).toISOString());
  form.set('csrfToken', csrfToken);
  try {
    return await workshopRequest<WorkshopPhoto>('workshop-upload-photo', { method: 'POST', body: form });
  } catch (caught) {
    if (caught instanceof Error && /invalid api mode/i.test(caught.message)) {
      throw new Error('Photo upload is not available on this server yet. Deploy the latest workshop API and photo-storage migration.');
    }
    throw caught;
  }
}

export function workshopPhotoUrl(photoId: number) {
  return apiAssetUrl('work-order-photo-file', { id: photoId });
}

export async function loadWorkshopPartsCatalog(): Promise<WorkshopPartItem[]> {
  try {
    const result = await workshopRequest<any>('admin-parts');
    if (Array.isArray(result)) return result;
    if (result && Array.isArray(result.parts)) return result.parts;
    return [];
  } catch {
    return [];
  }
}

export async function loadWorkOrderPartRequirements(workOrderId: number): Promise<WorkOrderPartsOverview> {
  try {
    const data = await workshopRequest<any>('admin-work-order-parts-overview', {}, { id: workOrderId });
    const rawItems = Array.isArray(data?.items) ? data.items : [];
    const requirements: WorkOrderPartRequirementItem[] = rawItems.map((item: any) => ({
      itemCode: item.code || '',
      description: item.description || '',
      quantity: Number(item.requiredQuantity) || 1,
      requiredQuantity: Number(item.requiredQuantity) || 1,
      stock: Number(item.stockOnHand) || 0,
      shortage: Number(item.shortageQuantity) || 0,
    }));
    return {
      status: data?.status || (Number(data?.shortageCount) > 0 ? 'pending_parts' : requirements.length > 0 ? 'parts_ready' : 'not_required'),
      partsReady: Boolean(data?.partsReady ?? (Number(data?.shortageCount) === 0 && requirements.length > 0)),
      shortageCount: Number(data?.shortageCount || 0),
      requirements,
    };
  } catch {
    return {
      status: 'not_required',
      partsReady: false,
      shortageCount: 0,
      requirements: [],
    };
  }
}

export async function saveWorkOrderPartRequirements(
  workOrderId: number,
  items: Array<{ itemCode: string; description: string; quantity: number }>,
) {
  return workshopRequest('admin-save-work-order-part-requirements', {
    method: 'POST',
    body: JSON.stringify({ workOrderId, items }),
  });
}
