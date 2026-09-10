import type { Booking, CustomerData, DeliveryAddress, NotificationPreferences, SupportSettings, User, Vehicle, VehicleDocument, VehicleDocumentType } from '../types';
import {
  mockBookings,
  mockContacts,
  mockNotificationPreferences,
  mockNotifications,
  mockReminders,
  mockSpareParts,
  serviceCentres,
  mockSuperadminUser,
  mockUser,
  mockWorkOrders,
} from '../data/mockData';
import {
  clearLocalCustomerAccount,
  setLocalCustomerAccount,
  type LocalCustomerAccountId,
} from './local-customer-session';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'api/api.php';
export function apiAssetUrl(mode: string, params: Record<string, string | number>) {
  const query = new URLSearchParams({ mode, portal: 'customer' });
  Object.entries(params).forEach(([key, value]) => query.set(key, String(value)));
  return `${API_BASE_URL}${API_BASE_URL.includes('?') ? '&' : '?'}${query.toString()}`;
}
export const usesLocalRecords =
  import.meta.env.DEV && import.meta.env.VITE_CUSTOMER_DATA_SOURCE === 'local';
const ENABLE_LEGACY_API_FALLBACK =
  import.meta.env.DEV &&
  import.meta.env.VITE_ENABLE_LEGACY_API_FALLBACK === 'true';
const AUTHENTICATED_KEY = 'maw_customer_authenticated';
const API_VERSION_KEY = 'maw_customer_api_version';
const LOCAL_LOGGED_OUT_KEY = 'maw_customer_local_logged_out';
const CUSTOMER_CSRF_KEY = 'maw_customer_csrf';
const CUSTOMER_AUTH_EXPIRES_KEY = 'maw_customer_auth_expires_at';
const REMEMBER_DURATION_MS = 365 * 24 * 60 * 60 * 1000;

function customerAuthValue(key: string) {
  return localStorage.getItem(key) || sessionStorage.getItem(key);
}

function clearCustomerStorage(storage: Storage) {
  storage.removeItem(CUSTOMER_CSRF_KEY);
  storage.removeItem(AUTHENTICATED_KEY);
  storage.removeItem(API_VERSION_KEY);
  storage.removeItem(CUSTOMER_AUTH_EXPIRES_KEY);
}

type ApiEnvelope<T> = { success: boolean; message: string; data: T };

export class VehicleCreatedDocumentUploadError extends Error {
  constructor(public readonly vehicleId: string, detail: string) {
    super(`Vehicle was saved, but a document could not be uploaded: ${detail}`);
    this.name = 'VehicleCreatedDocumentUploadError';
  }
}

export function isCustomerAuthenticationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  return /unauthenticated|please sign in|session (?:has )?expired|invalid (?:or missing )?session/i.test(message);
}

export function clearCustomerAuthentication() {
  clearCustomerStorage(sessionStorage);
  clearCustomerStorage(localStorage);
  clearLocalCustomerAccount();
}

const LOCAL_TEST_ACCOUNTS = [
  {
    identifier: 'superadmin',
    password: 'DEMO-ONLY-NOT-A-SECRET',
    accountId: 'superadmin' as LocalCustomerAccountId,
    user: mockSuperadminUser,
  },
  {
    identifier: mockUser.email.toLowerCase(),
    password: 'DEMO-ONLY-NOT-A-SECRET',
    accountId: 'ahmad' as LocalCustomerAccountId,
    user: mockUser,
  },
];

async function request<T>(mode: string, init: RequestInit = {}): Promise<T> {
  const separator = API_BASE_URL.includes('?') ? '&' : '?';
  const csrfToken = customerAuthValue(CUSTOMER_CSRF_KEY);
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  const response = await fetch(`${API_BASE_URL}${separator}mode=${encodeURIComponent(mode)}`, {
    credentials: 'include',
    ...init,
    headers: {
      ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
      'X-MAW-Portal': 'customer',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      ...(init.headers || {}),
    },
  });
  const payload = await response.json() as ApiEnvelope<T>;
  if (!response.ok || !payload.success) {
    const error = new Error(payload.message || 'Unable to load data');
    if (response.status === 401 || isCustomerAuthenticationError(error)) {
      clearCustomerAuthentication();
    }
    throw error;
  }
  return payload.data;
}

