import type { StreamResponseType } from '@/web/common/api/fetch';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import type {
  ChatHistoryItemResType,
  type AIChatItemValueItemType,
  type ToolModuleResponseItemType
} from '@fastgpt/global/core/chat/type';
import type { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type {
  UserInputInteractive,
  WorkflowInteractiveResponseType
} from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { TopAgentFormDataType } from '@fastgpt/service/core/chat/HelperBot/dispatch/topAgent/type';
import type { GeneratedSkillDataType } from '@fastgpt/global/core/chat/helperBot/generatedSkill/type';

export type generatingMessageProps = {
  event: SseResponseEventEnum;
  responseValueId?: string;
  stepId?: string;

  text?: string;
  reasoningText?: string;
  name?: string;
  status?: 'running' | 'finish';
  tool?: ToolModuleResponseItemType;
  interactive?: WorkflowInteractiveResponseType;
  variables?: Record<string, any>;
  nodeResponse?: ChatHistoryItemResType;
  durationSeconds?: number;

  // HelperBot
  collectionForm?: UserInputInteractive;
  formData?: TopAgentFormDataType;
  generatedSkill?: GeneratedSkillDataType;
};

export type StartChatFnProps = {
  messages: ChatCompletionMessageParam[];
  responseChatItemId?: string;
  controller: AbortController;
  variables: Record<string, any>;
  generatingMessage: (e: generatingMessageProps) => void;
};

export type onStartChatType = (e: StartChatFnProps) => Promise<
  StreamResponseType & {
    isNewChat?: boolean;
  }
>;
