import {
  getFastGPTDocsLocaleFromHomeOrigin,
  getFastGPTDocsOriginForLocale as getFixedFastGPTDocsOriginForLocale,
  getProductionDocsUrl as buildProductionDocsUrl,
  resolveDocsSiteVariant,
  stripDocsLocalePrefix as stripRawDocsLocalePrefix
} from './docs-locale';

const DEFAULT_FASTGPT_HOME_ORIGIN = 'https://fastgpt.io';

export const DOCS_UTM_CAMPAIGNS = {
  gettingStarted: 'docs_getting_started',
  cloudIntro: 'docs_cloud_intro',
  cloudFaq: 'docs_cloud_faq',
  selfHostDev: 'docs_self_host_dev'
} as const;

export type DocsUtmCampaign = (typeof DOCS_UTM_CAMPAIGNS)[keyof typeof DOCS_UTM_CAMPAIGNS];
export type DocsSiteVariant = 'cn' | 'io' | 'preview';
export type FastGPTSite = 'configured' | 'cn' | 'io';
export type FastGPTDocsLocale = 'zh-CN' | 'en';

const normalizeOrigin = (value?: string): string => {
  try {
    return new URL(value ?? DEFAULT_FASTGPT_HOME_ORIGIN).origin;
  } catch {
    return DEFAULT_FASTGPT_HOME_ORIGIN;
  }
};

/** Resolve the active documentation site variant (`cn`, `io`, or `preview`). */
export const getDocsSiteVariant = (): DocsSiteVariant =>
  resolveDocsSiteVariant({
    siteVariant: process.env.NEXT_PUBLIC_DOCS_SITE_VARIANT ?? process.env.DOCS_SITE_VARIANT,
    homeOrigin: process.env.NEXT_PUBLIC_FASTGPT_HOME_DOMAIN ?? process.env.FASTGPT_HOME_DOMAIN
  });

/** Check whether the current documentation build runs as a multi-locale preview container. */
export const isPreviewDocsSite = (): boolean => getDocsSiteVariant() === 'preview';

export const getFastGPTHomeOrigin = (): string => {
  const configured =
    process.env.NEXT_PUBLIC_FASTGPT_HOME_DOMAIN ?? process.env.FASTGPT_HOME_DOMAIN;
  if (configured !== undefined && configured.trim() !== '') {
    return normalizeOrigin(configured);
  }
  return getDocsSiteVariant() === 'cn' ? 'https://fastgpt.cn' : DEFAULT_FASTGPT_HOME_ORIGIN;
};

export const getFastGPTDocsOrigin = (): string => {
  const homeUrl = new URL(getFastGPTHomeOrigin());
  homeUrl.hostname = `doc.${homeUrl.hostname}`;
  return homeUrl.origin;
};

export const getFastGPTDocsLocale = (): FastGPTDocsLocale => {
  const variant = getDocsSiteVariant();
  if (variant === 'cn') {
    return 'zh-CN';
  }
  if (variant === 'io') {
    return 'en';
  }
  return getFastGPTDocsLocaleFromHomeOrigin(getFastGPTHomeOrigin());
};

/** Return the locales rendered and indexed by the current documentation build variant. */
export const getPublishedDocsLocales = (): FastGPTDocsLocale[] => {
  const variant = getDocsSiteVariant();
  if (variant === 'cn') {
    return ['zh-CN'];
  }
  if (variant === 'io') {
    return ['en'];
  }
  return ['zh-CN', 'en'];
};

/**
 * Resolve the docs origin that owns a locale while keeping the configured image host for its
 * primary locale. Cross-host alternates always point at the corresponding production owner.
 */
export const getFastGPTDocsOriginForLocale = (locale: FastGPTDocsLocale): string =>
  locale === getFastGPTDocsLocale()
    ? getFastGPTDocsOrigin()
    : getFixedFastGPTDocsOriginForLocale(locale);

/** Strip a leading `/zh-CN` or `/en` locale prefix while preserving query strings and hashes. */
export const stripDocsLocalePrefix = (rawPath: string) => stripRawDocsLocalePrefix(rawPath);

/**
 * Format a documentation route for the current site variant:
 * unprefixed on production owner hosts (`cn` / `io`), locale-prefixed on `preview`.
 */
export const getOwnedDocsPath = (rawPath: string, locale: FastGPTDocsLocale): string => {
  const { pathname, path } = stripRawDocsLocalePrefix(rawPath);
  if (isPreviewDocsSite()) {
    const suffix = path.slice(pathname.length);
    return pathname === '/' ? `/${locale}${suffix}` : `/${locale}${pathname}${suffix}`;
  }
  return path;
};

/** Build the unprefixed canonical production documentation URL for a locale and path. */
export const getProductionDocsUrl = (locale: FastGPTDocsLocale, rawPath: string): string =>
  buildProductionDocsUrl(locale, rawPath);

/** Build an unprefixed main-site URL on `fastgpt.cn` (`zh-CN`) or `fastgpt.io` (`en`). */
export const buildFastGPTWebsiteUrl = (params: {
  locale: FastGPTDocsLocale;
  pathname: string;
  query?: Record<string, string>;
}): string => {
  const origin = params.locale === 'zh-CN' ? 'https://fastgpt.cn' : 'https://fastgpt.io';
  const normalizedPath = params.pathname.startsWith('/')
    ? params.pathname
    : `/${params.pathname}`;
  const url = new URL(normalizedPath, origin);

  for (const [key, value] of Object.entries(params.query ?? {})) {
    url.searchParams.set(key, value);
  }

  return url.toString();
};

export const buildFastGPTHomeUrl = ({
  campaign,
  content,
  site = 'configured'
}: {
  campaign: DocsUtmCampaign;
  content: string;
  site?: FastGPTSite;
}): string => {
  const origin = (() => {
    if (site === 'cn') {
      return 'https://fastgpt.cn';
    }
    if (site === 'io') {
      return 'https://fastgpt.io';
    }
    return getFastGPTHomeOrigin();
  })();
  const url = new URL('/', origin);

  url.searchParams.set('utm_source', 'docs');
  url.searchParams.set('utm_medium', 'referral');
  url.searchParams.set('utm_campaign', campaign);
  url.searchParams.set('utm_content', content);

  return url.toString();
};
