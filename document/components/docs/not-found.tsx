'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useCurrentLang } from '@/lib/localized-navigation';
import { getLocalizedPath } from '@/lib/i18n';

const fallbackRedirect = '/docs/introduction';

/**
 * Fallback redirect handler for pages not found
 * This runs after middleware redirects, handling dynamic meta.json lookups
 */
export default function NotFound() {
  const pathname = usePathname();
  const lang = useCurrentLang();

  useEffect(() => {
    (async () => {
      // Remove language prefix from pathname for matching
      const pathWithoutLang = pathname.replace(new RegExp(`^/${lang}`), '');

      // Try to find page in meta.json (dynamic lookup)
      try {
        const basePath = pathWithoutLang.replace(/\/$/, '');
        const res = await fetch(`/api/meta?path=${basePath}`);

        if (res.ok) {
          const validPage = await res.json();
          if (validPage) {
            window.location.replace(getLocalizedPath(validPage, lang));
            return;
          }
        }
      } catch (e) {
        console.warn('meta.json fallback failed:', e);
      }

      // Final fallback: redirect to introduction
      window.location.replace(getLocalizedPath(fallbackRedirect, lang));
    })();
  }, [pathname, lang]);

  return null;
}
