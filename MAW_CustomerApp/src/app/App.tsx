import { RouterProvider } from 'react-router';
import { router } from './routes.tsx';
import { LanguageProvider } from './context/LanguageContext';
import { BookingProvider } from './context/BookingContext';
import { CartProvider } from './context/CartContext';
import { Toaster } from './components/ui/sonner';
import { CustomerDataProvider } from './context/CustomerDataContext';
import { ConfirmationDialogProvider } from './context/ConfirmationDialogContext';
import { useEffect } from 'react';

export default function App() {
  useEffect(() => {
    document.getElementById('maw-boot-splash')?.remove();
  }, []);

  return (
    <LanguageProvider>
      <BookingProvider>
        <CartProvider>
          <CustomerDataProvider>
            <ConfirmationDialogProvider>
              <div className="maw-customer-ui">
                <RouterProvider router={router} />
              </div>
            </ConfirmationDialogProvider>
          </CustomerDataProvider>
          <Toaster position="top-center" />
        </CartProvider>
      </BookingProvider>
    </LanguageProvider>
  );
}
