import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Trash2, HelpCircle, Info } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";

type ConfirmationTone = "danger" | "warning" | "success" | "primary" | "info";

type ConfirmationOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmationTone;
};

type Confirm = (options: ConfirmationOptions) => Promise<boolean>;

const ConfirmationDialogContext = createContext<Confirm | null>(null);

const toneStyles: Record<ConfirmationTone, { icon: typeof Trash2; iconClass: string; iconBackground: string; button: string }> = {
  danger: {
    icon: Trash2,
    iconClass: "text-red-600",
    iconBackground: "bg-red-50",
    button: "bg-red-600 hover:bg-red-700 focus-visible:ring-red-500",
  },
  warning: {
    icon: AlertTriangle,
    iconClass: "text-amber-600",
    iconBackground: "bg-amber-50",
    button: "bg-amber-600 hover:bg-amber-700 focus-visible:ring-amber-500",
  },
  success: {
    icon: CheckCircle2,
    iconClass: "text-emerald-600",
    iconBackground: "bg-emerald-50",
    button: "bg-emerald-600 hover:bg-emerald-700 focus-visible:ring-emerald-500",
  },
  primary: {
    icon: HelpCircle,
    iconClass: "text-blue-600",
    iconBackground: "bg-blue-50",
    button: "bg-[#1e3a8a] hover:bg-blue-800 focus-visible:ring-blue-500",
  },
  info: {
    icon: Info,
    iconClass: "text-blue-600",
    iconBackground: "bg-blue-50",
    button: "bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-500",
  },
};

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

  const tone = options?.tone ?? "primary";
  const style = toneStyles[tone] || toneStyles.primary || toneStyles.danger;
  const Icon = style.icon;

  return (
    <ConfirmationDialogContext.Provider value={confirm}>
      {children}
      <AlertDialog open={options !== null} onOpenChange={(open) => { if (!open) settle(false); }}>
        <AlertDialogContent className="max-w-md overflow-hidden rounded-2xl border-0 bg-white p-0 shadow-2xl">
          <div className="px-7 pb-6 pt-7">
            <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-xl ${style.iconBackground}`}>
              <Icon className={`h-6 w-6 ${style.iconClass}`} />
            </div>
            <AlertDialogHeader className="gap-2 text-left">
              <AlertDialogTitle className="text-xl font-bold text-gray-900">
                {options?.title}
              </AlertDialogTitle>
              <AlertDialogDescription className="whitespace-pre-line text-sm leading-6 text-gray-500">
                {options?.description}
              </AlertDialogDescription>
            </AlertDialogHeader>
          </div>
          <AlertDialogFooter className="border-t border-gray-100 bg-gray-50 px-7 py-4">
            <AlertDialogCancel
              className="h-10 rounded-lg border-gray-200 bg-white px-5 font-semibold text-gray-700"
              onClick={() => settle(false)}
            >
              {options?.cancelLabel ?? "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              className={`h-10 rounded-lg px-5 font-semibold text-white focus-visible:ring-2 focus-visible:ring-offset-2 ${style.button}`}
              onClick={() => settle(true)}
            >
              {options?.confirmLabel ?? "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmationDialogContext.Provider>
  );
}

export function useConfirmationDialog() {
  const confirm = useContext(ConfirmationDialogContext);
  if (!confirm) throw new Error("useConfirmationDialog must be used within ConfirmationDialogProvider");
  return confirm;
}
