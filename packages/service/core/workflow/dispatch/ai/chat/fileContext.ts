import type { ChatItemMiniType, UserChatItemFileItemType } from '@fastgpt/global/core/chat/type';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { parseUrlToFileType } from '../../../utils/context';
import { rewriteChatMessagesWithFileContext } from '../../../../chat/fileContext';
import type { ChatMessageFileParser } from './type';

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
 * 在发送给 LLM 前把 Human 消息里的普通文件解析为文本。
 *
 * 当前轮 Human 消息始终允许根据已归一化的 `fileLinks` 解析；历史 Human 消息只有在
 * 节点显式绑定文件链接输入时才解析。未绑定时会移除历史 Human 的 file item，避免后续
 * 适配层继续从历史中生成 `file_url` / `image_url`。
 */
export const rewriteChatMessagesWithFiles = async ({
  messages,
  parseHistoryFiles,
  parseFileFn
}: {
  messages: ChatItemMiniType[];
  parseHistoryFiles: boolean;
  parseFileFn: ChatMessageFileParser;
}) => {
  return rewriteChatMessagesWithFileContext({
    messages,
    parseHistoryFiles,
    parseFileFn
  });
};

/**
 * 把节点输入的文件链接转换成聊天消息文件结构；无法识别的链接会被过滤。
 */
export const getInputFiles = ({ fileLinks = [] }: { fileLinks?: string[] }) => {
  return fileLinks
    .map((url) => parseUrlToFileType(url))
    .filter((file): file is UserChatItemFileItemType => Boolean(file));
};
