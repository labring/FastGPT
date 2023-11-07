import 'i18next';
import common from '../../public/locales/zh/common.json';

interface I18nNamespaces {
  common: typeof common | string;
}

declare module 'i18next' {
  interface CustomTypeOptions {
    returnNull: false;
    resources: I18nNamespaces;
  }
}
