/**
 * @type {import('next-i18next').UserConfig}
 */
module.exports = {
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'zh-CN', 'zh-Hant', 'ko-KR'],
    localeDetection: false
  },
  defaultNS: 'common',
  fallbackLng: 'zh-CN',
  localePath: require('path').resolve('../../packages/web/i18n'),
  reloadOnPrerender: process.env.NODE_ENV === 'development'
};
