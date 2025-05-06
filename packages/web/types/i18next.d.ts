import 'i18next';
import type account_team from '../i18n/zh-CN/account_team.json';
import type account from '../i18n/zh-CN/account.json';
import type account_thirdParty from '../i18n/zh-CN/account_thirdParty.json';
import type account_promotion from '../i18n/zh-CN/account_promotion.json';
import type account_inform from '../i18n/zh-CN/account_inform.json';
import type account_setting from '../i18n/zh-CN/account_setting.json';
import type account_apikey from '../i18n/zh-CN/account_apikey.json';
import type account_bill from '../i18n/zh-CN/account_bill.json';
import type account_usage from '../i18n/zh-CN/account_usage.json';
import type account_info from '../i18n/zh-CN/account_info.json';
import type common from '../i18n/zh-CN/common.json';
import type dataset from '../i18n/zh-CN/dataset.json';
import type app from '../i18n/zh-CN/app.json';
import type file from '../i18n/zh-CN/file.json';
import type publish from '../i18n/zh-CN/publish.json';
import type workflow from '../i18n/zh-CN/workflow.json';
import type user from '../i18n/zh-CN/user.json';
import type chat from '../i18n/zh-CN/chat.json';
import type login from '../i18n/zh-CN/login.json';
import type account_model from '../i18n/zh-CN/account_model.json';
import type dashboard_mcp from '../i18n/zh-CN/dashboard_mcp.json';

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
  account_setting: typeof account_setting;
  account_inform: typeof account_inform;
  account_promotion: typeof account_promotion;
  account: typeof account;
  account_team: typeof account_team;
  account_thirdParty: typeof account_thirdParty;
  account_model: typeof account_model;
  dashboard_mcp: typeof dashboard_mcp;
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
      'account_setting',
      'account_inform',
      'account_promotion',
      'account_thirdParty',
      'account',
      'account_team',
      'account_model',
      'dashboard_mcp'
    ];
    resources: I18nNamespaces;
  }
}
