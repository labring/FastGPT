import { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  ChatItemValueItemType,
  ChatSiteItemType,
  ToolModuleResponseItemType
} from '@fastgpt/global/core/chat/type';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';

export type generatingMessageProps = {
  event: SseResponseEventEnum;
  text?: string;
  name?: string;
  status?: 'running' | 'finish';
  tool?: ToolModuleResponseItemType;
  variables?: Record<string, any>;
};

export type UserInputFileItemType = {
  id: string;
  rawFile?: File;
  type: `${ChatFileTypeEnum}`;
  name: string;
  icon: string; // img is base64
  url?: string;
};

export type ChatBoxInputFormType = {
  input: string;
  files: UserInputFileItemType[];
  variables: Record<string, any>;
  chatStarted: boolean;
};

export type ChatBoxInputType = {
  text?: string;
  files?: UserInputFileItemType[];
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
