import React from 'react';
import { createBrowserRouter, Navigate, Outlet } from 'react-router';
import { LoginScreen } from './screens/LoginScreen';
import { HomeScreen } from './screens/HomeScreen';
import { BookingsScreen } from './screens/BookingsScreen';
import { BookingDetailScreen } from './screens/BookingDetailScreen';
import { PartsScreen } from './screens/PartsScreen';
import { PartsOrderDetailScreen } from './screens/PartsOrderDetailScreen';
import { RemindersScreen } from './screens/RemindersScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { InvoicesScreen } from './screens/InvoicesScreen';
import { InvoiceDetailScreen } from './screens/InvoiceDetailScreen';
import { CartScreen } from './screens/CartScreen';
import { CartCheckoutScreen } from './screens/CartCheckoutScreen';
import { BookingFlowLayout } from './screens/BookingFlowLayout';
import { BookingSelectVehicle } from './screens/BookingSelectVehicle';
import { BookingStep1 } from './screens/BookingStep1';
import { BookingStep2 } from './screens/BookingStep2';
import { BookingStep3 } from './screens/BookingStep3';
import { BookingStep4 } from './screens/BookingStep4';
import { BookingStep5 } from './screens/BookingStep5';
import { SupportScreen } from './screens/SupportScreen';
import { AddVehicleScreen } from './screens/AddVehicleScreen';
import { PersonalInfoScreen } from './screens/PersonalInfoScreen';
import { DeliveryAddressesScreen } from './screens/DeliveryAddressesScreen';
import { RegisteredVehiclesScreen } from './screens/RegisteredVehiclesScreen';
import { VehicleDetailsScreen } from './screens/VehicleDetailsScreen';
import { VehicleHistoryScreen } from './screens/VehicleHistoryScreen';
import { NotificationSettingsScreen } from './screens/NotificationSettingsScreen';
import { NotificationsScreen } from './screens/NotificationsScreen';
import { RepairProgressScreen } from './screens/RepairProgressScreen';
import { PartDetailScreen } from './screens/PartDetailScreen';
import { MobileLayout } from './components/MobileLayout';
import { hasCustomerSession } from './lib/api';
import { hasWorkshopSession } from './lib/workshop-api';
import { WorkshopJobsScreen } from './screens/WorkshopJobsScreen';
import { NativeBackButtonController } from './components/NativeBackButtonController';
function RequireCustomerSession() {
  return hasCustomerSession() ? <MobileLayout /> : <Navigate to="/" replace />;
}

function UnifiedLoginEntry() {
  if (hasWorkshopSession()) return <Navigate to="/workshop/jobs" replace />;
  if (hasCustomerSession()) return <Navigate to="/home" replace />;
  return <LoginScreen />;
}

export const router = createBrowserRouter([
  {
    element: <NativeBackButtonController />,
    children: [
      {
        path: '/workshop/login',
        element: <Navigate to="/" replace />,
      },
      {
        path: '/workshop/jobs',
        element: <WorkshopJobsScreen />,
      },
      {
        path: '/',
        element: <UnifiedLoginEntry />,
      },
      {
        element: <RequireCustomerSession />,
        children: [
          {
            path: '/home',
            element: null,
          },
          {
            path: '/fleet',
            element: null,
          },
          {
            path: '/bookings',
            element: null,
          },
          {
            path: '/booking/:id',
            element: <BookingDetailScreen />,
          },
          {
            path: '/parts',
            element: null,
          },
          {
            path: '/parts-order/:id',
            element: <PartsOrderDetailScreen />,
          },
          {
            path: '/part/:id',
            element: <PartDetailScreen />,
          },
          { path: '/vehicles', element: null },
          { path: '/reminders', element: null },
          { path: '/profile', element: null },
          { path: '/settings', element: <SettingsScreen /> },
          { path: '/invoices', element: <InvoicesScreen /> },
          { path: '/invoice/:id', element: <InvoiceDetailScreen /> },
          { path: '/cart', element: <CartScreen /> },
          { path: '/cart/checkout', element: <CartCheckoutScreen /> },
          {
            path: '/booking',
            element: <BookingFlowLayout />,
            children: [
              { path: 'select-vehicle', element: <BookingSelectVehicle /> },
              { path: 'step1', element: <BookingStep1 /> },
              { path: 'step2', element: <BookingStep2 /> },
              { path: 'step3', element: <BookingStep3 /> },
              { path: 'step4', element: <BookingStep4 /> },
              { path: 'step5', element: <BookingStep5 /> },
            ],
          },
          { path: '/support', element: <SupportScreen /> },
          { path: '/add-vehicle', element: <AddVehicleScreen /> },
          { path: '/personal-info', element: <PersonalInfoScreen /> },
          { path: '/delivery-addresses', element: <DeliveryAddressesScreen /> },
          { path: '/registered-vehicles', element: <Navigate to="/fleet" replace /> },
          { path: '/vehicle/:vehicleId', element: <VehicleDetailsScreen /> },
          { path: '/vehicle-history/:vehicleId', element: <VehicleHistoryScreen /> },
          { path: '/vehicle-invoices/:vehicleId', element: <InvoicesScreen /> },
          { path: '/notifications', element: <NotificationsScreen /> },
          { path: '/repair-progress/:id', element: <RepairProgressScreen /> },
          { path: '/notification-settings', element: <NotificationSettingsScreen /> },
        ],
      },
      { path: '/index.html', element: <Navigate to="/" replace /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
], {
  basename: import.meta.env.VITE_ROUTER_BASENAME || '/',
});
