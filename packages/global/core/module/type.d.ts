import { FlowNodeTypeEnum } from './node/constant';
import {
  ModuleIOValueTypeEnum,
  ModuleOutputKeyEnum,
  FlowNodeTemplateTypeEnum,
  VariableInputEnum
} from './constants';
import { DispatchNodeResponseKeyEnum } from './runtime/constants';
import { FlowNodeInputItemType, FlowNodeOutputItemType } from './node/type';
import { UserModelSchema } from 'support/user/type';
import {
  ChatItemType,
  ChatItemValueItemType,
  ToolRunResponseItemType,
  UserChatItemValueItemType
} from '../chat/type';
import { ChatNodeUsageType } from '../../support/wallet/bill/type';
import { RunningModuleItemType } from './runtime/type';
import { PluginTypeEnum } from 'core/plugin/constants';

export type FlowNodeTemplateType = {
  id: string; // module id, unique
  templateType: `${FlowNodeTemplateTypeEnum}`;
  flowType: `${FlowNodeTypeEnum}`; // render node card
  avatar?: string;
  name: string;
  intro: string; // template list intro
  isTool?: boolean; // can be connected by tool
  showStatus?: boolean; // chatting response step status
  inputs: FlowNodeInputItemType[];
  outputs: FlowNodeOutputItemType[];

  // plugin data
  pluginType?: `${PluginTypeEnum}`;
  parentId?: string;
};
export type FlowModuleItemType = FlowNodeTemplateType & {
  moduleId: string;
};
export type moduleTemplateListType = {
  type: `${FlowNodeTemplateTypeEnum}`;
  label: string;
  list: FlowNodeTemplateType[];
}[];

// store module type
export type ModuleItemType = {
  name: string;
  avatar?: string;
  intro?: string;
  moduleId: string;
  position?: {
    x: number;
    y: number;
  };
  flowType: `${FlowNodeTypeEnum}`;
  showStatus?: boolean;
  inputs: FlowNodeInputItemType[];
  outputs: FlowNodeOutputItemType[];

  // runTime field
  isEntry?: boolean;
};

/* --------------- function type -------------------- */
export type SelectAppItemType = {
  id: string;
  name: string;
  logo: string;
};

/* agent */
export type ClassifyQuestionAgentItemType = {
  value: string;
  key: string;
};
export type ContextExtractAgentItemType = {
  desc: string;
  key: string;
  required: boolean;
  defaultValue?: string;
  enum?: string;
};

/* -------------- running module -------------- */
export type ChatDispatchProps = {
  res: NextApiResponse;
  mode: 'test' | 'chat';
  teamId: string;
  tmbId: string;
  user: UserModelSchema;
  appId: string;
  chatId?: string;
  responseChatItemId?: string;
  histories: ChatItemType[];
  variables: Record<string, any>;
  inputFiles?: UserChatItemValueItemType['file'][];
  stream: boolean;
  detail: boolean; // response detail
  maxRunTimes: number;
};

export type ModuleDispatchProps<T> = ChatDispatchProps & {
  module: RunningModuleItemType;
  runtimeModules: RunningModuleItemType[];
  params: T;
};
