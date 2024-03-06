import { ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';
import { FlowNodeInputItemType } from '@fastgpt/global/core/module/node/type';
import type {
  ModuleDispatchProps,
  ModuleItemType,
  RunningModuleItemType
} from '@fastgpt/global/core/module/type.d';

export type DispatchToolProps = ModuleDispatchProps<{
  [ModuleInputKeyEnum.history]?: ChatItemType[];
  [ModuleInputKeyEnum.aiModel]: string;
  [ModuleInputKeyEnum.aiSystemPrompt]: string;
  [ModuleInputKeyEnum.userChatInput]: string;
}>;
export type ToolModuleItemType = ModuleItemType & {
  toolParams: FlowNodeInputItemType[];
};
