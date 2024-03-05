import { FlowNodeTypeEnum } from './node/constant';
import {
  ModuleIOValueTypeEnum,
  ModuleOutputKeyEnum,
  ModuleTemplateTypeEnum,
  VariableInputEnum
} from './constants';
import { FlowNodeInputItemType, FlowNodeOutputItemType } from './node/type';
import { UserModelSchema } from 'support/user/type';
import { moduleDispatchResType } from '..//chat/type';
import { ChatModuleUsageType } from '../../support/wallet/bill/type';

export type FlowModuleTemplateType = {
  id: string; // module id, unique
  templateType: `${ModuleTemplateTypeEnum}`;
  flowType: `${FlowNodeTypeEnum}`; // render node card
  avatar?: string;
  name: string;
  intro: string; // template list intro
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
export type RunningModuleItemType = {
  name: ModuleItemType['name'];
  moduleId: ModuleItemType['moduleId'];
  flowType: ModuleItemType['flowType'];
  showStatus?: ModuleItemType['showStatus'];
} & {
  inputs: {
    key: string;
    value?: any;
    valueType?: `${ModuleIOValueTypeEnum}`;
  }[];
  outputs: {
    key: string;
    answer?: boolean;
    response?: boolean;
    value?: any;
    valueType?: `${ModuleIOValueTypeEnum}`;
    targets: {
      moduleId: string;
      key: string;
    }[];
  }[];
};

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
  stream: boolean;
  detail: boolean; // response detail
};

export type ModuleDispatchProps<T> = ChatDispatchProps & {
  module: RunningModuleItemType;
  params: T;
};
export type ModuleDispatchResponse<T> = T & {
  [ModuleOutputKeyEnum.responseData]?: moduleDispatchResType;
  [ModuleOutputKeyEnum.moduleDispatchBills]?: ChatModuleUsageType[];
};