function isInvalidApiMode(caught: unknown) {
  return caught instanceof Error && /invalid api mode/i.test(caught.message);
}

function usesLegacyApi() {
  return ENABLE_LEGACY_API_FALLBACK && customerAuthValue(API_VERSION_KEY) === 'legacy';
}

function markAuthenticated(apiVersion: 'modern' | 'legacy', rememberMe = true, csrfToken?: string) {
  clearCustomerStorage(sessionStorage);
  clearCustomerStorage(localStorage);
  sessionStorage.removeItem(LOCAL_LOGGED_OUT_KEY);
  localStorage.removeItem(LOCAL_LOGGED_OUT_KEY);
  // Always persist auth in localStorage for long-term permanent mobile login
  for (const storage of [localStorage, sessionStorage]) {
    storage.setItem(AUTHENTICATED_KEY, 'true');
    storage.setItem(API_VERSION_KEY, apiVersion);
    if (csrfToken) storage.setItem(CUSTOMER_CSRF_KEY, csrfToken);
    storage.setItem(CUSTOMER_AUTH_EXPIRES_KEY, String(Date.now() + REMEMBER_DURATION_MS));
  }
}

export function hasCustomerSession() {
  if (usesLocalRecords) {
    return sessionStorage.getItem(LOCAL_LOGGED_OUT_KEY) !== 'true' && localStorage.getItem(LOCAL_LOGGED_OUT_KEY) !== 'true';
  }
  const storage = localStorage.getItem(AUTHENTICATED_KEY) === 'true' ? localStorage : sessionStorage;
  const expiresAt = Number(storage.getItem(CUSTOMER_AUTH_EXPIRES_KEY));
  if (expiresAt && Date.now() > expiresAt) {
    clearCustomerAuthentication();
    return false;
  }
  return (localStorage.getItem(AUTHENTICATED_KEY) === 'true' || sessionStorage.getItem(AUTHENTICATED_KEY) === 'true') &&
    storage.getItem(API_VERSION_KEY) !== 'local-test';
}

type LegacyUser = Partial<User> & {
  vehicles?: Array<Partial<User['vehicles'][number]>>;
};
type LegacyBooking = Omit<Booking, 'status'> & { status: string };

function normalizeLegacyUser(input: LegacyUser): User {
  const companyId = input.companyId || `customer-${input.id || 'account'}`;
  return {
    id: String(input.id || ''),
    name: input.name || 'Customer',
    email: input.email || '',
    phone: input.phone || '',
    deliveryAddresses: input.deliveryAddresses || [],
    vehicles: (input.vehicles || []).map((vehicle) => ({
      id: String(vehicle.id || ''),
      companyId,
      vecNo: vehicle.vecNo || '-',
      regNo: vehicle.regNo || '-',
      equipment: vehicle.equipment || 'Vehicle',
      brand: vehicle.brand || '-',
      model: vehicle.model || '-',
      mileage: Number(vehicle.mileage || 0),
      year: Number(vehicle.year || 0),
      insuranceExpiry: vehicle.insuranceExpiry,
      roadTaxExpiry: vehicle.roadTaxExpiry,
      chassisNo: vehicle.chassisNo,
      engineNo: vehicle.engineNo,
      containerLength: vehicle.containerLength,
      axleConfiguration: vehicle.axleConfiguration,
      puspakomExpiry: vehicle.puspakomExpiry,
      status: vehicle.status,
      vehicleStatus: vehicle.vehicleStatus,
      verificationStatus: vehicle.verificationStatus,
      rejectionReason: vehicle.rejectionReason,
      reviewedAt: vehicle.reviewedAt,
      createdSource: vehicle.createdSource,
    })),
    companyId,
    companyName: input.companyName || 'Mewah AutoWorks Customer',
    contactRole: input.contactRole || 'Company User',
    preferredLanguage: input.preferredLanguage || 'en',
    permissions: {
      canViewAllVehicles: true,
      canCreateBooking: true,
      canCancelBooking: true,
      canRescheduleBooking: true,
      canViewRepairProgress: true,
      canOrderParts: true,
      canViewInvoices: true,
      canViewNotifications: true,
    },
  };
}

