'use client';

import Link from 'next/link';
import { Check, ChevronDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from 'fumadocs-ui/components/ui/popover';
import { useSidebar } from 'fumadocs-ui/provider';
import { cn } from '@/lib/cn';

export type SwitcherDropdownOption = {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  href?: string;
  active?: boolean;
  onSelect?: () => void;
};

type SwitcherDropdownProps = {
  options: SwitcherDropdownOption[];
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
  optionClassName?: string;
  iconClassName?: string;
  align?: 'start' | 'center' | 'end';
  keepSidebarOpenOnSelect?: boolean;
};

export function SwitcherDropdown({
  options,
  className,
  triggerClassName,
  contentClassName,
  optionClassName,
  iconClassName,
  align = 'end',
  keepSidebarOpenOnSelect = false
}: SwitcherDropdownProps) {
  const [open, setOpen] = useState(false);
  const { closeOnRedirect } = useSidebar();
  const selected = options.find((item) => item.active) ?? options[0];

  const selectItem = (item: SwitcherDropdownOption) => {
    if (keepSidebarOpenOnSelect) {
      closeOnRedirect.current = false;
    }
    item.onSelect?.();
    setOpen(false);
  };

  const renderOption = (item: SwitcherDropdownOption) => {
    const active = item === selected;
    const content = (
      <>
        {item.icon && (
          <span className="flex size-5 shrink-0 items-center justify-center [&_svg]:size-4">
            {item.icon}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        <Check
          className={cn(
            'size-3.5 shrink-0 text-[#3370FF] dark:text-blue-400',
            !active && 'invisible'
          )}
        />
      </>
    );

    const className = cn(
      'flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 text-left text-fd-popover-foreground transition-colors hover:bg-fd-accent',
      active && 'font-semibold text-[#3370FF] dark:text-blue-400',
      optionClassName
    );

    if (item.href) {
      return (
        <Link
          key={item.key}
          href={item.href}
          onClick={() => selectItem(item)}
          className={className}
          role="option"
          aria-selected={active}
        >
          {content}
        </Link>
      );
    }

    return (
      <button
        key={item.key}
        type="button"
        onClick={() => selectItem(item)}
        className={className}
        role="option"
        aria-selected={active}
      >
        {content}
      </button>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={cn('relative flex shrink-0', className)}>
        <PopoverTrigger
          aria-haspopup="listbox"
          aria-expanded={open}
          data-open={open}
          className={cn(
            'inline-flex h-8 max-w-[9.5rem] cursor-pointer items-center gap-1.5 rounded-lg border border-fd-border bg-fd-background px-2.5 text-xs font-medium text-fd-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-primary/30 data-[open=true]:bg-fd-accent data-[open=true]:text-fd-accent-foreground',
            triggerClassName
          )}
        >
          {selected?.icon && (
            <span className={cn('flex size-5 shrink-0 items-center justify-center [&_svg]:size-4', iconClassName)}>
              {selected.icon}
            </span>
          )}
          <span className="min-w-0 truncate">{selected?.label}</span>
          <ChevronDown
            className={cn(
              'ms-auto size-3.5 shrink-0 text-fd-muted-foreground transition-transform',
              open && 'rotate-180'
            )}
          />
        </PopoverTrigger>
        <PopoverContent
          align={align}
          role="listbox"
          className={cn(
            'flex min-w-[11rem] flex-col gap-1 overflow-hidden p-1',
            contentClassName
          )}
        >
          {options.map(renderOption)}
        </PopoverContent>
      </div>
    </Popover>
  );
}
