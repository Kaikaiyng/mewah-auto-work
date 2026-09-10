import { usesLocalRecords } from '../lib/api';
import { ApiCustomerService } from './api-customer-service';
import { LocalCustomerService } from './local-customer-service';
import type { CustomerService } from './customer-service';

const localCustomerService = new LocalCustomerService();
const apiCustomerService = new ApiCustomerService();

function activeCustomerService(): CustomerService {
  return usesLocalRecords
    ? localCustomerService
    : apiCustomerService;
}

export const customerService = new Proxy(apiCustomerService as CustomerService, {
  get(_target, property: keyof CustomerService) {
    const service = activeCustomerService();
    const value = service[property];
    return typeof value === 'function' ? value.bind(service) : value;
  },
});

export type { CreateBookingInput, CreatePartsOrderInput, CreateVehicleInput, CustomerService } from './customer-service';
