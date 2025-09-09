import type {
  AIChatItemValueItemType,
  ChatHistoryItemResType,
  ToolRunResponseItemType
} from '@fastgpt/global/core/chat/type';
import { ChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import type {
  DispatchNodeResponseKeyEnum,
  SseResponseEventEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';

export type WorkflowDebugResponse = {
  memoryEdges: RuntimeEdgeItemType[];
  entryNodeIds: string[]; // Next step entry nodes
  nodeResponses: Record<
    string,
    {
      nodeId: string;
      type: 'skip' | 'run';
      response?: ChatHistoryItemResType;
      interactiveResponse?: InteractiveNodeResponseType;
    }
  >;
  skipNodeQueue?: { id: string; skippedNodeIdList: string[] }[]; // Cache
};
export type DispatchFlowResponse = {
  flowResponses: ChatHistoryItemResType[];
  flowUsages: ChatNodeUsageType[];
  debugResponse: WorkflowDebugResponse;
  workflowInteractiveResponse?: WorkflowInteractiveResponseType;
  [DispatchNodeResponseKeyEnum.toolResponses]: ToolRunResponseItemType;
  [DispatchNodeResponseKeyEnum.assistantResponses]: AIChatItemValueItemType[];
  [DispatchNodeResponseKeyEnum.runTimes]: number;
  [DispatchNodeResponseKeyEnum.memories]?: Record<string, any>;
  [DispatchNodeResponseKeyEnum.newVariables]: Record<string, string>;
  durationSeconds: number;
};

export type WorkflowResponseType = (e: {
  id?: string;
  event: SseResponseEventEnum;
  data: Record<string, any>;
}) => void;
