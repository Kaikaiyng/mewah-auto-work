import type {
  Booking,
  CustomerData,
  DeliveryAddress,
  NotificationPreferences,
  User,
  Vehicle,
  VehicleStatus,
} from '../types';

export type CreateBookingInput = Pick<
  Booking,
  | 'vehicleId'
  | 'serviceType'
  | 'serviceDate'
  | 'serviceCentre'
  | 'timeSlot'
  | 'notes'
  | 'reportedProblem'
  | 'mileage'
  | 'contactId'
  | 'contactName'
  | 'reminderId'
>;

export type CreatePartsOrderInput = Pick<
  Booking,
  'deliveryAddress' | 'serviceCentre' | 'notes' | 'totalPrice' | 'items' | 'fulfilmentMethod'
>;

export type CreateVehicleInput = Omit<
  Vehicle,
  'id' | 'companyId' | 'vecNo' | 'status' | 'lastServiceDate' | 'lastServiceMileage' | 'nextServiceDate' | 'nextServiceMileage'
> & {
  vehicleStatus: VehicleStatus;
  insuranceDocument?: File;
  roadTaxDocument?: File;
  puspakomDocument?: File;
};

export interface CustomerService {
  getCustomerData(): Promise<CustomerData>;
  createVehicle(input: CreateVehicleInput): Promise<CustomerData>;
  createBooking(input: CreateBookingInput): Promise<CustomerData>;
  updateBooking(id: string, input: Partial<Booking>): Promise<CustomerData>;
  cancelBooking(id: string): Promise<CustomerData>;
  confirmBooking(id: string): Promise<CustomerData>;
  convertBooking(id: string): Promise<CustomerData>;
  createPartsOrder(input: CreatePartsOrderInput): Promise<CustomerData>;
  markNotificationRead(id: string): Promise<CustomerData>;
  markAllNotificationsRead(): Promise<CustomerData>;
  updateProfile(input: Pick<User, 'name' | 'email' | 'phone'>): Promise<CustomerData>;
  saveAddress(address: DeliveryAddress): Promise<CustomerData>;
  deleteAddress(id: string): Promise<CustomerData>;
  updateNotificationPreferences(input: NotificationPreferences): Promise<CustomerData>;
}
