import {
  Children,
  isValidElement,
  useState,
  type ChangeEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from './drawer';
import { cn } from './utils';

type NativeOptionProps = {
  children?: ReactNode;
  disabled?: boolean;
  value?: string | number;
};

type MobileSelectProps = {
  ariaLabel?: string;
  children: ReactNode;
  className?: string;
  description?: string;
  disabled?: boolean;
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
  title: string;
  value: string | number;
};

function getOptionValue(option: ReactElement<NativeOptionProps>) {
  return String(option.props.value ?? option.props.children ?? '');
}

export function MobileSelect({
  ariaLabel,
  children,
  className,
  description = 'Choose one option',
  disabled,
  onChange,
  title,
  value,
}: MobileSelectProps) {
  const [open, setOpen] = useState(false);
  const options = Children.toArray(children).filter(
    (child): child is ReactElement<NativeOptionProps> => isValidElement(child) && child.type === 'option',
  );
  const selectedOption = options.find((option) => getOptionValue(option) === String(value));

  const chooseOption = (nextValue: string) => {
    onChange?.({
      target: { value: nextValue },
      currentTarget: { value: nextValue },
    } as ChangeEvent<HTMLSelectElement>);
    setOpen(false);
  };

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel || title}
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'flex h-12 w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 text-left text-sm text-gray-900 transition-colors active:border-[#2563eb] disabled:bg-gray-50 disabled:text-gray-400 disabled:opacity-70',
            className,
          )}
        >
          <span className="truncate">{selectedOption?.props.children}</span>
          <ChevronDown className="size-5 shrink-0 text-gray-400" />
        </button>
      </DrawerTrigger>
      <DrawerContent className="mx-auto max-h-[88vh] w-full max-w-md rounded-t-[28px] border-slate-200 bg-white shadow-2xl">
        <DrawerHeader className="relative border-b border-slate-200 px-5 pb-4 pt-3 text-left">
          <div className="flex items-center gap-3 pr-10">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#2563eb]">
              <ChevronDown className="size-5" />
            </div>
            <div>
              <DrawerTitle className="text-lg font-semibold text-slate-900">{title}</DrawerTitle>
              <DrawerDescription className="text-sm text-slate-500">{description}</DrawerDescription>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="absolute right-5 top-3 flex size-10 items-center justify-center rounded-full text-gray-400 active:bg-gray-100"
          >
            <X className="size-5" />
          </button>
        </DrawerHeader>
        <div className="overflow-y-auto bg-slate-50 px-4 py-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {options.map((option) => {
            const optionValue = getOptionValue(option);
            const selected = optionValue === String(value);

            return (
              <button
                key={optionValue}
                type="button"
                disabled={option.props.disabled}
                onClick={() => chooseOption(optionValue)}
                className={cn(
                  'mb-2 flex min-h-12 w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-gray-700 shadow-sm active:bg-blue-50 disabled:opacity-40',
                  selected && 'bg-blue-50 font-semibold text-[#2563eb]',
                )}
              >
                <Check className={cn('size-5 shrink-0', selected ? 'opacity-100' : 'opacity-0')} />
                <span>{option.props.children}</span>
              </button>
            );
          })}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