async function getLegacyCustomerData(): Promise<CustomerData> {
  const [home, bookings, parts, notifications] = await Promise.all([
    request<{ user: LegacyUser }>('get-home-data'),
    request<LegacyBooking[]>('get-bookings'),
    request<CustomerData['parts']>('get-parts'),
    request<CustomerData['notifications']>('get-notifications'),
  ]);
  const user = normalizeLegacyUser(home.user);
  return {
    user,
    contacts: [{
      id: `contact-${user.id}`,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.contactRole,
      isDefault: true,
    }],
    bookings: bookings.map((booking) => ({
      ...booking,
      status: (booking.status === 'upcoming' ? 'confirmed' : booking.status) as Booking['status'],
    })),
    parts,
    reminders: [],
    notifications,
    workOrders: [],
    serviceCentres: structuredClone(serviceCentres),
    notificationPreferences: structuredClone(mockNotificationPreferences),
  };
}

function localData(): CustomerData {
  return {
    user: structuredClone(mockUser),
    contacts: structuredClone(mockContacts),
    bookings: structuredClone(mockBookings),
    parts: structuredClone(mockSpareParts),
    reminders: structuredClone(mockReminders),
    notifications: structuredClone(mockNotifications),
    workOrders: structuredClone(mockWorkOrders),
    serviceCentres: structuredClone(serviceCentres),
    notificationPreferences: structuredClone(mockNotificationPreferences),
  };
}

export async function loginCustomer(identifier: string, password: string, rememberMe = false): Promise<User> {
  const normalizedIdentifier = identifier.trim().toLowerCase();
  if (usesLocalRecords) {
    const account = LOCAL_TEST_ACCOUNTS.find(
      (account) =>
        (account.identifier === normalizedIdentifier ||
          account.user.name.toLowerCase() === normalizedIdentifier) &&
        account.password === password,
    );

    if (!account) {
      throw new Error('Invalid email, name, or password');
    }
    sessionStorage.removeItem(LOCAL_LOGGED_OUT_KEY);
    localStorage.removeItem(LOCAL_LOGGED_OUT_KEY);
    setLocalCustomerAccount(account.accountId, rememberMe);
    return structuredClone(account.user);
  }
  try {
    const result = await request<User & { csrfToken?: string }>('customer-login', {
      method: 'POST',
      body: JSON.stringify({
        identifier: identifier.trim(),
        // Keep `username` during rollout so older API deployments remain
        // compatible with the updated Customer App.
        username: identifier.trim(),
        password,
        rememberMe,
      }),
    });
    markAuthenticated('modern', rememberMe, result.csrfToken);
    return result;
  } catch (caught) {
    if (!ENABLE_LEGACY_API_FALLBACK || !isInvalidApiMode(caught)) throw caught;
    try {
      const result = await request<LegacyUser>('login', {
        method: 'POST',
        // The deployed legacy API still names this field "email", but the UI and
        // modern API treat the entered value as an email-or-name identifier.
        body: JSON.stringify({
          username: identifier.trim(),
          email: identifier.trim(),
          password,
          rememberMe,
        }),
      });
      markAuthenticated('legacy', rememberMe);
      return normalizeLegacyUser(result);
    } catch (legacyError) {
      if (legacyError instanceof Error && /invalid email or password/i.test(legacyError.message)) {
        throw new Error('Invalid email, name, or password');
      }
      throw legacyError;
    }
  }
}

