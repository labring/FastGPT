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

  if (!origin) throw new Error(`Unsupported FastGPT docs locale: ${locale}`);
  return origin;
}

module.exports = { getFastGPTDocsLocaleFromHomeOrigin, getFastGPTDocsOriginForLocale };
