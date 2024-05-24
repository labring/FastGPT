import {
  AIChatItemValueItemType,
  ChatHistoryItemResType,
  ChatItemValueItemType,
  ToolRunResponseItemType
} from '@fastgpt/global/core/chat/type';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';

export type DispatchFlowResponse = {
  flowResponses: ChatHistoryItemResType[];
  flowUsages: ChatNodeUsageType[];
  [DispatchNodeResponseKeyEnum.toolResponses]: ToolRunResponseItemType;
  [DispatchNodeResponseKeyEnum.assistantResponses]: AIChatItemValueItemType[];
  newVariables: Record<string, string>;
};
