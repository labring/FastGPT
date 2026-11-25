import { LangEnum, type I18nStringType, type localeType } from '@fastgpt/global/common/i18n/type';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';

/**
 * Agent 失败且没有任何可读错误文本时的兜底气泡文案。
 *
 * 这段文字会进入聊天正文、非流式 API 与节点详情，因此必须按本轮语言解析后再作为
 * 普通答复发送，不能固定写死简体中文。文案来源是
 * `packages/web/i18n/{locale}/chat.json` 的 `agent_run_failed_fallback`；但
 * `packages/service` 不能依赖 `packages/web`，所以这里保留一份等价静态副本，
 * 与 `CHAT_FIXED_TITLE_I18N` 的处理方式一致。
 */
export const AGENT_ERROR_FALLBACK_TEXT_I18N: I18nStringType = {
  en: 'This run failed. Please try again.',
  'zh-CN': '本轮执行失败，请重试',
  'zh-Hant': '本輪執行失敗，請重試',
  'ko-KR': '이번 실행에 실패했습니다. 다시 시도해 주세요.'
};

/**
 * 按本轮语言取兜底文案；缺少语言上下文时回退简体中文，保持后台任务与旧调用方的
 * 既有展示语义。`parseI18nString` 内部还会在目标语言缺失时回退英文。
 */
export const getAgentErrorFallbackText = (lang?: localeType) =>
  parseI18nString(AGENT_ERROR_FALLBACK_TEXT_I18N, lang ?? LangEnum.zh_CN);