export function getCustomerData(): Promise<CustomerData> {
  if (usesLocalRecords) return Promise.resolve(localData());
  if (usesLegacyApi()) return getLegacyCustomerData();
  return request<CustomerData>('customer-bootstrap').catch((caught) => {
    if (!ENABLE_LEGACY_API_FALLBACK || !isInvalidApiMode(caught)) throw caught;
    const storage = localStorage.getItem(AUTHENTICATED_KEY) === 'true' ? localStorage : sessionStorage;
    storage.setItem(API_VERSION_KEY, 'legacy');
    return getLegacyCustomerData();
  });
}

export type CreateBookingInput = Pick<Booking, 'vehicleId' | 'serviceType' | 'serviceDate' | 'serviceCentre' | 'timeSlot' | 'notes' | 'reportedProblem' | 'contactId' | 'contactName' | 'reminderId'>;
export type CreatePartsOrderInput = Pick<Booking, 'deliveryAddress' | 'serviceCentre' | 'notes' | 'totalPrice' | 'items' | 'fulfilmentMethod'>;
export type CreateVehicleInput = Omit<
  Vehicle,
  'id' | 'companyId' | 'vecNo' | 'status' | 'lastServiceDate' | 'lastServiceMileage' | 'nextServiceDate' | 'nextServiceMileage'
> & {
  vehicleStatus: NonNullable<Vehicle['vehicleStatus']>;
  insuranceDocument?: File;
  roadTaxDocument?: File;
  puspakomDocument?: File;
};

export function createCustomerVehicle(input: CreateVehicleInput): Promise<{ id: string; status: string }> {
  if (usesLocalRecords) {
    return Promise.resolve({ id: `v-${Date.now()}`, status: 'Pending Verification' });
  }
  if (usesLegacyApi()) {
    return Promise.reject(new Error('Vehicle registration requires the current Customer App API.'));
  }
  const vehicle: Record<string, unknown> = { ...input };
  delete vehicle.insuranceDocument;
  delete vehicle.roadTaxDocument;
  delete vehicle.puspakomDocument;
  // A newly uploaded date is untrusted until Admin approves its document.
  if (input.insuranceDocument) delete vehicle.insuranceExpiry;
  if (input.roadTaxDocument) delete vehicle.roadTaxExpiry;
  if (input.puspakomDocument) delete vehicle.puspakomExpiry;
  return request<{ id: string; status: string }>('customer-create-vehicle', {
    method: 'POST',
    body: JSON.stringify(vehicle),
  });
}

export function uploadCustomerVehicleDocument(input: {
  vehicleId: string;
  documentType: VehicleDocumentType;
  expiryDate: string;
  document: File;
}): Promise<VehicleDocument> {
  if (usesLocalRecords) {
    return Promise.reject(new Error('Document upload requires the live Customer App API.'));
  }
  const form = new FormData();
  form.set('vehicleId', input.vehicleId);
  form.set('documentType', input.documentType);
  form.set('expiryDate', input.expiryDate);
  form.set('document', input.document);
  return request<VehicleDocument>('customer-upload-vehicle-document', { method: 'POST', body: form });
}

export function customerVehicleDocumentUrl(documentId: number) {
  return apiAssetUrl('vehicle-document-file', { id: documentId });
}

