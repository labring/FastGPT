'use client';

import Link from 'next/link';
import { getLocalizedPath, i18n } from '@/lib/i18n';
import { useCurrentLang } from '@/lib/localized-navigation';
import type { ComponentProps } from 'react';

const STATIC_ASSET_PREFIXES = ['/examples/', '/deploy/', '/imgs/', '/favicon/'];
const ARCHIVE_NOFOLLOW_PATH_RE =
  /^\/(?:(?:zh-CN|en)\/)?(?:openapi\/legacy|self-host\/custom-models\/legacy|self-host\/upgrading\/outdated)(?:\/|$|#|\?)/;

/**
 * Localized Link component that automatically adds language prefix
 * Use this in MDX or React components for internal links
 */
export function LocalizedLink({ href, ...props }: ComponentProps<'a'>) {
  const lang = useCurrentLang();

  if (!href) return <a {...props} />;

  const hasLangPrefix = i18n.languages.some(
    (locale) => href === `/${locale}` || href.startsWith(`/${locale}/`)
  );
  const isStaticAsset = STATIC_ASSET_PREFIXES.some((prefix) => href.startsWith(prefix));
  const finalHref =
    href.startsWith('/') && !hasLangPrefix && !isStaticAsset ? getLocalizedPath(href, lang) : href;
  const resolvedRel =
    props.rel ?? (ARCHIVE_NOFOLLOW_PATH_RE.test(finalHref) ? 'nofollow' : undefined);

  return <Link href={finalHref} {...props} rel={resolvedRel} />;
}
