import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import type { Booking, CustomerData, DeliveryAddress, NotificationPreferences, User } from '../types';
import { customerService, type CreateBookingInput, type CreatePartsOrderInput, type CreateVehicleInput } from '../services';
import { hasCustomerSession } from '../lib/api';

type CustomerDataContextValue = {
  data: CustomerData | null;
  isLoading: boolean;
  isRefreshing: boolean;
  lastUpdatedAt: number | null;
  error: string;
  reload: (options?: { silent?: boolean; manual?: boolean }) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  createVehicle: (input: CreateVehicleInput) => Promise<void>;
  createBooking: (input: CreateBookingInput) => Promise<Booking>;
  createPartsOrder: (input: CreatePartsOrderInput) => Promise<Booking>;
  updateBooking: (id: string, input: Partial<Booking>) => Promise<void>;
  cancelBooking: (id: string) => Promise<void>;
  confirmBooking: (id: string) => Promise<void>;
  convertBooking: (id: string) => Promise<void>;
  updateProfile: (input: Pick<User, 'name' | 'email' | 'phone'>) => Promise<void>;
  saveAddress: (address: DeliveryAddress) => Promise<void>;
  deleteAddress: (id: string) => Promise<void>;
  updateNotificationPreferences: (input: NotificationPreferences) => Promise<void>;
};

const CustomerDataContext = createContext<CustomerDataContextValue | null>(null);

export function CustomerDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<CustomerData | null>(null);
  const [isLoading, setIsLoading] = useState(hasCustomerSession());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [error, setError] = useState('');
  const reloadPromiseRef = useRef<Promise<void> | null>(null);
  const knownNotificationIdsRef = useRef<Set<string>>(new Set());
  const notificationsInitializedRef = useRef(false);

  const reload = useCallback(async ({ silent = false, manual = false }: { silent?: boolean; manual?: boolean } = {}) => {
    if (reloadPromiseRef.current) return reloadPromiseRef.current;
    if (!hasCustomerSession()) {
      setData(null);
      setError('');
      setIsLoading(false);
      setIsRefreshing(false);
      knownNotificationIdsRef.current.clear();
      notificationsInitializedRef.current = false;
      return;
    }
    if (manual) {
      setIsRefreshing(true);
    } else if (!silent) {
      setIsLoading(true);
      setError('');
    }
    const operation = (async () => {
      const startTime = Date.now();
      try {
        const nextData = await customerService.getCustomerData();
        const nextNotificationIds = new Set(nextData.notifications.map((notification) => notification.id));
        if (notificationsInitializedRef.current && nextData.notificationPreferences.push) {
          const rescheduleNotification = nextData.notifications.find(
            (notification) =>
              !notification.isRead &&
              notification.title === 'Booking time changed' &&
              !knownNotificationIdsRef.current.has(notification.id),
          );
          if (rescheduleNotification) {
            toast.info(rescheduleNotification.title, {
              description: rescheduleNotification.message,
              duration: 10_000,
            });
          }
        }
        knownNotificationIdsRef.current = nextNotificationIds;
        notificationsInitializedRef.current = true;
        setData(nextData);
        setError('');
        setLastUpdatedAt(Date.now());
      } catch (caught) {
        if (!silent && !manual) {
          setData(null);
          setError(caught instanceof Error ? caught.message : 'Unable to load customer data');
        }
      } finally {
        if (manual) {
          const elapsed = Date.now() - startTime;
          const minDuration = 1500; // 1.5 seconds for manual refresh animation
          if (elapsed < minDuration) {
            await new Promise((resolve) => setTimeout(resolve, minDuration - elapsed));
          }
        }
        setIsLoading(false);
        setIsRefreshing(false);
        reloadPromiseRef.current = null;
      }
    })();
    reloadPromiseRef.current = operation;
    return operation;
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    const refreshIfAllowed = () => {
      const focusedElement = document.activeElement;
      const isEditing = focusedElement instanceof HTMLElement && focusedElement.matches('input, textarea, select, [contenteditable="true"]');
      const hasPausedDialog = document.querySelector('[data-auto-refresh-pause="true"]');
      if (document.hidden || isEditing || hasPausedDialog || !hasCustomerSession()) return;
      void reload({ silent: true });
    };
    const onVisibilityChange = () => {
      if (!document.hidden) refreshIfAllowed();
    };
    window.addEventListener('focus', refreshIfAllowed);
    window.addEventListener('online', refreshIfAllowed);
    document.addEventListener('visibilitychange', onVisibilityChange);
    const intervalId = window.setInterval(refreshIfAllowed, 45_000);
    return () => {
      window.removeEventListener('focus', refreshIfAllowed);
      window.removeEventListener('online', refreshIfAllowed);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [reload]);

  const markAllNotificationsRead = async () => {
    setData(await customerService.markAllNotificationsRead());
  };

  const markNotificationRead = async (id: string) => {
    setData(await customerService.markNotificationRead(id));
  };

  const createBooking = async (input: CreateBookingInput) => {
    const existingBookingIds = new Set(data?.bookings.map((booking) => booking.id) ?? []);
    const next = await customerService.createBooking(input);
    setData(next);
    const booking =
      next.bookings.find(
        (item) => item.orderType === 'service' && !existingBookingIds.has(item.id),
      )
      ?? next.bookings.find((item) => item.orderType === 'service');
    if (!booking) throw new Error('Booking was created but could not be loaded.');
    return booking;
  };

  const createPartsOrder = async (input: CreatePartsOrderInput) => {
    const existingBookingIds = new Set(data?.bookings.map((booking) => booking.id) ?? []);
    const next = await customerService.createPartsOrder(input);
    setData(next);
    const order =
      next.bookings.find(
        (item) => item.orderType === 'parts' && !existingBookingIds.has(item.id),
      )
      ?? next.bookings.find((item) => item.orderType === 'parts');
    if (!order) throw new Error('Order was created but could not be loaded.');
    return order;
  };

  const commit = async (operation: Promise<CustomerData>) => setData(await operation);
  const createVehicle = (input: CreateVehicleInput) => commit(customerService.createVehicle(input));
  const updateBooking = (id: string, input: Partial<Booking>) => commit(customerService.updateBooking(id, input));
  const cancelBooking = (id: string) => commit(customerService.cancelBooking(id));
  const confirmBooking = (id: string) => commit(customerService.confirmBooking(id));
  const convertBooking = (id: string) => commit(customerService.convertBooking(id));
  const updateProfile = (input: Pick<User, 'name' | 'email' | 'phone'>) => commit(customerService.updateProfile(input));
  const saveAddress = (address: DeliveryAddress) => commit(customerService.saveAddress(address));
  const deleteAddress = (id: string) => commit(customerService.deleteAddress(id));
  const updateNotificationPreferences = (input: NotificationPreferences) => commit(customerService.updateNotificationPreferences(input));

  const value = useMemo(() => ({
    data,
    isLoading,
    isRefreshing,
    lastUpdatedAt,
    error,
    reload,
    markAllNotificationsRead,
    markNotificationRead,
    createBooking,
    createVehicle,
    createPartsOrder,
    updateBooking,
    cancelBooking,
    confirmBooking,
    convertBooking,
    updateProfile,
    saveAddress,
    deleteAddress,
    updateNotificationPreferences,
  }), [data, isLoading, isRefreshing, lastUpdatedAt, error, reload]);

  return <CustomerDataContext.Provider value={value}>{children}</CustomerDataContext.Provider>;
}

export function useCustomerData() {
  const context = useContext(CustomerDataContext);
  if (!context) throw new Error('useCustomerData must be used within CustomerDataProvider');
  return context;
}
