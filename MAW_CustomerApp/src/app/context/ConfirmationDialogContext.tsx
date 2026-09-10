import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';

type ConfirmationOptions = {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
};

type Confirm = (options: ConfirmationOptions) => Promise<boolean>;

const ConfirmationDialogContext = createContext<Confirm | null>(null);

export function ConfirmationDialogProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmationOptions | null>(null);
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null);

  const confirm = useCallback<Confirm>((nextOptions) => {
    resolverRef.current?.(false);
    setOptions(nextOptions);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = (confirmed: boolean) => {
    resolverRef.current?.(confirmed);
    resolverRef.current = null;
    setOptions(null);
  };

  return (
    <ConfirmationDialogContext.Provider value={confirm}>
      {children}
      <AlertDialog open={options !== null} onOpenChange={(open) => { if (!open) settle(false); }}>
        <AlertDialogContent className="w-[calc(100%-2.5rem)] max-w-sm overflow-hidden rounded-3xl border-0 bg-white p-0 shadow-2xl">
          <div className="px-6 pb-5 pt-7">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50">
              <AlertTriangle className="h-7 w-7 text-amber-600" />
            </div>
            <AlertDialogHeader className="gap-2 text-center sm:text-center">
              <AlertDialogTitle className="text-xl font-bold text-gray-900">
                {options?.title}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm leading-6 text-gray-500">
                {options?.description}
              </AlertDialogDescription>
            </AlertDialogHeader>
          </div>
          <AlertDialogFooter className="grid grid-cols-2 gap-3 border-t border-gray-100 bg-gray-50 p-4 sm:grid-cols-2">
            <AlertDialogCancel
              className="m-0 h-11 rounded-xl border-gray-200 bg-white font-semibold text-gray-700"
              onClick={() => settle(false)}
            >
              {options?.cancelLabel}
            </AlertDialogCancel>
            <AlertDialogAction
              className="h-11 rounded-xl bg-amber-600 font-semibold text-white hover:bg-amber-700 focus-visible:ring-amber-500"
              onClick={() => settle(true)}
            >
              {options?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmationDialogContext.Provider>
  );
}

export function useConfirmationDialog() {
  const confirm = useContext(ConfirmationDialogContext);
  if (!confirm) throw new Error('useConfirmationDialog must be used within ConfirmationDialogProvider');
  return confirm;
}
