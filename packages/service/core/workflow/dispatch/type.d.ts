import {
  AIChatItemValueItemType,
  ChatHistoryItemResType,
  ChatItemValueItemType,
  ToolRunResponseItemType
} from '@fastgpt/global/core/chat/type';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
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
  [DispatchNodeResponseKeyEnum.toolResponses]: ToolRunResponseItemType;
  [DispatchNodeResponseKeyEnum.assistantResponses]: AIChatItemValueItemType[];
  newVariables: Record<string, string>;
};
