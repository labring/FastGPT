import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { prepareWorkflowFiles } from '../../../utils/context';

/**
 * 根据 AI Chat 节点的文件链接输入计算文件上下文开关。
 *
 * `fileUrlList` 的绑定状态同时控制当前显式文件输入和历史文件解析，避免节点未绑定
 * 文件链接时从聊天记录中恢复旧文件。
 */
export const getAIChatFileContextConfig = ({
  inputs,
  rawFileLinks
}: {
  inputs: FlowNodeInputItemType[];
  rawFileLinks?: string[];
}) => {
  const fileUrlInput = inputs.find((item) => item.key === NodeInputKeyEnum.fileUrlList);
  const hasFileUrlInput = !!fileUrlInput?.value?.length;

  return {
    fileLinks: hasFileUrlInput ? rawFileLinks : undefined,
    parseHistoryFiles: hasFileUrlInput
  };
};

/**
 * 按 Workflow 额度、准入和登记规则准备节点文件；类型未知时保留为普通文件。
 * 不支持的地址会跳过，域名策略拒绝则抛错，避免将校验失败误当作类型未知。
 */
export const getInputFiles = async ({ fileLinks = [] }: { fileLinks?: string[] }) => {
  return prepareWorkflowFiles({ files: fileLinks.map((url) => ({ url })) });
};
