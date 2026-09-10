export type VehicleStatus = 'Active' | 'Inactive' | 'Under Maintenance' | 'Out of Service' | 'Disposed';

export type VehicleDocumentType = 'insurance' | 'road_tax' | 'puspakom';
export type VehicleDocumentStatus = 'pending' | 'approved' | 'rejected' | 'superseded';

export interface VehicleDocument {
  id: number;
  vehicleId: string;
  type: VehicleDocumentType;
  expiryDate: string;
  originalName: string;
  mimeType: string;
  byteSize: number;
  status: VehicleDocumentStatus;
  reviewReason?: string;
  reviewedBy?: number;
  reviewedAt?: string;
  createdAt?: string;
}

export interface Vehicle {
  id: string;
  companyId: string;
  vecNo: string;        // Vehicle Number (e.g., DEMO-UNIT-001)
  regNo: string;        // Registration Number (e.g., DEMO001)
  equipment: string;    // Equipment Type (e.g., Prime Mover, Container Chassis / Skeletal Trailer)
  brand: string;        // Brand (e.g., Scania, Volvo)
  model: string;        // Model (e.g., R450, CX-20)
  containerLength?: string;
  axleConfiguration?: string;
  mileage: number;
  engineHours?: number;
  year: number;
  insuranceExpiry?: string;
  roadTaxExpiry?: string;
  chassisNo?: string;   // Chassis Number
  engineNo?: string;    // Engine Number
  puspakomExpiry?: string; // Puspakom expiry date
  lastServiceDate?: string;
  lastServiceMileage?: number;
  nextServiceDate?: string;
  nextServiceMileage?: number;
  status?: 'Excellent' | 'Good' | 'Need Repair' | string;
  vehicleStatus?: VehicleStatus;
  verificationStatus?: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
  reviewedAt?: string;
  createdSource?: 'customer_app' | 'admin_panel' | string;
  documents?: VehicleDocument[];
}

export type BookingStatus = 'pending' | 'confirmed' | 'converted' | 'cancelled' | 'no_show' | 'completed';
export type PartsOrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'shipped' | 'completed' | 'cancelled';
export type ReminderStatus = 'due_soon' | 'overdue' | 'booked' | 'completed';
export type InvoiceStatus = 'draft' | 'issued' | 'partially_paid' | 'paid' | 'overdue' | 'void';

export interface Booking {
  id: string;
  bookingNumber: string;
  invoiceNumber?: string;
  orderType: 'service' | 'parts';
  vehicleId?: string;
  serviceType?: string;
  serviceDate?: string;
  serviceCentre?: string;
  deliveryAddress?: string;
  status: BookingStatus | PartsOrderStatus;
  totalPrice: number;
  notes?: string;
  reportedProblem?: string;
  mileage?: number;
  contactName?: string;
  contactId?: string;
  mechanicNotes?: string;
  timeSlot?: string;
  reminderId?: string;
  fulfilmentMethod?: 'pickup' | 'delivery';
  createdAt?: string;
  updatedAt?: string;
  timeline?: TimelineEvent[];
  workOrderId?: string;
  workOrderNumber?: string;
  workOrderStatus?: WorkOrderStatus;
  intakeType?: 'booking' | 'walk_in' | 'rescue' | string;
  requestChannel?: string;
  invoice?: Invoice;
  items?: OrderItem[];
}

export interface Invoice {
  id?: string;
  invoiceNumber?: string;
  bookingId?: string;
  vehicleId?: string;
  issuedAt?: string;
  dueAt?: string;
  paidAt?: string;
  workOrderId?: string;
  discount?: number;
  paidAmount?: number;
  balance?: number;
  paymentInstructions?: string;
  paymentMethod?: string;
  notes?: string;
  status?: InvoiceStatus;
  billingCompany?: string;
  debtorCode?: string;
  vehicleType?: string;
  creditTermDays?: number;
  workshopName?: string;
  source?: 'autocount' | 'maw_legacy' | string;
  summaryOnly?: boolean;
  vehicleNoRaw?: string;
  documentStatus?: 'approved' | 'void' | 'expired' | string;
  eInvoiceStatus?: 'valid' | 'cancelled' | 'invalid' | string;
  eInvoiceUuid?: string;
  items: InvoiceItem[];
  laborCost: number;
  subtotal: number;
  tax: number;
  taxRate?: number;
  total: number;
}

export interface InvoiceItem {
  id: string;
  name: string;
  code?: string;
  itemType?: 'part' | 'labour' | 'other';
  category: 'service' | 'part';
  quantity: number;
  unitPrice: number;
  taxCode?: string;
  taxRate?: number;
  taxAmount?: number;
  total: number;
}

export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  image?: string;
}

export interface SparePart {
  id: string;
  name: string;
  category: string;
  price: number;
  image: string;
  inStock: boolean;
  stock?: number;
  brand?: string;
  description?: string;
  compatibleVehicles?: string[];
}

