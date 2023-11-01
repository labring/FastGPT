import 'i18next';
import common from '../../public/locales/zh/common.json';

type i18nKey = keyof typeof common;

declare module 'i18next' {
  interface CustomTypeOptions {
    returnNull: false;
  }
  interface Resources {
    [key in i18nKey]: {
      [key: string]: string;
    };
  }
}
