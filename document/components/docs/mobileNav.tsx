'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { Navbar } from 'fumadocs-ui/layouts/docs';
import { useSidebar } from 'fumadocs-ui/provider';
import { useSearchContext } from 'fumadocs-ui/contexts/search';
import { Menu, Search } from 'lucide-react';

/** Use the existing navigation state with localized mobile control names. */
export function MobileNav({ lang, title }: { lang: string; title: ReactNode }) {
  const { open, setOpen } = useSidebar();
  const { setOpenSearch } = useSearchContext();
  const english = lang === 'en';
  const navigationTrigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        setOpen(false);
        navigationTrigger.current?.focus();
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open, setOpen]);

  return (
    <Navbar className="h-14 md:hidden">
      <Link href={`/${lang}/guide/getting-started`} className="me-auto inline-flex items-center gap-2.5 font-semibold">
        {title}
      </Link>
      <button type="button" className="rounded-md p-2 focus-visible:outline" aria-label={english ? 'Open search' : '打开搜索'} onClick={() => setOpenSearch(true)}>
        <Search className="size-5" aria-hidden="true" />
      </button>
      <button ref={navigationTrigger} type="button" className="rounded-md p-2 focus-visible:outline" aria-label={english ? 'Toggle navigation' : '切换导航'} aria-expanded={open} aria-controls="nd-sidebar-mobile" onClick={() => setOpen(!open)}>
        <Menu className="size-5" aria-hidden="true" />
      </button>
    </Navbar>
  );
}
