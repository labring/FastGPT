export const HUMAN_ICON = `/icon/human.svg`;
export const LOGO_ICON = `/icon/logo.svg`;
export const HUGGING_FACE_ICON = `/imgs/model/huggingface.svg`;

export const DEFAULT_TEAM_AVATAR = `/imgs/avatar/defaultTeamAvatar.svg`;
export const DEFAULT_ORG_AVATAR = '/imgs/avatar/defaultOrgAvatar.svg';
export const DEFAULT_USER_AVATAR = '/imgs/avatar/BlueAvatar.svg';

export const isDevEnv = process.env.NODE_ENV === 'development';
export const isProduction = process.env.NODE_ENV === 'production';
export const isTestEnv = process.env.NODE_ENV === 'test';
export const isPhaseProductionBuild = process.env.NEXT_PHASE === 'phase-production-build';

export const FASTGPT_PRO_TOKEN_HEADER = 'x-fastgpt-pro-token';
/** 客户端语言偏好请求头；Cookie 不可用时供服务端恢复用户语言。 */
export const FASTGPT_LANGUAGE_HEADER = 'x-fastgpt-language';
/** 分享页语言偏好请求头；优先于主站语言 Cookie，避免分享语言被主站语言覆盖。 */
export const FASTGPT_SHARE_LANGUAGE_HEADER = 'x-fastgpt-share-language';
export const FASTGPT_WEB_REQUEST_HEADER = 'fastgpt-web-request';

export const FASTGPT_WEB_REQUEST_VALUE = '1';
