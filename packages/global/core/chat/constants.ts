import type { I18nStringType } from '../../common/i18n/type';
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
  skillEdit = 'skillEdit',
  chatAgentHelper = 'chatAgentHelper'
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
 * 自动执行首轮的 query 哨兵值。
 *
 * 应用开启「自动执行」但未配置默认提示词时，前端用该占位文本触发首轮运行，保证工作流拿到的
 * query 结构稳定。服务端不再基于该文本生成会话标题，改用 `CHAT_FIXED_TITLE_I18N.autoExecute`
 * 的本地化固定文案。字面值本身也是历史存量标题，仍保留在可覆盖白名单中以便后续轮次自愈。
 */
export const AUTO_EXECUTE_QUERY_SENTINEL = 'AUTO_EXECUTE';

/** 会话标题固定文案的场景键。 */
export type ChatFixedTitleKey = 'autoExecute' | 'uploadFile';

/**
 * 会话标题固定文案（自动执行 / 只发文件开启对话）。
 *
 * 文案唯一来源是 `packages/web/i18n/{locale}/chat.json` 的 `chat_title_auto_execute` 与
 * `chat_title_upload_file`；`packages/service` 不能依赖 `packages/web`，因此这里保留一份等价
 * 常量供服务端按 locale 取值，两边一致性由 `packages/web/test/i18n/chatFixedTitle.test.ts` 保证。
 *
 * 落库的是具体语言文字而不是 i18n key：`title` 会被 CSV 导出、外部日志推送、OpenAPI 响应、
 * SSE `chatTitle` 事件和日志标题正则搜索直接消费，存 key 会把内部标识泄漏到这些出口。
 */
export const CHAT_FIXED_TITLE_I18N = {
  autoExecute: {
    // 英文展示文案与 sentinel（`AUTO_EXECUTE`）是两个独立值：sentinel 是前后端 query 协议字面值，
    // 这里只是用户可见的会话标题。两者都在可覆盖白名单里，因此存量 sentinel 标题和新英文标题
    // 都能在下一轮被真实标题覆盖，不需要互相相等。
    en: 'AUTO EXECUTE',
    'zh-CN': '自动执行',
    'zh-Hant': '自動執行',
    'ko-KR': '자동 실행'
  },
  uploadFile: {
    en: 'File Upload',
    'zh-CN': '上传文件',
    'zh-Hant': '檔案上傳',
    'ko-KR': '파일 업로드'
  }
} satisfies Record<ChatFixedTitleKey, I18nStringType>;

/**
 * Opt-in header for enabling Redis-backed SSE resume buffering on chat stream endpoints.
 * Third-party clients that do not need `/api/core/chat/resume` should omit it.
 */
export const STREAM_RESUME_REQUEST_HEADER = 'x-fastgpt-stream-resume';
export const STREAM_RESUME_REQUEST_HEADER_ENABLED = '1';
