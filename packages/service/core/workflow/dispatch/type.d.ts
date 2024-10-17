import {
  AIChatItemValueItemType,
  ChatHistoryItemResType,
  ChatItemValueItemType,
  ToolRunResponseItemType
} from '@fastgpt/global/core/chat/type';
import {
  DispatchNodeResponseKeyEnum,
  SseResponseEventEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';

export type DispatchFlowResponse = {
  flowResponses: ChatHistoryItemResType[];
  flowUsages: ChatNodeUsageType[];
  debugResponse: {
    finishedNodes: RuntimeNodeItemType[];
    finishedEdges: RuntimeEdgeItemType[];
    nextStepRunNodes: RuntimeNodeItemType[];
  };
  workflowInteractiveResponse?: WorkflowInteractiveResponseType;
  [DispatchNodeResponseKeyEnum.toolResponses]: ToolRunResponseItemType;
  [DispatchNodeResponseKeyEnum.assistantResponses]: AIChatItemValueItemType[];
  [DispatchNodeResponseKeyEnum.runTimes]: number;
  newVariables: Record<string, string>;
};

export type WorkflowResponseType = ({
  write,
  event,
  data,
  stream
}: {
  write?: ((text: string) => void) | undefined;
  event: SseResponseEventEnum;
  data: Record<string, any>;
  stream?: boolean | undefined;
}) => void;
