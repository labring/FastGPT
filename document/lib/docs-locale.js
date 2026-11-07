/**
 * Resolve the docs locale from the build host used by the documentation image.
 * @param {string} homeOrigin
 * @returns {'zh-CN' | 'en'}
 */
function getFastGPTDocsLocaleFromHomeOrigin(homeOrigin) {
  return new URL(homeOrigin).hostname.endsWith('.cn') ? 'zh-CN' : 'en';
}

module.exports = { getFastGPTDocsLocaleFromHomeOrigin };
