import 'i18next';
import common from '../i18n/zh/common.json';
import dataset from '../i18n/zh/dataset.json';
import app from '../i18n/zh/app.json';
import file from '../i18n/zh/file.json';
import publish from '../i18n/zh/publish.json';
import workflow from '../i18n/zh/workflow.json';
import user from '../i18n/zh/user.json';
import chat from '../i18n/zh/chat.json';
import login from '../i18n/zh/login.json';

export interface I18nNamespaces {
  common: typeof common;
  dataset: typeof dataset;
  app: typeof app;
  file: typeof file;
  publish: typeof publish;
  workflow: typeof workflow;
  user: typeof user;
  chat: typeof chat;
  login: typeof login;
}

export type I18nNsType = (keyof I18nNamespaces)[];

export type ParseKeys<Ns extends keyof I18nNamespaces = keyof I18nNamespaces> = {
  [K in Ns]: `${K}:${keyof I18nNamespaces[K] & string}`;
}[Ns];

export type I18nKeyFunction = {
  <Key extends ParseKeys>(key: Key): Key;
};

declare module 'i18next' {
  interface CustomTypeOptions {
    returnNull: false;
    defaultNS: ['common', 'dataset', 'app', 'file', 'publish', 'workflow', 'user', 'chat', 'login'];
    resources: I18nNamespaces;
  }
}
