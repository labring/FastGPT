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
  FAVORITE_APPS = 'favorite_apps',
  DATA_DASHBOARD = 'data_dashboard',
  LOG_DETAILS = 'log_details'
}

export const DEFAULT_LOGO_BANNER_URL = '/imgs/chat/fastgpt_banner.svg';
export const DEFAULT_LOGO_BANNER_COLLAPSED_URL = '/imgs/chat/fastgpt_banner_fold.svg';
