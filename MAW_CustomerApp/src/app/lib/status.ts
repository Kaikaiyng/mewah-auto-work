import type { BookingStatus, PartsOrderStatus, WorkOrderStatus } from '../types';

const bookingLabels: Record<BookingStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  converted: 'Converted',
  cancelled: 'Cancelled',
  no_show: 'No Show',
  completed: 'Completed',
};

const orderLabels: Record<PartsOrderStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready for Collection',
  shipped: 'Shipped',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const workOrderLabels: Record<WorkOrderStatus, string> = {
  scheduled: 'Booking Confirmed',
  checked_in: 'Vehicle Checked In',
  inspected: 'Inspection Completed',
  quotation_issued: 'Quotation Issued',
  approved: 'Repair Approved',
  waiting_for_parts: 'Waiting for Parts',
  parts_ready: 'Parts Ready',
  under_repair: 'Under Repair',
  ready_for_collection: 'Ready for Collection',
  collected: 'Completed / Collected',
};

const workOrderStatusColors: Record<WorkOrderStatus, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  checked_in: 'bg-indigo-100 text-indigo-700',
  inspected: 'bg-purple-100 text-purple-700',
  quotation_issued: 'bg-cyan-100 text-cyan-700',
  approved: 'bg-pink-100 text-pink-700',
  waiting_for_parts: 'bg-amber-100 text-amber-800',
  parts_ready: 'bg-amber-100 text-amber-800',
  under_repair: 'bg-blue-100 text-blue-700',
  ready_for_collection: 'bg-orange-100 text-orange-700',
  collected: 'bg-green-100 text-green-700',
};

const bookingStatusColors: Record<BookingStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-700',
  converted: 'bg-orange-100 text-orange-700',
  cancelled: 'bg-red-100 text-red-700',
  no_show: 'bg-red-100 text-red-700',
  completed: 'bg-green-100 text-green-700',
};

export function serviceStatusColorClass(status: string) {
  return workOrderStatusColors[status as WorkOrderStatus]
    || bookingStatusColors[status as BookingStatus]
    || 'bg-gray-100 text-gray-700';
}

export function bookingStatusLabel(status: string, orderType: 'service' | 'parts') {
  if (orderType === 'parts') return orderLabels[status as PartsOrderStatus] || status;
  return bookingLabels[status as BookingStatus] || status;
}
