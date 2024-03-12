import { FlowNodeTypeEnum } from './node/constant';
import {
  ModuleIOValueTypeEnum,
  ModuleOutputKeyEnum,
  ModuleTemplateTypeEnum,
  VariableInputEnum
} from './constants';
import { DispatchNodeResponseKeyEnum } from './runtime/constants';
import { FlowNodeInputItemType, FlowNodeOutputItemType } from './node/type';
import { UserModelSchema } from 'support/user/type';
import {
  ChatItemValueItemType,
  ToolRunResponseItemType,
  UserChatItemValueItemType
} from '../chat/type';
import { ChatNodeUsageType } from '../../support/wallet/bill/type';
import { RunningModuleItemType } from './runtime/type';

export type FlowModuleTemplateType = {
  id: string; // module id, unique
  templateType: `${ModuleTemplateTypeEnum}`;
  flowType: `${FlowNodeTypeEnum}`; // render node card
  avatar?: string;
  name: string;
  intro: string; // template list intro
  isTool?: boolean; // can be connected by tool
  showStatus?: boolean; // chatting response step status
  inputs: FlowNodeInputItemType[];
  outputs: FlowNodeOutputItemType[];
};
export type FlowModuleItemType = FlowModuleTemplateType & {
  moduleId: string;
};
export type moduleTemplateListType = {
  type: `${ModuleTemplateTypeEnum}`;
  label: string;
  list: FlowModuleTemplateType[];
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
// variable
export type VariableItemType = {
  id: string;
  key: string;
  label: string;
  type: `${VariableInputEnum}`;
  required: boolean;
  maxLen: number;
  enums: { value: string }[];
};
// tts
export type AppTTSConfigType = {
  type: 'none' | 'web' | 'model';
  model?: string;
  voice?: string;
  speed?: number;
};

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
};

export type ModuleDispatchProps<T> = ChatDispatchProps & {
  module: RunningModuleItemType;
  runtimeModules: RunningModuleItemType[];
  params: T;
};
