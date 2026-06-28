import { i18nT } from '../../common/i18n/utils';

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
  audio = 'audio',
  video = 'video',
  file = 'file'
}

export enum ChatSourceEnum {
  test = 'test',
  online = 'online',
  share = 'share',
  api = 'api',
  cronJob = 'cronJob',
  feishu = 'feishu',
  official_account = 'official_account',
  wecom = 'wecom',
  wechat = 'wechat',
  mcp = 'mcp'
}

/**
 * 会话所属资源类型。
 *
 * `ChatSourceEnum` 表示对话入口来源，例如 test/api/online。
 * `ChatSourceTypeEnum` 表示会话归属资源类型，用于在同一套 chat 表中隔离 App 和 Skill Edit。
 */
export enum ChatSourceTypeEnum {
  app = 'app',
  skillEdit = 'skillEdit'
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
