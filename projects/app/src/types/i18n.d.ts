import 'i18next';
import common from '../../public/locales/en/common.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    returnNull: false;
  }
  interface Resources {
    [key: string]: {
      [key: string]: string;
    };
  }
}
