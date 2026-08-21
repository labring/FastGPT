import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import { chatValue2RuntimePrompt, runtimePrompt2ChatsValue } from '@fastgpt/global/core/chat/adapt';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import {
  buildAgentLoopCoreUserReminderInput,
  type AgentLoopCoreUserReminderContext
} from './reminder';

export type AgentLoopCoreInputFile = {
  name: string;
  type: ChatFileTypeEnum;
  url: string;
  sandboxPath?: string;
};

type RewriteAgentLoopCoreUserMessageWithFilesParams = {
  message: ChatItemMiniType;
  files: AgentLoopCoreInputFile[];
  query?: string;
  reminderContext?: AgentLoopCoreUserReminderContext;
};

/**
 * 使用 AgentLoop 文件语义改写 Human 消息。
 *
 * 文档只进入 reminder，供 read_files 按 URL 读取；图片、音频和视频继续作为独立消息项
 * 传给模型。文件 URL 的鉴权、归一化和去重由外层业务适配器完成。
 */
export const rewriteAgentLoopCoreUserMessageWithFiles = ({
  message,
  files,
  query: inputQuery,
  reminderContext
}: RewriteAgentLoopCoreUserMessageWithFilesParams): ChatItemMiniType => {
  if (files.length === 0 && !reminderContext && inputQuery === undefined) return message;

  const { text: messageQuery = '' } = chatValue2RuntimePrompt(message.value);

  return {
    ...message,
    value: runtimePrompt2ChatsValue({
      files: files
        .filter((file) => file.type !== ChatFileTypeEnum.file)
        .map(({ name, type, url }) => ({ name, type, url })),
      text: buildAgentLoopCoreUserReminderInput({
        query: inputQuery ?? messageQuery,
        filesInfo: files,
        ...reminderContext
      })
    })
  };
};
