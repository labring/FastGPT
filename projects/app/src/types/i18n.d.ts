import 'i18next';
import common from '../../i18n/en/common.json';
import dataset from '../../i18n/en/dataset.json';
import app from '../../i18n/en/app.json';

export interface I18nNamespaces {
  common: typeof common;
  dataset: typeof dataset;
  app: typeof app;
}

export type I18nNsType = (keyof I18nNamespaces)[];

declare module 'i18next' {
  interface CustomTypeOptions {
    returnNull: false;
    defaultNs: 'common';
    resources: I18nNamespaces;
  }
}
