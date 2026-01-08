import type {
  AIChatItemValueItemType,
  ChatHistoryItemResType,
  ToolRunResponseItemType
} from '@fastgpt/global/core/chat/type';
import type {
  DispatchNodeResponseKeyEnum,
  SseResponseEventEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type {
  InteractiveNodeResponseType,
  WorkflowInteractiveResponseType
} from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { type RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import z from 'zod';

export type WorkflowDebugResponse = {
  memoryEdges: RuntimeEdgeItemType[];
  memoryNodes: RuntimeNodeItemType[];
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

const WorkflowResponseItemSchema = z.object({
  id: z.string().optional(),
  stepId: z.string().optional(),
  event: z.custom<SseResponseEventEnum>(),
  data: z.record(z.string(), z.any())
});
export type WorkflowResponseItemType = z.infer<typeof WorkflowResponseItemSchema>;
export const WorkflowResponseFnSchema = z.function({
  input: z.tuple([WorkflowResponseItemSchema]),
  output: z.void()
});

export type WorkflowResponseType = z.infer<typeof WorkflowResponseFnSchema>;
