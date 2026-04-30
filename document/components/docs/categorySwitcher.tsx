'use client';

import { useMemo, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { SwitcherDropdown } from '@/components/docs/switcherDropdown';
import { cn } from '@/lib/cn';

export type CategorySwitcherOption = {
  icon?: ReactNode;
  title: ReactNode;
  url: string;
  urls?: Set<string>;
};

type CategorySwitcherProps = {
  options: CategorySwitcherOption[];
  className?: string;
};

const getCategoryKey = (path: string): string => {
  const segments = path.split('/').filter(Boolean);
  return segments[1] ?? '';
};

export function CategorySwitcher({ options, className }: CategorySwitcherProps) {
  const pathname = usePathname();

  const selected = useMemo(() => {
    const lookup = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
    const currentCategory = getCategoryKey(lookup);
    return (
      options.find((item) => item.urls?.has(lookup)) ??
      options.find((item) => getCategoryKey(item.url) === currentCategory) ??
      options[0]
    );
  }, [options, pathname]);

  return (
    <SwitcherDropdown
      className="w-full"
      triggerClassName={cn(
        'flex h-[42px] w-full max-w-none justify-between gap-2 rounded-xl border bg-fd-secondary/50 p-1.5 text-start text-sm text-fd-secondary-foreground hover:bg-fd-accent data-[open=true]:bg-fd-accent data-[open=true]:text-fd-accent-foreground',
        className
      )}
      contentClassName="w-(--radix-popover-trigger-width)"
      align="start"
      keepSidebarOpenOnSelect
      options={options.map((item) => ({
        key: item.url,
        label: item.title,
        icon: item.icon,
        href: item.url,
        active: item === selected
      }))}
    />
  );
}
