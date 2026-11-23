/**
 * sandbox failed 事件的文案映射与最终错误卡片解析（纯函数，便于单测）。
 *
 * 服务端 failed 事件会带 step：`upgrade` 表示配置收敛/升级阶段失败，
 * `prepare` 表示运行环境准备失败。历史事件没有 step，必须回退到原通用文案，
 * 避免旧后端返回时前端显示空文案。
 */
import type { TFunction } from 'i18next';

export type SandboxFailedStep = 'upgrade' | 'prepare';

export type SandboxFailedLabelKey =
  | 'sandbox_status_failed_prepare'
  | 'sandbox_status_failed_prepare_with_message'
  | 'sandbox_status_failed_upgrade'
  | 'sandbox_status_failed_upgrade_with_message'
  | 'sandbox_status_failed_with_message'
  | 'sandbox_status_failed';

export type SandboxFailedLabel = {
  key: SandboxFailedLabelKey;
  values?: { message: string };
};

/** failed 事件留在消息上的失败上下文；后续节点错误不得覆盖它。 */
export type SandboxErrorContext = {
  step?: string;
  message?: string;
};

export type ChatItemErrorContent = {
  title: string;
  message: string;
  /** 次要信息：覆盖过 moduleName 的最终失败节点名。 */
  secondary?: string;
};

/** 按失败环节与是否带 message 选择 i18n key；无 step 时保持旧行为。 */
export const getSandboxFailedLabel = (
  step: string | undefined,
  message: string | undefined
): SandboxFailedLabel => {
  const values = typeof message === 'string' && message.length > 0 ? { message } : undefined;

  if (step === 'upgrade') {
    return values
      ? { key: 'sandbox_status_failed_upgrade_with_message', values }
      : { key: 'sandbox_status_failed_upgrade' };
  }
  if (step === 'prepare') {
    return values
      ? { key: 'sandbox_status_failed_prepare_with_message', values }
      : { key: 'sandbox_status_failed_prepare' };
  }

  return values
    ? { key: 'sandbox_status_failed_with_message', values }
    : { key: 'sandbox_status_failed' };
};

/**
 * 把 label 翻译成文案。
 *
 * 每个 key 都用字面量调用 `t`，禁止拼接 `chat:sandbox_status_${...}` 之类的动态 key，
 * 否则静态资源检查无法发现缺失的翻译。
 */
export const translateSandboxFailedLabel = (label: SandboxFailedLabel, t: TFunction): string => {
  switch (label.key) {
    case 'sandbox_status_failed_prepare':
      return t('chat:sandbox_status_failed_prepare');
    case 'sandbox_status_failed_prepare_with_message':
      return t('chat:sandbox_status_failed_prepare_with_message', label.values!);
    case 'sandbox_status_failed_upgrade':
      return t('chat:sandbox_status_failed_upgrade');
    case 'sandbox_status_failed_upgrade_with_message':
      return t('chat:sandbox_status_failed_upgrade_with_message', label.values!);
    case 'sandbox_status_failed_with_message':
      return t('chat:sandbox_status_failed_with_message', label.values!);
    case 'sandbox_status_failed':
      return t('chat:sandbox_status_failed');
  }
};

/**
 * 处理 sandbox 状态事件时写入 item 的失败上下文。
 *
 * 只有 failed 是终态；后续 successful 状态必须清空旧上下文，避免重试成功后仍展示旧原因。
 */
export const getSandboxErrorPatch = (status: {
  phase: string;
  step?: string;
  message?: string;
}): { sandboxError?: SandboxErrorContext } => {
  if (status.phase !== 'failed') return { sandboxError: undefined };

  const step = status.step === 'upgrade' || status.step === 'prepare' ? status.step : undefined;
  const message = status.message && status.message.length > 0 ? status.message : undefined;
  return { sandboxError: { step, message } };
};

/**
 * 解析聊天气泡底部错误卡片内容。
 *
 * 存在 sandbox 失败上下文时，标题优先展示失败环节，正文优先展示 provider 可展示原因；
 * 被后续 Agent/ToolCall 节点错误覆盖的节点名降为次要信息。没有 sandbox 上下文时保持
 * 原有“运行错误 - 节点名 / 节点错误文案”的行为。
 */
export const resolveChatItemErrorContent = ({
  errorMsg,
  errorText,
  moduleName,
  sandboxError,
  logErrorPrefix,
  t
}: {
  errorMsg?: string;
  errorText?: { moduleName?: string; errorText?: string };
  moduleName?: string;
  sandboxError?: SandboxErrorContext;
  logErrorPrefix: string;
  t: TFunction;
}): ChatItemErrorContent | undefined => {
  if (!errorMsg && !errorText) return undefined;

  const nodeName = errorText?.moduleName || moduleName;
  const nodeNameText = nodeName ? t(nodeName) : undefined;

  if (sandboxError) {
    const phaseLabel = translateSandboxFailedLabel(
      getSandboxFailedLabel(sandboxError.step, undefined),
      t
    );
    const message =
      sandboxError.message ||
      (errorText?.errorText ? t(errorText.errorText) : undefined) ||
      (errorMsg ? t(errorMsg) : undefined) ||
      t('Unknow error');

    return {
      title: `${logErrorPrefix} - ${phaseLabel}`,
      message,
      secondary: nodeNameText
    };
  }

  return {
    title: nodeNameText ? `${logErrorPrefix} - ${nodeNameText}` : logErrorPrefix,
    message: t(errorText?.errorText || errorMsg || 'Unknow error')
  };
};
