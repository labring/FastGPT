/**
 * sandbox failed 事件的文案映射（纯函数，便于单测）。
 *
 * 服务端 failed 事件会带 step：`upgrade` 表示配置收敛/升级阶段失败，
 * `prepare` 表示运行环境准备失败。历史事件没有 step，必须回退到原通用文案，
 * 避免旧后端返回时前端显示空文案。
 */
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
