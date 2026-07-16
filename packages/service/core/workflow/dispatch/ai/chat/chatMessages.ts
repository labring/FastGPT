import { filterGPTMessageByMaxContext } from '../../../../ai/llm/utils';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import {
  chats2GPTMessages,
  getSystemPrompt_ChatItemType,
  runtimePrompt2ChatsValue
} from '@fastgpt/global/core/chat/adapt';
import type { ChatItemMiniType, UserChatItemFileItemType } from '@fastgpt/global/core/chat/type';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';
import type { ChatDispatchProps } from '../../../types/runtime';
import { parseFileContentFromUrls } from '../../../../chat/fileContext';
import { rewriteChatMessagesWithFiles } from './fileContext';

/**
 * 组装系统提示、历史、当前输入和文件上下文，并按模型上下文限制裁剪为 LLM 消息。
 */
export const getChatMessages = async ({
  model,
  maxTokens = 0,
  histories = [],
  datasetCiteSystemPrompt,
  systemPrompt,
  userChatInput,
  userFiles,
  parseHistoryFiles,
  requestOrigin,
  maxFiles,
  customPdfParse,
  usageId,
  runningUserInfo
}: {
  model: LLMModelItemType;
  maxTokens?: number;
  histories: ChatItemMiniType[];

  datasetCiteSystemPrompt?: string;
  systemPrompt: string;

  userChatInput: string;
  userFiles: UserChatItemFileItemType[];
  parseHistoryFiles: boolean;

  requestOrigin?: string;
  maxFiles: number;
  customPdfParse?: boolean;
  usageId?: string;
  runningUserInfo: ChatDispatchProps['runningUserInfo'];
}) => {
  const concatenateSystemPrompt = [
    model.defaultSystemChatPrompt,
    systemPrompt,
    datasetCiteSystemPrompt
  ]
    .filter(Boolean)
    .join('\n\n===---===---===\n\n');

  const rawUserMessages: ChatItemMiniType[] = [
    ...getSystemPrompt_ChatItemType(concatenateSystemPrompt),
    ...histories,
    {
      obj: ChatRoleEnum.Human,
      value: runtimePrompt2ChatsValue({
        files: userFiles,
        text: userChatInput
      })
    }
  ];

  const messages = await rewriteChatMessagesWithFiles({
    messages: rawUserMessages,
    parseHistoryFiles,
    parseFileFn: async (urls) => {
      const files = await parseFileContentFromUrls({
        urls,
        requestOrigin,
        maxFiles,
        teamId: runningUserInfo.teamId,
        tmbId: runningUserInfo.tmbId,
        customPdfParse,
        usageId
      });

      return files.map((file) => ({
        name: file.name,
        url: file.url,
        content: file.content
      }));
    }
  });

  const adaptMessages = chats2GPTMessages({
    messages,
    reserveId: false
  });

  return await filterGPTMessageByMaxContext({
    messages: adaptMessages,
    maxContext: model.maxContext - maxTokens // filter token. not response maxToken
  });
};
