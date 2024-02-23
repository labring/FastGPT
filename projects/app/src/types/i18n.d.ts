import 'i18next';
// import common from '../../public/locales/en/common.json';

interface I18nNamespaces {
  common: any;
}

declare module 'i18next' {
  interface CustomTypeOptions {
    returnNull: false;
    defaultNs: 'common';
    // resources: I18nNamespaces;
  }
}
