import {
  ChatHistoryItemResType,
  ChatItemValueItemType,
  ToolRunResponseItemType,
  moduleDispatchResType
} from '@fastgpt/global/core/chat/type';
import { ModuleRunTimerOutputEnum } from '@fastgpt/global/core/module/constants';
import { ChatModuleUsageType } from '@fastgpt/global/support/wallet/bill/type';

export type DispatchFlowModuleResponse = {
  [ModuleRunTimerOutputEnum.responseData]: ChatHistoryItemResType[];
  [ModuleRunTimerOutputEnum.moduleDispatchBills]: ChatModuleUsageType[];
  [ModuleRunTimerOutputEnum.toolResponse]: ToolRunResponseItemType[];
  [ModuleRunTimerOutputEnum.assistantResponse]: ChatItemValueItemType[];
};
