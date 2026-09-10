import { useDeferredValue, useState } from 'react';
import { Check, ChevronsUpDown, Plus, Search, X } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from './drawer';
import { cn } from './utils';

type MobileComboboxProps = {
  ariaLabel: string;
  className?: string;
  customLabel?: string;
  description?: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  searchPlaceholder?: string;
  title: string;
  value: string;
};

export function MobileCombobox({
  ariaLabel,
  className,
  customLabel = 'Use custom value',
  description = 'Choose a suggestion or enter your own value',
  onChange,
  options,
  placeholder,
  searchPlaceholder = 'Search or enter a custom value...',
  title,
  value,
}: MobileComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim());
  const normalizedQuery = deferredQuery.toLocaleLowerCase();
  const filteredOptions = normalizedQuery
    ? options.filter((option) => option.toLocaleLowerCase().includes(normalizedQuery))
    : options;
  const hasExactMatch = options.some(
    (option) => option.toLocaleLowerCase() === normalizedQuery,
  );

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setQuery('');
    }
  };

  const chooseValue = (nextValue: string) => {
    onChange(nextValue);
    setQuery('');
    setOpen(false);
  };

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          className={cn(
            'flex h-12 w-full items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 text-left text-sm text-gray-900 transition-colors active:border-[#2563eb]',
            className,
          )}
        >
          <span className={cn('truncate', !value && 'text-gray-400')}>{value || placeholder}</span>
          <ChevronsUpDown className="size-5 shrink-0 text-gray-400" />
        </button>
      </DrawerTrigger>
      <DrawerContent className="mx-auto max-h-[90vh] w-full max-w-md rounded-t-[28px] border-slate-200 bg-white shadow-2xl">
        <DrawerHeader className="relative border-b border-slate-200 px-5 pb-4 pt-3 text-left">
          <div className="flex items-center gap-3 pr-10">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#2563eb]">
              <Search className="size-5" />
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
        <div className="bg-slate-50 px-4 pt-3">
          <div className="flex h-12 items-center gap-3 rounded-xl border border-gray-300 bg-gray-50 px-4 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/15">
            <Search className="size-5 shrink-0 text-gray-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400"
            />
          </div>
        </div>
        <div className="overflow-y-auto bg-slate-50 px-4 py-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {filteredOptions.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => chooseValue(option)}
              className={cn(
                'mb-2 flex min-h-12 w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-gray-700 shadow-sm active:bg-blue-50',
                value === option && 'bg-blue-50 font-semibold text-[#2563eb]',
              )}
            >
              <Check className={cn('size-5 shrink-0', value === option ? 'opacity-100' : 'opacity-0')} />
              <span>{option}</span>
            </button>
          ))}
          {deferredQuery && !hasExactMatch ? (
            <button
              type="button"
              onClick={() => chooseValue(deferredQuery)}
              className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-blue-200 bg-white px-4 py-3 text-left text-sm font-semibold text-[#2563eb] shadow-sm active:bg-blue-50"
            >
              <Plus className="size-5 shrink-0" />
              <span className="truncate">{customLabel}: “{deferredQuery}”</span>
            </button>
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
