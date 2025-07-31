import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { type InitChatResponse } from './api';

export const defaultChatData: InitChatResponse = {
  chatId: '',
  appId: '',
  app: {
    name: 'Loading',
    avatar: '/icon/logo.svg',
    intro: '',
    canUse: false,
    type: AppTypeEnum.simple,
    pluginInputs: []
  },
  title: '',
  variables: {}
};

export enum GetChatTypeEnum {
  normal = 'normal',
  outLink = 'outLink',
  team = 'team'
}

// ---------- chat setting -----------------//
export enum ChatSidebarPaneEnum {
  SETTING = 'setting',
  TEAM_APPS = 'team_apps',
  RECENTLY_USED_APPS = 'recently_used_apps',

  // these two features are only available in the commercial version
  HOME = 'home',
  FAVORITE_APPS = 'favorite_apps'
}

/**
 * 0: expanded
 * 1: folded
 */
export type CollapseStatusType = 0 | 1;
export const defaultCollapseStatus: CollapseStatusType = 0; // default expanded

export enum ChatSettingTabOptionEnum {
  HOME = 'home',
  COPYRIGHT = 'copyright',
  FAVORITE_APPS = 'favorite_apps',
  LOGS = 'logs'
}
