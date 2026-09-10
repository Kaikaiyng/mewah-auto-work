import { RouterProvider } from 'react-router';
import { router } from './routes';
import { useEffect } from 'react';
import { LanguageProvider } from './contexts/language-context';
import { ConfirmationDialogProvider } from './contexts/confirmation-dialog-context';
import { Toaster } from './components/ui/sonner';

// App component with LanguageProvider wrapper
export default function App() {
  useEffect(() => {
    // Suppress Recharts duplicate key warning (known library limitation)
    const originalError = console.error;
    console.error = (...args: any[]) => {
      if (
        typeof args[0] === 'string' &&
        args[0].includes('Encountered two children with the same key')
      ) {
        return;
      }
      originalError.call(console, ...args);
    };

    return () => {
      console.error = originalError;
    };
  }, []);

  return (
    <LanguageProvider>
      <ConfirmationDialogProvider>
        <RouterProvider router={router} />
        <Toaster position="top-right" richColors />
      </ConfirmationDialogProvider>
    </LanguageProvider>
  );
}
