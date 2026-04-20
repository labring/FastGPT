'use client';

import { useRouter, usePathname } from 'next/navigation';
import { i18n, getLocalizedPath } from './i18n';

/**
 * Get current language from pathname
 */
export function useCurrentLang(): string {
  const pathname = usePathname();
  
  // Extract language from pathname (e.g., /zh-CN/docs/... -> zh-CN)
  const segments = pathname.split('/').filter(Boolean);
  const firstSegment = segments[0];
  
  // Check if first segment is a valid language
  if (i18n.languages.includes(firstSegment)) {
    return firstSegment;
  }
  
  return i18n.defaultLanguage;
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
