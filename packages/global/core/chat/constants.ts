import { i18nT } from '../../../web/i18n/utils';

export enum ChatRoleEnum {
  System = 'System',
  Human = 'Human',
  AI = 'AI'
}
export const ChatRoleMap = {
  [ChatRoleEnum.System]: {
    name: '系统'
  },
  [ChatRoleEnum.Human]: {
    name: '用户'
  },
  [ChatRoleEnum.AI]: {
    name: 'AI'
  }
};

export enum ChatFileTypeEnum {
  image = 'image',
  file = 'file'
}

export enum ChatSourceEnum {
  test = 'test',
  online = 'online',
  share = 'share',
  api = 'api',
  cronJob = 'cronJob',
  team = 'team',
  feishu = 'feishu',
  official_account = 'official_account',
  wecom = 'wecom',
  wechat = 'wechat',
  mcp = 'mcp'
}

export const ChatSourceMap = {
  [ChatSourceEnum.test]: {
    name: i18nT('common:core.chat.logs.test'),
    color: '#5E8FFF'
  },
  [ChatSourceEnum.online]: {
    name: i18nT('common:core.chat.logs.online'),
    color: '#47B2FF'
  },
  [ChatSourceEnum.share]: {
    name: i18nT('common:core.chat.logs.share'),
    color: '#9E8DFB'
  },
  [ChatSourceEnum.api]: {
    name: i18nT('common:core.chat.logs.api'),
    color: '#D389F6'
  },
  [ChatSourceEnum.cronJob]: {
    name: i18nT('chat:source_cronJob'),
    color: '#FF81AE'
  },
  [ChatSourceEnum.team]: {
    name: i18nT('common:core.chat.logs.team'),
    color: '#42CFC6'
  },
  [ChatSourceEnum.feishu]: {
    name: i18nT('common:core.chat.logs.feishu'),
    color: '#39CC83'
  },
  [ChatSourceEnum.official_account]: {
    name: i18nT('common:core.chat.logs.official_account'),
    color: '#FDB022'
  },
  [ChatSourceEnum.wecom]: {
    name: i18nT('common:core.chat.logs.wecom'),
    color: '#FD853A'
  },
  [ChatSourceEnum.wechat]: {
    name: i18nT('common:core.chat.logs.wechat'),
    color: '#07C160'
  },
  [ChatSourceEnum.mcp]: {
    name: i18nT('common:core.chat.logs.mcp'),
    color: '#F97066'
  }
};

export enum ChatStatusEnum {
  loading = 'loading',
  running = 'running',
  finish = 'finish'
}

export enum GetChatTypeEnum {
  normal = 'normal',
  outLink = 'outLink',
  team = 'team',
  home = 'home'
}

export enum ChatGenerateStatusEnum {
  generating = 0,
  done = 1,
  error = 2
}

/**
 * Opt-in header for enabling Redis-backed SSE resume buffering on chat stream endpoints.
 * Third-party clients that do not need `/api/core/chat/resume` should omit it.
 */
export const STREAM_RESUME_REQUEST_HEADER = 'x-fastgpt-stream-resume';
export const STREAM_RESUME_REQUEST_HEADER_ENABLED = '1';
