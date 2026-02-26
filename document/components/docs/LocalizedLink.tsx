'use client';

import Link from 'next/link';
import { useCurrentLang, useLocalizedPath } from '@/lib/localized-navigation';
import type { ComponentProps } from 'react';

/**
 * Localized Link component that automatically adds language prefix
 * Use this in MDX or React components for internal links
 */
export function LocalizedLink({ href, ...props }: ComponentProps<typeof Link>) {
  const lang = useCurrentLang();
  const localizedPath = useLocalizedPath;

  // Only localize internal links (starting with /)
  const finalHref =
    typeof href === 'string' && href.startsWith('/') && !href.startsWith(`/${lang}`)
      ? localizedPath(href)
      : href;

  return <Link href={finalHref} {...props} />;
}