export async function fetchCustomerVehicleDocument(documentId: number): Promise<Blob> {
  const csrfToken = customerAuthValue(CUSTOMER_CSRF_KEY);
  const response = await fetch(customerVehicleDocumentUrl(documentId), {
    credentials: 'include',
    headers: {
      'X-MAW-Portal': 'customer',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
  });
  if (!response.ok) {
    let message = 'Unable to open vehicle document.';
    try {
      const payload = await response.json() as ApiEnvelope<unknown>;
      message = payload.message || message;
    } catch {
      // The file endpoint may return a non-JSON server error.
    }
    throw new Error(message);
  }
  return response.blob();
}

export function createCustomerBooking(input: CreateBookingInput): Promise<Booking> {
  if (usesLocalRecords) {
    return Promise.resolve({
      id: `b-${Date.now()}`,
      bookingNumber: `BK${Date.now()}`,
      orderType: 'service',
      status: 'pending',
      totalPrice: 0,
      ...input,
    });
  }
  if (usesLegacyApi()) {
    return request<{ id: number; bookingNumber: string }>('add-booking', {
      method: 'POST',
      body: JSON.stringify({ ...input, orderType: 'service', totalPrice: 0 }),
    }).then((result) => ({
      id: `b${result.id}`,
      bookingNumber: result.bookingNumber,
      orderType: 'service',
      status: 'confirmed',
      totalPrice: 0,
      ...input,
    }));
  }
  return request<Booking>('customer-create-booking', { method: 'POST', body: JSON.stringify(input) });
}

export interface CustomerVehicleHistoryData {
  vehicleId: number;
  summary: {
    totalWorkOrders: number;
    totalInvoices: number;
    totalMaintenanceSpend: number;
    lastRecordedMileage: number | null;
    lastServiceDate: string | null;
    lastServiceMileage?: number | null;
    nextServiceMileage?: number | null;
    nextServiceDate?: string | null;
    serviceStatus?: 'normal' | 'due_soon' | 'overdue';
    remainingKm?: number | null;
  };
  workOrders: Array<{
    id: number;
    workOrderNo: string;
    status: string;
    statusLabel: string;
    primaryIssue: string | null;
    currentMileage: number | null;
    checkinMileage?: number | null;
    checkinAt: string | null;
    completedAt: string | null;
    totalAmount: number;
  }>;
  invoices: Array<{
    id: number;
    invoiceNo: string;
    invoiceDate: string;
    totalAmount: number;
    paymentStatus: string;
    balanceDue: number;
    workOrderId: number | null;
    workOrderNo: string | null;
  }>;
}

export function fetchCustomerVehicleHistory(vehicleId: string, plate?: string): Promise<CustomerVehicleHistoryData> {
  const numericId = vehicleId.replace(/\D+/g, '');
  return request<CustomerVehicleHistoryData>(`customer-vehicle-history&vehicleId=${numericId}&plate=${encodeURIComponent(plate || '')}`);
}

export function cancelCustomerBooking(id: string): Promise<{ id: string; status: string }> {
  if (usesLocalRecords) {
    return Promise.resolve({ id, status: 'cancelled' });
  }
  return request<{ id: string; status: string }>('customer-cancel-booking', {
    method: 'POST',
    body: JSON.stringify({ id }),
  });
}

export function createCustomerPartsOrder(input: CreatePartsOrderInput): Promise<Booking> {
  if (usesLocalRecords) {
    return Promise.resolve({
      id: `p-${Date.now()}`,
      bookingNumber: `ORD-${Date.now()}`,
      orderType: 'parts',
      status: 'pending',
      serviceDate: new Date().toISOString(),
      ...input,
    });
  }
  if (usesLegacyApi()) {
    return request<{ id: number; bookingNumber: string }>('add-booking', {
      method: 'POST',
      body: JSON.stringify({
        ...input,
        orderType: 'parts',
        serviceDate: new Date().toISOString(),
        serviceCentre: input.serviceCentre || 'Customer Parts Order',
      }),
    }).then((result) => ({
      id: `p${result.id}`,
      bookingNumber: result.bookingNumber,
      orderType: 'parts',
      status: 'confirmed',
      serviceDate: new Date().toISOString(),
      ...input,
    }));
  }
  return request<Booking>('customer-create-parts-order', { method: 'POST', body: JSON.stringify(input) });
}

export function markNotificationsRead(id?: string): Promise<void> {
  if (usesLocalRecords) return Promise.resolve();
  if (usesLegacyApi()) return Promise.resolve();
  return request<void>('customer-mark-notifications-read', {
    method: 'POST',
    body: JSON.stringify(id ? { id } : {}),
  });
}

export function respondToQuotation(workOrderId: string, action: 'accept' | 'reject', note = ''): Promise<void> {
  if (usesLocalRecords) return Promise.resolve();
  if (usesLegacyApi()) return Promise.reject(new Error('Quotation responses require the current Customer App API.'));
  return request<void>('customer-respond-quotation', {
    method: 'POST',
    body: JSON.stringify({ workOrderId, action, note }),
  });
}

export function updateCustomerProfile(input: Pick<User, 'name' | 'email' | 'phone'>): Promise<User> {
  if (usesLocalRecords) {
    return Promise.resolve({
      ...mockUser,
      ...input,
    });
  }
  return request<User>('customer-update-profile', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function saveCustomerDeliveryAddress(address: DeliveryAddress): Promise<User> {
  if (usesLocalRecords) return Promise.resolve({ ...mockUser, deliveryAddresses: [address] });
  if (usesLegacyApi()) return Promise.reject(new Error('Delivery addresses require the current Customer App API.'));
  return request<User>('customer-save-delivery-address', {
    method: 'POST',
    body: JSON.stringify(address),
  });
}

export function deleteCustomerDeliveryAddress(id: string): Promise<User> {
  if (usesLocalRecords) return Promise.resolve(mockUser);
  if (usesLegacyApi()) return Promise.reject(new Error('Delivery addresses require the current Customer App API.'));
  return request<User>('customer-delete-delivery-address', {
    method: 'POST',
    body: JSON.stringify({ id }),
  });
}

export function updateCustomerNotificationPreferences(preferences: NotificationPreferences): Promise<NotificationPreferences> {
  if (usesLocalRecords) return Promise.resolve(preferences);
  if (usesLegacyApi()) return Promise.reject(new Error('Notification preferences require the current Customer App API.'));
  return request<NotificationPreferences>('customer-update-notification-preferences', {
    method: 'POST',
    body: JSON.stringify({ preferences }),
  });
}

export async function logoutCustomer(): Promise<void> {
  const wasLegacyApi = usesLegacyApi();
  try {
    // Keep the session and CSRF token until the authenticated server-side
    // logout request has completed.
    if (!usesLocalRecords && !wasLegacyApi) {
      await request<void>('customer-logout', { method: 'POST', body: '{}' });
    }
  } finally {
    clearCustomerAuthentication();
    if (usesLocalRecords) sessionStorage.setItem(LOCAL_LOGGED_OUT_KEY, 'true');
  }
}

export const DEFAULT_SUPPORT_SETTINGS: SupportSettings = {
  phone: '+60 00-000 0000',
  whatsapp: '+60 00-000 0000',
  email: 'contact@example.com',
  operatingHours: 'Monday - Saturday, 8:00 AM - 6:00 PM',
  company: {
    legalName: 'MEWAH AUTOWORKS SDN BHD',
    address: 'Configure your workshop address',
    phone: '+60 00-000 0000',
  }
};

export async function getSupportSettings(): Promise<SupportSettings> {
  if (usesLocalRecords) {
    return structuredClone(DEFAULT_SUPPORT_SETTINGS);
  }
  try {
    const data = await request<SupportSettings>('customer-support-settings');
    return {
      phone: data.phone || DEFAULT_SUPPORT_SETTINGS.phone,
      whatsapp: data.whatsapp || DEFAULT_SUPPORT_SETTINGS.whatsapp,
      email: data.email || DEFAULT_SUPPORT_SETTINGS.email,
      operatingHours: data.operatingHours || DEFAULT_SUPPORT_SETTINGS.operatingHours,
      company: {
        legalName: data.company?.legalName || DEFAULT_SUPPORT_SETTINGS.company?.legalName,
        address: data.company?.address || DEFAULT_SUPPORT_SETTINGS.company?.address,
        phone: data.company?.phone || DEFAULT_SUPPORT_SETTINGS.company?.phone,
      }
    };
  } catch {
    return structuredClone(DEFAULT_SUPPORT_SETTINGS);
  }
}
