'use client';
import { useEffect } from 'react';
import { useCurrentLang } from '@/lib/localized-navigation';
import { defaultHomePath, getLocalizedPath } from '@/lib/i18n';

/**
 * Fallback for pages not found
 * Redirects to getting started page to avoid 404
 */
export default function NotFound() {
  const lang = useCurrentLang();

  useEffect(() => {
    // Redirect to getting started page
    window.location.replace(getLocalizedPath(defaultHomePath, lang));
  }, [lang]);

  return null;
}
