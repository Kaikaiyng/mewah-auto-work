import {
  mockBookings,
  mockContacts,
  mockNotificationPreferences,
  mockNotifications,
  mockReminders,
  mockSpareParts,
  mockSuperadminContacts,
  mockSuperadminUser,
  serviceCentres,
  mockUser,
  mockWorkOrders,
} from '../data/mockData';
import type { Booking, CustomerData, CustomerNotification, DeliveryAddress, NotificationPreferences, User } from '../types';
import { getLocalCustomerAccount, type LocalCustomerAccountId } from '../lib/local-customer-session';
import type { CreateBookingInput, CreatePartsOrderInput, CreateVehicleInput, CustomerService } from './customer-service';

const clone = <T,>(value: T): T => structuredClone(value);
const now = () => new Date().toISOString();
let sequence = 100;

const ahmadState: CustomerData = {
  user: clone(mockUser),
  contacts: clone(mockContacts),
  bookings: clone(mockBookings),
  parts: clone(mockSpareParts),
  reminders: clone(mockReminders),
  notifications: clone(mockNotifications),
  workOrders: clone(mockWorkOrders),
  serviceCentres: clone(serviceCentres),
  notificationPreferences: clone(mockNotificationPreferences),
};

const superadminState: CustomerData = {
  user: clone(mockSuperadminUser),
  contacts: clone(mockSuperadminContacts),
  bookings: [],
  parts: clone(mockSpareParts),
  reminders: [],
  notifications: [],
  workOrders: [],
  serviceCentres: clone(serviceCentres),
  notificationPreferences: clone(mockNotificationPreferences),
};

const accountStates: Record<LocalCustomerAccountId, CustomerData> = {
  ahmad: ahmadState,
  superadmin: superadminState,
};

let activeAccountId = getLocalCustomerAccount();
let state = accountStates[activeAccountId];

function syncActiveAccount() {
  const requestedAccountId = getLocalCustomerAccount();
  if (requestedAccountId !== activeAccountId) {
    accountStates[activeAccountId] = state;
    activeAccountId = requestedAccountId;
    state = accountStates[activeAccountId];
  }
}

function notification(input: Omit<CustomerNotification, 'id' | 'date' | 'isRead'>): CustomerNotification {
  return { ...input, id: `n-local-${++sequence}`, date: now(), isRead: false };
}

function snapshot() {
  syncActiveAccount();
  return clone(state);
}

function replaceBooking(id: string, update: Partial<Booking>) {
  state.bookings = state.bookings.map((booking) =>
    booking.id === id ? { ...booking, ...update, updatedAt: now() } : booking,
  );
}

export class LocalCustomerService implements CustomerService {
  async getCustomerData() {
    return snapshot();
  }

  async createVehicle(input: CreateVehicleInput) {
    syncActiveAccount();
    const vehicle = { ...input };
    delete vehicle.insuranceDocument;
    delete vehicle.roadTaxDocument;
    delete vehicle.puspakomDocument;
    state.user.vehicles = [{
      ...vehicle,
      id: `v-local-${++sequence}`,
      companyId: state.user.companyId,
      vecNo: '',
      status: 'Good',
      verificationStatus: 'pending',
      createdSource: 'customer_app',
    }, ...state.user.vehicles];
    return snapshot();
  }

  async createBooking(input: CreateBookingInput) {
    syncActiveAccount();
    const id = `b-local-${++sequence}`;
    const booking: Booking = {
      id,
      bookingNumber: `BK-LOCAL-${sequence}`,
      orderType: 'service',
      status: 'pending',
      totalPrice: 0,
      createdAt: now(),
      updatedAt: now(),
      timeline: [{ id: `${id}-submitted`, label: 'Booking submitted', date: now(), completed: true }],
      ...input,
    };
    state.bookings = [booking, ...state.bookings];
    if (input.reminderId) {
      state.reminders = state.reminders.map((item) =>
        item.id === input.reminderId ? { ...item, status: 'booked', bookingId: id } : item,
      );
    }
    state.notifications = [
      notification({
        title: 'Booking submitted',
        message: `${booking.bookingNumber} has been submitted to the workshop for confirmation.`,
        type: 'booking',
        relatedRecordType: 'booking',
        relatedRecordId: id,
        actionRoute: `/booking/${id}`,
      }),
      ...state.notifications,
    ];
    return snapshot();
  }

  async updateBooking(id: string, input: Partial<Booking>) {
    syncActiveAccount();
    replaceBooking(id, input);
    state.notifications = [
      notification({
        title: 'Booking rescheduled',
        message: `${state.bookings.find((item) => item.id === id)?.bookingNumber} has been updated.`,
        type: 'booking',
        relatedRecordType: 'booking',
        relatedRecordId: id,
        actionRoute: `/booking/${id}`,
      }),
      ...state.notifications,
    ];
    return snapshot();
  }

