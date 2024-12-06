import 'i18next';
import account_team from '../i18n/zh-CN/account_team.json';
import account from '../i18n/zh-CN/account.json';
import account_promotion from '../i18n/zh-CN/account_promotion.json';
import account_inform from '../i18n/zh-CN/account_inform.json';
import account_individuation from '../i18n/zh-CN/account_individuation.json';
import account_apikey from '../i18n/zh-CN/account_apikey.json';
import account_bill from '../i18n/zh-CN/account_bill.json';
import account_usage from '../i18n/zh-CN/account_usage.json';
import account_info from '../i18n/zh-CN/account_info.json';
import common from '../i18n/zh-CN/common.json';
import dataset from '../i18n/zh-CN/dataset.json';
import app from '../i18n/zh-CN/app.json';
import file from '../i18n/zh-CN/file.json';
import publish from '../i18n/zh-CN/publish.json';
import workflow from '../i18n/zh-CN/workflow.json';
import user from '../i18n/zh-CN/user.json';
import chat from '../i18n/zh-CN/chat.json';
import login from '../i18n/zh-CN/login.json';

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
  account_info: typeof account_info;
  account_usage: typeof account_usage;
  account_bill: typeof account_bill;
  account_apikey: typeof account_apikey;
  account_individuation: typeof account_individuation;
  account_inform: typeof account_inform;
  account_promotion: typeof account_promotion;
  account: typeof account;
  account_team: typeof account_team;
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
    defaultNS: [
      'common',
      'dataset',
      'app',
      'file',
      'publish',
      'workflow',
      'user',
      'chat',
      'login',
      'account_info',
      'account_usage',
      'account_bill',
      'account_apikey',
      'account_individuation',
      'account_inform',
      'account_promotion',
      'account',
      'account_team'
    ];
    resources: I18nNamespaces;
  }
}
