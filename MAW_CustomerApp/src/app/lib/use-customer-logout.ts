import { useState } from 'react';
import { useNavigate } from 'react-router';
import { logoutCustomer } from './api';

export function useCustomerLogout() {
  const navigate = useNavigate();
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const logout = async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    try {
      await logoutCustomer();
    } catch {
      // The API helper still clears the local session in `finally`, so logout
      // remains effective if the server is temporarily unreachable.
    } finally {
      // Router navigation respects the staging basename and replaces the
      // authenticated page in browser history.
      navigate('/', { replace: true });
    }
  };

  return {
    isLogoutDialogOpen,
    isLoggingOut,
    openLogoutDialog: () => setIsLogoutDialogOpen(true),
    setLogoutDialogOpen: setIsLogoutDialogOpen,
    logout,
  };
}
