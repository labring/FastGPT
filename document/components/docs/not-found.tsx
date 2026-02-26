'use client';
import { useEffect } from 'react';
import { useCurrentLang } from '@/lib/localized-navigation';
import { getLocalizedPath } from '@/lib/i18n';

/**
 * Fallback for pages not found
 * Redirects to introduction page to avoid 404
 */
export default function NotFound() {
  const lang = useCurrentLang();

  useEffect(() => {
    // Redirect to introduction page
    window.location.replace(getLocalizedPath('/docs/introduction', lang));
  }, [lang]);

  return null;
}
