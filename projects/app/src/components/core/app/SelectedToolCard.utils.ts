import type { TFunction } from 'next-i18next';
import type { SelectedToolItemType } from '@fastgpt/global/core/app/formEdit/type';
import { getToolConfigStatus } from '@fastgpt/global/core/app/formEdit/utils';
import { isDebugToolSource } from '@fastgpt/global/core/app/tool/utils';
import { getToolErrorMessage } from '@/web/core/workflow/check/message';

/**
 * 计算工具卡片需要展示的状态。
 *
 * 错误状态优先使用服务端注入的 `pluginData.error`；`configStatus` 未持久化时，
 * 仅在节点带有完整 inputs 的情况下按必填项重新推断，避免紧凑工具配置误判。
 * 返回的 `errorMessage` 统一供红框、红名和错误 Tag 使用。
 */
export const getSelectedToolCardState = ({
  tool,
  t
}: {
  tool: SelectedToolItemType;
  t: TFunction;
}) => {
  const status = tool.status ?? tool.pluginData?.status;
  const toolError = getToolErrorMessage({
    status,
    error: tool.pluginData?.error,
    t
  });

  // Agent V2 生成的紧凑工具配置只有 { key, mode }，没有完整 input 定义，跳过静态配置推断。
  const hasFullInputs =
    Array.isArray(tool.inputs) &&
    tool.inputs.some((input) => Array.isArray((input as any)?.renderTypeList));
  const configStatus =
    tool.configStatus ?? (hasFullInputs ? getToolConfigStatus({ tool }).status : undefined);

  const errorMessage =
    toolError ?? (configStatus === 'invalid' ? t('common:tool_invalid') : undefined);

  return {
    status,
    errorMessage,
    hasToolError: !!errorMessage,
    isWaitingForConfig: configStatus === 'waitingForConfig',
    isDebugTool: isDebugToolSource(tool.source)
  };
};
