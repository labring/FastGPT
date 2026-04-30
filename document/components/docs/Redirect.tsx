'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getLocalizedPath, i18n } from '@/lib/i18n';
import { useCurrentLang } from '@/lib/localized-navigation';

interface RedirectProps {
  to: string;
}

function removeLocalePrefix(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);

  if (segments[0] && i18n.languages.includes(segments[0])) {
    return `/${segments.slice(1).join('/')}`;
  }

  return pathname;
}

function normalizeDocPath(to: string, pathname: string): string {
  const target = to.replace(/(?:\.[a-z]{2}(?:-[A-Z]{2})?)?\.mdx$/, '');

  if (target.startsWith('/')) {
    return removeLocalePrefix(target);
  }

  const currentPath = removeLocalePrefix(pathname);
  const basePath = currentPath.endsWith('/') ? currentPath : `${currentPath}/`;

  return new URL(target, `http://localhost${basePath}`).pathname;
}

export function Redirect({ to }: RedirectProps) {
  const router = useRouter();
  const pathname = usePathname();
  const lang = useCurrentLang();

  useEffect(() => {
    router.push(getLocalizedPath(normalizeDocPath(to, pathname), lang));
  }, [to, pathname, lang, router]);

  return null;
}
