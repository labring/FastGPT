//next-i18next.config.js
/**
 * @type {import('next-i18next').UserConfig}
 */

module.exports = {
  i18n: {
    defaultLocale: 'zh',
    locales: ['en', 'zh'],
    localeDetection: false
  },
  localePath:
    typeof window === 'undefined' ? require('path').resolve('../../packages/web/i18n') : '/i18n',
  reloadOnPrerender: process.env.NODE_ENV === 'development'
};
