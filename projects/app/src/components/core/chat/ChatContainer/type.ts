import type { StreamResponseType } from '@/web/common/api/fetch';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import type {
  ChatHistoryItemResType,
  ToolModuleResponseItemType,
  SandboxStatusItemType,
  SkillModuleResponseItemType
} from '@fastgpt/global/core/chat/type';
import type { SseResponseEventEnum } from '@fastgpt/global/core/chat/stream/constants';
import type { StreamToolDeltaType } from '@fastgpt/global/core/chat/stream/sse';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { ChatAgentConfigFormDataType } from '@fastgpt/global/core/ai/auxiliaryGeneration/type';
import type { AuxiliaryGenerationEventEnum } from '@fastgpt/global/core/ai/auxiliaryGeneration/constants';
import type { AgentPlanStatusType, AgentPlanType } from '@fastgpt/global/core/ai/agent/type';

type BaseGeneratingMessageProps = {
  responseValueId?: string;

  text?: string;
  reasoningText?: string;
  name?: string;
  status?: 'running' | 'finish';
  interactive?: WorkflowInteractiveResponseType;
  variables?: Record<string, any>;
  nodeResponse?: ChatHistoryItemResType;
  durationSeconds?: number;
  title?: string;

  // Agent
  plan?: AgentPlanType;
  planStatus?: AgentPlanStatusType;

  // Sandbox
  sandboxStatus?: SandboxStatusItemType;
  skill?: SkillModuleResponseItemType;

  formData?: ChatAgentConfigFormDataType;
};

type ToolStreamEvent =
  | SseResponseEventEnum.toolCall
  | SseResponseEventEnum.toolParams
  | SseResponseEventEnum.toolResponse;

export type generatingMessageProps =
  | (BaseGeneratingMessageProps & {
      event: SseResponseEventEnum.toolCall;
      tool?: ToolModuleResponseItemType;
    })
  | (BaseGeneratingMessageProps & {
      event: SseResponseEventEnum.toolParams | SseResponseEventEnum.toolResponse;
      tool?: StreamToolDeltaType;
    })
  | (BaseGeneratingMessageProps & {
      event: Exclude<SseResponseEventEnum | AuxiliaryGenerationEventEnum, ToolStreamEvent>;
      tool?: never;
    });

export type StartChatFnProps = {
  messages: ChatCompletionMessageParam[];
  responseChatItemId?: string;
  interactive?: WorkflowInteractiveResponseType;
  controller: AbortController;
  variables: Record<string, any>;
  generatingMessage: (e: generatingMessageProps) => void;
};

export type onStartChatType = (e: StartChatFnProps) => Promise<
  StreamResponseType & {
    isNewChat?: boolean;
  }
>;
