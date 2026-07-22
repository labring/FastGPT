import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import {
  getSystemPrompt_ChatItemType,
  runtimePrompt2ChatsValue
} from '@fastgpt/global/core/chat/adapt';
import type { ChatItemMiniType, UserChatItemFileItemType } from '@fastgpt/global/core/chat/type';
import { SANDBOX_USER_FILES_PATH } from '@fastgpt/global/core/ai/sandbox/constants';
import { parseUrlToFileType } from '../../../../utils/context';
import {
  rewriteWorkflowAIHistoryMessageWithFiles,
  rewriteWorkflowAIUserMessageWithFiles
} from '../../fileContext';
import type { DispatchToolModuleProps, FileInputType } from '../type';

const getUserFilesFromLinks = ({ fileLinks = [] }: { fileLinks?: string[] }) => {
  return fileLinks
    .map((url) => parseUrlToFileType(url))
    .filter(Boolean) as UserChatItemFileItemType[];
};

export const useToolMessages = async ({
  defaultSystemPrompt,
  systemPrompt,
  chatHistories,
  responseChatItemId,
  userChatInput,
  fileLinks,
  parseHistoryFiles,
  lastInteractive,
  isEntry,
  chatConfig,
  useSandbox
}: {
  defaultSystemPrompt?: string;
  systemPrompt?: string;
  chatHistories: ChatItemMiniType[];
  responseChatItemId?: string;
  userChatInput: string;
  fileLinks?: string[];
  parseHistoryFiles: boolean;
  lastInteractive: DispatchToolModuleProps['lastInteractive'];
  isEntry?: boolean;
  chatConfig: DispatchToolModuleProps['chatConfig'];
  useSandbox: boolean;
}) => {
  const currentInputFiles: FileInputType[] = [];
  const userFiles = getUserFilesFromLinks({ fileLinks });
  const concatenateSystemPrompt = [defaultSystemPrompt, systemPrompt]
    .filter(Boolean)
    .join('\n\n-----\n\n');
  const isInteractiveResume = !!lastInteractive && !!isEntry;
  const historyMessages: ChatItemMiniType[] = [
    ...getSystemPrompt_ChatItemType(concatenateSystemPrompt),
    ...chatHistories
  ];
  const maxFiles = chatConfig?.fileSelectConfig?.maxFiles ?? 20;

  /**
   * 文件链接会作为 model URL 暴露给 LLM，供 read_files 和其他工具直接使用。
   * 当前轮输入文件额外记录下来，用于 sandbox 场景先上传到隔离目录。
   */
  const transformFiles = useSandbox
    ? (files: FileInputType[]) =>
        files.map((file) => ({
          ...file,
          sandboxPath: `${SANDBOX_USER_FILES_PATH}${file.name}`
        }))
    : undefined;
  const messages = historyMessages.map(
    (message) =>
      rewriteWorkflowAIHistoryMessageWithFiles({
        message,
        maxFiles,
        parseHistoryFiles,
        transformFiles
      }).message
  );

  // child interactive 的用户输入由子 workflow 消费，不作为父模型的新 user message。
  // 历史中的上一条 AI tool_call 必须保留，provider 依赖它恢复原 call 名称和参数。
  if (!isInteractiveResume) {
    const { message, files } = rewriteWorkflowAIUserMessageWithFiles({
      message: {
        dataId: responseChatItemId,
        obj: ChatRoleEnum.Human,
        value: runtimePrompt2ChatsValue({
          text: userChatInput,
          files: userFiles
        })
      },
      maxFiles,
      transformFiles
    });
    messages.push(message);
    currentInputFiles.push(...files);
  }

  return {
    messages,
    currentInputFiles
  };
};
