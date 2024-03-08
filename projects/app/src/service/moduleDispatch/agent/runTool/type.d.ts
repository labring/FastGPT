import { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import {
  ModuleInputKeyEnum,
  ModuleOutputKeyEnum,
  ModuleRunTimerOutputEnum
} from '@fastgpt/global/core/module/constants';
import { FlowNodeInputItemType } from '@fastgpt/global/core/module/node/type';
import { ModuleDispatchResponse } from '@fastgpt/global/core/module/type';
import type {
  ModuleDispatchProps,
  ModuleDispatchResponse,
  ModuleItemType,
  RunningModuleItemType
} from '@fastgpt/global/core/module/type.d';

export type DispatchToolModuleProps = ModuleDispatchProps<{
  [ModuleInputKeyEnum.history]?: ChatItemType[];
  [ModuleInputKeyEnum.aiModel]: string;
  [ModuleInputKeyEnum.aiSystemPrompt]: string;
  [ModuleInputKeyEnum.userChatInput]: string;
}>;
export type DispatchToolModuleResponse = ModuleDispatchResponse<{}>;

export type RunToolResponse = {
  [ModuleRunTimerOutputEnum.responseData]: moduleDispatchResType[];
  totalTokens: number;
  completeMessages?: ChatCompletionMessageParam[];
};
export type ToolModuleItemType = ModuleItemType & {
  toolParams: FlowNodeInputItemType[];
};
