import { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  ChatItemValueItemType,
  ChatSiteItemType,
  ToolModuleResponseItemType
} from '@fastgpt/global/core/chat/type';
import { sseResponseEventEnum } from '@fastgpt/service/common/response/constant';

export type generatingMessageProps = {
  event: `${sseResponseEventEnum}`;
  text?: string;
  name?: string;
  status?: 'running' | 'finish';
  tool?: ToolModuleResponseItemType;
};

export type ChatBoxInputType = {
  text?: string;
  files?: ChatItemValueItemType['file'][];
};

export type StartChatFnProps = {
  chatList: ChatSiteItemType[];
  messages: ChatCompletionMessageParam[];
  controller: AbortController;
  variables: Record<string, any>;
  generatingMessage: (e: generatingMessageProps) => void;
};

export type ComponentRef = {
  getChatHistories: () => ChatSiteItemType[];
  resetVariables: (data?: Record<string, any>) => void;
  resetHistory: (history: ChatSiteItemType[]) => void;
  scrollToBottom: (behavior?: 'smooth' | 'auto') => void;
  sendPrompt: (question: string) => void;
};
