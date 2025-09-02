import 'i18next';
import type account_team from './zh-CN/account_team.json';
import type account from './zh-CN/account.json';
import type account_thirdParty from './zh-CN/account_thirdParty.json';
import type account_promotion from './zh-CN/account_promotion.json';
import type account_inform from './zh-CN/account_inform.json';
import type account_setting from './zh-CN/account_setting.json';
import type account_apikey from './zh-CN/account_apikey.json';
import type account_bill from './zh-CN/account_bill.json';
import type account_usage from './zh-CN/account_usage.json';
import type account_info from './zh-CN/account_info.json';
import type common from './zh-CN/common.json';
import type dataset from './zh-CN/dataset.json';
import type app from './zh-CN/app.json';
import type file from './zh-CN/file.json';
import type publish from './zh-CN/publish.json';
import type workflow from './zh-CN/workflow.json';
import type user from './zh-CN/user.json';
import type chat from './zh-CN/chat.json';
import type login from './zh-CN/login.json';
import type account_model from './zh-CN/account_model.json';
import type dashboard_mcp from './zh-CN/dashboard_mcp.json';
import type { I18N_NAMESPACES } from './constants';

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
  dashboard_evaluation: typeof dashboard_evaluation;
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
    defaultNS: I18N_NAMESPACES;
    resources: I18nNamespaces;
  }
}
