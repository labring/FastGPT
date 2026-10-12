import { getFastGPTHomeOrigin } from './fastgpt-home-url';

/**
 * Domain / locale ownership for the docs site (mirrors fastgpt-home site-routing).
 *
 * - zh-CN is owned by doc.fastgpt.cn, en is owned by doc.fastgpt.io.
 * - Both domains still serve both locales; canonical points at the owning domain,
 *   hreflang alternates are identical on both domains, x-default -> io English.
 * - The variant is fixed at build time via DOC_SITE_VARIANT (cn | io). When unset it is
 *   derived from FASTGPT_HOME_DOMAIN (`.cn` host -> cn, otherwise io).
 */
export type DocSiteVariant = 'cn' | 'io';
export type DocLocale = 'zh-CN' | 'en';

export const DOC_IO_ORIGIN = 'https://doc.fastgpt.io';
export const DOC_CN_ORIGIN = 'https://doc.fastgpt.cn';

const VARIANT_ORIGINS: Record<DocSiteVariant, string> = {
  io: DOC_IO_ORIGIN,
  cn: DOC_CN_ORIGIN
};

export const LOCALE_OWNER: Record<DocLocale, DocSiteVariant> = {
  'zh-CN': 'cn',
  en: 'io'
};

export const VARIANT_DEFAULT_LOCALE: Record<DocSiteVariant, DocLocale> = {
  cn: 'zh-CN',
  io: 'en'
};

/** Open Graph locale format (language_TERRITORY). */
export const OG_LOCALE: Record<DocLocale, string> = {
  'zh-CN': 'zh_CN',
  en: 'en_US'
};

export const X_DEFAULT_LOCALE: DocLocale = 'en';

export function getDocSiteVariant(): DocSiteVariant {
  const explicit = (
    process.env.NEXT_PUBLIC_DOC_SITE_VARIANT ||
    process.env.DOC_SITE_VARIANT ||
    ''
  )
    .trim()
    .toLowerCase();
  if (explicit === 'cn' || explicit === 'io') return explicit;

  try {
    return new URL(getFastGPTHomeOrigin()).hostname.endsWith('.cn') ? 'cn' : 'io';
  } catch {
    return 'io';
  }
}

/** Default locale of the current domain (root `/` redirects here). */
export function getSiteDefaultLocale(): DocLocale {
  return VARIANT_DEFAULT_LOCALE[getDocSiteVariant()];
}

/** Locales whose pages this domain lists in its sitemap. */
export function getOwnedLocales(variant: DocSiteVariant = getDocSiteVariant()): DocLocale[] {
  return (Object.keys(LOCALE_OWNER) as DocLocale[]).filter((l) => LOCALE_OWNER[l] === variant);
}

export function getVariantOrigin(variant: DocSiteVariant): string {
  return VARIANT_ORIGINS[variant];
}

export function isDocLocale(value: string): value is DocLocale {
  return value in LOCALE_OWNER;
}

/** Absolute URL of a page on the domain that owns the locale (may be cross-domain). */
export function getOwnedDocUrl(locale: string, slug?: string[]): string {
  const owner = isDocLocale(locale) ? LOCALE_OWNER[locale] : 'io';
  const path = slug && slug.length > 0 ? `/${slug.join('/')}` : '';
  return `${VARIANT_ORIGINS[owner]}/${locale}${path}`;
}

export function getOgLocale(locale: string): string {
  return isDocLocale(locale) ? OG_LOCALE[locale] : locale.replace('-', '_');
}
