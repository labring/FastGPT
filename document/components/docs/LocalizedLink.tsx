'use client';

import Link from 'next/link';
import { Card, type CardProps } from 'fumadocs-ui/components/card';
import {
  getProductionDocsUrl,
  isPreviewDocsSite,
  stripDocsLocalePrefix,
  type FastGPTDocsLocale
} from '@/lib/fastgpt-home-url';
import { getLocalizedPath } from '@/lib/i18n';
import { useCurrentLang } from '@/lib/localized-navigation';
import type { ComponentProps } from 'react';

const STATIC_ASSET_PREFIXES = ['/examples/', '/deploy/', '/imgs/', '/favicon/'];
const ARCHIVE_NOFOLLOW_PATH_RE =
  /^\/(?:(?:zh-CN|en)\/)?(?:openapi\/legacy|self-host\/custom-models\/legacy|self-host\/upgrading\/outdated)(?:\/|$|#|\?)/;

/** Resolve internal documentation paths to variant-aware routes or cross-domain production URLs. */
export function resolveInternalDocsHref(href: string, lang: string): string {
  if (!href.startsWith('/') || STATIC_ASSET_PREFIXES.some((prefix) => href.startsWith(prefix))) {
    return href;
  }

  const stripped = stripDocsLocalePrefix(href);
  const currentLocale: FastGPTDocsLocale = lang === 'en' ? 'en' : 'zh-CN';
  const targetLocale: FastGPTDocsLocale = stripped.locale ?? currentLocale;

  if (!isPreviewDocsSite() && stripped.locale !== undefined && stripped.locale !== currentLocale) {
    return getProductionDocsUrl(stripped.locale, stripped.path);
  }

  return getLocalizedPath(stripped.path, targetLocale);
}

/**
 * Localized Link component that formats internal documentation links for the active site variant.
 */
export function LocalizedLink({ href, ...props }: ComponentProps<'a'>) {
  const lang = useCurrentLang();

  if (href === undefined || href === '') return <a {...props} />;

  const finalHref = resolveInternalDocsHref(href, lang);
  const resolvedRel =
    props.rel ??
    (ARCHIVE_NOFOLLOW_PATH_RE.test(href) || ARCHIVE_NOFOLLOW_PATH_RE.test(finalHref)
      ? 'nofollow'
      : undefined);

  if (/^https?:\/\//i.test(finalHref) && href.startsWith('/')) {
    return <a href={finalHref} {...props} rel={resolvedRel} />;
  }

  return <Link href={finalHref} {...props} rel={resolvedRel} />;
}

/** Localized Fumadocs Card wrapper that resolves internal documentation links per site variant. */
export function LocalizedCard(props: CardProps) {
  const lang = useCurrentLang();
  const resolvedHref =
    props.href !== undefined ? resolveInternalDocsHref(props.href, lang) : undefined;
  const resolvedExternal =
    props.external ??
    (resolvedHref !== undefined
      ? /^https?:\/\//i.test(resolvedHref) && !(props.href?.startsWith('/') ?? false)
      : undefined);

  return <Card {...props} href={resolvedHref} external={resolvedExternal} />;
}
