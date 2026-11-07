export enum ChatSidebarPaneEnum {
  SETTING = 's',
  ALL_APPS = 'aa',
  RECENTLY_USED_APPS = 'ra',

  // these two features are only available in the commercial version
  HOME = 'h'
}

/**
 * 0: expanded
 * 1: folded
 */
export type CollapseStatusType = 0 | 1;
export const defaultCollapseStatus: CollapseStatusType = 0; // default expanded

export enum ChatSettingTabOptionEnum {
  HOME = 'h',
  DATA_DASHBOARD = 'd',
  LOG_DETAILS = 'l',
  FAVOURITE_APPS = 'f'
}

/**
 * 全部应用页（pane=aa）的子页签，通过 URL 的 tab 参数直达。
 *
 * 注意：tab 参数按 pane 复用，这里的取值不能与 ChatSettingTabOptionEnum 冲突；
 * 取值本身是外部链接契约，调整时需要兼容历史链接。
 */
export enum ChatAllAppTabEnum {
  FAVOURITE_APPS = 'fa',
  TEAM_APPS = 'ta'
}

export const DEFAULT_LOGO_BANNER_URL = '/imgs/chat/fastgpt_banner.svg';
export const DEFAULT_LOGO_BANNER_COLLAPSED_URL = '/imgs/chat/fastgpt_banner_fold.svg';
