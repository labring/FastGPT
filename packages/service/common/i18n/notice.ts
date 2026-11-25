import { i18nT } from '@fastgpt/global/common/i18n/utils';
import type { NodeHttpResponse } from '../../types/http';
import { translateApiMessage, translateApiMessageWithDefaultLocale } from './request';

/** Agent 节点失败时面向终端用户的通用提示（与内部错误摘要无关）。 */
export const AGENT_RUN_FAILED_NOTICE_I18N_KEY = i18nT('chat:agent_run_failed_notice');
/** Agent 节点失败时的兜底提示（内部上下文使用，同样不含错误摘要）。 */
export const AGENT_RUN_FAILED_FALLBACK_I18N_KEY = i18nT('chat:agent_run_failed_fallback');
/** 工作流/渠道终态失败时面向终端用户的通用提示。 */
export const APP_RUN_FAILED_NOTICE_I18N_KEY = i18nT('chat:app_run_failed_notice');

// 默认语言资源不可用时的内置兜底，保证面向用户的出口永远不是空串或 `ns:key` 字面量。
const DEFAULT_AGENT_RUN_FAILED_NOTICE =
  'The agent run failed. Please try again later or contact the app administrator.';
const DEFAULT_APP_RUN_FAILED_NOTICE =
  'The run failed. Please try again later or contact the app administrator.';

/**
 * 解析面向终端用户的静态失败提示：请求语言 → 默认语言 → 内置文案。
 * 只接受静态 key，调用方不得把内部错误摘要传进来。
 */
export const resolveStaticNoticeText = async ({
  key,
  defaultText,
  res
}: {
  key: string;
  defaultText: string;
  res?: NodeHttpResponse;
}): Promise<string> => {
  const localized = translateApiMessage(key, res);
  if (localized !== key) return localized;

  // 后台/渠道回调没有请求上下文：按默认语言解析，不跳过提示。
  const defaultLocalized = await translateApiMessageWithDefaultLocale(key, res);
  return defaultLocalized !== key ? defaultLocalized : defaultText;
};

/** Agent 节点失败提示：公开分享与后台运行共用同一份可公开文案。 */
export const resolveAgentRunFailedNotice = (res?: NodeHttpResponse): Promise<string> =>
  resolveStaticNoticeText({
    key: AGENT_RUN_FAILED_NOTICE_I18N_KEY,
    defaultText: DEFAULT_AGENT_RUN_FAILED_NOTICE,
    res
  });

/** 内部上下文的 Agent 兜底提示：本地化 key，无上下文时按默认语言解析。 */
export const resolveAgentRunFailedFallback = (res?: NodeHttpResponse): Promise<string> =>
  resolveStaticNoticeText({
    key: AGENT_RUN_FAILED_FALLBACK_I18N_KEY,
    defaultText: DEFAULT_AGENT_RUN_FAILED_NOTICE,
    res
  });

/** 渠道/工作流终态失败提示：终端用户可见，不能包含内部错误摘要。 */
export const resolveAppRunFailedNotice = (res?: NodeHttpResponse): Promise<string> =>
  resolveStaticNoticeText({
    key: APP_RUN_FAILED_NOTICE_I18N_KEY,
    defaultText: DEFAULT_APP_RUN_FAILED_NOTICE,
    res
  });
