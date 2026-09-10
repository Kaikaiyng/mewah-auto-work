import React, { createContext, useContext, useState, ReactNode } from 'react';

interface BookingData {
  vehicleId?: string;
  serviceType?: string;
  serviceCentre?: string;
  serviceDate?: string;
  serviceTime?: string;
  notes?: string;
  reportedProblem?: string;
  mileage?: number;
  contactId?: string;
  contactName?: string;
  reminderId?: string;
  editingBookingId?: string;
  returnTo?: string;
}

interface BookingContextType {
  bookingData: BookingData;
  updateBookingData: (data: Partial<BookingData>) => void;
  clearBookingData: () => void;
}

const BookingContext = createContext<BookingContextType | undefined>(undefined);

export function BookingProvider({ children }: { children: ReactNode }) {
  const [bookingData, setBookingData] = useState<BookingData>({});

  const updateBookingData = (data: Partial<BookingData>) => {
    setBookingData((prev) => ({ ...prev, ...data }));
  };

  const clearBookingData = () => {
    setBookingData({});
  };

  return (
    <BookingContext.Provider value={{ bookingData, updateBookingData, clearBookingData }}>
      {children}
    </BookingContext.Provider>
  );
}

export function useBooking() {
  const context = useContext(BookingContext);
  if (context === undefined) {
    throw new Error('useBooking must be used within a BookingProvider');
  }
  return context;
}