  async cancelBooking(id: string) {
    syncActiveAccount();
    replaceBooking(id, { status: 'cancelled' });
    state.notifications = [
      notification({
        title: 'Booking cancelled',
        message: `${state.bookings.find((item) => item.id === id)?.bookingNumber} was cancelled.`,
        type: 'booking',
        relatedRecordType: 'booking',
        relatedRecordId: id,
        actionRoute: `/booking/${id}`,
      }),
      ...state.notifications,
    ];
    return snapshot();
  }

  async confirmBooking(id: string) {
    syncActiveAccount();
    replaceBooking(id, { status: 'confirmed' });
    return snapshot();
  }

  async convertBooking(id: string) {
    syncActiveAccount();
    const booking = state.bookings.find((item) => item.id === id);
    if (!booking?.vehicleId) return snapshot();
    const workOrderId = `wo-local-${++sequence}`;
    replaceBooking(id, { status: 'converted', workOrderId, workOrderNumber: `WO-LOCAL-${sequence}` });
    state.workOrders = [{
      id: workOrderId,
      workOrderNumber: `WO-LOCAL-${sequence}`,
      companyId: state.user.companyId,
      vehicleId: booking.vehicleId,
      bookingId: id,
      status: 'checked_in',
      checkedInAt: now(),
      expectedCompletionAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      latestCustomerUpdate: 'Vehicle checked in. Initial inspection is next.',
      workshopName: booking.serviceCentre,
      workshopPhone: '+60 00-000 0000',
      reportedProblem: booking.reportedProblem,
      customerVisibleItems: ['Initial inspection'],
      timeline: [{ id: `${workOrderId}-checkin`, label: 'Checked in', date: now(), completed: true }],
    }, ...state.workOrders];
    return snapshot();
  }

  async createPartsOrder(input: CreatePartsOrderInput) {
    syncActiveAccount();
    const id = `p-local-${++sequence}`;
    const order: Booking = {
      id,
      bookingNumber: `ORD-LOCAL-${sequence}`,
      orderType: 'parts',
      status: 'pending',
      serviceDate: now(),
      createdAt: now(),
      updatedAt: now(),
      timeline: [{ id: `${id}-placed`, label: 'Order placed', date: now(), completed: true }],
      ...input,
    };
    state.bookings = [order, ...state.bookings];
    state.notifications = [
      notification({
        title: 'Parts order received',
        message: `${order.bookingNumber} has been placed successfully.`,
        type: 'parts',
        relatedRecordType: 'parts_order',
        relatedRecordId: id,
        actionRoute: `/parts-order/${id}`,
      }),
      ...state.notifications,
    ];
    return snapshot();
  }

  async markNotificationRead(id: string) {
    syncActiveAccount();
    state.notifications = state.notifications.map((item) => item.id === id ? { ...item, isRead: true } : item);
    return snapshot();
  }

  async markAllNotificationsRead() {
    syncActiveAccount();
    state.notifications = state.notifications.map((item) => ({ ...item, isRead: true }));
    return snapshot();
  }

  async updateProfile(input: Pick<User, 'name' | 'email' | 'phone'>) {
    syncActiveAccount();
    const oldName = state.user.name;
    const oldPhone = state.user.phone;
    const nameChanged = input.name !== oldName;
    const phoneChanged = input.phone !== oldPhone;

    state.user = { ...state.user, ...input };
    state.contacts = state.contacts.map((contact) =>
      contact.isDefault ? { ...contact, name: input.name, email: input.email, phone: input.phone } : contact,
    );

    if (nameChanged || phoneChanged) {
      const changeDetails: string[] = [];
      if (nameChanged) changeDetails.push(`Name changed from "${oldName}" to "${input.name}"`);
      if (phoneChanged) changeDetails.push(`Phone changed from "${oldPhone}" to "${input.phone}"`);
      state.notifications.unshift({
        id: `n-${Date.now()}`,
        title: `Customer Contact Updated: ${input.name}`,
        message: `User ${oldName} (${state.user.companyName}) updated contact details: ${changeDetails.join('; ')}.`,
        date: new Date().toISOString(),
        isRead: false,
        type: 'system',
        relatedRecordType: 'customer',
        relatedRecordId: state.user.id,
        actionRoute: '/customers',
      });
    }

    return snapshot();
  }

  async saveAddress(address: DeliveryAddress) {
    syncActiveAccount();
    const normalized = address.isDefault
      ? state.user.deliveryAddresses.map((item) => ({ ...item, isDefault: false }))
      : state.user.deliveryAddresses;
    const exists = normalized.some((item) => item.id === address.id);
    state.user = {
      ...state.user,
      deliveryAddresses: exists
        ? normalized.map((item) => item.id === address.id ? address : item)
        : [...normalized, address],
    };
    return snapshot();
  }

  async deleteAddress(id: string) {
    syncActiveAccount();
    state.user = { ...state.user, deliveryAddresses: state.user.deliveryAddresses.filter((item) => item.id !== id) };
    return snapshot();
  }

  async updateNotificationPreferences(input: NotificationPreferences) {
    syncActiveAccount();
    state.notificationPreferences = clone(input);
    return snapshot();
  }
}
