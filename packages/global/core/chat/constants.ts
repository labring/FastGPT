import { i18nT } from '../../common/i18n/utils';
import type { I18nStringType } from '../../common/i18n/type';
import { parseI18nString } from '../../common/i18n/utils';

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

export enum ChatItemValueTypeEnum {
  text = 'text',
  file = 'file',
  reasoning = 'reasoning',
  tool = 'tool',
  interactive = 'interactive'
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
  evaluation = 'evaluation',
  wechat = 'wechat',
  mcp = 'mcp',
  workflow = 'workflow'
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
  [ChatSourceEnum.workflow]: {
    name: i18nT('common:core.chat.logs.workflow'),
    color: '#A78BFA'
  },
  [ChatSourceEnum.mcp]: {
    name: i18nT('common:core.chat.logs.mcp'),
    color: '#F97066'
  },
  [ChatSourceEnum.evaluation]: {
    name: i18nT('common:core.chat.logs.evaluation'),
    color: '#8B5CF6'
  }
};

/** I18n prefix for each chat source, used to construct sourceName like "在线使用-测试" */
export const ChatSourcePrefix: Record<ChatSourceEnum, I18nStringType> = {
  // test 来源不走此后台拼接——chatTest.ts 前端 postMessage
  // 已通过 chat_test_app 词条完成国际化拼接，后台直接使用即可
  [ChatSourceEnum.test]: {
    'zh-CN': '调试',
    'zh-Hant': '除錯',
    en: 'Debug'
  },
  [ChatSourceEnum.online]: {
    'zh-CN': '在线使用',
    'zh-Hant': '線上使用',
    en: 'Online operation'
  },
  [ChatSourceEnum.share]: {
    'zh-CN': '外部链接调用',
    'zh-Hant': '外部連結呼叫',
    en: 'External link call'
  },
  [ChatSourceEnum.api]: {
    'zh-CN': 'API 调用',
    'zh-Hant': 'API 呼叫',
    en: 'API call'
  },
  [ChatSourceEnum.cronJob]: {
    'zh-CN': '定时执行',
    'zh-Hant': '定時執行',
    en: 'Scheduled execution'
  },
  [ChatSourceEnum.team]: {
    'zh-CN': '团队空间对话',
    'zh-Hant': '團隊空間對話',
    en: 'Chat with team members'
  },
  [ChatSourceEnum.feishu]: {
    'zh-CN': '飞书',
    'zh-Hant': '飛書',
    en: 'Feishu'
  },
  [ChatSourceEnum.official_account]: {
    'zh-CN': '公众号',
    'zh-Hant': '官方帳號',
    en: 'WeChat official account'
  },
  [ChatSourceEnum.wecom]: {
    'zh-CN': '企业微信',
    'zh-Hant': '企業微信',
    en: 'WeCom'
  },
  [ChatSourceEnum.evaluation]: {
    'zh-CN': '评估测试',
    'zh-Hant': '評估測試',
    en: 'Evaluation test'
  },
  [ChatSourceEnum.wechat]: {
    'zh-CN': '微信',
    'zh-Hant': '微信',
    en: 'WeChat'
  },
  [ChatSourceEnum.mcp]: {
    'zh-CN': 'MCP 调用',
    'zh-Hant': 'MCP 調用',
    en: 'MCP call'
  },
  [ChatSourceEnum.workflow]: {
    'zh-CN': '工作流调用',
    'zh-Hant': '工作流調用',
    en: 'Workflow call'
  }
};

/**
 * Construct localized source name: "{i18n prefix}-{name}"
 * e.g. "在线使用-测试" (zh-CN) / "Online operation-Test" (en)
 */
export const getChatSourceName = (source: ChatSourceEnum, name: string, lang?: string): string => {
  const prefix = parseI18nString(ChatSourcePrefix[source], lang || 'zh-CN');
  return `${prefix}-${name}`;
};

export enum ChatStatusEnum {
  loading = 'loading',
  running = 'running',
  finish = 'finish'
}

export enum FeedbackFilterEnum {
  good = 'good',
  bad = 'bad',
  noFeedback = 'noFeedback'
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
