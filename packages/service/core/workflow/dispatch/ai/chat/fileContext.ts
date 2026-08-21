import type { UserChatItemFileItemType } from '@fastgpt/global/core/chat/type';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { parseUrlToFileType } from '../../../utils/context';

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
 * 把节点输入的文件链接转换成聊天消息文件结构；无法识别的链接会被过滤。
 */
export const getInputFiles = ({ fileLinks = [] }: { fileLinks?: string[] }) => {
  return fileLinks
    .map((url) => parseUrlToFileType(url))
    .filter((file): file is UserChatItemFileItemType => Boolean(file));
};
