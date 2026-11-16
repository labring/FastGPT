'use client';

import { useParams, usePathname, useRouter } from 'next/navigation';
import { getFastGPTDocsLocale } from './fastgpt-home-url';
import { i18n, getLocalizedPath } from './i18n';

/**
 * Resolve the active documentation locale from route params, URL prefix, or build host locale.
 */
export function useCurrentLang(): string {
  const params = useParams<{ lang?: string }>();
  const pathname = usePathname();

  if (typeof params?.lang === 'string' && i18n.languages.includes(params.lang)) {
    return params.lang;
  }

  const segments = pathname.split('/').filter(Boolean);
  const firstSegment = segments[0];

  if (firstSegment !== undefined && i18n.languages.includes(firstSegment)) {
    return firstSegment;
  }

  return getFastGPTDocsLocale();
}

/**
 * Get localized path for current language
 */
export function useLocalizedPath(path: string): string {
  const lang = useCurrentLang();
  return getLocalizedPath(path, lang);
}

/**
 * Router with automatic language prefix handling
 */
export function useLocalizedRouter() {
  const router = useRouter();
  const lang = useCurrentLang();
  
  return {
    push: (path: string) => {
      router.push(getLocalizedPath(path, lang));
    },
    replace: (path: string) => {
      router.replace(getLocalizedPath(path, lang));
    },
    prefetch: (path: string) => {
      router.prefetch(getLocalizedPath(path, lang));
    },
    back: () => router.back(),
    forward: () => router.forward(),
    refresh: () => router.refresh(),
  };
}
