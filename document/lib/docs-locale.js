/**
 * Supported build and runtime site variants for the documentation app.
 * @typedef {'cn' | 'io' | 'preview'} DocsSiteVariant
 */

/**
 * Resolve the docs locale from the build host used by the documentation image.
 * @param {string} homeOrigin
 * @returns {'zh-CN' | 'en'}
 */
function getFastGPTDocsLocaleFromHomeOrigin(homeOrigin) {
  return new URL(homeOrigin).hostname.endsWith('.cn') ? 'zh-CN' : 'en';
}

/**
 * Resolve the production documentation origin that owns a locale.
 * @param {'zh-CN' | 'en'} locale
 * @returns {string}
 */
function getFastGPTDocsOriginForLocale(locale) {
  const origin = {
    'zh-CN': 'https://doc.fastgpt.cn',
    en: 'https://doc.fastgpt.io'
  }[locale];

  if (origin === undefined) {
    throw new Error(`Unsupported FastGPT docs locale: ${locale}`);
  }
  return origin;
}

/**
 * Resolve the active documentation site variant from explicit build env or home domain.
 * Defaults to `'preview'` when neither variant nor home domain is configured.
 * @param {{ siteVariant?: string; homeOrigin?: string }} [options]
 * @returns {DocsSiteVariant}
 */
function resolveDocsSiteVariant(options = {}) {
  const rawVariant = (
    options.siteVariant ??
    process.env.NEXT_PUBLIC_DOCS_SITE_VARIANT ??
    process.env.DOCS_SITE_VARIANT ??
    ''
  ).trim();

  if (rawVariant !== '') {
    if (rawVariant === 'cn' || rawVariant === 'io' || rawVariant === 'preview') {
      return rawVariant;
    }
    throw new Error(`Unsupported FastGPT docs site variant: ${rawVariant}`);
  }

  const rawHomeOrigin = (
    options.homeOrigin ??
    process.env.NEXT_PUBLIC_FASTGPT_HOME_DOMAIN ??
    process.env.FASTGPT_HOME_DOMAIN ??
    ''
  ).trim();

  if (rawHomeOrigin !== '') {
    return getFastGPTDocsLocaleFromHomeOrigin(rawHomeOrigin) === 'zh-CN' ? 'cn' : 'io';
  }

  return 'preview';
}

/**
 * Strip a leading `/zh-CN` or `/en` locale segment while preserving query strings and hashes.
 * @param {string} rawPath
 * @returns {{ locale: 'zh-CN' | 'en' | undefined; pathname: string; path: string }}
 */
function stripDocsLocalePrefix(rawPath) {
  const match = String(rawPath ?? '/').match(/^([^?#]*)(.*)$/);
  const pathname = match !== null && match[1] !== '' ? match[1] : '/';
  const suffix = match !== null ? match[2] : '';
  const localeMatch = pathname.match(/^\/(zh-CN|en)(?=\/|$)(.*)$/);

  if (localeMatch !== null) {
    const rest = localeMatch[2] !== '' ? localeMatch[2] : '/';
    return {
      locale: /** @type {'zh-CN' | 'en'} */ (localeMatch[1]),
      pathname: rest,
      path: `${rest}${suffix}`
    };
  }

  const normalizedPathname = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return {
    locale: undefined,
    pathname: normalizedPathname,
    path: `${normalizedPathname}${suffix}`
  };
}

/**
 * Build the unprefixed canonical production documentation URL for a locale and path.
 * @param {'zh-CN' | 'en'} locale
 * @param {string} rawPath
 * @returns {string}
 */
function getProductionDocsUrl(locale, rawPath) {
  const origin = getFastGPTDocsOriginForLocale(locale);
  const { path } = stripDocsLocalePrefix(rawPath);
  return `${origin}${path}`;
}

module.exports = {
  getFastGPTDocsLocaleFromHomeOrigin,
  getFastGPTDocsOriginForLocale,
  getProductionDocsUrl,
  resolveDocsSiteVariant,
  stripDocsLocalePrefix
};