export interface ServiceReminder {
  id: string;
  vehicleId: string;
  nextServiceDate: string;
  recommendedMileage: number;
  serviceType: string;
  notificationEnabled: boolean;
  currentMileage?: number;
  status?: ReminderStatus;
  bookingId?: string;
  completedAt?: string;
  notes?: string;
}

export interface User {
  id: string;
  contactReference?: string;
  name: string;
  email: string;
  phone: string;
  deliveryAddresses: DeliveryAddress[];
  vehicles: Vehicle[];
  companyId: string;
  companyName: string;
  contactRole: string;
  preferredLanguage?: Language;
  permissions: {
    canViewAllVehicles: boolean;
    canCreateBooking: boolean;
    canCancelBooking: boolean;
    canRescheduleBooking: boolean;
    canViewRepairProgress: boolean;
    canOrderParts: boolean;
    canViewInvoices: boolean;
    canViewNotifications: boolean;
  };
}

export interface CustomerNotification {
  id: string;
  title: string;
  message: string;
  date: string;
  isRead: boolean;
  type: 'reminder' | 'booking' | 'work_order' | 'parts' | 'invoice' | 'system' | 'status_rollback';
  relatedRecordType?: string;
  relatedRecordId?: string;
  actionRoute?: string;
}

export type WorkOrderStatus =
  | 'scheduled'
  | 'checked_in'
  | 'inspected'
  | 'quotation_issued'
  | 'approved'
  | 'waiting_for_parts'
  | 'parts_ready'
  | 'under_repair'
  | 'ready_for_collection'
  | 'collected';

export interface QuotationItem {
  id: number;
  type: 'part' | 'labour' | 'other';
  serviceTypeId?: number;
  code: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface WorkOrderQuotation {
  id: number;
  workOrderId: number;
  quotationNo: string;
  revision: number;
  status: 'issued' | 'approved' | 'rejected';
  validUntil?: string;
  subtotal: number;
  discount: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  notes: string;
  terms: string;
  customerResponseNote: string;
  createdAt: string;
  updatedAt: string;
  issuedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  items: QuotationItem[];
}

export interface WorkOrder {
  id: string;
  workOrderNumber: string;
  companyId: string;
  vehicleId: string;
  bookingId?: string;
  status: WorkOrderStatus;
  checkedInAt?: string;
  expectedCompletionAt?: string;
  latestCustomerUpdate?: string;
  customerVisibleItems?: string[];
  workshopPhone?: string;
  workshopName?: string;
  assignedAdvisor?: string;
  serviceType?: string;
  intakeType?: string;
  requestChannel?: string;
  serviceCentre?: string;
  reportedProblem?: string;
  customerNotes?: string;
  diagnosis?: string;
  estimatedTotal?: number;
  quotation?: WorkOrderQuotation;
  timeline?: TimelineEvent[];
  photos?: WorkOrderPhoto[];
}

export interface WorkOrderPhoto {
  id: number;
  workOrderId: number;
  category: 'check_in' | 'inspection' | 'repair' | 'parts' | 'completion';
  caption: string;
  originalName: string;
  mimeType: string;
  byteSize: number;
  uploadedBy: string;
  customerVisible: boolean;
  takenAt?: string;
  createdAt?: string;
}

export interface SupportSettings {
  phone: string;
  whatsapp: string;
  email: string;
  operatingHours: string;
  company?: {
    legalName?: string;
    address?: string;
    phone?: string;
  };
}

export interface CustomerData {
  user: User;
  contacts: CustomerContact[];
  bookings: Booking[];
  parts: SparePart[];
  reminders: ServiceReminder[];
  notifications: CustomerNotification[];
  workOrders: WorkOrder[];
  systemSettings?: {
    company: {
      legalName: string;
      registrationNo: string;
      groupName: string;
      address: string;
      phone: string;
      email: string;
      operatingHours: string;
    };
    support?: SupportSettings;
    pricing: { taxRate: number; laborRate: number; partsMarkup: number; automaticRounding: boolean };
    serviceTypes: Array<{ id: number; name: string; description: string; basePrice: number; enabled: boolean; sortOrder: number }>;
  };
  serviceCentres: ServiceCentre[];
  notificationPreferences: NotificationPreferences;
}

export interface DeliveryAddress {
  id: string;
  address: string;
  contactName: string;
  contactPhone: string;
  isDefault?: boolean;
}

export type Language = 'en' | 'bm' | 'zh';

export interface CustomerContact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  role: string;
  isDefault?: boolean;
}

export interface TimelineEvent {
  id: string;
  label: string;
  description?: string;
  date: string;
  completed: boolean;
}

export interface NotificationPreferences {
  bookingUpdates: boolean;
  repairUpdates: boolean;
  serviceReminders: boolean;
  partsOrders: boolean;
  invoiceUpdates: boolean;
  email: boolean;
  push: boolean;
}

export interface ServiceCentre {
  id: string;
  name: string;
  address: string;
  phone: string;
}
