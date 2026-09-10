import type { Booking, DeliveryAddress, NotificationPreferences, User } from '../types';
import {
  cancelCustomerBooking,
  createCustomerBooking,
  createCustomerVehicle,
  createCustomerPartsOrder,
  getCustomerData,
  markNotificationsRead,
  saveCustomerDeliveryAddress,
  deleteCustomerDeliveryAddress,
  updateCustomerNotificationPreferences,
  updateCustomerProfile,
  uploadCustomerVehicleDocument,
  VehicleCreatedDocumentUploadError,
} from '../lib/api';
import type { CreateBookingInput, CreatePartsOrderInput, CreateVehicleInput, CustomerService } from './customer-service';

const unsupported = () => Promise.reject(new Error('This action is not available from the live API yet.'));

export class ApiCustomerService implements CustomerService {
  getCustomerData = getCustomerData;
  async createVehicle(input: CreateVehicleInput) {
    const created = await createCustomerVehicle(input);
    const uploads: Array<ReturnType<typeof uploadCustomerVehicleDocument>> = [];
    if (input.insuranceDocument && input.insuranceExpiry) {
      uploads.push(uploadCustomerVehicleDocument({ vehicleId: created.id, documentType: 'insurance', expiryDate: input.insuranceExpiry, document: input.insuranceDocument }));
    }
    if (input.roadTaxDocument && input.roadTaxExpiry) {
      uploads.push(uploadCustomerVehicleDocument({ vehicleId: created.id, documentType: 'road_tax', expiryDate: input.roadTaxExpiry, document: input.roadTaxDocument }));
    }
    if (input.puspakomDocument && input.puspakomExpiry) {
      uploads.push(uploadCustomerVehicleDocument({ vehicleId: created.id, documentType: 'puspakom', expiryDate: input.puspakomExpiry, document: input.puspakomDocument }));
    }
    try {
      await Promise.all(uploads);
    } catch (caught) {
      throw new VehicleCreatedDocumentUploadError(
        created.id,
        caught instanceof Error ? caught.message : 'Unknown upload error',
      );
    }
    return getCustomerData();
  }
  async createBooking(input: CreateBookingInput) {
    await createCustomerBooking(input);
    return getCustomerData();
  }
  async createPartsOrder(input: CreatePartsOrderInput) {
    await createCustomerPartsOrder(input);
    return getCustomerData();
  }
  async markAllNotificationsRead() {
    await markNotificationsRead();
    return getCustomerData();
  }
  async markNotificationRead(id: string) {
    await markNotificationsRead(id);
    return getCustomerData();
  }
  async updateProfile(input: Pick<User, 'name' | 'email' | 'phone'>) {
    await updateCustomerProfile(input);
    return getCustomerData();
  }
  updateBooking(_id: string, _input: Partial<Booking>) { return unsupported(); }
  async cancelBooking(id: string) {
    await cancelCustomerBooking(id);
    return getCustomerData();
  }
  confirmBooking(_id: string) { return unsupported(); }
  convertBooking(_id: string) { return unsupported(); }
  async saveAddress(address: DeliveryAddress) {
    await saveCustomerDeliveryAddress(address);
    return getCustomerData();
  }
  async deleteAddress(id: string) {
    await deleteCustomerDeliveryAddress(id);
    return getCustomerData();
  }
  async updateNotificationPreferences(input: NotificationPreferences) {
    await updateCustomerNotificationPreferences(input);
    return getCustomerData();
  }
}
